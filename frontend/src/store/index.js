import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

const normalizeFirmType = (value) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, '_');

const getStoredFirmType = () => {
  try {
    return localStorage.getItem('firm_type');
  } catch {
    return null;
  }
};

const getStoredFirmRole = () => {
  try {
    return localStorage.getItem('firm_role');
  } catch {
    return null;
  }
};

const getStoredFinancialYearId = () => {
  try {
    return localStorage.getItem('financial_year_id');
  } catch {
    return null;
  }
};

const resolveFirmRole = (user) => {
  if (!user) return null;
  if (user?.current_firm_role) return user.current_firm_role;
  if (user?.firm_data?.firm_role) return user.firm_data.firm_role;
  if (getStoredFirmRole()) return getStoredFirmRole();

  const activeType = normalizeFirmType(
    user?.firm_data?.firm_type || user?.current_firm_type || getStoredFirmType(),
  );

  if (activeType === 'GST') {
    return user?.gst_firm?.role || null;
  }
  if (activeType === 'NON_GST') {
    return user?.nongst_firm?.role || null;
  }

  return user?.gst_firm?.role || user?.nongst_firm?.role || null;
};

const resolveContactId = (user) => {
  if (!user) return null;
  if (user?.current_contact_id) return user.current_contact_id;
  if (user?.firm_data?.contact_id) return user.firm_data.contact_id;

  const activeType = normalizeFirmType(
    user?.firm_data?.firm_type || user?.current_firm_type || getStoredFirmType(),
  );

  if (activeType === 'GST') {
    return user?.gst_firm?.contact_id || null;
  }
  if (activeType === 'NON_GST') {
    return user?.nongst_firm?.contact_id || null;
  }

  return user?.gst_firm?.contact_id || user?.nongst_firm?.contact_id || null;
};

