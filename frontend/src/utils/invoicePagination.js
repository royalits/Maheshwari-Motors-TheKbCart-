import { autoTable, __createTable } from "jspdf-autotable";

export const drawInvoiceCellText = (doc, value, x, y, { maxWidth, ...options }) => {
  const text = String(value);
  const fontSize = doc.getFontSize();
  const width = doc.getTextWidth(text);
  if (width > maxWidth) doc.setFontSize(fontSize * maxWidth / width);
  doc.text(text, x, y, options);
  doc.setFontSize(fontSize);
};

export const drawCompactInvoiceAmount = (doc, { x, width, y, amount, amountInWords, blue }) => {
  const rightX = x + width - 1.2;
  const value = Number(amount || 0).toFixed(2);
  doc.setFont("times", "bold");
  doc.setFontSize(11);
  const amountWidth = Math.min(28, doc.getTextWidth(value));
  doc.setTextColor(...blue);
  drawInvoiceCellText(doc, value, rightX, y + 28, { align: "right", maxWidth: amountWidth });
  doc.setFontSize(10);
  const labelRightX = rightX - amountWidth - 1.5;
  const label = "Net Amount:";
  const labelWidth = doc.getTextWidth(label);
  doc.text(label, labelRightX, y + 28, { align: "right" });
  const wordsWidth = labelRightX - labelWidth - x - 3;
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(8.5);
  let words = doc.splitTextToSize(`In Words : Rs. ${amountInWords}`, wordsWidth);
  while (words.length > 2 && doc.getFontSize() > 6) {
    doc.setFontSize(doc.getFontSize() - 0.25);
    words = doc.splitTextToSize(`In Words : Rs. ${amountInWords}`, wordsWidth);
  }
  doc.text(words, x + 1.5, y + 25, { lineHeightFactor: 1.05 });
};

// Plan the final section together with the items, before drawing any pages.
export const planInvoicePages = ({
  rowHeights,
  firstStartY,
  continuationStartY,
  bottomY,
  headerHeight,
  finalSectionHeight,
  minimumRows = 20,
}) => {
  const count = rowHeights.length;
  if (!count) return [];
  const sums = [0];
  rowHeights.forEach((height) => sums.push(sums.at(-1) + height));
  const heightBetween = (start, end) => sums[end] - sums[start];
  const capacity = (first, last) =>
    bottomY - (first ? firstStartY : continuationStartY) - headerHeight -
    (last ? finalSectionHeight : 0);
  const fits = (start, end, space) => heightBetween(start, end) <= space + 0.001;

  // Minimum pages for each suffix, with the final section on the last item page.
  const suffixPages = Array(count + 1).fill(Infinity);
  for (let start = count - 1; start >= 0; start -= 1) {
    if (fits(start, count, capacity(false, true))) suffixPages[start] = 1;
    for (let end = start + 1; end < count; end += 1) {
      if (!fits(start, end, capacity(false, false))) break;
      suffixPages[start] = Math.min(suffixPages[start], 1 + suffixPages[end]);
    }
  }
  let pageCount = fits(0, count, capacity(true, true)) ? 1 : Infinity;
  for (let end = 1; end < count; end += 1) {
    if (!fits(0, end, capacity(true, false))) break;
    pageCount = Math.min(pageCount, 1 + suffixPages[end]);
  }
  if (!Number.isFinite(pageCount)) {
    throw new Error("An invoice row is too tall to fit on a page.");
  }

  const partition = (minRows) => {
    const memo = new Map();
    const choose = (start, pageIndex) => {
      const key = `${start}:${pageIndex}`;
      if (memo.has(key)) return memo.get(key);
      const pagesLeft = pageCount - pageIndex;
      const space = capacity(pageIndex === 0, pagesLeft === 1);
      if (pagesLeft === 1) {
        const result = count - start >= minRows && fits(start, count, space)
          ? [count - start] : null;
        memo.set(key, result);
        return result;
      }
      const candidates = [];
      for (let end = start + minRows; end <= count - minRows * (pagesLeft - 1); end += 1) {
        if (!fits(start, end, space)) break;
        candidates.push(end);
      }
      const target = start + (count - start) / pagesLeft;
      candidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
      for (const end of candidates) {
        const rest = choose(end, pageIndex + 1);
        if (rest) {
          const result = [end - start, ...rest];
          memo.set(key, result);
          return result;
        }
      }
      memo.set(key, null);
      return null;
    };
    return choose(0, 0);
  };

  const counts = (count >= pageCount * minimumRows && partition(minimumRows)) || partition(1);
  let start = 0;
  return counts.map((rowCount, pageIndex) => {
    const end = start + rowCount;
    const page = {
      start, end,
      startY: pageIndex === 0 ? firstStartY : continuationStartY,
      bodyHeight: heightBetween(start, end),
      bottomY: bottomY - (pageIndex === pageCount - 1 ? finalSectionHeight : 0),
    };
    start = end;
    return page;
  });
};

