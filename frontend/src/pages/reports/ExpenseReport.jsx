import React, { useState, useEffect, useRef } from "react";
import {
  FaChartPie,
  FaMoneyBillWave,
  FaBuildingColumns,
  FaReceipt,
  FaPrint,
  FaRotate,
  FaFilter,
} from "react-icons/fa6";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import useStore from "../../store";
import { expenseService } from "../../services/expenseService";
import {
  drawBrandedReportHeader,
  addBrandedReportFooters,
} from "../../utils/reportPdf";

const ExpenseReport = () => {
  const showToast = useStore((s) => s.showToast);
  const financialYear = useStore((s) => s.financialYear);

  const [loading, setLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [startDate, setStartDate] = useState(financialYear?.start || "");
  const [endDate, setEndDate] = useState(financialYear?.end || "");

  const printRef = useRef(null);

  const fetchReport = async () => {
    setLoading(true);
    try {
      const summary = await expenseService.getExpenseReport({
        startDate,
        endDate,
      });
      setReportData(summary);
    } catch (err) {
      showToast(err.message || "Failed to load expense report", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [startDate, endDate]);

  const totalExpense = reportData?.totalExpense || 0;
  const totalCashExpense = reportData?.totalCashExpense || 0;
  const totalBankExpense = reportData?.totalBankExpense || 0;
  const salesCashIn = reportData?.cashFlow?.cashIn || 0;
  const salesBankIn = reportData?.bankFlow?.bankIn || 0;
  const cashOpening = reportData?.cashFlow?.cashOpening || 0;
  const closingCash = reportData?.cashFlow?.closingCash ?? (cashOpening + salesCashIn - totalCashExpense);
  const bankOpening = reportData?.bankFlow?.bankOpening || 0;
  const closingBank = reportData?.bankFlow?.closingBank ?? (bankOpening + salesBankIn - totalBankExpense);
  const categories = reportData?.categoryBreakdown || [];

  const handlePrint = () => {
    try {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });

      const periodLabel = `Period: ${startDate || "Beginning"} to ${endDate || "Today"}`;
      const startY = drawBrandedReportHeader(doc, {
        title: "Expense & Cash/Bank Summary Report",
        subtitle: `${periodLabel} | Total Expenses: Rs. ${totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        marginLeft: 10,
        marginRight: 10,
      });

      // 1. Cash & Bank Flow KPI Summary Table
      autoTable(doc, {
        startY: startY,
        margin: { left: 10, right: 10 },
        head: [
          [
            "Financial Metric Category",
            "Cash Flow (Rs.)",
            "Bank Flow (Rs.)",
            "Total Impact (Rs.)",
          ],
        ],
        body: [
          [
            "Opening Balance",
            `${cashOpening.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `${bankOpening.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `${(cashOpening + bankOpening).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          ],
          [
            "Receipts & Inflows (Sales / Collections)",
            `+${salesCashIn.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `+${salesBankIn.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `+${(salesCashIn + salesBankIn).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          ],
          [
            "Operational Expenses (Outflows)",
            `-${totalCashExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `-${totalBankExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `-${totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          ],
          [
            "Live Closing Balance",
            `${closingCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `${closingBank.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
            `${(closingCash + closingBank).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          ],
        ],
        theme: "grid",
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right", fontStyle: "bold" },
        },
      });

      // 2. Category-Wise Expense Breakdown Table
      const tableStartY = doc.lastAutoTable.finalY + 7;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      doc.text("Category-Wise Expense Breakdown", 10, tableStartY);

      const tableRows = categories.map((cat) => {
        const pct =
          totalExpense > 0 ?
            ((cat.total / totalExpense) * 100).toFixed(1) + "%"
          : "0.0%";
        return [
          cat.name || "Uncategorized",
          `${cat.count || 0} vouchers`,
          `Rs. ${Number(cat.cash || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          `Rs. ${Number(cat.bank || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          pct,
          `Rs. ${Number(cat.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        ];
      });

      // Total summary row
      const totalVouchers = categories.reduce(
        (sum, c) => sum + (c.count || 0),
        0,
      );
      tableRows.push([
        "TOTAL OPERATIONAL EXPENSES",
        `${totalVouchers} vouchers`,
        `Rs. ${totalCashExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        `Rs. ${totalBankExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        "100.0%",
        `Rs. ${totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      ]);

      autoTable(doc, {
        startY: tableStartY + 3,
        margin: { left: 10, right: 10 },
        head: [
          [
            "Category Name",
            "Voucher Count",
            "Cash Paid (Rs.)",
            "Bank Paid (Rs.)",
            "Share (%)",
            "Total Amount (Rs.)",
          ],
        ],
        body: tableRows,
        theme: "grid",
        headStyles: {
          fillColor: [79, 70, 229],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 9,
        },
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "center" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
          5: { halign: "right", fontStyle: "bold" },
        },
        didParseCell: (data) => {
          if (data.row.index === tableRows.length - 1) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [243, 244, 246];
          }
        },
      });

      addBrandedReportFooters(doc, { marginLeft: 10, marginRight: 10 });
      doc.save(
        `Expense_Summary_Report_${startDate || "all"}_to_${endDate || "today"}.pdf`,
      );
      showToast("Branded PDF Report downloaded successfully", "success");
    } catch (err) {
      console.error("Failed to generate PDF report", err);
      showToast("Failed to generate PDF report", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-neutral-200 shadow-xs print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
            <FaChartPie className="text-indigo-600 w-6 h-6" />
            Expense & Cash/Bank Summary Report
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Category-wise expense breakdown, Cash inflow vs outflow & Bank inflow vs outflow
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={fetchReport}
            className="p-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg transition border border-neutral-200"
            title="Refresh"
          >
            <FaRotate className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handlePrint}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition shadow-xs"
          >
            <FaPrint className="w-4 h-4" />
            Download PDF Report
          </button>
        </div>
      </div>

      {/* Date Filter Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
        <div className="flex items-center gap-2 text-sm font-semibold text-neutral-700">
          <FaFilter className="text-indigo-600 w-4 h-4" />
          Report Period Filters:
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <span className="text-neutral-400 mt-5">-</span>
          <div>
            <label className="block text-xs font-medium text-neutral-500 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Report Area */}
      <div ref={printRef} className="space-y-6">
        {/* Overview KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Total Expense Box */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-neutral-600">Total Operational Expense</span>
              <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                <FaReceipt className="w-5 h-5" />
              </span>
            </div>
            <p className="text-2xl font-bold text-neutral-900 mt-3 font-mono">
              ₹{totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-neutral-400 mt-1">Total non-inventory expenses incurred</p>
          </div>

          {/* Cash Flow Summary Box */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-neutral-600">Cash Flow Summary</span>
              <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                <FaMoneyBillWave className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Cash Opening Balance:</span>
                <span className="font-mono font-medium text-neutral-800">
                  ₹{cashOpening.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Cash Receipts (Inflow):</span>
                <span className="font-semibold text-emerald-600">
                  +₹{salesCashIn.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Cash Expenses (Outflow):</span>
                <span className="font-semibold text-rose-600">
                  -₹{totalCashExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t text-neutral-800">
                <span>Live Cash Closing Balance:</span>
                <span className="text-amber-700 font-mono">
                  ₹{closingCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>

          {/* Bank Flow Summary Box */}
          <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-neutral-600">Bank Flow Summary</span>
              <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                <FaBuildingColumns className="w-5 h-5" />
              </span>
            </div>
            <div className="mt-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-neutral-600">
                <span>Bank Opening Balance:</span>
                <span className="font-mono font-medium text-neutral-800">
                  ₹{bankOpening.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Bank Receipts (Inflow):</span>
                <span className="font-semibold text-emerald-600">
                  +₹{salesBankIn.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-neutral-600">
                <span>Bank Expenses (Outflow):</span>
                <span className="font-semibold text-rose-600">
                  -₹{totalBankExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between font-bold pt-2 border-t text-neutral-800">
                <span>Live Bank Closing Balance:</span>
                <span className="text-blue-700 font-mono">
                  ₹{closingBank.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Category Breakdown Table */}
        <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
          <div className="p-5 border-b border-neutral-200 flex justify-between items-center">
            <h3 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
              <FaChartPie className="text-indigo-600 w-5 h-5" />
              Category-Wise Expense Breakdown
            </h3>
            <span className="text-xs text-neutral-400 font-medium">
              {categories.length} Active Expense Categories
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-neutral-500">
              <FaRotate className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
              Computing expense report analytics...
            </div>
          ) : categories.length === 0 ? (
            <div className="p-12 text-center text-neutral-500">
              <FaReceipt className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
              <p className="font-semibold text-lg text-neutral-700">No Expense Records for Selected Period</p>
              <p className="text-sm text-neutral-400 mt-1">
                Select a different date range or add expense entries.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase text-xs">
                  <tr>
                    <th className="px-6 py-3.5">Category Details</th>
                    <th className="px-6 py-3.5 text-right">Cash Expense (₹)</th>
                    <th className="px-6 py-3.5 text-right">Bank Expense (₹)</th>
                    <th className="px-6 py-3.5 text-right">Share (%)</th>
                    <th className="px-6 py-3.5 text-right">Total Amount (₹)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 text-neutral-700">
                  {categories.map((cat) => {
                    const percentage = totalExpense > 0 ? (cat.total / totalExpense) * 100 : 0;
                    return (
                      <tr key={cat.id} className="hover:bg-neutral-50/80 transition">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-neutral-900">{cat.name}</div>
                          <div className="text-xs text-neutral-400 mt-0.5 flex items-center gap-2">
                            {cat.description && <span>{cat.description}</span>}
                            <span className="px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-600 font-mono text-[11px]">
                              {cat.count} {cat.count === 1 ? "voucher" : "vouchers"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-medium text-amber-700">
                          ₹{Number(cat.cash || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-medium text-blue-700">
                          ₹{Number(cat.bank || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-16 bg-neutral-200 rounded-full h-2 overflow-hidden">
                              <div
                                className="bg-indigo-600 h-2 rounded-full"
                                style={{ width: `${Math.min(100, percentage)}%` }}
                              ></div>
                            </div>
                            <span className="font-mono text-xs font-semibold text-neutral-700 w-12 text-right">
                              {percentage.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-neutral-900 font-mono text-base">
                          ₹{Number(cat.total || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-neutral-50 border-t border-neutral-200 font-bold text-neutral-900 text-base">
                  <tr>
                    <td className="px-6 py-4 uppercase text-xs text-neutral-600">
                      Total Operational Expenses Incurred:
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-amber-800">
                      ₹{totalCashExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-blue-800">
                      ₹{totalBankExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xs text-neutral-600">
                      100.0%
                    </td>
                    <td className="px-6 py-4 text-right font-mono text-xl text-indigo-700">
                      ₹{totalExpense.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExpenseReport;
