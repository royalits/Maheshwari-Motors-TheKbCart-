import fs from "fs";
import path from "path";
import crypto from "crypto";
import ExcelJS from "exceljs";
import mongoose from "mongoose";
import { ApiError, toNumber, toNumberIfDefined } from "../../utils/index.js";
import backupService from "../backup/backup.service.js";
import financialYearService from "../common/financialYear.service.js";
import Item from "../../models/master/item.model.js";
import Brand from "../../models/master/brand.model.js";
import Department from "../../models/master/department.model.js";
import Hsn from "../../models/master/hsn.model.js";
import {
  getUniversalCollectionSchema,
  IGNORED_UNIVERSAL_SHEETS,
  isInternalUniversalField,
  normalizeUniversalHeader,
  normalizeUniversalValue,
  universalSchemas,
  universalSheetNames,
} from "./universalImportExport.schema.js";
import { buildUniversalImportTemplateWorkbook } from "./universalImportExport.workbook.js";
import {
  generateUniqueBarcode,
  generateUniqueItemId,
  isValidBarcodeFormat,
} from "../../helpers/identifierGenerator.js";

const storageRoot = path.resolve(process.cwd(), "storage");
const importsDir = path.join(storageRoot, "imports");
const reportsDir = path.join(storageRoot, "import-reports");
const restoresDir = path.join(storageRoot, "restores");
const BACKUP_EXCEL_FORMAT = "Maheshwari Backup Excel v2";

const importJobs = new Map();

const ensureDirs = async () => {
  await fs.promises.mkdir(importsDir, { recursive: true });
  await fs.promises.mkdir(reportsDir, { recursive: true });
  await fs.promises.mkdir(restoresDir, { recursive: true });
};

const moveFile = async (src, dest) => {
  try {
    await fs.promises.rename(src, dest);
  } catch (error) {
    if (error.code === "EXDEV") {
      await fs.promises.copyFile(src, dest);
      await fs.promises.unlink(src);
    } else {
      throw error;
    }
  }
};

const sanitizeFilename = (name) =>
  name.replace(/[^\w.\-]/g, "_").slice(0, 120) || "file";

const formatDateStamp = () => {
  const now = new Date();
  const pad = (num) => String(num).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

const createId = () =>
  typeof crypto.randomUUID === "function" ?
    crypto.randomUUID()
  : crypto.randomBytes(16).toString("hex");

// Determine current financial year (starts April 1)
const getCurrentFinancialYear = (date = new Date()) => {
  const month = date.getMonth(); // 0=Jan, 3=Apr, 11=Dec
  const year = date.getFullYear();
  // April onwards = current year, Before April = previous year
  return month >= 3 ? year : year - 1;
};

// Parse date from Excel (handles string, number, Date)
const parseExcelDate = (value) => {
  if (!value) return null;
  if (typeof value === "object" && value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel stores dates as numbers since 1900-01-01
    const excelEpoch = new Date(1900, 0, 1);
    return new Date(excelEpoch.getTime() + (value - 2) * 86400 * 1000);
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Determine if date is for current or previous financial year
const getFinancialYearForDate = (dateValue) => {
  const date = parseExcelDate(dateValue);
  if (!date) return getCurrentFinancialYear();
  return getCurrentFinancialYear(date);
};

// Normalize numeric values
const toNum = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const isObjectIdString = (value) =>
  typeof value === "string" && /^[a-f0-9]{24}$/i.test(value.trim());

const normalizeImportedCellValue = (rawValue) => {
  if (rawValue === undefined || rawValue === null) return rawValue;
  if (rawValue instanceof Date) return rawValue;

  if (typeof rawValue === "object") {
    if (Object.prototype.hasOwnProperty.call(rawValue, "result")) {
      return normalizeImportedCellValue(rawValue.result);
    }

    if (Array.isArray(rawValue.richText)) {
      return rawValue.richText.map((part) => part?.text || "").join("");
    }

    if (typeof rawValue.text === "string") {
      return rawValue.text;
    }
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed === "") return "";
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    if (trimmed.toLowerCase() === "null") return null;

    const looksLikeJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"));

    if (looksLikeJson) {
      try {
        return JSON.parse(trimmed);
      } catch {
        return rawValue;
      }
    }
  }

  return rawValue;
};

const isNormalizedBackupWorkbook = (workbook) => {
  const summarySheet = workbook.getWorksheet("backup_summary");
  if (!summarySheet) return false;

  let format = "";
  summarySheet.eachRow((row) => {
    const field = String(normalizeImportedCellValue(row.getCell(1).value) || "")
      .trim()
      .toLowerCase();
    if (field === "format") {
      format = String(normalizeImportedCellValue(row.getCell(2).value) || "")
        .trim();
    }
  });

  return format === BACKUP_EXCEL_FORMAT;
};

const isLegacyEmptyWorksheet = (worksheet) =>
  String(normalizeImportedCellValue(worksheet.getRow(1).getCell(1).value) || "")
    .trim()
    .toLowerCase() === "_empty";

const getUniversalHeaders = (worksheet) => {
  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colIndex) => {
    const raw = String(normalizeImportedCellValue(cell.value) || "").trim();
    if (raw) {
      headers.push({ raw, key: normalizeUniversalHeader(raw), colIndex });
    }
  });
  return headers;
};

const rowHasUniversalData = (row, allowedColumns) => {
  for (const { colIndex } of allowedColumns) {
    const value = normalizeImportedCellValue(row.getCell(colIndex).value);
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return true;
    }
  }
  return false;
};

const buildUniversalUpsertFilter = (schema, doc, userObjectId) => {
  for (const key of schema.naturalKey || []) {
    if (doc[key] !== undefined && doc[key] !== null && String(doc[key]).trim() !== "") {
      return { user_id: userObjectId, [key]: doc[key] };
    }
  }
  return null;
};

