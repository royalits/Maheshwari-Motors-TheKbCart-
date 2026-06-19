export const ROLE_KEYS = ["admin", "sales", "account", "client"];

const ROLE_ALIASES = {
  admin: "admin",
  firm_admin: "admin",
  owner: "admin",
  master: "admin",

  sales: "sales",
  sale: "sales",
  sale_user: "sales",
  saleuser: "sales",
  salesman: "sales",
  salesuser: "sales",

  account: "account",
  accounts: "account",
  accountant: "account",
  account_user: "account",
  accountuser: "account",

  client: "client",
  customer: "client",
  party: "client",

  gst_user: "admin",
  nongst_user: "admin",
};

export const normalizeRole = (value, fallback = "admin") => {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return fallback;
  return ROLE_ALIASES[raw] || fallback;
};

export default {
  ROLE_KEYS,
  normalizeRole,
};
