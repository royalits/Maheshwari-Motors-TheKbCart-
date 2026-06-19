import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseList,
  getResponseMeta,
  toNumber,
} from "../../services/apiUtils";
import { FaPrint, FaSyncAlt } from "react-icons/fa";
import {
  getFinancialYearStartDate,
  getTodayDate,
} from "../../utils/dateHelpers";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
  getResolvedFirmMeta,
} from "../../utils/reportPdf";

const INITIAL_FILTERS = {
  dateFrom: getFinancialYearStartDate(),
  dateTo: getTodayDate(),
  returnType: "all",
  search: "",
};

const DamageItemReport = () => {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [returns, setReturns] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchPagedList = async (url, params = {}, maxPages = 200) => {
    let all = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const res = await api.get(url, {
        params: { page, limit: 200, ...params },
      });
      const list = getResponseList(res) || [];
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

  const loadReturns = async () => {
    setLoading(true);
    try {
      const params = {
        from_date: applied.dateFrom || undefined,
        to_date: applied.dateTo || undefined,
      };
      const list = await fetchPagedList("/returns", params);
      setReturns(list);
    } catch (error) {
      console.error("Failed to load returns for damage report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReturns();
  }, [applied.dateFrom, applied.dateTo]);

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
  };

  const handleApplyFilters = () => {
    setApplied(filters);
  };

  // Flatten all items across all returned vouchers that are marked as damaged
  const damagedItems = useMemo(() => {
    const list = [];
    returns.forEach((ret) => {
      const returnNo = ret.return_no || ret.returnNo || "-";
      const returnType = ret.return_type || ret.returnType || "sale_return";
      const date = ret.date || ret.createdAt;
      const partyName = ret.contact_id?.name || ret.contactName || "Unknown";
      const note = ret.note || "";

      (ret.items || []).forEach((line) => {
        if (line.is_damaged === true) {
          const itemRef = line.item_id || {};
          const itemId = getEntityId(itemRef) || line.item_id;
          const itemName = itemRef.item_name || itemRef.name || "Unknown Item";
          const partNo = itemRef.item_id || itemRef.part_no || "";
          const barcode = itemRef.barcode || "";

          const qty = toNumber(line.quantity ?? line.qty, 0);
          const rate = toNumber(line.rate, 0);
          const gstPercent = toNumber(line.gst_percent, 0);
          const amount = toNumber(line.amount, 0);
          const taxableAmount = toNumber(line.taxable_amount, 0);

          list.push({
            id: `${ret._id || ret.id}-${itemId}`,
            returnNo,
            returnType,
            date,
            partyName,
            itemName,
            partNo,
            barcode,
            qty,
            rate,
            gstPercent,
            amount,
            taxableAmount,
            note,
          });
        }
      });
    });

    // Sort by date descending
    return list.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [returns]);

  // Apply frontend filters (search and returnType)
  const filteredRows = useMemo(() => {
    let rows = damagedItems;

    if (applied.returnType !== "all") {
      rows = rows.filter((r) => r.returnType === applied.returnType);
    }

    const term = applied.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter(
        (r) =>
          r.returnNo.toLowerCase().includes(term) ||
          r.partyName.toLowerCase().includes(term) ||
          r.itemName.toLowerCase().includes(term) ||
          r.partNo.toLowerCase().includes(term) ||
          r.barcode.toLowerCase().includes(term),
      );
    }

    return rows;
  }, [damagedItems, applied.returnType, applied.search]);

  // Calculate totals
  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, r) => {
        acc.qty += r.qty;
        acc.amount += r.amount;
        acc.count += 1;
        return acc;
      },
      { qty: 0, amount: 0, count: 0 },
    );
  }, [filteredRows]);

  const handlePrint = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const fyLabel = `Period: ${applied.dateFrom || "-"} to ${applied.dateTo || "-"}`;
    const startY = drawBrandedReportHeader(doc, {
      title: "Damage Item Report",
      subtitle: `${fyLabel} | Items: ${filteredRows.length}`,
      marginLeft: 10,
      marginRight: 10,
    });

    autoTable(doc, {
      startY,
      head: [
        [
          "Date",
          "Return No",
          "Type",
          "Party/Supplier",
          "Item Name",
          "Qty",
          "Rate",
          "GST %",
          "Amount",
          "Note",
        ],
      ],
      body: [
        ...filteredRows.map((row) => [
          row.date ? new Date(row.date).toLocaleDateString() : "-",
          row.returnNo,
          row.returnType === "sale_return" ? "Sale Return" : "Purchase Return",
          row.partyName,
          row.itemName + (row.partNo ? ` (${row.partNo})` : ""),
          row.qty.toLocaleString(),
          row.rate.toFixed(2),
          `${row.gstPercent}%`,
          row.amount.toFixed(2),
          row.note || "-",
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          "",
          totals.qty.toLocaleString(),
          "",
          "",
          totals.amount.toFixed(2),
          "",
        ],
      ],
      styles: {
        fontSize: 7.5,
        cellPadding: 1.8,
        lineColor: [156, 163, 175],
        lineWidth: 0.15,
      },
      headStyles: {
        fillColor: [51, 65, 85],
        textColor: 255,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filteredRows.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [226, 232, 240];
        }
      },
      columnStyles: {
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "center" },
        8: { halign: "right" },
      },
      margin: { left: 10, right: 10 },
    });

    addBrandedReportFooters(doc, { marginLeft: 10, marginRight: 10 });
    doc.save(`damage-item-report-${applied.dateFrom}-to-${applied.dateTo}.pdf`);
  };

  const formatRs = (value) => `Rs ${toNumber(value, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const firmMeta = getResolvedFirmMeta();
  const firmName = firmMeta.firmName || "Firm";

  return (
    <div className="space-y-6">
      <style>{`
        .damage-print-header { display: none; }
        .damage-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .damage-print-table th, .damage-print-table td { border: 1px solid #9ca3af; }
        @media print {
          .damage-print-hide { display: none !important; }
          .damage-print-header { display: block; text-align: center; border: 2px solid #111827; padding: 10px; margin-bottom: 12px; }
          .damage-print-table thead th { background: #e5e7eb !important; }
          @page { size: A4 portrait; margin: 10mm; }
        }
      `}</style>

      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 damage-print-hide">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Damage Item Report</h1>
          <p className="text-gray-600">
            Detailed list of returned items marked as damaged.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRefresh} className="flex items-center gap-2">
            <FaSyncAlt /> Reset
          </Button>
          <Button onClick={handlePrint} className="flex items-center gap-2">
            <FaPrint /> Print / Export PDF
          </Button>
        </div>
      </div>

      {/* Filters Card */}
      <div className="bg-white border rounded-lg p-4 space-y-4 damage-print-hide">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              From Date
            </label>
            <Input
              type="date"
              value={filters.dateFrom}
              onChange={(val) => setFilters((prev) => ({ ...prev, dateFrom: val }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              To Date
            </label>
            <Input
              type="date"
              value={filters.dateTo}
              onChange={(val) => setFilters((prev) => ({ ...prev, dateTo: val }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Return Type
            </label>
            <Select
              value={filters.returnType}
              onChange={(val) => setFilters((prev) => ({ ...prev, returnType: val }))}
            >
              <option value="all">All Returns</option>
              <option value="sale_return">Sale Return</option>
              <option value="purchase_return">Purchase Return</option>
            </Select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Search
            </label>
            <Input
              value={filters.search}
              onChange={(val) => setFilters((prev) => ({ ...prev, search: val }))}
              placeholder="Return No / Party / Item..."
            />
          </div>
          <div>
            <Button className="w-full" onClick={handleApplyFilters}>
              Apply Filters
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 damage-print-hide">
        <div className="bg-rose-50 border border-rose-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-rose-700 uppercase tracking-wider font-semibold">
              Total Damaged Qty
            </div>
            <div className="text-2xl font-bold text-rose-900 mt-1">
              {totals.qty.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="bg-amber-50 border border-amber-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-amber-700 uppercase tracking-wider font-semibold">
              Total Loss Value (incl. GST)
            </div>
            <div className="text-2xl font-bold text-amber-900 mt-1">
              {formatRs(totals.amount)}
            </div>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-blue-700 uppercase tracking-wider font-semibold">
              Damaged Lines Count
            </div>
            <div className="text-2xl font-bold text-blue-900 mt-1">
              {totals.count}
            </div>
          </div>
        </div>
      </div>

      {/* Report Table */}
      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs damage-print-table">
            <thead className="bg-gray-100 text-gray-700">
              <tr>
                <th className="border px-3 py-2 text-left">Date</th>
                <th className="border px-3 py-2 text-left">Return No</th>
                <th className="border px-3 py-2 text-left">Type</th>
                <th className="border px-3 py-2 text-left">Party/Supplier</th>
                <th className="border px-3 py-2 text-left">Item Name</th>
                <th className="border px-3 py-2 text-right">Damaged Qty</th>
                <th className="border px-3 py-2 text-right">Rate</th>
                <th className="border px-3 py-2 text-center">GST %</th>
                <th className="border px-3 py-2 text-right">Amount</th>
                <th className="border px-3 py-2 text-left">Note/Remarks</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="border px-3 py-6 text-center text-gray-500 font-medium">
                    Loading damage report data...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="border px-3 py-6 text-center text-gray-500">
                    No damaged returned items found for selected filters.
                  </td>
                </tr>
              ) : (
                <>
                  {filteredRows.map((row) => (
                    <tr key={row.id} className="border-b hover:bg-gray-50">
                      <td className="border px-3 py-2 whitespace-nowrap">
                        {row.date ? new Date(row.date).toLocaleDateString() : "-"}
                      </td>
                      <td className="border px-3 py-2 font-medium">{row.returnNo}</td>
                      <td className="border px-3 py-2">
                        {row.returnType === "sale_return" ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-800">
                            Sale Return
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-800">
                            Purchase Return
                          </span>
                        )}
                      </td>
                      <td className="border px-3 py-2 max-w-[150px] truncate">{row.partyName}</td>
                      <td className="border px-3 py-2">
                        <div className="font-semibold text-gray-900">{row.itemName}</div>
                        {row.partNo && <div className="text-[10px] text-gray-500">Code: {row.partNo}</div>}
                      </td>
                      <td className="border px-3 py-2 text-right font-medium text-rose-600">
                        {row.qty.toLocaleString()}
                      </td>
                      <td className="border px-3 py-2 text-right">{row.rate.toFixed(2)}</td>
                      <td className="border px-3 py-2 text-center">{row.gstPercent}%</td>
                      <td className="border px-3 py-2 text-right font-semibold">{row.amount.toFixed(2)}</td>
                      <td className="border px-3 py-2 max-w-[150px] truncate text-gray-600" title={row.note}>
                        {row.note || "-"}
                      </td>
                    </tr>
                  ))}
                  {/* Totals Row */}
                  <tr className="bg-gray-50 font-bold text-gray-900">
                    <td className="border px-3 py-2" colSpan={5}>
                      Total
                    </td>
                    <td className="border px-3 py-2 text-right text-rose-700">
                      {totals.qty.toLocaleString()}
                    </td>
                    <td className="border px-3 py-2"></td>
                    <td className="border px-3 py-2"></td>
                    <td className="border px-3 py-2 text-right font-bold">
                      {totals.amount.toFixed(2)}
                    </td>
                    <td className="border px-3 py-2"></td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DamageItemReport;
