import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, required: true, trim: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, id: false },
);

departmentSchema.index({ id: 1, user_id: 1 });

export default mongoose.model("Department", departmentSchema);
