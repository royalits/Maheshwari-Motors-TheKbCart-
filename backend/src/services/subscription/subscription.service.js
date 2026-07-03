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
    })
      .sort({ expiry_date: -1, createdAt: -1 })
      .populate("user_id", "name email phone type is_active");

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

    // 1. Find the latest active subscription to determine start date
    const latestActive = await Subscription.findOne({ user_id: userId, status: "active" })
      .sort({ expiry_date: -1, createdAt: -1 });

    let startDate = now;
    if (
      latestActive &&
      latestActive.expiry_date &&
      latestActive.expiry_date > now &&
      data.extend_from_current !== false
    ) {
      startDate = latestActive.expiry_date;
    }

    const expiryDate = addDuration(startDate, duration);

    // 2. Deactivate any currently active subscriptions for this user
    await Subscription.updateMany(
      { user_id: userId, status: "active" },
      { status: "expired" }
    );

    // 3. Create a new subscription entry for this new period
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

    await created.populate("user_id", "name email phone type is_active");
    return created;
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
