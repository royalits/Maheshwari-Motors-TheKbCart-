import { Router } from "express";
import multer from "multer";
import * as adminController from "../../controllers/auth/admin.controller.js";
import platformBackupController from "../../controllers/backup/platformBackup.controller.js";
import authMiddleware, {
  requireAdmin,
} from "../../middlewares/auth.middleware.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only image files are allowed for signature"), false);
    }
  },
});

router.use(authMiddleware);
router.use(requireAdmin);

router.get("/users", adminController.getSecondaryUsers);
router.post("/users", adminController.createSecondaryUser);
router.get("/users/:userId", adminController.getSecondaryUserById);
router.put("/users/:userId", adminController.updateSecondaryUser);
router.get("/users/:userId/backup", adminController.downloadUserBackup);
router.delete("/users/:userId", adminController.deleteSecondaryUser);
router.post(
  "/users/:userId/deactivate",
  adminController.deactivateSecondaryUser,
);
router.post(
  "/users/:userId/reactivate",
  adminController.reactivateSecondaryUser,
);

router.get(
  "/users/:userId/signature",
  adminController.getSignature,
);
router.post(
  "/users/:userId/signature",
  upload.single("signature"),
  adminController.uploadSignature,
);
router.put(
  "/users/:userId/signature",
  upload.single("signature"),
  adminController.updateSignature,
);

router.get("/subscriptions", adminController.getSubscriptions);
router.get("/roles", adminController.getRoles);
router.get("/subscriptions/expiring-today", adminController.getExpiringToday);
router.post("/subscriptions/expire-check", adminController.runExpiryCheck);
router.post("/subscriptions", adminController.setSubscription);
router.get("/subscriptions/:userId", adminController.getSubscriptionByUserId);
router.put("/subscriptions/:userId", adminController.setSubscription);

router.get("/platform-backups", platformBackupController.listBackups);
router.post("/platform-backups", platformBackupController.createBackup);
router.get(
  "/platform-backups/:backupId/download",
  platformBackupController.downloadBackup,
);
router.post(
  "/platform-backups/:backupId/restore",
  platformBackupController.restoreBackup,
);
router.delete(
  "/platform-backups/:backupId",
  platformBackupController.deleteBackup,
);

router.get("/login-branding", adminController.getLoginBranding);
router.put("/login-branding", adminController.updateLoginBranding);

export default router;
