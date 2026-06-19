import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import useStore from "../../store";
import {
  getEntityId,
  getResponseList,
  getResponseMeta,
  normalizeItem,
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
  mode: "date",
  dateFrom: getFinancialYearStartDate(),
  dateTo: getTodayDate(),
  billId: "",
  partyId: "",
  search: "",
};

const ProfitLossReport = () => {
  const { user, selectedFirm } = useStore();
  const activeFirmType = useMemo(() => {
    const rawType =
      selectedFirm?.firm_type ||
      selectedFirm?.type ||
      user?.current_firm_type ||
      "";
    if (rawType === "GST" || rawType === "NON_GST") return rawType;
    const numericType = Number(selectedFirm?.type ?? selectedFirm?.firm_type ?? '');
    if (numericType === 1) return "GST";
    if (numericType === 0) return "NON_GST";
    return "";
  }, [user, selectedFirm]);

  const isGstFirm = activeFirmType === "GST";

  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [items, setItems] = useState([]);
  const [bills, setBills] = useState([]);
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(false);
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
        const [itemList, partyList] = await Promise.all([
          fetchPagedList("/items"),
          fetchPagedList("/contacts/parties"),
        ]);

        setItems(itemList.map((item) => normalizeItem(item)));
        setParties(
          partyList.map((party) => ({
            id: getEntityId(party),
            name: party?.name || "",
          })),
        );
      } catch (error) {
        console.error("Failed to load profit/loss masters", error);
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

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setBills([]);
  };

  const handlePrint = () => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const modeLabel = applied.mode === "bill" ? "Bill Wise" : "Selected Date";
    const startY = drawBrandedReportHeader(doc, {
      title: "Profit / Loss Report",
      subtitle: `Mode: ${modeLabel} | Period: ${applied.dateFrom || "-"} to ${applied.dateTo || "-"} | Bills: ${filteredRows.length}`,
    });

    autoTable(doc, {
      startY,
      head: [
        [
          "Date",
          "Bill No",
          "Party",
          "Items",
          "Qty",
          "Sales Amt",
          "Settlement Discount",
          "Cost Amt",
          "Profit/Loss",
          "Margin %",
        ],
      ],
      body: [
        ...filteredRows.map((row) => [
          row.billDate ? new Date(row.billDate).toLocaleDateString() : "-",
          row.billNo || "-",
          row.partyName,
          row.itemCount,
          row.totalQty.toLocaleString(),
          row.salesAmount.toLocaleString(),
          row.settlementDiscount.toLocaleString(),
          row.costAmount.toLocaleString(),
          row.profit.toLocaleString(),
          `${row.margin.toFixed(2)}%`,
        ]),
        [
          "TOTAL",
          "",
          "",
          "",
          totals.qty.toLocaleString(),
          totals.sales.toLocaleString(),
          totals.settlementDiscount.toLocaleString(),
          totals.cost.toLocaleString(),
          totals.profit.toLocaleString(),
          "",
        ],
      ],
      styles: {
        fontSize: 8,
        cellPadding: 2,
        lineColor: [156, 163, 175],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [235, 235, 235],
        textColor: 0,
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filteredRows.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 235, 235];
        }
        // Color profit/loss column: green for profit, red for loss
        if (
          data.section === "body" &&
          data.column.index === 7 &&
          data.row.index < filteredRows.length
        ) {
          const val = toNumber(filteredRows[data.row.index]?.profit, 0);
          data.cell.styles.textColor = val >= 0 ? [0, 0, 0] : [0, 0, 0];
        }
      },
      columnStyles: {
        3: { halign: "right" },
        4: { halign: "right" },
        5: { halign: "right" },
        6: { halign: "right" },
        7: { halign: "right" },
        8: { halign: "right" },
      },
      margin: { left: 14, right: 14 },
    });

    addBrandedReportFooters(doc);

    doc.save(
      `profit-loss-report-${applied.dateFrom || "all"}-to-${applied.dateTo || "all"}.pdf`,
    );
  };

  useEffect(() => {
    setApplied(filters);
  }, [filters]);

  useEffect(() => {
    const loadBills = async () => {
      setLoading(true);
      try {
        const params = {
          from_date: filters.dateFrom || undefined,
          to_date: filters.dateTo || undefined,
          contact_id: filters.partyId || undefined,
        };
        const list = await fetchPagedList("/bills", params);
        const saleBills = list.filter((bill) => bill.contact_type !== "supplier");
        setBills(saleBills);
      } catch (error) {
        console.error("Failed to load bills for profit/loss", error);
      } finally {
        setLoading(false);
      }
    };

    loadBills();
  }, [filters.dateFrom, filters.dateTo, filters.partyId]);

  const billOptions = useMemo(() => {
    return bills.map((bill) => ({
      id: getEntityId(bill),
      billNo: bill?.bill_no || bill?.billNo || "",
      date: bill?.date || bill?.createdAt || null,
      party: bill?.contact_id?.name || "",
    }));
  }, [bills]);

  const computedRows = useMemo(() => {
    const rows = bills.map((bill) => {
      const billId = getEntityId(bill);
      const billNo = bill?.bill_no || bill?.billNo || "";
      const billDate = bill?.date || bill?.createdAt || null;
      const partyName = bill?.contact_id?.name || "Unknown";
      const challanItems = (bill?.challan_ids || []).flatMap(
        (ch) => ch?.items || [],
      );
      const settlementDiscount = toNumber(
        bill?.settlement_discount ?? bill?.settlementDiscount,
        0,
      );

      let totalQty = 0;
      let salesAmount = 0;
      let costAmount = 0;

      challanItems.forEach((line) => {
        const itemRef = line?.item_id || {};
        const itemId = getEntityId(itemRef) || getEntityId(line?.item_id);
        const item = itemMap[String(itemId)];
        const qty = toNumber(line?.quantity ?? line?.pcs, 0);
        
        const lineAmount =
          isGstFirm ?
            (line?.amount !== undefined ?
              toNumber(line.amount, 0)
            : toNumber(line?.taxable_amount, 0) * (1 + (line?.gst_percent || item?.gst_percent || 0) / 100))
          : (line?.taxable_amount !== undefined ?
              toNumber(line.taxable_amount, 0)
            : line?.amount !== undefined ?
              toNumber(line.amount, 0)
            : toNumber(line?.rate, 0) * qty);

        const purchaseRate =
          isGstFirm ?
            toNumber(item?.purchase_rate, 0) * (1 + (item?.gst_percent || 0) / 100)
          : toNumber(item?.purchase_rate, 0);

        totalQty += qty;
        salesAmount += lineAmount;
        costAmount += purchaseRate * qty;
      });

      const netSalesAmount = Math.max(0, salesAmount - settlementDiscount);
      const profit = netSalesAmount - costAmount;
      const margin = netSalesAmount > 0 ? (profit / netSalesAmount) * 100 : 0;

      return {
        id: billId,
        billNo,
        billDate,
        partyName,
        itemCount: challanItems.length,
        totalQty,
        salesAmount,
        settlementDiscount,
        netSalesAmount,
        costAmount,
        profit,
        margin,
      };
    });

    return rows.sort((a, b) => {
      const aDate = a.billDate ? new Date(a.billDate).getTime() : 0;
      const bDate = b.billDate ? new Date(b.billDate).getTime() : 0;
      return bDate - aDate || a.billNo.localeCompare(b.billNo);
    });
  }, [bills, itemMap, isGstFirm]);

  const filteredRows = useMemo(() => {
    let rows = computedRows;
    if (applied.mode === "bill" && applied.billId) {
      rows = rows.filter((row) => String(row.id) === String(applied.billId));
    }
    const term = applied.search.trim().toLowerCase();
    if (term) {
      rows = rows.filter(
        (row) =>
          row.billNo.toLowerCase().includes(term) ||
          row.partyName.toLowerCase().includes(term),
      );
    }
    return rows;
  }, [computedRows, applied]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (acc, row) => {
        acc.sales += toNumber(row.salesAmount, 0);
        acc.settlementDiscount += toNumber(row.settlementDiscount, 0);
        acc.cost += toNumber(row.costAmount, 0);
        acc.profit += toNumber(row.profit, 0);
        acc.qty += toNumber(row.totalQty, 0);
        return acc;
      },
      { sales: 0, settlementDiscount: 0, cost: 0, profit: 0, qty: 0 },
    );
  }, [filteredRows]);

  const firmMeta = getResolvedFirmMeta();
  const firmName = firmMeta.firmName || "Firm";
  const firm =
    firmMeta.raw || selectedFirm || user?.gst_firm || user?.nongst_firm || null;
  const firmAddress = [
    firmMeta.address,
    firmMeta.city,
    firmMeta.state,
    firm?.pincode,
  ]
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
    <div className="space-y-4">
      <style>{`
        .pl-print-header { display: none; }
        .pl-print-branding { display: none; }
        .pl-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .pl-print-table th, .pl-print-table td { border: 1px solid #9ca3af; }
        @media print {
          .pl-print-hide { display: none !important; }
          .pl-print-header { display: block; }
          .pl-print-branding { display: block; }
          .pl-print-header { text-align: center; border: 2px solid #111827; padding: 10px 14px; margin-bottom: 12px; }
          .pl-print-branding { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #9ca3af; }
          .pl-print-table th, .pl-print-table td { border: 1px solid #9ca3af; }
          .pl-print-table thead th { background: #e5e7eb !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 pl-print-hide">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            Profit / Loss Report
          </h1>
          <p className="text-sm text-gray-600">
            Selected date or bill-wise profit/loss summary.
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

      <div className="pl-print-header">
        <div className="pl-print-branding">
          <div className="text-base font-semibold">{firmName}</div>
          {firmLine ?
            <div className="text-[10px] text-gray-600 mt-1">{firmLine}</div>
          : null}
        </div>
        <div className="text-lg font-semibold">Profit / Loss Report</div>
        <div className="text-xs text-gray-600 mt-1">
          Mode: {applied.mode === "bill" ? "Bill Wise" : "Selected Date"} |
          Period: {applied.dateFrom || "-"} to {applied.dateTo || "-"}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-4 pl-print-hide">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mode
            </label>
            <Select
              value={filters.mode}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, mode: value, billId: "" }))
              }
            >
              <option value="date">Selected Date</option>
              <option value="bill">Selected Bill</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party
            </label>
            <Select
              value={filters.partyId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, partyId: value }))
              }
            >
              <option value="">All Parties</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
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
              disabled={filters.mode === "bill"}
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
              disabled={filters.mode === "bill"}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bill
            </label>
            <Select
              value={filters.billId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, billId: value }))
              }
              disabled={filters.mode !== "bill"}
            >
              <option value="">Select Bill</option>
              {billOptions.map((bill) => (
                <option key={bill.id} value={bill.id}>
                  {bill.billNo} {bill.party ? `- ${bill.party}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <Input
              value={filters.search}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, search: value }))
              }
              placeholder="Bill no / Party"
            />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs pl-print-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Date</th>
                <th className="px-2 py-2 text-left">Bill No</th>
                <th className="px-2 py-2 text-left">Party</th>
                <th className="px-2 py-2 text-right">Items</th>
                <th className="px-2 py-2 text-right">Qty</th>
                <th className="px-2 py-2 text-right">Sales</th>
                <th className="px-2 py-2 text-right">Settlement Discount</th>
                <th className="px-2 py-2 text-right">Cost</th>
                <th className="px-2 py-2 text-right">Profit/Loss</th>
                <th className="px-2 py-2 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {loading ?
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={10}
                  >
                    Loading profit/loss...
                  </td>
                </tr>
              : filteredRows.map((row) => (
                  <tr key={row.id} className="border-b last:border-b-0">
                    <td className="px-2 py-1">
                      {row.billDate ?
                        new Date(row.billDate).toLocaleDateString()
                      : "-"}
                    </td>
                    <td className="px-2 py-1">{row.billNo || "-"}</td>
                    <td className="px-2 py-1">{row.partyName}</td>
                    <td className="px-2 py-1 text-right">{row.itemCount}</td>
                    <td className="px-2 py-1 text-right">
                      {row.totalQty.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.salesAmount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.settlementDiscount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.costAmount.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.profit.toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.margin.toFixed(2)}
                    </td>
                  </tr>
                ))
              }
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={10}
                  >
                    No bills found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 border-t pt-3 text-xs text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              Total Qty:{" "}
              <span className="font-semibold">
                {totals.qty.toLocaleString()}
              </span>
            </div>
            <div>
              Total Sales:{" "}
              <span className="font-semibold">
                {totals.sales.toLocaleString()}
              </span>
            </div>
            <div>
              Total Cost:{" "}
              <span className="font-semibold">
                {totals.cost.toLocaleString()}
              </span>
            </div>
            <div>
              Total Profit/Loss:{" "}
              <span className="font-semibold">
                {totals.profit.toLocaleString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfitLossReport;
