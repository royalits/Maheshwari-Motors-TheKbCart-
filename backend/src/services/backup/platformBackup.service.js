import zlib from "zlib";
import { promisify } from "util";
import crypto from "crypto";
import mongoose from "mongoose";
import { EJSON } from "bson";
import PlatformBackup from "../../models/common/platform_backup.model.js";
import PlatformBackupChunk from "../../models/common/platform_backup_chunk.model.js";
import { ApiError } from "../../utils/index.js";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

// Collections excluded from backup (backup infra + transient auth data)
const BACKUP_EXCLUDED = new Set([
  "platformbackups",
  "platformbackupchunks",
  "sessions", // stale sessions after restore would cause corrupted auth state
]);

const getDb = () => {
  const db = mongoose.connection?.db;
  if (!db) {
    throw ApiError.internal("Database connection is not available");
  }
  return db;
};

const formatBackupNo = () => {
  const stamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const suffix = crypto.randomBytes(2).toString("hex").toUpperCase();
  return `PB-${stamp}-${suffix}`;
};

const listBackupableCollections = async (db) => {
  const collections = await db.listCollections({}, { nameOnly: true }).toArray();
  return collections
    .map((entry) => entry.name)
    .filter(
      (name) => !name.startsWith("system.") && !BACKUP_EXCLUDED.has(name),
    )
    .sort((left, right) => left.localeCompare(right));
};

const buildSnapshot = async (db) => {
  const collectionNames = await listBackupableCollections(db);
  const collections = [];
  let totalRecords = 0;

  for (const name of collectionNames) {
    const documents = await db.collection(name).find({}).toArray();
    totalRecords += documents.length;
    collections.push({ name, records: documents.length, documents });
  }

  return {
    version: 1,
    database_name: db.databaseName,
    generated_at: new Date(),
    total_collections: collections.length,
    total_records: totalRecords,
    collections,
  };
};

const writeChunks = async (backupId, buffer) => {
  const chunks = [];
  for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE_BYTES) {
    chunks.push({
      backup_id: backupId,
      chunk_index: chunks.length,
      data: buffer.subarray(offset, offset + CHUNK_SIZE_BYTES),
    });
  }

  if (chunks.length) {
    await PlatformBackupChunk.insertMany(chunks, { ordered: true });
  }

  return chunks.length;
};

const readBackupBuffer = async (backupId) => {
  const chunks = await PlatformBackupChunk.find({ backup_id: backupId })
    .sort({ chunk_index: 1 })
    .lean();

  if (!chunks.length) {
    throw ApiError.notFound("Backup data not found");
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk.data)));
};

const toListItem = (backup) => ({
  _id: String(backup._id),
  backup_no: backup.backup_no,
  status: backup.status,
  database_name: backup.database_name,
  total_collections: backup.total_collections,
  total_records: backup.total_records,
  size_bytes: backup.size_bytes,
  size_mb: Number((Number(backup.size_bytes || 0) / (1024 * 1024)).toFixed(2)),
  chunk_count: backup.chunk_count,
  collections: backup.collections || [],
  error_message: backup.error_message || "",
  restored_at: backup.restored_at,
  created_at: backup.createdAt,
});

const listBackups = async () => {
  const backups = await PlatformBackup.find({})
    .sort({ createdAt: -1 })
    .limit(100)
    .lean();
  return backups.map(toListItem);
};

const createBackup = async (adminUserId) => {
  const db = getDb();
  const backup = await PlatformBackup.create({
    backup_no: formatBackupNo(),
    created_by: adminUserId,
    database_name: db.databaseName,
    status: "running",
  });

  try {
    const snapshot = await buildSnapshot(db);
    const serialized = EJSON.stringify(snapshot, { relaxed: false });
    // Use async gzip to avoid blocking the event loop
    const compressed = await gzip(Buffer.from(serialized, "utf8"));
    const chunkCount = await writeChunks(backup._id, compressed);

    backup.status = "success";
    backup.total_collections = snapshot.total_collections;
    backup.total_records = snapshot.total_records;
    backup.size_bytes = compressed.length;
    backup.chunk_count = chunkCount;
    backup.collections = snapshot.collections.map((collection) => ({
      name: collection.name,
      records: collection.records,
    }));
    await backup.save();

    return toListItem(backup.toObject());
  } catch (error) {
    await PlatformBackupChunk.deleteMany({ backup_id: backup._id });
    backup.status = "failed";
    backup.error_message = error?.message || "Backup failed";
    await backup.save();
    throw error;
  }
};

