import mongoose from "mongoose";

const timelineSchema = new mongoose.Schema(
  {
    years: { type: Number, min: 0, default: 0 },
    months: { type: Number, min: 0, default: 0 },
    days: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const historySchema = new mongoose.Schema(
  {
    plan_type: { type: String, enum: ["demo", "paid"], required: true },
    timeline: { type: timelineSchema, required: true },
    amount: { type: Number, min: 0, default: 0 },
    start_date: { type: Date, required: true },
    expiry_date: { type: Date, required: true },
    activated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activated_at: { type: Date, default: Date.now },
    notes: { type: String, default: "" },
  },
  { _id: false },
);

function addTimeline(baseDate, timeline = {}) {
  const date = new Date(baseDate);
  const years = Number(timeline.years || 0);
  const months = Number(timeline.months || 0);
  const days = Number(timeline.days || 0);

  date.setFullYear(date.getFullYear() + years);
  date.setMonth(date.getMonth() + months);
  date.setDate(date.getDate() + days);

  return date;
}

const subscriptionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    plan_type: { type: String, enum: ["demo", "paid"], default: "demo" },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled"],
      default: "active",
      index: true,
    },
    timeline: { type: timelineSchema, default: () => ({ days: 30 }) },
    amount: { type: Number, min: 0, default: 0 },
    start_date: { type: Date, default: Date.now, required: true },
    expiry_date: { type: Date, required: true, index: true },
    activated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    activated_at: { type: Date, default: Date.now },
    last_extended_at: { type: Date, default: null },
    notes: { type: String, default: "" },
    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

subscriptionSchema.pre("validate", function () {
  if (!this.start_date) this.start_date = new Date();

  if (
    !this.expiry_date ||
    this.isModified("timeline") ||
    this.isModified("start_date")
  ) {
    this.expiry_date = addTimeline(this.start_date, this.timeline);
  }
});

subscriptionSchema.statics.getExpiringOnDate = function (date = new Date()) {
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  return this.find({
    status: "active",
    expiry_date: { $gte: dayStart, $lt: dayEnd },
  }).populate("user_id", "name email phone type is_active");
};

export default mongoose.model("Subscription", subscriptionSchema);
