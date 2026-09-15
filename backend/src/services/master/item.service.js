import Item from "../../models/master/item.model.js";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import Brand from "../../models/master/brand.model.js";
import Contact from "../../models/master/contact.model.js";
import Department from "../../models/master/department.model.js";
import Hsn from "../../models/master/hsn.model.js";
import Challan from "../../models/transaction/challan.model.js";

import {
  ApiError,
  Pagination,
  toNumber,
  toNumberIfDefined,
} from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";
import {
  generateUniqueBarcode,
  generateUniqueItemId,
  isValidBarcodeFormat,
} from "../../helpers/identifierGenerator.js";
import s3Service from "../common/s3.service.js";
import { emitStockUpdate } from "../realtime/socket.service.js";

const ITEM_POPULATE = [
  { path: "brand_id", select: "name" },
  // { path: "contact_id", select: "name" },
  { path: "dept_id", select: "name" },
  { path: "hsn_id", select: "hsn_code description gst_rate" },
];

const ITEM_EXCEL_COLUMNS = [
  { header: "item_id", key: "item_id", width: 18, aliases: ["Item ID", "item code"] },
  { header: "barcode", key: "barcode", width: 18, aliases: ["Barcode"] },
  { header: "item_name", key: "item_name", width: 32, aliases: ["Item Name", "name"] },
  { header: "alias", key: "alias", width: 24, aliases: ["Alias"] },
  { header: "description", key: "description", width: 36, aliases: ["Description"] },
  { header: "brand_id", key: "brand", width: 24, aliases: ["Brand", "brand", "brand name"] },
  { header: "dept_id", key: "department", width: 24, aliases: ["Department", "dept", "department", "dept_name", "department name"] },
  { header: "hsn_id", key: "hsn_code", width: 16, aliases: ["HSN Code", "hsn_code", "hsn"] },
  { header: "gst_percent", key: "gst_percent", width: 12, aliases: ["GST %", "gst%", "gst percent", "gst rate"] },
  { header: "sale_rate", key: "sale_rate", width: 14, aliases: ["Sale Rate", "sales rate"] },
  { header: "purchase_rate", key: "purchase_rate", width: 16, aliases: ["Purchase Rate"] },
  { header: "mrp_rate", key: "mrp_rate", width: 14, aliases: ["MRP Rate"] },
  { header: "discount", key: "discount", width: 12, aliases: ["Discount"] },
  { header: "stock", key: "stock", width: 12, aliases: ["Stock"] },
  { header: "physical_stock", key: "physical_stock", width: 16, aliases: ["Physical Stock"] },
  { header: "logical_stock", key: "logical_stock", width: 16, aliases: ["Logical Stock"] },
  { header: "opening_physical_stock", key: "opening_physical_stock", width: 24, aliases: ["Opening Physical Stock"] },
  { header: "opening_logical_stock", key: "opening_logical_stock", width: 24, aliases: ["Opening Logical Stock"] },
  { header: "threshold", key: "threshold", width: 12, aliases: ["Threshold"] },
  { header: "is_gst", key: "is_gst", width: 10, aliases: ["GST(0/1)", "gst 0 1", "is gst", "gst"] },
];

