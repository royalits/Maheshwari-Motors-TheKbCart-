import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseData,
  getResponseList,
  getResponseMeta,
  normalizeBrand,
  normalizeItem,
} from "../../services/apiUtils";
import { FaPrint, FaSyncAlt } from "react-icons/fa";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
} from "../../utils/reportPdf";

const INITIAL_FILTERS = {
  itemScope: "all",
  itemGroupScope: "all",
  itemGroupId: "",
  itemMainGroupScope: "all",
  itemMainGroupId: "",
  fromDate: getFinancialYearStartDate(),
  toDate: getTodayDate(),
  option: "detail",
  search: "",
};

const formatLedgerDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleDateString("en-IN");
};

const formatLedgerQuantity = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "0";
  return numeric.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(numeric) ? 0 : 2,
    maximumFractionDigits: 2,
  });
};

const getLedgerDateKey = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const ItemLedgerReport = () => {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [items, setItems] = useState([]);
  const [brands, setBrands] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [historyItemId, setHistoryItemId] = useState("");
  const [salesHistoryRows, setSalesHistoryRows] = useState([]);
  const [salesHistoryTotals, setSalesHistoryTotals] = useState({ qtyOut: 0, saleAmount: 0 });
  const [salesHistoryLoading, setSalesHistoryLoading] = useState(false);
  const [salesHistoryError, setSalesHistoryError] = useState("");

  const fetchPagedList = async (url, params = {}, maxPages = 200) => {
    let all = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const res = await api.get(url, { params: { page, limit: 200, ...params } });
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
    const loadData = async () => {
      setLoading(true);
      try {
        const [itemList, brandList, deptRes] = await Promise.all([
          fetchPagedList("/item-ledger/items"),
          fetchPagedList("/brands"),
          api.get("/departments", { params: { page: 1, limit: 200 } }),
        ]);

        const normalizedItems = itemList.map((item) => {
          const normalized = normalizeItem(item);
          return {
            ...normalized,
            itemCode: item?.item_id ?? item?.id ?? normalized.id,
            lastStockAddedAt: item?.last_stock_added_at || item?.lastStockAddedAt || null,
            lastStockSoldAt: item?.last_stock_sold_at || item?.lastStockSoldAt || null,
            lastSupplierName: item?.last_supplier_name || item?.lastSupplierName || "",
            lastPartyName: item?.last_party_name || item?.lastPartyName || "",
            totalQtyPurchased: Number(item?.total_qty_purchased || item?.totalQtyPurchased || 0),
            totalQtySold: Number(item?.total_qty_sold || item?.totalQtySold || 0),
          };
        });

        const normalizedBrands = brandList.map((brand) => {
          const normalized = normalizeBrand(brand);
          return { id: normalized.id, name: normalized.name };
        });

        const normalizedDepartments = getResponseList(deptRes).map((dept) => ({
          id: getEntityId(dept),
          name: dept?.department_name || dept?.name || "",
        }));

        setItems(normalizedItems);
        setBrands(normalizedBrands);
        setDepartments(normalizedDepartments);
      } catch (error) {
        console.error("Failed to load item ledger data", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const brandMap = useMemo(() => {
    const map = {};
    brands.forEach((b) => { map[String(b.id)] = b.name; });
    return map;
  }, [brands]);

  const departmentMap = useMemo(() => {
    const map = {};
    departments.forEach((d) => { map[String(d.id)] = d.name; });
    return map;
  }, [departments]);

  const enrichedItems = useMemo(() => {
    return items.map((item) => ({
      ...item,
      brandName: brandMap[String(item.brandId)] || "-",
      departmentName: departmentMap[String(item.departmentId)] || "-",
    }));
  }, [items, brandMap, departmentMap]);

  const filteredItems = useMemo(() => {
    const term = applied.search.trim().toLowerCase();
    const fromDate = applied.fromDate ? new Date(applied.fromDate) : null;
    const toDate = applied.toDate ? new Date(applied.toDate) : null;

    return enrichedItems.filter((item) => {
      if (applied.itemGroupScope === "selected" && applied.itemGroupId && String(item.brandId) !== String(applied.itemGroupId)) return false;
      if (applied.itemMainGroupScope === "selected" && applied.itemMainGroupId && String(item.departmentId) !== String(applied.itemMainGroupId)) return false;
      if (fromDate || toDate) {
        const soldAt = item.lastStockSoldAt ? new Date(item.lastStockSoldAt) : null;
        const addedAt = item.lastStockAddedAt ? new Date(item.lastStockAddedAt) : null;
        const relevantDate = soldAt || addedAt;
        // Only filter by date if item has activity; items with no dates pass through
        if (relevantDate) {
          if (fromDate && relevantDate < fromDate) return false;
          if (toDate && relevantDate > toDate) return false;
        }
      }
      if (term) {
        const haystack = [item.itemName, item.itemCode, item.brandName, item.departmentName, item.barcode]
          .filter(Boolean).join(" ").toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [applied, enrichedItems]);

  const visibleSelectedCount = useMemo(() => {
    if (applied.itemScope === "all") return filteredItems.length;
    return filteredItems.filter((item) => selectedItemIds.has(item.id)).length;
  }, [applied.itemScope, filteredItems, selectedItemIds]);

  const activeHistoryItem = useMemo(
    () => enrichedItems.find((item) => String(item.id) === String(historyItemId)) || null,
    [enrichedItems, historyItemId],
  );

  const dateWiseSalesRows = useMemo(() => {
    const grouped = new Map();
    salesHistoryRows.forEach((row) => {
      const rawDate = row?.date || "";
      const dateKey = getLedgerDateKey(rawDate);
      if (!dateKey) return;
      const existing = grouped.get(dateKey) || { date: rawDate, qtySold: 0, saleAmount: 0, challanNos: new Set() };
      existing.qtySold += Number(row?.quantity || 0);
      existing.saleAmount += Number(row?.amount || 0);
      if (row?.challan_no) existing.challanNos.add(row.challan_no);
      grouped.set(dateKey, existing);
    });
    return Array.from(grouped.values())
      .map((entry) => ({ ...entry, challanCount: entry.challanNos.size }))
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [salesHistoryRows]);

  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every((item) => selectedItemIds.has(item.id));

  const handleSelectAll = (checked) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      filteredItems.forEach((item) => { if (checked) next.add(item.id); else next.delete(item.id); });
      return next;
    });
  };

  const handleSelectItem = (itemId, checked) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(itemId); else next.delete(itemId);
      return next;
    });
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        setSelectedItemIds((prev) => {
          const allSelected = filteredItems.length > 0 && filteredItems.every((item) => prev.has(item.id));
          const next = new Set(prev);
          filteredItems.forEach((item) => {
            if (allSelected) next.delete(item.id);
            else next.add(item.id);
          });
          return next;
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredItems]);

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setSelectedItemIds(new Set());
    setHistoryItemId("");
    setSalesHistoryRows([]);
    setSalesHistoryTotals({ qtyOut: 0, saleAmount: 0 });
    setSalesHistoryError("");
  };

  const handlePrint = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfMarginX = 14;
    const startY = drawBrandedReportHeader(doc, {
      title: "Item Ledger Report",
      subtitle: `Period: ${applied.fromDate || "-"} to ${applied.toDate || "-"} | Scope: ${applied.itemScope === "all" ? "All Items" : "Selected Items"}`,
      marginLeft: pdfMarginX,
      marginRight: pdfMarginX,
    });

    const itemsToExport =
      applied.itemScope === "all"
        ? filteredItems
        : filteredItems.filter((item) => selectedItemIds.has(item.id));

    const isDetailReport = applied.option === "detail";
    const tableHead = isDetailReport
      ? [["#", "Item Name", "Item ID", "Barcode", "Brand", "Stock", "Stk In", "Stk Out", "Supplier", "Party", "Sale Rate", "Purchase Rate", "Last Added", "Last Sold"]]
      : [["#", "Item Name", "Item ID", "Stock", "Stk In", "Stk Out"]];
    const tableBody = itemsToExport.map((item, idx) => (
      isDetailReport
        ? [
            idx + 1,
            item.itemName || "-",
            item.itemCode || "-",
            item.barcode || "-",
            item.brandName || "-",
            formatLedgerQuantity(item.stockCount),
            formatLedgerQuantity(item.totalQtyPurchased),
            formatLedgerQuantity(item.totalQtySold),
            item.lastSupplierName || "-",
            item.lastPartyName || "-",
            formatLedgerQuantity(item.amount),
            formatLedgerQuantity(item.purchase_rate),
            formatLedgerDate(item.lastStockAddedAt),
            formatLedgerDate(item.lastStockSoldAt),
          ]
        : [
            idx + 1,
            item.itemName || "-",
            item.itemCode || "-",
            formatLedgerQuantity(item.stockCount),
            formatLedgerQuantity(item.totalQtyPurchased),
            formatLedgerQuantity(item.totalQtySold),
          ]
    ));

    const totals = itemsToExport.reduce((acc, item) => ({
      stock: acc.stock + Number(item.stockCount || 0),
      stockIn: acc.stockIn + Number(item.totalQtyPurchased || 0),
      stockOut: acc.stockOut + Number(item.totalQtySold || 0),
      saleRate: acc.saleRate + Number(item.amount || 0),
      purchaseRate: acc.purchaseRate + Number(item.purchase_rate || 0),
    }), {
      stock: 0,
      stockIn: 0,
      stockOut: 0,
      saleRate: 0,
      purchaseRate: 0,
    });

    const tableFoot = isDetailReport
      ? [[
          "",
          "TOTAL",
          "",
          "",
          "",
          formatLedgerQuantity(totals.stock),
          formatLedgerQuantity(totals.stockIn),
          formatLedgerQuantity(totals.stockOut),
          "",
          "",
          formatLedgerQuantity(totals.saleRate),
          formatLedgerQuantity(totals.purchaseRate),
          "",
          "",
        ]]
      : [[
          "",
          "TOTAL",
          "",
          formatLedgerQuantity(totals.stock),
          formatLedgerQuantity(totals.stockIn),
          formatLedgerQuantity(totals.stockOut),
        ]];

    const detailColumnStyles = {
      0: { cellWidth: 6, halign: "center" },
      1: { cellWidth: 26, halign: "left" },
      2: { cellWidth: 12, halign: "left" },
      3: { cellWidth: 16, halign: "left" },
      4: { cellWidth: 12, halign: "left" },
      5: { cellWidth: 10, halign: "right" },
      6: { cellWidth: 10, halign: "right" },
      7: { cellWidth: 10, halign: "right" },
      8: { cellWidth: 18, halign: "left" },
      9: { cellWidth: 18, halign: "left" },
      10: { cellWidth: 12, halign: "right" },
      11: { cellWidth: 12, halign: "right" },
      12: { cellWidth: 12, halign: "center" },
      13: { cellWidth: 12, halign: "center" },
    };
    const summaryColumnStyles = {
      0: { cellWidth: 8, halign: "center" },
      1: { cellWidth: 60, halign: "left" },
      2: { cellWidth: 36, halign: "left" },
      3: { cellWidth: 26, halign: "right" },
      4: { cellWidth: 26, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
    };

    autoTable(doc, {
      startY,
      head: tableHead,
      body: tableBody,
      foot: tableFoot,
      styles: {
        fontSize: isDetailReport ? 5.2 : 7.5,
        cellPadding: isDetailReport
          ? { top: 1.4, right: 1, bottom: 1.4, left: 1 }
          : { top: 2.2, right: 2, bottom: 2.2, left: 2 },
        overflow: "ellipsize",
        lineColor: [203, 213, 225],
        lineWidth: 0.2,
        textColor: [31, 41, 55],
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
      tableWidth: 182,
      columnStyles: isDetailReport ? detailColumnStyles : summaryColumnStyles,
      didParseCell: (data) => {
        if (data.section === "head") {
          const numericColumns = isDetailReport ? [5, 6, 7, 10, 11] : [3, 4, 5];
          if (numericColumns.includes(data.column.index)) {
            data.cell.styles.halign = "right";
          }
        }
      },
      margin: { left: pdfMarginX, right: pdfMarginX, bottom: 18 },
    });

    addBrandedReportFooters(doc);
    doc.save(`item-ledger-report-${applied.fromDate || "all"}-to-${applied.toDate || "all"}.pdf`);
  };

  useEffect(() => { setApplied(filters); }, [filters]);

  useEffect(() => {
    if (!historyItemId) {
      setSalesHistoryRows([]);
      setSalesHistoryTotals({ qtyOut: 0, saleAmount: 0 });
      setSalesHistoryError("");
      setSalesHistoryLoading(false);
      return;
    }
    let cancelled = false;
    const loadSalesHistory = async () => {
      setSalesHistoryLoading(true);
      setSalesHistoryError("");
      try {
        const response = await api.get(`/item-ledger/movement/${historyItemId}`, {
          params: {
            type: "sale",
            limit: -1,
            ...(applied.fromDate ? { from_date: applied.fromDate } : {}),
            ...(applied.toDate ? { to_date: applied.toDate } : {}),
          },
        });
        if (cancelled) return;
        const payload = getResponseData(response) || {};
        const rows = Array.isArray(payload?.data) ? payload.data : getResponseList(response);
        setSalesHistoryRows(rows);
        setSalesHistoryTotals({
          qtyOut: Number(payload?.totals?.qty_out || 0),
          saleAmount: Number(payload?.totals?.sale_amount || 0),
        });
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to load item sales history", error);
        setSalesHistoryRows([]);
        setSalesHistoryTotals({ qtyOut: 0, saleAmount: 0 });
        setSalesHistoryError(error?.response?.data?.message || "Failed to load date-wise sales history");
      } finally {
        if (!cancelled) setSalesHistoryLoading(false);
      }
    };
    loadSalesHistory();
    return () => { cancelled = true; };
  }, [historyItemId, applied.fromDate, applied.toDate]);

  return (
    <div className="space-y-4">
      <style>{`
        .item-ledger-print-header { display: none; }
        .item-ledger-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .item-ledger-print-table th, .item-ledger-print-table td { border: 1px solid #9ca3af; }
        @media print {
          .item-ledger-print-hide { display: none !important; }
          .item-ledger-print-header { display: block; }
          .item-ledger-print-header { text-align: center; border: 2px solid #111827; padding: 10px 14px; margin-bottom: 12px; }
          .item-ledger-print-table th, .item-ledger-print-table td { border: 1px solid #9ca3af; }
          .item-ledger-print-table thead th { background: #e5e7eb !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 item-ledger-print-hide">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Item Ledger Report</h1>
          <p className="text-sm text-gray-600">Select items, groups, and period to prepare the report.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleRefresh} className="flex items-center gap-2">
            <FaSyncAlt /> Refresh
          </Button>
          <Button onClick={handlePrint} className="flex items-center gap-2">
            <FaPrint /> Print
          </Button>
        </div>
      </div>

      <div className="item-ledger-print-header">
        <div className="text-lg font-semibold">Item Ledger Report</div>
        <div className="text-xs text-gray-600 mt-1">Period: {applied.fromDate || "-"} to {applied.toDate || "-"}</div>
        <div className="mt-2 text-xs text-gray-700">
          <span className="font-semibold">Option:</span> {applied.option}{" "}
          <span className="font-semibold ml-3">Item Scope:</span> {applied.itemScope}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-3">
        <div className="bg-white border rounded-lg p-3 space-y-3 item-ledger-print-hide">
          <div className="text-sm font-semibold text-gray-800">Filters</div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">Item</div>
            <div className="mt-1 space-y-1">
              {["all", "selected"].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="itemScope" value={value} checked={filters.itemScope === value}
                    onChange={(e) => setFilters((prev) => ({ ...prev, itemScope: e.target.value }))} />
                  {value === "all" ? "All" : "Selected"}
                </label>
              ))}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">Brand</div>
            <div className="mt-1 space-y-1">
              {["all", "selected"].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="itemGroupScope" value={value} checked={filters.itemGroupScope === value}
                    onChange={(e) => setFilters((prev) => ({ ...prev, itemGroupScope: e.target.value }))} />
                  {value === "all" ? "All" : "Selected"}
                </label>
              ))}
            </div>
            {filters.itemGroupScope === "selected" && (
              <div className="mt-1">
                <Select value={filters.itemGroupId} onChange={(value) => setFilters((prev) => ({ ...prev, itemGroupId: value }))} placeholder="Select Brand">
                  {brands.map((brand) => (<option key={brand.id} value={brand.id}>{brand.name}</option>))}
                </Select>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">Departments</div>
            <div className="mt-1 space-y-1">
              {["all", "selected"].map((value) => (
                <label key={value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="itemMainGroupScope" value={value} checked={filters.itemMainGroupScope === value}
                    onChange={(e) => setFilters((prev) => ({ ...prev, itemMainGroupScope: e.target.value }))} />
                  {value === "all" ? "All" : "Selected"}
                </label>
              ))}
            </div>
            {filters.itemMainGroupScope === "selected" && (
              <div className="mt-1">
                <Select value={filters.itemMainGroupId} onChange={(value) => setFilters((prev) => ({ ...prev, itemMainGroupId: value }))} placeholder="Select Department">
                  {departments.map((dept) => (<option key={dept.id} value={dept.id}>{dept.name}</option>))}
                </Select>
              </div>
            )}
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">Period</div>
            <div className="mt-1 grid grid-cols-1 gap-2">
              <Input type="date" value={filters.fromDate} onChange={(value) => setFilters((prev) => ({ ...prev, fromDate: value }))} />
              <Input type="date" value={filters.toDate} onChange={(value) => setFilters((prev) => ({ ...prev, toDate: value }))} />
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase">Option</div>
            <div className="mt-1 space-y-1">
              {[{ value: "detail", label: "Detail" }, { value: "summary", label: "Summary" }].map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="radio" name="option" value={opt.value} checked={filters.option === opt.value}
                    onChange={(e) => setFilters((prev) => ({ ...prev, option: e.target.value }))} />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white border rounded-lg p-2 space-y-2">
          <div className="flex flex-wrap items-center gap-2 item-ledger-print-hide">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Search</label>
              <Input value={filters.search} onChange={(value) => setFilters((prev) => ({ ...prev, search: value }))}
                placeholder="Item name / code" className="md:w-96" />
            </div>
            <span className="text-xs text-gray-400 ml-auto">Ctrl+Z to select/deselect all</span>
          </div>

          <div className="overflow-x-auto max-h-[520px] overflow-y-auto border rounded-md">
            <table className="w-full text-[11px] item-ledger-print-table">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-2 text-left">
                    <input type="checkbox" checked={allVisibleSelected}
                      onChange={(e) => handleSelectAll(e.target.checked)} disabled={filteredItems.length === 0} />
                  </th>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">ID</th>
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Barcode</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Brand</th>}
                  <th className="px-2 py-2 text-right">Stock</th>
                  <th className="px-2 py-2 text-right">Stock In</th>
                  <th className="px-2 py-2 text-right">Stock Out</th>
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Supplier</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Party</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-right">Sale Rate</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-right">Purchase Rate</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Last Stock Added</th>}
                  {applied.option === "detail" && <th className="px-2 py-2 text-left">Last Sold On</th>}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={applied.option === "detail" ? 14 : 6}>Loading items...</td></tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr key={`${item.id}-${idx}`} className="border-b last:border-b-0">
                      <td className="px-2 py-2">
                        <input type="checkbox" checked={selectedItemIds.has(item.id)}
                          onChange={(e) => handleSelectItem(item.id, e.target.checked)} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="font-medium text-gray-900 truncate max-w-[320px]">{item.itemName || "-"}</div>
                        <div className="text-[10px] text-gray-500">
                          {item.brandName} {item.departmentName ? `| ${item.departmentName}` : ""}
                        </div>
                        <button type="button" onClick={() => setHistoryItemId(item.id)}
                          className={`mt-1 text-[10px] font-medium item-ledger-print-hide ${String(historyItemId) === String(item.id) ? "text-blue-700" : "text-blue-600 hover:text-blue-700"}`}>
                          {String(historyItemId) === String(item.id) ? "Viewing date-wise sales" : "View date-wise sales"}
                        </button>
                      </td>
                      <td className="px-2 py-2">{item.itemCode || "-"}</td>
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{item.barcode || "-"}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{item.brandName || "-"}</td>}
                      <td className="px-2 py-2 text-right whitespace-nowrap">{formatLedgerQuantity(item.stockCount)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{formatLedgerQuantity(item.totalQtyPurchased)}</td>
                      <td className="px-2 py-2 text-right whitespace-nowrap">{formatLedgerQuantity(item.totalQtySold)}</td>
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{item.lastSupplierName || "-"}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{item.lastPartyName || "-"}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 text-right whitespace-nowrap">{formatLedgerQuantity(item.amount)}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 text-right whitespace-nowrap">{formatLedgerQuantity(item.purchase_rate)}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{formatLedgerDate(item.lastStockAddedAt)}</td>}
                      {applied.option === "detail" && <td className="px-2 py-2 whitespace-nowrap">{formatLedgerDate(item.lastStockSoldAt)}</td>}
                    </tr>
                  ))
                )}
                {!loading && filteredItems.length === 0 && (
                  <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={applied.option === "detail" ? 14 : 6}>No items found</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-700">
            <div>Total Items: <span className="font-semibold">{filteredItems.length}</span></div>
            <div>Selected Items: <span className="font-semibold">{visibleSelectedCount}{applied.itemScope === "all" ? " (All)" : ""}</span></div>
            <div>View Mode: <span className="font-semibold">{applied.option}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ItemLedgerReport;
