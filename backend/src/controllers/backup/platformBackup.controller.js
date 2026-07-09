import platformBackupService from "../../services/backup/platformBackup.service.js";
import { ApiResponse, asyncHandler } from "../../utils/index.js";

class PlatformBackupController {
  listBackups = asyncHandler(async (_req, res) => {
    const backups = await platformBackupService.listBackups();
    res
      .status(200)
      .json(new ApiResponse(200, backups, "Platform backups fetched"));
  });

  createBackup = asyncHandler(async (req, res) => {
    const backup = await platformBackupService.createBackup(req.user._id);
    res
      .status(201)
      .json(new ApiResponse(201, backup, "Platform backup created"));
  });

  restoreBackup = asyncHandler(async (req, res) => {
    const backup = await platformBackupService.restoreBackup(
      req.params.backupId,
      req.user._id,
      req.body?.confirm_backup_no,
    );
    res
      .status(200)
      .json(new ApiResponse(200, backup, "Platform backup restored"));
  });

  downloadBackup = asyncHandler(async (req, res) => {
    const { buffer, filename } = await platformBackupService.downloadBackup(
      req.params.backupId,
    );
    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
    res.setHeader("Content-Length", buffer.length);
    res.end(buffer);
  });

  deleteBackup = asyncHandler(async (req, res) => {
    const result = await platformBackupService.deleteBackup(
      req.params.backupId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Platform backup deleted"));
  });
}

export default new PlatformBackupController();

