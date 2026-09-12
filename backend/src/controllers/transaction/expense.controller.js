import expenseService from "../../services/transaction/expense.service.js";
import expenseReportService from "../../services/report/expenseReport.service.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ExpenseController {
  getExpenses = asyncHandler(async (req, res) => {
    const expenses = await expenseService.getExpenses(
      req.user._id,
      req.isGst,
      req.financialYearId,
      req.query,
    );
    res
      .status(200)
      .json(new ApiResponse(200, expenses, "Expense entries fetched successfully"));
  });

  getExpenseById = asyncHandler(async (req, res) => {
    const expense = await expenseService.getExpenseById(
      req.params.expenseId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, expense, "Expense entry fetched successfully"));
  });

  createExpense = asyncHandler(async (req, res) => {
    const expense = await expenseService.createExpense(
      req.body,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(201)
      .json(new ApiResponse(201, expense, "Expense entry created successfully"));
  });

  updateExpense = asyncHandler(async (req, res) => {
    const expense = await expenseService.updateExpense(
      req.params.expenseId,
      req.body,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, expense, "Expense entry updated successfully"));
  });

  deleteExpense = asyncHandler(async (req, res) => {
    await expenseService.deleteExpense(req.params.expenseId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Expense entry deleted successfully"));
  });

  getExpenseSummaryReport = asyncHandler(async (req, res) => {
    const report = await expenseReportService.getExpenseSummaryReport(
      req.user._id,
      req.isGst,
      req.financialYearId,
      req.query,
    );
    res
      .status(200)
      .json(new ApiResponse(200, report, "Expense report fetched successfully"));
  });
}

export default new ExpenseController();
