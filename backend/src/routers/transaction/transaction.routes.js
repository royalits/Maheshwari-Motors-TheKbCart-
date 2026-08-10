import { Router } from "express";
import { transactionController } from "../../controllers/index.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
} from "../../middlewares/index.js";
router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

router.get("/", transactionController.getTransactions);
router.get("/summary", transactionController.getBookSummary);
router.get("/last-payment", transactionController.getLastPayment);
router.get("/unsettled/:contactId", transactionController.getUnsettledTransactions);
router.post("/", requirePermission("create"), transactionController.createTransaction);
router.get("/:transactionId", transactionController.getTransactionById);
router.put("/:transactionId", requirePermission("update"), transactionController.updateTransaction);
router.delete("/:transactionId", requirePermission("delete"), transactionController.deleteTransaction);

export default router;
