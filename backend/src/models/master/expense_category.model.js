import mongoose from "mongoose";

const expenseCategorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true },
);

expenseCategorySchema.index({ name: 1, user_id: 1 }, { unique: true });
expenseCategorySchema.index({ user_id: 1, is_active: 1 });

export default mongoose.model("ExpenseCategory", expenseCategorySchema);
