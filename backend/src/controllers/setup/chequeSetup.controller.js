import chequeSetupService from "../../services/setup/chequeSetup.service.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ChequeSetupController {
  getAll = asyncHandler(async (req, res) => {
    const data = await chequeSetupService.getAllSetups(req.user._id);
    res.status(200).json(new ApiResponse(200, data, "Cheque setups fetched"));
  });

  getByBank = asyncHandler(async (req, res) => {
    const data = await chequeSetupService.getByBank(req.params.bankId, req.user._id);
    res.status(200).json(new ApiResponse(200, data, "Cheque setup fetched"));
  });

  upsert = asyncHandler(async (req, res) => {
    const data = await chequeSetupService.upsert(req.params.bankId, req.user._id, req.body);
    res.status(200).json(new ApiResponse(200, data, "Cheque setup saved"));
  });

  remove = asyncHandler(async (req, res) => {
    await chequeSetupService.deleteByBank(req.params.bankId, req.user._id);
    res.status(200).json(new ApiResponse(200, null, "Cheque setup deleted"));
  });
}

export default new ChequeSetupController();