const useStore = create(devtools((set) => ({
  // Auth State
  user: null,
  isAuthenticated: false,
  authInitialized: false,
  
  // RBAC State
  firmRole: null,
  contactId: null,
  
  // Firm Context
  selectedFirm: null,
  firms: [],
  
  // Financial Year
  financialYear: { start: "2025-04-01", end: "2026-03-31", label: "2025-26" },
  financialYears: [],
  selectedFinancialYear: null,
  selectedFinancialYearId: getStoredFinancialYearId(),
  
  // UI State
  loading: false,
  financialYearSwitching: false,
  toast: null,
  confirmDialog: null,
  
  // Masters Data
  accounts: [],
  items: [],
  users: [],
  groups: [],
  units: [],
  hsn: [],
  agents: [],
  transporters: [],
  books: [],
  
  // Transaction Data
  challans: [],
  bills: [],
  transactions: [],
  
  // Actions
  setUser: (user) => set({ 
    user, 
    isAuthenticated: !!user,
    authInitialized: true,
    firmRole: resolveFirmRole(user),
    contactId: resolveContactId(user)
  }),
  logout: () => {
    localStorage.removeItem('financial_year_id');
    localStorage.removeItem('financial_year_start');
    localStorage.removeItem('financial_year_end');
    localStorage.removeItem('financial_year_label');
    set({
      user: null,
      isAuthenticated: false,
      authInitialized: true,
      selectedFirm: null,
      firmRole: null,
      contactId: null,
      selectedFinancialYear: null,
      selectedFinancialYearId: null,
    });
  },
  setAuthInitialized: (authInitialized) => set({ authInitialized }),

  setFirm: (firm) => set({ selectedFirm: firm }),
  setFirms: (firms) => set({ firms }),
  setFinancialYears: (financialYears = []) => set((state) => {
    const storedId = getStoredFinancialYearId();
    const selected =
      financialYears.find((year) => String(year._id) === String(state.selectedFinancialYearId)) ||
      financialYears.find((year) => String(year._id) === String(storedId)) ||
      financialYears.find((year) => year.status === 'open') ||
      financialYears[0] ||
      null;

    if (selected?._id) {
      localStorage.setItem('financial_year_id', selected._id);
      localStorage.setItem('financial_year_start', selected.start_date || '');
      localStorage.setItem('financial_year_end', selected.end_date || '');
      localStorage.setItem('financial_year_label', selected.label || '');
    }

    return {
      financialYears,
      selectedFinancialYear: selected,
      selectedFinancialYearId: selected?._id || null,
      financialYear: selected
        ? {
            start: selected.start_date,
            end: selected.end_date,
            label: selected.label,
          }
        : state.financialYear,
    };
  }),
  setSelectedFinancialYear: (financialYear) => set((state) => {
    if (financialYear?._id) {
      localStorage.setItem('financial_year_id', financialYear._id);
      localStorage.setItem('financial_year_start', financialYear.start_date || '');
      localStorage.setItem('financial_year_end', financialYear.end_date || '');
      localStorage.setItem('financial_year_label', financialYear.label || '');
    } else {
      localStorage.removeItem('financial_year_id');
      localStorage.removeItem('financial_year_start');
      localStorage.removeItem('financial_year_end');
      localStorage.removeItem('financial_year_label');
    }

    return {
      selectedFinancialYear: financialYear || null,
      selectedFinancialYearId: financialYear?._id || null,
      financialYear: financialYear
        ? {
            start: financialYear.start_date,
            end: financialYear.end_date,
            label: financialYear.label,
          }
        : state.financialYear,
    };
  }),
  addFirm: (firm) => set((state) => ({ firms: [...state.firms, firm] })),
  updateFirm: (id, updatedFirm) => set((state) => ({
    firms: state.firms.map(firm => firm.id === id ? updatedFirm : firm)
  })),
  deleteFirm: (id) => set((state) => ({
    firms: state.firms.filter(firm => firm.id !== id)
  })),
  
  setUsers: (users) => set({ users }),
  addUser: (user) => set((state) => ({ users: [...state.users, user] })),
  updateUser: (id, updatedUser) => set((state) => ({
    users: state.users.map(user => user.id === id ? updatedUser : user)
  })),
  deleteUser: (id) => set((state) => ({
    users: state.users.filter(user => user.id !== id)
  })),
  
  setLoading: (loading) => set({ loading }),
  setFinancialYearSwitching: (financialYearSwitching) => set({ financialYearSwitching }),
  
  showToast: (message, type = 'info') => {
    if (message && typeof message === 'object') {
      set({ toast: { message: message.message, type: message.type || 'info' } });
    } else {
      set({ toast: { message, type } });
    }
  },
  hideToast: () => set({ toast: null }),
  
  showConfirm: (message, onConfirm, onCancel) => set({ 
    confirmDialog: { message, onConfirm, onCancel } 
  }),
  hideConfirm: () => set({ confirmDialog: null }),
  
  // Data setters
  setAccounts: (accounts) => set({ accounts }),
  setItems: (items) => set({ items }),
  addItem: (item) => set((state) => ({ 
    items: [...state.items, { ...item, id: state.items.length + 1 }] 
  })),
  updateItem: (id, updatedItem) => set((state) => ({
    items: state.items.map(item => item.id === id ? updatedItem : item)
  })),
  deleteItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id)
  })),
  setGroups: (groups) => set({ groups }),
  setUnits: (units) => set({ units }),
  setHsn: (hsn) => set({ hsn }),
  setAgents: (agents) => set({ agents }),
  setTransporters: (transporters) => set({ transporters }),
  setBooks: (books) => set({ books }),
  setChallans: (challans) => set({ challans }),
  addChallan: (challan) => set((state) => ({ challans: [challan, ...state.challans] })),
  updateChallan: (id, updated) => set((state) => ({
    challans: state.challans.map(c => c.id === id ? { ...c, ...updated } : c)
  })),
  setBills: (bills) => set({ bills }),
  setTransactions: (transactions) => set({ transactions }),
  
  addBill: (bill) => {
    set((state) => ({ bills: [...state.bills, bill] }));
  },
  removeBill: (billId) => set((state) => ({
    bills: state.bills.filter(b => b.id !== billId)
  })),
  addTransaction: (transaction) => {
    set((state) => ({ transactions: [...state.transactions, transaction] }));
  },
  removeChallans: (challanIds) => set((state) => ({
    challans: state.challans.filter(c => !challanIds.includes(c.id))
  })),
})));

export default useStore;
