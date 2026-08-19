import { asyncHandler, ApiResponse } from "../../utils/index.js";
import backupService from "../../services/backup/backup.service.js";

class BackupController {
  getLogs = asyncHandler(async (req, res) => {
    const logs = await backupService.getLogs(req.user._id, req.isGst);
    res
      .status(200)
      .json(new ApiResponse(200, logs, "Backup logs fetched"));
  });

  createBackup = asyncHandler(async (req, res) => {
    const logEntry = await backupService.createBackup(req.user._id, {
      isGst: req.isGst,
    });
    res
      .status(201)
      .json(new ApiResponse(201, logEntry, "Backup created"));
  });

  uploadExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "No file uploaded"));
    }

    const fileBuffer = req.file.buffer;
    const originalName = req.file.originalname;

    // Validate file type
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Only Excel files (.xls, .xlsx, .xlsm) are allowed"));
    }

    const logEntry = await backupService.uploadExcelFile(
      req.user._id,
      fileBuffer,
      originalName,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, logEntry, "Excel file uploaded successfully"));
  });

  downloadBackup = asyncHandler(async (req, res) => {
    const { logId } = req.params;
    const { stream, buffer, filename, contentType } =
      await backupService.getBackupDownload(req.user._id, logId, req.isGst);

    res.setHeader(
      "Content-Type",
      contentType ||
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename || "backup.xlsx"}"`,
    );

    if (stream) {
      stream.pipe(res);
    } else if (buffer) {
      res.status(200).send(buffer);
    } else {
      res
        .status(404)
        .json(new ApiResponse(404, null, "Backup file not found in storage"));
    }
  });

  deleteLog = asyncHandler(async (req, res) => {
    const result = await backupService.deleteLog(
      req.user._id,
      req.params.logId,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Backup history deleted"));
  });

  deleteLogs = asyncHandler(async (req, res) => {
    const result = await backupService.deleteLogs(
      req.user._id,
      req.body?.log_ids,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Backup history deleted"));
  });
}

const backupController = new BackupController();

export default backupController;
