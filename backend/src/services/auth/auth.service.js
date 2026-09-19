import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import User from "../../models/auth/user.model.js";
import Session from "../../models/auth/session.model.js";
import Bank from "../../models/master/bank.model.js";
import Contact from "../../models/master/contact.model.js";
import Subscription from "../../models/common/subscription.model.js";
import s3Service from "../common/s3.service.js";
import financialYearService from "../common/financialYear.service.js";
import { ApiError } from "../../utils/index.js";
import { normalizeRole } from "../../utils/role.utils.js";

class AuthService {
  _credentialConfig = {
    admin: { label: "Admin credential", path: "admin", allowContact: false },
    gst_firm: { label: "GST firm", path: "gst_firm", allowContact: false },
    nongst_firm: {
      label: "Non-GST firm",
      path: "nongst_firm",
      allowContact: false,
    },
    sale_user: { label: "Sale user", path: "sale_user", allowContact: false },
    account_user: {
      label: "Account user",
      path: "account_user",
      allowContact: false,
    },
    client_user: {
      label: "Client user",
      path: "client_user",
      allowContact: true,
    },
  };

  _normalizeBankIds(bankIds, label) {
    if (bankIds === undefined || bankIds === null) return [];
    if (!Array.isArray(bankIds)) {
      throw ApiError.badRequest(`${label} bank_ids must be an array`);
    }

    const normalized = [];
    const seen = new Set();

    for (const id of bankIds) {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw ApiError.badRequest(`${label} contains an invalid bank_id`);
      }

      const key = String(id);
      if (!seen.has(key)) {
        seen.add(key);
        normalized.push(id);
      }
    }

