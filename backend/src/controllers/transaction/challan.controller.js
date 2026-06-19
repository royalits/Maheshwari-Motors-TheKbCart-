import { challanService } from "../../services/index.js";
import { asyncHandler, ApiError, ApiResponse } from "../../utils/index.js";

class ChallanController {
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

  _validateItemQuantities(items, context = "items") {
    if (!Array.isArray(items)) return;

    items.forEach((item, index) => {
      if (!item || typeof item !== "object") return;

      const rawQuantity = item.quantity ?? item.pcs;
      if (
        rawQuantity === undefined ||
        rawQuantity === null ||
        rawQuantity === ""
      ) {
        return;
      }

      // const quantity = Number(rawQuantity);
      // if (!Number.isFinite(quantity) || quantity < 1) {
      //   throw ApiError.badRequest(
      //     `${context}[${index}].quantity must be greater than or equal to 1`,
      //   );
      // }
    });
  }

  getAllChallans = asyncHandler(async (req, res) => {
    const result = await challanService.getChallans(
      req.user._id,
      req.isGst,
      null,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Challans fetched successfully"));
  });

  getChallans = asyncHandler(async (req, res) => {
    const challanType = req.params.challanType;
    const result = await challanService.getChallans(
      req.user._id,
      req.isGst,
      challanType,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          `${challanType} challans fetched successfully`,
        ),
      );
  });

  getChallanById = asyncHandler(async (req, res) => {
    const challan = await challanService.getChallanById(
      req.params.challanId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, challan, "Challan fetched successfully"));
  });

  createChallan = asyncHandler(async (req, res) => {
    const { challan_type, ...challanData } = req.body;
    if (!challan_type || !["sale", "purchase"].includes(challan_type)) {
      throw ApiError.badRequest(
        "challan_type is required and must be either 'sale' or 'purchase'",
      );
    }

    this._validateItemQuantities(challanData.items, "items");

    const challan = await challanService.createChallan(
      this._bodyWithFinancialYear(challanData, req),
      req.user._id,
      req.isGst,
      challan_type,
    );
    const resolvedChallanType = challan?.challan_type || challan_type;
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          challan,
          `${resolvedChallanType} challan created successfully`,
        ),
      );
  });

  updateChallan = asyncHandler(async (req, res) => {
    this._validateItemQuantities(req.body?.items, "items");

    const challan = await challanService.updateChallan(
      req.params.challanId,
      req.user._id,
      req.isGst,
      this._bodyWithFinancialYear(req.body, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, challan, "Challan updated successfully"));
  });

  deleteChallan = asyncHandler(async (req, res) => {
    await challanService.deleteChallan(
      req.params.challanId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Challan deleted successfully"));
  });

  getUnconvertedChallansForContact = asyncHandler(async (req, res) => {
    const challans = await challanService.getUnconvertedChallansForContact(
      req.params.contactId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, challans, "Challans fetched successfully"));
  });

  getLastSoldItem = asyncHandler(async (req, res) => {
    const result = await challanService.getLastSoldItem(
      req.params.itemId,
      req.user._id,
      req.query.contact_id || null,
      req.financialYearId,
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Last sold item details fetched successfully",
        ),
      );
  });

  recordPayment = asyncHandler(async (req, res) => {
    const { amount } = req.body;
    const challan = await challanService.recordPayment(
      req.params.challanId,
      req.user._id,
      amount,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, challan, "Payment recorded successfully"));
  });

  checkChallanNoUnique = asyncHandler(async (req, res) => {
    const result = await challanService.checkChallanNoUnique(
      req.body.challan_no,
      req.isGst,
      req.body.challan_type || null,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Challan number check completed"));
  });
}

const challanController = new ChallanController();

export const getAllChallans = challanController.getAllChallans;
export const getChallans = challanController.getChallans;
export const getChallanById = challanController.getChallanById;
export const createChallan = challanController.createChallan;
export const updateChallan = challanController.updateChallan;
export const deleteChallan = challanController.deleteChallan;
export const getUnconvertedChallansForContact =
  challanController.getUnconvertedChallansForContact;
export const getLastSoldItem = challanController.getLastSoldItem;
export const recordPayment = challanController.recordPayment;
export const checkChallanNoUnique = challanController.checkChallanNoUnique;

export default challanController;
