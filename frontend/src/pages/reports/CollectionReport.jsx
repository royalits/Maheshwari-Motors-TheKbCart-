import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import useStore from "../../store";
import {
  getEntityId,
  getResponseData,
  getResponseList,
  getResponseMeta,
  toNumber,
} from "../../services/apiUtils";
import { FaPrint, FaSyncAlt } from "react-icons/fa";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
  getResolvedFirmMeta,
} from "../../utils/reportPdf";

const INITIAL_FILTERS = {
  type: "party",
  dateFrom: getFinancialYearStartDate(),
  dateTo: getTodayDate(),
  contactId: "",
  search: "",
};

const CollectionReport = () => {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [applied, setApplied] = useState(INITIAL_FILTERS);
  const [parties, setParties] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
    totalRecords: 0,
  });
  const { showToast } = useStore();

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
    const loadContacts = async () => {
      try {
        const [partyList, supplierList] = await Promise.all([
          fetchPagedList("/contacts/parties"),
          fetchPagedList("/contacts/suppliers"),
        ]);

        setParties(
          partyList.map((c) => ({
            id: getEntityId(c),
            name: c?.name || "",
            type: "party",
          })),
        );
        setSuppliers(
          supplierList.map((c) => ({
            id: getEntityId(c),
            name: c?.name || "",
            type: "supplier",
          })),
        );
      } catch (error) {
        console.error("Failed to load contacts for collection report", error);
      }
    };

    loadContacts();
  }, []);

  const partyMap = useMemo(() => {
    const map = {};
    parties.forEach((p) => {
      map[String(p.id)] = p;
    });
    return map;
  }, [parties]);

  const supplierMap = useMemo(() => {
    const map = {};
    suppliers.forEach((s) => {
      map[String(s.id)] = s;
    });
    return map;
  }, [suppliers]);

  const contactOptions = useMemo(() => {
    return filters.type === "party" ? parties : suppliers;
  }, [filters.type, parties, suppliers]);

  const formatMonthLabel = (value) => {
    if (!value) return "-";
    const [year, month] = value.split("-").map((v) => Number(v));
    if (!year || !month) return value;
    const date = new Date(year, month - 1, 1);
    return date.toLocaleString(undefined, { month: "short", year: "numeric" });
  };

  const resolvePaymentMode = (source) => {
    const direct =
      source?.payment_mode ??
      source?.paymentMode ??
      source?.bank_card_type ??
      source?.bankCardType ??
      "";

    if (direct) return String(direct);

    const bankValue =
      source?.bank_amount ??
      source?.bankAmount ??
      source?.bank_received_amount ??
      source?.bankReceivedAmount ??
      source?.bank_payment_amount ??
      source?.bankPaymentAmount ??
      0;
    const cashValue =
      source?.cash_amount ??
      source?.cashAmount ??
      source?.cash_received_amount ??
      source?.cashReceivedAmount ??
      source?.cash_payment_amount ??
      source?.cashPaymentAmount ??
      0;

    const bank = toNumber(bankValue, 0);
    const cash = toNumber(cashValue, 0);
    if (bank > 0 && cash > 0) return "Bank+Cash";
    if (bank > 0) return "Bank";
    if (cash > 0) return "Cash";
    return "-";
  };

  const getMonthKey = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  };

  const [summary, setSummary] = useState({
    total_challan_amount: 0,
    total_payment: 0,
    total_balance: 0,
  });

  const handleView = async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        type: filters.type || "party",
        from_date: filters.dateFrom || undefined,
        to_date: filters.dateTo || undefined,
        contact_id: filters.contactId || undefined,
        page,
        limit: pagination.limit,
      };

      // Remove undefined values
      Object.keys(params).forEach((key) => {
        if (params[key] === undefined) {
          delete params[key];
        }
      });

      const res = await api.get("/reports/collection", { params });
      const payload = getResponseData(res) || {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      const meta = getResponseMeta(res) || {};
      const summaryPayload = payload.summary || {};

      // Update pagination info
      setPagination((prev) => ({
        ...prev,
        page: meta.page || page,
        totalPages: meta.totalPages || 1,
        totalRecords: meta.totalRecords || list.length,
      }));

      const flattened = list.flatMap((entry) => {
        const contact = entry?.contact || {};
        const contactId = getEntityId(contact);
        const contactName = contact?.name || "Unknown";
        const monthly = Array.isArray(entry?.monthly) ? entry.monthly : [];
        const overallPaymentMode = resolvePaymentMode(entry);

        if (monthly.length === 0) {
          return [
            {
              key: `${contactId}-all`,
              monthKey: "",
              contactId,
              contactName,
              primaryAmount: toNumber(entry?.total_challan_amount, 0),
              paymentAmount: toNumber(entry?.total_payment, 0),
              paymentMode: overallPaymentMode,
            },
          ];
        }

        return monthly.map((m) => {
          const paymentMode = resolvePaymentMode(m);

          return {
            key: `${contactId}-${m.year}-${m.month}`,
            monthKey: `${m.year}-${String(m.month).padStart(2, "0")}`,
            contactId,
            contactName,
            primaryAmount: toNumber(m?.challan_amount, 0),
            paymentAmount: toNumber(m?.payment_amount, 0),
            paymentMode,
          };
        });
      });

      setSummary({
        total_challan_amount: toNumber(summaryPayload.total_challan_amount, 0),
        total_payment: toNumber(summaryPayload.total_payment, 0),
        total_balance: toNumber(summaryPayload.total_balance, 0),
      });

      setRows(
        flattened.sort((a, b) => {
          if (a.monthKey !== b.monthKey)
            return b.monthKey.localeCompare(a.monthKey);
          return a.contactName.localeCompare(b.contactName);
        }),
      );
    } catch (error) {
      console.error("Failed to load collection report", error);
      showToast(
        error?.response?.data?.message || "Failed to load collection report",
        "error",
      );
      setRows([]);
      setSummary({
        total_challan_amount: 0,
        total_payment: 0,
        total_balance: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setFilters(INITIAL_FILTERS);
    setApplied(INITIAL_FILTERS);
    setRows([]);
    setSummary({ total_challan_amount: 0, total_payment: 0, total_balance: 0 });
    setPagination({ page: 1, limit: 20, totalPages: 1, totalRecords: 0 });
  };

  const handlePageChange = (newPage) => {
    setPagination((prev) => ({ ...prev, page: newPage }));
    handleView(newPage);
  };

  const handleLimitChange = (newLimit) => {
    setPagination((prev) => ({ ...prev, limit: newLimit, page: 1 }));
    handleView(1);
  };

  const handlePrint = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const typeLabel = applied.type === "party" ? "Party" : "Supplier";
    const pLabel = applied.type === "party" ? "Sales" : "Purchase";
    const pmtLabel = applied.type === "party" ? "Payment Collected" : "Payment Given";
    const startY = drawBrandedReportHeader(doc, {
      title: "Collection Report",
      subtitle: `Type: ${typeLabel} | Period: ${applied.dateFrom || "-"} to ${applied.dateTo || "-"} | Total Records: ${filteredRows.length}`,
    });

    const totalNet = totals.primary - totals.payment;

    autoTable(doc, {
      startY,
      head: [["#", "Month", typeLabel, pLabel, pmtLabel, "Pay Type", "Net Balance"]],
      body: [
        ...filteredRows.map((row, idx) => [
          idx + 1,
          formatMonthLabel(row.monthKey),
          row.contactName,
          toNumber(row.primaryAmount, 0).toLocaleString("en-IN"),
          toNumber(row.paymentAmount, 0).toLocaleString("en-IN"),
          row.paymentMode || "-",
          toNumber(row.primaryAmount - row.paymentAmount, 0).toLocaleString("en-IN"),
        ]),
        ["", "TOTAL", "",
          totals.primary.toLocaleString("en-IN"),
          totals.payment.toLocaleString("en-IN"),
          "",
          totalNet.toLocaleString("en-IN"),
        ],
      ],
      styles: {
        fontSize: 9,
        cellPadding: { top: 3, bottom: 3, left: 4, right: 4 },
        valign: "middle",
        lineColor: [156, 163, 175],
        lineWidth: 0.2,
      },
      headStyles: {
        fillColor: [235, 235, 235],
        textColor: 0,
        fontStyle: "bold",
        fontSize: 9,
        halign: "center",
      },
      alternateRowStyles: { fillColor: [248, 248, 248] },
      didParseCell: (data) => {
        if (data.section === "body" && data.row.index === filteredRows.length) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [235, 235, 235];
          data.cell.styles.textColor = [0, 0, 0];
        }
      },
      columnStyles: {
        0: { cellWidth: 10, halign: "center" },
        1: { cellWidth: 28, halign: "left" },
        2: { cellWidth: "auto", halign: "left" },
        3: { cellWidth: 30, halign: "right" },
        4: { cellWidth: 36, halign: "right" },
        5: { cellWidth: 22, halign: "center" },
        6: { cellWidth: 30, halign: "right" },
      },
      margin: { left: 14, right: 14 },
      tableWidth: "auto",
    });

    addBrandedReportFooters(doc);

    doc.save(`collection-report-${applied.dateFrom || "all"}-to-${applied.dateTo || "all"}.pdf`);
  };

  useEffect(() => {
    setApplied(filters);
  }, [filters]);

  useEffect(() => {
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page when filters change
    handleView(1);
  }, [filters.type, filters.dateFrom, filters.dateTo, filters.contactId]);

  const filteredRows = useMemo(() => {
    const term = applied.search.trim().toLowerCase();
    return rows.filter((row) => {
      if (
        applied.contactId &&
        String(row.contactId) !== String(applied.contactId)
      )
        return false;
      if (term && !row.contactName.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [rows, applied]);

  const totals = useMemo(() => {
    if (summary.total_challan_amount || summary.total_payment) {
      return {
        primary: summary.total_challan_amount,
        payment: summary.total_payment,
      };
    }
    return filteredRows.reduce(
      (acc, row) => {
        acc.primary += toNumber(row.primaryAmount, 0);
        acc.payment += toNumber(row.paymentAmount, 0);
        return acc;
      },
      { primary: 0, payment: 0 },
    );
  }, [filteredRows, summary]);

  const primaryLabel = applied.type === "party" ? "Sales" : "Purchase";
  const paymentLabel =
    applied.type === "party" ? "Payment Collected" : "Payment Given";

  const firmMeta = getResolvedFirmMeta();
  const firmName = firmMeta.firmName || "Firm";
  const firm = firmMeta.raw || selectedFirm || user?.gst_firm || user?.nongst_firm || null;
  const firmAddress = [firmMeta.address, firmMeta.city, firmMeta.state, firm?.pincode]
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
        .collection-print-header { display: none; }
        .collection-print-branding { display: none; }
        .collection-print-table { border-collapse: collapse; width: 100%; font-size: 10px; }
        .collection-print-table th, .collection-print-table td { border: 1px solid #9ca3af; }
        @media print {
          .collection-print-hide { display: none !important; }
          .collection-print-header { display: block; }
          .collection-print-branding { display: block; }
          .collection-print-header { text-align: center; border: 2px solid #111827; padding: 10px 14px; margin-bottom: 12px; }
          .collection-print-branding { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #9ca3af; }
          .collection-print-table th, .collection-print-table td { border: 1px solid #9ca3af; }
          .collection-print-table thead th { background: #e5e7eb !important; }
          @page { size: A4 landscape; margin: 10mm; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 collection-print-hide">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Collection Report</h1>
          <p className="text-sm text-gray-600">
            Party/Supplier wise monthly {primaryLabel.toLowerCase()} and payment
            summary.
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

      <div className="collection-print-header">
        <div className="collection-print-branding">
          <div className="text-base font-semibold">{firmName}</div>
          {firmLine ? (
            <div className="text-[10px] text-gray-600 mt-1">{firmLine}</div>
          ) : null}
        </div>
        <div className="text-lg font-semibold">Collection Report</div>
        <div className="text-xs text-gray-600 mt-1">
          Type: {applied.type === "party" ? "Party" : "Supplier"} | Period:{" "}
          {applied.dateFrom || "-"} to {applied.dateTo || "-"}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-4 collection-print-hide">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Type
            </label>
            <Select
              value={filters.type}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, type: value, contactId: "" }))
              }
            >
              <option value="party">Party</option>
              <option value="supplier">Supplier</option>
            </Select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {filters.type === "party" ? "Party" : "Supplier"}
            </label>
            <Select
              value={filters.contactId}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, contactId: value }))
              }
            >
              <option value="">
                {filters.type === "party" ? "All Parties" : "All Suppliers"}
              </option>
              {contactOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
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
              Search
            </label>
            <Input
              value={filters.search}
              onChange={(value) =>
                setFilters((prev) => ({ ...prev, search: value }))
              }
              placeholder="Search name"
            />
          </div>
        </div>

        {/* Pagination Controls */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Show:</span>
            <Select
              value={pagination.limit}
              onChange={handleLimitChange}
              className="w-20"
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </Select>
            <span className="text-sm text-gray-600">per page</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">
              Showing{" "}
              {Math.min(
                (pagination.page - 1) * pagination.limit + 1,
                pagination.totalRecords,
              )}{" "}
              to{" "}
              {Math.min(
                pagination.page * pagination.limit,
                pagination.totalRecords,
              )}{" "}
              of {pagination.totalRecords} entries
            </span>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
              >
                Previous
              </Button>

              {/* Page numbers */}
              {Array.from(
                { length: Math.min(5, pagination.totalPages) },
                (_, i) => {
                  const pageNum = Math.max(1, pagination.page - 2) + i;
                  if (pageNum > pagination.totalPages) return null;
                  return (
                    <Button
                      key={pageNum}
                      variant={
                        pageNum === pagination.page ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => handlePageChange(pageNum)}
                    >
                      {pageNum}
                    </Button>
                  );
                },
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs collection-print-table">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-2 text-left">Month</th>
                <th className="px-2 py-2 text-left">
                  {applied.type === "party" ? "Party" : "Supplier"}
                </th>
                <th className="px-2 py-2 text-right">{primaryLabel}</th>
                <th className="px-2 py-2 text-right">{paymentLabel}</th>
                <th className="px-2 py-2 text-right">Payment Type</th>
                <th className="px-2 py-2 text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={6}
                  >
                    Loading collection report...
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => (
                  <tr key={row.key} className="border-b last:border-b-0">
                    <td className="px-2 py-1">
                      {formatMonthLabel(row.monthKey)}
                    </td>
                    <td className="px-2 py-1">{row.contactName}</td>
                    <td className="px-2 py-1 text-right">
                      {toNumber(row.primaryAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {toNumber(row.paymentAmount, 0).toLocaleString()}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {row.paymentMode || "-"}
                    </td>
                    <td className="px-2 py-1 text-right">
                      {toNumber(
                        row.primaryAmount - row.paymentAmount,
                        0,
                      ).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
              {!loading && filteredRows.length === 0 && (
                <tr>
                  <td
                    className="px-3 py-6 text-center text-gray-500"
                    colSpan={6}
                  >
                    No records found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 border-t pt-3 text-xs text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              Total {primaryLabel}:{" "}
              <span className="font-semibold">
                {totals.primary.toLocaleString()}
              </span>
            </div>
            <div>
              Total {paymentLabel}:{" "}
              <span className="font-semibold">
                {totals.payment.toLocaleString()}
              </span>
            </div>
            <div>
              Net Balance:{" "}
              <span className="font-semibold">
                {(totals.primary - totals.payment).toLocaleString()}
              </span>
            </div>
            {/* {summary.total_balance !== 0 && (
              <div className="text-blue-600">
                API Balance:{" "}
                <span className="font-semibold">
                  {summary.total_balance.toLocaleString()}
                </span>
              </div>
            )} */}
          </div>
          {pagination.totalRecords > 0 && (
            <div className="mt-2 text-center text-gray-500">
              Displaying {filteredRows.length} records from page{" "}
              {pagination.page} of {pagination.totalPages}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollectionReport;
