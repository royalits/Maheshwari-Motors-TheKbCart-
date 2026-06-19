import mongoose from "mongoose";

const TRANSACTION_TYPES = [
  "bank_received",
  "cash_received",
  "bank_payment",
  "cash_payment",
];

const CONTACT_TYPES = ["party", "supplier", "book"];

const transactionSchema = new mongoose.Schema(
  {
    id: { type: Number },
    transaction_no: { type: String, required: true },
    type: {
      type: String,
      enum: TRANSACTION_TYPES,
      required: true,
    },
    date: { type: Date, required: true, default: Date.now },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
    },
    contact_type: {
      type: String,
      enum: CONTACT_TYPES,
      default: null,
    },
    amount: { type: Number, required: true, min: 0 },
    bank_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
      default: null,
    },
    reference: { type: String, trim: true, default: "" },
    remarks: { type: String, trim: true, default: "" },
    settlement_status: {
      type: String,
      enum: ["none", "settled"],
      default: "none",
      index: true,
    },
    settlement_summary: {
      settled_amount: { type: Number, default: 0 },
      settlement_discount_amount: { type: Number, default: 0 },
      unsettled_amount: { type: Number, default: 0 },
      bill_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Bill" }],
      settled_at: { type: Date, default: null },
    },
    is_gst: { type: Number, enum: [0, 1], required: true },
    financial_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialYear",
      default: null,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, id: false },
);

transactionSchema.index(
  { transaction_no: 1, user_id: 1, is_gst: 1 },
  { unique: true },
);
transactionSchema.index({ type: 1, user_id: 1, is_gst: 1 });
transactionSchema.index({ contact_id: 1, user_id: 1 });
transactionSchema.index({ contact_type: 1, user_id: 1, is_gst: 1 });
transactionSchema.index({ bank_id: 1, user_id: 1 });
transactionSchema.index({ date: -1, user_id: 1 });
transactionSchema.index({ user_id: 1, financial_year_id: 1, is_gst: 1 });

export default mongoose.model("Transaction", transactionSchema);