export const drawCompactInvoiceTable = (doc, {
  rows, startY, x, width, margin, border, headerFill, blue,
}) => {
  const pageHeight = doc.internal.pageSize.getHeight();
  const headerHeight = 6.5;
  const summaryHeight = 12;
  const footerHeight = 52;
  const columns = [
    { label: "Sr.", width: 8, align: "center" },
    { label: "Item Name", width: 49, align: "left" },
    { label: "Qty", width: 10, align: "right" },
    { label: "Rate", width: 13, align: "right" },
    { label: "D1", width: 10, align: "right" },
    { label: "D2", width: 10, align: "right" },
    { label: "Net Rate", width: 16, align: "right" },
    { label: "Amount", width: 17, align: "right" },
  ];
  // Preserve column proportions while keeping every line inside the invoice.
  const scale = width / columns.reduce((sum, column) => sum + column.width, 0);
  let columnX = x;
  const columnStarts = columns.map((column) => {
    const left = columnX;
    column.width *= scale;
    columnX += column.width;
    return left;
  });
  const textX = (index) => {
    const column = columns[index];
    if (column.align === "left") return columnStarts[index] + 1.2;
    if (column.align === "center") return columnStarts[index] + column.width / 2;
    return columnStarts[index] + column.width - 1.2;
  };
  const body = rows.length ? rows : [["--", "0", "0", "0", "0", "0", "0"]];
  const pages = planInvoicePages({
    rowHeights: body.map(() => 3.7),
    firstStartY: startY,
    continuationStartY: margin + 2,
    bottomY: pageHeight - margin,
    headerHeight,
    finalSectionHeight: summaryHeight + footerHeight,
  });
  let summaryY = startY;
  const invoiceBottomY = pageHeight - margin;
  pages.forEach((page, pageIndex) => {
    if (pageIndex) doc.addPage();
    const rowCount = page.end - page.start;
    const availableRowHeight = (page.bottomY - page.startY - headerHeight) / rowCount;
    // Short tables should use normal line spacing instead of stretching down the page.
    const rowHeight = rowCount < 20 ? Math.min(4.5, availableRowHeight) : availableRowHeight;
    const tableBottomY = page.bottomY;
    doc.setDrawColor(...border);
    doc.setLineWidth(0.3);
    doc.rect(x, margin, width, invoiceBottomY - margin);
    doc.setLineWidth(0.2);
    doc.rect(x, page.startY, width, tableBottomY - page.startY);
    doc.setFillColor(...headerFill);
    doc.rect(x, page.startY, width, headerHeight, "FD");
    columns.forEach((column, index) => {
      if (index) doc.line(columnStarts[index], page.startY, columnStarts[index], tableBottomY);
      doc.setFont("times", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...blue);
      doc.text(column.label, textX(index), page.startY + 4.7, { align: column.align });
    });
    body.slice(page.start, page.end).forEach((row, rowIndex) => {
      const rowY = page.startY + headerHeight + rowIndex * rowHeight + rowHeight / 2 + 1.1;
      const numberedRow = [rows.length ? String(page.start + rowIndex + 1) : "", ...row];
      numberedRow.forEach((cell, index) => {
        const column = columns[index];
        let value = String(cell ?? "").replace(/\s+/g, " ");
        doc.setFont("times", "normal");
        doc.setFontSize(9.5);
        const maxWidth = column.width - 2.4;
        if (column.align === "left" && doc.getTextWidth(value) > maxWidth) {
          while (value.length && doc.getTextWidth(`${value}...`) > maxWidth) value = value.slice(0, -1);
          value += "...";
        } else if (doc.getTextWidth(value) > maxWidth) {
          doc.setFontSize(9.5 * maxWidth / doc.getTextWidth(value));
        }
        doc.setTextColor(0, 0, 0);
        doc.text(value, textX(index), rowY, { align: column.align });
      });
    });
    summaryY = tableBottomY;
  });
  return { summaryY, invoiceBottomY, columnStarts, columnDefs: columns, summaryBoxHeight: summaryHeight };
};

