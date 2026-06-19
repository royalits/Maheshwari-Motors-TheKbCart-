import { Router } from "express";
import { returnController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
import { requirePermission } from "../../middlewares/permission.middleware.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

router.get("/", returnController.getReturns);
router.get("/summary", returnController.getReturnSummary);
router.post("/sale", requirePermission("create"), returnController.createSaleReturn);
router.post("/purchase", requirePermission("create"), returnController.createPurchaseReturn);
router.get("/bill/:billId", returnController.getReturnsForBill);
router.get("/challan/:challanId", returnController.getReturnsForChallan);
router.get("/:returnId", returnController.getReturnById);
router.delete("/:returnId", requirePermission("delete"), returnController.deleteReturn);

export default router;
