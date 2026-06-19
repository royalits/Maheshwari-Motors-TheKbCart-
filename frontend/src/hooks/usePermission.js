import useStore from "../store";

// Permission matrix matching backend
const PERMISSIONS = {
  admin: {
    create: true,
    read: true,
    update: true,
    delete: true,
  },
  account: {
    create: true,
    read: true,
    update: false,
    delete: false,
  },
  sales: {
    create: false,
    read: true,
    update: false,
    delete: false,
  },
  client: {
    create: false,
    read: true,
    update: false,
    delete: false,
  },
};

const normalizeRoleValue = (value) => String(value || "").trim().toLowerCase();

const normalizeFirmTypeValue = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "_");

const getStoredFirmType = () => {
  try {
    return localStorage.getItem("firm_type");
  } catch {
    return null;
  }
};

const getStoredFirmRole = () => {
  try {
    return localStorage.getItem("firm_role");
  } catch {
    return null;
  }
};

const normalizeFirmRole = (value) => {
  const role = normalizeRoleValue(value);
  if (!role) return null;

  if (["admin", "firm_admin", "owner", "master", "superadmin", "super_admin"].includes(role)) {
    return "admin";
  }
  if (["accountant", "account", "accounts", "account_user", "accountuser"].includes(role)) {
    return "account";
  }
  if (["salesman", "sales", "sales_user", "salesuser"].includes(role)) {
    return "sales";
  }
  if (["client", "customer", "party"].includes(role)) {
    return "client";
  }

  return null;
};

/**
 * Hook to check user permissions based on role
 * @returns {Object} Permission checking functions
 */
export const usePermission = () => {
  const user = useStore((state) => state.user);
  const firmRole = useStore((state) => state.firmRole);
  const contactId = useStore((state) => state.contactId);
  const authRole = normalizeRoleValue(
    user?.role ||
      user?.current_role ||
      localStorage.getItem("userRole") ||
      (user?.is_admin ? "admin" : ""),
  );

  const resolvedFirmRole = (() => {
    if (authRole !== "firm") return null;

    const activeFirmType = normalizeFirmTypeValue(
      user?.firm_data?.firm_type ||
        user?.current_firm_type ||
        getStoredFirmType(),
    );
    const roleFromProfile =
      activeFirmType === "GST"
        ? user?.gst_firm?.role
        : activeFirmType === "NON_GST"
          ? user?.nongst_firm?.role
          : user?.gst_firm?.role || user?.nongst_firm?.role;

    return normalizeFirmRole(
      firmRole ||
        user?.current_firm_role ||
        user?.firm_data?.firm_role ||
        roleFromProfile ||
        getStoredFirmRole(),
    );
  })();

  /**
   * Check if user has permission for specific action
   * @param {string} action - create, read, update, delete
   * @returns {boolean}
   */
  const can = (action) => {
    // Admin role (main user admin login) has full access
    if (authRole === "admin") {
      return true;
    }

    // Firm role - check firm_role permissions
    if (authRole === "firm") {
      const role = resolvedFirmRole;
      if (!role) return false;
      return PERMISSIONS[role]?.[action] || false;
    }

    return false;
  };

  /**
   * Check if user has one of the specified roles
   * @param {...string} roles - Role names to check
   * @returns {boolean}
   */
  const isRole = (...roles) => {
    const normalizedRoles = roles.map((role) => normalizeRoleValue(role));

    if (authRole === "admin") {
      return (
        normalizedRoles.includes("admin") ||
        normalizedRoles.includes("super_admin")
      );
    }

    if (authRole === "firm") {
      const role = resolvedFirmRole;
      if (!role) return false;
      return normalizedRoles.includes(role);
    }

    return false;
  };

  /**
   * Check if user can access reports
   * @returns {boolean}
   */
  const canAccessReports = () => {
    if (authRole === "admin") return true;
    if (authRole === "firm") {
      const role = resolvedFirmRole;
      if (!role) return false;
      return ["admin", "account", "sales"].includes(role);
    }
    return false;
  };

  /**
   * Check if user can access outstanding
   * @returns {boolean}
   */
  const canAccessOutstanding = () => {
    if (authRole === "admin") return true;
    if (authRole === "firm") {
      const role = resolvedFirmRole;
      if (!role) return false;
      return ["admin", "account", "sales"].includes(role);
    }
    return false;
  };

  /**
   * Check if user is client role
   * @returns {boolean}
   */
  const isClient = () => {
    return authRole === "firm" && resolvedFirmRole === "client";
  };

  /**
   * Get current role name
   * @returns {string}
   */
  const getCurrentRole = () => {
    if (authRole === "admin") return "admin";
    if (authRole === "firm") return resolvedFirmRole;
    return null;
  };

  const isSuperAdmin = () => authRole === "admin";

  return {
    can,
    isRole,
    canAccessReports,
    canAccessOutstanding,
    isSuperAdmin,
    isClient,
    getCurrentRole,
    firmRole: resolvedFirmRole,
    contactId,
  };
};

export default usePermission;
