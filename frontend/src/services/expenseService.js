import api from "./axiosInstance";

// Local storage fallback key for local standalone operation before backend deployment
const LOCAL_STORAGE_KEY_CATEGORIES = "thekbcart_expense_categories";
const LOCAL_STORAGE_KEY_EXPENSES = "thekbcart_expense_entries";

const defaultCategories = [
  { _id: "cat_1", name: "Staff Salary", description: "Monthly staff & worker salaries", is_active: true },
  { _id: "cat_2", name: "Tea & Refreshments", description: "Daily snacks, tea and guest hospitality", is_active: true },
  { _id: "cat_3", name: "Office Rent", description: "Monthly shop & godown rent", is_active: true },
  { _id: "cat_4", name: "Electricity & Utilities", description: "Power, internet and water bills", is_active: true },
  { _id: "cat_5", name: "Printing & Stationery", description: "Bill books, paper, toner, supplies", is_active: true },
  { _id: "cat_6", name: "Transport & Freight", description: "Cartage, loading & delivery expense", is_active: true },
  { _id: "cat_7", name: "Repair & Maintenance", description: "Equipment, vehicle and shop repairs", is_active: true },
];

const defaultExpenses = [
  {
    _id: "exp_101",
    voucher_no: "EXP-2026-0001",
    expense_category_id: "cat_2",
    category_name: "Tea & Refreshments",
    date: new Date().toISOString(),
    amount: 250,
    payment_mode: "cash",
    bank_id: null,
    reference_no: "",
    remarks: "Daily morning tea & snacks",
    is_gst: 1,
  },
  {
    _id: "exp_102",
    voucher_no: "EXP-2026-0002",
    expense_category_id: "cat_3",
    category_name: "Office Rent",
    date: new Date(Date.now() - 86400000 * 2).toISOString(),
    amount: 12500,
    payment_mode: "bank",
    bank_id: null,
    bank_name: "HDFC Bank Main A/c",
    reference_no: "UPI/9845217482",
    remarks: "Shop rent for current month",
    is_gst: 1,
  },
];

const getLocalCategories = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_CATEGORIES);
    if (!data) {
      localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(defaultCategories));
      return defaultCategories;
    }
    return JSON.parse(data);
  } catch {
    return defaultCategories;
  }
};

const saveLocalCategories = (categories) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
  } catch (err) {
    console.error("Failed to save local categories:", err);
  }
};

const getLocalExpenses = () => {
  try {
    const data = localStorage.getItem(LOCAL_STORAGE_KEY_EXPENSES);
    if (!data) {
      localStorage.setItem(LOCAL_STORAGE_KEY_EXPENSES, JSON.stringify(defaultExpenses));
      return defaultExpenses;
    }
    return JSON.parse(data);
  } catch {
    return defaultExpenses;
  }
};

const saveLocalExpenses = (expenses) => {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY_EXPENSES, JSON.stringify(expenses));
  } catch (err) {
    console.error("Failed to save local expenses:", err);
  }
};

