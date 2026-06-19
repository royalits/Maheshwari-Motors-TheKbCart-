import { Router } from "express";
import multer from "multer";
import path from "path";
import os from "os";
import fs from "fs";
import { authMiddleware } from "../middlewares/index.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import setupController from "../controllers/setup/setup.controller.js";
import chequeSetupController from "../controllers/setup/chequeSetup.controller.js";

const router = Router();

router.use(authMiddleware);

const uploadDir = path.join(os.tmpdir(), "mm-imports");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) =>
      cb(null, `${Date.now()}-${file.originalname}`),
  }),
  limits: { fileSize: 1024 * 1024 * 200 }, // 200MB
});

router.get("/import/template", setupController.downloadTemplate);
router.post("/import", upload.single("file"), setupController.importExcel);
router.post("/import-backup", upload.single("file"), setupController.importFromBackup);
router.get("/import/progress/:jobId", setupController.getImportProgress);
router.get("/import/report/:jobId", setupController.downloadImportReport);
router.post("/restore", upload.single("file"), setupController.restoreDatabase);
router.get("/export", setupController.exportData);
router.post(
  "/financial-year/close",
  requirePermission("setup"),
  setupController.closeFinancialYear,
);

// Cheque Print Setup
router.get("/cheque-setup", chequeSetupController.getAll);
router.get("/cheque-setup/:bankId", chequeSetupController.getByBank);
router.put("/cheque-setup/:bankId", chequeSetupController.upsert);
router.delete("/cheque-setup/:bankId", chequeSetupController.remove);

export default router;
