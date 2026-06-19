import Agent from "../../models/master/agent.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class AgentService {
  async getAgents(userId, query) {
    const filter = { user_id: userId };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    return Pagination.paginate(Agent, filter, {
      ...query,
      sort: { createdAt: -1 },
    });
  }

  async getAgentById(agentId, userId) {
    const agent = await Agent.findOne({ _id: agentId, user_id: userId });
    if (!agent) throw ApiError.notFound("Agent not found");
    return agent;
  }

  async createAgent(agentData, userId) {
    const { name, address, city, pincode, phone, whatsapp } = agentData;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Agent name is required");
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await Agent.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.conflict("Agent with this name already exists");
    }

    const agent = await Agent.create({
      id: await getNextId("Agent", userId),
      name: name.trim(),
      address,
      city,
      pincode,
      phone,
      whatsapp,
      user_id: userId,
    });

    return agent;
  }

  async updateAgent(agentId, userId, updateData) {
    const agent = await Agent.findOne({ _id: agentId, user_id: userId });
    if (!agent) throw ApiError.notFound("Agent not found");

    const { name, address, city, pincode, phone, whatsapp } = updateData;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Agent name cannot be empty");
      }
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await Agent.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        user_id: userId,
        _id: { $ne: agentId },
      });
      if (duplicate) {
        throw ApiError.conflict("Another agent with this name already exists");
      }
    }

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (address !== undefined) fields.address = address;
    if (city !== undefined) fields.city = city;
    if (pincode !== undefined) fields.pincode = pincode;
    if (phone !== undefined) fields.phone = phone;
    if (whatsapp !== undefined) fields.whatsapp = whatsapp;

    const updatedAgent = await Agent.findByIdAndUpdate(agentId, fields, {
      returnDocument: "after",
    });
    return updatedAgent;
  }

  async deleteAgent(agentId, userId) {
    const agent = await Agent.findOne({ _id: agentId, user_id: userId });
    if (!agent) throw ApiError.notFound("Agent not found");
    await Agent.findByIdAndDelete(agentId);
  }
}

export default new AgentService();
