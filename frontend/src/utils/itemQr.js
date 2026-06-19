import jsPDF from "jspdf";
import QRCode from "qrcode";

const SINGLE_LABEL_WIDTH_MM = 40;
const SINGLE_LABEL_HEIGHT_MM = 25;
const BULK_COLUMNS = 2;
const BULK_ROWS = 5;
const BULK_PAGE_MARGIN_MM = 10;
const BULK_GAP_X_MM = 6;
const BULK_GAP_Y_MM = 4;

const QR_RENDER_OPTIONS = {
  errorCorrectionLevel: "M",
  margin: 1,
  color: {
    dark: "#000000",
    light: "#FFFFFF",
  },
};

const sanitizeFileName = (value, fallback = "item") => {
  const normalized = String(value || "")
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
};

const getItemObjectId = (item = {}) =>
  item?.id || item?._id || item?.raw?._id || item?.itemId || "";

export const getItemQrValue = (item = {}) => {
  const explicitValue = String(
    item?.qrCodeValue || item?.qr_code_value || item?.qr_code || "",
  ).trim();
  if (explicitValue) {
    return explicitValue;
  }

  const objectId = getItemObjectId(item);
  if (!objectId) {
    throw new Error("QR code cannot be created for an item without an ID");
  }

  return `MM_ITEM:${objectId}`;
};

export const getItemQrLabel = (item = {}) =>
  String(item?.itemName || item?.item_name || item?.name || "Item").trim() ||
  "Item";

export const getItemQrFileBase = (item = {}) => {
  const itemCode = sanitizeFileName(item?.item_id, "");
  const itemName = sanitizeFileName(getItemQrLabel(item), "item");

  return itemCode ? `${itemCode}_${itemName}` : itemName;
};

export const generateItemQrDataUrl = async (item, size = 240) =>
  QRCode.toDataURL(getItemQrValue(item), {
    ...QR_RENDER_OPTIONS,
    width: size,
  });

const renderCenteredLines = (doc, lines, centerX, startY) => {
  lines.forEach((line, index) => {
    doc.text(line, centerX, startY + index * 3.5, { align: "center" });
  });
};

export const downloadSingleItemQrLabel = async (item) => {
  const qrDataUrl = await generateItemQrDataUrl(item, 220);
  const label = getItemQrLabel(item);
  const fileBase = getItemQrFileBase(item);
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [SINGLE_LABEL_WIDTH_MM, SINGLE_LABEL_HEIGHT_MM],
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const qrSize = 13;
  const qrX = (pageWidth - qrSize) / 2;
  const qrY = 2.5;

  doc.setDrawColor(210, 214, 220);
  doc.roundedRect(1.5, 1.5, pageWidth - 3, SINGLE_LABEL_HEIGHT_MM - 3, 2, 2);
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFontSize(6);
  const labelLines = doc.splitTextToSize(label, pageWidth - 6).slice(0, 2);
  renderCenteredLines(doc, labelLines, pageWidth / 2, 18.5);

  doc.save(`${fileBase}_qr_label.pdf`);
};

export const downloadItemsQrPdf = async (items) => {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Select at least one item to download QR PDF");
  }

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const labelWidth =
    (pageWidth -
      BULK_PAGE_MARGIN_MM * 2 -
      BULK_GAP_X_MM * (BULK_COLUMNS - 1)) /
    BULK_COLUMNS;
  const labelHeight =
    (pageHeight -
      BULK_PAGE_MARGIN_MM * 2 -
      BULK_GAP_Y_MM * (BULK_ROWS - 1)) /
    BULK_ROWS;
  const qrSize = 16;
  const perPage = BULK_COLUMNS * BULK_ROWS;

  const qrImages = await Promise.all(
    items.map((item) => generateItemQrDataUrl(item, 280)),
  );

  items.forEach((item, index) => {
    if (index > 0 && index % perPage === 0) {
      doc.addPage();
    }

    const slotIndex = index % perPage;
    const col = slotIndex % BULK_COLUMNS;
    const row = Math.floor(slotIndex / BULK_COLUMNS);
    const x =
      BULK_PAGE_MARGIN_MM + col * (labelWidth + BULK_GAP_X_MM);
    const y =
      BULK_PAGE_MARGIN_MM + row * (labelHeight + BULK_GAP_Y_MM);
    const qrX = x + (labelWidth - qrSize) / 2;
    const qrY = y + 5;

    doc.setDrawColor(220, 223, 228);
    doc.roundedRect(x, y, labelWidth, labelHeight, 2, 2);
    doc.addImage(qrImages[index], "PNG", qrX, qrY, qrSize, qrSize);

    doc.setFontSize(8);
    const labelLines = doc
      .splitTextToSize(getItemQrLabel(item), labelWidth - 8)
      .slice(0, 3);
    renderCenteredLines(doc, labelLines, x + labelWidth / 2, qrY + qrSize + 6);
  });

  const firstItem = items[0];
  const fileBase =
    items.length === 1 ?
      getItemQrFileBase(firstItem)
    : `${sanitizeFileName(getItemQrLabel(firstItem), "items")}_${items.length}_items`;

  doc.save(`${fileBase}_qr_sheet.pdf`);
};
