import { Navigate, Outlet } from "react-router-dom";
import useStore from "../store";
import { usePermission } from "../hooks/usePermission";

/**
 * Protected Route Component
 * Prevents unauthorized access to routes based on permissions
 */
export const ProtectedRoute = ({
  children,
  requirePermission,
  requireRole,
  requireSuperAdmin,
  requireReportAccess,
  redirectUnauthenticatedTo = "/login",
  redirectTo
}) => {
  const isAuthenticated = useStore((state) => state.isAuthenticated);
  const authInitialized = useStore((state) => state.authInitialized);
  const hasToken = Boolean(localStorage.getItem("token"));
  const { can, isRole, isSuperAdmin, canAccessReports, getCurrentRole } = usePermission();
  const fallbackRedirect =
    getCurrentRole() === "client" ? "/inventory/item-view" : "/dashboard";
  const resolvedRedirectTo = redirectTo || fallbackRedirect;

  if (hasToken && !authInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] text-sm text-slate-500">
        Loading...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to={redirectUnauthenticatedTo} replace />;
  }

  // Check permission requirement
  if (requirePermission && !can(requirePermission)) {
    return <Navigate to={resolvedRedirectTo} replace />;
  }

  // Check role requirement
  if (requireRole && !isRole(...(Array.isArray(requireRole) ? requireRole : [requireRole]))) {
    return <Navigate to={resolvedRedirectTo} replace />;
  }

  // Check super admin requirement
  if (requireSuperAdmin && !isSuperAdmin()) {
    return <Navigate to={resolvedRedirectTo} replace />;
  }

  // Check report access requirement
  if (requireReportAccess && !canAccessReports()) {
    return <Navigate to={resolvedRedirectTo} replace />;
  }

  return children || <Outlet />;
};

/**
 * Admin Only Route
 */
export const AdminRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requireRole="admin" redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Non-Client Route (Admin, Accountant, Salesman)
 */
export const NonClientRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requireRole={["admin", "account", "sales"]} redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Report Access Route (Admin, Accountant, Salesman)
 */
export const ReportRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requireReportAccess redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Create Permission Route (Admin, Accountant)
 */
export const CreateRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requirePermission="create" redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Update Permission Route (Admin only)
 */
export const UpdateRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requirePermission="update" redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

/**
 * Delete Permission Route (Admin only)
 */
export const DeleteRoute = ({ children, redirectTo = "/dashboard" }) => {
  return (
    <ProtectedRoute requirePermission="delete" redirectTo={redirectTo}>
      {children}
    </ProtectedRoute>
  );
};

export default ProtectedRoute;