export const expenseService = {
  // Category API
  getCategories: async () => {
    try {
      const response = await api.get("/expenses/categories");
      return response.data?.data || response.data || [];
    } catch {
      return getLocalCategories();
    }
  },

  createCategory: async (payload) => {
    try {
      const response = await api.post("/expenses/categories", payload);
      return response.data?.data || response.data;
    } catch {
      const categories = getLocalCategories();
      const newCat = {
        _id: `cat_${Date.now()}`,
        name: payload.name,
        description: payload.description || "",
        is_active: payload.is_active !== undefined ? payload.is_active : true,
        createdAt: new Date().toISOString(),
      };
      categories.unshift(newCat);
      saveLocalCategories(categories);
      return newCat;
    }
  },

  updateCategory: async (id, payload) => {
    try {
      const response = await api.put(`/expenses/categories/${id}`, payload);
      return response.data?.data || response.data;
    } catch {
      const categories = getLocalCategories();
      const idx = categories.findIndex((c) => String(c._id) === String(id));
      if (idx !== -1) {
        categories[idx] = { ...categories[idx], ...payload };
        saveLocalCategories(categories);
        return categories[idx];
      }
      throw new Error("Category not found");
    }
  },

  deleteCategory: async (id) => {
    try {
      const response = await api.delete(`/expenses/categories/${id}`);
      return response.data;
    } catch {
      const categories = getLocalCategories();
      const filtered = categories.filter((c) => String(c._id) !== String(id));
      saveLocalCategories(filtered);
      return { success: true };
    }
  },

  // Expense Voucher API
  getExpenses: async (params = {}) => {
    try {
      const response = await api.get("/expenses", { params });
      return response.data?.data || response.data || [];
    } catch {
      let expenses = getLocalExpenses();
      if (params.payment_mode) {
        expenses = expenses.filter((e) => e.payment_mode === params.payment_mode);
      }
      if (params.category_id) {
        expenses = expenses.filter((e) => String(e.expense_category_id) === String(params.category_id));
      }
      return expenses;
    }
  },

  createExpense: async (payload) => {
    try {
      const response = await api.post("/expenses", payload);
      return response.data?.data || response.data;
    } catch {
      const expenses = getLocalExpenses();
      const categories = getLocalCategories();
      const cat = categories.find((c) => String(c._id) === String(payload.expense_category_id));
      
      const newVoucherNo = `EXP-${new Date().getFullYear()}-${String(expenses.length + 1).padStart(4, "0")}`;
      const newExpense = {
        _id: `exp_${Date.now()}`,
        voucher_no: newVoucherNo,
        expense_category_id: payload.expense_category_id,
        category_name: cat?.name || "Expense",
        date: payload.date || new Date().toISOString(),
        amount: Number(payload.amount || 0),
        payment_mode: payload.payment_mode || "cash",
        bank_id: payload.bank_id || null,
        bank_name: payload.bank_name || null,
        reference_no: payload.reference_no || "",
        remarks: payload.remarks || "",
        is_gst: payload.is_gst ?? 1,
        createdAt: new Date().toISOString(),
      };
      expenses.unshift(newExpense);
      saveLocalExpenses(expenses);
      return newExpense;
    }
  },

  updateExpense: async (id, payload) => {
    try {
      const response = await api.put(`/expenses/${id}`, payload);
      return response.data?.data || response.data;
    } catch {
      const expenses = getLocalExpenses();
      const idx = expenses.findIndex((e) => String(e._id) === String(id));
      if (idx !== -1) {
        const categories = getLocalCategories();
        const cat = categories.find((c) => String(c._id) === String(payload.expense_category_id || expenses[idx].expense_category_id));
        expenses[idx] = {
          ...expenses[idx],
          ...payload,
          category_name: cat?.name || expenses[idx].category_name,
        };
        saveLocalExpenses(expenses);
        return expenses[idx];
      }
      throw new Error("Expense entry not found");
    }
  },

  deleteExpense: async (id) => {
    try {
      const response = await api.delete(`/expenses/${id}`);
      return response.data;
    } catch {
      const expenses = getLocalExpenses();
      const filtered = expenses.filter((e) => String(e._id) !== String(id));
      saveLocalExpenses(filtered);
      return { success: true };
    }
  },

  // Expense & Cash/Bank Report API
  getExpenseReport: async (params = {}) => {
    try {
      const response = await api.get("/expenses/reports/summary", { params });
      return response.data?.data || response.data;
    } catch {
      const expenses = getLocalExpenses();
      const categories = getLocalCategories();

      // Aggregate category summary
      const categoryMap = {};
      categories.forEach((cat) => {
        categoryMap[cat._id] = { id: cat._id, name: cat.name, total: 0, count: 0 };
      });

      let totalExpense = 0;
      let totalCashExpense = 0;
      let totalBankExpense = 0;

      expenses.forEach((item) => {
        const amt = Number(item.amount || 0);
        totalExpense += amt;
        if (item.payment_mode === "cash") {
          totalCashExpense += amt;
        } else {
          totalBankExpense += amt;
        }

        if (categoryMap[item.expense_category_id]) {
          categoryMap[item.expense_category_id].total += amt;
          categoryMap[item.expense_category_id].count += 1;
        } else {
          categoryMap[item.expense_category_id] = {
            id: item.expense_category_id,
            name: item.category_name || "Uncategorized",
            total: amt,
            count: 1,
          };
        }
      });

      const categoryBreakdown = Object.values(categoryMap).filter((c) => c.total > 0 || c.count > 0);

      return {
        totalExpense,
        totalCashExpense,
        totalBankExpense,
        categoryBreakdown,
        cashFlow: {
          cashIn: 0, // Calculated dynamically from bills in UI if available
          cashOut: totalCashExpense,
          netCash: -totalCashExpense,
        },
        bankFlow: {
          bankIn: 0, // Calculated dynamically from bills in UI if available
          bankOut: totalBankExpense,
          netBank: -totalBankExpense,
        },
      };
    }
  },
};

export default expenseService;
