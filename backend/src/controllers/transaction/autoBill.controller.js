import { autoBillService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class AutoBillController {
  getRules = asyncHandler(async (req, res) => {
    const result = await autoBillService.getRules(req.user._id, req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Automation rules fetched successfully"));
  });

  getRuleById = asyncHandler(async (req, res) => {
    const rule = await autoBillService.getRuleById(
      req.params.ruleId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, rule, "Automation rule fetched successfully"));
  });

  createRule = asyncHandler(async (req, res) => {
    const rule = await autoBillService.createRule(req.body, req.user._id);
    res
      .status(201)
      .json(new ApiResponse(201, rule, "Automation rule created successfully"));
  });

  updateRule = asyncHandler(async (req, res) => {
    const rule = await autoBillService.updateRule(
      req.params.ruleId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, rule, "Automation rule updated successfully"));
  });

  deleteRule = asyncHandler(async (req, res) => {
    await autoBillService.deleteRule(req.params.ruleId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Automation rule deleted successfully"));
  });
}

const autoBillController = new AutoBillController();

export const getRules = autoBillController.getRules;
export const getRuleById = autoBillController.getRuleById;
export const createRule = autoBillController.createRule;
export const updateRule = autoBillController.updateRule;
export const deleteRule = autoBillController.deleteRule;

export default autoBillController;
