import ApiError from "../../utils/ApiError.js";
import Item from "../../models/master/item.model.js";
import Hsn from "../../models/master/hsn.model.js";
import sharp from "sharp";
import { getNextId } from "../../helpers/counter.js";
import {
  generateUniqueBarcode,
  generateUniqueItemId,
  isValidBarcodeFormat,
} from "../../helpers/identifierGenerator.js";

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";
const GEMINI_API_URL = `${GEMINI_BASE_URL}/v1beta`;
const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_IMAGES_PER_BILL = 8;
const GEMINI_TIMEOUT_MS = 400000;
const OPTIMIZED_IMAGE_MAX_DIMENSION = 1800;
const OPTIMIZED_IMAGE_QUALITY = 82;
const PDF_MIME_TYPE = "application/pdf";

const ITEM_SCAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          item_id: { type: "STRING" },
          item_name: { type: "STRING" },
          alias: { type: "STRING" },
          description: { type: "STRING" },
          barcode: { type: "STRING" },
          item_code: { type: "STRING" },
          source_item_name: { type: "STRING" },
          source_barcode: { type: "STRING" },
          source_item_code: { type: "STRING" },
          brand_name: { type: "STRING" },
          department_name: { type: "STRING" },
          hsn_code: { type: "STRING" },
          quantity: { type: "NUMBER" },
          rate: { type: "NUMBER" },
          sale_rate: { type: "NUMBER" },
          purchase_rate: { type: "NUMBER" },
          mrp_rate: { type: "NUMBER" },
          discount: { type: "NUMBER" },
          special_discount: { type: "NUMBER" },
          item_discount: { type: "NUMBER" },
          item_dis2: { type: "NUMBER" },
          dis3: { type: "NUMBER" },
          gross_amount: { type: "NUMBER" },
          discount_amount: { type: "NUMBER" },
          total_discount: { type: "NUMBER" },
          taxable_amount: { type: "NUMBER" },
          gst_percent: { type: "NUMBER" },
          gst_amount: { type: "NUMBER" },
          amount: { type: "NUMBER" },
          is_gst: { type: "NUMBER" },
          threshold: { type: "NUMBER" },
        },
      },
    },
    confidence: { type: "NUMBER" },
    warnings: {
      type: "ARRAY",
      items: { type: "STRING" },
    },
  },
};

class BillScanService {
  _getApiKey() {
    const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
    if (!apiKey) throw ApiError.badRequest("Gemini API key is not configured");
    return apiKey;
  }