const resolveUniversalItemReferences = async (doc, userObjectId) => {
  const [brand, department, hsn] = await Promise.all([
    doc.brand_name ?
      Brand.findOne({ user_id: userObjectId, name: doc.brand_name }).select("_id").lean()
    : null,
    doc.dept_name ?
      Department.findOne({ user_id: userObjectId, name: doc.dept_name }).select("_id").lean()
    : null,
    doc.hsn_code ?
      Hsn.findOne({ user_id: userObjectId, hsn_code: doc.hsn_code }).select("_id").lean()
    : null,
  ]);

  if (brand?._id) doc.brand_id = brand._id;
  if (department?._id) doc.dept_id = department._id;
  if (hsn?._id) doc.hsn_id = hsn._id;
  delete doc.brand_name;
  delete doc.dept_name;
  delete doc.hsn_code;

  if (!doc.barcode) {
    doc.barcode = await generateUniqueBarcode();
  }
  if (!doc.item_id) {
    doc.item_id = await generateUniqueItemId(userObjectId);
  }
};

const importUniversalWorkbook = async (workbook, userId, isGst = 1) => {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("Database connection not available");

  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const collectionStats = {};
  const skippedEmptySheets = [];
  const ignoredUnknownSheets = [];
  const warnings = [];
  const errors = [];
  let totalRecords = 0;

  for (const worksheet of workbook.worksheets) {
    const sheetName = worksheet.name;
    const normalizedSheetName = String(sheetName || "").toLowerCase();

    if (IGNORED_UNIVERSAL_SHEETS.has(normalizedSheetName)) continue;

    const schema = getUniversalCollectionSchema(sheetName);
    if (!schema) {
      ignoredUnknownSheets.push(sheetName);
      continue;
    }

    if (isLegacyEmptyWorksheet(worksheet)) {
      skippedEmptySheets.push(sheetName);
      continue;
    }

    const headers = getUniversalHeaders(worksheet);
    if (headers.length === 0) {
      skippedEmptySheets.push(sheetName);
      continue;
    }

    const schemaColumns = new Set(schema.columns);
    const allowedHeaders = headers.filter((header) => schemaColumns.has(header.key));
    const ignoredInternal = headers
      .filter((header) => isInternalUniversalField(header.key))
      .map((header) => header.raw);
    const unknownHeaders = headers
      .filter(
        (header) =>
          !schemaColumns.has(header.key) && !isInternalUniversalField(header.key),
      )
      .map((header) => header.raw);

    if (ignoredInternal.length > 0) {
      warnings.push(
        `Sheet "${sheetName}" ignored internal columns: [${ignoredInternal.join(", ")}]`,
      );
    }

    const rows = [];
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      if (rowHasUniversalData(row, allowedHeaders)) rows.push({ row, rowNumber });
    });

    if (rows.length === 0) {
      skippedEmptySheets.push(sheetName);
      continue;
    }

    const missingRequired = schema.required.filter(
      (requiredKey) => !allowedHeaders.some((header) => header.key === requiredKey),
    );
    if (missingRequired.length > 0 || unknownHeaders.length > 0) {
      errors.push({
        sheet: sheetName,
        error: `Invalid columns in sheet "${sheetName}": missing [${missingRequired.join(", ")}], unknown [${unknownHeaders.join(", ")}]`,
      });
      continue;
    }

    const bulkOps = [];
    for (const { row, rowNumber } of rows) {
      const doc = { ...(schema.defaults || {}), user_id: userObjectId };
      for (const header of allowedHeaders) {
        const value = normalizeImportedCellValue(row.getCell(header.colIndex).value);
        if (value === undefined || value === null || String(value).trim() === "") {
          continue;
        }
        doc[header.key] = normalizeUniversalValue(schema, header.key, value);
      }

      if (schema.columns.includes("is_gst") && doc.is_gst === undefined) {
        doc.is_gst = Number(isGst) === 0 ? 0 : 1;
      }
      if (schema.collectionName === "contacts" && doc.type) {
        doc.type = String(doc.type).trim().toLowerCase();
      }
      if (schema.collectionName === "items") {
        await resolveUniversalItemReferences(doc, userObjectId);
      }

      const missingRowRequired = schema.required.filter(
        (key) => doc[key] === undefined || doc[key] === null || String(doc[key]).trim() === "",
      );
      if (missingRowRequired.length > 0) {
        errors.push({
          sheet: sheetName,
          row: rowNumber,
          error: `Missing required values in sheet "${sheetName}" row ${rowNumber}: [${missingRowRequired.join(", ")}]`,
        });
        continue;
      }

      const filter = buildUniversalUpsertFilter(schema, doc, userObjectId);
      if (filter) {
        bulkOps.push({
          updateOne: {
            filter,
            update: { $set: doc },
            upsert: true,
          },
        });
      } else {
        bulkOps.push({ insertOne: { document: doc } });
      }
    }

    if (bulkOps.length === 0) continue;

    const result = await db.collection(schema.collectionName).bulkWrite(bulkOps, {
      ordered: false,
    });
    const imported = bulkOps.length;
    collectionStats[sheetName] = {
      rows: rows.length,
      imported,
      inserted: result.insertedCount || 0,
      updated: result.modifiedCount || 0,
      upserted: result.upsertedCount || 0,
    };
    totalRecords += imported;
  }

  return {
    collectionStats,
    skippedEmptySheets,
    ignoredUnknownSheets,
    warnings,
    errors,
    totalRecords,
  };
};

