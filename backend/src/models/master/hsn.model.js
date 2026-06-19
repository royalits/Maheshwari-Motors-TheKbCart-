import mongoose from "mongoose";

const hsnSchema = new mongoose.Schema(
  {
    id: { type: Number },
    hsn_code: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    gst_rate: { type: Number, required: true, min: 0 },
    is_active: { type: Boolean, default: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, id: false },
);

hsnSchema.index({ id: 1, user_id: 1 });
hsnSchema.index({ hsn_code: 1, user_id: 1 });

export default mongoose.model("Hsn", hsnSchema);
