import outstandingService from "../../services/report/outstanding.service.js";
import { asyncHandler, ApiResponse, ApiError } from "../../utils/index.js";

class OutstandingController {
  _withFinancialYear(query = {}, req) {
    return req.financialYearId
      ? { ...query, financial_year_id: req.financialYearId }
      : { ...query };
  }

  getContacts = asyncHandler(async (req, res) => {
    // Apply client filter if exists
    const query = this._withFinancialYear(
      req.clientFilter ? { ...req.query, ...req.clientFilter } : req.query,
      req,
    );
    
    const result = await outstandingService.getContacts(
      req.user._id,
      req.isGst,
      query,
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Outstanding contacts fetched successfully",
        ),
      );
  });

  getContactSummary = asyncHandler(async (req, res) => {
    // Client role: Only allow viewing their own contact
    if (req.role === "firm" && req.firmRole === "client" && req.contactId) {
      if (req.params.contactId !== req.contactId.toString()) {
        throw ApiError.forbidden("You can only view your own outstanding");
      }
    }
    
    const result = await outstandingService.getContactSummary(
      req.params.contactId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Outstanding summary fetched successfully",
        ),
      );
  });

  getContactBills = asyncHandler(async (req, res) => {
    // Client role: Only allow viewing their own contact
    if (req.role === "firm" && req.firmRole === "client" && req.contactId) {
      if (req.params.contactId !== req.contactId.toString()) {
        throw ApiError.forbidden("You can only view your own bills");
      }
    }
    
    const result = await outstandingService.getContactBills(
      req.params.contactId,
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Outstanding bills fetched successfully"),
      );
  });

  getContactHistory = asyncHandler(async (req, res) => {
    // Client role: Only allow viewing their own contact
    if (req.role === "firm" && req.firmRole === "client" && req.contactId) {
      if (req.params.contactId !== req.contactId.toString()) {
        throw ApiError.forbidden("You can only view your own history");
      }
    }
    
    const result = await outstandingService.getContactHistory(
      req.params.contactId,
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Payment history fetched successfully"),
      );
  });
}

const outstandingController = new OutstandingController();

export const getContacts = outstandingController.getContacts;
export const getContactSummary = outstandingController.getContactSummary;
export const getContactBills = outstandingController.getContactBills;
export const getContactHistory = outstandingController.getContactHistory;

export default outstandingController;
