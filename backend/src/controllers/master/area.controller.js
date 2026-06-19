import { areaService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class AreaController {
  getAreas = asyncHandler(async (req, res) => {
    const result = await areaService.getAreas(req.user._id, req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Areas fetched successfully"));
  });

  getAreaById = asyncHandler(async (req, res) => {
    const area = await areaService.getAreaById(req.params.areaId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, area, "Area fetched successfully"));
  });

  createArea = asyncHandler(async (req, res) => {
    const area = await areaService.createArea(req.body, req.user._id);
    res
      .status(201)
      .json(new ApiResponse(201, area, "Area created successfully"));
  });

  updateArea = asyncHandler(async (req, res) => {
    const area = await areaService.updateArea(
      req.params.areaId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, area, "Area updated successfully"));
  });

  deleteArea = asyncHandler(async (req, res) => {
    await areaService.deleteArea(req.params.areaId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Area deleted successfully"));
  });
}

const areaController = new AreaController();

export const getAreas = areaController.getAreas;
export const getAreaById = areaController.getAreaById;
export const createArea = areaController.createArea;
export const updateArea = areaController.updateArea;
export const deleteArea = areaController.deleteArea;

export default areaController;