  _getModel() {
    return String(process.env.GEMINI_MODEL || DEFAULT_MODEL)
      .trim()
      .replace(/^models\//, "");
  }

  _escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _normalizeText(value) {
    return String(value || "").trim();
  }

  _normalizeDigits(value) {
    return String(value || "").replace(/\D/g, "");
  }

  _toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  _normalizeDate(value) {
    const raw = this._normalizeText(value);
    if (!raw) return "";

    const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (iso) {
      return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
    }

    const indian = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
    if (indian) {
      const year =
        indian[3].length === 2 ? `20${indian[3]}` : indian[3].padStart(4, "0");
      return `${year}-${indian[2].padStart(2, "0")}-${indian[1].padStart(2, "0")}`;
    }

    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  _buildPrompt(isGst) {
    return [
      "You are an OCR extraction engine.",
      "You are NOT an accounting system.",
      "You are NOT allowed to infer, estimate, calculate, normalize, summarize, merge, split, or create data.",
      "",
      "Your job is ONLY:",
      "1. Read visible invoice text from images or PDF pages.",
      "2. Read visible invoice tables from images or PDF pages.",
      "3. Copy values exactly.",
      "4. Map visible values into the response schema.",
      "",
      "Return ONLY valid JSON matching the response schema.",
      "Do not return markdown.",
      "Do not return explanations.",
      "Do not return comments.",
      "Do not return text outside JSON.",
      "",
      "STRICT EXTRACTION RULES",
      "",
      "Do not invent values.",
      "Do not infer values.",
      "Do not estimate values.",
      "Do not calculate values.",
      "Do not generate missing values.",
      "Do not guess values.",
      "",
      "If a value is not visible:",
      "- text fields = empty string",
      "- numeric fields = 0",
      "",
      "MULTI PAGE RULES",
      "",
      "All uploaded files belong to the SAME invoice.",
      "Item tables may continue across pages.",
      "Do not restart numbering on new pages.",
      "Do not duplicate rows between pages.",
      "Do not duplicate rows from previous pages.",
      "",
      "ROW EXTRACTION RULES",
      "",
      "If a Serial Number (S.N., Sr No, Item No) column exists:",
      "- Use it as the source of truth.",
      "- Every visible serial number represents exactly one item.",
      "- Create exactly one item per visible serial number.",
      "- Never create extra rows.",
      "- Never duplicate rows.",
      "- Never split rows.",
      "- Never merge rows.",
      "",
      "The number of returned items must equal the number of visible item rows.",
      "",
      "TEXT EXTRACTION RULES",
      "",
      "source_item_name must contain the item description EXACTLY as printed.",
      "Preserve original spelling.",
      "Preserve original abbreviations.",
      "Preserve original punctuation.",
      "Preserve original casing when possible.",
      "",
      "Do not rewrite item names.",
      "Do not simplify item names.",
      "Do not normalize item names.",
      "Do not remove codes from item names.",
      "",
      "FIELD MAPPING RULES",
      "",
      "Map ONLY from visible columns.",
      "",
      "quantity = Qty column",
      "hsn_code = HSN column",
      "gst_percent = GST % column",
      "amount = Amount column",
      "",
      "IMPORTANT RATE MAPPING",
      "",
      "If invoice contains columns:",
      "MRP | Discount | Price | Amount",
      "",
      "Then:",
      "mrp_rate = MRP column",
      "discount = Discount % column",
      "sale_rate = Price column",
      "rate = MRP column",
      "amount = Amount column",
      "",
      "Do NOT use Price as rate.",
      "Do NOT calculate MRP from Price.",
      "Do NOT calculate Price from MRP.",
      "",
      "IMPORTANT AMOUNT RULES",
      "",
      "Copy Amount exactly from the invoice.",
      "Never recalculate Amount.",
      "Never derive Amount from Qty.",
      "Never derive Amount from Rate.",
      "Never derive Amount from GST.",
      "",
      "GST RULES",
      "",
      "gst_percent = printed GST percentage.",
      "gst_amount = printed GST amount if visible.",
      "",
      "Do not calculate GST.",
      "",
      "DISCOUNT RULES",
      "",
      "discount = Dis %",
      "special_discount = SP Dis %",
      "item_discount = Item Disc %",
      "item_dis2 = Item Disc2 %",
      "dis3 = flat discount amount",
      "",
      "If a discount column is not visible use 0.",
      "",
      "DO NOT EXTRACT",
      "",
      "- Invoice number",
      "- Invoice date",
      "- Party details",
      "- Supplier details",
      "- Customer details",
      "- GST summary tables",
      "- Tax summary tables",
      "- Totals",
      "- Grand totals",
      "- Transport details",
      "- Vehicle details",
      "- Bank details",
      "- QR codes",
      "- Signatures",
      "- Terms and conditions",
      "",
      "OUTPUT QUALITY PRIORITY",
      "",
      "1. Correct item count.",
      "2. Correct row boundaries.",
      "3. Correct item names.",
      "4. Correct quantities.",
      "5. Correct rate mapping.",
      "6. Correct amounts.",
      "",
      "If uncertain, leave the field empty or 0.",
      "Never invent data.",
      "",
      `Current firm GST mode is ${isGst ? "GST" : "non-GST"}.`,
    ].join("\n");
  }

  _buildGeminiRequest(files, isGst) {
    const parts = [
      { text: this._buildPrompt(isGst) },
      ...files.map((file) => ({
        inline_data: {
          mime_type: file.mimetype,
          data: file.buffer.toString("base64"),
        },
      })),
    ];

    return {
      contents: [{ role: "user", parts }],
      generationConfig: {
        temperature: 0,
        response_mime_type: "application/json",
        response_schema: ITEM_SCAN_SCHEMA,
      },
    };
  }

  _parseGeminiResponse(responseJson) {
    const parts = responseJson?.candidates?.[0]?.content?.parts || [];
    const text = parts
      .map((p) => p.text || "")
      .join("")
      .trim();
    if (!text) throw ApiError.internal("Gemini returned empty bill data");

    try {
      return JSON.parse(text);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw ApiError.internal("Gemini returned invalid JSON");
      return JSON.parse(match[0]);
    }
  }

  _isSupportedScanFile(file) {
    return (
      file?.mimetype?.startsWith("image/") || file?.mimetype === PDF_MIME_TYPE
    );
  }

  async _optimizeFile(file) {
    if (file?.mimetype === PDF_MIME_TYPE) return file;

    const buffer = await sharp(file.buffer)
      .rotate()
      .resize({
        width: OPTIMIZED_IMAGE_MAX_DIMENSION,
        height: OPTIMIZED_IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: OPTIMIZED_IMAGE_QUALITY,
        mozjpeg: true,
      })
      .toBuffer();

    return {
      ...file,
      buffer,
      mimetype: "image/jpeg",
      size: buffer.length,
    };
  }

  async _callGemini(files, isGst, onProgress = () => {}) {
    const apiKey = this._getApiKey();
    const model = this._getModel();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    onProgress("analyzing_bill", "started");
    let response;
    try {
      response = await fetch(
        `${GEMINI_API_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this._buildGeminiRequest(files, isGst)),
          signal: controller.signal,
        },
      );
    } catch (err) {
      if (err.name === "AbortError") {
        throw ApiError.internal(
          "Gemini request timed out. Try with fewer or smaller images.",
        );
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }

    const responseJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw ApiError.badRequest(
        responseJson?.error?.message || "Gemini bill extraction failed",
      );
    }

    onProgress("analyzing_bill", "completed");
    onProgress("extracting_items", "started");
    const extracted = this._parseGeminiResponse(responseJson);
    onProgress("extracting_items", "completed", {
      item_count: Array.isArray(extracted?.items) ? extracted.items.length : 0,
    });

    return {
      model,
      usageMetadata: responseJson?.usageMetadata || null,
      extracted,
    };
  }

  async _matchItem(extractedItem, userId) {
    const item = extractedItem || {};
    const filters = [];
    const barcode = this._normalizeText(
      item.barcode || item.source_barcode,
    ).toUpperCase();
    const itemCode = this._normalizeText(
      item.item_code || item.source_item_code,
    );
    const itemName = this._normalizeText(
      item.item_name || item.source_item_name,
    );

    if (barcode) filters.push({ barcode, user_id: userId });
    if (itemCode) {
      filters.push({ item_id: itemCode, user_id: userId });
      if (/^[0-9]+$/.test(itemCode)) {
        filters.push({ item_id: Number(itemCode), user_id: userId });
      }
    }
    if (itemName) {
      const regex = new RegExp(`^${this._escapeRegex(itemName)}$`, "i");
      filters.push(
        { item_name: { $regex: regex }, user_id: userId },
        { alias: { $regex: regex }, user_id: userId },
      );
    }

    if (filters.length === 0) return null;

    const matched = await Item.findOne({ $or: filters })
      .select(
        "item_name alias description barcode item_id sale_rate purchase_rate mrp_rate gst_percent discount stock physical_stock logical_stock threshold is_gst brand_id dept_id hsn_id",
      )
      .lean();
    if (!matched) return null;

    return { ...matched, id: String(matched._id), _id: String(matched._id) };
  }

  async _createScannedItem(extractedItem, userId, isGst, index) {
    const itemName =
      this._normalizeText(extractedItem.item_name) ||
      this._normalizeText(extractedItem.source_item_name) ||
      this._normalizeText(extractedItem.description) ||
      this._normalizeText(extractedItem.barcode) ||
      this._normalizeText(extractedItem.source_barcode) ||
      this._normalizeText(extractedItem.item_code) ||
      this._normalizeText(extractedItem.source_item_code) ||
      `Scanned Item ${index + 1}`;
    const barcodeCandidate = this._normalizeText(
      extractedItem.barcode || extractedItem.source_barcode,
    ).toUpperCase();
    const itemCodeCandidate = this._normalizeText(
      extractedItem.item_code || extractedItem.source_item_code,
    );
    const gstPercent = this._toNumber(extractedItem.gst_percent);
    const hsn = await this._resolveHsn(extractedItem, userId, gstPercent);
    const rowRate = this._toNumber(
      extractedItem.rate || extractedItem.sale_rate || extractedItem.mrp_rate,
    );
    const extractedIsGst = Number(extractedItem.is_gst);
    const isGstFlag =
      Number.isFinite(extractedIsGst) && extractedIsGst === 1 ? 1
      : gstPercent > 0 || isGst ? 1
      : 0;

    let barcode = "";
    if (barcodeCandidate && isValidBarcodeFormat(barcodeCandidate)) {
      const barcodeExists = await Item.exists({ barcode: barcodeCandidate });
      barcode = barcodeExists ? "" : barcodeCandidate;
    }
    if (!barcode) barcode = await generateUniqueBarcode();

    let itemId = "";
    if (itemCodeCandidate) {
      const itemIdExists = await Item.exists({ item_id: itemCodeCandidate });
      itemId = itemIdExists ? "" : itemCodeCandidate;
    }
    if (!itemId) itemId = String(await generateUniqueItemId(userId));

    const created = await Item.create({
      id: await getNextId("Item", userId),
      item_name: itemName,
      barcode,
      item_id: itemId,
      alias: this._normalizeText(extractedItem.alias) || itemName,
      description:
        this._normalizeText(extractedItem.description) ||
        this._normalizeText(extractedItem.source_item_name),
      sale_rate: this._toNumber(extractedItem.sale_rate || rowRate),
      purchase_rate: this._toNumber(extractedItem.purchase_rate || rowRate),
      mrp_rate: this._toNumber(extractedItem.mrp_rate || rowRate),
      gst_percent: gstPercent,
      hsn_id: hsn?._id || null,
      discount: 0,
      physical_stock: 0,
      logical_stock: 0,
      opening_physical_stock: 0,
      opening_logical_stock: 0,
      threshold: this._toNumber(extractedItem.threshold),
      is_gst: isGstFlag,
      user_id: userId,
    });

    return {
      ...created.toObject(),
      id: String(created._id),
      _id: String(created._id),
      created_from_scan: true,
    };
  }

  async _resolveHsn(extractedItem, userId, gstPercent) {
    const hsnCode = this._normalizeText(
      extractedItem.hsn_code || extractedItem.hsn || extractedItem.hsnCode,
    );
    if (!hsnCode) return null;

    const existing = await Hsn.findOne({
      hsn_code: new RegExp(`^${this._escapeRegex(hsnCode)}$`, "i"),
      user_id: userId,
    }).lean();
    if (existing) return existing;

    return Hsn.create({
      id: await getNextId("Hsn", userId),
      hsn_code: hsnCode,
      description:
        this._normalizeText(extractedItem.hsn_description) ||
        `Created from bill scan for ${hsnCode}`,
      gst_rate: this._toNumber(gstPercent),
      is_active: true,
      user_id: userId,
    });
  }

  async _ensureScannedItemHsn(extractedItem, matchedItem, userId) {
    if (!matchedItem?._id) return matchedItem;
    const hsn = await this._resolveHsn(
      extractedItem,
      userId,
      this._toNumber(extractedItem.gst_percent, matchedItem.gst_percent),
    );
    if (!hsn) return matchedItem;
    if (String(matchedItem.hsn_id || "") === String(hsn._id)) {
      return matchedItem;
    }

    await Item.updateOne(
      { _id: matchedItem._id, user_id: userId },
      { $set: { hsn_id: hsn._id } },
    );
    return { ...matchedItem, hsn_id: hsn._id };
  }

  _normalizeExtractedItem(extractedItem, matchedItem, createdFromScan) {
    const item = extractedItem || {};
    const matched = matchedItem || {};
    const gstPct = this._toNumber(item.gst_percent, matched.gst_percent);
    const rate = this._toNumber(
      item.rate || item.sale_rate,
      matched.sale_rate || 0,
    );

    return {
      item_id: matched._id ? String(matched._id) : "",
      item_name: matched.item_name || this._normalizeText(item.item_name),
      alias: matched.alias || this._normalizeText(item.alias),
      description: matched.description || this._normalizeText(item.description),
      barcode:
        matched.barcode ||
        this._normalizeText(item.barcode || item.source_barcode),
      item_code:
        matched.item_id ||
        this._normalizeText(item.item_code || item.source_item_code),
      hsn_id: matched.hsn_id ? String(matched.hsn_id) : "",
      hsn_code: this._normalizeText(item.hsn_code || item.hsn),
      source_item_name: this._normalizeText(
        item.source_item_name || item.item_name,
      ),
      source_barcode: this._normalizeText(item.source_barcode || item.barcode),
      source_item_code: this._normalizeText(
        item.source_item_code || item.item_code,
      ),
      quantity: this._toNumber(item.quantity, 1),
      rate,
      sale_rate: this._toNumber(matched.sale_rate, item.sale_rate || rate),
      purchase_rate: this._toNumber(matched.purchase_rate, item.purchase_rate),
      mrp_rate: this._toNumber(matched.mrp_rate, item.mrp_rate || rate),
      discount: this._toNumber(item.discount),
      special_discount: this._toNumber(item.special_discount),
      item_discount: this._toNumber(item.item_discount),
      item_dis2: this._toNumber(item.item_dis2),
      dis3: this._toNumber(item.dis3),
      gross_amount: this._toNumber(item.gross_amount),
      discount_amount: this._toNumber(item.discount_amount),
      total_discount: this._toNumber(item.total_discount),
      taxable_amount: this._toNumber(item.taxable_amount),
      gst_percent: gstPct,
      gst_amount: this._toNumber(item.gst_amount),
      amount: this._toNumber(item.amount),
      is_gst: this._toNumber(
        item.is_gst,
        matched.is_gst ?? (gstPct > 0 ? 1 : 0),
      ),
      stock: this._toNumber(matched.stock),
      physical_stock: this._toNumber(matched.physical_stock),
      logical_stock: this._toNumber(matched.logical_stock),
      threshold: this._toNumber(matched.threshold, item.threshold),
      created_from_scan: Boolean(createdFromScan),
      matched_item: {
        ...matched,
        id: matched._id ? String(matched._id) : "",
        _id: matched._id ? String(matched._id) : "",
      },
    };
  }

  async _enrichExtractedItems(extracted, userId, isGst, onProgress = () => {}) {
    const sourceItems =
      Array.isArray(extracted?.items) ? extracted.items
      : Array.isArray(extracted?.challan?.items) ? extracted.challan.items
      : [];
    const items = [];
    let createdItemCount = 0;
    let matchedItemCount = 0;
    const createdItemIndexes = new Set();

    onProgress("matching_inventory", "started", {
      item_count: sourceItems.length,
    });
    const matchedItems = await Promise.all(
      sourceItems.map((sourceItem) => this._matchItem(sourceItem, userId)),
    );
    matchedItemCount = matchedItems.filter(Boolean).length;
    onProgress("matching_inventory", "completed", {
      matched_item_count: matchedItemCount,
      missing_item_count: sourceItems.length - matchedItemCount,
    });

    onProgress("creating_missing_items", "started", {
      missing_item_count: sourceItems.length - matchedItemCount,
    });
    for (const [index, sourceItem] of sourceItems.entries()) {
      if (!matchedItems[index]) {
        const newlyMatchedItem = await this._matchItem(sourceItem, userId);
        if (newlyMatchedItem) {
          matchedItems[index] = newlyMatchedItem;
          matchedItemCount += 1;
        } else {
          matchedItems[index] = await this._createScannedItem(
            sourceItem,
            userId,
            isGst,
            index,
          );
          createdItemIndexes.add(index);
          createdItemCount += 1;
        }
      }
      matchedItems[index] = await this._ensureScannedItemHsn(
        sourceItem,
        matchedItems[index],
        userId,
      );
    }
    onProgress("creating_missing_items", "completed", {
      created_item_count: createdItemCount,
    });

    onProgress("finalizing_results", "started");
    for (const [index, sourceItem] of sourceItems.entries()) {
      items.push(
        this._normalizeExtractedItem(
          sourceItem,
          matchedItems[index],
          createdItemIndexes.has(index),
        ),
      );
    }

    const result = {
      items,
      created_item_count: createdItemCount,
      matched_item_count: matchedItemCount,
      confidence: this._toNumber(extracted.confidence),
      warnings: Array.isArray(extracted.warnings) ? extracted.warnings : [],
    };
    onProgress("finalizing_results", "completed", {
      item_count: items.length,
    });
    return result;
  }

  _validateFiles(files) {
    if (!Array.isArray(files) || files.length === 0) {
      throw ApiError.badRequest("At least one bill file is required");
    }
    if (files.length > MAX_IMAGES_PER_BILL) {
      throw ApiError.badRequest(`Maximum ${MAX_IMAGES_PER_BILL} files allowed`);
    }
    files.forEach((file) => {
      if (!this._isSupportedScanFile(file)) {
        throw ApiError.badRequest(
          "Only image and PDF files are allowed for bill scan",
        );
      }
    });
  }

  async extractBillItems(files, isGst, onProgress = () => {}) {
    this._validateFiles(files);
    onProgress("optimizing_images", "started", {
      file_count: files.length,
    });
    const optimizedFiles = await Promise.all(
      files.map((file) => this._optimizeFile(file)),
    );
    onProgress("optimizing_images", "completed", {
      file_count: optimizedFiles.length,
      input_bytes: files.reduce((total, file) => total + (file.size || 0), 0),
      output_bytes: optimizedFiles.reduce(
        (total, file) => total + (file.size || 0),
        0,
      ),
    });

    const { model, usageMetadata, extracted } = await this._callGemini(
      optimizedFiles,
      isGst,
      onProgress,
    );
    return {
      model,
      usageMetadata,
      usage_metadata: usageMetadata,
      page_count: files.length,
      extracted,
    };
  }

  async resolveExtractedItems(extracted, userId, isGst, onProgress = () => {}) {
    return this._enrichExtractedItems(
      extracted || {},
      userId,
      isGst,
      onProgress,
    );
  }

  async scanBillImages(files, userId, isGst, onProgress = () => {}) {
    const extraction = await this.extractBillItems(files, isGst, onProgress);
    const result = await this.resolveExtractedItems(
      extraction.extracted,
      userId,
      isGst,
      onProgress,
    );

    return {
      model: extraction.model,
      usageMetadata: extraction.usageMetadata,
      usage_metadata: extraction.usageMetadata,
      page_count: extraction.page_count,
      ...result,
    };
  }
}

export default new BillScanService();
