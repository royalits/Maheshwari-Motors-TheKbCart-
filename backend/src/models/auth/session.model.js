import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    role: {
      type: String,
      enum: ["admin", "firm"],
      required: true,
    },

    firm_type: {
      type: String,
      enum: ["GST", "NON_GST"],
    },

    firm_role: {
      type: String,
      enum: ["admin", "account", "sales", "client", "accountant", "salesman"],
    },
    credential_key: {
      type: String,
      enum: [
        "gst_firm",
        "nongst_firm",
        "sale_user",
        "account_user",
        "client_user",
        // Temporary aliases to avoid crashing on existing historical sessions.
        "gst_user",
        "nongst_user",
      ],
    },

    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Contact",
      default: null,
    },

    token: { type: String, required: true, unique: true },
    device_name: { type: String, default: "Unknown Device" },
    device_type: {
      type: String,
      enum: ["android", "ios", "web", "desktop", "unknown"],
      default: "unknown",
    },
    ip_address: { type: String, default: "" },
    last_active: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

sessionSchema.index({ user_id: 1, createdAt: -1 });

export default mongoose.model("Session", sessionSchema);