const reviveImportedValue = (
  key,
  value,
  userId,
  { remapUserId = true, isItemCollection = false } = {},
) => {
  if (key === "user_id" && remapUserId) {
    if (isObjectIdString(String(userId))) {
      return new mongoose.Types.ObjectId(String(userId));
    }
    return userId;
  }
  if (value === undefined) return undefined;
  if (value === null) return null;

  if (Array.isArray(value)) {
    if (key.endsWith("_ids")) {
      return value.map((entry) => {
        if (typeof entry === "string" && isObjectIdString(entry)) {
          return new mongoose.Types.ObjectId(entry.trim());
        }
        return reviveImportedValue(key.slice(0, -1), entry, userId, {
          remapUserId,
          isItemCollection,
        });
      });
    }

    return value.map((entry) =>
      reviveImportedValue(key, entry, userId, { remapUserId, isItemCollection }),
    );
  }

  if (value instanceof Date) return value;

  if (typeof value === "object") {
    const output = {};
    for (const [innerKey, innerValue] of Object.entries(value)) {
      const revived = reviveImportedValue(innerKey, innerValue, userId, {
        remapUserId,
        isItemCollection,
      });
      if (revived !== undefined) output[innerKey] = revived;
    }
    return output;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    const isObjectIdField = key === "_id" || (key.endsWith("_id") && !(key === "item_id" && isItemCollection));

    if (isObjectIdField && isObjectIdString(trimmed)) {
      return new mongoose.Types.ObjectId(trimmed);
    }

    // For _id/_*_id fields that are NOT valid ObjectId format (numeric, etc),
    // return undefined so MongoDB can auto-generate _id or skip the field
    // This prevents "Invalid _id: X" CastErrors during queries
    if (isObjectIdField && !isObjectIdString(trimmed)) {
      // For primary _id field, return undefined to let MongoDB generate new ID
      if (key === "_id") {
        return undefined;
      }
      // For reference fields like contact_id, bank_id, etc, return null
      // This is safe as references typically have default: null in schema
      return null;
    }

    if (
      (key === "id" || key === "is_gst" || key === "__v") &&
      /^-?\d+(\.\d+)?$/.test(trimmed)
    ) {
      return Number(trimmed);
    }

    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    if (trimmed.toLowerCase() === "null") return null;
  }

  return value;
};

const getNestedValue = (source, path) => {
  const segments = String(path || "").split(".");
  let current = source;
  for (const segment of segments) {
    if (!segment) continue;
    if (!current || typeof current !== "object") return undefined;
    current = current[segment];
  }
  return current;
};

const buildBackupUpsertFilter = (collectionName, doc) => {
  const normalizedCollection = String(collectionName || "").toLowerCase();

  if (normalizedCollection === "counters") {
    if (doc?.model_name && doc?.user_id) {
      return { model_name: doc.model_name, user_id: doc.user_id };
    }
  }

  if (normalizedCollection === "subscriptions") {
    if (doc?.user_id) {
      return { user_id: doc.user_id };
    }
  }

  if (normalizedCollection === "users") {
    const uniqueUserPaths = [
      "admin.username",
      "sale_user.username",
      "account_user.username",
      "client_user.username",
      "gst_firm.username",
      "nongst_firm.username",
    ];

    for (const path of uniqueUserPaths) {
      const value = getNestedValue(doc, path);
      if (
        value !== undefined &&
        value !== null &&
        String(value).trim().length > 0
      ) {
        return { [path]: String(value).trim() };
      }
    }
  }

  if (doc?._id) {
    return { _id: doc._id };
  }

  return null;
};

const setNestedField = (target, fieldPath, value) => {
  const path = String(fieldPath || "").trim();
  if (!path) return;

  const segments = path.split(".");
  let cursor = target;

  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!segment) continue;

    if (
      cursor[segment] === undefined ||
      cursor[segment] === null ||
      typeof cursor[segment] !== "object" ||
      Array.isArray(cursor[segment])
    ) {
      cursor[segment] = {};
    }

    cursor = cursor[segment];
  }

  const finalKey = segments[segments.length - 1];
  if (!finalKey) return;
  cursor[finalKey] = value;
};

