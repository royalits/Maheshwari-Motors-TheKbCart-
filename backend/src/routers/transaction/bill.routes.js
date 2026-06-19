import { Router } from "express";
import multer from "multer";
import { billController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
import {
  requirePermission,
  applyClientFilter,
} from "../../middlewares/permission.middleware.js";

const router = Router();

const billScanUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 20 * 1024 * 1024,
    files: 8,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype?.startsWith("image/") ||
      file.mimetype === "application/pdf"
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only image and PDF files are allowed"), false);
    }
  },
});

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

router
  .route("/")
  .get(applyClientFilter, billController.getBills)
  .post(requirePermission("create"), billController.createBill);
router.post(
  "/scan",
  requirePermission("create"),
  billScanUpload.array("images", 8),
  billController.scanBillImages,
);
router.post(
  "/scan/stream",
  requirePermission("create"),
  billScanUpload.array("images", 8),
  billController.scanBillImagesStream,
);
router.post(
  "/scan/extract",
  requirePermission("create"),
  billScanUpload.array("images", 8),
  billController.extractBillImages,
);
router.post(
  "/scan/resolve",
  requirePermission("create"),
  billController.resolveBillScanItems,
);
router.get("/next-number", billController.getNextBillNo);
router.get("/summary", billController.getBillSummary);

router
  .route("/:billId")
  .get(billController.getBillById)
  .put(requirePermission("update"), billController.updateBill)
  .delete(requirePermission("delete"), billController.deleteBill);

router.post(
  "/batch-convert",
  requirePermission("create"),
  billController.batchConvert,
);
router.post("/check-bill-no", billController.checkBillNoUnique);
router.post(
  "/settlements",
  requirePermission("create"),
  billController.settleBills,
);
router.get("/item/:itemId/last-sold", billController.getLastSoldItem);
router.get(
  "/status/:status",
  applyClientFilter,
  billController.getBillsByStatus,
);
router.get(
  "/contact/:contactId",
  applyClientFilter,
  billController.getBillsForContact,
);
router.post(
  "/:billId/payment",
  requirePermission("create"),
  billController.recordPayment,
);
router.post(
  "/:billId/undo-settlement",
  requirePermission("delete"),
  billController.undoSettlement,
);
router.post(
  "/:billId/return",
  requirePermission("create"),
  billController.handleReturn,
);

export default router;
