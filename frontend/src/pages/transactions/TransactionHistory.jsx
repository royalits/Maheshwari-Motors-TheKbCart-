import React, { useState, useEffect, useMemo } from "react";
import {
  FaFilter,
  FaReceipt,
  FaMoneyBillWave,
  FaDownload,
} from "react-icons/fa";
import { DataTable } from "../../components/common";
import { Input, Button } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { getResponseList, normalizeBill } from "../../services/apiUtils";
import { formatDate } from "../../utils";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import useFirmBranding from "../../hooks/useFirmBranding";
import { getFinancialYearStartDisplayDate, toDisplayDate } from "../../utils/dateHelpers";

const formatDisplayDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : formatDate(date, "dd/mm/yyyy");
};

const formatFilterDateInput = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const parseFilterDate = (value) => {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value || "")) return null;

  const [day, month, year] = value.split("/").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  date.setHours(0, 0, 0, 0);
  return date;
};

const TransactionHistory = () => {
  const { setTransactions: setStoreTransactions, showToast } = useStore();
  const firmBranding = useFirmBranding();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateFrom: (() => {
      return getFinancialYearStartDisplayDate();
    })(),
    dateTo: '',
  });

  useKeyboardShortcuts({
    onRefresh: () => window.location.reload(),
    onResetFilters: () => setFilters({
      dateFrom: (() => {
        return getFinancialYearStartDisplayDate();
      })(),
      dateTo: '',
    }),
  });

  useEffect(() => {
    const controller = new AbortController();

    const fetchTransactions = async () => {
      try {
        setLoading(true);

        const [billRes, returnRes, txnRes] = await Promise.all([
          api.get("/bills", { params: { page: 1, limit: 500 }, signal: controller.signal }),
          api.get("/returns", { params: { page: 1, limit: 500 }, signal: controller.signal }),
          api.get("/transactions", { params: { page: 1, limit: 500 }, signal: controller.signal }),
        ]);

        const allBills = getResponseList(billRes);
        const allReturns = getResponseList(returnRes);
        const allTxns = getResponseList(txnRes);

        const billTxns = allBills.map((bill) => {
          const normalized = normalizeBill(bill);
          const billSource = bill.contact_type === "party" ? "Sale Bill" : "Purchase Bill";
          return {
            id: normalized.id,
            transactionId: normalized.billNo || normalized.id,
            source: billSource,
            type: billSource,
            amount: Number(normalized.amount || 0),
            date: normalized.date,
            party: normalized.party,
            gstType: Number(normalized.gstType || 0),
            status: normalized.payment_status || "Generated",
          };
        });

        const returnTxns = allReturns.map((ret) => ({
          id: ret.id || ret._id,
          transactionId: ret.return_no || String(ret.id || ret._id),
          source: "Returned",
          type: "Returned",
          amount: Number(ret.total_amount || 0),
          date: ret.date,
          party: ret.contact_id?.name || "-",
          gstType: Number(ret.is_gst ?? 0),
          status: "Completed",
        }));

        const transactionTxns = allTxns.map((txn) => ({
          id: txn.id || txn._id,
          transactionId: txn.transaction_no || String(txn.id || txn._id),
          source: "Transaction",
          type: "Transaction",
          amount: Number(txn.amount || 0),
          date: txn.date,
          party: txn.contact_id?.name || "-",
          gstType: Number(txn.is_gst ?? 0),
          status: txn.settlement_status || "Pending",
        }));

        const merged = [
          ...billTxns.filter((t) => t.id),
          ...returnTxns,
          ...transactionTxns,
        ];
        merged.sort((a, b) => new Date(b.date) - new Date(a.date));

        setTransactions(merged);
        setStoreTransactions(merged);
      } catch (error) {
        if (error?.name !== "CanceledError") {
          console.error("Failed to fetch transactions", error);
          showToast(
            error?.response?.data?.message || "Failed to load transactions",
            "error",
          );
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTransactions();
    return () => controller.abort();
  }, [setStoreTransactions, showToast]);

  const filteredTransactions = useMemo(
    () => {
      const parsedDateFrom = parseFilterDate(filters.dateFrom);
      const parsedDateTo = parseFilterDate(filters.dateTo);

      return transactions.filter((txn) => {
        if (parsedDateFrom) {
          const txnDate = new Date(txn.date);
          txnDate.setHours(0, 0, 0, 0);

          if (txnDate < parsedDateFrom) return false;
        }
        if (parsedDateTo) {
          const txnDate = new Date(txn.date);
          txnDate.setHours(0, 0, 0, 0);

          if (txnDate > parsedDateTo) return false;
        }
        return true;
      });
    },
    [transactions, filters],
  );

  const stats = useMemo(
    () => ({
      total: filteredTransactions.length,
      totalAmount: filteredTransactions.reduce(
        (sum, txn) => sum + Number(txn.amount || 0),
        0,
      ),
      byType: {
        SaleBill: filteredTransactions.filter((t) => t.source === "Sale Bill").length,
        PurchaseBill: filteredTransactions.filter((t) => t.source === "Purchase Bill").length,
        Returned: filteredTransactions.filter((t) => t.source === "Returned").length,
        Transaction: filteredTransactions.filter((t) => t.source === "Transaction").length,
      },
    }),
    [filteredTransactions],
  );

  const columns = [
    {
      key: "index",
      label: "S.No.",
      render: (val, row, index) => <span className="text-xs font-medium text-gray-500">{index + 1}</span>,
    },
    {
      key: "transactionId",
      label: "Document No",
      render: (val) => <span className="font-mono text-xs font-semibold text-gray-700">{val}</span>,
    },
    {
      key: "source",
      label: "Source",
      render: (value) => (
        <span className={`px-2 py-1 text-xs font-semibold rounded-md ${
          value === "Sale Bill" ? "bg-purple-50 text-purple-700 border border-purple-200" :
          value === "Purchase Bill" ? "bg-amber-50 text-amber-700 border border-amber-200" :
          value === "Returned" ? "bg-red-50 text-red-700 border border-red-200" :
          "bg-blue-50 text-blue-700 border border-blue-200"
        }`}>
          {value || "-"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      render: (value) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          value === "Completed" || value === "paid" ? "bg-green-100 text-green-800" :
          value === "due" || value === "Pending" ? "bg-orange-100 text-orange-800" :
          "bg-gray-100 text-gray-800"
        }`}>
          {value || "-"}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (value) => `Rs ${Number(value || 0).toLocaleString()}`,
    },
    {
      key: "date",
      label: "Date",
      render: (value) => formatDisplayDate(value),
    },
    { key: "party", label: "Party" },
    {
      key: "gstType",
      label: "GST Type",
      render: (value) => (
        <span
          className={`px-2 py-1 text-xs rounded-full ${value === 1 ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}
        >
          {value}
        </span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, txn) => (
        <div className="flex gap-2">
          <button
            onClick={() => {
              const printWindow = window.open("", "", "width=900,height=700");
              const currentDate = new Date().toLocaleDateString('en-IN');
              const currentTime = new Date().toLocaleTimeString('en-IN');
              
              const firmName = firmBranding.name || "";
              printWindow.document.write(`
                <html>
                  <head>
                    <title>Transaction Details - ${txn.transactionId}</title>
                    <style>
                      * { margin: 0; padding: 0; box-sizing: border-box; }
                      body { 
                        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
                        line-height: 1.6; 
                        color: #333; 
                        background: #f8f9fa;
                        padding: 20px;
                      }
                      .container { 
                        max-width: 800px; 
                        margin: 0 auto; 
                        background: white; 
                        border-radius: 12px; 
                        box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                        overflow: hidden;
                      }
                      .header { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                        color: white; 
                        padding: 30px; 
                        text-align: center;
                      }
                      .header h1 { 
                        font-size: 28px; 
                        margin-bottom: 8px; 
                        font-weight: 700;
                      }
                      .header p { 
                        font-size: 16px; 
                        opacity: 0.9;
                      }
                      .content { 
                        padding: 40px;
                      }
                      .transaction-id { 
                        background: #e3f2fd; 
                        border-left: 4px solid #2196f3; 
                        padding: 20px; 
                        margin-bottom: 30px; 
                        border-radius: 0 8px 8px 0;
                      }
                      .transaction-id h2 { 
                        color: #1976d2; 
                        font-size: 24px; 
                        margin-bottom: 5px;
                      }
                      .transaction-id p { 
                        color: #666; 
                        font-size: 14px;
                      }
                      .details-grid { 
                        display: grid; 
                        grid-template-columns: repeat(2, 1fr); 
                        gap: 25px; 
                        margin-bottom: 30px;
                      }
                      .detail-card { 
                        background: #f8f9fa; 
                        border: 1px solid #e9ecef; 
                        border-radius: 8px; 
                        padding: 20px;
                      }
                      .detail-label { 
                        font-size: 12px; 
                        font-weight: 600; 
                        color: #6c757d; 
                        text-transform: uppercase; 
                        letter-spacing: 0.5px; 
                        margin-bottom: 8px;
                      }
                      .detail-value { 
                        font-size: 18px; 
                        font-weight: 600; 
                        color: #212529;
                      }
                      .amount-highlight { 
                        background: linear-gradient(135deg, #4caf50, #45a049); 
                        color: white; 
                        border: none;
                      }
                      .amount-highlight .detail-label { 
                        color: rgba(255,255,255,0.8);
                      }
                      .amount-highlight .detail-value { 
                        color: white; 
                        font-size: 24px;
                      }
                      .status-badge { 
                        display: inline-block; 
                        padding: 6px 16px; 
                        border-radius: 20px; 
                        font-size: 12px; 
                        font-weight: 600; 
                        text-transform: uppercase;
                        background: #e3f2fd;
                        color: #1976d2;
                      }
                      .footer { 
                        background: #f8f9fa; 
                        border-top: 1px solid #e9ecef; 
                        padding: 20px 40px; 
                        text-align: center; 
                        color: #6c757d; 
                        font-size: 12px;
                      }
                      @media print {
                        body { background: white; padding: 0; }
                        .container { box-shadow: none; }
                      }
                    </style>
                  </head>
                  <body>
                    <div class="container">
                      <div class="header">
                        <h1>📄 Transaction Receipt</h1>
	                        <p>${firmName} - Professional Transaction Report</p>
                      </div>
                      
                      <div class="content">
                        <div class="transaction-id">
                          <h2>Transaction #${txn.transactionId}</h2>
                          <p>Generated on ${currentDate} at ${currentTime}</p>
                        </div>
                        
                        <div class="details-grid">
                          <div class="detail-card">
                            <div class="detail-label">📋 Transaction Type</div>
                            <div class="detail-value">${txn.type}</div>
                          </div>
                          
                          <div class="detail-card">
                            <div class="detail-label">👤 Party Name</div>
                            <div class="detail-value">${txn.party || 'N/A'}</div>
                          </div>
                          
                          <div class="detail-card">
                            <div class="detail-label">📅 Transaction Date</div>
                            <div class="detail-value">${formatDisplayDate(txn.date)}</div>
                          </div>
                          
                          <div class="detail-card">
                            <div class="detail-label">📊 Status</div>
                            <div class="detail-value">
                              <span class="status-badge">${txn.status || 'Generated'}</span>
                            </div>
                          </div>
                          
                          <div class="detail-card amount-highlight">
                            <div class="detail-label">💰 Total Amount</div>
                            <div class="detail-value">₹${Number(txn.amount || 0).toLocaleString('en-IN')}</div>
                          </div>
                          
                          <div class="detail-card">
                            <div class="detail-label">🏷️ GST Type</div>
                            <div class="detail-value">${txn.gstType === 1 ? 'GST Inclusive' : 'GST Exclusive'}</div>
                          </div>
                        </div>
                        
                        <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin-top: 20px;">
                          <h3 style="color: #495057; margin-bottom: 15px; font-size: 16px;">📈 Transaction Summary</h3>
                          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
                            <div>
                              <div style="font-size: 12px; color: #6c757d; margin-bottom: 5px;">TRANSACTION ID</div>
                              <div style="font-weight: 600; color: #212529;">${txn.transactionId}</div>
                            </div>
                            <div>
                              <div style="font-size: 12px; color: #6c757d; margin-bottom: 5px;">AMOUNT</div>
                              <div style="font-weight: 600; color: #28a745;">₹${Number(txn.amount || 0).toLocaleString('en-IN')}</div>
                            </div>
                            <div>
                              <div style="font-size: 12px; color: #6c757d; margin-bottom: 5px;">DATE</div>
                              <div style="font-weight: 600; color: #212529;">${formatDisplayDate(txn.date)}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      <div class="footer">
	                        <div>© ${new Date().getFullYear()} ${firmName} - Transaction Management System</div>
                        <div style="margin-top: 5px; font-style: italic;">This document was generated automatically on ${currentDate} at ${currentTime}</div>
                      </div>
                    </div>
                  </body>
                </html>
              `);
              printWindow.document.close();
              printWindow.print();
            }}
            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
            title="Download"
          >
            <FaDownload size={14} />
          </button>
        </div>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="p-6 text-sm text-gray-600">Loading transactions...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Transaction History
          </h1>
          <p className="text-gray-600">Complete ledger document history</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 p-4 rounded-lg border-l-4 border-l-blue-500">
          <h3 className="text-sm font-medium text-blue-800">
            Total Transactions
          </h3>
          <p className="text-2xl font-bold text-blue-900">{stats.total}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border-l-4 border-l-green-500">
          <h3 className="text-sm font-medium text-green-800">Total Amount</h3>
          <p className="text-2xl font-bold text-green-900">
            ₹{stats.totalAmount.toLocaleString("en-IN")}
          </p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <h3 className="font-medium text-gray-900 mb-3">
          Transaction Breakdown
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FaReceipt className="text-purple-600" />
              <span className="text-sm font-medium">Sale Bills</span>
            </div>
            <span className="text-lg font-bold text-purple-600">
              {stats.byType.SaleBill}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-amber-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FaReceipt className="text-amber-600" />
              <span className="text-sm font-medium">Purchase Bills</span>
            </div>
            <span className="text-lg font-bold text-amber-600">
              {stats.byType.PurchaseBill}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FaReceipt className="text-red-600" />
              <span className="text-sm font-medium">Returns</span>
            </div>
            <span className="text-lg font-bold text-red-600">
              {stats.byType.Returned}
            </span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2">
              <FaMoneyBillWave className="text-blue-600" />
              <span className="text-sm font-medium">Transactions</span>
            </div>
            <span className="text-lg font-bold text-blue-600">
              {stats.byType.Transaction}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center gap-2 mb-4">
          <FaFilter className="text-gray-500" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">From Date</label>
            <Input
              type="date"
              placeholder="dd/mm/yyyy"
              value={filters.dateFrom}
              onChange={(val) => {
                setFilters((prev) => ({ ...prev, dateFrom: toDisplayDate(val) || val }));
              }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">To Date</label>
            <Input
              type="date"
              placeholder="dd/mm/yyyy"
              value={filters.dateTo}
              onChange={(val) => {
                setFilters((prev) => ({ ...prev, dateTo: toDisplayDate(val) || val }));
              }}
            />
          </div>

          <Button
            variant="outline"
            onClick={() =>
              setFilters({ 
                dateFrom: (() => {
                  const today = new Date();
                  const year = today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
                  const dd = '01';
                  const mm = '04';
                  const yyyy = String(year);
                  return `${dd}/${mm}/${yyyy}`;
                })(),
                dateTo: ''
              })
            }
            className="self-end"
          >
            Clear All
          </Button>
        </div>
      </div>

      <DataTable
          loading={loading}
        columns={columns}
        data={filteredTransactions}
        searchable
        sortable
        pagination
        pageSize={15}
      />
    </div>
  );
};

export default TransactionHistory;