// Validate and create/update item from row data
const processItemRow = async (
  row,
  rowIndex,
  userId,
  errors,
  report,
  isGst = 1,
) => {
  try {
    const {
      item_name,
      item_id,
      barcode,
      alias,
      description,
      sale_rate,
      purchase_rate,
      mrp_rate,
      gst_percent,
      discount,
      stock,
      physical_stock,
      logical_stock,
      opening_physical_stock,
      opening_logical_stock,
      stock_date,
      brand_name,
      dept_name,
      hsn_code,
      is_gst,
    } = row;

    // Validate required fields
    if (!item_name || typeof item_name !== "string" || !item_name.trim()) {
      throw new Error("Item name is required");
    }
    if (!sale_rate && sale_rate !== 0) {
      throw new Error("Sale rate is required");
    }

    const parsedSaleRate = toNum(sale_rate);
    if (parsedSaleRate <= 0) {
      throw new Error("Sale rate must be greater than 0");
    }

    // Generate or validate item_id
    let finalItemId = item_id;
    if (!finalItemId || finalItemId === "") {
      finalItemId = String(await generateUniqueItemId(userId));
    } else {
      finalItemId = String(finalItemId).trim().toUpperCase();
      if (!/^[A-Za-z0-9]+$/.test(finalItemId)) {
        throw new Error("Item ID must be alphanumeric");
      }
      if (!/[A-Za-z]/.test(finalItemId)) {
        throw new Error("Item ID must include at least one letter");
      }
    }

    // Generate or validate barcode
    let finalBarcode = barcode;
    if (!finalBarcode || finalBarcode === "") {
      finalBarcode = await generateUniqueBarcode();
    } else {
      finalBarcode = String(finalBarcode).trim().toUpperCase();
      if (!isValidBarcodeFormat(finalBarcode)) {
        throw new Error("Barcode must be exactly 10 alphanumeric characters");
      }
    }

    // Resolve relationships
    let brandId = null;
    if (brand_name && brand_name !== "") {
      const brand = await Brand.findOne({
        name: new RegExp(`^${String(brand_name).trim()}$`, "i"),
        user_id: userId,
      }).select("_id");
      if (!brand) {
        throw new Error(`Brand "${brand_name}" not found`);
      }
      brandId = brand._id;
    }

    let deptId = null;
    if (dept_name && dept_name !== "") {
      const dept = await Department.findOne({
        name: new RegExp(`^${String(dept_name).trim()}$`, "i"),
        user_id: userId,
      }).select("_id");
      if (!dept) {
        throw new Error(`Department "${dept_name}" not found`);
      }
      deptId = dept._id;
    }

    let hsnId = null;
    if (hsn_code && hsn_code !== "") {
      const hsn = await Hsn.findOne({
        hsn_code: String(hsn_code).trim(),
        user_id: userId,
      }).select("_id");
      if (!hsn) {
        throw new Error(`HSN code "${hsn_code}" not found`);
      }
      hsnId = hsn._id;
    }

    // Determine stock placement based on year
    let finalPhysicalStock = 0;
    let finalLogicalStock = 0;
    let finalOpeningPhysicalStock = 0;
    let finalOpeningLogicalStock = 0;

    const currentFY = getCurrentFinancialYear();
    const dataFY = getFinancialYearForDate(stock_date);

    const normalizedIsGst =
      is_gst === undefined || is_gst === null || is_gst === "" ?
        Number(isGst) === 0 ? 0
        : 1
      : Number(is_gst) === 1 ? 1
      : 0;

    // If data is for current year, go to regular stock
    // If data is for previous year, go to opening stock
    if (dataFY === currentFY) {
      // Current year data
      if (normalizedIsGst === 1) {
        // GST: use physical_stock or stock
        finalPhysicalStock =
          physical_stock !== undefined && physical_stock !== "" ?
            toNum(physical_stock, 0)
          : stock !== undefined && stock !== "" ? toNum(stock, 0)
          : 0;
      } else {
        // Non-GST: physical for GST calculation, logical for non-GST portion
        finalPhysicalStock =
          physical_stock !== undefined && physical_stock !== "" ?
            toNum(physical_stock, 0)
          : 0;
        finalLogicalStock =
          logical_stock !== undefined && logical_stock !== "" ?
            toNum(logical_stock, 0)
          : stock !== undefined && stock !== "" ? toNum(stock, 0)
          : 0;
      }
    } else {
      // Previous year data (opening stock)
      if (normalizedIsGst === 1) {
        finalOpeningPhysicalStock =
          (
            opening_physical_stock !== undefined &&
            opening_physical_stock !== ""
          ) ?
            toNum(opening_physical_stock, 0)
          : physical_stock !== undefined && physical_stock !== "" ?
            toNum(physical_stock, 0)
          : stock !== undefined && stock !== "" ? toNum(stock, 0)
          : 0;
      } else {
        // Non-GST
        finalOpeningPhysicalStock =
          (
            opening_physical_stock !== undefined &&
            opening_physical_stock !== ""
          ) ?
            toNum(opening_physical_stock, 0)
          : physical_stock !== undefined && physical_stock !== "" ?
            toNum(physical_stock, 0)
          : 0;
        finalOpeningLogicalStock =
          opening_logical_stock !== undefined && opening_logical_stock !== "" ?
            toNum(opening_logical_stock, 0)
          : logical_stock !== undefined && logical_stock !== "" ?
            toNum(logical_stock, 0)
          : stock !== undefined && stock !== "" ? toNum(stock, 0)
          : 0;
      }
    }

    // Check if item already exists
    const existingItem = await Item.findOne({
      $or: [
        { item_id: finalItemId, user_id: userId },
        { barcode: finalBarcode, user_id: userId },
      ],
    });

    let result;
    if (existingItem) {
      // Update existing item
      result = await Item.findByIdAndUpdate(
        existingItem._id,
        {
          item_name: item_name.trim(),
          item_id: finalItemId,
          barcode: finalBarcode,
          alias: alias ? String(alias).trim() : undefined,
          description: description ? String(description).trim() : undefined,
          sale_rate: parsedSaleRate,
          purchase_rate:
            purchase_rate !== undefined && purchase_rate !== "" ?
              toNum(purchase_rate, 0)
            : undefined,
          mrp_rate:
            mrp_rate !== undefined && mrp_rate !== "" ?
              toNum(mrp_rate, 0)
            : undefined,
          gst_percent:
            gst_percent !== undefined && gst_percent !== "" ?
              Math.max(0, Math.min(100, toNum(gst_percent)))
            : undefined,
          discount:
            discount !== undefined && discount !== "" ?
              Math.max(0, Math.min(100, toNum(discount)))
            : undefined,
          physical_stock: finalPhysicalStock,
          logical_stock: finalLogicalStock,
          opening_physical_stock: finalOpeningPhysicalStock,
          opening_logical_stock: finalOpeningLogicalStock,
          brand_id: brandId,
          dept_id: deptId,
          hsn_id: hsnId,
          is_gst: normalizedIsGst,
        },
        { returnDocument: "after" },
      );

      report.push(
        `Row ${rowIndex}: Updated item "${item_name}" (ID: ${finalItemId})`,
      );
    } else {
      // Create new item
      const newItem = new Item({
        item_name: item_name.trim(),
        item_id: finalItemId,
        barcode: finalBarcode,
        alias: alias ? String(alias).trim() : undefined,
        description: description ? String(description).trim() : undefined,
        sale_rate: parsedSaleRate,
        purchase_rate:
          purchase_rate !== undefined && purchase_rate !== "" ?
            toNum(purchase_rate, 0)
          : 0,
        mrp_rate:
          mrp_rate !== undefined && mrp_rate !== "" ? toNum(mrp_rate, 0) : 0,
        gst_percent:
          gst_percent !== undefined && gst_percent !== "" ?
            Math.max(0, Math.min(100, toNum(gst_percent)))
          : 0,
        discount:
          discount !== undefined && discount !== "" ?
            Math.max(0, Math.min(100, toNum(discount)))
          : 0,
        physical_stock: finalPhysicalStock,
        logical_stock: finalLogicalStock,
        opening_physical_stock: finalOpeningPhysicalStock,
        opening_logical_stock: finalOpeningLogicalStock,
        brand_id: brandId,
        dept_id: deptId,
        hsn_id: hsnId,
        is_gst: normalizedIsGst,
        user_id: userId,
      });

      result = await newItem.save();
      report.push(
        `Row ${rowIndex}: Created new item "${item_name}" (ID: ${finalItemId})`,
      );
    }

    return { success: true, item: result, rowIndex };
  } catch (err) {
    const errorMsg = err?.message || String(err);
    errors.push({
      rowIndex,
      error: errorMsg,
    });
    report.push(`Row ${rowIndex}: ❌ Error - ${errorMsg}`);
    return { success: false, rowIndex, error: errorMsg };
  }
};

