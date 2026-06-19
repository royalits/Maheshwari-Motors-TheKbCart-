import crypto from "crypto";
import Item from "../models/master/item.model.js";
import { getNextId } from "./counter.js";

const BARCODE_LENGTH = 10;
const BARCODE_CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const MAX_RETRIES = 5;

function _randomBarcode() {
  const bytes = crypto.randomBytes(BARCODE_LENGTH);
  let barcode = "";
  for (let i = 0; i < BARCODE_LENGTH; i++) {
    barcode += BARCODE_CHARSET[bytes[i] % BARCODE_CHARSET.length];
  }
  return barcode;
}

export async function generateUniqueBarcode() {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const barcode = _randomBarcode();
    const exists = await Item.exists({ barcode });
    if (!exists) return barcode;
  }
  throw new Error(
    `Failed to generate unique barcode after ${MAX_RETRIES} attempts`,
  );
}
export async function generateUniqueItemId(userId) {
  const nextId = await getNextId("ItemId", userId);
  return String(nextId);
}

export function isValidBarcodeFormat(barcode) {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,62}[A-Za-z0-9]$/.test(
    String(barcode || "").trim(),
  );
}
