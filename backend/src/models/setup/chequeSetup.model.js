import mongoose from "mongoose";

const fieldSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    top: { type: Number, default: 0 },
    left: { type: Number, default: 0 },
    enabled: { type: Boolean, default: true },
  },
  { _id: false },
);

const chequeSetupSchema = new mongoose.Schema(
  {
    bank_id: { type: mongoose.Schema.Types.ObjectId, ref: "Bank", required: true },
    disp_caption: { type: String, trim: true, default: "" },
    cheque_width: { type: Number, default: 800 },
    cheque_height: { type: Number, default: 280 },
    fields: { type: [fieldSchema], default: [] },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

chequeSetupSchema.index({ bank_id: 1, user_id: 1 }, { unique: true });

export default mongoose.model("ChequeSetup", chequeSetupSchema);
