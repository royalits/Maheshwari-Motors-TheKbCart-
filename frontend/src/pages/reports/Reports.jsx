import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Select } from "../../components/ui";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseData,
  getResponseList,
  normalizeContact,
  toNumber,
} from "../../services/apiUtils";
import { FaPrint, FaSyncAlt } from "react-icons/fa";
import { getResolvedFirmMeta } from "../../utils/reportPdf";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";

const REPORT_TYPES = ["All", "Sale", "Purchase", "Cash Rec", "Cash Pay", "Bank Rec", "Bank Pay"];

const INIT_FILTERS = {
  ledgerScope: "party",
  partyId: "",
  bankId: "",
  dateFrom: getFinancialYearStartDate(),
  dateTo: getTodayDate(),
  type: "All",
};

const Reports = () => {
  const [parties, setParties] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [filters, setFilters] = useState(INIT_FILTERS);
  const [applied, setApplied] = useState(INIT_FILTERS);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [apiTotals, setApiTotals] = useState({ debit: 0, credit: 0, closing: 0, closingCd: "" });

  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [partyRes, supplierRes, bankRes] = await Promise.all([
          api.get("/contacts/parties", { params: { page: 1, limit: 200 } }),
          api.get("/contacts/suppliers", { params: { page: 1, limit: 200 } }),
          api.get("/banks", { params: { page: 1, limit: 200 } }),
        ]);
        setParties(getResponseList(partyRes).map((c) => { const n = normalizeContact(c); return { id: n.id, name: n.name }; }));
        setSuppliers(getResponseList(supplierRes).map((c) => { const n = normalizeContact(c); return { id: n.id, name: n.name }; }));
        setBanks(getResponseList(bankRes).map((b) => ({
          id: getEntityId(b),
          name: b?.bank_name || b?.name || "Bank",
          account: b?.account_number || b?.accountNo || "",
        })));
      } catch (error) {
        console.error("Failed to load report filters", error);
      }
    };
    loadFilters();
  }, []);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (applied.type !== "All" && row.type !== applied.type) return false;
      if (applied.dateFrom && new Date(row.date) < new Date(applied.dateFrom)) return false;
      if (applied.dateTo && new Date(row.date) > new Date(applied.dateTo)) return false;
      return true;
    });
  }, [rows, applied]);

  const totals = useMemo(() => {
    const hasRows = filteredRows.length > 0;
    return {
      debitTotal: hasRows ? filteredRows.reduce((s, r) => s + toNumber(r.debit, 0), 0) : toNumber(apiTotals.debit, 0),
      creditTotal: hasRows ? filteredRows.reduce((s, r) => s + toNumber(r.credit, 0), 0) : toNumber(apiTotals.credit, 0),
      closingBalance: hasRows ? filteredRows[filteredRows.length - 1].balance : toNumber(apiTotals.closing, 0),
      closingCd: hasRows ? filteredRows[filteredRows.length - 1].cd : apiTotals.closingCd || "",
    };
  }, [filteredRows, apiTotals]);

  const handleView = async () => {
    const needsContact = filters.ledgerScope === "party" || filters.ledgerScope === "supplier";
    if (needsContact && !filters.partyId) {
      setRows([]);
      setApiTotals({ debit: 0, credit: 0, closing: 0, closingCd: "" });
      return;
    }
    setLoading(true);
    try {
      const params = {
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
      };
      if (needsContact) {
        params.contact_id = filters.partyId;
      } else {
        params.account_type = filters.ledgerScope;
        if (filters.ledgerScope === "bank" && filters.bankId) params.bank_id = filters.bankId;
      }
      const res = await api.get("/reports/account-ledger", { params });
      const payload = getResponseData(res) || {};
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      const mapped = entries.map((entry) => ({
        date: entry.date,
        voucherNo: entry.v_no || entry.voucher_no || entry.vNo || "",
        type: entry.type || "",
        narration: entry.narration || "",
        debit: toNumber(entry.debit_amount ?? entry.debit, 0),
        credit: toNumber(entry.credit_amount ?? entry.credit, 0),
        balance: toNumber(entry.balance, 0),
        cd: entry.cd || "",
      }));
      setRows(mapped);
      setApiTotals({
        debit: toNumber(payload.total_debit, 0),
        credit: toNumber(payload.total_credit, 0),
        closing: mapped.length > 0 ? mapped[mapped.length - 1].balance : toNumber(payload.closing_balance, 0),
        closingCd: mapped.length > 0 ? mapped[mapped.length - 1].cd : payload.closing_cd || "",
      });
    } catch (error) {
      console.error("Failed to load account ledger", error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setFilters(INIT_FILTERS);
    setApplied(INIT_FILTERS);
    setRows([]);
    setApiTotals({ debit: 0, credit: 0, closing: 0, closingCd: "" });
  };

  const getEntityName = () => {
    if (filters.ledgerScope === "party" && filters.partyId)
      return parties.find((p) => p.id === filters.partyId)?.name || "Unknown Party";
    if (filters.ledgerScope === "supplier" && filters.partyId)
      return suppliers.find((s) => s.id === filters.partyId)?.name || "Unknown Supplier";
    if (filters.ledgerScope === "bank" && filters.bankId)
      return banks.find((b) => b.id === filters.bankId)?.name || "Unknown Bank";
    if (filters.ledgerScope === "cash") return "Cash Account";
    return "All";
  };

  const handlePrint = () => {
    const printWindow = window.open("", "", "width=900,height=700");
    const currentDate = new Date().toLocaleDateString("en-IN");
    const currentTime = new Date().toLocaleTimeString("en-IN");
    const firmMeta = getResolvedFirmMeta();
    const firmName = firmMeta.firmName || "Firm";
    const firmAddress = firmMeta.address || "";
    const firmPhone = firmMeta.phone || "";
    const firmGstin = firmMeta.gstin || "";
    const entityName = getEntityName();
    const fmtDate = (d) => (d ? new Date(d).toLocaleDateString("en-IN") : "-");
    const fmtAmt = (v) => toNumber(v, 0).toLocaleString("en-IN");

    printWindow.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Account Ledger - ${entityName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 11px; color: #111827; padding: 12px; background: #fff; }
    .firm-header { text-align: center; border: 2px solid #111827; padding: 10px 12px; margin-bottom: 10px; }
    .firm-header h1 { font-size: 18px; font-weight: bold; margin-bottom: 3px; }
    .firm-header p { font-size: 10px; margin-top: 2px; }
    .report-title { text-align: center; font-size: 13px; font-weight: bold; margin: 8px 0; padding-bottom: 5px; border-bottom: 1px solid #9ca3af; letter-spacing: 0.3px; }
    .meta-row { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px 18px; font-size: 10px; margin-bottom: 10px; border: 1px solid #9ca3af; padding: 7px 10px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    th { background: #e5e7eb; border: 1px solid #6b7280; padding: 5px 6px; text-align: left; font-size: 10px; }
    th.r { text-align: right; }
    td { border: 1px solid #9ca3af; padding: 4px 6px; font-size: 10px; }
    td.r { text-align: right; }
    tr:nth-child(even) td { background: #f9f9f9; }
    .totals-row td { font-weight: bold; background: #e5e7eb !important; border-top: 2px solid #111827; }
    .footer { text-align: center; font-size: 9px; color: #555; margin-top: 10px; border-top: 1px solid #9ca3af; padding-top: 5px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="firm-header">
    <h1>${firmName}</h1>
    ${firmAddress ? `<p>${firmAddress}</p>` : ""}
    <p>${[firmPhone ? `Ph: ${firmPhone}` : "", firmGstin ? `GSTIN: ${firmGstin}` : ""].filter(Boolean).join(" | ")}</p>
  </div>
  <div class="report-title">ACCOUNT LEDGER</div>
  <div class="meta-row">
    <span><b>Account:</b> ${entityName} (${filters.ledgerScope.toUpperCase()})</span>
    <span><b>Period:</b> ${filters.dateFrom || "Start"} to ${filters.dateTo || "End"}</span>
    <span><b>Type:</b> ${filters.type}</span>
    <span><b>Printed:</b> ${currentDate} ${currentTime}</span>
  </div>
  ${
    filteredRows.length > 0
      ? `<table>
    <thead>
      <tr>
        <th style="width:70px">Date</th>
        <th>Voucher No.</th>
        <th>Type</th>
        <th class="r">Debit (Rs.)</th>
        <th class="r">Credit (Rs.)</th>
        <th class="r">Balance (Rs.)</th>
        <th style="width:30px">C/D</th>
      </tr>
    </thead>
    <tbody>
      ${filteredRows
        .map(
          (row) => `<tr>
        <td>${fmtDate(row.date)}</td>
        <td>${row.voucherNo || "-"}</td>
        <td>${row.type || "-"}</td>
        <td class="r">${row.debit > 0 ? fmtAmt(row.debit) : "-"}</td>
        <td class="r">${row.credit > 0 ? fmtAmt(row.credit) : "-"}</td>
        <td class="r">${fmtAmt(row.balance)}</td>
        <td>${row.cd || ""}</td>
      </tr>`
        )
        .join("")}
      <tr class="totals-row">
        <td colspan="3">TOTAL (${filteredRows.length} entries)</td>
        <td class="r">${fmtAmt(totals.debitTotal)}</td>
        <td class="r">${fmtAmt(totals.creditTotal)}</td>
        <td class="r">${fmtAmt(totals.closingBalance)} ${totals.closingCd}</td>
        <td></td>
      </tr>
    </tbody>
  </table>`
      : `<p style="text-align:center;padding:20px;color:#666">No ledger entries found.</p>`
  }
  <div class="footer">Generated on ${currentDate} at ${currentTime}</div>
</body>
</html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 300);
  };

  useEffect(() => { setApplied(filters); }, [filters]);

  useEffect(() => {
    handleView();
  }, [filters.ledgerScope, filters.partyId, filters.bankId, filters.dateFrom, filters.dateTo]);

  const contactList = filters.ledgerScope === "supplier" ? suppliers : parties;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Account Ledger Report</h1>
        <p className="text-gray-600">Filter ledger entries for parties, suppliers, cash, or bank.</p>
      </div>

      <div className="bg-white border rounded-lg p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={handlePrint} className="flex items-center gap-2">
            <FaPrint /> Print
          </Button>
          <Button variant="outline" onClick={handleRefresh} className="flex items-center gap-2">
            <FaSyncAlt /> Reset Filters
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ledger Scope</label>
            <Select
              value={filters.ledgerScope}
              onChange={(value) => setFilters((prev) => ({ ...prev, ledgerScope: value, partyId: "", bankId: "" }))}
            >
              <option value="party">Party</option>
              <option value="supplier">Supplier</option>
              <option value="cash">Cash</option>
              <option value="bank">Bank</option>
            </Select>
          </div>

          {(filters.ledgerScope === "party" || filters.ledgerScope === "supplier") && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {filters.ledgerScope === "supplier" ? "Supplier" : "Party"}
              </label>
              <Select
                value={filters.partyId}
                onChange={(value) => setFilters((prev) => ({ ...prev, partyId: value }))}
              >
                <option value="">{filters.ledgerScope === "supplier" ? "Select Supplier" : "Select Party"}</option>
                {contactList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </div>
          )}

          {filters.ledgerScope === "bank" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank</label>
              <Select
                value={filters.bankId}
                onChange={(value) => setFilters((prev) => ({ ...prev, bankId: value }))}
              >
                <option value="">All Banks</option>
                {banks.map((bank) => (
                  <option key={bank.id} value={bank.id}>
                    {bank.name}{bank.account ? ` - ${bank.account}` : ""}
                  </option>
                ))}
              </Select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
            <Input type="date" value={filters.dateFrom} onChange={(value) => setFilters((prev) => ({ ...prev, dateFrom: value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
            <Input type="date" value={filters.dateTo} onChange={(value) => setFilters((prev) => ({ ...prev, dateTo: value }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <Select value={filters.type} onChange={(value) => setFilters((prev) => ({ ...prev, type: value }))}>
              {REPORT_TYPES.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-white border rounded-lg p-4">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">V. No</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-right">Debit Amount</th>
                <th className="px-3 py-2 text-right">Credit Amount</th>
                <th className="px-3 py-2 text-right">Balance</th>
                <th className="px-3 py-2 text-left">C/D</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={7}>Loading ledger...</td></tr>
              ) : (
                filteredRows.map((row, idx) => (
                  <tr key={`${row.voucherNo}-${idx}`} className="border-b last:border-b-0">
                    <td className="px-3 py-2">{row.date ? new Date(row.date).toLocaleDateString("en-IN") : "-"}</td>
                    <td className="px-3 py-2">{row.voucherNo}</td>
                    <td className="px-3 py-2">{row.type}</td>
                    <td className="px-3 py-2 text-right">{toNumber(row.debit, 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{toNumber(row.credit, 0).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{toNumber(row.balance, 0).toLocaleString()}</td>
                    <td className="px-3 py-2">{row.cd}</td>
                  </tr>
                ))
              )}
              {!loading && filteredRows.length === 0 && (
                <tr><td className="px-3 py-6 text-center text-gray-500" colSpan={7}>No ledger entries found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 border-t pt-3 text-xs text-gray-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>Total Debit: <span className="font-semibold">{totals.debitTotal.toLocaleString()}</span></div>
            <div>Total Credit: <span className="font-semibold">{totals.creditTotal.toLocaleString()}</span></div>
            <div>Closing Balance: <span className="font-semibold">{toNumber(totals.closingBalance, 0).toLocaleString()} {totals.closingCd}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
