import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import useStore from "../../store";
import {
  getResponseData,
  getResponseList,
  getResponseMeta,
  toNumber,
} from "../../services/apiUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FaPrint, FaSyncAlt } from "react-icons/fa";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
} from "../../utils/reportPdf";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";

const GST_REPORT_TYPES = [
  { label: "All", value: "all" },
  { label: "Sale", value: "sale" },
  { label: "Purchase", value: "purchase" },
  { label: "Sale Return", value: "sale_return" },
  { label: "Purchase Return", value: "purchase_return" },
  { label: "Return (All)", value: "return" },
];

const GSTReportDetails = () => {
  const { showToast } = useStore();

  const [filters, setFilters] = useState({
    type: "sale",
    dateFrom: getFinancialYearStartDate(),
    dateTo: getTodayDate(),
    acName: "",
    gstin: "",
    hsnCode: "",
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
    totalRecords: 0,
  });

  const selectedTypeLabel =
    GST_REPORT_TYPES.find((option) => option.value === filters.type)?.label ||
    filters.type;

  const handlePrint = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const marginX = 8;
    const startY = drawBrandedReportHeader(doc, {
      title: "GST Report Details",
      subtitle: `Type: ${selectedTypeLabel} | From: ${formatDate(filters.dateFrom)} | To: ${formatDate(filters.dateTo)} | Records: ${filteredRows.length}`,
      marginLeft: marginX,
      marginRight: marginX,
    });

    const bodyRows = filteredRows.map((row) => [
      formatDate(row.date),
      row.vno || "-",
      row.acName || "-",
      row.gstin || "-",
      row.itemName || "-",
      row.hsnCode || "-",
      toNumber(row.pcs, 0).toLocaleString("en-IN"),
      toNumber(row.rate, 0).toLocaleString("en-IN"),
      toNumber(row.dis, 0).toLocaleString("en-IN"),
      toNumber(row.spDis, 0).toLocaleString("en-IN"),
      toNumber(row.itemDiscount, 0).toLocaleString("en-IN"),
      toNumber(row.itemDis2, 0).toLocaleString("en-IN"),
      toNumber(row.dis3, 0).toLocaleString("en-IN"),
      toNumber(row.taxableAmount, 0).toLocaleString("en-IN"),
      toNumber(row.gstPercent, 0).toLocaleString("en-IN"),
      toNumber(row.gstAmount, 0).toLocaleString("en-IN"),
      toNumber(row.sgstAmount, 0).toLocaleString("en-IN"),
      toNumber(row.cgstAmount, 0).toLocaleString("en-IN"),
      toNumber(row.igstAmount, 0).toLocaleString("en-IN"),
      toNumber(row.net, 0).toLocaleString("en-IN"),
    ]);

    const footRow = [[
      "",
      "",
      "TOTAL",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      totals.taxable.toLocaleString("en-IN"),
      "",
      totals.gst.toLocaleString("en-IN"),
      totals.sgst.toLocaleString("en-IN"),
      totals.cgst.toLocaleString("en-IN"),
      totals.igst.toLocaleString("en-IN"),
      totals.net.toLocaleString("en-IN"),
    ]];

    autoTable(doc, {
      startY,
      head: [["Date", "Vno", "Ac Name", "GSTIN", "Item", "HSN", "Pcs", "Rate", "Dis%", "SpDis%", "Item Disc", "Item Dis2", "Dis3", "Taxable", "GST%", "GST Amt", "SGST", "CGST", "IGST", "Net"]],
      body: bodyRows,
      foot: footRow,
      styles: {
        fontSize: 4.8,
        cellPadding: { top: 1.2, right: 1.0, bottom: 1.2, left: 1.0 },
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [31, 41, 55],
        overflow: "ellipsize",
        valign: "middle",
      },
      headStyles: {
        fillColor: [226, 232, 240],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        halign: "center",
        lineColor: [148, 163, 184],
      },
      footStyles: {
        fillColor: [241, 245, 249],
        textColor: [15, 23, 42],
        fontStyle: "bold",
        lineColor: [148, 163, 184],
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 13, halign: "center" },
        1: { cellWidth: 11, halign: "left" },
        2: { cellWidth: 16, halign: "left" },
        3: { cellWidth: 20, halign: "left" },
        4: { cellWidth: 15, halign: "left" },
        5: { cellWidth: 10, halign: "left" },
        6: { cellWidth: 8, halign: "right" },
        7: { cellWidth: 10, halign: "right" },
        8: { cellWidth: 8, halign: "right" },
        9: { cellWidth: 9, halign: "right" },
        10: { cellWidth: 9, halign: "right" },
        11: { cellWidth: 9, halign: "right" },
        12: { cellWidth: 8, halign: "right" },
        13: { cellWidth: 11, halign: "right" },
        14: { cellWidth: 8, halign: "right" },
        15: { cellWidth: 10, halign: "right" },
        16: { cellWidth: 9, halign: "right" },
        17: { cellWidth: 9, halign: "right" },
        18: { cellWidth: 9, halign: "right" },
        19: { cellWidth: 12, halign: "right" },
      },
      didParseCell: (data) => {
        const numericColumns = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
        if (numericColumns.includes(data.column.index)) {
          data.cell.styles.halign = "right";
        }
        if ((data.section === "body" || data.section === "foot") && data.column.index === 2) {
          data.cell.styles.fontStyle = "bold";
        }
      },
      margin: { left: marginX, right: marginX, bottom: 18 },
      tableWidth: 194,
    });

    addBrandedReportFooters(doc, { marginLeft: marginX, marginRight: marginX });

    doc.save(`gst-report-${filters.type}-${filters.dateFrom || "all"}-to-${filters.dateTo || "all"}.pdf`);
  };

  const handleIndividualPrint = (row) => {
    const printContent = `
      <html>
        <head>
          <title>GST Report - ${row.vno}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 14mm; font-size: 12px; color: #111827; }
            .header { text-align: center; margin-bottom: 16px; border: 2px solid #111827; padding: 12px 14px; }
            .header h1 { margin: 0; font-size: 18px; }
            .header p { margin: 4px 0 0; font-size: 11px; color: #4b5563; }
            .details { margin: 18px 0; border: 1px solid #9ca3af; padding: 12px 14px; }
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
            <h1>GST Report Details</h1>
            <p>Individual Transaction Report</p>
          </div>
          
          <div class="details">
            <div class="row"><span class="label">Date:</span><span class="value">${formatDate(row.date)}</span></div>
            <div class="row"><span class="label">Voucher No:</span><span class="value">${row.vno}</span></div>
            <div class="row"><span class="label">Account Name:</span><span class="value">${row.acName}</span></div>
            <div class="row"><span class="label">GSTIN:</span><span class="value">${row.gstin}</span></div>
            <div class="row"><span class="label">Item Name:</span><span class="value">${row.itemName}</span></div>
            <div class="row"><span class="label">HSN Code:</span><span class="value">${row.hsnCode}</span></div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Description</th>
                <th class="amount">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>Quantity (Pcs)</td><td class="amount">${row.pcs}</td></tr>
              <tr><td>Rate</td><td class="amount">₹${toNumber(row.rate, 0).toLocaleString()}</td></tr>
              <tr><td>Discount %</td><td class="amount">${row.dis}%</td></tr>
              <tr><td>Special Discount %</td><td class="amount">${row.spDis}%</td></tr>
              <tr><td>Discount 3</td><td class="amount">${toNumber(row.dis3, 0).toLocaleString()}</td></tr>
              <tr><td>Taxable Amount</td><td class="amount">₹${toNumber(row.taxableAmount, 0).toLocaleString()}</td></tr>
              <tr><td>GST %</td><td class="amount">${row.gstPercent}%</td></tr>
              <tr><td>GST Amount</td><td class="amount">₹${toNumber(row.gstAmount, 0).toLocaleString()}</td></tr>
              <tr><td>SGST Amount</td><td class="amount">₹${toNumber(row.sgstAmount, 0).toLocaleString()}</td></tr>
              <tr><td>CGST Amount</td><td class="amount">₹${toNumber(row.cgstAmount, 0).toLocaleString()}</td></tr>
              <tr><td>IGST Amount</td><td class="amount">₹${toNumber(row.igstAmount, 0).toLocaleString()}</td></tr>
              <tr style="font-weight: bold; background-color: #f0f0f0;">
                <td>Net Amount</td>
                <td class="amount">₹${toNumber(row.net, 0).toLocaleString()}</td>
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
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    let yPos = drawBrandedReportHeader(doc, {
      title: "GST Report Details",
      subtitle: `Individual Transaction Report | Voucher: ${row.vno || "-"} | Date: ${formatDate(row.date)}`,
    });
    yPos += 3;

    // Transaction Details
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    const details = [
      ["Date:", formatDate(row.date)],
      ["Voucher No:", row.vno],
      ["Account Name:", row.acName],
      ["GSTIN:", row.gstin],
      ["Item Name:", row.itemName],
      ["HSN Code:", row.hsnCode],
    ];

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
      ["Quantity (Pcs)", row.pcs.toString()],
      ["Rate", `₹${toNumber(row.rate, 0).toLocaleString()}`],
      ["Discount %", `${row.dis}%`],
      ["Special Discount %", `${row.spDis}%`],
      ["Discount 3", toNumber(row.dis3, 0).toLocaleString()],
      ["Taxable Amount", `₹${toNumber(row.taxableAmount, 0).toLocaleString()}`],
      ["GST %", `${row.gstPercent}%`],
      ["GST Amount", `₹${toNumber(row.gstAmount, 0).toLocaleString()}`],
      ["SGST Amount", `₹${toNumber(row.sgstAmount, 0).toLocaleString()}`],
      ["CGST Amount", `₹${toNumber(row.cgstAmount, 0).toLocaleString()}`],
      ["IGST Amount", `₹${toNumber(row.igstAmount, 0).toLocaleString()}`],
      ["Net Amount", `₹${toNumber(row.net, 0).toLocaleString()}`],
    ];

    autoTable(doc, {
      startY: yPos,
      head: [["Description", "Amount"]],
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
    const fileName = `GST_Report_${row.vno || "Unknown"}_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);
  };

  const handleRefresh = () => {
    setFilters({
      type: "sale",
      dateFrom: getFinancialYearStartDate(),
      dateTo: getTodayDate(),
      acName: "",
      gstin: "",
      hsnCode: "",
    });
    setRows([]);
    setPagination({ page: 1, limit: 50, totalPages: 1, totalRecords: 0 });
  };

  const handleView = async () => {
    setLoading(true);
    try {
      // Clean up parameters to match API specification
      const params = {
        type: filters.type,
        from_date: filters.dateFrom || undefined,
        to_date: filters.dateTo || undefined,
        ac_name: filters.acName || undefined,
        gstin: filters.gstin || undefined,
        hsn_code: filters.hsnCode || undefined,
      };

      // Remove undefined values
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });

      const res = await api.get("/reports/gst-report", { params });
      const payload = getResponseData(res) || {};
      const entries = Array.isArray(payload.entries)
        ? payload.entries
        : Array.isArray(payload)
          ? payload
          : [];

      const mapped = entries.map((e) => ({
        date: e.date,
        vno: e.vno ?? e.v_no ?? "",
        acName: e.ac_name || "",
        gstin: e.gstin || "",
        itemName: e.item_name || "",
        hsnCode: e.hsn_code || "",
        pcs: toNumber(e.pcs, 0),
        rate: toNumber(e.rate, 0),
        dis: toNumber(e.discount, 0),
        spDis: toNumber(e.special_discount, 0),
        itemDiscount: toNumber(e.item_discount, 0),
        itemDis2: toNumber(e.item_dis2, 0),
        // Keep compatibility with older records where this value lived in item_discount.
        dis3: toNumber(e.dis3 || 0, 0),
        taxableAmount: toNumber(e.taxable_amount, 0),
        gstPercent: toNumber(e.gst_percent, 0),
        gstAmount: toNumber(e.gst_amount, 0),
        sgstAmount: toNumber(e.sgst_amount, 0),
        cgstAmount: toNumber(e.cgst_amount, 0),
        igstAmount: toNumber(e.igst_amount, 0),
        net: toNumber(e.net_amount, 0),
      }));

      setRows(mapped);
    } catch (error) {
      console.error("Failed to load GST report", error);
      showToast(
        error?.response?.data?.message || "Failed to load GST report",
        "error",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value) =>
    value ? new Date(value).toLocaleDateString() : "-";

  useEffect(() => {
    const timeout = setTimeout(() => {
      handleView();
    }, 300);
    return () => clearTimeout(timeout);
  }, [
    filters.type,
    filters.dateFrom,
    filters.dateTo,
    filters.acName,
    filters.gstin,
    filters.hsnCode,
  ]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        filters.acName &&
        !row.acName.toLowerCase().includes(filters.acName.toLowerCase())
      )
        return false;
      if (
        filters.gstin &&
        !row.gstin.toLowerCase().includes(filters.gstin.toLowerCase())
      )
        return false;
      if (
        filters.hsnCode &&
        !row.hsnCode.toLowerCase().includes(filters.hsnCode.toLowerCase())
      )
        return false;
      if (filters.dateFrom && new Date(row.date) < new Date(filters.dateFrom))
        return false;
      if (filters.dateTo && new Date(row.date) > new Date(filters.dateTo))
        return false;
      return true;
    });
  }, [rows, filters]);

  const totals = useMemo(() => {
    const taxable = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.taxableAmount, 0),
      0,
    );
    const gst = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.gstAmount, 0),
      0,
    );
    const sgst = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.sgstAmount, 0),
      0,
    );
    const cgst = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.cgstAmount, 0),
      0,
    );
    const igst = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.igstAmount, 0),
      0,
    );
    const net = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.net, 0),
      0,
    );
    return { taxable, gst, sgst, cgst, igst, net };
  }, [filteredRows]);

  return (
    <div className="space-y-6">
      <style>{`
        .gst-print-header { display: none; }
        .gst-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .gst-print-table th, .gst-print-table td { border: 1px solid #9ca3af; }
        .gst-col-text { text-align: left; }
        .gst-col-date { text-align: center; white-space: nowrap; }
        .gst-col-num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
        .gst-col-wide { min-width: 120px; }
        .gst-col-medium { min-width: 90px; }
        .gst-col-gstin { min-width: 150px; }
        .gst-col-hsn { min-width: 90px; }
        @media print {
          .gst-print-hide { display: none !important; }
          .gst-print-header { display: block; }
          .gst-print-header { text-align: center; border: 2px solid #111827; padding: 10px 14px; margin-bottom: 12px; }
          .gst-print-table th, .gst-print-table td { border: 1px solid #9ca3af; }
          .gst-print-table thead th { background: #e5e7eb !important; }
          .gst-print-summary { border-top: 1px solid #d1d5db; margin-top: 8px; padding-top: 6px; font-size: 10px; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 gst-print-hide">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            GST Report Details
          </h1>
          <p className="text-gray-600">
            GST line-item details for sales, purchases, and returns.
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
          <Button onClick={handlePrint} className="flex items-center gap-2">
            <FaPrint /> Print
          </Button>
        </div>
      </div>

      <div className="gst-print-header">
        <div className="text-lg font-semibold">GST Report Details</div>
        <div className="text-xs text-gray-600 mt-1">
          GST line-item details for sales, purchases, and returns.
        </div>
        <div className="mt-2 text-xs text-gray-700">
          <span className="font-semibold">Type:</span> {selectedTypeLabel}{" "}
          <span className="font-semibold ml-3">From:</span>{" "}
          {formatDate(filters.dateFrom)}{" "}
          <span className="font-semibold ml-3">To:</span>{" "}
          {formatDate(filters.dateTo)}
        </div>
        <div className="mt-1 text-xs text-gray-700">
          <span className="font-semibold">A/c Name:</span>{" "}
          {filters.acName || "-"}{" "}
          <span className="font-semibold ml-3">GSTIN:</span>{" "}
          {filters.gstin || "-"}{" "}
          <span className="font-semibold ml-3">HSN:</span>{" "}
          {filters.hsnCode || "-"}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 gst-print-hide">
        <h3 className="font-medium text-gray-900 mb-3">Filters</h3>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <Select
              value={filters.type}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, type: value }))
              }
            >
              {GST_REPORT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </div>
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
              A/c Name
            </label>
            <Input
              value={filters.acName}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, acName: value }))
              }
              placeholder="Filter by account/contact name"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              GSTIN
            </label>
            <Input
              value={filters.gstin}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, gstin: value }))
              }
              placeholder="Filter by GSTIN"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              HSN Code
            </label>
            <Input
              value={filters.hsnCode}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, hsnCode: value }))
              }
              placeholder="Filter by HSN code"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs gst-print-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Vno</th>
                <th className="px-2 py-2 text-left">AcName</th>
                <th className="px-2 py-2 text-left">GSTIN</th>
                <th className="px-2 py-2 text-left">ItemName</th>
                <th className="px-2 py-2 text-left">HSNCode</th>
                <th className="px-2 py-2 text-right">Pcs</th>
                <th className="px-2 py-2 text-right">Rate</th>
                <th className="px-2 py-2 text-right">Dis%</th>
                <th className="px-2 py-2 text-right">SpDis%</th>
                <th className="px-2 py-2 text-right">Item Disc</th>
                <th className="px-2 py-2 text-right">Item Dis2</th>
                <th className="px-2 py-2 text-right">Dis3</th>
                <th className="px-2 py-2 text-right">Taxable Amount</th>
                <th className="px-2 py-2 text-right">Gst%</th>
                <th className="px-2 py-2 text-right">Gst Amount</th>
                <th className="px-2 py-2 text-right">SGST Amount</th>
                <th className="px-2 py-2 text-right">CGST Amount</th>
                <th className="px-2 py-2 text-right">IGST Amount</th>
                <th className="px-2 py-2 text-right">Net</th>
                <th className="px-2 py-2 text-center gst-print-hide">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={21}
                  >
                    Loading GST report...
                  </td>
                </tr>
              ) : filters.type === "all" ? (
                (() => {
                  const sections = [
                    { title: "Purchase Return", key: "Purchase Return" },
                    { title: "Purchase", key: "Purchase" },
                    { title: "Sale Return", key: "Sale Return" },
                    { title: "Sale", key: "Sale" },
                  ];
                  return sections.map((sec) => {
                    const sectionRows = filteredRows.filter((r) => r.type === sec.key);
                    if (sectionRows.length === 0) return null;

                    const secTaxable = sectionRows.reduce((sum, r) => sum + toNumber(r.taxableAmount, 0), 0);
                    const secGst = sectionRows.reduce((sum, r) => sum + toNumber(r.gstAmount, 0), 0);
                    const secSgst = sectionRows.reduce((sum, r) => sum + toNumber(r.sgstAmount, 0), 0);
                    const secCgst = sectionRows.reduce((sum, r) => sum + toNumber(r.cgstAmount, 0), 0);
                    const secIgst = sectionRows.reduce((sum, r) => sum + toNumber(r.igstAmount, 0), 0);
                    const secNet = sectionRows.reduce((sum, r) => sum + toNumber(r.net, 0), 0);

                    return (
                      <React.Fragment key={sec.key}>
                        <tr className="bg-slate-100 border-t border-b border-slate-200">
                          <td colSpan={21} className="px-3 py-1.5 font-bold text-slate-700 text-xs">
                            {sec.title.toUpperCase()} ({sectionRows.length} items)
                          </td>
                        </tr>
                        {sectionRows.map((row, idx) => (
                          <tr
                            key={`${row.vno}-${idx}`}
                            className="border-b last:border-b-0"
                          >
                            <td className="px-2 py-1 gst-col-date">{formatDate(row.date)}</td>
                            <td className="px-2 py-1 gst-col-text">{row.vno}</td>
                            <td className="px-2 py-1 gst-col-text gst-col-medium font-semibold">{row.acName}</td>
                            <td className="px-2 py-1 gst-col-text gst-col-gstin">{row.gstin}</td>
                            <td className="px-2 py-1 gst-col-text gst-col-wide">{row.itemName}</td>
                            <td className="px-2 py-1 gst-col-text gst-col-hsn">{row.hsnCode}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.pcs, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.rate, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.dis, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.spDis, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.itemDiscount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.itemDis2, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.dis3, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.taxableAmount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.gstPercent, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.gstAmount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.sgstAmount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.cgstAmount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.igstAmount, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 gst-col-num">{toNumber(row.net, 0).toLocaleString()}</td>
                            <td className="px-2 py-1 text-center gst-print-hide">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => handleIndividualPrint(row)}
                                  className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                                  title="Print Individual Report"
                                >
                                  <FaPrint size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 border-b font-bold text-slate-800 border-slate-200">
                          <td colSpan={6} className="px-3 py-1.5 text-center text-xs">
                            SUBTOTAL ({sec.title.toUpperCase()})
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secTaxable.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs"></td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secGst.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secSgst.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secCgst.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secIgst.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 text-right text-xs font-bold text-slate-900">
                            ₹{secNet.toLocaleString()}
                          </td>
                          <td className="px-2 py-1.5 gst-print-hide"></td>
                        </tr>
                      </React.Fragment>
                    );
                  });
                })()
              ) : (
                filteredRows.map((row, idx) => (
                  <tr
                    key={`${row.vno}-${idx}`}
                    className="border-b last:border-b-0"
                  >
                    <td className="px-2 py-1 gst-col-date">{formatDate(row.date)}</td>
                    <td className="px-2 py-1 gst-col-text">{row.vno}</td>
                    <td className="px-2 py-1 gst-col-text gst-col-medium font-semibold">{row.acName}</td>
                    <td className="px-2 py-1 gst-col-text gst-col-gstin">{row.gstin}</td>
                    <td className="px-2 py-1 gst-col-text gst-col-wide">{row.itemName}</td>
                    <td className="px-2 py-1 gst-col-text gst-col-hsn">{row.hsnCode}</td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.pcs, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.rate, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.dis, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.spDis, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.itemDiscount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.itemDis2, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.dis3, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.taxableAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.gstPercent, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.gstAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.sgstAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.cgstAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.igstAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 gst-col-num">
                      {toNumber(row.net, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-center gst-print-hide">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleIndividualPrint(row)}
                          className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                          title="Print Individual Report"
                        >
                          <FaPrint size={12} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={21}
                  >
                    No GST report entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 border-t pt-3 text-xs text-gray-700 gst-print-summary">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              Records:{" "}
              <span className="font-semibold">{filteredRows.length}</span>
            </div>
            <div>
              Taxable:{" "}
              <span className="font-semibold">
                ₹{totals.taxable.toLocaleString()}
              </span>
            </div>
            <div>
              GST:{" "}
              <span className="font-semibold">
                ₹{totals.gst.toLocaleString()}
              </span>
            </div>
            <div>
              SGST:{" "}
              <span className="font-semibold">
                ₹{totals.sgst.toLocaleString()}
              </span>
            </div>
            <div>
              CGST:{" "}
              <span className="font-semibold">
                ₹{totals.cgst.toLocaleString()}
              </span>
            </div>
            <div>
              IGST:{" "}
              <span className="font-semibold">
                ₹{totals.igst.toLocaleString()}
              </span>
            </div>
            <div>
              Net:{" "}
              <span className="font-semibold">
                ₹{totals.net.toLocaleString()}
              </span>
            </div>
          </div>
          {/* <div className="mt-2 text-center text-gray-500 gst-print-hide">
            <small>💡 Tip: Use the action buttons in each row to print or download individual reports</small>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default GSTReportDetails;
