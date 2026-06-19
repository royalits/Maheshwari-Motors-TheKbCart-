import mongoose from "mongoose";

const collectionSummarySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    records: { type: Number, default: 0 },
  },
  { _id: false },
);

const platformBackupSchema = new mongoose.Schema(
  {
    backup_no: { type: String, required: true, unique: true, index: true },
    status: {
      type: String,
      enum: ["running", "success", "failed", "restoring"],
      default: "running",
      index: true,
    },
    database_name: { type: String, default: "" },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    restored_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    restored_at: { type: Date, default: null },
    total_collections: { type: Number, default: 0 },
    total_records: { type: Number, default: 0 },
    size_bytes: { type: Number, default: 0 },
    chunk_count: { type: Number, default: 0 },
    collections: [collectionSummarySchema],
    error_message: { type: String, default: "" },
  },
  { timestamps: true },
);

export default mongoose.model("PlatformBackup", platformBackupSchema);
