import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SaveShortcutProvider } from "./contexts/SaveShortcutContext";
import useStore from "./store";
import {
  connectStockSocket,
  disconnectStockSocket,
} from "./services/stockSocket";

import Layout from "./components/layout/Layout";
import ProtectedRoute from "./components/ProtectedRoute";

// Global Components
import {
  Toast,
  ConfirmDialog,
  LoadingOverlay,
} from "./components/GlobalComponents";

import AdminPanel from "./pages/admin/AdminPanel";

// Auth Pages
import Login from "./pages/auth/Login";
// import ForgotPassword from "./pages/auth/ForgotPassword";

// Core Pages
import Dashboard from "./pages/core/Dashboard";
import Settings from "./pages/core/Settings";
import UserProfile from "./pages/core/UserProfile";
import HelpSupportPage from "./pages/core/HelpSupportPage";

// Master Pages
import FirmMaster from "./pages/masters/FirmMaster";
import UserMaster from "./pages/masters/UserMaster";
// import AccountMaster from "./pages/masters/AccountMaster";
import PartyMaster from "./pages/masters/PartyMaster";
import BrandMaster from "./pages/masters/BrandMaster";
import DiscountMaster from "./pages/masters/DiscountMaster";
import AgentMaster from "./pages/masters/AgentMaster";
import TransportMaster from "./pages/masters/TransportMaster";
import HsnMaster from "./pages/masters/HsnMaster";
import AreaMaster from "./pages/masters/AreaMaster";
import BankMaster from "./pages/masters/BankMaster";
import ReturnMaster from "./pages/masters/ReturnMaster";
import TransactionMaster from "./pages/masters/TransactionMaster";

// Inventory Pages
import ItemMaster from "./pages/inventory/ItemMaster";
import ItemUpdate from "./pages/inventory/ItemUpdate";
import ItemView from "./pages/inventory/ItemView";
import AddItem from "./pages/inventory/AddItem";
import StockAlertMaster from "./pages/inventory/StockAlertMaster";
import CategoryMaster from "./pages/inventory/CategoryMaster";
import LabelMaster from "./pages/inventory/LabelMaster";
import ViewCategory from "./pages/inventory/ViewCategory";
import AddSupplier from "./pages/inventory/AddSupplier";
import DepartmentMaster from "./pages/inventory/DepartmentMaster";

// Transaction Pages
import ChallanList from "./pages/transactions/ChallanList";
import ChallanForm from "./pages/transactions/ChallanForm";
import BillList from "./pages/transactions/BillList";
import BillForm from "./pages/transactions/BillForm";
import BillAutomation from "./pages/transactions/BillAutomation";
import TransactionHistory from "./pages/transactions/TransactionHistory";
import OutStandings from "./pages/transactions/OutStandings";
import OutstandingList from "./pages/transactions/OutstandingList";

// Report Pages
import Reports from "./pages/reports/Reports";
import GSTReport from "./pages/reports/GSTReport";
import GSTReportDetails from "./pages/reports/GSTReportDetails";
import PurchaseReport from "./pages/reports/PurchaseReport";
import SalesReport from "./pages/reports/SalesReport";
import SalesReturnReport from "./pages/reports/SalesReturnReport";
import PurchaseReturnReport from "./pages/reports/PurchaseReturnReport";
import ItemLedgerReport from "./pages/reports/ItemLedgerReport";
import PurchaseDateWiseReport from "./pages/reports/PurchaseDateWiseReport";
import CollectionReport from "./pages/reports/CollectionReport";
import ProfitLossReport from "./pages/reports/ProfitLossReport";
import DamageItemReport from "./pages/reports/DamageItemReport";

// Setup Pages
import BackupRestore from "./pages/setup/BackupRestore";
import FinancialYearClose from "./pages/setup/FinancialYearClose";
import ChequePrintSetup from "./pages/setup/ChequePrintSetup";

// Components
import FirmSetup from "./components/FirmSetup";