export const drawInvoiceTable = (doc, options, finalSectionHeight) => {
  const prepareCell = (data) => {
    const value = data.cell.text.join(" ");
    const width = typeof data.cell.styles.cellWidth === "number" ? data.cell.styles.cellWidth
      : options.columnStyles?.[data.column.index]?.cellWidth;
    // Amounts and HSN codes must stay on one line within their existing columns.
    const singleLine = (data.section === "body" && /^-?[\d,.%]+$/.test(value)) ||
      (data.section === "head" && !/\s/.test(value));
    if (typeof width === "number" && singleLine) {
      const font = doc.getFont();
      const fontSize = doc.getFontSize();
      doc.setFont(data.cell.styles.font, data.cell.styles.fontStyle);
      doc.setFontSize(data.cell.styles.fontSize);
      const textWidth = doc.getTextWidth(value);
      const availableWidth = width - data.cell.padding("horizontal");
      if (textWidth > availableWidth) {
        data.cell.styles.fontSize *= availableWidth / textWidth;
      }
      data.cell.styles.overflow = "visible";
      doc.setFont(font.fontName, font.fontStyle);
      doc.setFontSize(fontSize);
    }
  };
  const tableOptions = {
    ...options,
    styles: { ...options.styles, valign: "middle" },
    didParseCell: prepareCell,
  };
  // AutoTable measures wrapped descriptions using the same fonts and widths as rendering.
  const measured = __createTable(doc, tableOptions);
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = options.margin.bottom ?? options.margin.left;
  const topMargin = options.margin.top ?? options.margin.left;
  const headerHeight = measured.getHeadHeight(measured.columns);
  const pages = planInvoicePages({
    rowHeights: measured.body.map((row) => row.height),
    firstStartY: options.startY,
    continuationStartY: topMargin + 2,
    bottomY: pageHeight - bottomMargin,
    headerHeight,
    finalSectionHeight,
  });
  pages.forEach((page, index) => {
    if (index) doc.addPage();
    // Leave a fraction of a millimetre for AutoTable's floating-point rounding.
    const extraHeight = Math.max(0, page.bottomY - page.startY - headerHeight - page.bodyHeight - 0.05)
      / (page.end - page.start);
    autoTable(doc, {
      ...tableOptions,
      body: options.body.slice(page.start, page.end),
      startY: page.startY,
      margin: { ...options.margin, top: topMargin, bottom: bottomMargin },
      rowPageBreak: "avoid",
      didParseCell: (data) => {
        prepareCell(data);
        if (data.section === "body") {
          data.cell.styles.minCellHeight = measured.body[page.start + data.row.index].height + extraHeight;
        }
      },
    });
  });
  return doc.lastAutoTable.finalY;
};
