import mongoose from "mongoose";

const agentSchema = new mongoose.Schema(
  {
    id: { type: Number },
    name: { type: String, required: true, trim: true },
    address: { type: String },
    city: { type: String },
    pincode: { type: String },
    phone: { type: String },
    whatsapp: { type: String },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  { timestamps: true, id: false },
);

agentSchema.index({ id: 1, user_id: 1 });
agentSchema.index({ name: 1, user_id: 1 });

export default mongoose.model("Agent", agentSchema);
