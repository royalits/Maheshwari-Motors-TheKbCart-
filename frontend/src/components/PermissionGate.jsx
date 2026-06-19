import { usePermission } from "../hooks/usePermission";

/**
 * Gate component that shows children only if user has permission for action
 * @param {string} action - create, read, update, delete
 * @param {React.ReactNode} children - Content to show if permission granted
 * @param {React.ReactNode} fallback - Content to show if permission denied
 */
export const PermissionGate = ({ action, children, fallback = null }) => {
  const { can } = usePermission();

  if (can(action)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Gate component that shows children only if user has one of specified roles
 * @param {string[]} roles - Array of role names
 * @param {React.ReactNode} children - Content to show if role matches
 * @param {React.ReactNode} fallback - Content to show if role doesn't match
 */
export const RoleGate = ({ roles, children, fallback = null }) => {
  const { isRole } = usePermission();

  if (isRole(...roles)) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Gate component that shows children only if user can access reports
 * @param {React.ReactNode} children - Content to show if access granted
 * @param {React.ReactNode} fallback - Content to show if access denied
 */
export const ReportAccessGate = ({ children, fallback = null }) => {
  const { canAccessReports } = usePermission();

  if (canAccessReports()) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Gate component that shows children only if user is NOT a client
 * @param {React.ReactNode} children - Content to show if not client
 * @param {React.ReactNode} fallback - Content to show if client
 */
export const NonClientGate = ({ children, fallback = null }) => {
  const { isClient } = usePermission();

  if (!isClient()) {
    return <>{children}</>;
  }

  return fallback ? <>{fallback}</> : null;
};

/**
 * Higher-order component that wraps a component with permission check
 * @param {React.Component} Component - Component to wrap
 * @param {string} action - Required permission action
 * @returns {React.Component}
 */
export const withPermission = (Component, action) => {
  return (props) => {
    const { can } = usePermission();

    if (!can(action)) {
      return null;
    }

    return <Component {...props} />;
  };
};

/**
 * Higher-order component that wraps a component with role check
 * @param {React.Component} Component - Component to wrap
 * @param {string[]} roles - Required roles
 * @returns {React.Component}
 */
export const withRole = (Component, roles) => {
  return (props) => {
    const { isRole } = usePermission();

    if (!isRole(...roles)) {
      return null;
    }

    return <Component {...props} />;
  };
};

export default PermissionGate;
