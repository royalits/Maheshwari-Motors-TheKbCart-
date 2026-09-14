import mongoose from "mongoose";

const ASSIGNMENT_TYPES = ["firm", "party", "supplier"];

const bankSchema = new mongoose.Schema(
  {
    id: { type: Number },
    bank_name: { type: String, trim: true, required: true },
    bank_branch: { type: String, trim: true, default: "" },
    ifsc_code: { type: String, trim: true, default: "" },
    account_number: { type: String, trim: true, required: true },
    account_holder: { type: String, trim: true, default: "" },
    upi_id: { type: String, trim: true, default: "" },
    assignment_type: {
      type: String,
      enum: ASSIGNMENT_TYPES,
      default: null,
    },
    assigned_to: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      set: (v) => (v === "" ? null : v),
    },
    is_default: {
      type: Boolean,
      default: false,
    },
    opening_balance: {
      type: Number,
      default: 0,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, id: false },
);

bankSchema.index({ id: 1, user_id: 1 });
bankSchema.index({ account_number: 1, user_id: 1 });
bankSchema.index({ assignment_type: 1, user_id: 1 });
bankSchema.index({ assigned_to: 1, user_id: 1 });
bankSchema.index({ is_default: 1, user_id: 1 });

export { ASSIGNMENT_TYPES };
export default mongoose.model("Bank", bankSchema);
