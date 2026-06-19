import mongoose from "mongoose";

const platformBackupChunkSchema = new mongoose.Schema(
  {
    backup_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PlatformBackup",
      required: true,
      index: true,
    },
    chunk_index: { type: Number, required: true },
    data: { type: Buffer, required: true },
  },
  { timestamps: true },
);

platformBackupChunkSchema.index(
  { backup_id: 1, chunk_index: 1 },
  { unique: true },
);

export default mongoose.model(
  "PlatformBackupChunk",
  platformBackupChunkSchema,
);
