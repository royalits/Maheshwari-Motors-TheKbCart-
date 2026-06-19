import mongoose from "mongoose";

const returnItemSchema = new mongoose.Schema(
  {
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    rate: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0, max: 100 },
    special_discount: { type: Number, default: 0, min: 0, max: 100 },
    item_discount: { type: Number, default: 0, min: 0, max: 100 },
    item_dis2: { type: Number, default: 0, min: 0, max: 100 },
    dis3: { type: Number, default: 0, min: 0 },
    gross_amount: { type: Number, default: 0 },
    discount_amount: { type: Number, default: 0 },
    total_discount: { type: Number, default: 0 },
    gst_percent: { type: Number, default: 0, min: 0 },
    gst_amount: { type: Number, default: 0 },
    taxable_amount: { type: Number, required: true },
    amount: { type: Number, required: true },
    is_damaged: { type: Boolean, default: false },
    is_gst: { type: Number, enum: [0, 1], default: 1 },
  },
  { _id: false },
);

const returnSchema = new mongoose.Schema(
  {
    id: { type: Number },
    return_no: { type: String, required: true },
    return_type: {
      type: String,
      enum: ["sale_return", "purchase_return"],
      required: true,
    },
    date: { type: Date, required: true, default: Date.now },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    bill_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bill",
      default: null,
    },
    challan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challan",
      default: null,
    },
    items: { type: [returnItemSchema], default: [] },
    total_amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "" },

    is_gst: { type: Number, enum: [0, 1], required: true },

    financial_year_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FinancialYear",
      default: null,
      index: true,
    },

    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, id: false },
);

returnSchema.index({ return_no: 1, user_id: 1, is_gst: 1 }, { unique: true });
returnSchema.index({ bill_id: 1, user_id: 1 });
returnSchema.index({ challan_id: 1, user_id: 1 });
returnSchema.index({ contact_id: 1, user_id: 1 });
returnSchema.index({ user_id: 1, financial_year_id: 1, is_gst: 1 });

export default mongoose.model("Return", returnSchema);
