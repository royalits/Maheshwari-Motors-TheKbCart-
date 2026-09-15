import { dashboardService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

const withFinancialYear = (query = {}, req) =>
  req.financialYearId
    ? { ...query, financial_year_id: req.financialYearId }
    : { ...query };

export const getDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getDashboard(
    req.user._id,
    req.isGst,
    req.financialYearId,
    req.query,
  );
  res
    .status(200)
    .json(new ApiResponse(200, data, "Dashboard data fetched successfully"));
});

export const getFirmDashboard = asyncHandler(async (req, res) => {
  const data = await dashboardService.getFirmDashboard(
    req.user._id,
    req.isGst,
    req.query.period,
    withFinancialYear(req.query, req),
  );
  res
    .status(200)
    .json(
      new ApiResponse(200, data, "Firm dashboard data fetched successfully"),
    );
});
