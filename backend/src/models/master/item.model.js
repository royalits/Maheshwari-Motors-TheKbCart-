import mongoose from "mongoose";

const itemSchema = new mongoose.Schema(
  {
    id: { type: Number },
    item_name: { type: String, required: true },
    barcode: {
      type: String,
      trim: true,
    },
    item_id: {
      type: String,
      trim: true,
    },
    alias: { type: String, trim: true },
    description: { type: String, trim: true },
    sale_rate: { type: Number, required: true },
    purchase_rate: { type: Number, default: 0 },
    mrp_rate: { type: Number, default: 0 },
    gst_percent: { type: Number, default: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    physical_stock: { type: Number, default: 0 },
    logical_stock: { type: Number, default: 0 },
    opening_physical_stock: { type: Number, default: 0 },
    opening_logical_stock: { type: Number, default: 0 },
    threshold: { type: Number, default: 0 },
    image: { type: String },
    is_gst: { type: Number, enum: [0, 1], default: 1 },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    brand_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Brand",
    },
    dept_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
    },
    hsn_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hsn",
    },
  },
  { timestamps: true, id: false },
);

itemSchema.index({ id: 1, user_id: 1 });
itemSchema.index({ barcode: 1, user_id: 1 }, { unique: true, sparse: true });
itemSchema.index({ item_id: 1, user_id: 1 }, { unique: true, sparse: true });

const ItemModel = mongoose.model("Item", itemSchema);

// Safely drop legacy single-field global indexes if present in database
ItemModel.collection.dropIndex("barcode_1").catch(() => {});
ItemModel.collection.dropIndex("item_id_1").catch(() => {});

export default ItemModel;
