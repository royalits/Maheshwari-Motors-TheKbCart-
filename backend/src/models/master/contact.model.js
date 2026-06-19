import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, required: true },
    alias: { type: String, trim: true, default: null },
    type: {
      type: String,
      enum: ["party", "supplier", "book"],
      required: true,
    },
    phone: { type: String },
    whatsapp_number: { type: String },
    email: { type: String },
    address: { type: String },
    city: { type: String },
    state: { type: String },
    gstin: { type: String },
    cin: { type: String },
    reg_number: { type: String },
    label_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Label",
      },
    ],
    label_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Label",
      default: null,
    },
    bank_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bank",
      default: null,
    },
    transport_charge: { type: Number, default: 0 },
    area: { type: String },
    is_gst: { type: Number, enum: [0, 1] },
    transport_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
    },
    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },
    area_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Area",
      default: null,
    },
    balance: { type: Number, default: 0 },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, id: false },
);

contactSchema.index({ id: 1, user_id: 1 });
contactSchema.index({ type: 1, user_id: 1 });

export default mongoose.model("Contact", contactSchema);