// Parse Excel rows from workbook
const parseExcelRows = async (workbook) => {
  // Try to find the data sheet (skip instruction sheets)
  let sheet = null;
  const sheetNames = workbook.worksheets.map((ws) => ws.name.toLowerCase());

  // Priority: "test data", "items", "stock", then first data sheet
  const priorities = ["test data", "items", "stock"];
  for (const priority of priorities) {
    const idx = sheetNames.findIndex((name) => name === priority);
    if (idx >= 0) {
      sheet = workbook.getWorksheet(idx + 1);
      break;
    }
  }

  // If no priority matches found, use first sheet that has significant data
  if (!sheet) {
    for (let i = 1; i <= workbook.worksheets.length; i++) {
      const ws = workbook.getWorksheet(i);
      if (ws && ws.actualRowCount > 1) {
        sheet = ws;
        break;
      }
    }
  }

  if (!sheet) {
    throw ApiError.badRequest("No worksheet found in Excel file");
  }

  const rows = [];
  const headerRow = sheet.getRow(1);
  if (!headerRow) {
    throw ApiError.badRequest("Excel file must have a header row");
  }

  const headers = [];
  headerRow.eachCell((cell) => {
    headers.push(
      String(cell.value || "")
        .toLowerCase()
        .trim(),
    );
  });

  if (headers.length === 0) {
    throw ApiError.badRequest("Excel file headers not found");
  }

  // Start from row 2 (skip header)
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // Skip header
    if (!row.values || row.values.allCellsEmpty) return; // Skip empty rows

    const data = {};
    row.eachCell((cell, colIndex) => {
      const header = headers[colIndex - 1];
      if (header) {
        data[header] = cell.value;
      }
    });

    // Only add non-empty rows
    if (data.item_name) {
      rows.push(data);
    }
  });

  return rows;
};

