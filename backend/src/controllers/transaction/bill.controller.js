import { billScanService, billService } from "../../services/index.js";
import { asyncHandler, ApiError, ApiResponse } from "../../utils/index.js";

class BillController {
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

  getBills = asyncHandler(async (req, res) => {
    const baseQuery = req.clientFilter
      ? { ...req.query, ...req.clientFilter }
      : req.query;
    const query = this._withFinancialYear(baseQuery, req);

    const result = await billService.getBills(req.user._id, req.isGst, query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bills fetched successfully"));
  });

  getBillById = asyncHandler(async (req, res) => {
    const bill = await billService.getBillById(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, bill, "Bill fetched successfully"));
  });

  createBill = asyncHandler(async (req, res) => {
    const result = await billService.createBill(
      this._bodyWithFinancialYear(req.body, req),
      req.user._id,
      req.isGst,
    );
    res
      .status(201)
      .json(new ApiResponse(201, result, "Bill created successfully"));
  });

  scanBillImages = asyncHandler(async (req, res) => {
    const result = await billScanService.scanBillImages(
      req.files || [],
      req.user._id,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill image extracted successfully"));
  });

  scanBillImagesStream = async (req, res) => {
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const sendEvent = (event) => {
      if (!res.writableEnded) {
        res.write(`${JSON.stringify(event).padEnd(1024, " ")}\n`);
      }
    };

    try {
      sendEvent({
        type: "progress",
        stage: "uploading_images",
        status: "completed",
        details: { image_count: req.files?.length || 0 },
      });

      const result = await billScanService.scanBillImages(
        req.files || [],
        req.user._id,
        req.isGst,
        (stage, status, details = {}) => {
          sendEvent({ type: "progress", stage, status, details });
        },
      );

      sendEvent({ type: "result", data: result });
      res.end();
    } catch (error) {
      sendEvent({
        type: "error",
        message: error?.message || "Bill scan failed",
      });
      res.end();
    }
  };

  extractBillImages = asyncHandler(async (req, res) => {
    const result = await billScanService.extractBillItems(
      req.files || [],
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill items extracted successfully"));
  });

  resolveBillScanItems = asyncHandler(async (req, res) => {
    const result = await billScanService.resolveExtractedItems(
      req.body?.extracted,
      req.user._id,
      req.isGst,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill scan items resolved successfully"));
  });

  getNextBillNo = asyncHandler(async (req, res) => {
    const contactType = req.query?.contact_type || req.body?.contact_type || "party";
    const contactId =
      req.query?.contact_id ||
      req.query?.contactId ||
      req.body?.contact_id ||
      req.body?.contactId ||
      null;
    const result = await billService.getNextBillNo(
      req.user._id,
      req.isGst,
      req.query?.is_gst,
      contactType,
      req.financialYearId,
      contactId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Next bill number fetched successfully"));
  });

  batchConvert = asyncHandler(async (req, res) => {
    const { challan_ids } = req.body;
    const result = await billService.batchConvertChallans(
      challan_ids,
      req.user._id,
      { is_gst: req.isGst, financial_year_id: req.financialYearId },
    );
    res
      .status(201)
      .json(
        new ApiResponse(
          201,
          result,
          `${result.total_bills_created} bill(s) created successfully`,
        ),
      );
  });

  settleBills = asyncHandler(async (req, res) => {
    const result = await billService.settleBills(
      req.body,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(
        new ApiResponse(200, result, "Bill settlement recorded successfully"),
      );
  });

  recordPayment = asyncHandler(async (req, res) => {
    const bill = await billService.recordPayment(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.body,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, bill, "Payment recorded successfully"));
  });

  handleReturn = asyncHandler(async (req, res) => {
    const party = await billService.handleReturn(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.body,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, party, "Return processed successfully"));
  });

  deleteBill = asyncHandler(async (req, res) => {
    await billService.deleteBill(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Bill deleted successfully"));
  });

  undoSettlement = asyncHandler(async (req, res) => {
    const result = await billService.undoBillSettlement(
      req.params.billId,
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill settlement undone successfully"));
  });

  getBillsByStatus = asyncHandler(async (req, res) => {
    const baseQuery = req.clientFilter
      ? { ...req.query, ...req.clientFilter, payment_status: req.params.status }
      : { ...req.query, payment_status: req.params.status };
    const query = this._withFinancialYear(baseQuery, req);

    const result = await billService.getBills(req.user._id, req.isGst, query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bills fetched successfully"));
  });

  getBillsForContact = asyncHandler(async (req, res) => {
    if (req.role === "firm" && req.firmRole === "client" && req.contactId) {
      if (req.params.contactId !== req.contactId.toString()) {
        throw ApiError.forbidden("You can only view your own bills");
      }
    }

    const result = await billService.getBillsForContact(
      req.params.contactId,
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bills fetched successfully"));
  });

  getBillSummary = asyncHandler(async (req, res) => {
    const result = await billService.getBillSummary(
      req.user._id,
      req.isGst,
      req.financialYearId,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill summary fetched successfully"));
  });

  getLastSoldItem = asyncHandler(async (req, res) => {
    const result = await billService.getLastSoldItem(
      req.params.itemId,
      req.user._id,
      req.isGst,
      this._withFinancialYear(req.query, req),
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

  updateBill = asyncHandler(async (req, res) => {
    const bill = await billService.updateBill(
      req.params.billId,
      req.user._id,
      req.isGst,
      this._bodyWithFinancialYear(req.body, req),
    );
    res
      .status(200)
      .json(new ApiResponse(200, bill, "Bill updated successfully"));
  });

  checkBillNoUnique = asyncHandler(async (req, res) => {
    const result = await billService.checkBillNoUnique(
      req.body.bill_no,
      req.isGst,
      req.user._id,
      {
        contactId: req.body.contact_id || req.body.contactId,
        contactType: req.body.contact_type || req.body.contactType,
        financialYearId: req.financialYearId,
        date: req.body.date,
      },
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Bill number check completed"));
  });
}

const billController = new BillController();

export const getBills = billController.getBills;
export const getBillById = billController.getBillById;
export const createBill = billController.createBill;
export const scanBillImages = billController.scanBillImages;
export const scanBillImagesStream = billController.scanBillImagesStream;
export const extractBillImages = billController.extractBillImages;
export const resolveBillScanItems = billController.resolveBillScanItems;
export const getNextBillNo = billController.getNextBillNo;
export const batchConvert = billController.batchConvert;
export const settleBills = billController.settleBills;
export const recordPayment = billController.recordPayment;
export const handleReturn = billController.handleReturn;
export const deleteBill = billController.deleteBill;
export const undoSettlement = billController.undoSettlement;
export const getBillsByStatus = billController.getBillsByStatus;
export const getBillsForContact = billController.getBillsForContact;
export const getBillSummary = billController.getBillSummary;
export const getLastSoldItem = billController.getLastSoldItem;
export const updateBill = billController.updateBill;
export const checkBillNoUnique = billController.checkBillNoUnique;

export default billController;
