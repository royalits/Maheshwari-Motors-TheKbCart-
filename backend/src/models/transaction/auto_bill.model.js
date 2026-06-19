import mongoose from "mongoose";

const autoBillSchema = mongoose.Schema({
  party_id: { type: mongoose.Schema.ObjectId, required: true },
  brand_ids: [{ type: mongoose.Schema.Types.ObjectId, ref: "Brand" }],
  label_id: { type: mongoose.Schema.Types.ObjectId, ref: "Label", default: null },
  from_date: { type: Date, required: true },
  to_date: { type: Date, required: true },
  amount: { type: Number, required: true, min: 1 },
  per_day_bill: { type: Number, default: 0, min: 0 },
  enabled: { type: Boolean, default: true, alias: "is_active" },
  last_billed_on: { type: Date, default: null },
  last_billed_date_key: { type: String, default: null },
  bills_created_today: { type: Number, default: 0 },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
});

autoBillSchema.set("strict", false);

const AutoBill = mongoose.model("AutoBill", autoBillSchema);

export default AutoBill;
