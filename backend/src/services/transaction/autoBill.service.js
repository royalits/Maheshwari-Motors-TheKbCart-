import mongoose from "mongoose";
import AutoBill from "../../models/transaction/auto_bill.model.js";
import Contact from "../../models/master/contact.model.js";
import { ApiError, Pagination } from "../../utils/index.js";

const parseBoolean = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(normalized)) return true;
    if (["false", "0", "no", "n"].includes(normalized)) return false;
  }
  return Boolean(value);
};

class AutoBillService {
  _resolvePartyId(rawValue) {
    if (!rawValue) return rawValue;
    if (typeof rawValue === "object") {
      return rawValue._id || rawValue.id || rawValue;
    }
    return rawValue;
  }

  _resolveThreshold(rawValue, { required = false } = {}) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (required) {
        throw ApiError.badRequest("threshold is required");
      }
      return undefined;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw ApiError.badRequest("threshold must be a positive number");
    }

    return Math.floor(value);
  }

  _resolveDate(rawValue, label, { required = false } = {}) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (required) {
        throw ApiError.badRequest(`${label} is required`);
      }
      return undefined;
    }

    const date = new Date(rawValue);
    if (Number.isNaN(date.getTime())) {
      throw ApiError.badRequest(`${label} must be a valid date`);
    }

    return date;
  }

  _resolveAmount(rawValue, { required = false } = {}) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (required) {
        throw ApiError.badRequest("amount is required");
      }
      return undefined;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value <= 0) {
      throw ApiError.badRequest("amount must be a positive number");
    }

    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  _resolveBrandIds(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return [];
    }

    if (Array.isArray(rawValue)) {
      const validIds = [];
      for (const item of rawValue) {
        if (typeof item === "object") {
          const candidate = item._id || item.id || item;
          if (mongoose.Types.ObjectId.isValid(candidate)) {
            validIds.push(candidate);
          }
        } else if (typeof item === "string" && mongoose.Types.ObjectId.isValid(item)) {
          validIds.push(item);
        }
      }
      return validIds;
    }

    if (typeof rawValue === "object") {
      const candidate = rawValue._id || rawValue.id || rawValue;
      if (mongoose.Types.ObjectId.isValid(candidate)) {
        return [candidate];
      }
    }

    if (typeof rawValue === "string" && mongoose.Types.ObjectId.isValid(rawValue)) {
      return [rawValue];
    }

    return [];
  }

  _resolveLabelId(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return undefined;
    }

    if (typeof rawValue === "object") {
      const candidate = rawValue._id || rawValue.id || rawValue;
      if (mongoose.Types.ObjectId.isValid(candidate)) {
        return candidate;
      }
      throw ApiError.badRequest("Invalid label_id");
    }

    if (typeof rawValue === "string" && mongoose.Types.ObjectId.isValid(rawValue)) {
      return rawValue;
    }

    throw ApiError.badRequest("Invalid label_id");
  }

  _resolvePerDayBill(rawValue) {
    if (rawValue === undefined || rawValue === null || rawValue === "") {
      return 0;
    }

    const value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) {
      return 0;
    }

    return Math.floor(value);
  }

  async _validateParty(partyId, userId) {
    if (!partyId || !mongoose.Types.ObjectId.isValid(partyId)) {
      throw ApiError.badRequest("Invalid party_id");
    }

    const contact = await Contact.findOne({
      _id: partyId,
      user_id: userId,
      type: "party",
    })
      .select("_id name user_id")
      .lean();

    if (!contact) {
      throw ApiError.badRequest("Party not found for this firm");
    }

    return contact;
  }

  async _getRuleForUser(ruleId, userId) {
    if (!mongoose.Types.ObjectId.isValid(ruleId)) {
      throw ApiError.badRequest("Invalid automation rule id");
    }

    const rule = await AutoBill.findById(ruleId);
    if (!rule) throw ApiError.notFound("Automation rule not found");

    if (rule.user_id && String(rule.user_id) !== String(userId)) {
      throw ApiError.forbidden("Access denied");
    }

    const partyId = rule.party_id?._id?.toString() || rule.party_id?.toString();
    await this._validateParty(partyId, userId);

    return rule;
  }

  async getRules(userId, query) {
    const partyIds = await Contact.find({
      user_id: userId,
      type: "party",
    })
      .select("_id")
      .lean();
    const partyIdList = partyIds.map((entry) => entry._id);

    const filter = {
      $or: [
        { user_id: userId },
        { user_id: { $exists: false }, party_id: { $in: partyIdList } },
      ],
    };

    if (query.party_id && mongoose.Types.ObjectId.isValid(query.party_id)) {
      filter.party_id = query.party_id;
    }

    const enabled =
      query.enabled ??
      query.is_active ??
      query.active ??
      query.isActive ??
      undefined;
    const parsedEnabled = parseBoolean(enabled);
    if (parsedEnabled !== undefined) {
      filter.enabled = parsedEnabled;
    }

    return Pagination.paginate(AutoBill, filter, {
      ...query,
      sort: { from_date: -1 },
      populate: [
        { path: "party_id", select: "name type" },
        { path: "brand_ids", select: "name" },
        { path: "label_id", select: "name" },
      ],
    });
  }

  async getRuleById(ruleId, userId) {
    const rule = await this._getRuleForUser(ruleId, userId);
    await rule.populate({ path: "party_id", select: "name type" });
    await rule.populate({ path: "brand_ids", select: "name" });
    await rule.populate({ path: "label_id", select: "name" });
    return rule;
  }

  async createRule(ruleData, userId) {
    const partyId = this._resolvePartyId(
      ruleData.party_id || ruleData.contact_id,
    );
    await this._validateParty(partyId, userId);

    const fromDate = this._resolveDate(ruleData.from_date, "from_date", {
      required: true,
    });
    const toDate = this._resolveDate(ruleData.to_date, "to_date", {
      required: true,
    });

    if (fromDate > toDate) {
      throw ApiError.badRequest("to_date must be after from_date");
    }

    const brandIds = this._resolveBrandIds(ruleData.brand_ids || ruleData.brandIds || ruleData.brand_id || ruleData.brandId);
    const labelId = this._resolveLabelId(ruleData.label_id || ruleData.labelId);
    const amount = this._resolveAmount(ruleData.amount ?? ruleData.fixed_amount, {
      required: true,
    });

    const perDayBill = this._resolvePerDayBill(ruleData.per_day_bill ?? ruleData.perDayBill);
    const enabled = parseBoolean(
      ruleData.enabled ?? ruleData.is_active ?? ruleData.isActive,
    );

    const rule = await AutoBill.create({
      party_id: partyId,
      brand_ids: brandIds,
      label_id: labelId,
      from_date: fromDate,
      to_date: toDate,
      amount,
      per_day_bill: perDayBill,
      enabled: enabled !== undefined ? enabled : true,
      user_id: userId,
    });
    return AutoBill.findById(rule._id)
      .populate("party_id", "name type")
      .populate("brand_ids", "name")
      .populate("label_id", "name");
  }

  async updateRule(ruleId, userId, updateData) {
    const rule = await this._getRuleForUser(ruleId, userId);

    const updates = {};

    if (updateData.party_id || updateData.contact_id) {
      const partyId = this._resolvePartyId(
        updateData.party_id || updateData.contact_id,
      );
      await this._validateParty(partyId, userId);
      updates.party_id = partyId;
    }

    const fromDate = this._resolveDate(updateData.from_date, "from_date");
    const toDate = this._resolveDate(updateData.to_date, "to_date");

    const nextFrom = fromDate ?? rule.from_date;
    const nextTo = toDate ?? rule.to_date;
    if (nextFrom && nextTo && nextFrom > nextTo) {
      throw ApiError.badRequest("to_date must be after from_date");
    }

    if (fromDate) updates.from_date = fromDate;
    if (toDate) updates.to_date = toDate;

    const brandIds = this._resolveBrandIds(updateData.brand_ids || updateData.brandIds || updateData.brand_id || updateData.brandId);
    if (brandIds !== undefined) updates.brand_ids = brandIds;

    const labelId = this._resolveLabelId(updateData.label_id || updateData.labelId);
    if (labelId !== undefined) updates.label_id = labelId;

    const amount = this._resolveAmount(updateData.amount ?? updateData.fixed_amount);
    if (amount !== undefined) updates.amount = amount;

    const perDayBill = this._resolvePerDayBill(updateData.per_day_bill ?? updateData.perDayBill);
    if (perDayBill !== undefined) updates.per_day_bill = perDayBill;

    const enabled = parseBoolean(
      updateData.enabled ?? updateData.is_active ?? updateData.isActive,
    );
    if (enabled !== undefined) updates.enabled = enabled;

    updates.user_id = rule.user_id || userId;

    const updated = await AutoBill.findByIdAndUpdate(ruleId, updates, {
      returnDocument: "after",
    })
      .populate("party_id", "name type")
      .populate("brand_ids", "name")
      .populate("label_id", "name");

    return updated;
  }

  async deleteRule(ruleId, userId) {
    await this._getRuleForUser(ruleId, userId);
    await AutoBill.findByIdAndDelete(ruleId);
  }
}

export default new AutoBillService();
