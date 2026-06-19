import mongoose from "mongoose";

const counterSchema = new mongoose.Schema(
  {
    model_name: { type: String, required: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seq: { type: Number, default: 0 },
  },
  { timestamps: false },
);

counterSchema.index({ model_name: 1, user_id: 1 }, { unique: true });

export default mongoose.model("Counter", counterSchema);
