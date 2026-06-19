import mongoose from "mongoose";

const roleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      enum: ["admin", "sales", "account", "client"],
      required: true,
      unique: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

export default mongoose.model("Role", roleSchema);
