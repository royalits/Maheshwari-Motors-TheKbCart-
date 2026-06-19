import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseList,
  getResponseMeta,
  normalizeBrand,
  normalizeContact,
  normalizeItem,
  toNumber,
} from "../../services/apiUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FaPrint, FaSyncAlt, FaDownload, FaFileAlt } from "react-icons/fa";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
  getResolvedFirmMeta,
} from "../../utils/reportPdf";

const INITIAL_FILTERS = {
  reportType: "purchase",
  dateFrom: getFinancialYearStartDate(),
  dateTo: getTodayDate(),
  contactId: "",
  itemId: "",
  brandId: "",
  agentId: "",
  areaId: "",
  viewMode: "detail",
  search: "",
};

const PurchaseDateWiseReport = () => {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [suppliers, setSuppliers] = useState([]);
  const [parties, setParties] = useState([]);
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]);
  const [agents, setAgents] = useState([]);
  const [areas, setAreas] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;
  const fetchPagedList = async (url, params = {}, maxPages = 200) => {
    let all = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await api.get(url, {
        params: { page, limit: 200, ...params },
      });
      const list = getResponseList(res);
      const meta = getResponseMeta(res);

      all = [...all, ...list];

      if (meta?.hasNextPage) {
        page = Number(meta.page || page) + 1;
      } else if (meta?.totalPages && page < meta.totalPages) {
        page += 1;
      } else {
        hasMore = false;
      }

      if (!meta && list.length === 0) hasMore = false;
      if (page > maxPages) hasMore = false;
    }

    return all;
  };

  useEffect(() => {
    const loadMasters = async () => {
      try {
        const [
          supplierList,
          partyList,
          itemList,
          brandList,
          agentList,
          areaList,
        ] = await Promise.all([
          fetchPagedList("/contacts/suppliers"),
          fetchPagedList("/contacts/parties"),
          fetchPagedList("/items"),
          fetchPagedList("/brands"),
          fetchPagedList("/agents"),
          fetchPagedList("/areas"),
        ]);

        setSuppliers(
          supplierList.map((supplier) => {
            const normalized = normalizeContact(supplier);
            return {
              id: normalized.id,
              name: normalized.name,
              agentId: normalized.agent_id,
              areaId: normalized.area_id,
            };
          }),
        );

        setParties(
          partyList.map((party) => {
            const normalized = normalizeContact(party);
            return {
              id: normalized.id,
              name: normalized.name,
              agentId: normalized.agent_id,
              areaId: normalized.area_id,
            };
          }),
        );

        setItems(
          itemList.map((item) => {
            const normalized = normalizeItem(item);
            return {
              id: normalized.id,
              name: normalized.itemName || item?.item_name || item?.name || "",
              brandId: normalized.brandId,
            };
          }),
        );

        setBrands(
          brandList.map((brand) => {
            const normalized = normalizeBrand(brand);
            return { id: normalized.id, name: normalized.name };
          }),
        );

        setAgents(
          agentList.map((agent) => ({
            id: getEntityId(agent),
            name: agent?.agent_name || agent?.name || "",
          })),
        );

        setAreas(
          areaList.map((area) => ({
            id: getEntityId(area),
            name:
              [area?.city, area?.state].filter(Boolean).join(" - ") ||
              area?.name ||
              "",
          })),
        );
      } catch (error) {
        console.error("Failed to load date-wise report masters", error);
      }
    };

    loadMasters();
  }, []);

  const itemMap = useMemo(() => {
    const map = {};
    items.forEach((item) => {
      map[String(item.id)] = item;
    });
    return map;
  }, [items]);

  const brandMap = useMemo(() => {
    const map = {};
    brands.forEach((brand) => {
      map[String(brand.id)] = brand.name;
    });
    return map;
  }, [brands]);

  const supplierMetaMap = useMemo(() => {
    const map = {};
    suppliers.forEach((supplier) => {
      map[String(supplier.id)] = supplier;
    });
    return map;
  }, [suppliers]);

  const partyMetaMap = useMemo(() => {
    const map = {};
    parties.forEach((party) => {
      map[String(party.id)] = party;
    });
    return map;
  }, [parties]);

  const agentMap = useMemo(() => {
    const map = {};
    agents.forEach((agent) => {
      map[String(agent.id)] = agent.name;
    });
    return map;
  }, [agents]);

  const areaMap = useMemo(() => {
    const map = {};
    areas.forEach((area) => {
      map[String(area.id)] = area.name;
    });
    return map;
  }, [areas]);

  const contactOptions = useMemo(() => {
    return filters.reportType === "sale" ? parties : suppliers;
  }, [filters.reportType, parties, suppliers]);

  const appliedContactOptions = useMemo(() => {
    return applied.reportType === "sale" ? parties : suppliers;
  }, [applied.reportType, parties, suppliers]);

  const filteredItemOptions = useMemo(() => {
    if (!filters.brandId) return items;
    return items.filter(
      (item) => String(item.brandId) === String(filters.brandId),
    );
  }, [filters.brandId, items]);

  const viewModes = useMemo(() => {
    const contactLabel = filters.reportType === "sale" ? "Party" : "Supplier";
    const modes = [
      { value: "detail", label: "Detail" },
      { value: "party", label: `${contactLabel} Wise` },
      { value: "item", label: "Item Wise" },
      { value: "brand", label: "Brand Wise" },
    ];
    if (filters.reportType === "sale") {
      modes.push({ value: "agent", label: "Agent Wise" });
      modes.push({ value: "area", label: "Area Wise" });
    }
    return modes;
  }, [filters.reportType]);

  const appliedViewModes = useMemo(() => {
    const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";
    const modes = [
      { value: "detail", label: "Detail" },
      { value: "party", label: `${contactLabel} Wise` },
      { value: "item", label: "Item Wise" },
      { value: "brand", label: "Brand Wise" },
    ];
    if (applied.reportType === "sale") {
      modes.push({ value: "agent", label: "Agent Wise" });
      modes.push({ value: "area", label: "Area Wise" });
    }
    return modes;
  }, [applied.reportType]);

  const handleReportTypeChange = (type) => {
    setFilters((prev) => ({
      ...prev,
      reportType: type,
      contactId: "",
      agentId: "",
      areaId: "",
      viewMode: "detail",
    }));
  };

  const handleView = async () => {
    setLoading(true);
    try {
      const endpoint =
        filters.reportType === "sale"
          ? "/reports/sales/details"
          : "/reports/purchase/details";
      const bills = await fetchPagedList(endpoint, {
        from_date: filters.dateFrom || undefined,
        to_date: filters.dateTo || undefined,
        contact_id: filters.contactId || undefined,
        item_id: filters.itemId || undefined,
        brand_id: filters.brandId || undefined,
        agent_id:
          filters.reportType === "sale"
            ? filters.agentId || undefined
            : undefined,
        area_id:
          filters.reportType === "sale"
            ? filters.areaId || undefined
            : undefined,
      });

      const mapped = bills.flatMap((bill) => {
        const billId = getEntityId(bill);
        const billNo = bill?.bill_no || bill?.billNo || "";
        const billDate = bill?.date || bill?.createdAt || null;
        const contact = bill?.contact || bill?.contact_id || {};
        const contactId = getEntityId(contact);
        const contactName = contact?.name || "Unknown";
        const agentId = getEntityId(contact?.agent_id);
        const areaId = getEntityId(contact?.area_id);
        const agentName = agentMap[String(agentId)] || "-";
        const areaName = areaMap[String(areaId)] || "-";
        const billSettlementDiscount = toNumber(
          bill?.settlement_discount ?? bill?.settlementDiscount,
          0,
        );

        return (bill?.items || []).map((line, index) => {
          const itemName = line?.item_name || "Item";
          const brandName = line?.brand || "-";

          return {
            id: `${billId}-${index}`,
            billId,
            billNo,
            billDate,
            contactId,
            contactName,
            agentId,
            agentName,
            areaId,
            areaName,
            itemId: line?.item_id ? String(line.item_id) : "",
            itemName,
            brandId: line?.brand_id ? String(line.brand_id) : "",
            brandName,
            quantity: toNumber(line?.quantity ?? line?.pcs, 0),
            rate: toNumber(line?.rate, 0),
            discount: toNumber(line?.discount, 0),
            specialDiscount: toNumber(line?.special_discount, 0),
            grossAmount: toNumber(line?.gross_amount, 0),
            discountAmount: toNumber(line?.discount_amount, 0),
            totalDiscount: toNumber(line?.total_discount, 0),
            taxableAmount: toNumber(line?.taxable_amount, 0),
            gstPercent: toNumber(line?.gst_percent, 0),
            gstAmount: toNumber(line?.gst_amount, 0),
            settlementDiscount: toNumber(
              line?.settlement_discount ??
                (index === 0 ? billSettlementDiscount : 0),
              0,
            ),
            amount: toNumber(line?.amount, 0),
          };
        });
      });

      setRows(mapped);
    } catch (error) {
      console.error("Failed to load purchase report", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setRows([]);
  };

  const detailColumnLabels = useMemo(() => (
    applied.reportType === "sale"
      ? ["Date", "Bill No", "Party", "Item", "Brand", "Agent", "Area", "Qty", "Rate", "Dis%", "SpDis%", "Taxable", "GST%", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"]
      : ["Date", "Bill No", "Supplier", "Item", "Brand", "Qty", "Rate", "Dis%", "SpDis%", "Taxable", "GST%", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"]
  ), [applied.reportType]);

  const detailPdfColumnStyles = useMemo(() => (
    applied.reportType === "sale"
      ? {
          0: { cellWidth: 10 },
          1: { cellWidth: 13 },
          2: { cellWidth: 18 },
          3: { cellWidth: 21 },
          4: { cellWidth: 13 },
          5: { cellWidth: 11 },
          6: { cellWidth: 11 },
          7: { cellWidth: 7, halign: "right" },
          8: { cellWidth: 9, halign: "right" },
          9: { cellWidth: 8, halign: "right" },
          10: { cellWidth: 9, halign: "right" },
          11: { cellWidth: 11, halign: "right" },
          12: { cellWidth: 7, halign: "right" },
          13: { cellWidth: 9, halign: "right" },
          14: { cellWidth: 11, halign: "right" },
          15: { cellWidth: 11, halign: "right" },
          16: { cellWidth: 11, halign: "right" },
        }
      : {
          0: { cellWidth: 12 },
          1: { cellWidth: 14 },
          2: { cellWidth: 22 },
          3: { cellWidth: 24 },
          4: { cellWidth: 14 },
          5: { cellWidth: 8, halign: "right" },
          6: { cellWidth: 11, halign: "right" },
          7: { cellWidth: 9, halign: "right" },
          8: { cellWidth: 10, halign: "right" },
          9: { cellWidth: 13, halign: "right" },
          10: { cellWidth: 8, halign: "right" },
          11: { cellWidth: 11, halign: "right" },
          12: { cellWidth: 12, halign: "right" },
          13: { cellWidth: 11, halign: "right" },
          14: { cellWidth: 11, halign: "right" },
        }
  ), [applied.reportType]);

  const summaryGroupLabel = useMemo(() => (
    applied.viewMode === "party" ? (applied.reportType === "sale" ? "Party" : "Supplier")
    : applied.viewMode === "item" ? "Item"
    : applied.viewMode === "brand" ? "Brand"
    : applied.viewMode === "agent" ? "Agent" : "Area"
  ), [applied.viewMode, applied.reportType]);

  const buildDetailExportRows = () => {
    let runningAmount = 0;
    return filteredRows.map((row) => {
      runningAmount += toNumber(row.amount, 0);
      const base = [
        formatDate(row.billDate),
        row.billNo || "-",
        row.contactName || "-",
        row.itemName || "-",
        row.brandName || "-",
      ];
      if (applied.reportType === "sale") base.push(row.agentName || "-", row.areaName || "-");
      base.push(
        toNumber(row.quantity, 0).toLocaleString(),
        toNumber(row.rate, 0).toLocaleString(),
        toNumber(row.discount, 0).toLocaleString(),
        toNumber(row.specialDiscount, 0).toLocaleString(),
        toNumber(row.taxableAmount, 0).toLocaleString(),
        toNumber(row.gstPercent, 0).toLocaleString(),
        toNumber(row.gstAmount, 0).toLocaleString(),
        toNumber(runningAmount, 0).toLocaleString(),
        toNumber(row.settlementDiscount, 0).toLocaleString(),
        toNumber(row.amount, 0).toLocaleString(),
      );
      return base;
    });
  };

  const buildSummaryExportRows = () => {
    let runningAmount = 0;
    return summaryRows.map((row) => {
      runningAmount += toNumber(row.amount, 0);
      return [
        row.label,
        row.billCount,
        row.lineCount,
        toNumber(row.quantity, 0).toLocaleString(),
        toNumber(row.taxableAmount, 0).toLocaleString(),
        toNumber(row.gstAmount, 0).toLocaleString(),
        toNumber(runningAmount, 0).toLocaleString(),
        toNumber(row.settlementDiscount, 0).toLocaleString(),
        toNumber(row.amount, 0).toLocaleString(),
      ];
    });
  };

  const handleDownloadReport = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const reportLabel = applied.reportType === "sale" ? "Sale" : "Purchase";
    const viewLabel = appliedViewModes.find((m) => m.value === applied.viewMode)?.label || "Detail";
    const pdfMarginX = 10;
    const startY = drawBrandedReportHeader(doc, {
      title: `${activeFirmTypeLabel} ${reportLabel} Report`,
      subtitle: `Selected Date Wise | Period: ${formatDate(applied.dateFrom)} to ${formatDate(applied.dateTo)} | View: ${viewLabel} | Total Records: ${filteredRows.length}`,
      marginLeft: pdfMarginX,
      marginRight: pdfMarginX,
    });

    if (applied.viewMode === "detail") {
      const body = buildDetailExportRows();
      // Totals row
      const totalCols = detailColumnLabels.length;
      const totalsRow = Array(totalCols).fill("");
      totalsRow[0] = "TOTAL";
      const setTotal = (label, value) => {
        const index = detailColumnLabels.indexOf(label);
        if (index >= 0) totalsRow[index] = value;
      };
      setTotal("Taxable", totals.taxable.toLocaleString());
      setTotal("GST Amt", totals.gst.toLocaleString());
      setTotal("Cumm Balance", totals.amount.toLocaleString());
      setTotal("Sett. Disc", totals.settlementDiscount.toLocaleString());
      setTotal("Net Amt", totals.amount.toLocaleString());

      autoTable(doc, {
        startY,
        head: [detailColumnLabels],
        body: [...body, totalsRow],
        styles: {
          fontSize: applied.reportType === "sale" ? 5 : 5.8,
          cellPadding: { top: 1.0, right: 0.8, bottom: 1.0, left: 0.8 },
          lineColor: [156, 163, 175],
          lineWidth: 0.2,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === body.length) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [235, 235, 235];
          }
        },
        columnStyles: detailPdfColumnStyles,
        margin: { left: pdfMarginX, right: pdfMarginX },
      });
    } else {
      autoTable(doc, {
        startY,
        head: [[summaryGroupLabel, "Bills", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"]],
        body: [
          ...buildSummaryExportRows(),
          ["TOTAL", "", "", totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()],
        ],
        styles: {
          fontSize: 7,
          cellPadding: { top: 1.2, right: 1.0, bottom: 1.2, left: 1.0 },
          lineColor: [156, 163, 175],
          lineWidth: 0.2,
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: { fillColor: [235, 235, 235], textColor: 0, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 248, 248] },
        didParseCell: (data) => {
          if (data.section === "body" && data.row.index === summaryRows.length) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [235, 235, 235];
          }
        },
        columnStyles: {
          0: { cellWidth: 45 },
          1: { halign: "right" }, 2: { halign: "right" }, 3: { halign: "right" },
          4: { halign: "right" }, 5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" },
        },
        margin: { left: pdfMarginX, right: pdfMarginX },
      });
    }

    addBrandedReportFooters(doc, { marginLeft: pdfMarginX, marginRight: pdfMarginX });

    doc.save(`${activeFirmTypeLabel.toLowerCase().replace(/\s+/g, "-")}-${reportLabel.toLowerCase()}-report-${applied.dateFrom || "all"}-to-${applied.dateTo || "all"}.pdf`);
  };

  const handlePrint = () => {
    const reportLabel = applied.reportType === "sale" ? "Sale" : "Purchase";
    const viewLabel = appliedViewModes.find((m) => m.value === applied.viewMode)?.label || "Detail";
    const printRows = applied.viewMode === "detail" ? buildDetailExportRows() : buildSummaryExportRows();
    const printHeaders = applied.viewMode === "detail"
      ? detailColumnLabels
      : [summaryGroupLabel, "Bills", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"];
    const totalsRow = applied.viewMode === "detail"
      ? (() => {
          const row = Array(detailColumnLabels.length).fill("");
          row[0] = "TOTAL";
          const setTotal = (label, value) => {
            const index = detailColumnLabels.indexOf(label);
            if (index >= 0) row[index] = value;
          };
          setTotal("Taxable", totals.taxable.toLocaleString());
          setTotal("GST Amt", totals.gst.toLocaleString());
          setTotal("Cumm Balance", totals.amount.toLocaleString());
          setTotal("Sett. Disc", totals.settlementDiscount.toLocaleString());
          setTotal("Net Amt", totals.amount.toLocaleString());
          return row;
        })()
      : ["TOTAL", "", "", totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()];
    const detailLeftCount =
      applied.viewMode === "detail"
        ? applied.reportType === "sale" ? 7 : 5
        : 1;
    const colgroupHtml = applied.viewMode === "detail"
      ? (
          applied.reportType === "sale"
            ? [7, 8, 13, 15, 9, 8, 8, 6, 7, 7, 8, 9, 6, 7, 9, 9]
            : [8, 9, 16, 17, 10, 7, 8, 8, 8, 10, 7, 8, 9, 9]
        ).map((width) => `<col style="width:${width}%">`).join("")
      : [30, 9, 9, 10, 12, 10, 10, 10].map((width) => `<col style="width:${width}%">`).join("");

    const headerHtml = printHeaders
      .map((label, index) => `<th class="${index === 0 || index < detailLeftCount ? "text-left" : "text-right"}">${label}</th>`)
      .join("");
    const bodyHtml = [...printRows, totalsRow]
      .map((row, rowIndex) => {
        const isTotal = rowIndex === printRows.length;
        const cells = row
          .map((cell, cellIndex) => `<td class="${cellIndex === 0 || cellIndex < detailLeftCount ? "text-left" : "text-right"}">${cell || ""}</td>`)
          .join("");
        return `<tr class="${isTotal ? "total-row" : ""}">${cells}</tr>`;
      })
      .join("");

    const printWindow = window.open("", "_blank", "width=1200,height=800");
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>${activeFirmTypeLabel} ${reportLabel} Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 12mm; color: #111827; }
            .header { margin-bottom: 10mm; text-align: center; border: 2px solid #111827; padding: 10px 12px; }
            .brand { text-align: center; margin-bottom: 4mm; padding-bottom: 4mm; border-bottom: 1px solid #9ca3af; }
            .brand h1 { margin: 0; font-size: 18px; }
            .brand p { margin: 2px 0; font-size: 11px; color: #4b5563; }
            .title { text-align: center; font-size: 16px; font-weight: 700; margin-bottom: 3mm; }
            .meta { font-size: 11px; margin-bottom: 2mm; }
            .table-wrap { width: 100%; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10px; }
            th, td { border: 1px solid #9ca3af; padding: 6px 7px; vertical-align: top; word-wrap: break-word; }
            th { background: #e5e7eb; font-weight: 700; }
            .text-left { text-align: left; }
            .text-right { text-align: right; }
            .total-row td { font-weight: 700; background: #f3f4f6; }
            @page { size: A4 landscape; margin: 10mm; }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="brand">
              <h1>${firmName}</h1>
              ${firmLine ? `<p>${firmLine}</p>` : ""}
            </div>
            <div class="title">${activeFirmTypeLabel} Selected Date Wise ${reportLabel} Report</div>
            <div class="meta">Period: ${formatDate(applied.dateFrom)} to ${formatDate(applied.dateTo)} | View: ${viewLabel} | Records: ${filteredRows.length}</div>
            <div class="meta">${applied.reportType === "sale" ? "Party" : "Supplier"}: ${appliedContactOptions.find((c) => String(c.id) === String(applied.contactId))?.name || "All"} | Item: ${itemMap[String(applied.itemId)]?.name || "All"} | Brand: ${brandMap[String(applied.brandId)] || "All"}</div>
          </div>
          <div class="table-wrap">
            <table>
              <colgroup>${colgroupHtml}</colgroup>
              <thead><tr>${headerHtml}</tr></thead>
              <tbody>${bodyHtml}</tbody>
            </table>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 250);
  };

  const handleIndividualPrint = (row) => {
    const printContent = `
      <html>
        <head>
          <title>${applied.reportType === "sale" ? "Sale" : "Purchase"} Report - ${row.billNo}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 14mm; font-size: 12px; color: #111827; }
            .header { text-align: center; margin-bottom: 20px; border: 2px solid #111827; padding: 12px 14px; }
            .header h1 { margin: 0; font-size: 18px; }
            .header p { margin: 4px 0 0; font-size: 11px; color: #4b5563; }
            .details { margin: 20px 0; border: 1px solid #9ca3af; padding: 12px 14px; }
            .row { display: flex; margin-bottom: 8px; }
            .label { font-weight: bold; width: 120px; }
            .value { flex: 1; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { border: 1px solid #9ca3af; padding: 8px; text-align: left; }
            th { background-color: #e5e7eb; font-weight: bold; }
            .amount { text-align: right; }
            @media print { body { margin: 10px; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${applied.reportType === "sale" ? "Sale" : "Purchase"} Report Details</h1>
            <p>Individual Transaction Report</p>
          </div>

          <div class="details">
            <div class="row"><span class="label">Date:</span><span class="value">${formatDate(row.billDate)}</span></div>
            <div class="row"><span class="label">Bill No:</span><span class="value">${row.billNo}</span></div>
            <div class="row"><span class="label">${applied.reportType === "sale" ? "Party" : "Supplier"}:</span><span class="value">${row.contactName}</span></div>
            <div class="row"><span class="label">Item:</span><span class="value">${row.itemName}</span></div>
            <div class="row"><span class="label">Brand:</span><span class="value">${row.brandName}</span></div>
            ${
              applied.reportType === "sale"
                ? `
            <div class="row"><span class="label">Agent:</span><span class="value">${row.agentName}</span></div>
            <div class="row"><span class="label">Area:</span><span class="value">${row.areaName}</span></div>
            `
                : ""
            }
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="amount">Value</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Quantity</td><td class="amount">${row.quantity}</td></tr>
              <tr><td>Rate</td><td class="amount">Rs. ${toNumber(row.rate, 0).toLocaleString()}</td></tr>
              <tr><td>Discount %</td><td class="amount">${row.discount}%</td></tr>
              <tr><td>Special Discount %</td><td class="amount">${row.specialDiscount}%</td></tr>
              <tr><td>Gross Amount</td><td class="amount">Rs. ${toNumber(row.grossAmount, 0).toLocaleString()}</td></tr>
              <tr><td>Discount Amount</td><td class="amount">Rs. ${toNumber(row.discountAmount, 0).toLocaleString()}</td></tr>
              <tr><td>Taxable Amount</td><td class="amount">Rs. ${toNumber(row.taxableAmount, 0).toLocaleString()}</td></tr>
              <tr><td>GST %</td><td class="amount">${row.gstPercent}%</td></tr>
              <tr><td>GST Amount</td><td class="amount">Rs. ${toNumber(row.gstAmount, 0).toLocaleString()}</td></tr>
              <tr style="font-weight: bold; background-color: #f0f0f0;">
                <td>Net Amount</td>
                <td class="amount">Rs. ${toNumber(row.amount, 0).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div style="margin-top: 30px; text-align: center; font-size: 10px; color: #666;">
            Generated on ${new Date().toLocaleString()}
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(printContent);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleIndividualDownload = (row) => {
    const reportLabel = applied.reportType === "sale" ? "Sale" : "Purchase";
    const formatCurrencyText = (value) =>
      `Rs. ${toNumber(value, 0).toLocaleString("en-IN")}`;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    let yPos = drawBrandedReportHeader(doc, {
      title: `${activeFirmTypeLabel} ${reportLabel} Report Details`,
      subtitle: `Individual Transaction Report | Bill: ${row.billNo || "-"} | Date: ${formatDate(row.billDate)}`,
    });
    yPos += 3;

    // Transaction Details
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const details = [
      ["Date:", formatDate(row.billDate)],
      ["Bill No:", row.billNo],
      [
        `${applied.reportType === "sale" ? "Party" : "Supplier"}:`,
        row.contactName,
      ],
      ["Item:", row.itemName],
      ["Brand:", row.brandName],
    ];

    if (applied.reportType === "sale") {
      details.push(["Agent:", row.agentName]);
      details.push(["Area:", row.areaName]);
    }

    details.forEach(([label, value]) => {
      doc.text(label, 20, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value, 60, yPos);
      doc.setFont("helvetica", "bold");
      yPos += 6;
    });

    yPos += 10;

    // Amount Details Table
    const tableData = [
      ["Quantity", row.quantity.toString()],
      ["Rate", formatCurrencyText(row.rate)],
      ["Discount %", `${row.discount}%`],
      ["Special Discount %", `${row.specialDiscount}%`],
      ["Gross Amount", formatCurrencyText(row.grossAmount)],
      [
        "Discount Amount",
        formatCurrencyText(row.discountAmount),
      ],
      ["Taxable Amount", formatCurrencyText(row.taxableAmount)],
      ["GST %", `${row.gstPercent}%`],
      ["GST Amount", formatCurrencyText(row.gstAmount)],
      ["Net Amount", formatCurrencyText(row.amount)],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [["Description", "Value"]],
      body: tableData,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        lineColor: [156, 163, 175],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: "bold",
      },
      columnStyles: {
        1: { halign: "right" },
      },
      didParseCell: (data) => {
        if (
          data.section === "body" &&
          data.row.index === tableData.length - 1
        ) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 240, 240];
        }
      },
    });

    addBrandedReportFooters(doc);

    // Save PDF
    const fileName = `${activeFirmTypeLabel.replace(/\s+/g, "_")}_${reportLabel}_Report_${row.billNo || "Unknown"}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  useEffect(() => {
    setApplied(filters);
  }, [filters]);

  const handleViewRef = React.useRef(handleView);
  handleViewRef.current = handleView;

  useEffect(() => {
    handleViewRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.reportType, filters.dateFrom, filters.dateTo, filters.contactId]);

  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString() : "-";

  const filteredRows = useMemo(() => {
    const term = applied.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        applied.contactId &&
        String(row.contactId) !== String(applied.contactId)
      )
        return false;
      if (
        applied.dateFrom &&
        row.billDate &&
        new Date(row.billDate) < new Date(applied.dateFrom)
      )
        return false;
      if (
        applied.dateTo &&
        row.billDate &&
        new Date(row.billDate) > new Date(applied.dateTo)
      )
        return false;
      if (term) {
        const haystack = [
          row.billNo,
          row.contactName,
          row.itemName,
          row.brandName,
          row.agentName,
          row.areaName,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, applied]);

  // Pagination logic
  const totalPages = Math.ceil(filteredRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = filteredRows.slice(startIndex, endIndex);

  // Reset to first page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [applied]);

  const summaryRows = useMemo(() => {
    if (applied.viewMode === "detail") return [];
    const map = new Map();
    filteredRows.forEach((row) => {
      let key = "";
      let label = "";
      if (applied.viewMode === "party") {
        key = row.contactId || row.contactName;
        label = row.contactName || "Unknown";
      } else if (applied.viewMode === "item") {
        key = row.itemId || row.itemName;
        label = row.itemName || "Item";
      } else if (applied.viewMode === "brand") {
        key = row.brandId || row.brandName || "unknown";
        label = row.brandName || "Unassigned";
      } else if (applied.viewMode === "agent") {
        key = row.agentId || row.agentName || "unknown";
        label = row.agentName || "Unassigned";
      } else {
        key = row.areaId || row.areaName || "unknown";
        label = row.areaName || "Unassigned";
      }

      if (!map.has(key)) {
        map.set(key, {
          key,
          label,
          quantity: 0,
          taxableAmount: 0,
          gstAmount: 0,
          settlementDiscount: 0,
          amount: 0,
          lineCount: 0,
          billIds: new Set(),
        });
      }

      const entry = map.get(key);
      entry.quantity += toNumber(row.quantity, 0);
      entry.taxableAmount += toNumber(row.taxableAmount, 0);
      entry.gstAmount += toNumber(row.gstAmount, 0);
      entry.settlementDiscount += toNumber(row.settlementDiscount, 0);
      entry.amount += toNumber(row.amount, 0);
      entry.lineCount += 1;
      if (row.billId) entry.billIds.add(row.billId);
    });

    return Array.from(map.values()).map((entry) => ({
      key: entry.key,
      label: entry.label,
      quantity: entry.quantity,
      taxableAmount: entry.taxableAmount,
      gstAmount: entry.gstAmount,
      settlementDiscount: entry.settlementDiscount,
      amount: entry.amount,
      lineCount: entry.lineCount,
      billCount: entry.billIds.size,
    }));
  }, [filteredRows, applied.viewMode]);

  const totals = useMemo(() => {
    const list = applied.viewMode === "detail" ? filteredRows : summaryRows;
    const qty = list.reduce((sum, row) => sum + toNumber(row.quantity, 0), 0);
    const taxable = list.reduce(
      (sum, row) => sum + toNumber(row.taxableAmount, 0),
      0,
    );
    const gst = list.reduce((sum, row) => sum + toNumber(row.gstAmount, 0), 0);
    const settlementDiscount = list.reduce(
      (sum, row) => sum + toNumber(row.settlementDiscount, 0),
      0,
    );
    const amount = list.reduce((sum, row) => sum + toNumber(row.amount, 0), 0);
    return { qty, taxable, gst, settlementDiscount, amount };
  }, [filteredRows, summaryRows, applied.viewMode]);

  const stats = useMemo(() => {
    const billsSet = new Set(
      filteredRows.map((row) => row.billId).filter(Boolean),
    );
    const uniqueItems = new Set(
      filteredRows.map((row) => row.itemId).filter(Boolean),
    );
    const uniqueBrands = new Set(
      filteredRows.map((row) => row.brandId).filter(Boolean),
    );
    const uniqueContacts = new Set(
      filteredRows.map((row) => row.contactId).filter(Boolean),
    );
    const uniqueAgents = new Set(
      filteredRows.map((row) => row.agentId).filter(Boolean),
    );
    const uniqueAreas = new Set(
      filteredRows.map((row) => row.areaId).filter(Boolean),
    );

    return {
      billCount: billsSet.size,
      lineCount: filteredRows.length,
      itemCount: uniqueItems.size,
      brandCount: uniqueBrands.size,
      contactCount: uniqueContacts.size,
      agentCount: uniqueAgents.size,
      areaCount: uniqueAreas.size,
    };
  }, [filteredRows]);

  const firmMeta = getResolvedFirmMeta();
  const activeFirmTypeRaw = String(
    firmMeta?.raw?.firm_type || firmMeta?.raw?.type || "",
  );
  const activeFirmType = activeFirmTypeRaw.toUpperCase().replace(/[-\s]/g, "_");
  const activeFirmTypeLabel =
    activeFirmType === "NON_GST" || activeFirmType === "NONGST" ? "NON GST"
    : activeFirmType === "GST" || activeFirmType === "1" ? "GST"
    : "ALL";
  const firmName = firmMeta.firmName || "Firm";
  const firmAddress = [firmMeta.address, firmMeta.city, firmMeta.state, firmMeta.raw?.pincode]
    .filter(Boolean)
    .join(", ");
  const firmPhone = firmMeta.phone || "";
  const firmGstin = firmMeta.gstin || "";
  const firmLine = [
    firmAddress,
    firmPhone ? `Phone: ${firmPhone}` : "",
    firmGstin ? `GSTIN: ${firmGstin}` : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <div className="space-y-6">
      <style>{`
        .purchase-print-header { display: none; }
        .purchase-print-branding { display: none; }
        .purchase-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .purchase-print-table th, .purchase-print-table td { border: 1px solid #9ca3af; }
        @media print {
          .purchase-print-hide { display: none !important; }
          .purchase-print-header { display: block; }
          .purchase-print-branding { display: block; }
          .purchase-print-header { text-align: center; border: 2px solid #111827; padding: 10px 14px; margin-bottom: 12px; }
          .purchase-print-branding { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #9ca3af; }
          .purchase-print-table th, .purchase-print-table td { border: 1px solid #9ca3af; }
          .purchase-print-table thead th { background: #e5e7eb !important; }
          .purchase-print-summary { border-top: 1px solid #d1d5db; margin-top: 8px; padding-top: 6px; font-size: 10px; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 purchase-print-hide">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Selected Date Wise{" "}
            {filters.reportType === "sale" ? "Sale" : "Purchase"} Report
          </h1>
          <p className="text-gray-600">
            Filter {filters.reportType === "sale" ? "sales" : "purchases"} by
            date, party, item, and brand.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            className="flex items-center gap-2"
          >
            <FaSyncAlt /> Refresh
          </Button>
          <Button
            variant="outline"
            onClick={handleDownloadReport}
            className="flex items-center gap-2"
          >
            <FaDownload /> Download PDF
          </Button>
          <Button onClick={handlePrint} className="flex items-center gap-2">
            <FaPrint /> Print
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 purchase-print-hide">
        <Button
          variant={filters.reportType === "purchase" ? "primary" : "outline"}
          onClick={() => handleReportTypeChange("purchase")}
        >
          Purchase
        </Button>
        <Button
          variant={filters.reportType === "sale" ? "primary" : "outline"}
          onClick={() => handleReportTypeChange("sale")}
        >
          Sale
        </Button>
      </div>

      <div className="purchase-print-header">
        <div className="purchase-print-branding">
          <div className="text-base font-semibold">{firmName}</div>
          {firmLine ? (
            <div className="text-[10px] text-gray-600 mt-1">{firmLine}</div>
          ) : null}
        </div>
        <div className="text-lg font-semibold">
          Selected Date Wise{" "}
          {applied.reportType === "sale" ? "Sale" : "Purchase"} Report
        </div>
        <div className="mt-1 text-xs text-gray-700">
          <span className="font-semibold">From:</span>{" "}
          {formatDate(applied.dateFrom)}{" "}
          <span className="font-semibold ml-3">To:</span>{" "}
          {formatDate(applied.dateTo)}{" "}
          <span className="font-semibold ml-3">View:</span>{" "}
          {appliedViewModes.find((m) => m.value === applied.viewMode)?.label ||
            "Detail"}
        </div>
        <div className="mt-1 text-xs text-gray-700">
          <span className="font-semibold">
            {applied.reportType === "sale" ? "Party" : "Supplier"}:
          </span>{" "}
          {appliedContactOptions.find(
            (c) => String(c.id) === String(applied.contactId),
          )?.name || "All"}{" "}
          <span className="font-semibold ml-3">Item:</span>{" "}
          {itemMap[String(applied.itemId)]?.name || "All"}{" "}
          <span className="font-semibold ml-3">Brand:</span>{" "}
          {brandMap[String(applied.brandId)] || "All"}
        </div>
        {applied.reportType === "sale" && (
          <div className="mt-1 text-xs text-gray-700">
            <span className="font-semibold">Agent:</span>{" "}
            {agentMap[String(applied.agentId)] || "All"}{" "}
            <span className="font-semibold ml-3">Area:</span>{" "}
            {areaMap[String(applied.areaId)] || "All"}
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-4 purchase-print-hide">
        <h3 className="font-medium text-gray-900 mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              From Date
            </label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, dateFrom: value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Date
            </label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, dateTo: value }))
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              View Mode
            </label>
            <Select
              value={filters.viewMode}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, viewMode: value }))
              }
            >
              {viewModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {filters.reportType === "sale" ? "Party" : "Supplier"}
            </label>
            <Select
              value={filters.contactId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, contactId: value }))
              }
            >
              <option value="">
                {filters.reportType === "sale"
                  ? "All Parties"
                  : "All Suppliers"}
              </option>
              {contactOptions.map((contact) => (
                <option key={contact.id} value={contact.id}>
                  {contact.name}
                </option>
              ))}
            </Select>
          </div>
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand
            </label>
            <Select
              value={filters.brandId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, brandId: value, itemId: "" }))
              }
            >
              <option value="">All Brands</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item
            </label>
            <Select
              value={filters.itemId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, itemId: value }))
              }
            >
              <option value="">All Items</option>
              {filteredItemOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          </div> */}
          {filters.reportType === "sale" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <Select
                  value={filters.agentId}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, agentId: value }))
                  }
                >
                  <option value="">All Agents</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Area
                </label>
                <Select
                  value={filters.areaId}
                  onChange={(value) =>
                    setFilters((prev) => ({ ...prev, areaId: value }))
                  }
                >
                  <option value="">All Areas</option>
                  {areas.map((area) => (
                    <option key={area.id} value={area.id}>
                      {area.name}
                    </option>
                  ))}
                </Select>
              </div>
            </>
          )}
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <Input
              value={filters.search}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, search: value }))
              }
              placeholder="Bill no, party, item, brand"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          {applied.viewMode === "detail" ? (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Bill No</th>
                  <th className="px-2 py-2 text-left">
                    {applied.reportType === "sale" ? "Party" : "Supplier"}
                  </th>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Brand</th>
                  {applied.reportType === "sale" && (
                    <>
                      <th className="px-2 py-2 text-left">Agent</th>
                      <th className="px-2 py-2 text-left">Area</th>
                    </>
                  )}
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Rate</th>
                  <th className="px-2 py-2 text-right">Dis%</th>
                  <th className="px-2 py-2 text-right">SpDis%</th>
                  <th className="px-2 py-2 text-right">Taxable</th>
                  <th className="px-2 py-2 text-right">GST%</th>
                  <th className="px-2 py-2 text-right">GST Amt</th>
                  <th className="px-2 py-2 text-right">Sett. Disc</th>
                  <th className="px-2 py-2 text-right">Net Amt</th>
                  <th className="px-2 py-2 text-center purchase-print-hide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-500"
                      colSpan={applied.reportType === "sale" ? 17 : 15}
                    >
                      Loading report...
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0">
                      <td className="px-2 py-1">
                        {formatDate(row.billDate)}
                      </td>
                      <td className="px-2 py-1">{row.billNo || "-"}</td>
                      <td className="px-2 py-1">{row.contactName}</td>
                      <td className="px-2 py-1">{row.itemName}</td>
                      <td className="px-2 py-1">{row.brandName}</td>
                      {applied.reportType === "sale" && (
                        <>
                          <td className="px-2 py-1">{row.agentName}</td>
                          <td className="px-2 py-1">{row.areaName}</td>
                        </>
                      )}
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.rate, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.discount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.specialDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.gstPercent, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-center purchase-print-hide">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleIndividualPrint(row)}
                            className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                            title="Print Individual Report"
                          >
                            <FaPrint size={12} />
                          </button>
                          <button
                            onClick={() => handleIndividualDownload(row)}
                            className="p-1 text-green-600 hover:text-green-800 hover:bg-green-50 rounded"
                            title="Download Individual PDF"
                          >
                            <FaDownload size={12} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
                {!loading && paginatedRows.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-500"
                      colSpan={applied.reportType === "sale" ? 17 : 15}
                    >
                      No entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">
                    {applied.viewMode === "party"
                      ? applied.reportType === "sale"
                        ? "Party"
                        : "Supplier"
                      : applied.viewMode === "item"
                        ? "Item"
                        : applied.viewMode === "brand"
                          ? "Brand"
                          : applied.viewMode === "agent"
                            ? "Agent"
                            : "Area"}
                  </th>
                  <th className="px-2 py-2 text-right">Bills</th>
                  <th className="px-2 py-2 text-right">Lines</th>
                  <th className="px-2 py-2 text-right">Qty</th>
                  <th className="px-2 py-2 text-right">Taxable</th>
                  <th className="px-2 py-2 text-right">GST Amt</th>
                  <th className="px-2 py-2 text-right">Sett. Disc</th>
                  <th className="px-2 py-2 text-right">Net Amt</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-500"
                      colSpan={7}
                    >
                      Loading report...
                    </td>
                  </tr>
                ) : (
                  summaryRows.map((row) => (
                    <tr key={row.key} className="border-b last:border-b-0">
                      <td className="px-2 py-1">{row.label}</td>
                      <td className="px-2 py-1 text-right">
                        {row.billCount}
                      </td>
                      <td className="px-2 py-1 text-right">{row.lineCount}</td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1 text-right">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && summaryRows.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-6 text-center text-gray-500"
                      colSpan={8}
                    >
                      No entries found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t purchase-print-hide">
            <div className="flex items-center text-sm text-gray-700">
              <span>
                Showing {startIndex + 1} to {Math.min(endIndex, filteredRows.length)} of {filteredRows.length} entries
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <div className="flex items-center space-x-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum;
                  if (totalPages <= 5) {
                    pageNum = i + 1;
                  } else if (currentPage <= 3) {
                    pageNum = i + 1;
                  } else if (currentPage >= totalPages - 2) {
                    pageNum = totalPages - 4 + i;
                  } else {
                    pageNum = currentPage - 2 + i;
                  }
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 text-sm rounded ${
                        currentPage === pageNum
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* <div className="mt-4 border-t pt-3 text-xs text-gray-700 purchase-print-summary"> */}
        {/* <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              Bills:{" "}
              <span className="font-semibold">{stats.billCount}</span>
            </div>
            <div>
              Lines: <span className="font-semibold">{stats.lineCount}</span>
            </div>
            <div>
              Items: <span className="font-semibold">{stats.itemCount}</span>
            </div>
            <div>
              Brands: <span className="font-semibold">{stats.brandCount}</span>
            </div>
            <div>
              {applied.reportType === "sale" ? "Parties" : "Suppliers"}:{" "}
              <span className="font-semibold">{stats.contactCount}</span>
            </div>
            {applied.reportType === "sale" && (
              <>
                <div>
                  Agents:{" "}
                  <span className="font-semibold">{stats.agentCount}</span>
                </div>
                <div>
                  Areas:{" "}
                  <span className="font-semibold">{stats.areaCount}</span>
                </div>
              </>
            )}
            <div>
              Total Qty:{" "}
              <span className="font-semibold">
                {totals.qty.toLocaleString()}
              </span>
            </div>
            <div>
              Taxable:{" "}
              <span className="font-semibold">
                {totals.taxable.toLocaleString()}
              </span>
            </div>
            <div>
              GST:{" "}
              <span className="font-semibold">
                {totals.gst.toLocaleString()}
              </span>
            </div>
            <div>
              Net:{" "}
              <span className="font-semibold">
                Rs. {totals.amount.toLocaleString()}
              </span>
            </div>
          </div>
          {/* <div className="mt-2 text-center text-gray-500 purchase-print-hide">
            <small>💡 Tip: Use the action buttons in each row to print or download individual reports</small>
          </div> */}
        {/* </div> */}
      </div>
    </div>
  );
};

export default PurchaseDateWiseReport;
