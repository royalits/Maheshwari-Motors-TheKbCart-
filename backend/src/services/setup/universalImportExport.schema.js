const text = (value) => String(value ?? "").trim();
const lower = (value) => text(value).toLowerCase();
const number = (value, fallback = 0) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const boolean = (value, fallback = false) => {
  if (value === "" || value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes", "active"].includes(lower(value));
};

export const IGNORED_UNIVERSAL_SHEETS = new Set([
  "backup_summary",
  "summary",
  "metadata",
  "instructions",
]);

export const INTERNAL_IMPORT_EXPORT_FIELDS = new Set([
  "_id",
  "id",
  "uuid",
  "__v",
  "user_id",
  "firm_id",
  "created_by",
  "updated_by",
  "deleted_by",
  "createdAt",
  "updatedAt",
  "deletedAt",
  "password",
  "password_hash",
  "refresh_token",
  "access_token",
  "token",
  "otp",
  "session_token",
  "reset_token",
]);

export const IGNORED_UNIVERSAL_REFERENCE_COLUMNS = new Set([
  "agent",
  "auto_bill_items",
  "bank",
  "bill",
  "brand_discounts",
  "challan",
  "challans",
  "contact",
  "financial_year",
  "from_bank",
  "items",
  "labels",
  "party",
  "payment_entries",
  "to_bank",
  "transport",
]);

export const isInternalUniversalField = (fieldName) => {
  const key = text(fieldName);
  if (key === "item_id") return false;
  return (
    INTERNAL_IMPORT_EXPORT_FIELDS.has(key) ||
    IGNORED_UNIVERSAL_REFERENCE_COLUMNS.has(key) ||
    key.endsWith("_id") ||
    key.endsWith("_ids")
  );
};

const collection = ({
  sheet,
  collectionName = sheet.toLowerCase(),
  columns,
  required = [],
  numeric = [],
  booleanFields = [],
  defaults = {},
  naturalKey = [],
}) => ({
  sheet,
  collectionName,
  columns,
  required,
  optional: columns.filter((column) => !required.includes(column)),
  numeric,
  booleanFields,
  defaults,
  naturalKey,
});

export const UNIVERSAL_COLLECTION_SCHEMAS = {
  agents: collection({
    sheet: "agents",
    columns: ["name", "address", "city", "pincode", "phone"],
    required: ["name"],
    naturalKey: ["name"],
  }),
  areas: collection({
    sheet: "areas",
    columns: ["city", "state", "pincode"],
    required: ["city"],
    naturalKey: ["city", "state"],
  }),
  banks: collection({
    sheet: "banks",
    columns: ["bank_name", "name", "account_number", "ifsc_code", "branch", "address", "is_gst"],
    required: ["bank_name"],
    numeric: ["is_gst"],
    naturalKey: ["bank_name"],
  }),
  bills: collection({
    sheet: "bills",
    columns: [
      "bill_no",
      "date",
      "contact_type",
      "customer_name",
      "vehicle_number",
      "transport_charge",
      "amount",
      "paid_amount",
      "return_amount",
      "settlement_discount",
      "payment_status",
      "deduct_from_stock",
      "skip_stock_calculation",
      "is_gst",
    ],
    required: ["bill_no", "date"],
    numeric: [
      "transport_charge",
      "amount",
      "paid_amount",
      "return_amount",
      "settlement_discount",
      "deduct_from_stock",
      "skip_stock_calculation",
      "is_gst",
    ],
    naturalKey: ["bill_no"],
  }),
  brands: collection({
    sheet: "brands",
    columns: ["name", "description", "discount", "is_active"],
    required: ["name"],
    numeric: ["discount"],
    booleanFields: ["is_active"],
    defaults: { is_active: true },
    naturalKey: ["name"],
  }),
  challans: collection({
    sheet: "challans",
    columns: [
      "challan_no",
      "challan_type",
      "date",
      "gross_total",
      "sub_total",
      "discount",
      "amount",
      "converted_to_bill",
      "payment_status",
      "paid_amount",
      "deduct_from_stock",
      "is_gst",
    ],
    required: ["challan_no", "date"],
    numeric: [
      "gross_total",
      "sub_total",
      "discount",
      "amount",
      "converted_to_bill",
      "paid_amount",
      "deduct_from_stock",
      "is_gst",
    ],
    naturalKey: ["challan_no"],
  }),
  contacts: collection({
    sheet: "contacts",
    columns: [
      "name",
      "type",
      "alias",
      "phone",
      "whatsapp_number",
      "email",
      "gstin",
      "cin",
      "reg_number",
      "address",
      "city",
      "state",
      "area",
      "balance",
      "gst_balance",
      "nongst_balance",
      "is_gst",
      "transport_charge",
    ],
    required: ["name", "type"],
    numeric: ["balance", "gst_balance", "nongst_balance", "is_gst", "transport_charge"],
    defaults: { type: "party", balance: 0, gst_balance: 0, nongst_balance: 0, transport_charge: 0 },
    naturalKey: ["name", "type"],
  }),
  departments: collection({
    sheet: "departments",
    columns: ["name", "description"],
    required: ["name"],
    naturalKey: ["name"],
  }),
  financialyears: collection({
    sheet: "financialyears",
    columns: ["label", "start_date", "end_date", "status", "closed_at"],
    required: ["label"],
    naturalKey: ["label"],
  }),
  financialyearcloses: collection({
    sheet: "financialyearcloses",
    columns: [
      "closed_at",
      "total_challans",
      "total_bills",
      "total_revenue",
      "pending_amount",
      "stock_value",
      "gst_collected",
      "gst_paid",
    ],
    numeric: [
      "total_challans",
      "total_bills",
      "total_revenue",
      "pending_amount",
      "stock_value",
      "gst_collected",
      "gst_paid",
    ],
  }),
  hsns: collection({
    sheet: "hsns",
    columns: ["hsn_code", "description", "gst_rate", "is_active"],
    required: ["hsn_code"],
    numeric: ["gst_rate"],
    booleanFields: ["is_active"],
    defaults: { is_active: true },
    naturalKey: ["hsn_code"],
  }),
  items: collection({
    sheet: "Items",
    collectionName: "items",
    columns: [
      "item_name",
      "item_id",
      "barcode",
      "alias",
      "description",
      "brand_name",
      "dept_name",
      "hsn_code",
      "sale_rate",
      "purchase_rate",
      "mrp_rate",
      "gst_percent",
      "discount",
      "stock",
      "physical_stock",
      "logical_stock",
      "opening_physical_stock",
      "opening_logical_stock",
      "threshold",
      "is_gst",
    ],
    required: ["item_name", "sale_rate"],
    numeric: [
      "sale_rate",
      "purchase_rate",
      "mrp_rate",
      "gst_percent",
      "discount",
      "stock",
      "physical_stock",
      "logical_stock",
      "opening_physical_stock",
      "opening_logical_stock",
      "threshold",
      "is_gst",
    ],
    naturalKey: ["barcode", "item_id", "item_name"],
  }),
  labels: collection({
    sheet: "labels",
    columns: ["name", "description", "is_active"],
    required: ["name"],
    booleanFields: ["is_active"],
    defaults: { is_active: true },
    naturalKey: ["name"],
  }),
  reports: collection({
    sheet: "reports",
    columns: ["type", "date", "amount", "is_gst"],
    required: ["type"],
    numeric: ["amount", "is_gst"],
  }),
  returns: collection({
    sheet: "returns",
    columns: ["return_no", "return_type", "date", "total_amount", "note", "is_gst"],
    required: ["return_no", "return_type"],
    numeric: ["total_amount", "is_gst"],
    naturalKey: ["return_no"],
  }),
  transports: collection({
    sheet: "transports",
    columns: ["name", "phone", "gstin", "address"],
    required: ["name"],
    naturalKey: ["name"],
  }),
  transactions: collection({
    sheet: "transactions",
    columns: ["transaction_no", "type", "date", "contact_type", "amount", "reference", "remarks", "is_gst"],
    required: ["type", "amount"],
    numeric: ["amount", "is_gst"],
    naturalKey: ["transaction_no"],
  }),
};

export const getUniversalCollectionSchema = (sheetName) => {
  const key = lower(sheetName);
  return (
    UNIVERSAL_COLLECTION_SCHEMAS[key] ||
    Object.values(UNIVERSAL_COLLECTION_SCHEMAS).find(
      (schema) => lower(schema.sheet) === key || lower(schema.collectionName) === key,
    ) ||
    null
  );
};

export const universalSheetNames = () =>
  Object.values(UNIVERSAL_COLLECTION_SCHEMAS).map((schema) => schema.sheet);

export const universalCollectionNames = () =>
  Object.values(UNIVERSAL_COLLECTION_SCHEMAS).map(
    (schema) => schema.collectionName,
  );

export const universalSchemas = () =>
  Object.values(UNIVERSAL_COLLECTION_SCHEMAS);

export const normalizeUniversalHeader = (value) =>
  lower(value)
    .replace(/[%()/_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s/g, "_");

export const normalizeUniversalValue = (schema, key, value) => {
  if (schema.numeric.includes(key)) return number(value);
  if (schema.booleanFields.includes(key)) return boolean(value, schema.defaults[key]);
  return text(value);
};
