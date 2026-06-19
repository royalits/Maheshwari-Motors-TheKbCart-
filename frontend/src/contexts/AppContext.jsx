import React, { createContext, useContext, useReducer, useEffect } from 'react';

const AppContext = createContext();

const initialState = {
  // Firm Context
  selectedFirm: null,
  firms: [
    { id: 1, name: "Maa Auto", type: "Non-GST", hasStock: true, color: "bg-blue-100 text-blue-800" },
    { id: 2, name: "Motors", type: "GST", hasStock: true, color: "bg-green-100 text-green-800" },
    
  ],
  
  // Financial Year
  financialYear: { start: "2025-04-01", end: "2026-03-31", label: "2025-26" },
  
  // User Context
  user: { id: 1, name: "Admin User", email: "admin@thekbcart.com", role: "admin" },
  
  // UI State
  sidebarOpen: false,
  loading: false,
  toast: null,
  confirmDialog: null,
  
  // Data Cache
  accounts: [],
  items: [],
  challans: [],
  bills: []
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_FIRM':
      return { ...state, selectedFirm: action.payload };
    case 'SET_FINANCIAL_YEAR':
      return { ...state, financialYear: action.payload };
    case 'SET_SIDEBAR_OPEN':
      return { ...state, sidebarOpen: action.payload };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SHOW_TOAST':
      return { ...state, toast: action.payload };
    case 'HIDE_TOAST':
      return { ...state, toast: null };
    case 'SHOW_CONFIRM':
      return { ...state, confirmDialog: action.payload };
    case 'HIDE_CONFIRM':
      return { ...state, confirmDialog: null };
    case 'SET_ACCOUNTS':
      return { ...state, accounts: action.payload };
    case 'SET_ITEMS':
      return { ...state, items: action.payload };
    case 'SET_CHALLANS':
      return { ...state, challans: action.payload };
    case 'SET_BILLS':
      return { ...state, bills: action.payload };
    default:
      return state;
  }
}

export const AppProvider = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  // Auto-select first firm on load
  useEffect(() => {
    if (!state.selectedFirm && state.firms.length > 0) {
      dispatch({ type: 'SET_FIRM', payload: state.firms[0] });
    }
  }, [state.selectedFirm, state.firms]);

  const actions = {
    setFirm: (firm) => dispatch({ type: 'SET_FIRM', payload: firm }),
    setFinancialYear: (year) => dispatch({ type: 'SET_FINANCIAL_YEAR', payload: year }),
    setSidebarOpen: (open) => dispatch({ type: 'SET_SIDEBAR_OPEN', payload: open }),
    setLoading: (loading) => dispatch({ type: 'SET_LOADING', payload: loading }),
    showToast: (message, type = 'info') => dispatch({ type: 'SHOW_TOAST', payload: { message, type } }),
    hideToast: () => dispatch({ type: 'HIDE_TOAST' }),
    showConfirm: (message, onConfirm, onCancel) => dispatch({ 
      type: 'SHOW_CONFIRM', 
      payload: { message, onConfirm, onCancel } 
    }),
    hideConfirm: () => dispatch({ type: 'HIDE_CONFIRM' }),
    setAccounts: (accounts) => dispatch({ type: 'SET_ACCOUNTS', payload: accounts }),
    setItems: (items) => dispatch({ type: 'SET_ITEMS', payload: items }),
    setChallans: (challans) => dispatch({ type: 'SET_CHALLANS', payload: challans }),
    setBills: (bills) => dispatch({ type: 'SET_BILLS', payload: bills })
  };

  return (
    <AppContext.Provider value={{ state, actions }}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
};