// Import from backup Excel file (restores all collections)
const importFromBackup = async (file, userId, isGst = 1) => {
  await ensureDirs();
  const jobId = createId();
  const safeName = sanitizeFilename(file.originalname || "backup.xlsx");
  const storedFilename = `${Date.now()}-${safeName}`;
  const targetPath = path.join(importsDir, storedFilename);

  try {
    // Save the file
    if (file.path) {
      await moveFile(file.path, targetPath);
    } else if (file.buffer) {
      await fs.promises.writeFile(targetPath, file.buffer);
    }

    // Parse Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(targetPath);

    {
    const universalResult = await importUniversalWorkbook(
      workbook,
      userId,
      isGst,
    );
    const report = [
      `Universal Import Report - ${new Date().toISOString()}`,
      `Job ID: ${jobId}`,
      `User: ${String(userId)}`,
      `File: ${safeName}`,
      "",
      "Imported Collections:",
      ...Object.entries(universalResult.collectionStats).map(
        ([sheet, stats]) =>
          `  ${sheet}: ${stats.imported}/${stats.rows} rows imported`,
      ),
      "",
      `Skipped Empty Sheets: ${universalResult.skippedEmptySheets.join(", ") || "None"}`,
      `Ignored Unknown Sheets: ${universalResult.ignoredUnknownSheets.join(", ") || "None"}`,
      "",
      "Warnings:",
      ...(universalResult.warnings.length ? universalResult.warnings : ["  None"]),
      "",
      "Errors:",
      ...(
        universalResult.errors.length ?
          universalResult.errors.map((entry) => `  ${entry.error}`)
        : ["  None"]
      ),
    ];

    const reportFilename = `backup_import_report_${jobId}.txt`;
    const reportPath = path.join(reportsDir, reportFilename);
    await fs.promises.writeFile(reportPath, report.join("\n"), "utf8");

    const status =
      universalResult.errors.length > 0 ? "completed_with_errors" : "completed";

    const job = {
      id: jobId,
      user_id: String(userId),
      status,
      progress: 100,
      created_at: new Date().toISOString(),
      file: {
        name: safeName,
        size: file.size || 0,
      },
      result: {
        total_collections: Object.keys(universalResult.collectionStats).length,
        total_records: universalResult.totalRecords,
        errors_count: universalResult.errors.length,
        collection_stats: universalResult.collectionStats,
        skipped_empty_sheets: universalResult.skippedEmptySheets,
        ignored_unknown_sheets: universalResult.ignoredUnknownSheets,
        warnings: universalResult.warnings,
        errors: universalResult.errors,
      },
      report: {
        filename: reportFilename,
        path: reportPath,
      },
    };

    importJobs.set(jobId, job);
    return job;
    }

    const report = [
      `Backup Import Report - ${new Date().toISOString()}`,
      `Job ID: ${jobId}`,
      `User: ${String(userId)}`,
      `File: ${safeName}`,
      "",
    ];

    const collectionStats = {};
    const errors = [];
    let totalCollections = 0;
    let totalRecords = 0;
    const isNormalizedBackup = isNormalizedBackupWorkbook(workbook);
    const preserveUserOwnershipCollections = new Set(["users", "sessions"]);

    // Skip summary sheet, process data sheets
    for (const worksheet of workbook.worksheets) {
      const sheetName = worksheet.name;
      const normalizedSheetName = String(sheetName || "").toLowerCase();

      // Skip summary and metadata sheets
      if (
        ["summary", "metadata", "instructions", "backup_summary"].includes(
          sheetName.toLowerCase(),
        )
      ) {
        continue;
      }

      totalCollections++;
      let collectionRecords = 0;

      try {
        const remapUserId =
          !preserveUserOwnershipCollections.has(normalizedSheetName);

        // Special handling for items collection - use model validation
        if (!isNormalizedBackup && normalizedSheetName === "items") {
          const excelRows = [];

          // Get headers
          const headerRow = worksheet.getRow(1);
          const headers = [];
          headerRow.eachCell((cell) => {
            const normalizedHeader = String(
              normalizeImportedCellValue(cell.value) || "",
            ).trim();
            headers.push(normalizedHeader);
          });

          if (headers.length === 0) {
            throw new Error(`Sheet "${sheetName}" has no headers`);
          }

          // Parse data rows into objects
          worksheet.eachRow((row, rowNumber) => {
            if (rowNumber === 1) return; // Skip header
            if (!row.values || row.values.allCellsEmpty) return;

            const rowData = {};
            row.eachCell((cell, colIndex) => {
              const header = headers[colIndex - 1];
              const value = normalizeImportedCellValue(cell.value);

              if (header && value !== null && value !== undefined) {
                rowData[header] = value;
              }
            });

            if (Object.keys(rowData).length > 0) {
              excelRows.push(rowData);
            }
          });

          // Process each row using item model validation
          let successCount = 0;
          for (let i = 0; i < excelRows.length; i++) {
            const result = await processItemRow(
              excelRows[i],
              i + 2, // Row number (2 because header is row 1)
              userId,
              errors,
              report,
            );
            if (result.success) successCount++;
          }

          collectionStats[sheetName] = {
            rows: excelRows.length,
            inserted: successCount,
            updated: 0,
            upserted: 0,
          };
          report.push(
            `✓ ${sheetName}: ${successCount}/${excelRows.length} items processed successfully`,
          );
          totalRecords += successCount;
          continue; // Skip generic bulk processing for items
        }

        // Get headers for non-items collections
        const headerRow = worksheet.getRow(1);
        const headers = [];
        headerRow.eachCell((cell) => {
          const normalizedHeader = String(
            normalizeImportedCellValue(cell.value) || "",
          ).trim();
          headers.push(normalizedHeader);
        });

        if (headers.length === 0) {
          throw new Error(`Sheet "${sheetName}" has no headers`);
        }

        // Get MongoDB collection
        const db = mongoose.connection?.db;
        if (!db) {
          throw new Error("Database connection not available");
        }

        const collection = db.collection(sheetName);
        const bulkOps = [];

        // Parse data rows
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // Skip header
          if (!row.values || row.values.allCellsEmpty) return;

          const doc = {};
          row.eachCell((cell, colIndex) => {
            const header = headers[colIndex - 1];
            const value = normalizeImportedCellValue(cell.value);

            if (header && value !== null && value !== undefined) {
              const terminalKey =
                String(header).split(".").pop() || String(header);
              const revivedValue = reviveImportedValue(
                terminalKey,
                value,
                userId,
                {
                  remapUserId,
                  isItemCollection: String(sheetName).toLowerCase() === "items"
                },
              );
              setNestedField(doc, header, revivedValue);
            }
          });

          // Validate imported document for common issues
          if (Object.keys(doc).length > 0) {
            // Warn about reference fields that are null (likely from invalid ObjectIds)
            const referenceFields = [
              "contact_id",
              "bank_id",
              "transport_id",
              "agent_id",
              "area_id",
              "label_id",
              "item_id",
              "challan_ids",
              "auto_bill_items",
            ];
            for (const refField of referenceFields) {
              if (doc[refField] === null && headers.includes(refField)) {
                // This is expected - null reference fields are safe
                // They indicate the Excel had invalid ObjectId values that were converted to null
              }
            }
          }

          if (Object.keys(doc).length > 0) {
            // Upsert by _id if exists, otherwise insert
            const upsertFilter = buildBackupUpsertFilter(sheetName, doc);

            if (upsertFilter) {
              const { _id, ...docWithoutId } = doc;
              const update = { $set: docWithoutId };
              if (_id) {
                update.$setOnInsert = { _id };
              }

              bulkOps.push({
                updateOne: {
                  filter: upsertFilter,
                  update,
                  upsert: true,
                },
              });
            } else {
              bulkOps.push({
                insertOne: { document: doc },
              });
            }
            collectionRecords++;
          }
        });

        // Execute bulk operations
        if (bulkOps.length > 0) {
          const result = await collection.bulkWrite(bulkOps, {
            ordered: false,
          });
          collectionStats[sheetName] = {
            rows: collectionRecords,
            inserted: result.insertedCount || 0,
            updated: result.modifiedCount || 0,
            upserted: result.upsertedCount || 0,
          };
          report.push(
            `✓ ${sheetName}: ${collectionRecords} records imported (${result.insertedCount} new, ${result.modifiedCount} updated)`,
          );
          totalRecords += collectionRecords;
        }
      } catch (err) {
        const errorMsg = err?.message || String(err);
        errors.push({
          sheet: sheetName,
          error: errorMsg,
        });
        report.push(`❌ ${sheetName}: Error - ${errorMsg}`);
      }
    }

    report.push("");
    report.push(`Summary:`);
    report.push(`- Collections: ${totalCollections}`);
    report.push(`- Total Records: ${totalRecords}`);
    report.push(`- Errors: ${errors.length}`);

    if (errors.length > 0) {
      report.push("");
      report.push("Errors:");
      errors.forEach((err) => {
        report.push(`  ${err.sheet}: ${err.error}`);
      });
    }

    report.push("");
    report.push("Import Notes:");
    report.push(
      "- Invalid ObjectId values in Excel (numeric IDs, non-hex format) were converted to null",
    );
    report.push(
      "- Reference fields (contact_id, bank_id, transport_id, etc) with null values need manual remapping",
    );
    report.push(
      "- Ensure all Bills have valid contact_id references pointing to imported Contacts",
    );

    // Create report file
    const reportFilename = `backup_import_report_${jobId}.txt`;
    const reportPath = path.join(reportsDir, reportFilename);
    await fs.promises.writeFile(reportPath, report.join("\n"), "utf8");

    // Determine status
    const status = errors.length > 0 ? "completed_with_errors" : "completed";

    const job = {
      id: jobId,
      user_id: String(userId),
      status,
      progress: 100,
      created_at: new Date().toISOString(),
      file: {
        name: safeName,
        size: file.size || 0,
      },
      result: {
        total_collections: totalCollections,
        total_records: totalRecords,
        errors_count: errors.length,
        collection_stats: collectionStats,
      },
      report: {
        filename: reportFilename,
        path: reportPath,
      },
    };

    importJobs.set(jobId, job);
    return job;
  } catch (err) {
    // Clean up file if there was a critical error
    try {
      await fs.promises.unlink(targetPath);
    } catch {
      // ignore
    }

    const job = {
      id: jobId,
      user_id: String(userId),
      status: "failed",
      progress: 0,
      created_at: new Date().toISOString(),
      file: {
        name: safeName,
        size: file.size || 0,
      },
      error: err?.message || String(err),
    };

    importJobs.set(jobId, job);
    throw err;
  }
};

