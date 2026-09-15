import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../../models/auth/user.model.js";
import Session from "../../models/auth/session.model.js";
import Subscription from "../../models/common/subscription.model.js";
import Bank from "../../models/master/bank.model.js";
import Contact from "../../models/master/contact.model.js";
import s3Service from "../common/s3.service.js";
import financialYearService from "../common/financialYear.service.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

const CREDENTIAL_FIELDS = ["sale_user", "account_user", "client_user"];

const CREDENTIAL_FIELD_ALIASES = {
  sale_user: "sale_user",
  account_user: "account_user",
  client_user: "client_user",
};

const CREDENTIAL_LABELS = {
  sale_user: "Sales credential",
  account_user: "Account credential",
  client_user: "Client credential",
};

class AdminService {
  _toSafeUserObject(user) {
    if (!user) return user;

    const safe = { ...user };
    if (safe.gst_firm) {
      safe.gst_firm = { ...safe.gst_firm };
      delete safe.gst_firm.password;
    }
    if (safe.nongst_firm) {
      safe.nongst_firm = { ...safe.nongst_firm };
      delete safe.nongst_firm.password;
    }
    if (safe.sale_user) {
      safe.sale_user = { ...safe.sale_user };
      delete safe.sale_user.password;
    }
    if (safe.account_user) {
      safe.account_user = { ...safe.account_user };
      delete safe.account_user.password;
    }
    if (safe.client_user) {
      safe.client_user = { ...safe.client_user };
      delete safe.client_user.password;
    }
    if (safe.admin) {
      safe.admin = { ...safe.admin };
      delete safe.admin.password;
    }

    if (safe.signature) {
      safe.signature = `/api/v1/admin/users/${safe._id}/signature`;
    }
    if (safe.gst_firm?.signature) {
      safe.gst_firm.signature = `/api/v1/admin/users/${safe._id}/signature?firm=GST`;
    }
    if (safe.nongst_firm?.signature) {
      safe.nongst_firm.signature = `/api/v1/admin/users/${safe._id}/signature?firm=NON_GST`;
    }

    return safe;
  }

  _normalizeBankIds(bankIds, label) {
    if (bankIds === undefined) return undefined;

    if (!Array.isArray(bankIds)) {
      throw ApiError.badRequest(`${label}: bank_ids must be an array`);
    }

    const normalized = [];
    const seen = new Set();

    for (const bankId of bankIds) {
      if (!mongoose.Types.ObjectId.isValid(bankId)) {
        throw ApiError.badRequest(`${label}: invalid bank_id provided`);
      }

      const key = String(bankId);
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(bankId);
      }
    }