const App = () => {
  const toast = useStore((s) => s.toast);
  const confirmDialog = useStore((s) => s.confirmDialog);
  const loading = useStore((s) => s.loading);
  const financialYearSwitching = useStore((s) => s.financialYearSwitching);
  const setUser = useStore((s) => s.setUser);
  const setAuthInitialized = useStore((s) => s.setAuthInitialized);
  const logout = useStore((s) => s.logout);
  const isAuthenticated = useStore((s) => s.isAuthenticated);

  // Initialize Auth on component mount
  React.useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("token");
      if (!token) {
        setAuthInitialized(true);
        return;
      }

      if (token) {
        try {
          // console.log('🔄 Initializing authentication...');
          const { default: api } = await import("./services/axiosInstance");
          const response = await api.get("/auth/me");
          // console.log('✅ Auth initialization successful:', response.data.data);
          const profile = response.data?.data || {};
          localStorage.setItem(
            "userRole",
            profile?.role || localStorage.getItem("userRole") || "",
          );
          localStorage.setItem(
            "firm_type",
            profile?.current_firm_type ||
              profile?.firm_data?.firm_type ||
              localStorage.getItem("firm_type") ||
              "",
          );
          localStorage.setItem(
            "firm_role",
            profile?.current_firm_role ||
              profile?.firm_data?.firm_role ||
              localStorage.getItem("firm_role") ||
              "",
          );
          localStorage.setItem(
            "credential_key",
            profile?.current_credential_key ||
              profile?.credential_key ||
              "",
          );
          setUser({
            ...profile,
            current_firm_type:
              profile?.current_firm_type ||
              profile?.firm_data?.firm_type ||
              localStorage.getItem("firm_type") ||
              "",
            current_firm_role:
              profile?.current_firm_role ||
              profile?.firm_data?.firm_role ||
              localStorage.getItem("firm_role") ||
              "",
            current_credential_key:
              profile?.current_credential_key ||
              profile?.credential_key ||
              "",
          });
        } catch (error) {
          console.error("❌ Auth initialization failed:", {
            status: error.response?.status,
            message: error.message,
            data: error.response?.data,
          });
          logout();
          localStorage.removeItem("token");
        } finally {
          setAuthInitialized(true);
        }
      }
    };
    initAuth();
  }, [logout, setAuthInitialized, setUser]);

  React.useEffect(() => {
    if (isAuthenticated && localStorage.getItem("token")) {
      connectStockSocket();
      return () => disconnectStockSocket();
    }

    disconnectStockSocket();
    return undefined;
  }, [isAuthenticated]);

  return (
    <SaveShortcutProvider>
      <BrowserRouter>
        <Routes>
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/login" replace />} />

          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          {/* <Route path="/forgot-password" element={<ForgotPassword />} /> */}
          {/* <Route path="/company-selection" element={<CompanySelection />} /> */}

          <Route element={<ProtectedRoute requireSuperAdmin />}>
            <Route path="/admin-panel" element={<AdminPanel />} />
            <Route path="/masters/user-master" element={<UserMaster />} />
          </Route>

          {/* ERP Layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* 1. Dashboard */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute
                  requireRole={["admin", "account", "sales"]}
                  redirectTo="/inventory/item-view"
                >
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            {/* 2. Masters - Admin and Accountant only */}
            <Route
              element={
                <ProtectedRoute requireRole={["admin", "account"]} />
              }
            >
              <Route path="/masters/firm-master" element={<FirmMaster />} />
              <Route path="/masters/firm-master/add" element={<FirmSetup />} />
              <Route
                path="/masters/firm-master/edit/:id"
                element={<FirmSetup />}
              />
              <Route
                path="/inventory/stock-alert-master"
                element={<StockAlertMaster />}
              />
              <Route path="/inventory/item-master" element={<ItemMaster />} />
              <Route path="/inventory/item-update" element={<ItemUpdate />} />
              <Route
                path="/inventory/category-master"
                element={<CategoryMaster />}
              />
              <Route path="/inventory/label-master" element={<LabelMaster />} />
              <Route path="/inventory/view-category" element={<ViewCategory />} />
              <Route path="/inventory/add-creditors" element={<AddSupplier />} />
              <Route
                path="/inventory/view-all-creditors"
                element={<Navigate to="/inventory/add-creditors" replace />}
              />
              <Route path="/masters/item-master/add" element={<AddItem />} />
              <Route path="/masters/debitors-master" element={<PartyMaster />} />
              <Route path="/masters/brand-master" element={<BrandMaster />} />
              <Route
                path="/masters/discount-master"
                element={<DiscountMaster />}
              />
              <Route path="/masters/agent-master" element={<AgentMaster />} />
              <Route
                path="/masters/transport-master"
                element={<TransportMaster />}
              />
              <Route path="/masters/hsn-master" element={<HsnMaster />} />
              <Route path="/masters/area-master" element={<AreaMaster />} />
              <Route
                path="/inventory/department-master"
                element={<DepartmentMaster />}
              />
              <Route path="/masters/bank-master" element={<BankMaster />} />
              <Route
                path="/masters/transaction-master"
                element={<TransactionMaster />}
              />
              <Route path="/masters/return-master" element={<ReturnMaster />} />
            </Route>

            {/* Item View - Admin, Accountant, and Client */}
            <Route
              element={
                <ProtectedRoute requireRole={["admin", "account", "client"]} />
              }
            >
              <Route path="/inventory/item-view" element={<ItemView />} />
            </Route>

            {/* 3. Transactions - Admin and Accountant only */}
            <Route
              element={
                <ProtectedRoute requireRole={["admin", "account"]} />
              }
            >
              <Route
                path="/transactions/challan-list"
                element={<ChallanList />}
              />
              <Route
                path="/transactions/challans/create"
                element={<ChallanForm />}
              />
              <Route
                path="/transactions/challans/edit/:id"
                element={<ChallanForm />}
              />
              <Route path="/transactions/bill-list" element={<BillList />} />
              <Route
                path="/transactions/bill-automation"
                element={<BillAutomation />}
              />
              <Route path="/transactions/bills/create" element={<BillForm />} />
              <Route path="/transactions/bills/edit/:id" element={<BillForm />} />
              <Route
                path="/transactions/transaction-history"
                element={<TransactionHistory />}
              />
              <Route
                path="/transactions/outstandings"
                element={<OutStandings />}
              />
            </Route>

            {/* Outstanding List - Admin, Accountant, Sales, and Client */}
            <Route
              element={
                <ProtectedRoute requireRole={["admin", "account", "sales", "client"]} />
              }
            >
              <Route
                path="/transactions/outstanding-list"
                element={<OutstandingList />}
              />
            </Route>

            {/* 4. Reports - Admin, Accountant, and Sales */}
            <Route
              element={
                <ProtectedRoute requireRole={["admin", "account", "sales"]} />
              }
            >
              <Route path="/reports" element={<Reports />} />
              <Route
                path="/reports/purchase-report"
                element={<PurchaseReport />}
              />
              <Route path="/reports/gst-report" element={<GSTReport />} />
              <Route
                path="/reports/gst-report-details"
                element={<GSTReportDetails />}
              />
              <Route path="/reports/sales-report" element={<SalesReport />} />
              <Route
                path="/reports/sales-return-report"
                element={<SalesReturnReport />}
              />
              <Route
                path="/reports/purchase-return-report"
                element={<PurchaseReturnReport />}
              />
              <Route
                path="/reports/item-ledger-report"
                element={<ItemLedgerReport />}
              />
              <Route
                path="/reports/purchase-date-wise-report"
                element={<PurchaseDateWiseReport />}
              />
              <Route
                path="/reports/collection-report"
                element={<CollectionReport />}
              />
              <Route
                path="/reports/profit-loss-report"
                element={<ProfitLossReport />}
              />
              <Route
                path="/reports/damage-item-report"
                element={<DamageItemReport />}
              />
            </Route>

            {/* 5. Setup & Tools - Admin only */}
            <Route
              element={
                <ProtectedRoute requireRole="admin" />
              }
            >
              <Route path="/setup/backup-restore" element={<BackupRestore />} />
              <Route
                path="/setup/financial-year-close"
                element={<FinancialYearClose />}
              />
              <Route
                path="/setup/cheque-print-setup"
                element={<ChequePrintSetup />}
              />
            </Route>

            {/* Settings */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/user-profile" element={<UserProfile />} />

            {/* Legacy routes - redirect to new structure */}
            <Route
              path="/firm-setup"
              element={<Navigate to="/masters/firm-master" replace />}
            />
            <Route
              path="/item-master"
              element={<Navigate to="/inventory/item-master" replace />}
            />
            <Route
              path="/challan-list"
              element={<Navigate to="/transactions/challan-list" replace />}
            />
            <Route
              path="/add-item"
              element={<Navigate to="/masters/item-master/add" replace />}
            />

            {/* Help & Support */}
            <Route path="/help-support" element={<HelpSupportPage />} />
          </Route>

          {/* Fallback */}
          <Route
            path="*"
            element={<div className="p-10">404 – Page Not Found</div>}
          />
        </Routes>

        {/* Global Components */}
        {toast && <Toast />}
        {confirmDialog && <ConfirmDialog />}
        {(loading || financialYearSwitching) && <LoadingOverlay />}
      </BrowserRouter>
    </SaveShortcutProvider>
  );
};

export default App;
