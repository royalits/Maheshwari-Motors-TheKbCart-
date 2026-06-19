import { ROLE_KEYS } from "../../utils/role.utils.js";

const DEFAULT_ROLES = [
  {
    key: "admin",
    name: "Admin",
    description: "Full access inside a user's inventory scope.",
  },
  {
    key: "sales",
    name: "Sales",
    description: "Read-only sales/outstanding/report access.",
  },
  {
    key: "account",
    name: "Account",
    description: "Create and view access for accounting workflows.",
  },
  {
    key: "client",
    name: "Client",
    description: "Restricted client-facing access.",
  },
];

class RoleService {
  async ensureDefaultRoles() {
    // Roles are now static and resolved from credential keys.
    return DEFAULT_ROLES;
  }

  async getRoles() {
    return DEFAULT_ROLES.filter((role) => ROLE_KEYS.includes(role.key));
  }
}

export default new RoleService();
