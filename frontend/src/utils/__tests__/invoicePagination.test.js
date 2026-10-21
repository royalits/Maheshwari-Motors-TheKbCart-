import { describe, expect, it, vi } from "vitest";
import jsPDF from "jspdf";
import { drawCompactInvoiceTable, drawCompactInvoiceAmount, drawInvoiceTable, planInvoicePages } from "../invoicePagination";

const compactLayout = {
  firstStartY: 59,
  continuationStartY: 8,
  bottomY: 204,
  headerHeight: 6.5,
  finalSectionHeight: 64,
};
const itemCounts = (doc) => doc.internal.pages.slice(1).map((page) =>
  (page.join("\n").match(/SKU-\d{4}/g) || []).length);
const compactRows = (count) => Array.from({ length: count }, (_, index) => [
  `SKU-${String(index + 1).padStart(4, "0")}`, "10", "1250.00", "5.00", "2.00", "1163.75", "11637.50",
]);
const compactOptions = (rows) => ({
  rows, startY: 59, x: 158, width: 133, margin: 6,
  border: [35, 35, 35], blue: [0, 0, 190], headerFill: [247, 247, 247],
});

describe("invoice pagination", () => {
  it("fits 20 compact items and the complete final section on one page", () => {
    const pages = planInvoicePages({ ...compactLayout, rowHeights: Array(20).fill(3.7) });
    expect(pages).toHaveLength(1);
    expect(pages[0].end).toBe(20);
    expect(pages[0].startY + 6.5 + pages[0].bodyHeight + 64).toBeLessThanOrEqual(204);
  });

  it("keeps every item in order without empty or summary-only pages at pagination boundaries", () => {
    for (let count = 1; count <= 250; count += 1) {
      const heights = Array(count).fill(3.7);
      const pages = planInvoicePages({ ...compactLayout, rowHeights: heights });
      let next = 0;
      pages.forEach((page) => {
        expect(page.start).toBe(next);
        expect(page.end).toBeGreaterThan(page.start);
        expect(page.startY + 6.5 + page.bodyHeight).toBeLessThanOrEqual(page.bottomY + 0.001);
        next = page.end;
      });
      expect(next).toBe(count);
      if (count >= 40) expect(pages.every((page) => page.end - page.start >= 20)).toBe(true);
    }
  });

  it("renders 100 compact items legibly on three full pages with aligned table borders", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const rows = Array.from({ length: 100 }, (_, i) => [
      `SKU-${String(i + 1).padStart(4, "0")}`, "10", "1250.00", "5.00", "2.00", "1163.75", "11637.50",
    ]);
    const result = drawCompactInvoiceTable(doc, {
      rows, startY: 59, x: 158, width: 133, margin: 6,
      border: [35, 35, 35], blue: [0, 0, 190], headerFill: [247, 247, 247],
    });
    expect(doc.getNumberOfPages()).toBe(3);
    expect(itemCounts(doc).reduce((a, b) => a + b, 0)).toBe(100);
    expect(itemCounts(doc).every((count) => count >= 20)).toBe(true);
    expect(result.summaryY + 64).toBeCloseTo(204, 1);
    const last = result.columnDefs.at(-1);
    expect(result.columnStarts.at(-1) + last.width).toBeCloseTo(291);
    expect(doc.output()).not.toMatch(/\/Subtype \/Link|thekbcart|thekbclick/);
  });

  it("keeps a five-item compact invoice tightly spaced with aligned descriptions and amounts", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const text = vi.spyOn(doc, "text");
    drawCompactInvoiceTable(doc, compactOptions(compactRows(5)));
    const descriptions = text.mock.calls.filter(([value]) => typeof value === "string" && /SKU-\d{4}/.test(value));
    const amounts = text.mock.calls.filter(([value]) => value === "11637.50");

    expect(doc.getNumberOfPages()).toBe(1);
    expect(descriptions).toHaveLength(5);
    expect(amounts).toHaveLength(5);
    descriptions.forEach(([, x, y], index) => {
      expect(x).toBeCloseTo(descriptions[0][1]);
      expect(amounts[index][1]).toBeCloseTo(amounts[0][1]);
      expect(amounts[index][2]).toBeCloseTo(y);
      if (index) {
        const gap = y - descriptions[index - 1][2];
        expect(gap).toBeGreaterThanOrEqual(3.7 - 0.001);
        expect(gap).toBeLessThanOrEqual(4.5 + 0.001);
      }
    });
    expect(descriptions.map(([value]) => value)).toEqual(compactRows(5).map(([description]) => description));
  });

  it("keeps the short invoice table, summary, and border at full page height with blank space below the items", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const rect = vi.spyOn(doc, "rect");
    const text = vi.spyOn(doc, "text");
    const result = drawCompactInvoiceTable(doc, compactOptions(compactRows(5)));
    const descriptions = text.mock.calls.filter(([value]) => typeof value === "string" && /SKU-\d{4}/.test(value));
    const expectedBottom = doc.internal.pageSize.getHeight() - 6;

    expect(result.summaryY).toBeCloseTo(expectedBottom - 64);
    expect(result.invoiceBottomY).toBeCloseTo(expectedBottom);
    expect(result.summaryY - descriptions.at(-1)[2]).toBeGreaterThan(40);
    const border = rect.mock.calls.find(([x, y, width]) => x === 158 && y === 6 && width === 133);
    expect(border).toBeDefined();
    expect(border[1] + border[3]).toBeCloseTo(result.invoiceBottomY);
    const table = rect.mock.calls.find(([x, y, width, , style]) => x === 158 && y === 59 && width === 133 && !style);
    expect(table).toBeDefined();
    expect(table[1] + table[3]).toBeCloseTo(result.summaryY);
  });

  it("numbers a separate serial column consecutively across all pages of a 100-item invoice", () => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const text = vi.spyOn(doc, "text");
    const result = drawCompactInvoiceTable(doc, compactOptions(compactRows(100)));
    const descriptions = text.mock.calls.map(([value]) => value)
      .filter((value) => typeof value === "string" && /SKU-\d{4}/.test(value));
    const serials = text.mock.calls.filter(([value, x]) => typeof value === "string" && /^\d+$/.test(value) && x === 162);

    expect(descriptions).toEqual(compactRows(100).map(([description]) => description));
    expect(result.columnDefs[0]).toMatchObject({ label: "Sr.", width: 8, align: "center" });
    expect(result.columnDefs[1]).toMatchObject({ label: "Item Name", width: 49, align: "left" });
    expect(serials.map(([value]) => value)).toEqual(Array.from({ length: 100 }, (_, index) => String(index + 1)));
    serials.forEach(([, , , options]) => expect(options.align).toBe("center"));
    expect(text.mock.calls.filter(([value, x]) => value === "Sr." && x === 162)).toHaveLength(3);
    expect(doc.getNumberOfPages()).toBe(3);
    expect(itemCounts(doc).every((count) => count >= 20)).toBe(true);
  });

  it("measures wrapped GST items and reserves the complete summary without splitting rows", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const body = Array.from({ length: 100 }, (_, i) => [
      `SKU-${String(i + 1).padStart(4, "0")}`,
      i % 6 === 0 ? "Long replacement part description that wraps across several lines in its column" : "Replacement part",
      "100.00",
    ]);
    const finalY = drawInvoiceTable(doc, {
      head: [["Code", "Item", "Amount"]], body,
      startY: 114, margin: { left: 6, right: 6 }, tableWidth: 198,
      theme: "grid", styles: { font: "times", fontSize: 8, minCellHeight: 4.5, cellPadding: 0.6 },
      headStyles: { cellPadding: 1.5 },
      columnStyles: { 0: { cellWidth: 25 }, 1: { cellWidth: 88 }, 2: { cellWidth: 85, halign: "right" } },
    }, 136);
    expect(itemCounts(doc).reduce((a, b) => a + b, 0)).toBe(100);
    expect(itemCounts(doc).every((count) => count >= 20)).toBe(true);
    expect(finalY + 136).toBeLessThanOrEqual(doc.internal.pageSize.getHeight() - 6 + 0.001);
    expect(doc.getNumberOfPages()).toBe(3);
  });

  it("keeps large amounts and HSN codes on one line in the existing GST columns", () => {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const widths = [7, 42, 14, 10, 14, 9, 9, 10, 10, 10, 14, 10, 14, 9, 16];
    const body = Array.from({ length: 100 }, (_, i) => [
      String(i + 1), `SKU-${String(i + 1).padStart(4, "0")}`, "87089900", "2", "1250.00",
      "5.00", "2.00", "0.00", "0.00", "0.00", "1373.22", "2327.50", "18.00", "418.95", "2746.45",
    ]);
    drawInvoiceTable(doc, {
      head: [["Sr.", "Item Description", "HSN", "Qty", "Rate", "D1%", "D2%", "I1", "I2", "D3RS", "Net Rate", "Taxable", "Tax%", "TaxAmt", "Amount"]],
      body, startY: 129.5, margin: { left: 6, right: 6 }, tableWidth: 198,
      styles: { font: "times", fontSize: 7, minCellHeight: 4.5, cellPadding: { top: 0.6, bottom: 0.6, left: 1.2, right: 1.2 } },
      headStyles: { fontSize: 7.2, cellPadding: 1.5 },
      columnStyles: Object.fromEntries(widths.map((width, i) => [i, { cellWidth: width, halign: i === 1 ? "left" : "right" }])),
    }, 139);
    expect(itemCounts(doc).every((count) => count >= 20)).toBe(true);
    expect(itemCounts(doc).reduce((sum, count) => sum + count, 0)).toBe(100);
    expect(doc.getNumberOfPages()).toBe(3);
    doc.lastAutoTable.body.forEach((row) => {
      [2, 4, 10, 11, 13, 14].forEach((index) => expect(row.cells[index].text).toHaveLength(1));
    });
  });

  it("leaves a clear gap between the compact net amount and its label", () => {
    const doc = new jsPDF();
    const calls = [];
    const originalText = doc.text;
    doc.text = function (value, x, y, options) {
      if (typeof value === "string") calls.push({ value, rightX: x, width: doc.getTextWidth(value) });
      return originalText.call(this, value, x, y, options);
    };
    drawCompactInvoiceAmount(doc, {
      x: 6, width: 133, y: 100, amount: 12345678.9,
      amountInWords: "ONE CRORE TWENTY THREE LAKH FORTY FIVE THOUSAND SIX HUNDRED SEVENTY EIGHT RUPEES ONLY",
      blue: [0, 0, 190],
    });
    const label = calls.find((call) => call.value === "Net Amount:");
    const amount = calls.find((call) => call.value === "12345678.90");
    expect(amount.rightX - amount.width - label.rightX).toBeGreaterThanOrEqual(1.49);
  });
});
