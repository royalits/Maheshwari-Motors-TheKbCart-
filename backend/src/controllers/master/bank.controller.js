import { bankService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class BankController {
  getBanks = asyncHandler(async (req, res) => {
    const result = await bankService.getBanks(
      req.user._id,
      req.query,
      req.firmType || null,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Banks fetched successfully"));
  });

  getBankById = asyncHandler(async (req, res) => {
    const bank = await bankService.getBankById(req.params.bankId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, bank, "Bank fetched successfully"));
  });

  createBank = asyncHandler(async (req, res) => {
    const bank = await bankService.createBank(
      req.body,
      req.user._id,
      req.firmType || null,
    );
    res
      .status(201)
      .json(new ApiResponse(201, bank, "Bank created successfully"));
  });

  updateBank = asyncHandler(async (req, res) => {
    const bank = await bankService.updateBank(
      req.params.bankId,
      req.user._id,
      req.body,
      req.firmType || null,
    );
    res
      .status(200)
      .json(new ApiResponse(200, bank, "Bank updated successfully"));
  });

  deleteBank = asyncHandler(async (req, res) => {
    await bankService.deleteBank(req.params.bankId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Bank deleted successfully"));
  });
}

export default new BankController();
