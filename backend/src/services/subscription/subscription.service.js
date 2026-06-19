import mongoose from "mongoose";
import Subscription from "../../models/common/subscription.model.js";
import User from "../../models/auth/user.model.js";
import { ApiError, Pagination } from "../../utils/index.js";

function normalizeDuration(duration = {}) {
  const years = Number(duration.years || 0);
  const months = Number(duration.months || 0);
  const days = Number(duration.days || 0);

  if (
    !Number.isFinite(years) ||
    !Number.isFinite(months) ||
    !Number.isFinite(days)
  ) {
    throw ApiError.badRequest("Subscription duration must be numeric");
  }

  if (years < 0 || months < 0 || days < 0) {
    throw ApiError.badRequest(
      "Subscription duration values cannot be negative",
    );
  }

  if (years === 0 && months === 0 && days === 0) {
    throw ApiError.badRequest(
      "At least one duration field (years/months/days) must be greater than 0",
    );
  }

  return { years, months, days };
}

function addDuration(baseDate, duration) {
  const date = new Date(baseDate);
  date.setFullYear(date.getFullYear() + duration.years);
  date.setMonth(date.getMonth() + duration.months);
  date.setDate(date.getDate() + duration.days);
  return date;
}

class SubscriptionService {
  async ensureDemoSubscription(userId) {
    const existing = await Subscription.findOne({ user_id: userId }).select(
      "_id",
    );
    if (existing) return existing;

    return Subscription.create({
      user_id: userId,
      plan_type: "demo",
      status: "active",
      timeline: { years: 0, months: 0, days: 30 },
      start_date: new Date(),
      notes: "Auto-created demo subscription",
    });
  }

  async getSubscriptions(query = {}) {
    const filter = {};

    if (query.status) filter.status = query.status;
    if (query.plan_type) filter.plan_type = query.plan_type;
    if (query.user_id) filter.user_id = query.user_id;

    return Pagination.paginate(Subscription, filter, {
      ...query,
      populate: { path: "user_id", select: "name email phone type is_active" },
      sort: { createdAt: -1 },
    });
  }

  async getSubscriptionByUserId(userId) {
    const subscription = await Subscription.findOne({
      user_id: userId,
    }).populate("user_id", "name email phone type is_active");

    if (!subscription) throw ApiError.notFound("Subscription not found");
    return subscription;
  }

  async resolveUserId(identifier) {
    if (mongoose.Types.ObjectId.isValid(identifier)) {
      const user = await User.findById(identifier).select("_id");
      if (user) return user._id;
    }

    const user = await User.findOne({
      $or: [
        { "admin.username": identifier },
        { "sale_user.username": identifier },
        { "gst_firm.username": identifier },
        { "nongst_firm.username": identifier },
        { "account_user.username": identifier },
        { "client_user.username": identifier },
      ],
    }).select("_id");

    if (!user) throw ApiError.notFound("User not found for the given username");
    return user._id;
  }

  async setSubscription(userId, data, adminUserId = null) {
    const user = await User.findById(userId).select("_id type is_active");
    if (!user) throw ApiError.notFound("User not found");

    const duration = normalizeDuration(data);
    const planType = data.plan_type === "demo" ? "demo" : "paid";
    const amount = Number(data.amount || 0);
    const now = new Date();
    const existing = await Subscription.findOne({ user_id: userId });

    let startDate = now;
    if (
      existing &&
      existing.status === "active" &&
      existing.expiry_date &&
      existing.expiry_date > now &&
      data.extend_from_current !== false
    ) {
      startDate = existing.expiry_date;
    }

    const expiryDate = addDuration(startDate, duration);

    if (!existing) {
      const created = await Subscription.create({
        user_id: userId,
        plan_type: planType,
        status: "active",
        timeline: duration,
        amount,
        start_date: startDate,
        expiry_date: expiryDate,
        activated_by: adminUserId,
        activated_at: now,
        last_extended_at: now,
        notes: data.notes || "",
      });

      return created.populate("user_id", "name email phone type is_active");
    }

    existing.history.push({
      plan_type: existing.plan_type,
      timeline: existing.timeline,
      amount: existing.amount || 0,
      start_date: existing.start_date,
      expiry_date: existing.expiry_date,
      activated_by: existing.activated_by,
      activated_at: existing.activated_at,
      notes: existing.notes || "",
    });

    existing.plan_type = planType;
    existing.status = "active";
    existing.timeline = duration;
    existing.amount = amount;
    existing.start_date = startDate;
    existing.expiry_date = expiryDate;
    existing.activated_by = adminUserId;
    existing.activated_at = now;
    existing.last_extended_at = now;
    existing.notes = data.notes || "";

    await existing.save();
    await existing.populate("user_id", "name email phone type is_active");
    return existing;
  }

  async getExpiringToday(date = new Date()) {
    return Subscription.getExpiringOnDate(date);
  }

  async markExpiredSubscriptions(date = new Date()) {
    const now = new Date(date);

    const result = await Subscription.updateMany(
      {
        status: "active",
        expiry_date: { $lt: now },
      },
      {
        $set: { status: "expired" },
      },
    );

    return {
      modified: result.modifiedCount || 0,
      matched: result.matchedCount || 0,
    };
  }
}

export default new SubscriptionService();
