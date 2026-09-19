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
import {
  FaPrint,
  FaSyncAlt,
  FaDownload,
  FaFileAlt,
  FaChartLine,
  FaShoppingCart,
  FaCashRegister,
  FaBalanceScale,
  FaCalendarAlt,
  FaAngleDown,
  FaAngleUp,
  FaChevronDown,
  FaChevronUp,
  FaArrowRight,
} from "react-icons/fa";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";
import { formatCurrency } from "../../utils";
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

  // Top Dashboard Metrics State
  const [dashboardSales, setDashboardSales] = useState([]);
  const [dashboardPurchases, setDashboardPurchases] = useState([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardMonth, setDashboardMonth] = useState("all");
  const [showMonthlyBreakdown, setShowMonthlyBreakdown] = useState(false);
  const [showDashboardMetrics, setShowDashboardMetrics] = useState(false);

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

  const loadDashboardData = async () => {
    setDashboardLoading(true);
    try {
      const [salesData, purchaseData] = await Promise.all([
        fetchPagedList("/reports/sales/details", {
          from_date: getFinancialYearStartDate(),
          to_date: getTodayDate(),
        }),
        fetchPagedList("/reports/purchase/details", {
          from_date: getFinancialYearStartDate(),
          to_date: getTodayDate(),
        }),
      ]);
      setDashboardSales(salesData);
      setDashboardPurchases(purchaseData);
    } catch (err) {
      console.error("Failed to load dashboard metrics data", err);
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

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
    return [
      { value: "detail", label: "Detail (Item Wise Lines)" },
      { value: "bill", label: "Bill / Date Wise (Amount Only)" },
      { value: "month", label: "Monthly Summary (Amount Only)" },
      { value: "party", label: `${contactLabel} Wise` },
      { value: "item", label: "Item Wise" },
      { value: "brand", label: "Brand Wise" },
      { value: "agent", label: "Agent Wise" },
      { value: "area", label: "Area Wise" },
    ];
  }, [filters.reportType]);

  const appliedViewModes = useMemo(() => {
    const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";
    return [
      { value: "detail", label: "Detail (Item Wise Lines)" },
      { value: "bill", label: "Bill / Date Wise (Amount Only)" },
      { value: "month", label: "Monthly Summary (Amount Only)" },
      { value: "party", label: `${contactLabel} Wise` },
      { value: "item", label: "Item Wise" },
      { value: "brand", label: "Brand Wise" },
      { value: "agent", label: "Agent Wise" },
      { value: "area", label: "Area Wise" },
    ];
  }, [applied.reportType]);

  const availableMonths = useMemo(() => {
    const monthSet = new Map();
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1; // 1 to 12
    const currentKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;

    const addMonth = (y, m) => {
      // Strictly prevent future months
      if (y > currentYear || (y === currentYear && m > currentMonth)) return;
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!monthSet.has(key)) {
        const isCurrent = key === currentKey;
        monthSet.set(key, {
          key,
          label: `${monthNames[m - 1]} ${y}${isCurrent ? " (Current)" : ""}`,
          year: y,
          month: m,
        });
      }
    };

    // 1. Process all months present in transaction records
    const processBillDate = (dateVal) => {
      if (!dateVal) return;
      const d = new Date(dateVal);
      if (Number.isNaN(d.getTime())) return;
      addMonth(d.getFullYear(), d.getMonth() + 1);
    };

    dashboardSales.forEach((b) => processBillDate(b?.date || b?.createdAt));
    dashboardPurchases.forEach((b) => processBillDate(b?.date || b?.createdAt));

    // 2. Ensure all months from Financial Year Start (or past months) up to today's month are included
    const fyStart = getFinancialYearStartDate();
    let startYear = currentYear;
    let startMonth = 4;
    if (fyStart) {
      const parts = fyStart.split("-").map(Number);
      if (parts.length >= 2 && !Number.isNaN(parts[0])) {
        startYear = parts[0];
        startMonth = parts[1] || 4;
      }
    } else {
      startYear = currentMonth >= 4 ? currentYear : currentYear - 1;
      startMonth = 4;
    }

    let iterDate = new Date(startYear, startMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth - 1, 1);

    while (iterDate <= endDate) {
      addMonth(iterDate.getFullYear(), iterDate.getMonth() + 1);
      iterDate.setMonth(iterDate.getMonth() + 1);
    }

    // Always include current month
    addMonth(currentYear, currentMonth);

    // Return sorted newest month first (descending: current month -> previous months)
    return Array.from(monthSet.values()).sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [dashboardSales, dashboardPurchases]);

  const dashboardMetrics = useMemo(() => {
    const filterByMonth = (bills, targetMonthKey) => {
      if (targetMonthKey === "all") return bills;
      return bills.filter((b) => {
        const dateVal = b?.date || b?.createdAt;
        if (!dateVal) return false;
        const d = new Date(dateVal);
        if (Number.isNaN(d.getTime())) return false;
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return `${y}-${m}` === targetMonthKey;
      });
    };

    const aggregateBills = (bills) => {
      let billCount = bills.length;
      let lineCount = 0;
      let qty = 0;
      let taxable = 0;
      let gst = 0;
      let settlementDiscount = 0;
      let amount = 0;

      bills.forEach((bill) => {
        settlementDiscount += toNumber(
          bill?.settlement_discount ?? bill?.settlementDiscount,
          0,
        );
        amount += toNumber(
          bill?.net_amount ?? bill?.total_amount ?? bill?.amount,
          0,
        );

        const items = bill?.items || [];
        lineCount += items.length;
        items.forEach((item) => {
          qty += toNumber(item?.quantity ?? item?.pcs, 0);
          taxable += toNumber(item?.taxable_amount, 0);
          gst += toNumber(item?.gst_amount, 0);
        });
      });

      return {
        billCount,
        lineCount,
        qty,
        taxable,
        gst,
        settlementDiscount,
        amount,
      };
    };

    const filteredSales = filterByMonth(dashboardSales, dashboardMonth);
    const filteredPurchases = filterByMonth(dashboardPurchases, dashboardMonth);

    const salesAgg = aggregateBills(filteredSales);
    const purchaseAgg = aggregateBills(filteredPurchases);

    const netDiff = salesAgg.amount - purchaseAgg.amount;
    const marginPercent =
      salesAgg.amount > 0 ? (netDiff / salesAgg.amount) * 100 : 0;
    const netGstLiability = salesAgg.gst - purchaseAgg.gst;

    const monthlyBreakdown = availableMonths.map((m) => {
      const sBills = filterByMonth(dashboardSales, m.key);
      const pBills = filterByMonth(dashboardPurchases, m.key);
      const sAgg = aggregateBills(sBills);
      const pAgg = aggregateBills(pBills);
      const diff = sAgg.amount - pAgg.amount;
      const margin = sAgg.amount > 0 ? (diff / sAgg.amount) * 100 : 0;
      return {
        ...m,
        sales: sAgg,
        purchases: pAgg,
        netDiff: diff,
        marginPercent: margin,
      };
    });

    return {
      sales: salesAgg,
      purchases: purchaseAgg,
      netDiff,
      marginPercent,
      netGstLiability,
      monthlyBreakdown,
    };
  }, [dashboardSales, dashboardPurchases, dashboardMonth, availableMonths]);

  const handleApplyMonthToReport = (monthKey) => {
    if (monthKey === "all") {
      const newFrom = getFinancialYearStartDate();
      const newTo = getTodayDate();
      const updatedFilters = {
        ...filters,
        dateFrom: newFrom,
        dateTo: newTo,
      };
      setFilters(updatedFilters);
      handleView(updatedFilters);
    } else {
      const [y, m] = monthKey.split("-").map(Number);
      const start = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const updatedFilters = {
        ...filters,
        dateFrom: start,
        dateTo: end,
      };
      setFilters(updatedFilters);
      handleView(updatedFilters);
    }
  };

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

  const handleView = async (overrideFilters = null) => {
    const activeFilters = overrideFilters || filters;
    setLoading(true);
    try {
      const endpoint =
        activeFilters.reportType === "sale"
          ? "/reports/sales/details"
          : "/reports/purchase/details";
      const bills = await fetchPagedList(endpoint, {
        from_date: activeFilters.dateFrom || undefined,
        to_date: activeFilters.dateTo || undefined,
        contact_id: activeFilters.contactId || undefined,
        item_id: activeFilters.itemId || undefined,
        brand_id: activeFilters.brandId || undefined,
        agent_id: activeFilters.agentId || undefined,
        area_id: activeFilters.areaId || undefined,
      });

      const mapped = bills.flatMap((bill) => {
        const billId = getEntityId(bill);
        const billNo = bill?.bill_no || bill?.billNo || "";
        const billDate = bill?.date || bill?.createdAt || null;
        const contact = bill?.contact || bill?.contact_id || {};
        const contactId = getEntityId(contact);
        const contactName = contact?.name || bill?.contact_name || "Unknown";
        const agentId = getEntityId(contact?.agent_id) || getEntityId(bill?.agent_id);
        const areaId = getEntityId(contact?.area_id) || getEntityId(bill?.area_id);
        const agentName = agentMap[String(agentId)] || contact?.agent_name || "-";
        const areaName = areaMap[String(areaId)] || contact?.area_name || "-";
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
      setApplied(activeFilters);
      setCurrentPage(1);
    } catch (error) {
      console.error("Failed to load report", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setRows([]);
    setDashboardMonth("all");
    loadDashboardData();
  };

  const detailColumnLabels = useMemo(() => {
    const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";
    return [
      "Date",
      "Bill No",
      contactLabel,
      "Item",
      "Brand",
      "Agent",
      "Area",
      "Qty",
      "Rate",
      "Dis%",
      "SpDis%",
      "Taxable",
      "GST%",
      "GST Amt",
      "Cumm Balance",
      "Sett. Disc",
      "Net Amt",
    ];
  }, [applied.reportType]);

  const detailPdfColumnStyles = useMemo(() => ({
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
  }), []);

  const summaryGroupLabel = useMemo(() => (
    applied.viewMode === "month" ? "Month / Period"
    : applied.viewMode === "party" ? (applied.reportType === "sale" ? "Party" : "Supplier")
    : applied.viewMode === "item" ? "Item"
    : applied.viewMode === "brand" ? "Brand"
    : applied.viewMode === "agent" ? "Agent"
    : applied.viewMode === "area" ? "Area"
    : "Group"
  ), [applied.viewMode, applied.reportType]);

  const buildDetailExportRows = () => {
    let runningAmount = 0;
    return filteredRows.map((row) => {
      runningAmount += toNumber(row.amount, 0);
      return [
        formatDate(row.billDate),
        row.billNo || "-",
        row.contactName || "-",
        row.itemName || "-",
        row.brandName || "-",
        row.agentName || "-",
        row.areaName || "-",
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
      ];
    });
  };

  const buildBillExportRows = () => {
    let runningAmount = 0;
    return summaryRows.map((row) => {
      runningAmount += toNumber(row.amount, 0);
      return [
        formatDate(row.billDate),
        row.billNo || "-",
        row.contactName || "-",
        row.agentName || "-",
        row.areaName || "-",
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
    const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";
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
      const totalCols = detailColumnLabels.length;
      const totalsRow = Array(totalCols).fill("");
      totalsRow[0] = "GRAND TOTAL";
      const setTotal = (label, value) => {
        const index = detailColumnLabels.indexOf(label);
        if (index >= 0) totalsRow[index] = value;
      };
      setTotal("Qty", totals.qty.toLocaleString());
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
          fontSize: 5,
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
    } else if (applied.viewMode === "bill") {
      const body = buildBillExportRows();
      const billHeaders = ["Date", "Bill No", contactLabel, "Agent", "Area", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"];
      const totalsRow = ["GRAND TOTAL", "", "", "", "", stats.lineCount, totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()];

      autoTable(doc, {
        startY,
        head: [billHeaders],
        body: [...body, totalsRow],
        styles: {
          fontSize: 6,
          cellPadding: { top: 1.2, right: 1.0, bottom: 1.2, left: 1.0 },
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
        columnStyles: {
          5: { halign: "right" }, 6: { halign: "right" }, 7: { halign: "right" },
          8: { halign: "right" }, 9: { halign: "right" }, 10: { halign: "right" }, 11: { halign: "right" },
        },
        margin: { left: pdfMarginX, right: pdfMarginX },
      });
    } else {
      const body = buildSummaryExportRows();
      const summaryHeaders = [summaryGroupLabel, "Bills", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"];
      const totalsRow = ["GRAND TOTAL", stats.billCount, stats.lineCount, totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()];

      autoTable(doc, {
        startY,
        head: [summaryHeaders],
        body: [...body, totalsRow],
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
          if (data.section === "body" && data.row.index === body.length) {
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
    const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";
    const viewLabel = appliedViewModes.find((m) => m.value === applied.viewMode)?.label || "Detail";
    
    let printRows = [];
    let printHeaders = [];
    let totalsRow = [];
    let detailLeftCount = 1;
    let colgroupHtml = "";

    if (applied.viewMode === "detail") {
      printRows = buildDetailExportRows();
      printHeaders = detailColumnLabels;
      totalsRow = (() => {
        const row = Array(detailColumnLabels.length).fill("");
        row[0] = "GRAND TOTAL";
        const setTotal = (label, value) => {
          const index = detailColumnLabels.indexOf(label);
          if (index >= 0) row[index] = value;
        };
        setTotal("Qty", totals.qty.toLocaleString());
        setTotal("Taxable", totals.taxable.toLocaleString());
        setTotal("GST Amt", totals.gst.toLocaleString());
        setTotal("Cumm Balance", totals.amount.toLocaleString());
        setTotal("Sett. Disc", totals.settlementDiscount.toLocaleString());
        setTotal("Net Amt", totals.amount.toLocaleString());
        return row;
      })();
      detailLeftCount = 7;
      colgroupHtml = [7, 8, 13, 15, 9, 8, 8, 6, 7, 7, 8, 9, 6, 7, 9, 9].map((width) => `<col style="width:${width}%">`).join("");
    } else if (applied.viewMode === "bill") {
      printRows = buildBillExportRows();
      printHeaders = ["Date", "Bill No", contactLabel, "Agent", "Area", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"];
      totalsRow = ["GRAND TOTAL", "", "", "", "", stats.lineCount, totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()];
      detailLeftCount = 5;
      colgroupHtml = [9, 10, 15, 10, 10, 6, 7, 9, 8, 9, 7, 10].map((width) => `<col style="width:${width}%">`).join("");
    } else {
      printRows = buildSummaryExportRows();
      printHeaders = [summaryGroupLabel, "Bills", "Lines", "Qty", "Taxable Amt", "GST Amt", "Cumm Balance", "Sett. Disc", "Net Amt"];
      totalsRow = ["GRAND TOTAL", stats.billCount, stats.lineCount, totals.qty.toLocaleString(), totals.taxable.toLocaleString(), totals.gst.toLocaleString(), totals.amount.toLocaleString(), totals.settlementDiscount.toLocaleString(), totals.amount.toLocaleString()];
      detailLeftCount = 1;
      colgroupHtml = [28, 8, 8, 9, 12, 10, 10, 8, 11].map((width) => `<col style="width:${width}%">`).join("");
    }

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
            <div class="meta">${applied.reportType === "sale" ? "Party" : "Supplier"}: ${appliedContactOptions.find((c) => String(c.id) === String(applied.contactId))?.name || "All"} | Agent: ${agentMap[String(applied.agentId)] || "All"} | Area: ${areaMap[String(applied.areaId)] || "All"}</div>
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
            <div class="row"><span class="label">Agent:</span><span class="value">${row.agentName}</span></div>
            <div class="row"><span class="label">Area:</span><span class="value">${row.areaName}</span></div>
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
      ["Agent:", row.agentName],
      ["Area:", row.areaName],
    ];

    details.forEach(([label, value]) => {
      doc.text(label, 20, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value, 60, yPos);
      doc.setFont("helvetica", "bold");
      yPos += 6;
    });

    yPos += 10;

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
  }, [filters.reportType, filters.dateFrom, filters.dateTo, filters.contactId, filters.agentId, filters.areaId]);

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
        applied.agentId &&
        String(row.agentId) !== String(applied.agentId)
      )
        return false;
      if (
        applied.areaId &&
        String(row.areaId) !== String(applied.areaId)
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
        const monthStr = row.billDate
          ? new Date(row.billDate).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toLowerCase()
          : "";
        const haystack = [
          row.billNo,
          row.contactName,
          row.itemName,
          row.brandName,
          row.agentName,
          row.areaName,
          monthStr,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [rows, applied]);

  const summaryRows = useMemo(() => {
    if (applied.viewMode === "detail") return [];

    if (applied.viewMode === "bill") {
      const map = new Map();
      filteredRows.forEach((row) => {
        const key = row.billId || `${row.billNo}-${row.billDate}`;
        if (!map.has(key)) {
          map.set(key, {
            key,
            billId: row.billId,
            billNo: row.billNo || "-",
            billDate: row.billDate,
            contactName: row.contactName || "-",
            agentName: row.agentName || "-",
            areaName: row.areaName || "-",
            quantity: 0,
            taxableAmount: 0,
            gstAmount: 0,
            settlementDiscount: 0,
            amount: 0,
            lineCount: 0,
            itemNames: new Set(),
          });
        }
        const entry = map.get(key);
        entry.quantity += toNumber(row.quantity, 0);
        entry.taxableAmount += toNumber(row.taxableAmount, 0);
        entry.gstAmount += toNumber(row.gstAmount, 0);
        entry.settlementDiscount = Math.max(entry.settlementDiscount, toNumber(row.settlementDiscount, 0));
        entry.amount += toNumber(row.amount, 0);
        entry.lineCount += 1;
        if (row.itemName) entry.itemNames.add(row.itemName);
      });

      return Array.from(map.values()).sort((a, b) => {
        const dateA = a.billDate ? new Date(a.billDate).getTime() : 0;
        const dateB = b.billDate ? new Date(b.billDate).getTime() : 0;
        return dateB - dateA;
      });
    }

    if (applied.viewMode === "month") {
      const map = new Map();
      filteredRows.forEach((row) => {
        const d = row.billDate ? new Date(row.billDate) : null;
        let key = "unknown";
        let label = "Unknown Month";
        let sortKey = 0;
        if (d && !isNaN(d.getTime())) {
          const y = d.getFullYear();
          const m = d.getMonth() + 1;
          key = `${y}-${String(m).padStart(2, "0")}`;
          label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
          sortKey = y * 100 + m;
        }

        if (!map.has(key)) {
          map.set(key, {
            key,
            label,
            sortKey,
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

      return Array.from(map.values())
        .map((e) => ({
          ...e,
          billCount: e.billIds.size,
        }))
        .sort((a, b) => b.sortKey - a.sortKey);
    }

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

  // Active rows for pagination and display
  const activeDisplayRows = applied.viewMode === "detail" ? filteredRows : summaryRows;

  // Pagination logic
  const totalPages = Math.ceil(activeDisplayRows.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRows = activeDisplayRows.slice(startIndex, endIndex);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [applied]);

  const totals = useMemo(() => {
    const qty = filteredRows.reduce((sum, row) => sum + toNumber(row.quantity, 0), 0);
    const taxable = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.taxableAmount, 0),
      0,
    );
    const gst = filteredRows.reduce((sum, row) => sum + toNumber(row.gstAmount, 0), 0);
    const settlementDiscount = filteredRows.reduce(
      (sum, row) => sum + toNumber(row.settlementDiscount, 0),
      0,
    );
    const amount = filteredRows.reduce((sum, row) => sum + toNumber(row.amount, 0), 0);
    return { qty, taxable, gst, settlementDiscount, amount };
  }, [filteredRows]);

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
  const firmName = firmMeta.firmName || "";
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

  const contactLabel = applied.reportType === "sale" ? "Party" : "Supplier";

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
            date, party/supplier, agent, area, item, brand, or view by monthly/bill summary.
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
          Purchase Report
        </Button>
        <Button
          variant={filters.reportType === "sale" ? "primary" : "outline"}
          onClick={() => handleReportTypeChange("sale")}
        >
          Sale Report
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
          <span className="font-semibold ml-3">Agent:</span>{" "}
          {agentMap[String(applied.agentId)] || "All"}{" "}
          <span className="font-semibold ml-3">Area:</span>{" "}
          {areaMap[String(applied.areaId)] || "All"}
        </div>
      </div>

      {/* ── TOP METRICS & MONTHLY DASHBOARD SECTION ── */}
      <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 shadow-sm purchase-print-hide">
        {/* Dashboard Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100 flex-shrink-0">
              <FaChartLine className="text-lg" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                Monthly Performance & Cost Overview
              </h2>
              <p className="text-xs text-gray-500">
                Compare monthly sales revenue vs. purchase costs and gross margins
              </p>
            </div>
          </div>

          {/* Month Selector & Action Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-gray-700 whitespace-nowrap flex items-center gap-1.5">
                <FaCalendarAlt className="text-blue-600 text-xs" />
                Select Month:
              </label>
              <select
                value={dashboardMonth}
                onChange={(e) => setDashboardMonth(e.target.value)}
                style={{ colorScheme: "light", backgroundColor: "#ffffff", color: "#111827" }}
                className="bg-white text-gray-900 font-semibold text-xs sm:text-sm border border-gray-300 rounded-lg px-3 py-1.5 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
              >
                <option value="all" className="bg-white text-gray-900 py-1">
                  All Months (Full Financial Year)
                </option>
                {availableMonths.map((m) => (
                  <option
                    key={m.key}
                    value={m.key}
                    className="bg-white text-gray-900 py-1"
                    style={{ backgroundColor: "#ffffff", color: "#111827" }}
                  >
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApplyMonthToReport(dashboardMonth)}
              className="text-xs flex items-center gap-1.5 text-blue-600 border-blue-200 hover:bg-blue-50"
              title="Apply this month's date range to the report table below"
            >
              Filter Report <FaArrowRight className="text-[10px]" />
            </Button>

            <button
              onClick={() => setShowMonthlyBreakdown((prev) => !prev)}
              className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium border border-gray-200 flex items-center gap-1.5 transition-colors"
              title="Toggle month-by-month comparative table"
            >
              {showMonthlyBreakdown ? <FaAngleUp /> : <FaAngleDown />}
              <span>{showMonthlyBreakdown ? "Hide Table" : "Compare Months"}</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDashboardMetrics((prev) => !prev)}
              className="px-3 py-1.5 bg-white hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold border border-gray-300 shadow-sm flex items-center gap-1.5 transition-colors"
            >
              <span>{showDashboardMetrics ? "Hide Metrics" : "Show Metrics"}</span>
              {showDashboardMetrics ? (
                <FaChevronUp className="text-gray-500 text-[11px]" />
              ) : (
                <FaChevronDown className="text-gray-500 text-[11px]" />
              )}
            </button>
          </div>
        </div>

        {/* Dashboard Metric KPI Cards (Default Hidden) */}
        {showDashboardMetrics && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
          {/* Total Sales Card */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border-l-4 border-l-green-500 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Total Sales
                </p>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mt-1">
                  {formatCurrency(dashboardMetrics.sales.amount)}
                </h3>
                <p className="text-[11px] text-green-700 font-medium mt-0.5 flex items-center gap-2">
                  <span>{dashboardMetrics.sales.billCount} Bills</span>
                  <span>•</span>
                  <span>{dashboardMetrics.sales.qty.toLocaleString()} Qty</span>
                </p>
              </div>
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-green-50 rounded-lg flex items-center justify-center text-green-600 border border-green-100 flex-shrink-0">
                <FaCashRegister className="text-sm sm:text-base" />
              </div>
            </div>
          </div>

          {/* Total Purchase Card */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border-l-4 border-l-blue-500 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Total Purchases
                </p>
                <h3 className="text-base sm:text-lg font-bold text-gray-900 mt-1">
                  {formatCurrency(dashboardMetrics.purchases.amount)}
                </h3>
                <p className="text-[11px] text-blue-700 font-medium mt-0.5 flex items-center gap-2">
                  <span>{dashboardMetrics.purchases.billCount} Bills</span>
                  <span>•</span>
                  <span>{dashboardMetrics.purchases.qty.toLocaleString()} Qty</span>
                </p>
              </div>
              <div className="w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600 border border-blue-100 flex-shrink-0">
                <FaShoppingCart className="text-sm sm:text-base" />
              </div>
            </div>
          </div>

          {/* Net Margin Card */}
          <div
            className={`bg-white p-3 sm:p-4 rounded-xl border-l-4 ${
              dashboardMetrics.netDiff >= 0
                ? "border-l-emerald-500"
                : "border-l-red-500"
            } border border-gray-200 shadow-sm hover:shadow-md transition-shadow`}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    Gross Difference
                  </p>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      dashboardMetrics.marginPercent >= 0
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                  >
                    {dashboardMetrics.marginPercent >= 0 ? "+" : ""}
                    {dashboardMetrics.marginPercent.toFixed(1)}%
                  </span>
                </div>
                <h3
                  className={`text-base sm:text-lg font-bold mt-1 ${
                    dashboardMetrics.netDiff >= 0
                      ? "text-emerald-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(dashboardMetrics.netDiff)}
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Sale - Purchase Cost
                </p>
              </div>
              <div
                className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center border flex-shrink-0 ${
                  dashboardMetrics.netDiff >= 0
                    ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                    : "bg-red-50 text-red-600 border-red-100"
                }`}
              >
                <FaBalanceScale className="text-sm sm:text-base" />
              </div>
            </div>
          </div>

          {/* Taxable Comparison */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border-l-4 border-l-purple-500 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="w-full">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Taxable Value
                </p>
                <div className="mt-1 space-y-0.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Sale:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.sales.taxable)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Purch:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.purchases.taxable)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* GST Amount Comparison */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border-l-4 border-l-amber-500 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="w-full">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    GST Breakdown
                  </p>
                  <span className="text-[10px] text-amber-700 font-semibold bg-amber-50 px-1 py-0.5 rounded border border-amber-200">
                    Net: {formatCurrency(dashboardMetrics.netGstLiability)}
                  </span>
                </div>
                <div className="mt-1 space-y-0.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Output:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.sales.gst)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Input:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.purchases.gst)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Settlement Discounts */}
          <div className="bg-white p-3 sm:p-4 rounded-xl border-l-4 border-l-teal-500 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className="w-full">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Sett. Discounts
                </p>
                <div className="mt-1 space-y-0.5 text-xs">
                  <div className="flex justify-between text-gray-600">
                    <span>Allowed:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.sales.settlementDiscount)}
                    </span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Recv:</span>
                    <span className="font-bold text-gray-900">
                      {formatCurrency(dashboardMetrics.purchases.settlementDiscount)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Collapsible Month-by-Month Comparative Table */}
        {showMonthlyBreakdown && (
          <div className="mt-4 pt-4 border-t border-gray-100 overflow-x-auto">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Month-by-Month Comparative Summary
              </span>
              <span className="text-xs text-gray-500">
                Click on any row to filter dashboard & table
              </span>
            </div>
            <table className="min-w-full divide-y divide-gray-200 border border-gray-200 rounded-lg overflow-hidden text-xs">
              <thead className="bg-gray-50 text-gray-700 font-semibold uppercase">
                <tr>
                  <th className="px-3 py-2.5 text-left">Month / Period</th>
                  <th className="px-3 py-2.5 text-right">Sale Bills</th>
                  <th className="px-3 py-2.5 text-right">Sale Amount</th>
                  <th className="px-3 py-2.5 text-right">Purchase Bills</th>
                  <th className="px-3 py-2.5 text-right">Purchase Cost</th>
                  <th className="px-3 py-2.5 text-right">Net Margin</th>
                  <th className="px-3 py-2.5 text-right">Margin %</th>
                  <th className="px-3 py-2.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {dashboardMetrics.monthlyBreakdown.map((row) => {
                  const isSelected = dashboardMonth === row.key;
                  return (
                    <tr
                      key={row.key}
                      onClick={() => setDashboardMonth(row.key)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-blue-50/80 font-semibold"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      <td className="px-3 py-2 text-gray-900 font-medium flex items-center gap-1.5">
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                        )}
                        {row.label}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {row.sales.billCount}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-green-700">
                        {formatCurrency(row.sales.amount)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {row.purchases.billCount}
                      </td>
                      <td className="px-3 py-2 text-right font-medium text-blue-700">
                        {formatCurrency(row.purchases.amount)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-bold ${
                          row.netDiff >= 0
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {formatCurrency(row.netDiff)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            row.marginPercent >= 0
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {row.marginPercent >= 0 ? "+" : ""}
                          {row.marginPercent.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDashboardMonth(row.key);
                            handleApplyMonthToReport(row.key);
                          }}
                          className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-xs font-semibold border border-blue-200 transition-colors"
                        >
                          Filter
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white border rounded-lg p-4 purchase-print-hide">
        <h3 className="font-medium text-gray-900 mb-3">Filters & View Modes</h3>
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
          <div className="md:col-span-6">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <Input
              value={filters.search}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, search: value }))
              }
              placeholder="Search bill no, party/supplier, item, brand, agent, area, month..."
            />
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 shadow-sm">
        <div className="overflow-x-auto">
          {applied.viewMode === "detail" ? (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-700 font-semibold">
                <tr>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Bill No</th>
                  <th className="px-2 py-2 text-left">{contactLabel}</th>
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-left">Brand</th>
                  <th className="px-2 py-2 text-left">Agent</th>
                  <th className="px-2 py-2 text-left">Area</th>
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
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={17}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading {applied.reportType === "sale" ? "sales" : "purchase"} report...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-b-0 hover:bg-gray-50/80">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatDate(row.billDate)}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{row.billNo || "-"}</td>
                      <td className="px-2 py-1.5 font-medium">{row.contactName}</td>
                      <td className="px-2 py-1.5">{row.itemName}</td>
                      <td className="px-2 py-1.5">{row.brandName}</td>
                      <td className="px-2 py-1.5">{row.agentName}</td>
                      <td className="px-2 py-1.5">{row.areaName}</td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.rate, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.discount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.specialDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.gstPercent, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-center purchase-print-hide">
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
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={17}
                    >
                      No entries found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {!loading && filteredRows.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <tr>
                    <td className="px-2 py-2 text-left" colSpan={7}>
                      GRAND TOTAL ({filteredRows.length} Items, {stats.billCount} Bills)
                    </td>
                    <td className="px-2 py-2 text-right">
                      {totals.qty.toLocaleString()}
                    </td>
                    <td className="px-2 py-2" colSpan={3}></td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.taxable.toLocaleString()}
                    </td>
                    <td className="px-2 py-2"></td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.gst.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.settlementDiscount.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-700 font-extrabold text-sm whitespace-nowrap">
                      Rs. {totals.amount.toLocaleString()}
                    </td>
                    <td className="purchase-print-hide"></td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : applied.viewMode === "bill" ? (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-700 font-semibold">
                <tr>
                  <th className="px-2 py-2 text-left">Date</th>
                  <th className="px-2 py-2 text-left">Bill No</th>
                  <th className="px-2 py-2 text-left">{contactLabel}</th>
                  <th className="px-2 py-2 text-left">Agent</th>
                  <th className="px-2 py-2 text-left">Area</th>
                  <th className="px-2 py-2 text-right">Lines</th>
                  <th className="px-2 py-2 text-right">Total Qty</th>
                  <th className="px-2 py-2 text-right">Taxable Amt</th>
                  <th className="px-2 py-2 text-right">GST Amt</th>
                  <th className="px-2 py-2 text-right">Sett. Disc</th>
                  <th className="px-2 py-2 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={11}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading bill-wise report...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.key} className="border-b last:border-b-0 hover:bg-gray-50/80">
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {formatDate(row.billDate)}
                      </td>
                      <td className="px-2 py-1.5 font-medium">{row.billNo}</td>
                      <td className="px-2 py-1.5 font-medium">{row.contactName}</td>
                      <td className="px-2 py-1.5">{row.agentName}</td>
                      <td className="px-2 py-1.5">{row.areaName}</td>
                      <td className="px-2 py-1.5 text-right">{row.lineCount}</td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && paginatedRows.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={11}
                    >
                      No entries found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {!loading && summaryRows.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <tr>
                    <td className="px-2 py-2 text-left" colSpan={5}>
                      GRAND TOTAL ({stats.billCount} Bills)
                    </td>
                    <td className="px-2 py-2 text-right">{stats.lineCount}</td>
                    <td className="px-2 py-2 text-right">
                      {totals.qty.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.taxable.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.gst.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.settlementDiscount.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-700 font-extrabold text-sm whitespace-nowrap">
                      Rs. {totals.amount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : applied.viewMode === "month" ? (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-700 font-semibold">
                <tr>
                  <th className="px-2 py-2 text-left">Month / Period</th>
                  <th className="px-2 py-2 text-right">Total Bills</th>
                  <th className="px-2 py-2 text-right">Total Lines</th>
                  <th className="px-2 py-2 text-right">Total Qty</th>
                  <th className="px-2 py-2 text-right">Taxable Amt</th>
                  <th className="px-2 py-2 text-right">GST Amt</th>
                  <th className="px-2 py-2 text-right">Sett. Disc</th>
                  <th className="px-2 py-2 text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={8}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading monthly summary report...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.key} className="border-b last:border-b-0 hover:bg-gray-50/80">
                      <td className="px-2 py-2 font-semibold text-gray-900">{row.label}</td>
                      <td className="px-2 py-2 text-right font-medium">
                        {row.billCount}
                      </td>
                      <td className="px-2 py-2 text-right">{row.lineCount}</td>
                      <td className="px-2 py-2 text-right font-medium">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right text-gray-600">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right font-bold text-gray-900 text-xs sm:text-sm">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && summaryRows.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={8}
                    >
                      No entries found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {!loading && summaryRows.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <tr>
                    <td className="px-2 py-2 text-left">
                      GRAND TOTAL ({summaryRows.length} Months)
                    </td>
                    <td className="px-2 py-2 text-right">{stats.billCount}</td>
                    <td className="px-2 py-2 text-right">{stats.lineCount}</td>
                    <td className="px-2 py-2 text-right">
                      {totals.qty.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.taxable.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.gst.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.settlementDiscount.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-700 font-extrabold text-sm whitespace-nowrap">
                      Rs. {totals.amount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <table className="w-full text-xs purchase-print-table">
              <thead className="bg-gray-50 text-gray-700 font-semibold">
                <tr>
                  <th className="px-2 py-2 text-left">{summaryGroupLabel}</th>
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
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={8}
                    >
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                        <span>Loading summary report...</span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  paginatedRows.map((row) => (
                    <tr key={row.key} className="border-b last:border-b-0 hover:bg-gray-50/80">
                      <td className="px-2 py-1.5 font-medium">{row.label}</td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {row.billCount}
                      </td>
                      <td className="px-2 py-1.5 text-right">{row.lineCount}</td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.quantity, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.taxableAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {toNumber(row.gstAmount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-600">
                        {toNumber(row.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right font-bold text-gray-900">
                        {toNumber(row.amount, 0).toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
                {!loading && summaryRows.length === 0 && (
                  <tr>
                    <td
                      className="px-3 py-8 text-center text-gray-500"
                      colSpan={8}
                    >
                      No entries found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
              {!loading && summaryRows.length > 0 && (
                <tfoot className="bg-gray-100 font-bold border-t-2 border-gray-400">
                  <tr>
                    <td className="px-2 py-2 text-left">
                      GRAND TOTAL ({summaryRows.length} Groups)
                    </td>
                    <td className="px-2 py-2 text-right">{stats.billCount}</td>
                    <td className="px-2 py-2 text-right">{stats.lineCount}</td>
                    <td className="px-2 py-2 text-right">
                      {totals.qty.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.taxable.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.gst.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right">
                      Rs. {totals.settlementDiscount.toLocaleString()}
                    </td>
                    <td className="px-2 py-2 text-right text-blue-700 font-extrabold text-sm whitespace-nowrap">
                      Rs. {totals.amount.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t purchase-print-hide">
            <div className="flex items-center text-sm text-gray-700">
              <span>
                Showing {startIndex + 1} to {Math.min(endIndex, activeDisplayRows.length)} of {activeDisplayRows.length} entries
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

        {/* Prominent Bottom Grand Total Cards */}
        {!loading && filteredRows.length > 0 && (
          <div className="mt-6 pt-4 border-t-2 border-gray-200 purchase-print-summary">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
              Overall Report Summary & Grand Totals
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-7 gap-3">
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">Total Bills</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.billCount}</div>
              </div>
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">Total Item Lines</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{stats.lineCount}</div>
              </div>
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">Total Quantity</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">{totals.qty.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">Taxable Amount</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">Rs. {totals.taxable.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">GST Amount</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">Rs. {totals.gst.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-gray-50 border rounded-lg">
                <div className="text-[11px] text-gray-500 font-medium">Sett. Discount</div>
                <div className="text-base font-bold text-gray-900 mt-0.5">Rs. {totals.settlementDiscount.toLocaleString()}</div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg col-span-2 sm:col-span-1">
                <div className="text-[11px] text-blue-700 font-bold uppercase">Grand Total Net</div>
                <div className="text-base sm:text-lg font-extrabold text-blue-800 mt-0.5">
                  Rs. {totals.amount.toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PurchaseDateWiseReport;
