import { transportService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class TransportController {
  getTransports = asyncHandler(async (req, res) => {
    const result = await transportService.getTransports(
      req.user._id,
      req.query,
    );
    res
      .status(200)
      .json(new ApiResponse(200, result, "Transports fetched successfully"));
  });

  getTransportById = asyncHandler(async (req, res) => {
    const transport = await transportService.getTransportById(
      req.params.transportId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, transport, "Transport fetched successfully"));
  });

  createTransport = asyncHandler(async (req, res) => {
    const transport = await transportService.createTransport(
      req.body,
      req.user._id,
    );
    res
      .status(201)
      .json(new ApiResponse(201, transport, "Transport created successfully"));
  });

  updateTransport = asyncHandler(async (req, res) => {
    const transport = await transportService.updateTransport(
      req.params.transportId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, transport, "Transport updated successfully"));
  });

  deleteTransport = asyncHandler(async (req, res) => {
    await transportService.deleteTransport(
      req.params.transportId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Transport deleted successfully"));
  });
}

const transportController = new TransportController();

export const getTransports = transportController.getTransports;
export const getTransportById = transportController.getTransportById;
export const createTransport = transportController.createTransport;
export const updateTransport = transportController.updateTransport;
export const deleteTransport = transportController.deleteTransport;

export default transportController;