class ItemService {
  _normalizeImportHeader(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[%()/_\-.]+/g, " ")
      .replace(/\s+/g, " ");
  }

  _getImportCell(rowValues, headerMap, aliases) {
    for (const alias of aliases) {
      const index = headerMap.get(this._normalizeImportHeader(alias));
      if (index !== undefined) {
        const value = rowValues[index];
        if (value !== undefined && value !== null) {
          return typeof value === "object" && value.text ? value.text : value;
        }
      }
    }
    return "";
  }

  _getItemExcelCell(rowValues, headerMap, key) {
    const column = ITEM_EXCEL_COLUMNS.find((item) => item.key === key);
    if (!column) return "";
    return this._getImportCell(rowValues, headerMap, [
      column.header,
      ...(column.aliases || []),
    ]);
  }

  _isBlankImportRow(rowValues) {
    return rowValues
      .slice(1)
      .every(
        (value) =>
          value === undefined || value === null || String(value).trim() === "",
      );
  }

  _escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeImportText(value) {
    return String(value ?? "").trim();
  }

  async _findExistingImportItem(itemData, userId) {
    const identifierFilters = [];
    const fallbackFilters = [];
    const barcode = this._normalizeImportText(itemData.barcode).toUpperCase();
    const itemId = this._normalizeImportText(itemData.item_id);
    const itemName = this._normalizeImportText(itemData.item_name);
    const alias = this._normalizeImportText(itemData.alias);

    if (barcode) {
      identifierFilters.push({ barcode, user_id: userId });
    }

    if (itemId) {
      const itemIdFilters = [{ item_id: itemId, user_id: userId }];
      if (/^[0-9]+$/.test(itemId)) {
        itemIdFilters.push({ item_id: Number(itemId), user_id: userId });
      }
      identifierFilters.push(...itemIdFilters);
    }

    if (itemName) {
      fallbackFilters.push({
        item_name: {
          $regex: new RegExp(`^${this._escapeRegex(itemName)}$`, "i"),
        },
        user_id: userId,
      });
    }

    if (alias) {
      fallbackFilters.push({
        alias: {
          $regex: new RegExp(`^${this._escapeRegex(alias)}$`, "i"),
        },
        user_id: userId,
      });
    }

    const findUniqueMatch = async (filters) => {
      if (filters.length === 0) return null;
      const matches = await Item.find({ $or: filters })
        .select("_id item_name barcode item_id alias")
        .lean();
      const uniqueMatches = [
        ...new Map(matches.map((item) => [String(item._id), item])).values(),
      ];

      if (uniqueMatches.length > 1) {
        throw ApiError.conflict(
          "Import row matches multiple existing items. Check barcode, item ID, name, and alias.",
        );
      }

      return uniqueMatches[0] || null;
    };

    const identifierMatch = await findUniqueMatch(identifierFilters);
    if (identifierMatch) return identifierMatch;

    return findUniqueMatch(fallbackFilters);
  }

  async _resolveImportBrand(name, userId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return undefined;

    const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await Brand.findOne({
      user_id: userId,
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    }).select("_id");
    if (existing) return existing._id;

    const created = await Brand.create({
      id: await getNextId("Brand", userId),
      name: normalizedName,
      user_id: userId,
    });
    return created._id;
  }

  async _resolveImportDepartment(name, userId) {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) return undefined;

    const escapedName = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await Department.findOne({
      user_id: userId,
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
    }).select("_id");
    if (existing) return existing._id;

    const created = await Department.create({
      id: await getNextId("Department", userId),
      name: normalizedName,
      user_id: userId,
    });
    return created._id;
  }

  async _resolveImportHsn(code, gstPercent, description, userId) {
    const normalizedCode = String(code || "").trim();
    if (!normalizedCode) return undefined;

    const escapedCode = normalizedCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await Hsn.findOne({
      user_id: userId,
      hsn_code: { $regex: new RegExp(`^${escapedCode}$`, "i") },
    }).select("_id");
    if (existing) return existing._id;

    const created = await Hsn.create({
      id: await getNextId("Hsn", userId),
      hsn_code: normalizedCode,
      description: String(description || "").trim(),
      gst_rate: Number(gstPercent) || 0,
      user_id: userId,
    });
    return created._id;
  }

  _toNumber(value, fieldLabel, opts) {
    return toNumber(value, fieldLabel, opts);
  }

  _normalizeItemId(value) {
    const normalized = String(value).trim();

    if (!normalized) throw ApiError.badRequest("Item ID cannot be empty");

    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,62}[A-Za-z0-9]$/.test(normalized)) {
      throw ApiError.badRequest(
        "Item ID must be 3-64 characters and contain only letters, numbers, hyphens, or underscores",
      );
    }

    return normalized;
  }

  _resolveVisibleStock(item, isGst) {
    const openingPhysical =
      typeof item.opening_physical_stock === "number" ?
        item.opening_physical_stock
      : 0;
    const physical =
      typeof item.physical_stock === "number" ? item.physical_stock : 0;
    const totalPhysical =
      typeof item.stock === "number" ? item.stock : openingPhysical + physical;

    const openingLogical =
      typeof item.opening_logical_stock === "number" ?
        item.opening_logical_stock
      : 0;
    const logical =
      typeof item.logical_stock === "number" ? item.logical_stock : 0;
    const totalLogical = openingLogical + logical;

    if (isGst === 0) return totalPhysical + totalLogical;
    return totalPhysical;
  }

  _normalizeStockForResponse(item, isGst) {
    if (!item) return item;

    const normalized =
      typeof item.toObject === "function" ? item.toObject() : { ...item };

    const openingPhysical =
      typeof normalized.opening_physical_stock === "number" ?
        normalized.opening_physical_stock
      : 0;
    const openingLogical =
      typeof normalized.opening_logical_stock === "number" ?
        normalized.opening_logical_stock
      : 0;

    const physical =
      typeof normalized.physical_stock === "number" ? normalized.physical_stock
      : typeof normalized.stock === "number" ?
        Math.max(0, normalized.stock - openingPhysical)
      : 0;

    const logical =
      typeof normalized.logical_stock === "number" ?
        normalized.logical_stock
      : 0;

    normalized.opening_physical_stock = openingPhysical;
    normalized.opening_logical_stock = openingLogical;
    normalized.physical_stock = physical;
    normalized.logical_stock = logical;
    normalized.stock = this._resolveVisibleStock(normalized, isGst);
    normalized.qr_code_value =
      normalized.qr_code_value ||
      (normalized._id ? `MM_ITEM:${normalized._id}` : "");

    if (normalized.image) {
      normalized.image = `/api/v1/items/${normalized._id}/image`;
    }

    return normalized;
  }

  async getItemImageStream(itemId) {
    let item;
    if (mongoose.Types.ObjectId.isValid(itemId)) {
      item = await Item.findById(itemId).select("image").lean();
    } else if (!Number.isNaN(Number(itemId))) {
      item = await Item.findOne({ id: Number(itemId) }).select("image").lean();
    }
    if (!item || !item.image) {
      throw ApiError.notFound("Image not found");
    }
    return s3Service.getFileStream(item.image);
  }

  async getItems(userId, query, isGst) {
    const filter = { user_id: userId };

    if (query.brand_id) {
      if (!mongoose.Types.ObjectId.isValid(query.brand_id)) {
        throw ApiError.badRequest("Invalid brand_id");
      }
      filter.brand_id = query.brand_id;
    }

    if (query.dept_id) {
      if (!mongoose.Types.ObjectId.isValid(query.dept_id)) {
        throw ApiError.badRequest("Invalid dept_id");
      }
      filter.dept_id = query.dept_id;
    }

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { item_name: { $regex: escaped, $options: "i" } },
        { item_id: { $regex: escaped, $options: "i" } },
        { barcode: { $regex: escaped, $options: "i" } },
        { alias: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    const result = await Pagination.paginate(Item, filter, {
      ...query,
      populate: ITEM_POPULATE,
      sort: { createdAt: -1 },
    });

    result.data = result.data.map((item) =>
      this._normalizeStockForResponse(item, isGst),
    );

    return result;
  }

  async getItemById(itemId, userId, isGst) {
    const item = await Item.findOne({ _id: itemId, user_id: userId })
      .populate(ITEM_POPULATE)
      .lean();
    if (!item) {
      throw ApiError.notFound("Item not found");
    }

    return this._normalizeStockForResponse(item, isGst);
  }

  async createItem(itemData, userId, file = null, isGst) {
    const {
      item_name,
      barcode,
      item_id,
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
      threshold,
      is_gst,
      brand_id,
      contact_id,
      dept_id,
      hsn_id,
    } = itemData;

    if (!item_name || typeof item_name !== "string" || !item_name.trim()) {
      throw ApiError.badRequest("Item name is required");
    }
    if (sale_rate === undefined || sale_rate === null) {
      throw ApiError.badRequest("Sale rate is required");
    }
    const parsedSaleRate = toNumber(sale_rate, "Sale rate");

    let finalBarcode;
    if (barcode !== undefined && barcode !== null && barcode !== "") {
      if (!isValidBarcodeFormat(barcode)) {
        throw ApiError.badRequest(
          "Barcode must be 3-64 characters and contain only letters, numbers, hyphens, or underscores",
        );
      }
      const barcodeExists = await Item.exists({
        barcode: barcode.toUpperCase(),
        user_id: userId,
      });
      if (barcodeExists) {
        throw ApiError.conflict(
          `Barcode '${barcode}' is already in use by another item`,
        );
      }
      finalBarcode = barcode.toUpperCase();
    } else {
      finalBarcode = await generateUniqueBarcode(userId);
    }

    let finalItemId;
    if (item_id !== undefined && item_id !== null && item_id !== "") {
      const normalizedItemId = this._normalizeItemId(item_id);
      const itemIdChecks = [{ item_id: normalizedItemId, user_id: userId }];
      if (/^[0-9]+$/.test(normalizedItemId)) {
        itemIdChecks.push({
          item_id: Number(normalizedItemId),
          user_id: userId,
        });
      }
      const itemIdExists = await Item.exists({ $or: itemIdChecks });
      if (itemIdExists) {
        throw ApiError.conflict(
          `Item ID '${normalizedItemId}' is already in use by another item`,
        );
      }
      finalItemId = normalizedItemId;
    } else {
      finalItemId = String(await generateUniqueItemId(userId));
    }

    const parsedPurchaseRate = toNumberIfDefined(
      purchase_rate,
      "Purchase rate",
    );
    const parsedMrpRate = toNumberIfDefined(mrp_rate, "MRP rate");
    const normalizedIsGst =
      is_gst === undefined || is_gst === null || is_gst === "" ?
        isGst === 0 ? 0 : 1
      : Number(is_gst) === 1 ? 1
      : 0;
    const parsedGstPercent =
      gst_percent === undefined || gst_percent === null || gst_percent === "" ?
        undefined
      : toNumber(gst_percent, "GST percent", {
          min: 0,
          max: 100,
        });
    const parsedDiscount = toNumberIfDefined(discount, "Discount", {
      min: 0,
      max: 100,
    });

    const finalPhysicalStock =
      physical_stock !== undefined ?
        toNumber(physical_stock, "Physical stock", { allowNegative: true })
      : stock !== undefined ?
        toNumber(stock, "Stock", { allowNegative: true })
      : 0;

    const finalLogicalStock =
      logical_stock !== undefined ?
        toNumber(logical_stock, "Logical stock", { allowNegative: true })
      : 0;
    const finalOpeningPhysicalStock =
      opening_physical_stock !== undefined ?
        toNumber(opening_physical_stock, "Opening physical stock", {
          allowNegative: true,
        })
      : 0;
    const finalOpeningLogicalStock =
      opening_logical_stock !== undefined ?
        toNumber(opening_logical_stock, "Opening logical stock", {
          allowNegative: true,
        })
      : 0;

    const parsedThreshold = toNumberIfDefined(threshold, "Threshold");

    const escapedName = item_name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await Item.findOne({
      item_name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.conflict("Item with this name already exists");
    }

    if (brand_id) {
      const brandExists = await Brand.exists({
        _id: brand_id,
        user_id: userId,
      });
      if (!brandExists) {
        throw ApiError.badRequest(
          "Brand not found. Please select a valid brand.",
        );
      }
    }
    if (contact_id) {
      const contactExists = await Contact.exists({
        _id: contact_id,
        user_id: userId,
      });
      if (!contactExists) {
        throw ApiError.badRequest(
          "Contact not found. Please select a valid contact.",
        );
      }
    }
    if (dept_id) {
      const deptExists = await Department.exists({
        _id: dept_id,
        user_id: userId,
      });
      if (!deptExists) {
        throw ApiError.badRequest(
          "Department not found. Please select a valid department.",
        );
      }
    }

    const normalizedHsnId =
      hsn_id !== undefined && hsn_id !== null && hsn_id !== "" ? hsn_id : null;

    if (normalizedHsnId) {
      const hsnExists = await Hsn.exists({
        _id: normalizedHsnId,
        user_id: userId,
      });
      if (!hsnExists) {
        throw ApiError.badRequest("HSN not found. Please select a valid HSN.");
      }

      if (parsedGstPercent === undefined) {
        throw ApiError.badRequest(
          "GST percentage is required when adding charges code (HSN)",
        );
      }
    }

    if (normalizedIsGst === 1 && parsedGstPercent === undefined) {
      throw ApiError.badRequest("GST percentage is required for GST item");
    }

    let normalizedAlias;
    if (alias !== undefined) {
      if (alias !== null && typeof alias !== "string") {
        throw ApiError.badRequest("Alias must be a string");
      }
      normalizedAlias = alias?.trim() || undefined;
    }

    let normalizedDescription;
    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        throw ApiError.badRequest("Description must be a string");
      }
      normalizedDescription = description?.trim() || undefined;
    }

    let imageUrl = null;

    if (file) {
      imageUrl = await s3Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        "items",
      );
    }

    const nextId = await getNextId("Item", userId);

    const item = await Item.create({
      id: nextId,
      item_name: item_name.trim(),
      barcode: finalBarcode,
      item_id: finalItemId,
      ...(normalizedAlias !== undefined ? { alias: normalizedAlias } : {}),
      ...(normalizedDescription !== undefined ?
        { description: normalizedDescription }
      : {}),
      sale_rate: parsedSaleRate,
      purchase_rate: parsedPurchaseRate,
      mrp_rate: parsedMrpRate,
      gst_percent: parsedGstPercent,
      discount: parsedDiscount,
      stock: finalOpeningPhysicalStock + finalPhysicalStock,
      physical_stock: finalPhysicalStock,
      logical_stock: finalLogicalStock,
      opening_physical_stock: finalOpeningPhysicalStock,
      opening_logical_stock: finalOpeningLogicalStock,
      threshold: parsedThreshold,
      is_gst: normalizedIsGst,
      brand_id,
      contact_id,
      dept_id,
      ...(normalizedHsnId ? { hsn_id: normalizedHsnId } : {}),
      image: imageUrl,
      user_id: userId,
    });
    emitStockUpdate(userId, item);

    if (brand_id) {
      await Brand.findByIdAndUpdate(brand_id, {
        $addToSet: { item_ids: item._id },
      });
    }

    await item.populate(ITEM_POPULATE);
    return this._normalizeStockForResponse(item, isGst);
  }

  async updateItem(itemId, userId, updateData, file = null, isGst) {
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw ApiError.badRequest(`Invalid item id: ${itemId}`);
    }

    const item = await Item.findOne({ _id: itemId, user_id: userId });
    if (!item) {
      throw ApiError.notFound("Item not found");
    }

    const {
      item_name,
      barcode,
      item_id,
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
      threshold,
      is_gst,
      brand_id,
      contact_id,
      dept_id,
      hsn_id,
    } = updateData;

    if (item_name !== undefined) {
      if (typeof item_name !== "string" || !item_name.trim()) {
        throw ApiError.badRequest("Item name cannot be empty");
      }

      const escapedName = item_name
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await Item.findOne({
        item_name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        user_id: userId,
        _id: { $ne: itemId },
      });
      if (duplicate) {
        throw ApiError.conflict("Another item with this name already exists");
      }
    }

    if (barcode !== undefined && barcode !== null && barcode !== "") {
      if (!isValidBarcodeFormat(barcode)) {
        throw ApiError.badRequest(
          "Barcode must be 3-64 characters and contain only letters, numbers, hyphens, or underscores",
        );
      }
      const barcodeExists = await Item.exists({
        barcode: barcode.toUpperCase(),
        user_id: userId,
        _id: { $ne: itemId },
      });

      if (barcodeExists) {
        throw ApiError.conflict(
          `Barcode '${barcode}' is already in use by another item`,
        );
      }
    }

    if (item_id !== undefined && item_id !== null && item_id !== "") {
      const normalizedItemId = this._normalizeItemId(item_id);
      const itemIdChecks = [
        { item_id: normalizedItemId, user_id: userId, _id: { $ne: itemId } },
      ];
      if (/^[0-9]+$/.test(normalizedItemId)) {
        itemIdChecks.push({
          item_id: Number(normalizedItemId),
          user_id: userId,
          _id: { $ne: itemId },
        });
      }
      const itemIdExists = await Item.exists({ $or: itemIdChecks });
      if (itemIdExists) {
        throw ApiError.conflict(
          `Item ID '${normalizedItemId}' is already in use by another item`,
        );
      }
    }
    const parsedSaleRate = toNumberIfDefined(sale_rate, "Sale rate");
    const parsedPurchaseRate = toNumberIfDefined(
      purchase_rate,
      "Purchase rate",
    );
    const parsedMrpRate = toNumberIfDefined(mrp_rate, "MRP rate");
    const parsedGstPercent =
      gst_percent === undefined || gst_percent === null || gst_percent === "" ?
        undefined
      : toNumber(gst_percent, "GST percent", {
          min: 0,
          max: 100,
        });
    const parsedDiscount = toNumberIfDefined(discount, "Discount", {
      min: 0,
      max: 100,
    });

    const parsedThreshold = toNumberIfDefined(threshold, "Threshold");

    if (brand_id !== undefined && brand_id !== null) {
      const brandExists = await Brand.exists({
        _id: brand_id,
        user_id: userId,
      });
      if (!brandExists) {
        throw ApiError.badRequest(
          "Brand not found. Please select a valid brand.",
        );
      }
    }
    if (contact_id !== undefined && contact_id !== null) {
      const contactExists = await Contact.exists({
        _id: contact_id,
        user_id: userId,
      });
      if (!contactExists) {
        throw ApiError.badRequest(
          "Contact not found. Please select a valid contact.",
        );
      }
    }
    if (dept_id !== undefined && dept_id !== null) {
      const deptExists = await Department.exists({
        _id: dept_id,
        user_id: userId,
      });

      if (!deptExists) {
        throw ApiError.badRequest(
          "Department not found. Please select a valid department.",
        );
      }
    }

    const normalizedHsnId = hsn_id === "" || hsn_id === null ? null : hsn_id;
    if (hsn_id !== undefined && normalizedHsnId !== null) {
      const hsnExists = await Hsn.exists({
        _id: normalizedHsnId,
        user_id: userId,
      });
      if (!hsnExists) {
        throw ApiError.badRequest("HSN not found. Please select a valid HSN.");
      }

      const effectiveGstPercent =
        parsedGstPercent !== undefined ? parsedGstPercent : item.gst_percent;
      if (
        effectiveGstPercent === undefined ||
        effectiveGstPercent === null ||
        effectiveGstPercent === ""
      ) {
        throw ApiError.badRequest(
          "GST percentage is required when adding charges code (HSN)",
        );
      }
    }

    const normalizedIsGst =
      is_gst !== undefined ?
        Number(is_gst) === 1 ?
          1
        : 0
      : item.is_gst;
    if (
      normalizedIsGst === 1 &&
      parsedGstPercent === undefined &&
      (item.gst_percent === undefined || item.gst_percent === null)
    ) {
      throw ApiError.badRequest("GST percentage is required for GST item");
    }

    const fields = {};
    if (item_name !== undefined) fields.item_name = item_name.trim();
    if (barcode !== undefined && barcode !== null && barcode !== "") {
      fields.barcode = barcode.toUpperCase();
    }
    if (item_id !== undefined && item_id !== null && item_id !== "") {
      fields.item_id = this._normalizeItemId(item_id);
    }
    if (sale_rate !== undefined) fields.sale_rate = parsedSaleRate;
    if (purchase_rate !== undefined) fields.purchase_rate = parsedPurchaseRate;
    if (mrp_rate !== undefined) fields.mrp_rate = parsedMrpRate;
    if (gst_percent !== undefined) fields.gst_percent = parsedGstPercent;
    if (discount !== undefined) fields.discount = parsedDiscount;

    if (physical_stock !== undefined) {
      fields.physical_stock = toNumber(physical_stock, "Physical stock", {
        allowNegative: true,
      });
    }

    if (opening_physical_stock !== undefined) {
      fields.opening_physical_stock = toNumber(
        opening_physical_stock,
        "Opening physical stock",
        { allowNegative: true },
      );
    }

    if (logical_stock !== undefined) {
      fields.logical_stock = toNumber(logical_stock, "Logical stock", {
        allowNegative: true,
      });
    }

    if (opening_logical_stock !== undefined) {
      fields.opening_logical_stock = toNumber(
        opening_logical_stock,
        "Opening logical stock",
        {
          allowNegative: true,
        },
      );
    }

    if (stock !== undefined) {
      const numericStock = toNumber(stock, "Stock", { allowNegative: true });
      const nextOpeningPhysical =
        fields.opening_physical_stock !== undefined ?
          fields.opening_physical_stock
        : Number(item.opening_physical_stock || 0);
      const recalculatedPhysical = numericStock - nextOpeningPhysical;

      fields.physical_stock = recalculatedPhysical;
      fields.stock = numericStock;
    } else if (
      fields.physical_stock !== undefined ||
      fields.opening_physical_stock !== undefined
    ) {
      const nextOpeningPhysical =
        fields.opening_physical_stock !== undefined ?
          fields.opening_physical_stock
        : Number(item.opening_physical_stock || 0);
      const nextPhysical =
        fields.physical_stock !== undefined ?
          fields.physical_stock
        : Number(item.physical_stock ?? item.stock ?? 0);
      fields.stock = nextOpeningPhysical + nextPhysical;
    }

    if (threshold !== undefined) fields.threshold = parsedThreshold;
    if (is_gst !== undefined) fields.is_gst = normalizedIsGst;
    if (brand_id !== undefined) fields.brand_id = brand_id;
    if (contact_id !== undefined) fields.contact_id = contact_id;
    if (dept_id !== undefined) fields.dept_id = dept_id;
    if (hsn_id !== undefined) fields.hsn_id = normalizedHsnId;

    if (alias !== undefined) {
      if (alias !== null && typeof alias !== "string") {
        throw ApiError.badRequest("Alias must be a string");
      }
      fields.alias = alias === null ? null : alias.trim() || null;
    }

    if (description !== undefined) {
      if (description !== null && typeof description !== "string") {
        throw ApiError.badRequest("Description must be a string");
      }
      fields.description =
        description === null ? null : description.trim() || null;
    }

    if (brand_id !== undefined) {
      const oldBrandId = item.brand_id ? String(item.brand_id) : null;
      const newBrandId = brand_id ? String(brand_id) : null;

      if (oldBrandId !== newBrandId) {
        if (oldBrandId) {
          await Brand.findByIdAndUpdate(oldBrandId, {
            $pull: { item_ids: item._id },
          });
        }
        if (newBrandId) {
          await Brand.findByIdAndUpdate(newBrandId, {
            $addToSet: { item_ids: item._id },
          });
        }
      }
    }

    if (file) {
      if (item.image) {
        await s3Service.deleteFile(item.image);
      }
      fields.image = await s3Service.uploadFile(
        file.buffer,
        file.originalname,
        file.mimetype,
        "items",
      );
    }

    const updatedItem = await Item.findByIdAndUpdate(itemId, fields, {
      returnDocument: "after",
    })
      .populate(ITEM_POPULATE)
      .lean();

    emitStockUpdate(userId, updatedItem);
    return this._normalizeStockForResponse(updatedItem, isGst);
  }

  async deleteItem(itemId, userId) {
    const item = await Item.findOne({ _id: itemId, user_id: userId });
    if (!item) {
      throw ApiError.notFound("Item not found");
    }

    const challanCount = await Challan.countDocuments({
      "items.item_id": itemId,
      user_id: userId,
    });
    if (challanCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete item used in ${challanCount} challan(s). Remove all related challans/bills first.`,
      );
    }

    if (item.image) {
      await s3Service.deleteFile(item.image);
    }

    if (item.brand_id) {
      await Brand.findByIdAndUpdate(item.brand_id, {
        $pull: { item_ids: item._id },
      });
    }

    await Item.findByIdAndDelete(itemId);
  }

  async updateStock(itemId, userId, stockData, isGst) {
    const item = await Item.findOne({ _id: itemId, user_id: userId });
    if (!item) {
      throw ApiError.notFound("Item not found");
    }

    if (stockData.opening_physical_stock !== undefined) {
      item.opening_physical_stock = toNumber(
        stockData.opening_physical_stock,
        "Opening physical stock",
        { allowNegative: true },
      );
    }

    if (stockData.opening_logical_stock !== undefined) {
      item.opening_logical_stock = toNumber(
        stockData.opening_logical_stock,
        "Opening logical stock",
        { allowNegative: true },
      );
    }

    if (stockData.physical_stock !== undefined) {
      const physical = toNumber(stockData.physical_stock, "Physical stock", {
        allowNegative: true,
      });
      item.physical_stock = physical;
    }

    if (stockData.logical_stock !== undefined) {
      item.logical_stock = toNumber(stockData.logical_stock, "Logical stock", {
        allowNegative: true,
      });
    }

    if (stockData.stock !== undefined) {
      const numericStock = toNumber(stockData.stock, "Stock", {
        allowNegative: true,
      });
      if (isGst === 0) {
        const openingPhysical = Number(item.opening_physical_stock || 0);
        const openingLogical = Number(item.opening_logical_stock || 0);
        const normalPhysical =
          typeof item.physical_stock === "number" ? item.physical_stock : 0;
        const physicalTotal = openingPhysical + normalPhysical;
        item.logical_stock = numericStock - physicalTotal - openingLogical;
      } else {
        const openingPhysical = Number(item.opening_physical_stock || 0);
        const recalculatedPhysical = numericStock - openingPhysical;
        item.physical_stock = recalculatedPhysical;
        item.stock = numericStock;
      }
    }

    if (stockData.stock === undefined) {
      const openingPhysical = Number(item.opening_physical_stock || 0);
      const normalPhysical =
        typeof item.physical_stock === "number" ? item.physical_stock : 0;
      item.stock = openingPhysical + normalPhysical;
    }

    await item.save();
    emitStockUpdate(userId, item);
    return this._normalizeStockForResponse(item, isGst);
  }

  async importItems(file, userId, isGst) {
    if (!file?.buffer) {
      throw ApiError.badRequest("Excel file is required");
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];

    if (!worksheet) {
      throw ApiError.badRequest("Excel file has no worksheet");
    }

    const headerRow = worksheet.getRow(1).values;
    const headerMap = new Map();
    headerRow.forEach((value, index) => {
      const key = this._normalizeImportHeader(value);
      if (key) headerMap.set(key, index);
    });

    const results = [];
    const errors = [];
    const importRows = [];

    for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const rowValues = worksheet.getRow(rowNumber).values;
      if (this._isBlankImportRow(rowValues)) continue;

      importRows.push({ rowNumber, rowValues });
    }

    if (importRows.length === 0) {
      throw ApiError.badRequest("Excel file has no item rows to import");
    }

    for (const { rowNumber, rowValues } of importRows) {
      try {
        const gstPercent = this._getItemExcelCell(
          rowValues,
          headerMap,
          "gst_percent",
        );
        const description = this._getItemExcelCell(
          rowValues,
          headerMap,
          "description",
        );
        const brandId = await this._resolveImportBrand(
          this._getItemExcelCell(rowValues, headerMap, "brand"),
          userId,
        );
        const departmentId = await this._resolveImportDepartment(
          this._getItemExcelCell(rowValues, headerMap, "department"),
          userId,
        );
        const hsnId = await this._resolveImportHsn(
          this._getItemExcelCell(rowValues, headerMap, "hsn_code"),
          gstPercent,
          description,
          userId,
        );

        const importIsGst = this._getItemExcelCell(
          rowValues,
          headerMap,
          "is_gst",
        );

        const itemData = {
          item_name: this._getItemExcelCell(rowValues, headerMap, "item_name"),
          alias: this._getItemExcelCell(rowValues, headerMap, "alias"),
          item_id: this._getItemExcelCell(rowValues, headerMap, "item_id"),
          barcode: this._getItemExcelCell(rowValues, headerMap, "barcode"),
          stock: this._getItemExcelCell(rowValues, headerMap, "stock"),
          physical_stock: this._getItemExcelCell(rowValues, headerMap, "physical_stock"),
          logical_stock: this._getItemExcelCell(rowValues, headerMap, "logical_stock"),
          opening_physical_stock: this._getItemExcelCell(rowValues, headerMap, "opening_physical_stock"),
          opening_logical_stock: this._getItemExcelCell(rowValues, headerMap, "opening_logical_stock"),
          brand_id: brandId,
          dept_id: departmentId,
          hsn_id: hsnId,
          description,
          gst_percent: gstPercent === "" ? 0 : gstPercent,
          sale_rate: this._getItemExcelCell(rowValues, headerMap, "sale_rate"),
          purchase_rate: this._getItemExcelCell(
            rowValues,
            headerMap,
            "purchase_rate",
          ),
          mrp_rate: this._getItemExcelCell(rowValues, headerMap, "mrp_rate"),
          discount: this._getItemExcelCell(rowValues, headerMap, "discount"),
          threshold: this._getItemExcelCell(rowValues, headerMap, "threshold"),
          is_gst: importIsGst === "" ? (isGst === 0 ? 0 : 1) : importIsGst,
        };

        const existingItem = await this._findExistingImportItem(itemData, userId);
        const savedItem =
          existingItem ?
            await this.updateItem(existingItem._id, userId, itemData, null, isGst)
          : await this.createItem(itemData, userId, null, isGst);

        results.push({
          row: rowNumber,
          action: existingItem ? "updated" : "created",
          item_id: savedItem.item_id,
          item_name: savedItem.item_name,
        });
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: error.message || "Import failed",
        });
      }
    }

    return {
      totalRows: results.length + errors.length,
      totalImported: results.length,
      totalCreated: results.filter((item) => item.action === "created").length,
      totalUpdated: results.filter((item) => item.action === "updated").length,
      totalFailed: errors.length,
      results,
      errors,
    };
  }

  async exportItems(userId, query = {}, isGst) {
    const result = await this.getItems(
      userId,
      { ...query, page: 1, limit: 100000 },
      isGst,
    );
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Items");

    worksheet.columns = ITEM_EXCEL_COLUMNS.map(
      ({ header, key, width }) => ({ header, key, width }),
    );

    for (const item of result.data || []) {
      worksheet.addRow({
        item_id: item.item_id || "",
        barcode: item.barcode || "",
        item_name: item.item_name || "",
        alias: item.alias || "",
        description: item.description || "",
        brand: item.brand_id?.name || "",
        department: item.dept_id?.name || "",
        hsn_code: item.hsn_id?.hsn_code || "",
        gst_percent: item.gst_percent ?? 0,
        sale_rate: item.sale_rate ?? 0,
        purchase_rate: item.purchase_rate ?? 0,
        mrp_rate: item.mrp_rate ?? 0,
        discount: item.discount ?? 0,
        stock: item.stock ?? 0,
        physical_stock: item.physical_stock ?? 0,
        logical_stock: item.logical_stock ?? 0,
        opening_physical_stock: item.opening_physical_stock ?? 0,
        opening_logical_stock: item.opening_logical_stock ?? 0,
        threshold: item.threshold ?? 0,
        is_gst: item.is_gst ?? 1,
      });
    }

    worksheet.getRow(1).font = { bold: true };
    worksheet.views = [{ state: "frozen", ySplit: 1 }];

    return workbook.xlsx.writeBuffer();
  }

  async getLowStockItems(userId, query = {}, isGst) {
    const { page, limit, skip } = Pagination.getParams(query);

    const baseMatch = {
      user_id: userId,
    };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      baseMatch.$or = [
        { item_name: { $regex: escaped, $options: "i" } },
        { item_id: { $regex: escaped, $options: "i" } },
        { barcode: { $regex: escaped, $options: "i" } },
        { alias: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    if (isGst === 0) {
      const [aggResult] = await Item.aggregate([
        { $match: baseMatch },
        {
          $addFields: {
            _physical_total: {
              $ifNull: [
                "$stock",
                {
                  $add: [
                    { $ifNull: ["$opening_physical_stock", 0] },
                    { $ifNull: ["$physical_stock", 0] },
                  ],
                },
              ],
            },
            _logical_total: {
              $add: [
                { $ifNull: ["$opening_logical_stock", 0] },
                { $ifNull: ["$logical_stock", 0] },
              ],
            },
          },
        },
        {
          $addFields: {
            visible_stock: { $add: ["$_physical_total", "$_logical_total"] },
          },
        },
        {
          $match: {
            $expr: {
              $or: [
                { $lte: ["$visible_stock", 0] },
                {
                  $and: [
                    { $gt: ["$threshold", 0] },
                    { $lte: ["$visible_stock", "$threshold"] },
                  ],
                },
              ],
            },
          },
        },
        { $sort: { visible_stock: 1, createdAt: -1 } },
        {
          $facet: {
            data: [{ $skip: skip }, { $limit: limit }],
            meta: [{ $count: "total" }],
          },
        },
      ]);

      const total = aggResult?.meta?.[0]?.total || 0;
      const data = (aggResult?.data || []).map((item) =>
        this._normalizeStockForResponse(item, isGst),
      );

      return {
        data,
        meta: Pagination.createMeta(total, page, limit),
      };
    }

    const filter = {
      user_id: userId,
      $expr: {
        $or: [
          {
            $lte: [
              {
                $ifNull: [
                  "$stock",
                  {
                    $add: [
                      { $ifNull: ["$opening_physical_stock", 0] },
                      { $ifNull: ["$physical_stock", 0] },
                    ],
                  },
                ],
              },
              0,
            ],
          },
          {
            $and: [
              { $gt: ["$threshold", 0] },
              {
                $lte: [
                  {
                    $ifNull: [
                      "$stock",
                      {
                        $add: [
                          { $ifNull: ["$opening_physical_stock", 0] },
                          { $ifNull: ["$physical_stock", 0] },
                        ],
                      },
                    ],
                  },
                  "$threshold",
                ],
              },
            ],
          },
        ],
      },
    };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { item_name: { $regex: escaped, $options: "i" } },
        { item_id: { $regex: escaped, $options: "i" } },
        { barcode: { $regex: escaped, $options: "i" } },
        { alias: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    const result = await Pagination.paginate(Item, filter, {
      ...query,
      sort: { physical_stock: 1, createdAt: -1 },
    });

    result.data = result.data.map((item) =>
      this._normalizeStockForResponse(item, isGst),
    );
    return result;
  }

  async batchUpdateItems(updates, userId, isGst) {
    if (!Array.isArray(updates) || updates.length === 0) {
      throw ApiError.badRequest("Updates must be a non-empty array");
    }
    if (updates.length > 500) {
      throw ApiError.badRequest("Cannot update more than 500 items at once");
    }

    const results = [];
    const errors = [];

    for (const entry of updates) {
      const { id, changes } = entry;
      if (!id || !changes || typeof changes !== "object") {
        errors.push({
          id,
          error: "Invalid entry: id and changes are required",
        });
        continue;
      }

      try {
        const updated = await this.updateItem(id, userId, changes, null, isGst);
        results.push({ id, success: true, data: updated });
      } catch (err) {
        errors.push({
          id,
          success: false,
          error: err.message || "Update failed",
          statusCode: err.statusCode || 500,
        });
      }
    }

    return {
      results,
      errors,
      totalUpdated: results.length,
      totalFailed: errors.length,
    };
  }

  async checkBarcodeUnique(barcode) {
    if (!barcode || typeof barcode !== "string" || !barcode.trim()) {
      throw ApiError.badRequest("barcode is required");
    }
    const trimmed = barcode.trim().toUpperCase();
    const exists = await Item.exists({ barcode: trimmed });
    return { barcode: trimmed, is_unique: !exists };
  }
}

export default new ItemService();


