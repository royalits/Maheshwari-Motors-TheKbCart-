import fs from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import s3Service from "../common/s3.service.js";
import { ApiError } from "../../utils/index.js";
import {
  getUniversalCollectionSchema,
  isInternalUniversalField,
  universalCollectionNames,
} from "../setup/universalImportExport.schema.js";

const storageRoot = path.resolve(process.cwd(), "storage");
const backupDir = path.join(storageRoot, "backups");
const logsFile = path.join(storageRoot, "backup-logs.json");
const DOWNLOAD_URL_EXPIRY_SECONDS = 60 * 60 * 24 * 7; // 7 days
const BACKUP_EXCEL_FORMAT = "Maheshwari Backup Excel v2";

const normalizeFirmScope = (isGst) => {
  if (Number(isGst) === 1) return 1;
  if (Number(isGst) === 0) return 0;
  return null;
};

const firmLabel = (isGst) =>
  normalizeFirmScope(isGst) === 1 ? "GST"
  : normalizeFirmScope(isGst) === 0 ? "NONGST"
  : "ALL";

const firmType = (isGst) =>
  normalizeFirmScope(isGst) === 1 ? "GST"
  : normalizeFirmScope(isGst) === 0 ? "NON_GST"
  : null;

const FIRM_SCOPED_COLLECTIONS = new Set([
  "bills",
  "challans",
  "reports",
  "returns",
  "transactions",
]);

const USER_SCOPED_COLLECTIONS = new Set([
  "agents",
  "areas",
  "autobills",
  "banks",
  "brands",
  "contacts",
  "counters",
  "departments",
  "financialyears",
  "financialyearcloses",
  "hsns",
  "items",
  "labels",
  "sessions",
  "subscriptions",
  "transports",
  "users",
]);

const preferredCollectionOrder = [
  "agents",
  "areas",
  "autobills",
  "banks",
  "bills",
  "brands",
  "challans",
  "contacts",
  "counters",
  "departments",
  "financialyearcloses",
  "hsns",
  "items",
  "labels",
  "reports",
  "returns",
  "sessions",
  "subscriptions",
  "transactions",
  "users",
];

const SYSTEM_EXPORT_COLLECTIONS = new Set([
  "counters",
  "sessions",
  "subscriptions",
]);

const topColumnOrder = ["name", "type"];

const INTERNAL_EXPORT_FIELDS = new Set([
  "_id",
  "id",
  "__v",
  "user_id",
  "createdAt",
  "updatedAt",
  "financial_year_id",
  "password",
  "refresh_token",
  "access_token",
  "token",
  "session_token",
  "socket_id",
  "last_login",
]);

