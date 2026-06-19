import mongoose from "mongoose";

const discountFieldSchema = new mongoose.Schema(
  {
    normal: { type: Number, default: 0, min: 0 },
    special: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const itemDiscountSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    discount: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const labelBrandDiscountSchema = new mongoose.Schema(
  {
    brand_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
      required: true,
    },
    disc1: { type: discountFieldSchema, default: () => ({}) },
    disc2: { type: discountFieldSchema, default: () => ({}) },
    item_discounts: { type: [itemDiscountSchema], default: [] },
  },
  { _id: false },
);

const labelSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: "" },
    is_active: { type: Boolean, default: true },
    brand_discounts: { type: [labelBrandDiscountSchema], default: [] },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, id: false },
);

labelSchema.index({ id: 1, user_id: 1 });
labelSchema.index({ name: 1, user_id: 1 });
labelSchema.index({ "brand_discounts.brand_id": 1, user_id: 1 });

export default mongoose.model("Label", labelSchema);
