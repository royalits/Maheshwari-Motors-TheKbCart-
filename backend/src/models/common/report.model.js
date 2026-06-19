import mongoose from "mongoose";

const reportSchema = new mongoose.Schema(
  {
    pdf_link: {
      type: String,
      required: true,
    },
    date_created: {
      type: Date,
      default: Date.now,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    is_gst: { type: Number, enum: [0, 1] },
    report_type: {
      type: String,
      enum: ["challan", "bill", "inventory", "transaction", "other"],
    },
  },
  {
    timestamps: true,
  },
);

export default mongoose.model("Report", reportSchema);
