import { Router } from "express";
import { outstandingController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
import {
  requireOutstandingAccess,
  applyClientFilter,
} from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);
router.use(requireOutstandingAccess);

router.get("/", applyClientFilter, outstandingController.getContacts);
router.get("/:contactId/summary", outstandingController.getContactSummary);
router.get("/:contactId/bills", outstandingController.getContactBills);
router.get("/:contactId/history", outstandingController.getContactHistory);

export default router;
