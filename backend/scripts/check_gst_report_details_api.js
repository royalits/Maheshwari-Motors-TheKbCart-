import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(scriptDir, "..");
const workspaceRoot = path.resolve(backendRoot, "..");

dotenv.config({
  path: [
    path.join(backendRoot, ".env"),
    path.join(workspaceRoot, ".env"),
    ".env",
  ],
});

const DEFAULT_API_BASE_URL = "http://localhost:5000/api/v1";

const getArgValue = (name) => {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
};

const getOption = (name, fallback = "") =>
  getArgValue(name) || process.env[`GST_REPORT_${name.toUpperCase()}`] || fallback;

const getFinancialYearStartDate = () => {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
};

const getTodayDate = () => new Date().toISOString().slice(0, 10);

const apiBaseUrl = (
  process.env.API_BASE_URL ||
  process.env.VITE_API_URL && `${process.env.VITE_API_URL}/api/v1` ||
  getArgValue("base-url") ||
  DEFAULT_API_BASE_URL
).replace(/\/+$/, "");

const credentials = {
  username: "gst_user",
  password: "Firm@1234",
  firm_type: "GST",
  device_name: "GST Report Checker",
  device_type: "script",
};

const reportParams = {
  type: getOption("type", "sale"),
  from_date: getOption("from-date", getFinancialYearStartDate()),
  to_date: getOption("to-date", getTodayDate()),
  ac_name: getOption("ac-name"),
  gstin: getOption("gstin"),
  hsn_code: getOption("hsn-code"),
};

const buildUrl = (path, params = {}) => {
  const url = new URL(`${apiBaseUrl}${path}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url;
};

const requestJson = async (path, options = {}) => {
  const response = await fetch(buildUrl(path, options.params), {
    method: options.method || "GET",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const message = data?.message || data?.error || response.statusText;
    throw new Error(`${response.status} ${message}`);
  }

  return data;
};

const requireCredentials = () => {
  if (!credentials.username || !credentials.password) {
    throw new Error(
      "Missing credentials. Pass --username=... --password=... or set GST_REPORT_USERNAME/GST_REPORT_PASSWORD.",
    );
  }
};

const toNumber = (value) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
};

const getEntries = (payload) => {
  const data = payload?.data ?? payload;
  if (Array.isArray(data?.entries)) return data.entries;
  if (Array.isArray(data)) return data;
  return [];
};

const getDuplicateLineKey = (row) => [
  row.vno ?? "",
  row.item_name ?? "",
  row.pcs ?? "",
  row.rate ?? "",
  row.taxable_amount ?? "",
  row.gst_amount ?? "",
  row.net_amount ?? "",
].join("|");

const analyzeEntries = (entries) => {
  const byVoucher = new Map();
  const lineCount = new Map();

  entries.forEach((row) => {
    const vno = String(row.vno ?? row.v_no ?? "");
    const voucher = byVoucher.get(vno) || {
      vno,
      rows: 0,
      items: [],
      taxable: 0,
      gst: 0,
      net: 0,
    };

    voucher.rows += 1;
    voucher.items.push(row.item_name || "-");
    voucher.taxable += toNumber(row.taxable_amount);
    voucher.gst += toNumber(row.gst_amount);
    voucher.net += toNumber(row.net_amount);
    byVoucher.set(vno, voucher);

    const lineKey = getDuplicateLineKey(row);
    lineCount.set(lineKey, (lineCount.get(lineKey) || 0) + 1);
  });

  const duplicateLines = Array.from(lineCount.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));

  return {
    vouchers: Array.from(byVoucher.values()).map((voucher) => ({
      ...voucher,
      taxable: Number(voucher.taxable.toFixed(2)),
      gst: Number(voucher.gst.toFixed(2)),
      net: Number(voucher.net.toFixed(2)),
    })),
    duplicateLines,
  };
};

const main = async () => {
  requireCredentials();

  console.log("Auth request:", {
    apiBaseUrl,
    username: credentials.username,
    firm_type: credentials.firm_type,
  });

  const loginPayload = await requestJson("/auth/login", {
    method: "POST",
    body: credentials,
  });

  const token = loginPayload?.data?.token;
  if (!token) {
    throw new Error("Login succeeded, but token missing.");
  }

  const profilePayload = await requestJson("/auth/me", { token });
  console.log("Authenticated:", {
    user: profilePayload?.data?.name || profilePayload?.data?.username || "-",
    role: profilePayload?.data?.role || "-",
    firm_type: profilePayload?.data?.firm_data?.firm_type || profilePayload?.data?.firmType || "-",
  });

  const reportPayload = await requestJson("/reports/gst-report", {
    token,
    params: reportParams,
  });

  const entries = getEntries(reportPayload);
  const analysis = analyzeEntries(entries);

  console.log("GST report params:", reportParams);
  console.log("Rows:", entries.length);
  console.table(analysis.vouchers);

  if (analysis.duplicateLines.length) {
    console.log("Possible duplicate lines:");
    console.table(analysis.duplicateLines);
  } else {
    console.log("No duplicate item lines found.");
  }
};

main().catch((error) => {
  console.error("Check failed:", error.message);
  process.exitCode = 1;
});
