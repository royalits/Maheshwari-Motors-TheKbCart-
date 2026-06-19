import { usePermission } from "../hooks/usePermission";

/**
 * Badge component to display user's current role
 */
export const RoleBadge = ({ className = "" }) => {
  const { getCurrentRole, isSuperAdmin } = usePermission();
  const role = getCurrentRole();
  const superAdmin = isSuperAdmin();

  if (!role) return null;

  const roleConfig = {
    super_admin: {
      label: "Super Admin",
      color: "bg-purple-100 text-purple-800 border-purple-200",
      icon: "SA",
    },
    admin: {
      label: "Admin",
      color: "bg-purple-100 text-purple-800 border-purple-200",
      icon: "AD",
    },
    account: {
      label: "Account",
      color: "bg-blue-100 text-blue-800 border-blue-200",
      icon: "AC",
    },
    sales: {
      label: "Sales",
      color: "bg-green-100 text-green-800 border-green-200",
      icon: "SL",
    },
    client: {
      label: "Client",
      color: "bg-gray-100 text-gray-800 border-gray-200",
      icon: "CL",
    },
  };

  const config =
    (superAdmin ? roleConfig.super_admin : roleConfig[role]) ||
    roleConfig.admin;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border ${config.color} ${className}`}
    >
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
};

/**
 * Detailed role info component
 */
export const RoleInfo = () => {
  const { getCurrentRole, can, isSuperAdmin } = usePermission();
  const role = getCurrentRole();
  const superAdmin = isSuperAdmin();

  if (!role) return null;

  const permissions = {
    create: can("create"),
    read: can("read"),
    update: can("update"),
    delete: can("delete"),
  };

  const roleDescriptions = {
    super_admin:
      "Fixed super admin credential with full control, including admin panel access",
    admin: "Full access to all inventory features",
    account:
      "Can create new records and view all data, but cannot edit or delete",
    sales: "Can view reports and outstanding only",
    client: "Can view own outstanding and item prices only",
  };

  const descriptionKey = superAdmin ? "super_admin" : role;

  return (
    <div className="bg-white rounded-lg shadow p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">Your Role</h3>
        <RoleBadge />
      </div>

      <p className="text-sm text-gray-600">{roleDescriptions[descriptionKey]}</p>

      <div className="border-t pt-3">
        <h4 className="text-xs font-medium text-gray-700 mb-2">Permissions</h4>
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(permissions).map(([action, allowed]) => (
            <div key={action} className="flex items-center gap-2">
              <span
                className={`text-xs ${allowed ? "text-green-600" : "text-gray-400"}`}
              >
                {allowed ? "Yes" : "No"}
              </span>
              <span className="text-xs text-gray-600 capitalize">{action}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default RoleBadge;