const importData = async (file, userId, isGst = 1) => {
  await ensureDirs();
  const jobId = createId();
  const safeName = sanitizeFilename(file.originalname || "import.xlsx");
  const storedFilename = `${Date.now()}-${safeName}`;
  const targetPath = path.join(importsDir, storedFilename);

  try {
    // Save the file
    if (file.path) {
      await moveFile(file.path, targetPath);
    } else if (file.buffer) {
      await fs.promises.writeFile(targetPath, file.buffer);
    }

    // Parse Excel
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(targetPath);
    const excelRows = await parseExcelRows(workbook);

    if (excelRows.length === 0) {
      throw ApiError.badRequest(
        "No data rows found in Excel file (after header)",
      );
    }

    // Process each row
    const errors = [];
    const report = [
      `Excel Import Report - ${new Date().toISOString()}`,
      `Job ID: ${jobId}`,
      `User: ${String(userId)}`,
      `File: ${safeName}`,
      `Total rows to import: ${excelRows.length}`,
      "",
    ];

    let successCount = 0;
    for (let i = 0; i < excelRows.length; i++) {
      const result = await processItemRow(
        excelRows[i],
        i + 2, // Row number (2 because header is row 1)
        userId,
        errors,
        report,
        isGst,
      );
      if (result.success) successCount++;
    }

    report.push("");
    report.push(`Import Summary:`);
    report.push(
      `- Successfully processed: ${successCount}/${excelRows.length}`,
    );
    report.push(`- Errors: ${errors.length}`);

    if (errors.length > 0) {
      report.push("");
      report.push("Errors:");
      errors.forEach((err) => {
        report.push(`  Row ${err.rowIndex}: ${err.error}`);
      });
    }

    report.push("");
    report.push("Detailed Report:");
    report.push(...report);

    // Create report file
    const reportFilename = `import_report_${jobId}.txt`;
    const reportPath = path.join(reportsDir, reportFilename);
    await fs.promises.writeFile(reportPath, report.join("\n"), "utf8");

    // Determine final status
    const status = errors.length > 0 ? "completed_with_errors" : "completed";

    const job = {
      id: jobId,
      user_id: String(userId),
      status,
      progress: 100,
      created_at: new Date().toISOString(),
      file: {
        name: safeName,
        size: file.size || 0,
      },
      result: {
        total_rows: excelRows.length,
        successful: successCount,
        failed: errors.length,
      },
      report: {
        filename: reportFilename,
        path: reportPath,
      },
    };

    importJobs.set(jobId, job);
    return job;
  } catch (err) {
    // Clean up file if there was a critical error
    try {
      await fs.promises.unlink(targetPath);
    } catch {
      // ignore
    }

    const job = {
      id: jobId,
      user_id: String(userId),
      status: "failed",
      progress: 0,
      created_at: new Date().toISOString(),
      file: {
        name: safeName,
        size: file.size || 0,
      },
      error: err?.message || String(err),
    };

    importJobs.set(jobId, job);
    throw err;
  }
};

const getImportProgress = (jobId, userId) => {
  const job = importJobs.get(jobId);
  if (!job || String(job.user_id) !== String(userId)) return null;
  return job;
};

