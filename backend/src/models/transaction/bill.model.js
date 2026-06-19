import mongoose from "mongoose";

const paymentEntrySchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true, min: 0 },
    payment_type: {
      type: String,
      enum: [
        "bank_transaction_received_amount",
        "cash_payment_received_amount",
        "bank_transfer_payment_given",
        "cash_payment_given",
      ],
      required: true,
    },
    bank_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
      default: null,
    },
    reference_no: { type: String, default: "" },
    note: { type: String, default: "" },
    settled_to: {
      type: String,
      enum: ["bill", "unsettled_balance"],
      default: "bill",
    },
    date: { type: Date, default: Date.now },
    transaction_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      default: null,
    },
  },
  { _id: false },
);

const autoBillItemSchema = new mongoose.Schema(
  {
    source_challan_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Challan",
      default: null,
    },
    item_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Item",
      required: true,
    },
    quantity: { type: Number, default: 1 },
    rate: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    special_discount: { type: Number, default: 0 },
    item_discount: { type: Number, default: 0 },
    item_dis2: { type: Number, default: 0 },
    dis3: { type: Number, default: 0 },
    gross_amount: { type: Number, required: true },
    discount_amount: { type: Number, default: 0 },
    total_discount: { type: Number, default: 0 },
    taxable_amount: { type: Number, required: true },
    gst_percent: { type: Number, default: 0 },
    gst_amount: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    is_gst: { type: Number, enum: [0, 1], default: 1 },
  },
  { _id: false },
);

const billSchema = new mongoose.Schema(
  {
    id: { type: Number },
    bill_no: { type: String, required: true },
    date: { type: Date, required: true, default: Date.now },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      required: true,
    },
    contact_type: {
      type: String,
      enum: ["party", "supplier", "book"],
      required: true,
      default: "party",
    },
    transport_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
    },
    customer_name: { type: String, default: "" },
    vehicle_number: { type: String, default: "" },
    transport_charge: { type: Number, default: 0 },
    amount: { type: Number, required: true },
    paid_amount: { type: Number, default: 0 },
    return_amount: { type: Number, default: 0 },
    settlement_discount: { type: Number, default: 0 },
    payment_status: {
      type: String,
      enum: ["due", "paid", "overpaid"],
      default: "due",
    },
    payment_entries: { type: [paymentEntrySchema], default: [] },
    challan_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Challan" }],
    is_auto_bill: { type: Boolean, default: false },
    auto_bill_rule_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AutoBill",
      default: null,
    },
    auto_bill_items: { type: [autoBillItemSchema], default: [] },

    skip_stock_calculation: { type: Boolean, default: false },

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

billSchema.virtual("balance").get(function () {
  return this.amount - this.paid_amount - (this.settlement_discount || 0);
});

billSchema.set("toJSON", { virtuals: true });
billSchema.set("toObject", { virtuals: true });

billSchema.index(
  {
    bill_no: 1,
    user_id: 1,
    is_gst: 1,
    contact_id: 1,
    financial_year_id: 1,
  },
  { unique: true, name: "bill_no_contact_fy_unique" },
);
billSchema.index({ user_id: 1, financial_year_id: 1, is_gst: 1 });

export default mongoose.model("Bill", billSchema);