    return normalized;
  }

  async _resolveFirmBanks(userId, firmObj) {
    const configuredBankIds =
      Array.isArray(firmObj.bank_ids) ? firmObj.bank_ids : [];

    if (configuredBankIds.length > 0) {
      return Bank.find({
        _id: { $in: configuredBankIds },
        user_id: userId,
      }).lean();
    }

    return Bank.find({ user_id: userId }).lean();
  }

  async _ensureBookContacts(userId) {
    // Ensure CASHBOOK and BANKBOOK exist for this user
    const existing = await Contact.countDocuments({
      user_id: userId,
      type: "book",
      name: { $in: ["CASHBOOK", "BANKBOOK"] },
    });

    if (existing < 2) {
      // Create missing book contacts
      const existingNames = await Contact.find({
        user_id: userId,
        type: "book",
      })
        .select("name")
        .lean();

      const existingSet = new Set(existingNames.map((c) => c.name));
      const toCreate = [];

      if (!existingSet.has("CASHBOOK")) {
        toCreate.push({ name: "CASHBOOK", type: "book", user_id: userId });
      }
      if (!existingSet.has("BANKBOOK")) {
        toCreate.push({ name: "BANKBOOK", type: "book", user_id: userId });
      }

      if (toCreate.length > 0) {
        await Contact.insertMany(toCreate);
      }
    }
  }

  async registerMainUser(data) {
    const { name, email, phone, admin, gst_firm, nongst_firm } = data;

    const existingMain = await User.findOne({ type: "main" });
    if (existingMain) {
      throw ApiError.conflict("Main user already exists. Only one is allowed.");
    }

    const adminPwHash = await bcrypt.hash(admin.password, 10);
    const gstPwHash = await bcrypt.hash(gst_firm.password, 10);
    const nongstPwHash = await bcrypt.hash(nongst_firm.password, 10);

    const gstBankIds = this._normalizeBankIds(gst_firm?.bank_ids, "GST firm");
    const nongstBankIds = this._normalizeBankIds(
      nongst_firm?.bank_ids,
      "Non-GST firm",
    );

    const user = await User.create({
      type: "main",
      name,
      email,
      phone,
      admin: { ...admin, password: adminPwHash },
      gst_firm: { ...gst_firm, password: gstPwHash, bank_ids: gstBankIds },
      nongst_firm: {
        ...nongst_firm,
        password: nongstPwHash,
        bank_ids: nongstBankIds,
      },
    });

    const token = user.generateAdminToken();

    await Session.create({
      user_id: user._id,
      role: "admin",
      token,
      device_name: "Registration Device",
      device_type: "unknown",
    });

    await Contact.insertMany([
      { name: "CASHBOOK", type: "book", user_id: user._id },
      { name: "BANKBOOK", type: "book", user_id: user._id },
    ]);
    await financialYearService.ensureCurrentYear(user._id);

    return {
      _id: user._id,
      name: user.name,
      type: "main",
      role: "admin",
      token,
    };
  }

  async login(username, password, firmType, deviceInfo = {}) {
    try {
      const user = await User.findByAdminCredentials(username, password);
      const token = user.generateAdminToken();

      // Ensure user has book contacts
      await this._ensureBookContacts(user._id);

      await Session.create({
        user_id: user._id,
        role: "admin",
        token,
        device_name: deviceInfo.device_name || "Unknown Device",
        device_type: deviceInfo.device_type || "unknown",
        ip_address: deviceInfo.ip_address || "",
      });

      const subscriptionExpiryAlert = await this._getSubscriptionAlert(user._id);

      return {
        _id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        type: user.type,
        is_admin: true,
        is_super_admin: true,
        role: "admin",
        subscription_expiry_alert: subscriptionExpiryAlert,
        token,
      };
    } catch (_) {
      const {
        user,
        firmType: resolvedFirmType,
        firmRole,
        contactId,
        credentialKey,
      } = await User.findByFirmCredentials(username, password);

      // Verify that firm's subscription is not expired
      await this._checkSubscription(user._id);

      const normalizedFirmRole = normalizeRole(firmRole || "admin");
      const token = user.generateFirmToken({
        firmType: resolvedFirmType,
        firmRole: normalizedFirmRole,
        contactId,
        credentialKey,
      });

      // Ensure user has book contacts
      await this._ensureBookContacts(user._id);

      await Session.create({
        user_id: user._id,
        role: "firm",
        firm_type: resolvedFirmType,
        firm_role: normalizedFirmRole,
        credential_key: credentialKey || null,
        contact_id: contactId,
        token,
        device_name: deviceInfo.device_name || "Unknown Device",
        device_type: deviceInfo.device_type || "unknown",
        ip_address: deviceInfo.ip_address || "",
      });

      const firmObj =
        resolvedFirmType === "GST" ? user.gst_firm : user.nongst_firm;

      const banks = await this._resolveFirmBanks(user._id, firmObj);

      const safe = user.toSafeObject();
      const contact =
        contactId ?
          await Contact.findById(contactId)
            .select("name phone address city state gstin")
            .lean()
        : null;

      const firmData = {
        firm_type: resolvedFirmType,
        firm_role: normalizedFirmRole,
        contact_id: contactId,
        contact_name: contact?.name || null,
        name:
          normalizedFirmRole === "client" && contact?.name ?
            contact.name
          : (firmObj.name || ""),
        email: firmObj.email,
        phone: firmObj.phone,
        address: firmObj.address,
        godown_address: firmObj.godown_address || null,
        city: firmObj.city,
        state: firmObj.state,
        GSTIN: firmObj.GSTIN || null,
        CIN: firmObj.CIN || null,
        reg_number: firmObj.reg_number || null,
        bank_ids: Array.isArray(firmObj.bank_ids) ? firmObj.bank_ids : [],
        banks,
        signature: firmObj.signature || null,
      };

      const subscriptionExpiryAlert = await this._getSubscriptionAlert(user._id);

      return {
        ...safe,
        _id: user._id,
        name:
          normalizedFirmRole === "client" && contact?.name ?
            contact.name
          : user.name,
        email: user.email,
        phone: user.phone,
        type: user.type,
        is_admin: false,
        role: "firm",
        current_role: "firm",
        current_firm_type: resolvedFirmType,
        current_firm_role: normalizedFirmRole,
        current_contact_id: contactId || null,
        current_credential_key: credentialKey || null,
        credential_key: credentialKey || null,
        is_gst: resolvedFirmType === "GST" ? 1 : 0,
        contact_id: contactId || null,
        contact_name: contact?.name || null,
        contact: contact || null,
        firm_data: firmData,
        signature: firmObj.signature || user.signature || null,
        subscription_expiry_alert: subscriptionExpiryAlert,
        token,
      };
    }
  }

  async _getSubscriptionAlert(userId) {
    if (!userId) return null;
    const subscription = await Subscription.findOne({ user_id: userId })
      .sort({ expiry_date: -1, createdAt: -1 })
      .lean();
    if (!subscription) return null;

    const now = new Date();
    const expiryDate = new Date(subscription.expiry_date);
    const diffMs = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const isExpired = diffMs <= 0 || subscription.status === "expired";
    const isExpiringSoon = daysRemaining <= 7 || isExpired;

    return {
      is_expiring_soon: isExpiringSoon,
      days_remaining: daysRemaining,
      expiry_date: subscription.expiry_date,
      plan_type: subscription.plan_type || "demo",
      status: subscription.status || "active",
      is_expired: isExpired,
    };
  }

  async _checkSubscription(userId) {
    const subscription = await Subscription.findOne({ user_id: userId }).sort({ expiry_date: -1, createdAt: -1 });
    if (subscription) {
      if (
        subscription.status === "expired" ||
        (subscription.expiry_date && new Date(subscription.expiry_date) < new Date())
      ) {
        if (subscription.status !== "expired") {
          subscription.status = "expired";
          await subscription.save().catch(() => {});
        }
        throw ApiError.paymentRequired("Subscription has expired. Please renew your plan to log in.");
      }
    }
  }

  async getProfile(
    user,
    role,
    firmType,
    firmRole = null,
    credentialKey = null,
    contactId = null,
  ) {
    await user.populate([
      { path: "gst_firm.bank_ids", model: "Bank" },
      { path: "nongst_firm.bank_ids", model: "Bank" },
    ]);
    const safe = user.toSafeObject();

    const normalizedFirmType = firmType || null;
    const activeFirm =
      normalizedFirmType === "GST" ? safe.gst_firm
      : normalizedFirmType === "NON_GST" ? safe.nongst_firm
      : null;
    const normalizedFirmRole =
      role === "firm" ?
        normalizeRole(firmRole || activeFirm?.role || "admin")
      : null;

    const contact =
      contactId ?
        await Contact.findById(contactId)
          .select("name phone address city state gstin")
          .lean()
      : null;

    const firmData =
      role === "firm" && activeFirm ?
        {
          firm_type: normalizedFirmType,
          firm_role: normalizedFirmRole,
          contact_id: contactId || activeFirm.contact_id || null,
          contact_name: contact?.name || null,
          name:
            normalizedFirmRole === "client" && contact?.name ?
              contact.name
            : (activeFirm.name || ""),
          email: activeFirm.email || "",
          phone: activeFirm.phone || "",
          address: activeFirm.address || "",
          godown_address: activeFirm.godown_address || null,
          city: activeFirm.city || "",
          state: activeFirm.state || "",
          GSTIN: activeFirm.GSTIN || null,
          CIN: activeFirm.CIN || null,
          reg_number: activeFirm.reg_number || null,
          bank_ids:
            Array.isArray(activeFirm.bank_ids) ? activeFirm.bank_ids : [],
          signature: activeFirm.signature || null,
        }
      : null;

    return {
      ...safe,
      name:
        normalizedFirmRole === "client" && contact?.name ?
          contact.name
        : (safe.name || ""),
      current_role: role,
      current_firm_type: normalizedFirmType,
      current_firm_role: normalizedFirmRole,
      current_contact_id: contactId || null,
      current_credential_key: credentialKey || null,
      contact_id: contactId || null,
      contact_name: contact?.name || null,
      contact: contact || null,
      firm_data: firmData,
      signature: (role === "firm" && activeFirm?.signature) ? activeFirm.signature : (safe.signature || null),
    };
  }

  async logout(token) {
    await Session.findOneAndDelete({ token });
  }

  async changePassword(
    userId,
    role,
    firmType,
    currentPassword,
    newPassword,
    credentialKey = null,
  ) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    let storedHash;
    let updatePath;

    if (role === "admin") {
      storedHash = user.admin.password;
      updatePath = "admin.password";
    } else {
      const normalizedCredentialKey =
        User.resolveCredentialKey(credentialKey) || credentialKey;
      const credentialPasswordPath = User.getPasswordPathForCredential(
        normalizedCredentialKey,
      );

      if (credentialPasswordPath) {
        updatePath = credentialPasswordPath;
        storedHash = credentialPasswordPath
          .split(".")
          .reduce((acc, key) => acc?.[key], user);
      }

      // Legacy fallback for older tokens.
      if (!storedHash || !updatePath) {
        if (firmType === "GST") {
          storedHash = user.gst_firm?.password;
          updatePath = "gst_firm.password";
        } else {
          storedHash = user.nongst_firm?.password;
          updatePath = "nongst_firm.password";
        }
      }
    }

    if (!storedHash || !updatePath) {
      throw ApiError.badRequest(
        "Unable to resolve password scope for this login",
      );
    }

    const isMatch = await bcrypt.compare(currentPassword, storedHash);
    if (!isMatch) throw ApiError.badRequest("Current password is incorrect");

    const newHash = await bcrypt.hash(newPassword, 10);
    const updateFields = { [updatePath]: newHash };
    await User.findByIdAndUpdate(userId, updateFields);

    const sessionFilter = { user_id: userId, role };
    if (role === "firm") {
      sessionFilter.firm_type = firmType;
      if (credentialKey) sessionFilter.credential_key = credentialKey;
    }
    await Session.deleteMany(sessionFilter);
  }

  _getAllowedCredentialKeys(role, firmType, firmRole) {
    if (role === "admin") {
      return [
        "admin",
        "gst_firm",
        "nongst_firm",
        "sale_user",
        "account_user",
        "client_user",
      ];
    }

    if (role !== "firm" || normalizeRole(firmRole || "") !== "admin") {
      throw ApiError.forbidden("Only firm admins can update credentials");
    }

    if (firmType === "GST") {
      return ["gst_firm", "sale_user", "account_user", "client_user"];
    }

    if (firmType === "NON_GST") {
      return ["nongst_firm"];
    }

    throw ApiError.forbidden("Unable to resolve credential permissions");
  }

  _normalizeCredentialUpdates(payload = {}) {
    const source =
      payload && typeof payload === "object" && payload.credentials ?
        payload.credentials
      : payload;

    if (!source || typeof source !== "object" || Array.isArray(source)) {
      throw ApiError.badRequest("Credential update payload is required");
    }

    return Object.entries(source).reduce((acc, [key, value]) => {
      const credentialKey = User.resolveCredentialKey(key) || key;
      if (!this._credentialConfig[credentialKey]) return acc;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw ApiError.badRequest(`${credentialKey} credentials must be an object`);
      }
      acc[credentialKey] = value;
      return acc;
    }, {});
  }

  _validateCredentialUpdateShape(credentialKey, credential) {
    const { label } = this._credentialConfig[credentialKey];
    const username =
      credential.username === undefined ?
        undefined
      : String(credential.username || "").trim();
    const password = credential.password;

    if (username !== undefined && username.length < 3) {
      throw ApiError.badRequest(`${label} username must be at least 3 characters`);
    }

    if (password !== undefined && password !== null && password !== "") {
      if (typeof password !== "string" || password.length < 6) {
        throw ApiError.badRequest(
          `${label} password must be at least 6 characters`,
        );
      }
    }

    return { username, password };
  }

  async _assertCredentialUsernameAvailable(username, userId) {
    if (!username) return;

    const existing = await User.findOne({
      _id: { $ne: userId },
      $or: [
        { "admin.username": username },
        { "gst_firm.username": username },
        { "nongst_firm.username": username },
        { "sale_user.username": username },
        { "account_user.username": username },
        { "client_user.username": username },
      ],
    })
      .select("_id")
      .lean();

    if (existing) {
      throw ApiError.conflict(`Username '${username}' is already taken`);
    }
  }

  _assertDistinctCredentialUsernames(user, updates) {
    const usernames = new Map();

    for (const [credentialKey, config] of Object.entries(
      this._credentialConfig,
    )) {
      const currentUsername = user[config.path]?.username || "";
      const nextUsername =
        updates[credentialKey]?.username !== undefined ?
          String(updates[credentialKey].username || "").trim()
        : String(currentUsername || "").trim();

      if (!nextUsername) continue;
      const lower = nextUsername.toLowerCase();
      if (usernames.has(lower)) {
        throw ApiError.badRequest(
          `${config.label} username duplicates ${usernames.get(lower)}`,
        );
      }
      usernames.set(lower, config.label);
    }
  }

  _isRoleManagedCredential(credentialKey) {
    return ["sale_user", "account_user", "client_user"].includes(
      credentialKey,
    );
  }

  _hasStoredCredential(user, credentialPath) {
    return Boolean(
      String(
        credentialPath
          .split(".")
          .reduce((acc, key) => acc?.[key], user)?.username || "",
      ).trim(),
    );
  }

  async updateCredentials(userId, role, firmType, firmRole, payload) {
    const allowedKeys = new Set(
      this._getAllowedCredentialKeys(role, firmType, firmRole),
    );
    const updates = this._normalizeCredentialUpdates(payload);
    const requestedKeys = Object.keys(updates);

    if (!requestedKeys.length) {
      throw ApiError.badRequest("No credential updates provided");
    }

    for (const credentialKey of requestedKeys) {
      if (!allowedKeys.has(credentialKey)) {
        throw ApiError.forbidden(
          `${this._credentialConfig[credentialKey].label} cannot be updated from this login`,
        );
      }
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    if (role === "firm") {
      for (const credentialKey of requestedKeys) {
        const config = this._credentialConfig[credentialKey];
        if (
          this._isRoleManagedCredential(credentialKey) &&
          !this._hasStoredCredential(user, config.path)
        ) {
          throw ApiError.forbidden(
            `${config.label} can only be enabled from the admin panel`,
          );
        }
      }
    }

    const normalizedUpdates = {};
    for (const [credentialKey, credential] of Object.entries(updates)) {
      normalizedUpdates[credentialKey] = this._validateCredentialUpdateShape(
        credentialKey,
        credential,
      );
    }

    this._assertDistinctCredentialUsernames(user, normalizedUpdates);

    for (const [credentialKey, credential] of Object.entries(
      normalizedUpdates,
    )) {
      const config = this._credentialConfig[credentialKey];
      if (!user[config.path] || typeof user[config.path] !== "object") {
        user[config.path] = {};
      }

      const hasStoredPassword = Boolean(user[config.path]?.password);
      if (
        !hasStoredPassword &&
        credential.username !== undefined &&
        !credential.password
      ) {
        throw ApiError.badRequest(
          `${config.label} password is required for new credentials`,
        );
      }

      if (
        credential.password &&
        credential.username === undefined &&
        !String(user[config.path]?.username || "").trim()
      ) {
        throw ApiError.badRequest(
          `${config.label} username is required for new credentials`,
        );
      }

      if (credential.username !== undefined) {
        const currentUsername = String(user[config.path]?.username || "").trim();
        if (credential.username !== currentUsername) {
          await this._assertCredentialUsernameAvailable(
            credential.username,
            userId,
          );
        }
        user[config.path].username = credential.username;
      }

      if (credential.password) {
        user[config.path].password = await bcrypt.hash(credential.password, 10);
      }
    }

    await user.save();

    const firmCredentialKeys = requestedKeys.filter((key) => key !== "admin");
    if (firmCredentialKeys.length) {
      await Session.deleteMany({
        user_id: userId,
        role: "firm",
        credential_key: { $in: firmCredentialKeys },
      });
    }
    if (requestedKeys.includes("admin")) {
      await Session.deleteMany({ user_id: userId, role: "admin" });
    }

    return user.toSafeObject();
  }

  async getSessions(
    userId,
    role,
    firmType,
    currentToken,
    credentialKey = null,
  ) {
    const query = { user_id: userId, role };
    if (role === "firm" && firmType) {
      query.firm_type = firmType;
      if (credentialKey) query.credential_key = credentialKey;
    }

    const sessions = await Session.find(query)
      .select("-__v")
      .sort({ createdAt: -1 })
      .lean();

    return sessions.map((s) => ({
      _id: s._id,
      device_name: s.device_name,
      device_type: s.device_type,
      ip_address: s.ip_address,
      last_active: s.last_active,
      is_current: s.token === currentToken,
      createdAt: s.createdAt,
    }));
  }

  async revokeSession(sessionId, userId) {
    const session = await Session.findOneAndDelete({
      _id: sessionId,
      user_id: userId,
    });
    if (!session) throw ApiError.notFound("Session not found");
    return session;
  }

  async revokeAllOtherSessions(
    userId,
    role,
    firmType,
    currentToken,
    credentialKey = null,
  ) {
    const query = { user_id: userId, token: { $ne: currentToken }, role };
    if (role === "firm" && firmType) {
      query.firm_type = firmType;
      if (credentialKey) query.credential_key = credentialKey;
    }
    await Session.deleteMany(query);
  }

  async uploadSignature(userId, file, role, firmType) {
    if (!file) {
      throw ApiError.badRequest("Signature image file is required");
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    const isFirm = role === "firm" && (firmType === "GST" || firmType === "NON_GST");
    const targetFirm = isFirm ? (firmType === "GST" ? "gst_firm" : "nongst_firm") : null;

    const currentSignature = targetFirm ? user[targetFirm]?.signature : user.signature;

    if (currentSignature) {
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

    if (targetFirm) {
      if (!user[targetFirm]) {
        user[targetFirm] = {};
      }
      user[targetFirm].signature = signatureUrl;
    } else {
      user.signature = signatureUrl;
    }

    await user.save();
    return user.toSafeObject();
  }

  async updateSignature(userId, file, role, firmType) {
    if (!file) {
      throw ApiError.badRequest("Signature image file is required");
    }

    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    const isFirm = role === "firm" && (firmType === "GST" || firmType === "NON_GST");
    const targetFirm = isFirm ? (firmType === "GST" ? "gst_firm" : "nongst_firm") : null;

    const currentSignature = targetFirm ? user[targetFirm]?.signature : user.signature;

    if (currentSignature) {
      try {
        await s3Service.deleteFile(currentSignature);
      } catch (err) {
        console.error("Failed to delete old signature:", err);
      }
    }

    const signatureUrl = await s3Service.uploadFile(
      file.buffer,
      file.originalname,
      file.mimetype,
      "users/signatures",
    );

    if (targetFirm) {
      if (!user[targetFirm]) {
        user[targetFirm] = {};
      }
      user[targetFirm].signature = signatureUrl;
    } else {
      user.signature = signatureUrl;
    }

    await user.save();
    return user.toSafeObject();
  }

  async getSignature(userId, role, firmType, requestedFirmType) {
    const user = await User.findById(userId).lean();
    if (!user) throw ApiError.notFound("User not found");

    const activeFirmType = requestedFirmType || (role === "firm" ? firmType : null);

    let signatureUrl = null;
    if (activeFirmType === "GST") {
      signatureUrl = user.gst_firm?.signature;
    } else if (activeFirmType === "NON_GST") {
      signatureUrl = user.nongst_firm?.signature;
    }

    // Fallback to user root signature
    signatureUrl = signatureUrl || user.signature;

    if (!signatureUrl) throw ApiError.notFound("Signature not found");
    return s3Service.getFile(signatureUrl);
  }

  async updateCashOpeningBalance(userId, firmType, amount) {
    const user = await User.findById(userId);
    if (!user) throw ApiError.notFound("User not found");

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      throw ApiError.badRequest("Cash opening balance must be a non-negative number");
    }

    const firmKey = String(firmType || "").toUpperCase() === "NON_GST" ? "nongst_firm" : "gst_firm";
    if (!user[firmKey]) {
      user[firmKey] = {};
    }

    user[firmKey].cash_opening_balance = parsedAmount;
    await user.save();

    return {
      cash_opening_balance: parsedAmount,
      firm_type: firmKey === "nongst_firm" ? "NON_GST" : "GST",
    };
  }

  async getLoginBranding() {
    const mainUser = await User.findOne({ type: "main" });
    if (!mainUser) {
      return {
        enabled: true,
        firm_name: "",
        phone: "",
        tagline: "",
      };
    }

    const branding = mainUser.login_branding || {};

    return {
      enabled: branding.enabled !== false,
      firm_name:
        typeof branding.firm_name === "string" ? branding.firm_name.trim() : "",
      phone: typeof branding.phone === "string" ? branding.phone.trim() : "",
      tagline:
        typeof branding.tagline === "string" ? branding.tagline.trim() : "",
    };
  }
}

export default new AuthService();
