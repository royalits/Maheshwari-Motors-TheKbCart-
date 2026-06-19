import { asyncHandler } from "../utils/index.js";
import financialYearService from "../services/common/financialYear.service.js";

export const resolveFinancialYear = asyncHandler(async (req, res, next) => {
  if (!req.user?._id) return next();

  const headerYearId =
    req.headers["x-financial-year-id"] ||
    req.headers["x-financial-year"] ||
    req.query?.financial_year_id;

  const financialYear = await financialYearService.resolveYear(
    req.user._id,
    headerYearId,
  );

  req.financialYear = financialYear;
  req.financialYearId = financialYear?._id || null;

  if (["POST", "PUT", "PATCH"].includes(req.method) && req.body) {
    req.body = financialYearService.normalizeEntryPayloadDates(
      req.body,
      financialYear,
      { defaultDate: req.method === "POST" },
    );
  }

  next();
});

export default resolveFinancialYear;