const COLLECTION_EXPORT_FIELDS = {
  agents: ["name", "address", "city", "pincode", "phone"],
  areas: ["city", "state", "pincode"],
  autobills: [
    "party",
    "brands",
    "label",
    "amount",
    "from_date",
    "to_date",
    "per_day_bill",
    "enabled",
  ],
  banks: [
    "bank_name",
    "name",
    "account_number",
    "ifsc_code",
    "branch",
    "address",
    "is_gst",
  ],
  bills: [
    "bill_no",
    "date",
    "contact",
    "contact_type",
    "transport",
    "customer_name",
    "vehicle_number",
    "transport_charge",
    "amount",
    "paid_amount",
    "return_amount",
    "settlement_discount",
    "payment_status",
    "payment_entries",
    "challans",
    "auto_bill_items",
    "deduct_from_stock",
    "skip_stock_calculation",
    "is_gst",
  ],
  brands: ["name", "description", "discount", "is_active"],
  challans: [
    "challan_no",
    "challan_type",
    "date",
    "contact",
    "label",
    "from_bank",
    "to_bank",
    "items",
    "gross_total",
    "sub_total",
    "discount",
    "amount",
    "converted_to_bill",
    "bill",
    "payment_status",
    "paid_amount",
    "deduct_from_stock",
    "is_gst",
  ],
  contacts: [
    "name",
    "alias",
    "type",
    "phone",
    "email",
    "whatsapp_number",
    "gstin",
    "reg_number",
    "address",
    "city",
    "state",
    "pincode",
    "area",
    "transport",
    "agent",
    "transport_charge",
    "balance",
    "is_gst",
  ],
  departments: ["name", "description"],
  financialyears: ["label", "start_date", "end_date", "status", "closed_at"],
  financialyearcloses: [
    "financial_year",
    "closed_at",
    "total_challans",
    "total_bills",
    "total_revenue",
    "pending_amount",
    "stock_value",
    "gst_collected",
    "gst_paid",
  ],
  hsns: ["hsn_code", "description", "gst_rate", "is_active"],
  items: [
    "item_name",
    "item_id",
    "barcode",
    "alias",
    "description",
    "brand",
    "department",
    "hsn",
    "sale_rate",
    "purchase_rate",
    "mrp_rate",
    "gst_percent",
    "discount",
    "stock",
    "physical_stock",
    "logical_stock",
    "opening_physical_stock",
    "opening_logical_stock",
    "threshold",
    "image",
    "is_gst",
  ],
  labels: ["name", "description", "brand_discounts", "is_active"],
  reports: ["type", "date", "contact", "bill", "challan", "amount", "is_gst"],
  returns: [
    "return_no",
    "return_type",
    "date",
    "contact",
    "bill",
    "challan",
    "items",
    "total_amount",
    "note",
    "is_gst",
  ],
  transports: ["name", "phone", "gstin", "address"],
  transactions: [
    "transaction_no",
    "type",
    "date",
    "contact",
    "contact_type",
    "amount",
    "bank",
    "reference",
    "remarks",
    "is_gst",
  ],
  users: ["username", "name", "email", "phone", "gst_firm", "nongst_firm"],
};

const REFERENCE_FIELD_LABELS = {
  agent_id: "agent",
  area_id: "area",
  assigned_to: "assigned_to",
  auto_bill_rule_id: "auto_bill_rule",
  bank_id: "bank",
  bill_id: "bill",
  brand_id: "brand",
  challan_id: "challan",
  contact_id: "contact",
  dept_id: "department",
  hsn_id: "hsn",
  item_id: "item",
  label_id: "label",
  linked_challan_id: "linked_challan",
  party_id: "party",
  source_challan_id: "source_challan",
  transport_id: "transport",
};

const REFERENCE_ARRAY_LABELS = {
  brand_ids: "brands",
  challan_ids: "challans",
  item_ids: "items",
  label_ids: "labels",
};

const ensureStorage = async () => {
  await fs.promises.mkdir(backupDir, { recursive: true });
  try {
    await fs.promises.access(logsFile);
  } catch {
    await fs.promises.writeFile(logsFile, "[]", "utf8");
  }
};

const createId = () =>
  typeof crypto.randomUUID === "function" ?
    crypto.randomUUID()
  : crypto.randomBytes(16).toString("hex");

const formatDateTime = (value = new Date()) => {
  const dt = new Date(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate(),
  )} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;
};

