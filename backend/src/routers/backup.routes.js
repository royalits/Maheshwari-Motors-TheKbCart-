import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middlewares/index.js";
import backupController from "../controllers/backup/backup.controller.js";

const router = Router();

router.use(authMiddleware);

// Configure multer for Excel file uploads
const upload = multer({
  storage: multer.memoryStorage(), // Store in memory for S3 upload
  limits: { fileSize: 1024 * 1024 * 50 }, // 50MB limit
  fileFilter: (_req, file, cb) => {
    const allowedTypes = [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel.sheet.macroEnabled.12'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xls, .xlsx, .xlsm) are allowed'), false);
    }
  }
});

router.get("/logs", backupController.getLogs);
router.get("/logs/:logId/download", backupController.downloadBackup);
router.get("/download/:logId", backupController.downloadBackup);
router.delete("/logs", backupController.deleteLogs);
router.delete("/logs/:logId", backupController.deleteLog);
router.post("/create", backupController.createBackup);
router.post("/upload-excel", upload.single("file"), backupController.uploadExcel);

export default router;