    return normalized;
  }

  async _validateUserBankIds(userId, bankIds, label) {
    const normalized = this._normalizeBankIds(bankIds, label);
    if (normalized === undefined) return undefined;
    if (normalized.length === 0) return [];

    const count = await Bank.countDocuments({
      _id: { $in: normalized },
      user_id: userId,
    });

    if (count !== normalized.length) {
      throw ApiError.badRequest(
        `${label}: one or more bank_ids are invalid or do not belong to this user`,
      );
    }

    return normalized;
  }

  _normalizeBankText(value) {
    if (value === undefined || value === null) return "";
    return String(value).trim();
  }

  _hasBankDraftValues(bank = {}) {
    if (!bank || typeof bank !== "object") return false;
    const fields = [
      "bank_name",
      "account_number",
      "ifsc_code",
      "bank_branch",
      "account_holder",
      "upi_id",
    ];
    return fields.some((field) => this._normalizeBankText(bank[field]) !== "");
  }

  async _syncFirmBankIds(userId, bankIds, label) {
    if (bankIds === undefined) return undefined;
    if (!Array.isArray(bankIds)) {
      throw ApiError.badRequest(`${label}: bank_ids must be an array`);
    }
    if (bankIds.length === 0) return [];

    const synced = [];
    const seen = new Set();

    for (const entry of bankIds) {
      if (typeof entry === "string" || mongoose.Types.ObjectId.isValid(entry)) {
        const key = String(entry);
        if (seen.has(key)) continue;

        const existing = await Bank.findOne({ _id: key, user_id: userId })
          .select("_id")
          .lean();
        if (!existing) {
          throw ApiError.badRequest(
            `${label}: one or more bank_ids are invalid or do not belong to this user`,
          );
        }
        seen.add(key);
        synced.push(existing._id);
        continue;
      }

      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw ApiError.badRequest(`${label}: invalid bank entry provided`);
      }

      const entryId =
        entry._id && mongoose.Types.ObjectId.isValid(entry._id) ?
          String(entry._id)
        : null;

      if (entryId) {
        const bankDoc = await Bank.findOne({ _id: entryId, user_id: userId });
        if (!bankDoc) {
          throw ApiError.badRequest(
            `${label}: one or more bank_ids are invalid or do not belong to this user`,
          );
        }

        if (this._hasBankDraftValues(entry)) {
          if (entry.bank_name !== undefined) {
            bankDoc.bank_name = this._normalizeBankText(entry.bank_name);
          }
          if (entry.bank_branch !== undefined) {
            bankDoc.bank_branch = this._normalizeBankText(entry.bank_branch);
          }
          if (entry.ifsc_code !== undefined) {
            bankDoc.ifsc_code = this._normalizeBankText(entry.ifsc_code);
          }
          if (entry.account_number !== undefined) {
            bankDoc.account_number = this._normalizeBankText(
              entry.account_number,
            );
          }
          if (entry.account_holder !== undefined) {
            bankDoc.account_holder = this._normalizeBankText(
              entry.account_holder,
            );
          }
          if (entry.upi_id !== undefined) {
            bankDoc.upi_id = this._normalizeBankText(entry.upi_id);
          }

          if (!bankDoc.bank_name || !bankDoc.account_number) {
            throw ApiError.badRequest(
              `${label}: bank_name and account_number are required for each bank`,
            );
          }
          await bankDoc.save();
        }

        if (!seen.has(entryId)) {
          seen.add(entryId);
          synced.push(bankDoc._id);
        }
        continue;
      }

      if (!this._hasBankDraftValues(entry)) {
        continue;
      }

      const bankName = this._normalizeBankText(entry.bank_name);
      const accountNumber = this._normalizeBankText(entry.account_number);
      if (!bankName || !accountNumber) {
        throw ApiError.badRequest(
          `${label}: bank_name and account_number are required for each bank`,
        );
      }

      const createdBank = await Bank.create({
        id: await getNextId("Bank", userId),
        bank_name: bankName,
        bank_branch: this._normalizeBankText(entry.bank_branch),
        ifsc_code: this._normalizeBankText(entry.ifsc_code),
        account_number: accountNumber,
        account_holder: this._normalizeBankText(entry.account_holder),
        upi_id: this._normalizeBankText(entry.upi_id),
        user_id: userId,
      });

      const createdKey = String(createdBank._id);
      if (!seen.has(createdKey)) {
        seen.add(createdKey);
        synced.push(createdBank._id);
      }
    }

    return synced;
  }

  async _attachSubscriptionSummary(users = []) {
    if (!users || users.length === 0) return users;

    const userIds = users.map((u) => u._id);
    const subscriptions = await Subscription.find({
      user_id: { $in: userIds },
    })
      .select("user_id plan_type status start_date expiry_date timeline amount")
      .sort({ expiry_date: 1 })
      .lean();

    const subMap = new Map();
    for (const sub of subscriptions) {
      subMap.set(String(sub.user_id), sub);
    }

    return users.map((user) => ({
      ...user,
      subscription: subMap.get(String(user._id)) || null,
    }));
  }

  async _ensureDemoSubscription(userId) {
    const existing = await Subscription.findOne({ user_id: userId })
      .select("_id")
      .lean();

    if (existing) return;

    await Subscription.create({
      user_id: userId,
      plan_type: "demo",
      status: "active",
      timeline: { years: 0, months: 0, days: 30 },
      start_date: new Date(),
      notes: "Auto-created demo subscription",
    });
  }

  async _createFirmBank(
    userId,
    bankName,
    accountNumber,
    ifscCode,
    bankBranch,
    accountHolder = "",
    upiId = "",
  ) {
    if (!bankName && !accountNumber) return null;

    if (!bankName || typeof bankName !== "string" || !bankName.trim()) {
      throw ApiError.badRequest(
        "bank_name is required when providing bank details",
      );
    }
    if (
      !accountNumber ||
      typeof accountNumber !== "string" ||
      !accountNumber.trim()
    ) {
      throw ApiError.badRequest(
        "account_number is required when providing bank details",
      );
    }

    const bank = await Bank.create({
      id: await getNextId("Bank", userId),
      bank_name: bankName.trim(),
      account_number: accountNumber.trim(),
      ifsc_code: typeof ifscCode === "string" ? ifscCode.trim() : "",
      bank_branch: typeof bankBranch === "string" ? bankBranch.trim() : "",
      account_holder:
        typeof accountHolder === "string" ? accountHolder.trim() : "",
      upi_id: typeof upiId === "string" ? upiId.trim() : "",
      user_id: userId,
    });

    return bank._id;
  }

  _validateFirmRequired(firm, label) {
    const required = ["username", "password"];
    const missing = required.filter(
      (f) => !firm[f] || (typeof firm[f] === "string" && !firm[f].trim()),
    );
    if (missing.length > 0) {
      throw ApiError.badRequest(
        `${label}: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} required`,
      );
    }
    if (firm.password.length < 6) {
      throw ApiError.badRequest(
        `${label}: Password must be at least 6 characters`,
      );
    }
    if (firm.username.trim().length < 3) {
      throw ApiError.badRequest(
        `${label}: Username must be at least 3 characters`,
      );
    }
  }

  _resolveCredentialField(field) {
    return (
      CREDENTIAL_FIELD_ALIASES[
        String(field || "")
          .trim()
          .toLowerCase()
      ] || null
    );
  }

  _extractRoleCredentials(data = {}) {
    const roleUsers = data.role_users || {};
    const raw = {
      sale_user: roleUsers.sale ?? roleUsers.sales ?? data.sale_user,
      account_user: roleUsers.account ?? data.account_user,
      client_user: roleUsers.client ?? data.client_user,
    };

    return Object.entries(raw).reduce((acc, [key, value]) => {
      if (value !== undefined) acc[key] = value;
      return acc;
    }, {});
  }

  _getRoleCredentialLabel(field) {
    return (
      CREDENTIAL_LABELS[this._resolveCredentialField(field) || field] || field
    );
  }

  _normalizeOptionalObjectId(value, label) {
    if (value === undefined) return undefined;
    if (value === null || value === "") return null;
    if (!mongoose.Types.ObjectId.isValid(value)) {
      throw ApiError.badRequest(`${label}: invalid contact_id provided`);
    }
    return value;
  }

  _assertDistinctRoleUsernames(roleCredentials = {}) {
    const seen = new Map();
    for (const [field, credential] of Object.entries(roleCredentials)) {
      const normalizedField = this._resolveCredentialField(field);
      if (!normalizedField) continue;

      const username = String(credential?.username || "").trim();
      if (!username) continue;

      if (seen.has(username)) {
        const firstField = seen.get(username);
        const firstLabel = this._getRoleCredentialLabel(firstField);
        const secondLabel = this._getRoleCredentialLabel(normalizedField);
        throw ApiError.badRequest(
          `${firstLabel} and ${secondLabel} cannot use the same username`,
        );
      }

      seen.set(username, normalizedField);
    }
  }

  _validateCredentialShape(
    credential,
    label,
    { requirePassword = false } = {},
  ) {
    if (
      !credential ||
      typeof credential !== "object" ||
      Array.isArray(credential)
    ) {
      throw ApiError.badRequest(`${label} credentials must be an object`);
    }

    const username = String(credential.username || "").trim();
    if (!username) {
      throw ApiError.badRequest(`${label} username is required`);
    }
    if (username.length < 3) {
      throw ApiError.badRequest(
        `${label} username must be at least 3 characters`,
      );
    }

    const password = credential.password;
    if (requirePassword && (!password || typeof password !== "string")) {
      throw ApiError.badRequest(`${label} password is required`);
    }
    if (password !== undefined && password !== null && password !== "") {
      if (typeof password !== "string" || password.length < 6) {
        throw ApiError.badRequest(
          `${label} password must be at least 6 characters`,
        );
      }
    }
  }

  async _assertUsernameAvailable(username, excludeUserId = null) {
    const trimmedUsername = String(username || "").trim();
    const query = {
      $or: [
        { "admin.username": trimmedUsername },
        { "sale_user.username": trimmedUsername },
        { "account_user.username": trimmedUsername },
        { "client_user.username": trimmedUsername },
        { "gst_firm.username": trimmedUsername },
        { "nongst_firm.username": trimmedUsername },
      ],
    };

    if (excludeUserId) {
      query._id = { $ne: excludeUserId };
    }

    const existing = await User.findOne(query).select("_id").lean();
    if (existing) {
      throw ApiError.conflict(`Username '${trimmedUsername}' is already taken`);
    }
  }

  async createSecondaryUser(data) {
    const { name, email, phone, allow_bill_upload, gst_firm, nongst_firm } = data;
    const roleCredentials = this._extractRoleCredentials(data);
    const effectiveRoleCredentials = { ...roleCredentials };

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("User name is required");
    }
    if (!gst_firm || typeof gst_firm !== "object") {
      throw ApiError.badRequest("GST Firm details are required");
    }
    if (!nongst_firm || typeof nongst_firm !== "object") {
      throw ApiError.badRequest("Non-GST Firm details are required");
    }

    this._validateFirmRequired(gst_firm, "GST Firm");
    this._validateFirmRequired(nongst_firm, "Non-GST Firm");

    this._assertDistinctRoleUsernames(effectiveRoleCredentials);

    for (const field of CREDENTIAL_FIELDS) {
      if (!this._hasCredentialInput(effectiveRoleCredentials[field])) continue;

      const label = this._getRoleCredentialLabel(field);
      this._validateCredentialShape(effectiveRoleCredentials[field], label, {
        requirePassword: true,
      });
      await this._assertUsernameAvailable(
        effectiveRoleCredentials[field].username,
      );
    }

    await this._assertUsernameAvailable(gst_firm.username);
    await this._assertUsernameAvailable(nongst_firm.username);

    if (email) {
      const existingEmail = await User.findOne({ email: email.trim() });
      if (existingEmail) {
        throw ApiError.conflict("A user with this email already exists");
      }
    }

    const gstPwHash = await bcrypt.hash(gst_firm.password, 10);
    const nongstPwHash = await bcrypt.hash(nongst_firm.password, 10);
    const hasSaleCredential = this._hasCredentialInput(
      effectiveRoleCredentials.sale_user,
    );
    const hasAccountCredential = this._hasCredentialInput(
      effectiveRoleCredentials.account_user,
    );
    const hasClientCredential = this._hasCredentialInput(
      effectiveRoleCredentials.client_user,
    );

    const saleUserPwHash =
      hasSaleCredential ?
        await bcrypt.hash(effectiveRoleCredentials.sale_user.password, 10)
      : null;
    const accountUserPwHash =
      hasAccountCredential ?
        await bcrypt.hash(effectiveRoleCredentials.account_user.password, 10)
      : null;
    const clientUserPwHash =
      hasClientCredential ?
        await bcrypt.hash(effectiveRoleCredentials.client_user.password, 10)
      : null;

    const {
      username: gstUsername,
      name: gstName,
      phone: gstPhone,
      email: gstEmail,
      address: gstAddress,
      godown_address: gstGodownAddress,
      city: gstCity,
      state: gstState,
      GSTIN: gstGSTIN,
      CIN: gstCIN,
      reg_number: gstRegNumber,
      bank_name: gstBankName,
      account_number: gstAccountNumber,
      ifsc_code: gstIfscCode,
      bank_branch: gstBankBranch,
      account_holder: gstAccountHolder,
      upi_id: gstUpiId,
    } = gst_firm;

    const {
      username: nongstUsername,
      name: nongstName,
      phone: nongstPhone,
      email: nongstEmail,
      address: nongstAddress,
      godown_address: nongstGodownAddress,
      city: nongstCity,
      state: nongstState,
      GSTIN: nongstGSTIN,
      CIN: nongstCIN,
      reg_number: nongstRegNumber,
      bank_name: nongstBankName,
      account_number: nongstAccountNumber,
      ifsc_code: nongstIfscCode,
      bank_branch: nongstBankBranch,
      account_holder: nongstAccountHolder,
      upi_id: nongstUpiId,
    } = nongst_firm;

    const user = await User.create({
      type: "secondary",
      name,
      email,
      phone,
      allow_bill_upload: Boolean(allow_bill_upload),
      admin: null,
      sale_user:
        hasSaleCredential ?
          {
            username: String(
              effectiveRoleCredentials.sale_user.username || "",
            ).trim(),
            password: saleUserPwHash,
          }
        : null,
      account_user:
        hasAccountCredential ?
          {
            username: String(
              effectiveRoleCredentials.account_user.username || "",
            ).trim(),
            password: accountUserPwHash,
          }
        : null,
      client_user:
        hasClientCredential ?
          {
            username: String(
              effectiveRoleCredentials.client_user.username || "",
            ).trim(),
            password: clientUserPwHash,
            contact_id:
              this._normalizeOptionalObjectId(
                effectiveRoleCredentials.client_user.contact_id,
                "Client role",
              ) ?? null,
          }
        : null,
      gst_firm: {
        username: gstUsername,
        password: gstPwHash,
        name: gstName,
        phone: gstPhone,
        email: gstEmail,
        address: gstAddress,
        godown_address: gstGodownAddress,
        city: gstCity,
        state: gstState,
        GSTIN: gstGSTIN,
        CIN: gstCIN,
        reg_number: gstRegNumber,
        bank_ids: [],
      },
      nongst_firm: {
        username: nongstUsername,
        password: nongstPwHash,
        name: nongstName,
        phone: nongstPhone,
        email: nongstEmail,
        address: nongstAddress,
        godown_address: nongstGodownAddress,
        city: nongstCity,
        state: nongstState,
        GSTIN: nongstGSTIN,
        CIN: nongstCIN,
        reg_number: nongstRegNumber,
        bank_ids: [],
      },
    });

    const gstBankId = await this._createFirmBank(
      user._id,
      gstBankName,
      gstAccountNumber,
      gstIfscCode,
      gstBankBranch,
      gstAccountHolder,
      gstUpiId,
    );
    const nongstBankId = await this._createFirmBank(
      user._id,
      nongstBankName,
      nongstAccountNumber,
      nongstIfscCode,
      nongstBankBranch,
      nongstAccountHolder,
      nongstUpiId,
    );

    if (gstBankId) {
      user.gst_firm.bank_ids = [gstBankId];
    }
    if (nongstBankId) {
      user.nongst_firm.bank_ids = [nongstBankId];
    }
    if (gstBankId || nongstBankId) {
      await user.save();
    }

    await this._ensureDemoSubscription(user._id);

    await Contact.insertMany([
      { name: "CASHBOOK", type: "book", user_id: user._id },
      { name: "BANKBOOK", type: "book", user_id: user._id },
    ]);
    await financialYearService.ensureCurrentYear(user._id);

    const safeUser = this._toSafeUserObject(user.toSafeObject());
    const [withSubscription] = await this._attachSubscriptionSummary([
      safeUser,
    ]);
    return withSubscription;
  }

  async getSecondaryUsers(query) {
    const result = await Pagination.paginate(
      User,
      { type: "secondary" },
      {
        ...query,
        sort: { createdAt: -1 },
        select:
          "-gst_firm.password -nongst_firm.password -admin.password -sale_user.password -account_user.password -client_user.password",
        populate: [
          { path: "gst_firm.bank_ids", model: "Bank" },
          { path: "nongst_firm.bank_ids", model: "Bank" },
        ],
      },
    );

    const safeUsers = result.data.map((user) => this._toSafeUserObject(user));
    result.data = await this._attachSubscriptionSummary(safeUsers);
    return result;
  }

  async getSecondaryUserById(userId) {
    const user = await User.findOne({
      _id: userId,
      type: "secondary",
    });
    if (!user) throw ApiError.notFound("Secondary user not found");

    const [withSubscription] = await this._attachSubscriptionSummary([
      this._toSafeUserObject(user.toSafeObject()),
    ]);

    return withSubscription;
  }

  _validateFirmUpdate(firm, label) {
    if (typeof firm !== "object" || firm === null || Array.isArray(firm)) {
      throw ApiError.badRequest(`${label} must be an object`);
    }
    if (firm.password !== undefined) {
      if (typeof firm.password !== "string" || firm.password.length < 6) {
        throw ApiError.badRequest(
          `${label}: Password must be at least 6 characters`,
        );
      }
    }
    if (firm.username !== undefined) {
      if (
        typeof firm.username !== "string" ||
        firm.username.trim().length < 3
      ) {
        throw ApiError.badRequest(
          `${label}: Username must be at least 3 characters`,
        );
      }
    }
  }

  async _checkFirmUsernameUniqueness(firmPath, username, excludeUserId) {
    await this._assertUsernameAvailable(username, excludeUserId);
  }

  _hasCredentialInput(credential) {
    if (
      !credential ||
      typeof credential !== "object" ||
      Array.isArray(credential)
    ) {
      return false;
    }

    const username = String(credential.username || "").trim();
    const password = String(credential.password || "").trim();
    const contactId = String(credential.contact_id || "").trim();

    return Boolean(username || password || contactId);
  }

  _normalizeOptionalCredentialSubdocs(user) {
    for (const field of ["admin", "sale_user", "account_user", "client_user"]) {
      const credential = user.get(field);
      if (!credential || typeof credential !== "object" || Array.isArray(credential)) {
        user.set(field, null);
        continue;
      }

      const username = String(credential.username || "").trim();
      const password = String(credential.password || "").trim();
      if (!username && !password) {
        user.set(field, null);
      }
    }
  }

  async updateSecondaryUser(userId, updateData) {
    const user = await User.findOne({
      _id: userId,
      type: "secondary",
    });

    if (!user) throw ApiError.notFound("User not found");
    this._normalizeOptionalCredentialSubdocs(user);

    const roleCredentialUpdates = this._extractRoleCredentials(updateData);
    const hasRoleCredentialUpdates =
      Object.keys(roleCredentialUpdates).length > 0;

    const { name, email, phone, is_active, allow_bill_upload, gst_firm, nongst_firm, subscription_amount } = updateData;

    if (
      !name &&
      !email &&
      !phone &&
      is_active === undefined &&
      allow_bill_upload === undefined &&
      !gst_firm &&
      !nongst_firm &&
      !hasRoleCredentialUpdates &&
      subscription_amount === undefined
    ) {
      throw ApiError.badRequest("No fields provided to update");
    }

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Name must be a non-empty string");
      }
      user.name = name.trim();
    }
    if (email !== undefined) {
      if (email) {
        const existingEmail = await User.findOne({
          email: email.trim(),
          _id: { $ne: userId },
        });
        if (existingEmail) {
          throw ApiError.conflict("A user with this email already exists");
        }
      }
      user.email = email;
    }
    if (phone !== undefined) user.phone = phone;
    if (is_active !== undefined) user.is_active = is_active;
    if (allow_bill_upload !== undefined) user.allow_bill_upload = Boolean(allow_bill_upload);

    if (gst_firm) {
      this._validateFirmUpdate(gst_firm, "GST Firm");

      const {
        username,
        password,
        name: firmName,
        phone: firmPhone,
        email: firmEmail,
        address,
        godown_address,
        city,
        state,
        GSTIN,
        CIN,
        reg_number,
        bank_ids,
      } = gst_firm;

      const validatedGstBankIds = await this._syncFirmBankIds(
        userId,
        bank_ids,
        "GST Firm",
      );

      if (username !== undefined) {
        await this._checkFirmUsernameUniqueness("gst_firm", username, userId);
        user.gst_firm.username = username.trim();
      }
      if (password) user.gst_firm.password = await bcrypt.hash(password, 10);
      if (firmName !== undefined) user.gst_firm.name = firmName;
      if (firmPhone !== undefined) user.gst_firm.phone = firmPhone;
      if (firmEmail !== undefined) user.gst_firm.email = firmEmail;
      if (address !== undefined) user.gst_firm.address = address;
      if (godown_address !== undefined)
        user.gst_firm.godown_address = godown_address;
      if (city !== undefined) user.gst_firm.city = city;
      if (state !== undefined) user.gst_firm.state = state;
      if (GSTIN !== undefined) user.gst_firm.GSTIN = GSTIN;
      if (CIN !== undefined) user.gst_firm.CIN = CIN;
      if (reg_number !== undefined) user.gst_firm.reg_number = reg_number;
      if (validatedGstBankIds !== undefined)
        user.gst_firm.bank_ids = validatedGstBankIds;
    }

    if (nongst_firm) {
      this._validateFirmUpdate(nongst_firm, "Non-GST Firm");

      const {
        username,
        password,
        name: firmName,
        phone: firmPhone,
        email: firmEmail,
        address,
        godown_address,
        city,
        state,
        GSTIN,
        CIN,
        reg_number,
        bank_ids,
      } = nongst_firm;

      const validatedNonGstBankIds = await this._syncFirmBankIds(
        userId,
        bank_ids,
        "Non-GST Firm",
      );

      if (username !== undefined) {
        await this._checkFirmUsernameUniqueness(
          "nongst_firm",
          username,
          userId,
        );
        user.nongst_firm.username = username.trim();
      }
      if (password) user.nongst_firm.password = await bcrypt.hash(password, 10);
      if (firmName !== undefined) user.nongst_firm.name = firmName;
      if (firmPhone !== undefined) user.nongst_firm.phone = firmPhone;
      if (firmEmail !== undefined) user.nongst_firm.email = firmEmail;
      if (address !== undefined) user.nongst_firm.address = address;
      if (godown_address !== undefined)
        user.nongst_firm.godown_address = godown_address;
      if (city !== undefined) user.nongst_firm.city = city;
      if (state !== undefined) user.nongst_firm.state = state;
      if (GSTIN !== undefined) user.nongst_firm.GSTIN = GSTIN;
      if (CIN !== undefined) user.nongst_firm.CIN = CIN;
      if (reg_number !== undefined) user.nongst_firm.reg_number = reg_number;
      if (validatedNonGstBankIds !== undefined)
        user.nongst_firm.bank_ids = validatedNonGstBankIds;
    }

    const touchedRoleCredentialFields = new Set();

    if (hasRoleCredentialUpdates) {
      const optionalRoleCredentialFields = new Set([
        "sale_user",
        "account_user",
        "client_user",
      ]);
      const mergedRoleCredentials = {
        sale_user: {
          username: user.sale_user?.username || "",
        },
        account_user: { username: user.account_user?.username || "" },
        client_user: { username: user.client_user?.username || "" },
      };

      for (const [field, credential] of Object.entries(roleCredentialUpdates)) {
        const normalizedField = this._resolveCredentialField(field);
        if (!normalizedField) continue;
        if (
          optionalRoleCredentialFields.has(normalizedField) &&
          !this._hasCredentialInput(credential)
        ) {
          continue;
        }

        const label = this._getRoleCredentialLabel(field);
        this._validateCredentialShape(credential, label, {
          requirePassword: !user[normalizedField]?.password,
        });
        mergedRoleCredentials[normalizedField] = {
          username: String(credential.username || "").trim(),
        };
      }

      this._assertDistinctRoleUsernames(mergedRoleCredentials);

      for (const [field, credential] of Object.entries(roleCredentialUpdates)) {
        const normalizedField = this._resolveCredentialField(field);
        if (!normalizedField) continue;
        if (
          optionalRoleCredentialFields.has(normalizedField) &&
          !this._hasCredentialInput(credential)
        ) {
          user[normalizedField] = null;
          touchedRoleCredentialFields.add(normalizedField);
          continue;
        }

        const nextUsername = String(credential.username || "").trim();
        const currentUsername = String(
          user[normalizedField]?.username || "",
        ).trim();

        if (nextUsername && nextUsername !== currentUsername) {
          await this._assertUsernameAvailable(nextUsername, userId);
        }

        if (
          !user[normalizedField] ||
          typeof user[normalizedField] !== "object"
        ) {
          user[normalizedField] = {};
        }

        user[normalizedField].username = nextUsername;
        touchedRoleCredentialFields.add(normalizedField);

        if (credential.password) {
          user[normalizedField].password = await bcrypt.hash(
            credential.password,
            10,
          );
        }

        if (
          normalizedField === "client_user" &&
          Object.prototype.hasOwnProperty.call(credential, "contact_id")
        ) {
          user.client_user.contact_id = this._normalizeOptionalObjectId(
            credential.contact_id,
            "Client role",
          );
        }
      }
    }

    await user.save();

    if (touchedRoleCredentialFields.size > 0) {
      await Session.deleteMany({
        user_id: userId,
        role: "firm",
        credential_key: { $in: Array.from(touchedRoleCredentialFields) },
      });
    }

    if (
      subscription_amount !== undefined ||
      updateData.subscription_years !== undefined ||
      updateData.subscription_months !== undefined ||
      updateData.subscription_days !== undefined
    ) {
      const subscription = await Subscription.findOne({ user_id: userId }).sort({ expiry_date: -1, createdAt: -1 });
      if (subscription) {
        if (subscription_amount !== undefined) {
          const amount = Number(subscription_amount);
          if (!Number.isFinite(amount) || amount < 0) {
            throw ApiError.badRequest("Subscription amount must be a non-negative number");
          }
          subscription.amount = amount;
        }

        let durationChanged = false;
        const timeline = {
          years: subscription.timeline?.years || 0,
          months: subscription.timeline?.months || 0,
          days: subscription.timeline?.days || 0,
        };

        if (updateData.subscription_years !== undefined) {
          timeline.years = Number(updateData.subscription_years);
          durationChanged = true;
        }
        if (updateData.subscription_months !== undefined) {
          timeline.months = Number(updateData.subscription_months);
          durationChanged = true;
        }
        if (updateData.subscription_days !== undefined) {
          timeline.days = Number(updateData.subscription_days);
          durationChanged = true;
        }

        if (durationChanged) {
          if (
            !Number.isFinite(timeline.years) ||
            !Number.isFinite(timeline.months) ||
            !Number.isFinite(timeline.days)
          ) {
            throw ApiError.badRequest("Subscription duration values must be numeric");
          }
          if (timeline.years < 0 || timeline.months < 0 || timeline.days < 0) {
            throw ApiError.badRequest("Subscription duration values cannot be negative");
          }
          if (timeline.years === 0 && timeline.months === 0 && timeline.days === 0) {
            throw ApiError.badRequest("At least one duration field must be greater than 0");
          }
          subscription.timeline = timeline;

          // Recalculate expiry date from start_date
          const baseDate = subscription.start_date || new Date();
          const expiryDate = new Date(baseDate);
          expiryDate.setFullYear(expiryDate.getFullYear() + timeline.years);
          expiryDate.setMonth(expiryDate.getMonth() + timeline.months);
          expiryDate.setDate(expiryDate.getDate() + timeline.days);
          subscription.expiry_date = expiryDate;

          // Update status based on new expiry date
          if (expiryDate > new Date()) {
            subscription.status = "active";
          } else {
            subscription.status = "expired";
          }
        }

        await subscription.save();
      }
    }

    const safeUser = this._toSafeUserObject(user.toSafeObject());
    const [withSubscription] = await this._attachSubscriptionSummary([
      safeUser,
    ]);
    return withSubscription;
  }

  async deactivateSecondaryUser(userId) {
    const user = await User.findOne({
      _id: userId,
      type: "secondary",
    });
    if (!user) throw ApiError.notFound("Secondary user not found");

    user.is_active = false;
    await user.save();

    await Session.deleteMany({ user_id: userId });
    return this._toSafeUserObject(user.toSafeObject());
  }

  async reactivateSecondaryUser(userId) {
    const user = await User.findOne({
      _id: userId,
      type: "secondary",
    });
    if (!user) throw ApiError.notFound("Secondary user not found");

    user.is_active = true;
    await user.save();

    await this._ensureDemoSubscription(user._id);

    const safeUser = this._toSafeUserObject(user.toSafeObject());
    const [withSubscription] = await this._attachSubscriptionSummary([
      safeUser,
    ]);
    return withSubscription;
  }

  async deleteSecondaryUser(userId) {
    const user = await User.findOne({
      _id: userId,
      type: "secondary",
    });
    if (!user) throw ApiError.notFound("Secondary user not found");

    if (user.signature) {
      await s3Service.deleteFile(user.signature);
    }

    await Session.deleteMany({ user_id: userId });
    await Subscription.findOneAndDelete({ user_id: userId });
    await User.findByIdAndDelete(userId);
  }

  async uploadSignature(userId, file) {
    if (!file) {
      throw ApiError.badRequest("Signature image file is required");
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    if (user.signature) {
      throw ApiError.badRequest(
        "Signature already exists. Use the update endpoint to replace it.",
      );
    }

    const signatureUrl = await s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      "users/signatures",
    );

    user.signature = signatureUrl;
    await user.save();

    return this._toSafeUserObject(user.toSafeObject());
  }

  async updateSignature(userId, file) {
    if (!file) {
      throw ApiError.badRequest("Signature image file is required");
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    if (user.signature) {
      await s3Service.deleteFile(user.signature);
    }

    const signatureUrl = await s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      "users/signatures",
    );

    user.signature = signatureUrl;
    await user.save();

    return this._toSafeUserObject(user.toSafeObject());
  }

  async getSignature(userId, firmType = null) {
    const user = await User.findById(userId).lean();
    if (!user) throw ApiError.notFound("User not found");

    let signatureUrl = null;
    if (firmType === "GST") {
      signatureUrl = user.gst_firm?.signature;
    } else if (firmType === "NON_GST") {
      signatureUrl = user.nongst_firm?.signature;
    }

    signatureUrl = signatureUrl || user.signature;

    if (!signatureUrl) throw ApiError.notFound("Signature not found");
    return s3Service.getFile(signatureUrl);
  }
}

export default new AdminService();
