import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import env from "../../config/env.js";
import ApiError from "../../utils/ApiError.js";
import { normalizeRole } from "../../utils/role.utils.js";

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const CREDENTIAL_KEY_ALIASES = {
  gst_user: "gst_firm",
  gst_firm: "gst_firm",
  nongst_user: "nongst_firm",
  nongst_firm: "nongst_firm",
  sale_user: "sale_user",
  account_user: "account_user",
  client_user: "client_user",
};

const CREDENTIAL_META = {
  gst_firm: { firm_type: "GST", firm_role: "admin" },
  nongst_firm: { firm_type: "NON_GST", firm_role: "admin" },
  sale_user: { firm_type: "GST", firm_role: "sales" },
  account_user: { firm_type: "GST", firm_role: "account" },
  client_user: { firm_type: "GST", firm_role: "client" },
};

const CREDENTIAL_LOGIN_FIELDS = [
  "gst_firm",
  "nongst_firm",
  "sale_user",
  "account_user",
  "client_user",
];

const CREDENTIAL_PASSWORD_PATHS = {
  gst_firm: "gst_firm.password",
  nongst_firm: "nongst_firm.password",
  sale_user: "sale_user.password",
  account_user: "account_user.password",
  client_user: "client_user.password",
};

const resolveCredentialKey = (value) =>
  CREDENTIAL_KEY_ALIASES[
    String(value || "")
      .trim()
      .toLowerCase()
  ] || null;

const firmSubSchema = new Schema(
  {
    username: { type: String },
    password: { type: String },
    role: {
      type: String,
      enum: ["admin", "account", "sales", "client", "accountant", "salesman"],
      default: "admin",
      set: (value) => normalizeRole(value, "admin"),
    },
    contact_id: { type: ObjectId, ref: "Contact", default: null },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    email: { type: String },
    address: { type: String, default: "" },
    godown_address: { type: String },
    city: { type: String, default: "" },
    state: { type: String, default: "" },
    GSTIN: { type: String },
    CIN: { type: String },
    reg_number: { type: String },
    bank_ids: [{ type: ObjectId, ref: "Bank" }],
    signature: { type: String, default: null },
  },
  { _id: false },
);

const adminSubSchema = new Schema(
  {
    username: { type: String, required: true },
    password: { type: String, required: true },
  },
  { _id: false },
);

const credentialSubSchema = new Schema(
  {
    username: { type: String },
    password: { type: String },
  },
  { _id: false },
);

const clientCredentialSubSchema = new Schema(
  {
    username: { type: String },
    password: { type: String },
    contact_id: { type: ObjectId, ref: "Contact", default: null },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    type: { type: String, enum: ["main", "secondary"], required: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },

    // Credential-driven access
    sale_user: { type: credentialSubSchema, default: null },
    account_user: { type: credentialSubSchema, default: null },
    client_user: { type: clientCredentialSubSchema, default: null },

    gst_firm: { type: firmSubSchema },
    nongst_firm: { type: firmSubSchema },
    admin: { type: adminSubSchema, default: null },
    signature: { type: String, default: null },
    is_active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

userSchema.index({ "sale_user.username": 1 }, { unique: true, sparse: true });
userSchema.index({ "gst_firm.username": 1 }, { unique: true, sparse: true });
userSchema.index({ "nongst_firm.username": 1 }, { unique: true, sparse: true });
userSchema.index(
  { "account_user.username": 1 },
  { unique: true, sparse: true },
);
userSchema.index({ "client_user.username": 1 }, { unique: true, sparse: true });
userSchema.index(
  { "admin.username": 1 },
  { unique: true, partialFilterExpression: { admin: { $ne: null } } },
);

userSchema.methods.generateAdminToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      role: "admin",
      user_type: this.type,
      auth_scope: "super_admin",
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
};

userSchema.methods.generateFirmToken = function ({
  firmType,
  firmRole,
  contactId = null,
  credentialKey = null,
} = {}) {
  return jwt.sign(
    {
      _id: this._id,
      role: "firm",
      firm_type: firmType,
      firm_role: firmRole,
      contact_id: contactId,
      credential_key: credentialKey,
      user_type: this.type,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES_IN },
  );
};

userSchema.statics.findByAdminCredentials = async function (
  username,
  password,
) {
  const user = await this.findOne({
    "admin.username": username,
    type: "main",
    is_active: true,
  });
  if (!user || !user.admin) {
    throw ApiError.unauthorized("Invalid admin credentials");
  }
  const isMatch = await bcrypt.compare(password, user.admin.password);
  if (!isMatch) throw ApiError.unauthorized("Invalid admin credentials");
  return user;
};

userSchema.statics.findByFirmCredentials = async function (username, password) {
  // Credential key determines firm type + permission scope.
  for (const field of CREDENTIAL_LOGIN_FIELDS) {
    const query = {};
    query[`${field}.username`] = username;
    query.is_active = true;

    const user = await this.findOne(query);

    if (user && user[field] && user[field].password) {
      const isMatch = await bcrypt.compare(password, user[field].password);
      if (isMatch) {
        const credentialKey = resolveCredentialKey(field);
        const meta = CREDENTIAL_META[credentialKey];

        if (!meta) {
          continue;
        }

        const contactId = user[field].contact_id || null;
        const firmRole = meta.firm_role;

        return {
          user,
          firmType: meta.firm_type,
          firmRole,
          contactId,
          credentialKey,
          credentialField: field,
        };
      }
    }
  }

  throw ApiError.unauthorized("Invalid firm credentials");
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  if (obj.gst_firm) delete obj.gst_firm.password;
  if (obj.nongst_firm) delete obj.nongst_firm.password;
  if (obj.sale_user) delete obj.sale_user.password;
  if (obj.account_user) delete obj.account_user.password;
  if (obj.client_user) delete obj.client_user.password;
  if (obj.admin) delete obj.admin.password;
  return obj;
};

userSchema.statics.resolveCredentialKey = resolveCredentialKey;
userSchema.statics.getCredentialMeta = (credentialKey) =>
  CREDENTIAL_META[resolveCredentialKey(credentialKey) || credentialKey] || null;
userSchema.statics.getPasswordPathForCredential = (credentialKey) =>
  CREDENTIAL_PASSWORD_PATHS[credentialKey] || null;

userSchema.pre("validate", function (next) {
  if (this.type === "secondary") {
    const usernames = new Map();
    const fields = [
      "gst_firm",
      "nongst_firm",
      "sale_user",
      "account_user",
      "client_user",
    ];

    for (const field of fields) {
      const username = this[field]?.username;
      if (username) {
        const norm = String(username).trim().toLowerCase();
        if (usernames.has(norm)) {
          const original = usernames.get(norm);
          return next(
            ApiError.badRequest(
              `Username '${username}' is duplicate. Every role inside a user must have a unique username (duplicate found in '${original}' and '${field}').`
            )
          );
        }
        usernames.set(norm, field);
      }
    }
  }
  next();
});

export default mongoose.model("User", userSchema);
