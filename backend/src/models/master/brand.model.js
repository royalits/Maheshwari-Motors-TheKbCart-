import mongoose from "mongoose";

const discountFieldSchema = new mongoose.Schema(
  {
    normal: { type: Number, default: 0, min: 0 },
    special: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const brandSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, required: true, trim: true },
    discount1: { type: discountFieldSchema, default: () => ({}) },
    discount2: { type: discountFieldSchema, default: () => ({}) },
    item_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Item",
      },
    ],
    hsn_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hsn",
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, id: false },
);

brandSchema.index({ name: 1, user_id: 1 });
brandSchema.index({ id: 1, user_id: 1 });

export default mongoose.model("Brand", brandSchema);
