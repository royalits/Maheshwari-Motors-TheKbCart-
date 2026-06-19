import { agentService } from "../../services/index.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class AgentController {
  getAgents = asyncHandler(async (req, res) => {
    const result = await agentService.getAgents(req.user._id, req.query);
    res
      .status(200)
      .json(new ApiResponse(200, result, "Agents fetched successfully"));
  });

  getAgentById = asyncHandler(async (req, res) => {
    const agent = await agentService.getAgentById(
      req.params.agentId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, agent, "Agent fetched successfully"));
  });

  createAgent = asyncHandler(async (req, res) => {
    const agent = await agentService.createAgent(req.body, req.user._id);
    res
      .status(201)
      .json(new ApiResponse(201, agent, "Agent created successfully"));
  });

  updateAgent = asyncHandler(async (req, res) => {
    const agent = await agentService.updateAgent(
      req.params.agentId,
      req.user._id,
      req.body,
    );
    res
      .status(200)
      .json(new ApiResponse(200, agent, "Agent updated successfully"));
  });

  deleteAgent = asyncHandler(async (req, res) => {
    await agentService.deleteAgent(req.params.agentId, req.user._id);
    res
      .status(200)
      .json(new ApiResponse(200, null, "Agent deleted successfully"));
  });
}

const agentController = new AgentController();

export const getAgents = agentController.getAgents;
export const getAgentById = agentController.getAgentById;
export const createAgent = agentController.createAgent;
export const updateAgent = agentController.updateAgent;
export const deleteAgent = agentController.deleteAgent;

export default agentController;
