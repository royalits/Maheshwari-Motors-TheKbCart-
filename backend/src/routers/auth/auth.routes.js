import { Router } from "express";
import multer from "multer";
import { authController } from "../../controllers/index.js";
import authMiddleware from "../../middlewares/auth.middleware.js";

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

router.post("/admin/register", authController.registerMainUser);
router.post("/login", authController.login);

router.use(authMiddleware);

router.post("/logout", authController.logout);
router.get("/me", authController.getProfile);
router.put("/change-password", authController.changePassword);
router.put("/credentials", authController.updateCredentials);

router.get("/sessions", authController.getSessions);
router.delete("/sessions/:sessionId", authController.revokeSession);
router.delete("/sessions", authController.revokeAllOtherSessions);

router.get("/signature", authController.getSignature);
router.post(
  "/signature",
  upload.single("signature"),
  authController.uploadSignature,
);
router.put(
  "/signature",
  upload.single("signature"),
  authController.updateSignature,
);
router.put("/cash-opening-balance", authController.updateCashOpeningBalance);

export default router;
