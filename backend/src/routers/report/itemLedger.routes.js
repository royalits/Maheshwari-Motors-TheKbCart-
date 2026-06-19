import { Router } from "express";
import itemLedgerController from "../../controllers/report/itemLedger.controller.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

router.get("/items", itemLedgerController.getItems);
router.get("/movement/:itemId", itemLedgerController.getItemMovement);
router.get("/summary", itemLedgerController.getItemSummary);

export default router;
