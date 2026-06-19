import { ApiError, asyncHandler } from "../utils/index.js";
import { normalizeRole } from "../utils/role.utils.js";

// Permission matrix for firm roles
const PERMISSIONS = {
  admin: {
    create: true,
    read: true,
    update: true,
    delete: true,
    transactions: true,
    reports: true,
    outstanding: true,
    masters: true,
    inventory: true,
    setup: true,
  },
  account: {
    create: true,
    read: true,
    update: false,
    delete: false,
    transactions: true,
    reports: true,
    outstanding: true,
    masters: true,
    inventory: true,
    setup: false,
  },
  sales: {
    create: false,
    read: true,
    update: false,
    delete: false,
    transactions: false,
    reports: true,       // All reports
    outstanding: true,   // Outstanding list and tab
    masters: false,
    inventory: false,
    setup: false,
  },
  client: {
    create: false,
    read: true,
    update: false,
    delete: false,
    transactions: false,
    reports: false,
    outstanding: false,
    masters: false,
    inventory: false,
    setup: false,
  },
};

const resolveFirmRole = (req) => normalizeRole(req.firmRole || "admin");

// Check if user has permission for specific action
export const requirePermission = (action) =>
  asyncHandler(async (req, res, next) => {
    // Admin role (main user admin login) has full access
    if (req.role === "admin") {
      return next();
    }

    // Firm role - check firm_role permissions
    if (req.role === "firm") {
      const firmRole = resolveFirmRole(req);
      const hasPermission = PERMISSIONS[firmRole]?.[action];

      if (!hasPermission) {
        throw ApiError.forbidden(
          `${firmRole} role does not have ${action} permission`,
        );
      }

      return next();
    }

    throw ApiError.forbidden("Invalid role");
  });

// Restrict access to specific firm roles
export const requireFirmRole = (...allowedRoles) =>
  asyncHandler(async (req, res, next) => {
    const normalizedAllowedRoles = allowedRoles.map((role) =>
      normalizeRole(role, role),
    );

    // Admin role always allowed
    if (req.role === "admin") {
      return next();
    }

    // Check firm role
    if (req.role === "firm") {
      const firmRole = resolveFirmRole(req);
      if (normalizedAllowedRoles.includes(firmRole)) {
        return next();
      }
    }

    throw ApiError.forbidden(
      `Access denied. Required roles: ${normalizedAllowedRoles.join(", ")}`,
    );
  });

// Filter data for client role - only show their own records
export const applyClientFilter = asyncHandler(async (req, res, next) => {
  if (req.role === "firm" && resolveFirmRole(req) === "client" && req.contactId) {
    // Add contact_id filter to query
    req.clientFilter = { contact_id: req.contactId };
  }
  next();
});

// Restrict access to transactions (accountant only)
export const requireTransactionAccess = asyncHandler(async (req, res, next) => {
  const firmRole = resolveFirmRole(req);

  // Admin and firm admin always allowed
  if (req.role === "admin" || (req.role === "firm" && firmRole === "admin")) {
    return next();
  }

  // Account role can view transactions (read-only)
  if (req.role === "firm" && firmRole === "account") {
    return next();
  }

  throw ApiError.forbidden("You do not have access to transactions");
});

// Restrict access to reports
export const requireReportAccess = asyncHandler(async (req, res, next) => {
  const firmRole = resolveFirmRole(req);

  // Admin and firm admin always allowed
  if (req.role === "admin" || (req.role === "firm" && firmRole === "admin")) {
    return next();
  }

  // Account and sales roles can view reports
  if (
    req.role === "firm" &&
    (firmRole === "account" || firmRole === "sales")
  ) {
    return next();
  }

  throw ApiError.forbidden("You do not have access to reports");
});

// Restrict outstanding access
export const requireOutstandingAccess = asyncHandler(async (req, res, next) => {
  const firmRole = resolveFirmRole(req);

  // Admin and firm admin always allowed
  if (req.role === "admin" || (req.role === "firm" && firmRole === "admin")) {
    return next();
  }

  // Account role can view outstanding
  if (req.role === "firm" && firmRole === "account") {
    return next();
  }

  // Sales role can view all outstanding
  if (req.role === "firm" && firmRole === "sales") {
    return next();
  }

  throw ApiError.forbidden("You do not have access to outstanding");
});

export default {
  requirePermission,
  requireFirmRole,
  applyClientFilter,
  requireTransactionAccess,
  requireReportAccess,
  requireOutstandingAccess,
};
