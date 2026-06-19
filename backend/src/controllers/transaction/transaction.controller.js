import { transactionService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class TransactionController {
  _withFinancialYear(query = {}, req) {
    return req.financialYearId
      ? { ...query, financial_year_id: req.financialYearId }
      : { ...query };
  }

  _bodyWithFinancialYear(body = {}, req) {
    return req.financialYearId
      ? { ...body, financial_year_id: req.financialYearId }
      : { ...body };
  }

  getTransactions = asyncHandler(async (req, res) => {
    const result = await transactionService.getTransactions(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Transactions fetched successfully"));
  });

  getTransactionById = asyncHandler(async (req, res) => {
    const doc = await transactionService.getTransactionById(
      req.params.transactionId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, doc, "Transaction fetched successfully"));
  });

  createTransaction = asyncHandler(async (req, res) => {
    const doc = await transactionService.createTransaction(
      this._bodyWithFinancialYear(req.body, req),
      req.user._id,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, doc, "Transaction created successfully"));
  });

  updateTransaction = asyncHandler(async (req, res) => {
    const doc = await transactionService.updateTransaction(
      req.params.transactionId,
      this._bodyWithFinancialYear(req.body, req),
      req.user._id,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, doc, "Transaction updated successfully"));
  });

  deleteTransaction = asyncHandler(async (req, res) => {
    await transactionService.deleteTransaction(
      req.params.transactionId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Transaction deleted successfully"));
  });

  getBookSummary = asyncHandler(async (req, res) => {
    const result = await transactionService.getBookSummary(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Book summary fetched successfully"));
  });

  getLastPayment = asyncHandler(async (req, res) => {
    const result = await transactionService.getLastPayment(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Last payment fetched successfully"));
  });
}

const transactionController = new TransactionController();

export const getTransactions = transactionController.getTransactions;
export const getTransactionById = transactionController.getTransactionById;
export const createTransaction = transactionController.createTransaction;
export const updateTransaction = transactionController.updateTransaction;
export const deleteTransaction = transactionController.deleteTransaction;
export const getBookSummary = transactionController.getBookSummary;
export const getLastPayment = transactionController.getLastPayment;