const getImportReport = (jobId, userId) => {
  const job = importJobs.get(jobId);
  if (!job || String(job.user_id) !== String(userId)) return null;
  return job.report;
};

const generateTemplate = async () => {
  const workbook = buildUniversalImportTemplateWorkbook();
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `universal_import_template_${formatDateStamp()}.xlsx`,
  };
};

const exportData = async (userId) => {
  const db = mongoose.connection?.db;
  if (!db) {
    throw ApiError.internal("Database connection is not available");
  }
  const userObjectId = new mongoose.Types.ObjectId(String(userId));
  const buildMap = async (collectionName, labelField) => {
    const docs = await db
      .collection(collectionName)
      .find({ user_id: userObjectId })
      .project({ [labelField]: 1 })
      .toArray()
      .catch(() => []);
    return new Map(docs.map((doc) => [String(doc._id), doc[labelField] || ""]));
  };
  const [brandNames, departmentNames, hsnCodes] = await Promise.all([
    buildMap("brands", "name"),
    buildMap("departments", "name"),
    buildMap("hsns", "hsn_code"),
  ]);
  const workbook = new ExcelJS.Workbook();

  for (const schema of universalSchemas()) {
    const worksheet = workbook.addWorksheet(schema.sheet);
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.columns = schema.columns.map((key) => ({
      header: key,
      key,
      width: Math.max(12, Math.min(30, key.length + 4)),
    }));

    const documents = await db
      .collection(schema.collectionName)
      .find({ user_id: userObjectId })
      .toArray()
      .catch(() => []);

    for (const document of documents) {
      const row = {};
      for (const key of schema.columns) {
        row[key] = document[key] ?? "";
      }
      if (schema.collectionName === "items") {
        row.brand_name = brandNames.get(String(document.brand_id)) || "";
        row.dept_name = departmentNames.get(String(document.dept_id)) || "";
        row.hsn_code = hsnCodes.get(String(document.hsn_id)) || "";
      }
      worksheet.addRow(row);
    }

    const header = worksheet.getRow(1);
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFECEFF4" },
      };
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    filename: `universal_export_${formatDateStamp()}.xlsx`,
  };
};

const restoreDatabase = async (file, userId) => {
  await ensureDirs();
  const safeName = sanitizeFilename(file.originalname || "restore.sql");
  const storedFilename = `${Date.now()}-${safeName}`;
  const targetPath = path.join(restoresDir, storedFilename);

  if (file.path) {
    await moveFile(file.path, targetPath);
  } else if (file.buffer) {
    await fs.promises.writeFile(targetPath, file.buffer);
  }

  return {
    user_id: String(userId),
    filename: storedFilename,
    original_name: safeName,
    size: file.size || 0,
    stored_at: new Date().toISOString(),
  };
};

const closeFinancialYearNow = async (
  { effective_date, create_backup = true } = {},
  userId,
) => {
  if (
    effective_date !== undefined &&
    effective_date !== null &&
    effective_date !== ""
  ) {
    const parsed = new Date(effective_date);
    if (Number.isNaN(parsed.getTime())) {
      throw ApiError.badRequest("effective_date must be a valid date");
    }
  }

  const shouldCreateBackup =
    create_backup === true || String(create_backup).toLowerCase() === "true";

  if (userId) {
    await financialYearService.assertCanCloseCurrentYear(userId);
  }

  let backup = null;
  let backups = [];
  if (shouldCreateBackup && userId) {
    backups = await backupService.createFinancialYearCloseBackups(userId, {
      notePrefix: "FY close",
    });
    backup = backups[0] || null;
  }

  const closeResult = await financialYearService.closeCurrentYear(userId, {
    backupId:
      backups.length > 0
        ? backups.map((entry) => entry.filename || entry.id).filter(Boolean).join(", ")
        : null,
  });

  return {
    ...closeResult,
    backup:
      backup ?
        {
          id: backup.id,
          filename: backup.filename,
          status: backup.status,
          location: backup.location,
          download_url: backup.download_url,
          download_expires_at: backup.download_expires_at,
        }
      : null,
    backups: backups.map((entry) => ({
      id: entry.id,
      filename: entry.filename,
      status: entry.status,
      location: entry.location,
      download_url: entry.download_url,
      download_expires_at: entry.download_expires_at,
      is_gst: entry.is_gst,
      firm_scope: entry.firm_scope,
    })),
  };
};

// Detect if Excel file is a backup file (multiple collections) vs stock items
const isBackupFile = async (file) => {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(file.path);

    if (workbook.getWorksheet("backup_summary")) {
      return true;
    }

    const universalSheets = new Set(
      universalSheetNames().map((sheetName) => String(sheetName).toLowerCase()),
    );
    if (
      workbook.worksheets.some((worksheet) =>
        universalSheets.has(String(worksheet.name || "").toLowerCase()),
      )
    ) {
      return true;
    }

    const sheetCount = workbook.worksheets.length;

    const backupCollectionNames = universalSheetNames().map((sheetName) =>
      String(sheetName).toLowerCase(),
    );

    // Check sheet names for backup indicators
    const sheetNames = workbook.worksheets.map((s) => s.name.toLowerCase());
    const hasBackupMarkers = sheetNames.some((name) =>
      backupCollectionNames.some((collName) => name.includes(collName)),
    );

    // If many sheets (>3) OR has backup collection names → it's a backup
    return sheetCount > 3 || (sheetCount > 1 && hasBackupMarkers);
  } catch (err) {
    console.error("Error detecting file type:", err.message);
    return false; // Default to stock items if detection fails
  }
};

export default {
  importData,
  importFromBackup,
  isBackupFile,
  getImportProgress,
  getImportReport,
  generateTemplate,
  exportData,
  restoreDatabase,
  closeFinancialYearNow,
};
