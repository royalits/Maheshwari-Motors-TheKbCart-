import React, { useState, useEffect } from "react";
import {
  FaPlus,
  FaPenToSquare,
  FaTrash,
  FaMagnifyingGlass,
  FaReceipt,
  FaMoneyBillWave,
  FaBuildingColumns,
  FaRotate,
  FaCalendarDays,
  FaFilter,
} from "react-icons/fa6";
import useStore from "../../store";
import { expenseService } from "../../services/expenseService";
import api from "../../services/axiosInstance";

// Safe Date Formatting Helpers
const formatDateForInput = (d) => {
  if (!d) return new Date().toISOString().split("T")[0];
  try {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return new Date().toISOString().split("T")[0];
    return dateObj.toISOString().split("T")[0];
  } catch {
    return new Date().toISOString().split("T")[0];
  }
};

const formatDateForDisplay = (d) => {
  if (!d) return "—";
  try {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "—";
    return dateObj.toLocaleDateString("en-IN");
  } catch {
    return "—";
  }
};

const formatDateForFilter = (d) => {
  if (!d) return "";
  try {
    const dateObj = new Date(d);
    if (isNaN(dateObj.getTime())) return "";
    return dateObj.toISOString().split("T")[0];
  } catch {
    return "";
  }
};

const ExpenseEntry = () => {
  const showToast = useStore((s) => s.showToast);
  const showConfirm = useStore((s) => s.showConfirm);
  const hideConfirm = useStore((s) => s.hideConfirm);

  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  const [formData, setFormData] = useState({
    expense_category_id: "",
    date: new Date().toISOString().split("T")[0],
    amount: "",
    payment_mode: "cash",
    bank_id: "",
    reference_no: "",
    remarks: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [expData, catData] = await Promise.all([
        expenseService.getExpenses(),
        expenseService.getCategories(),
      ]);
      setExpenses(Array.isArray(expData) ? expData : []);
      setCategories((Array.isArray(catData) ? catData : []).filter((c) => c && c.is_active));

      // Fetch Banks for Bank Payment option
      try {
        const bankRes = await api.get("/banks");
        const raw = bankRes.data?.data;
        const list = Array.isArray(raw)
          ? raw
          : Array.isArray(raw?.data)
          ? raw.data
          : Array.isArray(bankRes.data)
          ? bankRes.data
          : [];
        setBanks(list);
      } catch {
        setBanks([]);
      }
    } catch (err) {
      showToast(err.message || "Failed to load data", "error");
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleOpenAddModal = () => {
    setEditingExpense(null);
    setFormData({
      expense_category_id: categories[0]?._id || "",
      date: new Date().toISOString().split("T")[0],
      amount: "",
      payment_mode: "cash",
      bank_id: "",
      reference_no: "",
      remarks: "",
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (exp) => {
    if (!exp) return;
    setEditingExpense(exp);
    const catId =
      typeof exp.expense_category_id === "object"
        ? exp.expense_category_id?._id
        : exp.expense_category_id;
    const bId = typeof exp.bank_id === "object" ? exp.bank_id?._id : exp.bank_id;

    setFormData({
      expense_category_id: catId || "",
      date: formatDateForInput(exp.date),
      amount: exp.amount || "",
      payment_mode: exp.payment_mode || "cash",
      bank_id: bId || "",
      reference_no: exp.reference_no || "",
      remarks: exp.remarks || "",
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.expense_category_id) {
      showToast("Please select an Expense Category", "error");
      return;
    }
    if (!formData.amount || Number(formData.amount) <= 0) {
      showToast("Please enter a valid amount", "error");
      return;
    }
    const safeBanks = Array.isArray(banks) ? banks : [];
    if (formData.payment_mode === "bank" && !formData.bank_id && safeBanks.length > 0) {
      showToast("Please select a Bank account for bank payment", "error");
      return;
    }

    setSubmitting(true);
    try {
      const selectedBank = safeBanks.find((b) => String(b._id) === String(formData.bank_id));
      const payload = {
        ...formData,
        amount: Number(formData.amount),
        bank_name: selectedBank ? selectedBank.bank_name || selectedBank.name : undefined,
      };

      if (editingExpense) {
        await expenseService.updateExpense(editingExpense._id, payload);
        showToast("Expense entry updated successfully!", "success");
      } else {
        await expenseService.createExpense(payload);
        showToast("Expense entry saved successfully!", "success");
      }
      setModalOpen(false);
      fetchData();
    } catch (err) {
      showToast(err.message || "Operation failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (exp) => {
    if (!exp?._id) return;
    showConfirm(
      `Are you sure you want to delete expense voucher "${exp.voucher_no || ''}" (₹${exp.amount || 0})?`,
      async () => {
        try {
          await expenseService.deleteExpense(exp._id);
          showToast("Expense entry deleted successfully", "success");
          fetchData();
        } catch (err) {
          showToast(err.message || "Failed to delete expense entry", "error");
        } finally {
          hideConfirm();
        }
      },
      () => hideConfirm()
    );
  };

  // Filtered entries
  const filteredExpenses = (Array.isArray(expenses) ? expenses : []).filter((exp) => {
    if (!exp || typeof exp !== "object") return false;

    const catName =
      exp.category_name ||
      (typeof exp.expense_category_id === "object" ? exp.expense_category_id?.name : "") ||
      "General";

    const bankName =
      exp.bank_name ||
      (typeof exp.bank_id === "object" ? exp.bank_id?.bank_name : "") ||
      "";

    const matchesSearch =
      (exp.voucher_no || "").toLowerCase().includes(search.toLowerCase()) ||
      (exp.remarks || "").toLowerCase().includes(search.toLowerCase()) ||
      catName.toLowerCase().includes(search.toLowerCase()) ||
      bankName.toLowerCase().includes(search.toLowerCase()) ||
      (exp.reference_no || "").toLowerCase().includes(search.toLowerCase());

    const expCatId =
      typeof exp.expense_category_id === "object"
        ? exp.expense_category_id?._id
        : exp.expense_category_id;

    const matchesMode = modeFilter === "all" || exp.payment_mode === modeFilter;
    const matchesCategory =
      categoryFilter === "all" || String(expCatId || "") === String(categoryFilter);

    const expDate = formatDateForFilter(exp.date);
    const matchesStart = !startDate || (expDate && expDate >= startDate);
    const matchesEnd = !endDate || (expDate && expDate <= endDate);

    return matchesSearch && matchesMode && matchesCategory && matchesStart && matchesEnd;
  });

  // Calculate totals
  const totalAmount = filteredExpenses.reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const totalCash = filteredExpenses
    .filter((e) => e?.payment_mode === "cash")
    .reduce((sum, item) => sum + Number(item?.amount || 0), 0);
  const totalBank = filteredExpenses
    .filter((e) => e?.payment_mode === "bank")
    .reduce((sum, item) => sum + Number(item?.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
            <FaReceipt className="text-indigo-600 w-6 h-6" />
            Expense Entry / Vouchers
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Record daily expenses (Salary, Tea/Refreshments, Rent, Freight) paid in Cash or Bank
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={fetchData}
            className="p-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg transition border border-neutral-200"
            title="Refresh"
          >
            <FaRotate className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition shadow-xs"
          >
            <FaPlus className="w-4 h-4" />
            New Expense Entry
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Total Expense</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FaReceipt className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-neutral-800 mt-2">
            ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-400 mt-1">{filteredExpenses.length} Expense Vouchers</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Cash Expenses</span>
            <span className="p-2 bg-amber-50 text-amber-600 rounded-lg">
              <FaMoneyBillWave className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-amber-600 mt-2">
            ₹{totalCash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Paid in Cash</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Bank Expenses</span>
            <span className="p-2 bg-blue-50 text-blue-600 rounded-lg">
              <FaBuildingColumns className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-blue-600 mt-2">
            ₹{totalBank.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-neutral-400 mt-1">Paid via Bank / UPI / Cheque</p>
        </div>
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="relative">
            <FaMagnifyingGlass className="absolute left-3 top-3.5 text-neutral-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search voucher, remarks, category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Payment Modes</option>
              <option value="cash">Cash Only</option>
              <option value="bank">Bank Only</option>
            </select>
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat._id} value={cat._id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              placeholder="From Date"
            />
            <span className="text-neutral-400">-</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-300 rounded-lg px-2 py-2 text-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              placeholder="To Date"
            />
          </div>
        </div>
      </div>

      {/* Expense Vouchers Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">
            <FaRotate className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
            Loading expense vouchers...
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <FaReceipt className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
            <p className="font-semibold text-lg text-neutral-700">No Expense Entries Found</p>
            <p className="text-sm text-neutral-400 mt-1">
              Click "New Expense Entry" to record your daily expenses.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-6 py-3.5">Voucher No</th>
                  <th className="px-6 py-3.5">Date</th>
                  <th className="px-6 py-3.5">Category</th>
                  <th className="px-6 py-3.5">Payment Mode</th>
                  <th className="px-6 py-3.5">Remarks / Details</th>
                  <th className="px-6 py-3.5 text-right">Amount (₹)</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-neutral-700">
                {filteredExpenses.map((exp, index) => {
                  const catName =
                    exp.category_name ||
                    (typeof exp.expense_category_id === "object" ? exp.expense_category_id?.name : "") ||
                    "General";

                  const bankName =
                    exp.bank_name ||
                    (typeof exp.bank_id === "object" ? exp.bank_id?.bank_name : "") ||
                    "";

                  const displayDate = formatDateForDisplay(exp.date);
                  const rowKey = exp._id || exp.id || `exp_${index}`;

                  return (
                    <tr key={rowKey} className="hover:bg-neutral-50/80 transition">
                      <td className="px-6 py-4 font-mono font-semibold text-neutral-900">
                        {exp.voucher_no || "—"}
                      </td>
                      <td className="px-6 py-4 text-neutral-600 whitespace-nowrap">
                        {displayDate}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-medium text-neutral-800 bg-neutral-100 px-2.5 py-1 rounded-md text-xs">
                          {catName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {exp.payment_mode === "cash" ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                            <FaMoneyBillWave className="w-3 h-3 text-amber-600" />
                            Cash
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                            <FaBuildingColumns className="w-3 h-3 text-blue-600" />
                            Bank {bankName ? `(${bankName})` : ""}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-neutral-600 max-w-xs truncate">
                        {exp.remarks || "—"}
                        {exp.reference_no && (
                          <span className="block text-xs text-neutral-400 font-mono mt-0.5">
                            Ref: {exp.reference_no}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right font-bold text-neutral-900 font-mono text-base">
                        ₹{Number(exp.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleOpenEditModal(exp)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition"
                            title="Edit"
                          >
                            <FaPenToSquare className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(exp)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition"
                            title="Delete"
                          >
                            <FaTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-neutral-50 border-t border-neutral-200 font-bold text-neutral-800">
                <tr>
                  <td colSpan={5} className="px-6 py-4 text-right uppercase text-xs">
                    Total Filtered Expenses:
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-lg text-indigo-700">
                    ₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Expense Modal Form */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-xl rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200 bg-neutral-50">
              <h3 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
                <FaReceipt className="text-indigo-600 w-5 h-5" />
                {editingExpense ? "Edit Expense Voucher" : "New Expense Voucher"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">
                    Expense Category <span className="text-rose-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.expense_category_id}
                    onChange={(e) =>
                      setFormData({ ...formData, expense_category_id: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat._id} value={cat._id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">
                    Amount (₹) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm font-mono font-bold focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-neutral-700 mb-1">
                    Payment Mode <span className="text-rose-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, payment_mode: "cash", bank_id: "" })}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition ${
                        formData.payment_mode === "cash"
                          ? "bg-amber-500 text-white border-amber-600 shadow-xs"
                          : "bg-neutral-50 text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                      }`}
                    >
                      <FaMoneyBillWave className="w-4 h-4" />
                      Cash
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, payment_mode: "bank" })}
                      className={`py-2 px-3 rounded-lg text-sm font-medium border flex items-center justify-center gap-2 transition ${
                        formData.payment_mode === "bank"
                          ? "bg-blue-600 text-white border-blue-700 shadow-xs"
                          : "bg-neutral-50 text-neutral-700 border-neutral-300 hover:bg-neutral-100"
                      }`}
                    >
                      <FaBuildingColumns className="w-4 h-4" />
                      Bank
                    </button>
                  </div>
                </div>
              </div>

              {formData.payment_mode === "bank" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-blue-50/50 p-3 rounded-lg border border-blue-200">
                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-1">
                      Bank Account
                    </label>
                    <select
                      value={formData.bank_id}
                      onChange={(e) => setFormData({ ...formData, bank_id: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select Bank Account</option>
                      {(Array.isArray(banks) ? banks : []).map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.bank_name || b.name} - {b.account_number ? `...${String(b.account_number).slice(-4)}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-blue-900 mb-1">
                      Cheque / UPI / Ref No
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UPI/123456 or Cheque #004"
                      value={formData.reference_no}
                      onChange={(e) => setFormData({ ...formData, reference_no: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Remarks / Purpose
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Paid July salary to Tushar, Tea snacks for staff, etc."
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <FaRotate className="w-4 h-4 animate-spin" />}
                  {editingExpense ? "Update Expense" : "Save Expense Voucher"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseEntry;