const formatDateStamp = (value = new Date()) => {
  const dt = new Date(value);
  const pad = (num) => String(num).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(
    dt.getDate(),
  )}_${pad(dt.getHours())}-${pad(dt.getMinutes())}-${pad(dt.getSeconds())}`;
};

const formatSize = (bytes) => {
  if (!bytes || Number.isNaN(bytes)) return "0 MB";
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
};

const readLogs = async () => {
  await ensureStorage();
  const raw = await fs.promises.readFile(logsFile, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeLogs = async (logs) => {
  await ensureStorage();
  await fs.promises.writeFile(logsFile, JSON.stringify(logs, null, 2), "utf8");
};

const toIso = (value) => {
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? "" : dt.toISOString();
};

const isPlainObject = (value) => {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return false;
  if (value instanceof Date) return false;
  if (Buffer.isBuffer(value)) return false;
  if (value instanceof Uint8Array) return false;
  if (value?._bsontype) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const normalizeForExport = (value) => {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value?._bsontype === "ObjectId") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value)) return value.map((item) => normalizeForExport(item));
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, innerValue] of Object.entries(value)) {
      out[key] = normalizeForExport(innerValue);
    }
    return out;
  }
  return value;
};

const normalizeScalarForCell = (value) => {
  if (value === undefined || value === null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  if (value?._bsontype === "ObjectId") return value.toString();
  if (Buffer.isBuffer(value)) return value.toString("base64");
  if (value instanceof Uint8Array) return Buffer.from(value).toString("base64");
  if (Array.isArray(value) || isPlainObject(value)) {
    return JSON.stringify(normalizeForExport(value));
  }
  return value;
};

const flattenDocument = (doc, prefix = "", out = {}) => {
  if (!isPlainObject(doc)) {
    if (prefix) out[prefix] = normalizeScalarForCell(doc);
    return out;
  }

  const entries = Object.entries(doc);
  if (!entries.length && prefix) {
    out[prefix] = "";
    return out;
  }

  for (const [key, rawValue] of entries) {
    const fieldPath = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(rawValue)) {
      flattenDocument(rawValue, fieldPath, out);
      continue;
    }
    out[fieldPath] = normalizeScalarForCell(rawValue);
  }

  return out;
};

const sortColumnKeys = (keys = []) =>
  [...keys].sort((left, right) => {
    const leftIndex = topColumnOrder.indexOf(left);
    const rightIndex = topColumnOrder.indexOf(right);
    const leftRank = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const rightRank = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;

    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.localeCompare(right);
  });

const computeColumnWidth = (rows, key) => {
  const sample = rows.slice(0, 250);
  let maxLength = key.length;
  for (const row of sample) {
    const value = row[key];
    const valueLength = String(value ?? "").length;
    if (valueLength > maxLength) maxLength = valueLength;
  }
  return Math.max(12, Math.min(60, maxLength + 2));
};

const sanitizeWorksheetName = (name) => {
  const cleaned = String(name || "Sheet").replace(/[\[\]:*?/\\]/g, "_");
  const trimmed = cleaned.trim() || "Sheet";
  return trimmed.slice(0, 31);
};

const buildCollectionOrder = (collectionNames = []) => {
  const existing = new Set(collectionNames);
  const preferred = preferredCollectionOrder.filter((name) => existing.has(name));
  const remaining = Array.from(existing)
    .filter((name) => !preferred.includes(name))
    .sort((a, b) => a.localeCompare(b));

  return [...preferred, ...remaining];
};

const toObjectIdString = (value) => {
  if (!value) return "";
  if (value?._bsontype === "ObjectId") return value.toString();
  if (typeof value === "string" && /^[a-f\d]{24}$/i.test(value)) return value;
  return "";
};

const buildNameMap = (docs = [], formatter) => {
  const map = new Map();
  for (const doc of docs) {
    const key = toObjectIdString(doc?._id);
    if (!key) continue;
    map.set(key, formatter(doc) || "");
  }
  return map;
};

const buildReferenceLookups = async (db, userId) => {
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const userFilter = { user_id: userObjectId };
  const find = async (collectionName, filter = userFilter) => {
    try {
      return await db.collection(collectionName).find(filter).toArray();
    } catch {
      return [];
    }
  };

  const [
    agents,
    areas,
    autobills,
    banks,
    bills,
    brands,
    challans,
    contacts,
    departments,
    financialYears,
    hsns,
    items,
    labels,
    transports,
    users,
  ] = await Promise.all([
    find("agents"),
    find("areas"),
    find("autobills"),
    find("banks"),
    find("bills"),
    find("brands"),
    find("challans"),
    find("contacts"),
    find("departments"),
    find("financialyears"),
    find("hsns"),
    find("items"),
    find("labels"),
    find("transports"),
    find("users", { _id: userObjectId }),
  ]);

  return {
    agents: buildNameMap(agents, (doc) => doc.name),
    areas: buildNameMap(areas, (doc) =>
      [doc.city, doc.state, doc.pincode].filter(Boolean).join(" - "),
    ),
    autobills: buildNameMap(autobills, (doc) => `Auto Bill ${doc.amount || ""}`.trim()),
    banks: buildNameMap(banks, (doc) =>
      [doc.bank_name, doc.account_number].filter(Boolean).join(" - "),
    ),
    bills: buildNameMap(bills, (doc) => doc.bill_no),
    brands: buildNameMap(brands, (doc) => doc.name),
    challans: buildNameMap(challans, (doc) => doc.challan_no),
    contacts: buildNameMap(contacts, (doc) =>
      [doc.name, doc.type].filter(Boolean).join(" - "),
    ),
    departments: buildNameMap(departments, (doc) => doc.name),
    financialYears: buildNameMap(financialYears, (doc) => doc.label),
    hsns: buildNameMap(hsns, (doc) => doc.hsn_code),
    items: buildNameMap(items, (doc) =>
      [doc.item_name, doc.item_id].filter(Boolean).join(" - "),
    ),
    labels: buildNameMap(labels, (doc) => doc.name),
    transports: buildNameMap(transports, (doc) => doc.name),
    users: buildNameMap(users, (doc) => doc.username || doc.name || doc.email),
  };
};

const getReferenceMap = (fieldName, lookups) => {
  if (fieldName.includes("agent")) return lookups.agents;
  if (fieldName.includes("area")) return lookups.areas;
  if (fieldName.includes("auto_bill_rule")) return lookups.autobills;
  if (fieldName.includes("bank")) return lookups.banks;
  if (fieldName.includes("bill")) return lookups.bills;
  if (fieldName.includes("brand")) return lookups.brands;
  if (fieldName.includes("challan")) return lookups.challans;
  if (fieldName.includes("contact") || fieldName.includes("party")) return lookups.contacts;
  if (fieldName.includes("dept") || fieldName.includes("department")) return lookups.departments;
  if (fieldName.includes("financial_year")) return lookups.financialYears;
  if (fieldName.includes("hsn")) return lookups.hsns;
  if (fieldName.includes("item")) return lookups.items;
  if (fieldName.includes("label")) return lookups.labels;
  if (fieldName.includes("transport")) return lookups.transports;
  if (fieldName.includes("user")) return lookups.users;
  if (fieldName.includes("assigned_to")) return lookups.contacts;
  return null;
};

const lookupReference = (fieldName, value, lookups) => {
  const id = toObjectIdString(value);
  if (!id) return "";
  const map = getReferenceMap(fieldName, lookups);
  return map?.get(id) || "";
};

const toExportFieldName = (fieldName) =>
  REFERENCE_FIELD_LABELS[fieldName] ||
  REFERENCE_ARRAY_LABELS[fieldName] ||
  fieldName;

const sanitizeExportDocument = (doc, lookups, collectionName = "") => {
  if (Array.isArray(doc)) {
    return doc.map((entry) => sanitizeExportDocument(entry, lookups));
  }

  if (doc instanceof Date) return doc.toISOString();
  if (typeof doc === "bigint") return doc.toString();
  if (Buffer.isBuffer(doc)) return doc.toString("base64");
  if (doc instanceof Uint8Array) return Buffer.from(doc).toString("base64");
  if (doc?._bsontype === "ObjectId") return "";
  if (!isPlainObject(doc)) return doc ?? "";

  const out = {};
  for (const [fieldName, value] of Object.entries(doc)) {
    if (INTERNAL_EXPORT_FIELDS.has(fieldName)) continue;

    const exportFieldName = toExportFieldName(fieldName);
    if (REFERENCE_ARRAY_LABELS[fieldName] && Array.isArray(value)) {
      out[exportFieldName] = value
        .map((entry) => lookupReference(fieldName, entry, lookups))
        .filter(Boolean)
        .join(", ");
      continue;
    }

    if (REFERENCE_FIELD_LABELS[fieldName] || fieldName.endsWith("_id")) {
      out[exportFieldName] = lookupReference(fieldName, value, lookups);
      continue;
    }

    out[exportFieldName] = sanitizeExportDocument(value, lookups);
  }

  const allowedFields = COLLECTION_EXPORT_FIELDS[collectionName];
  if (!allowedFields) return out;

  return allowedFields.reduce((filtered, fieldName) => {
    if (Object.prototype.hasOwnProperty.call(out, fieldName)) {
      filtered[fieldName] = out[fieldName];
    }
    return filtered;
  }, {});
};

const addCollectionSheet = (workbook, sheetName, docs = [], lookups = {}) => {
  const schema = getUniversalCollectionSchema(sheetName);
  if (!schema) return;

  const worksheet = workbook.addWorksheet(sanitizeWorksheetName(schema.sheet));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  if (!docs.length) {
    worksheet.columns = schema.columns.map((key) => ({
      header: key,
      key,
      width: Math.max(12, Math.min(28, key.length + 4)),
    }));
    return;
  }

  const flatRows = docs.map((doc) =>
    flattenDocument(sanitizeExportDocument(doc, lookups, schema.collectionName)),
  );
  const allKeys = schema.columns.filter(
    (key) => !isInternalUniversalField(key),
  );

  worksheet.columns = allKeys.map((key) => ({
    header: key,
    key,
    width: computeColumnWidth(flatRows, key),
  }));

  for (const row of flatRows) {
    const values = {};
    for (const key of allKeys) {
      values[key] = row[key] ?? "";
    }
    worksheet.addRow(values);
  }

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: allKeys.length },
  };

  const header = worksheet.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFECEFF4" },
    };
  });
};

const addSummarySheet = (workbook, summary) => {
  const worksheet = workbook.addWorksheet("backup_summary");
  worksheet.columns = [
    { header: "field", key: "field", width: 32 },
    { header: "value", key: "value", width: 62 },
  ];

  worksheet.addRow({ field: "Generated At (UTC)", value: summary.generated_at });
  worksheet.addRow({ field: "Firm Scope", value: summary.firm_scope });
  worksheet.addRow({
    field: "Total Collections",
    value: summary.total_collections,
  });
  worksheet.addRow({ field: "Total Records", value: summary.total_records });
  worksheet.addRow({ field: "Format", value: BACKUP_EXCEL_FORMAT });
  worksheet.addRow({ field: "", value: "" });

  const markerRow = worksheet.lastRow.number + 1;
  worksheet.addRow({ field: "Collection", value: "Record Count" });
  for (const row of summary.collection_counts) {
    worksheet.addRow({ field: row.collection, value: row.records });
  }

  const header = worksheet.getRow(1);
  header.font = { bold: true };
  const tableHeader = worksheet.getRow(markerRow);
  tableHeader.font = { bold: true };
};

const getFirmScopedFilter = (collectionName, userId, isGst) => {
  const scope = normalizeFirmScope(isGst);
  const userObjectId = new mongoose.Types.ObjectId(String(userId));

  if (collectionName === "users") {
    return { _id: userObjectId };
  }

  if (collectionName === "sessions") {
    const type = firmType(scope);
    return type ? { user_id: userObjectId, firm_type: type } : { user_id: userObjectId };
  }

  if (collectionName === "contacts" && scope !== null) {
    return {
      user_id: userObjectId,
      $or: [
        { type: "party", is_gst: scope },
        { type: { $in: ["supplier", "book"] } },
      ],
    };
  }

  if (collectionName === "items" && scope !== null) {
    return { user_id: userObjectId, is_gst: scope };
  }

  if (FIRM_SCOPED_COLLECTIONS.has(collectionName) && scope !== null) {
    return { user_id: userObjectId, is_gst: scope };
  }

  if (USER_SCOPED_COLLECTIONS.has(collectionName)) {
    return { user_id: userObjectId };
  }

  return { user_id: userObjectId };
};

const getCollectionDocuments = async (db, collectionName, userId, isGst) => {
  const scope = normalizeFirmScope(isGst);
  if (collectionName === "autobills" && scope !== null) {
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    const partyIds = await db
      .collection("contacts")
      .find({ user_id: userObjectId, type: "party", is_gst: scope })
      .project({ _id: 1 })
      .toArray();
    return await db
      .collection(collectionName)
      .find({
        user_id: userObjectId,
        party_id: { $in: partyIds.map((party) => party._id) },
      })
      .toArray();
  }

  const filter = getFirmScopedFilter(collectionName, userId, isGst);
  const docs = await db.collection(collectionName).find(filter).toArray();
  return docs || [];
};

const parseKeyFromS3Url = (value) => {
  try {
    const url = new URL(value);
    return url.pathname.replace(/^\/+/, "");
  } catch {
    return "";
  }
};

const isHttpUrl = (value) =>
  typeof value === "string" && /^https?:\/\//i.test(value.trim());

const toSafeLocalPath = (candidate) => {
  if (typeof candidate !== "string" || !candidate.trim()) return null;
  if (isHttpUrl(candidate)) return null;

  const resolved = path.resolve(candidate);
  const base = path.resolve(storageRoot);
  const prefixedBase = base.endsWith(path.sep) ? base : `${base}${path.sep}`;

  if (resolved === base || resolved.startsWith(prefixedBase)) {
    return resolved;
  }

  return null;
};

const removeFileIfExists = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.warn(`[BackupService] Failed to remove file '${filePath}':`, error);
    }
  }
};

const createWorkbookBackup = async (userId, isGst = null) => {
  const db = mongoose.connection?.db;
  if (!db) {
    throw new Error("Database connection is not available");
  }

  const backupId = createId();
  const collectionMeta = await db.listCollections({}, { nameOnly: true }).toArray();
  const collectionNames = collectionMeta
    .map((entry) => entry.name)
    .filter(
      (name) =>
        !name.startsWith("system.") &&
        !SYSTEM_EXPORT_COLLECTIONS.has(name) &&
        getUniversalCollectionSchema(name),
    );
  const orderedCollectionNames = buildCollectionOrder([
    ...new Set([...collectionNames, ...universalCollectionNames()]),
  ]);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = `Maheshwari Motors ${firmLabel(isGst)} Backup`;
  workbook.created = new Date();
  workbook.modified = new Date();
  const lookups = await buildReferenceLookups(db, userId);
  const collectionCounts = [];
  let totalRecords = 0;

  for (const collectionName of orderedCollectionNames) {
    const docs = await getCollectionDocuments(db, collectionName, userId, isGst);
    collectionCounts.push({
      collection: collectionName,
      records: docs.length,
    });
    totalRecords += docs.length;
    addCollectionSheet(workbook, collectionName, docs, lookups);
  }

  const summary = {
    backup_id: backupId,
    generated_at: new Date().toISOString(),
    generated_by: String(userId),
    firm_scope: firmLabel(isGst),
    is_gst: normalizeFirmScope(isGst),
    database_name: db.databaseName,
    total_collections: orderedCollectionNames.length,
    total_records: totalRecords,
    collection_counts: collectionCounts,
  };

  addSummarySheet(workbook, summary);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  return { buffer, summary };
};

const getLogs = async (userId, isGst = null) => {
  const logs = await readLogs();
  const uid = String(userId);
  const scope = normalizeFirmScope(isGst);
  const filteredLogs = logs
    .filter((log) => {
      if (String(log.user_id) !== uid) return false;
      if (scope === null) return true;
      return Number(log.is_gst) === scope;
    })
    .sort((a, b) => {
      const left = toIso(a.created_at || a.date);
      const right = toIso(b.created_at || b.date);
      return new Date(right).getTime() - new Date(left).getTime();
    });

  const refreshed = await Promise.all(
    filteredLogs.map(async (log) => {
      if (log?.status !== "Success" || !log?.s3_key) {
        return log;
      }

      try {
        const downloadUrl = await s3Service.getSignedUrl(
          log.s3_key,
          DOWNLOAD_URL_EXPIRY_SECONDS,
        );
        return {
          ...log,
          download_url: downloadUrl,
          download_expires_at: new Date(
            Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000,
          ).toISOString(),
        };
      } catch {
        return log;
      }
    }),
  );

  return refreshed;
};

const buildBackupFilename = (type, scope, timestamp) => {
  const stamp = formatDateStamp(timestamp);
  if (type === "Financial Year Close Backup") {
    if (scope === 1 || scope === 0) {
      return `financial_year_${scope}_close_${stamp}.xlsx`;
    }
    return `financial_year_close_${stamp}.xlsx`;
  }

  return `manual_backup_${stamp}.xlsx`;
};

const createBackup = async (
  userId,
  { type = "Manual Backup", notePrefix = "", isGst = null, timestamp = null } = {},
) => {
  await ensureStorage();

  const now = timestamp ? new Date(timestamp) : new Date();
  const scope = normalizeFirmScope(isGst);
  const scopeLabel = firmLabel(scope);
  const filename = buildBackupFilename(type, scope, now);
  const filePath = path.join(backupDir, filename);
  const baseLog = {
    id: createId(),
    user_id: String(userId),
    is_gst: scope,
    firm_scope: scopeLabel,
    created_at: now.toISOString(),
    date: formatDateTime(now),
    type,
    filename,
  };

  try {
    const { buffer, summary } = await createWorkbookBackup(userId, scope);
    await fs.promises.writeFile(filePath, buffer);

    const s3Url = await s3Service.uploadFile(
      buffer,
      filename,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      `backups/${process.env.AWS_S3_BUCKET_NAME}`,
    );

    let downloadUrl = s3Url;
    let downloadExpiresAt = null;
    const s3Key = parseKeyFromS3Url(s3Url);

    if (s3Key) {
      try {
        downloadUrl = await s3Service.getSignedUrl(
          s3Key,
          DOWNLOAD_URL_EXPIRY_SECONDS,
        );
        downloadExpiresAt = new Date(
          Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000,
        ).toISOString();
      } catch {
        // Keep public URL fallback when signed URL generation is not available.
      }
    }

    const logEntry = {
      ...baseLog,
      status: "Success",
      size: formatSize(buffer.length),
      note: `${notePrefix ? `${notePrefix} | ` : ""}${summary.firm_scope} backup | ${summary.total_records} records across ${summary.total_collections} collections`,
      location: s3Url,
      download_url: downloadUrl,
      download_expires_at: downloadExpiresAt,
      s3_key: s3Key,
      local_path: filePath,
      backup_id: summary.backup_id,
      database_name: summary.database_name,
      total_collections: summary.total_collections,
      total_records: summary.total_records,
      collections: summary.collection_counts,
    };

    const logs = await readLogs();
    logs.unshift(logEntry);
    await writeLogs(logs);
    return logEntry;
  } catch (error) {
    const failedLogEntry = {
      ...baseLog,
      status: "Failed",
      size: "0 MB",
      note: error?.message || "Backup failed",
      location: filePath,
      download_url: null,
      download_expires_at: null,
    };

    const logs = await readLogs();
    logs.unshift(failedLogEntry);
    await writeLogs(logs);
    throw error;
  }
};

const createFinancialYearCloseBackups = async (userId, options = {}) => {
  const timestamp = new Date();
  const gstBackup = await createBackup(userId, {
    ...options,
    type: "Financial Year Close Backup",
    notePrefix: options.notePrefix || "FY close",
    isGst: 1,
    timestamp,
  });
  const nongstBackup = await createBackup(userId, {
    ...options,
    type: "Financial Year Close Backup",
    notePrefix: options.notePrefix || "FY close",
    isGst: 0,
    timestamp,
  });

  return [gstBackup, nongstBackup];
};

const uploadExcelFile = async (
  userId,
  fileBuffer,
  originalName,
  isGst = null,
) => {
  await ensureStorage();

  const now = new Date();
  const fileExtension = path.extname(originalName);
  const baseName = path.basename(originalName, fileExtension);
  const timestamp = formatDateStamp(now);
  const scope = normalizeFirmScope(isGst);
  const scopeLabel = firmLabel(scope);
  const filename = `${baseName}_${scopeLabel.toLowerCase()}_${timestamp}${fileExtension}`;

  const baseLog = {
    id: createId(),
    user_id: String(userId),
    is_gst: scope,
    firm_scope: scopeLabel,
    created_at: now.toISOString(),
    date: formatDateTime(now),
    type: "File Import",
    filename,
  };

  try {
    // Upload to S3
    const s3Url = await s3Service.uploadFile(
      fileBuffer,
      filename,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "imports/excel",
    );

    let downloadUrl = s3Url;
    let downloadExpiresAt = null;
    const s3Key = parseKeyFromS3Url(s3Url);

    if (s3Key) {
      try {
        downloadUrl = await s3Service.getSignedUrl(
          s3Key,
          DOWNLOAD_URL_EXPIRY_SECONDS,
        );
        downloadExpiresAt = new Date(
          Date.now() + DOWNLOAD_URL_EXPIRY_SECONDS * 1000,
        ).toISOString();
      } catch {
        // Keep public URL fallback when signed URL generation is not available.
      }
    }

    const logEntry = {
      ...baseLog,
      status: "Success",
      size: formatSize(fileBuffer.length),
      note: `Excel file uploaded successfully`,
      location: s3Url,
      download_url: downloadUrl,
      download_expires_at: downloadExpiresAt,
      s3_key: s3Key,
      original_name: originalName,
    };

    const logs = await readLogs();
    logs.unshift(logEntry);
    await writeLogs(logs);
    return logEntry;
  } catch (error) {
    const failedLogEntry = {
      ...baseLog,
      status: "Failed",
      size: formatSize(fileBuffer.length),
      note: error?.message || "File upload failed",
      location: null,
      download_url: null,
      download_expires_at: null,
      original_name: originalName,
    };

    const logs = await readLogs();
    logs.unshift(failedLogEntry);
    await writeLogs(logs);
    throw error;
  }
};

const deleteLog = async (userId, logId, isGst = null) => {
  if (!logId || typeof logId !== "string" || !logId.trim()) {
    throw ApiError.badRequest("log_id is required");
  }

  const logs = await readLogs();
  const uid = String(userId);
  const scope = normalizeFirmScope(isGst);
  const targetIndex = logs.findIndex(
    (entry) =>
      String(entry?.id || "") === logId.trim() &&
      String(entry?.user_id || "") === uid &&
      (scope === null || Number(entry?.is_gst) === scope),
  );

  if (targetIndex === -1) {
    throw ApiError.notFound("Backup history entry not found");
  }

  const target = logs[targetIndex];
  await deleteLogAssets(target);

  logs.splice(targetIndex, 1);
  await writeLogs(logs);

  return {
    id: target.id,
    status: "deleted",
  };
};

const deleteLogAssets = async (target) => {
  if (!target || typeof target !== "object") {
    return;
  }

  const remoteUrl =
    isHttpUrl(target?.location) ? target.location
    : isHttpUrl(target?.download_url) ? target.download_url
    : null;

  if (remoteUrl) {
    await s3Service.deleteFile(remoteUrl);
  }

  const localCandidates = [
    toSafeLocalPath(target?.local_path),
    toSafeLocalPath(target?.location),
  ].filter(Boolean);

  for (const filePath of new Set(localCandidates)) {
    await removeFileIfExists(filePath);
  }
};

const deleteLogs = async (userId, logIds = [], isGst = null) => {
  if (!Array.isArray(logIds) || !logIds.length) {
    throw ApiError.badRequest("log_ids array is required");
  }

  const normalizedIds = Array.from(
    new Set(
      logIds
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  );

  if (!normalizedIds.length) {
    throw ApiError.badRequest("log_ids array is required");
  }

  const logs = await readLogs();
  const uid = String(userId);
  const scope = normalizeFirmScope(isGst);
  const targets = logs.filter(
    (entry) =>
      String(entry?.user_id || "") === uid &&
      (scope === null || Number(entry?.is_gst) === scope) &&
      normalizedIds.includes(String(entry?.id || "")),
  );

  if (!targets.length) {
    throw ApiError.notFound("Backup history entry not found");
  }

  for (const target of targets) {
    await deleteLogAssets(target);
  }

  const targetIds = new Set(targets.map((entry) => String(entry?.id || "")));
  const remainingLogs = logs.filter((entry) => {
    const isSameUser = String(entry?.user_id || "") === uid;
    const isSameFirm = scope === null || Number(entry?.is_gst) === scope;
    const isTarget = targetIds.has(String(entry?.id || ""));
    return !(isSameUser && isSameFirm && isTarget);
  });

  await writeLogs(remainingLogs);

  return {
    deleted_count: targets.length,
    ids: Array.from(targetIds),
    status: "deleted",
  };
};

export default {
  getLogs,
  createBackup,
  createFinancialYearCloseBackups,
  uploadExcelFile,
  deleteLog,
  deleteLogs,
};
