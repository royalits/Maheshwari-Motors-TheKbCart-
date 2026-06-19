import mongoose from "mongoose";

const financialYearCloseSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    financial_year_start: { type: Number, required: true },
    financial_year_end: { type: Number, required: true },
    closed_at: { type: Date, required: true, default: Date.now },
    matched_items: { type: Number, default: 0 },
    modified_items: { type: Number, default: 0 },
    non_gst_due_bills_preserved: { type: Number, default: 0 },
    non_gst_due_bills_marked_old: { type: Number, default: 0 },
    non_gst_due_challans_marked_old: { type: Number, default: 0 },
    non_gst_settled_bills_deleted: { type: Number, default: 0 },
  },
  { timestamps: true },
);

financialYearCloseSchema.index(
  { user_id: 1, financial_year_start: 1 },
  { unique: true },
);

export default mongoose.model("FinancialYearClose", financialYearCloseSchema);
