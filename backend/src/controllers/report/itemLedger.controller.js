import itemLedgerService from "../../services/report/itemLedger.service.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ItemLedgerController {
  _withFinancialYear(query = {}, req) {
    return req.financialYearId
      ? { ...query, financial_year_id: req.financialYearId }
      : { ...query };
  }

  getItems = asyncHandler(async (req, res) => {
    const result = await itemLedgerService.getItems(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Items fetched successfully"));
  });

  getItemMovement = asyncHandler(async (req, res) => {
    const result = await itemLedgerService.getItemMovement(
      req.params.itemId,
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Item movement fetched successfully"));
  });

  getItemSummary = asyncHandler(async (req, res) => {
    const result = await itemLedgerService.getItemSummary(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Item summary fetched successfully"));
  });
}

const itemLedgerController = new ItemLedgerController();
export default itemLedgerController;
