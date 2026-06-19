import { asyncHandler, ApiResponse } from "../../utils/index.js";
import setupService from "../../services/setup/setup.service.js";

class SetupController {
  importData = asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "File is required"));
      return;
    }
    const job = await setupService.importData(req.file, req.user._id);
    res
      .status(202)
      .json(
        new ApiResponse(
          202,
          job,
          "Import started. Use progress endpoint to track status.",
        ),
      );
  });

  importFromBackup = asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "Backup file is required"));
      return;
    }
    const job = await setupService.importFromBackup(req.file, req.user._id);
    res
      .status(202)
      .json(
        new ApiResponse(
          202,
          job,
          "Backup import started. Importing all collections...",
        ),
      );
  });

  importExcel = asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "File is required"));
      return;
    }
    
    // Auto-detect file type: backup vs stock items
    const isBackup = await setupService.isBackupFile(req.file);
    const job = isBackup 
      ? await setupService.importFromBackup(req.file, req.user._id)
      : await setupService.importData(req.file, req.user._id);
    
    const message = isBackup 
      ? "Backup import started. Importing all collections..."
      : "Stock items import started. Use progress endpoint to track status.";
    
    res
      .status(202)
      .json(
        new ApiResponse(
          202,
          job,
          message,
        ),
      );
  });

  getImportProgress = asyncHandler(async (req, res) => {
    const job = setupService.getImportProgress(req.params.jobId, req.user._id);
    if (!job) {
      res.status(404).json(new ApiResponse(404, null, "Import job not found"));
      return;
    }
    res.status(200).json(new ApiResponse(200, job, "Import progress fetched"));
  });

  downloadImportReport = asyncHandler(async (req, res) => {
    const report = setupService.getImportReport(req.params.jobId, req.user._id);
    if (!report) {
      res
        .status(404)
        .json(new ApiResponse(404, null, "Report not found"));
      return;
    }
    res.download(report.path, report.filename);
  });

  downloadTemplate = asyncHandler(async (_req, res) => {
    const { buffer, filename } = await setupService.generateTemplate();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  });

  restoreDatabase = asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json(new ApiResponse(400, null, "File is required"));
      return;
    }
    const result = await setupService.restoreDatabase(req.file, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Restore uploaded"));
  });

  exportData = asyncHandler(async (req, res) => {
    const { buffer, filename } = await setupService.exportData(req.user._id);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(buffer);
  });

  closeFinancialYear = asyncHandler(async (req, res) => {
    const result = await setupService.closeFinancialYearNow(
      req.body || {},
      req.user._id,
    );
    const message =
      result?.skipped ?
        `Financial year close skipped: ${result.reason}`
      : "Financial year closed successfully";
    res.status(200).json(new ApiResponse(200, result, message));
  });
}

const setupController = new SetupController();

export default setupController;
