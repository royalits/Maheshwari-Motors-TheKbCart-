import { Router } from "express";
import { reportController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
import { requireReportAccess } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);
router.use(requireReportAccess);

router.get("/purchase", reportController.getPurchaseReport);
router.get("/purchase/details", reportController.getPurchaseDetails);
router.get("/sales", reportController.getSalesReport);
router.get("/sales/details", reportController.getSalesDetails);
router.get("/collection", reportController.getCollectionReport);
router.get("/account-ledger", reportController.getAccountLedger);
router.get("/gst-dashboard", reportController.getGstDashboard);
router.get("/gst-report", reportController.getGstReport);

export default router;
