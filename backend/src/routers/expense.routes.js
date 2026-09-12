import { Router } from "express";
import expenseCategoryController from "../controllers/master/expenseCategory.controller.js";
import expenseController from "../controllers/transaction/expense.controller.js";
import {
  authMiddleware,
  requireFirm,
  resolveFinancialYear,
  requirePermission,
} from "../middlewares/index.js";

const router = Router();

router.use(authMiddleware);
router.use(requireFirm);
router.use(resolveFinancialYear);

// Expense Category Routes
router.get("/categories", expenseCategoryController.getCategories);
router.post(
  "/categories",
  requirePermission("create"),
  expenseCategoryController.createCategory,
);
router.get("/categories/:categoryId", expenseCategoryController.getCategoryById);
router.put(
  "/categories/:categoryId",
  requirePermission("update"),
  expenseCategoryController.updateCategory,
);
router.delete(
  "/categories/:categoryId",
  requirePermission("delete"),
  expenseCategoryController.deleteCategory,
);

// Expense Report Analytics
router.get("/reports/summary", expenseController.getExpenseSummaryReport);

// Expense Voucher Entry Routes
router.get("/", expenseController.getExpenses);
router.post("/", requirePermission("create"), expenseController.createExpense);
router.get("/:expenseId", expenseController.getExpenseById);
router.put(
  "/:expenseId",
  requirePermission("update"),
  expenseController.updateExpense,
);
router.delete(
  "/:expenseId",
  requirePermission("delete"),
  expenseController.deleteExpense,
);

export default router;
