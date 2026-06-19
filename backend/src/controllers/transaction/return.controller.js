import { returnService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ReturnController {
  _withFinancialYear(query = {}, req) {
    return req.financialYearId ?
        { ...query, financial_year_id: req.financialYearId }
      : { ...query };
  }

  _bodyWithFinancialYear(body = {}, req) {
    return req.financialYearId ?
        { ...body, financial_year_id: req.financialYearId }
      : { ...body };
  }

  getReturns = asyncHandler(async (req, res) => {
    const result = await returnService.getReturns(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Returns fetched successfully"));
  });

  getReturnById = asyncHandler(async (req, res) => {
    const doc = await returnService.getReturnById(
      req.params.returnId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, doc, "Return fetched successfully"));
  });

  createSaleReturn = asyncHandler(async (req, res) => {
    const doc = await returnService.createSaleReturn(
      this._bodyWithFinancialYear(req.body, req),
      req.user._id,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, doc, "Sale return created successfully"));
  });

  createPurchaseReturn = asyncHandler(async (req, res) => {
    const doc = await returnService.createPurchaseReturn(
      this._bodyWithFinancialYear(req.body, req),
      req.user._id,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, doc, "Purchase return created successfully"));
  });

  getReturnsForBill = asyncHandler(async (req, res) => {
    const returns = await returnService.getReturnsForBill(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, returns, "Bill returns fetched successfully"));
  });

  getReturnsForChallan = asyncHandler(async (req, res) => {
    const returns = await returnService.getReturnsForChallan(
      req.params.challanId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, returns, "Challan returns fetched successfully"),
      );
  });

  getReturnSummary = asyncHandler(async (req, res) => {
    const result = await returnService.getReturnSummary(
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Return summary fetched successfully"),
      );
  });

  deleteReturn = asyncHandler(async (req, res) => {
    await returnService.deleteReturn(
      req.params.returnId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Return deleted successfully"));
  });
}

const returnController = new ReturnController();

export const getReturns = returnController.getReturns;
export const getReturnById = returnController.getReturnById;
export const createSaleReturn = returnController.createSaleReturn;
export const createPurchaseReturn = returnController.createPurchaseReturn;
export const getReturnsForBill = returnController.getReturnsForBill;
export const getReturnsForChallan = returnController.getReturnsForChallan;
export const getReturnSummary = returnController.getReturnSummary;
export const deleteReturn = returnController.deleteReturn;
