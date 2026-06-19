import financialYearService from "../../services/common/financialYear.service.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class FinancialYearController {
  getYears = asyncHandler(async (req, res) => {
    const result = await financialYearService.getYears(req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Financial years fetched successfully"));
  });
}

const financialYearController = new FinancialYearController();

export default financialYearController;
