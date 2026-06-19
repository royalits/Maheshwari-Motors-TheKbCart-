import { reportService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

const withFinancialYear = (query = {}, req) =>
  req.financialYearId
    ? { ...query, financial_year_id: req.financialYearId }
    : { ...query };

export const getPurchaseReport = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseReport(
    req.user._id,
    req.isGst,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Purchase report fetched successfully"));
});

export const getPurchaseDetails = asyncHandler(async (req, res) => {
  const result = await reportService.getPurchaseDetails(
    req.user._id,
    req.isGst,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(
      new ApiResponse(200, result, "Purchase details fetched successfully"),
    );
});

export const getSalesReport = asyncHandler(async (req, res) => {
  const result = await reportService.getSalesReport(
    req.user._id,
    req.isGst,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Sales report fetched successfully"));
});

export const getSalesDetails = asyncHandler(async (req, res) => {
  const result = await reportService.getSalesDetails(
    req.user._id,
    req.isGst,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Sales details fetched successfully"));
});

export const getCollectionReport = asyncHandler(async (req, res) => {
  const result = await reportService.getCollectionReport(
    req.user._id,
    req.isGst,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(
      new ApiResponse(200, result, "Collection report fetched successfully"),
    );
});

export const getAccountLedger = asyncHandler(async (req, res) => {
  const result = await reportService.getAccountLedger(
    req.user._id,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "Account ledger fetched successfully"));
});

export const getGstDashboard = asyncHandler(async (req, res) => {
  const result = await reportService.getGstDashboard(
    req.user._id,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "GST dashboard fetched successfully"));
});

export const getGstReport = asyncHandler(async (req, res) => {
  const result = await reportService.getGstReport(
    req.user._id,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(new ApiResponse(200, result, "GST report fetched successfully"));
});
