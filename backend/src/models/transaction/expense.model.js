import mongoose from "mongoose";

const expenseSchema = new mongoose.Schema(
  {
    id: { type: Number },
    voucher_no: {
      type: String,
      required: true,
    },
    expense_category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    payment_mode: {
      type: String,
      enum: ["cash", "bank"],
      required: true,
      default: "cash",
    },
    bank_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
      default: null,
    },
    reference_no: {
      type: String,
      trim: true,
      default: "",
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    is_gst: {
      type: Number,
      enum: [0, 1],
      required: true,
    },
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

expenseSchema.index(
  { voucher_no: 1, user_id: 1, is_gst: 1 },
  { unique: true, name: "voucher_no_user_gst_unique" },
);
expenseSchema.index({ user_id: 1, financial_year_id: 1, is_gst: 1 });
expenseSchema.index({ expense_category_id: 1, user_id: 1 });
expenseSchema.index({ date: -1, user_id: 1 });

export default mongoose.model("Expense", expenseSchema);
