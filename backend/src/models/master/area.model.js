import mongoose from "mongoose";

const areaSchema = new mongoose.Schema(
  {
    id: { type: Number },
    city: { type: String, required: true, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    phone: { type: String },
    whatsapp: { type: String },
    agent_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agent",
      default: null,
    },
    transport_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transport",
      default: null,
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

areaSchema.index({ id: 1, user_id: 1 });
areaSchema.index({ city: 1, user_id: 1 });

export default mongoose.model("Area", areaSchema);