/**
 * Atomically restore a backup using temp-collection staging:
 * 1. Write each collection into a temp collection (_restore_<name>)
 * 2. Drop the original collections
 * 3. Rename each temp collection to the target name
 *
 * This prevents a half-restored database if something fails during inserts.
 */
const restoreBackup = async (backupId, adminUserId, confirmBackupNo) => {
  const backup = await PlatformBackup.findById(backupId);
  if (!backup) {
    throw ApiError.notFound("Backup not found");
  }
  if (backup.status !== "success") {
    throw ApiError.badRequest("Only successful backups can be restored");
  }
  if (String(confirmBackupNo || "").trim() !== backup.backup_no) {
    throw ApiError.badRequest("Backup confirmation does not match");
  }

  const db = getDb();
  const compressed = await readBackupBuffer(backup._id);
  // Use async gunzip to avoid blocking the event loop
  const decompressed = await gunzip(compressed);
  const snapshot = EJSON.parse(decompressed.toString("utf8"), { relaxed: false });

  if (!Array.isArray(snapshot?.collections)) {
    throw ApiError.badRequest("Backup snapshot is invalid");
  }

  backup.status = "restoring";
  await backup.save();

  const TEMP_PREFIX = "_restore_";
  const stagedTempNames = [];

  try {
    // Stage 1: Write all data into temporary collections
    for (const collection of snapshot.collections) {
      if (!collection?.name || BACKUP_EXCLUDED.has(collection.name)) {
        continue;
      }

      const tempName = `${TEMP_PREFIX}${collection.name}`;
      // Drop any leftover temp collection from a previous failed restore
      await db.collection(tempName).drop().catch((err) => {
        if (err?.codeName !== "NamespaceNotFound") throw err;
      });

      const documents = Array.isArray(collection.documents) ? collection.documents : [];
      if (documents.length) {
        await db.collection(tempName).insertMany(documents, { ordered: false });
      } else {
        await db.createCollection(tempName).catch((err) => {
          if (err?.codeName !== "NamespaceExists") throw err;
        });
      }

      stagedTempNames.push({ temp: tempName, target: collection.name });
    }

    // Stage 2: Drop existing live collections
    const currentCollections = await listBackupableCollections(db);
    for (const collectionName of currentCollections) {
      await db.collection(collectionName).drop().catch((err) => {
        if (err?.codeName !== "NamespaceNotFound") throw err;
      });
    }

    // Stage 3: Rename temp collections to final names
    for (const { temp, target } of stagedTempNames) {
      await db.collection(temp).rename(target, { dropTarget: true });
    }

    // Clear all live sessions — they reference old user/token state
    await db.collection("sessions").drop().catch((err) => {
      if (err?.codeName !== "NamespaceNotFound") throw err;
    });

    backup.status = "success";
    backup.restored_by = adminUserId;
    backup.restored_at = new Date();
    await backup.save();

    return toListItem(backup.toObject());
  } catch (error) {
    // Clean up any temp collections left behind
    for (const { temp } of stagedTempNames) {
      await db.collection(temp).drop().catch(() => {});
    }

    backup.status = "failed";
    backup.error_message = error?.message || "Restore failed";
    await backup.save();
    throw error;
  }
};

/**
 * Download a backup: decompress and return raw JSON snapshot buffer
 * so the caller can stream it to the HTTP response.
 */
const downloadBackup = async (backupId) => {
  const backup = await PlatformBackup.findById(backupId).lean();
  if (!backup) {
    throw ApiError.notFound("Backup not found");
  }
  if (backup.status !== "success") {
    throw ApiError.badRequest("Only successful backups can be downloaded");
  }

  const compressed = await readBackupBuffer(backupId);
  const decompressed = await gunzip(compressed);

  const filename = `${backup.backup_no}.json`;
  return { buffer: decompressed, filename };
};

const deleteBackup = async (backupId) => {
  const backup = await PlatformBackup.findById(backupId);
  if (!backup) {
    throw ApiError.notFound("Backup not found");
  }

  await PlatformBackupChunk.deleteMany({ backup_id: backup._id });
  await PlatformBackup.deleteOne({ _id: backup._id });

  return { _id: String(backup._id), status: "deleted" };
};

export default {
  listBackups,
  createBackup,
  restoreBackup,
  downloadBackup,
  deleteBackup,
};
