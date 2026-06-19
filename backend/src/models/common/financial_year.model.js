import mongoose from "mongoose";

const financialYearSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    label: { type: String, required: true },
    start_year: { type: Number, required: true },
    end_year: { type: Number, required: true },
    start_date: { type: Date, required: true },
    end_date: { type: Date, required: true },
    status: {
      type: String,
      enum: ["open", "closed"],
      default: "open",
      index: true,
    },
    closed_at: { type: Date, default: null },
    close_backup_id: { type: String, default: "" },
  },
  { timestamps: true, id: false },
);

financialYearSchema.index({ user_id: 1, start_year: 1 }, { unique: true });
financialYearSchema.index({ user_id: 1, status: 1, start_year: -1 });

export default mongoose.model("FinancialYear", financialYearSchema);
