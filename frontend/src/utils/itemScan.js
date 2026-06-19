import api from "../services/axiosInstance";
import {
  getResponseData,
  getResponseList,
  normalizeItem,
} from "../services/apiUtils";

const ITEM_QR_PREFIX = "MM_ITEM:";

const cleanScanValue = (value) =>
  String(value || "")
    .replace(/\r?\n/g, "")
    .trim();

const toComparable = (value) => cleanScanValue(value).toUpperCase();

export const normalizeItemScanValue = (value) => cleanScanValue(value);

export const isItemQrScanValue = (value) =>
  toComparable(value).startsWith(ITEM_QR_PREFIX);

export const shouldResolveScannerInput = (value) => {
  const cleaned = cleanScanValue(value);
  if (!cleaned) return false;
  if (isItemQrScanValue(cleaned)) return true;
  if (/\s/.test(cleaned) || cleaned.length < 4) return false;
  return /[0-9]/.test(cleaned) || cleaned !== cleaned.toLowerCase();
};

export const parseItemScanValue = (value) => {
  const rawValue = cleanScanValue(value);
  if (!rawValue) {
    return {
      rawValue: "",
      itemId: "",
      lookupValue: "",
      isQr: false,
    };
  }

  if (isItemQrScanValue(rawValue)) {
    return {
      rawValue,
      itemId: rawValue.slice(ITEM_QR_PREFIX.length).trim(),
      lookupValue: "",
      isQr: true,
    };
  }

  return {
    rawValue,
    itemId: "",
    lookupValue: rawValue,
    isQr: false,
  };
};

const toLoadedItemOption = (item = {}) => {
  const source = item?.raw || item;
  const normalized = normalizeItem(source);

  return {
    ...source,
    ...item,
    id: normalized.id,
    name: normalized.itemName || item?.name || source?.name || "",
    itemName: normalized.itemName || item?.itemName || source?.item_name || "",
    item_id: normalized.item_id || item?.item_id || source?.item_id || "",
    amount: normalized.amount,
    barcode: normalized.barcode || item?.barcode || source?.barcode || "",
    type: normalized.type,
    gst_percent: normalized.gst_percent,
    stock:
      item?.stock ??
      source?.stock ??
      source?.physical_stock ??
      normalized.stockCount ??
      0,
    qrCodeValue:
      normalized.qrCodeValue ||
      item?.qrCodeValue ||
      source?.qr_code_value ||
      source?.qr_code ||
      "",
  };
};

const getItemMatchCandidates = (item = {}) => {
  const normalized = normalizeItem(item?.raw || item);

  return [
    normalized.id,
    normalized.item_id,
    normalized.barcode,
    normalized.qrCodeValue,
    item?.item_id,
    item?.barcode,
    item?.qrCodeValue,
    item?.qr_code_value,
    item?.qr_code,
  ]
    .map(toComparable)
    .filter(Boolean);
};

const matchesScannedValue = (item, scannedValue) => {
  const parsed = parseItemScanValue(scannedValue);
  const candidates = getItemMatchCandidates(item);
  if (parsed.isQr) {
    return (
      candidates.includes(toComparable(parsed.rawValue)) ||
      candidates.includes(toComparable(parsed.itemId))
    );
  }

  return candidates.includes(toComparable(parsed.lookupValue));
};

export const resolveItemFromScan = async ({
  rawValue,
  loadedItems = [],
}) => {
  const parsed = parseItemScanValue(rawValue);
  if (!parsed.rawValue) {
    throw new Error("Scanned value is empty");
  }

  const localMatch = loadedItems.find((item) =>
    matchesScannedValue(item, parsed.rawValue),
  );
  if (localMatch) {
    return toLoadedItemOption(localMatch);
  }

  if (parsed.isQr) {
    const response = await api.get(`/items/${parsed.itemId}`);
    const item = getResponseData(response);
    if (!item) {
      throw new Error("Scanned item not found");
    }
    return toLoadedItemOption(item);
  }

  const response = await api.get("/items", {
    params: { page: 1, limit: 25, search: parsed.lookupValue },
  });
  const results = getResponseList(response);
  const matchedItem =
    results.find((item) => matchesScannedValue(item, parsed.rawValue)) ||
    results[0];

  if (!matchedItem) {
    throw new Error("No item found for scanned code");
  }

  return toLoadedItemOption(matchedItem);
};
