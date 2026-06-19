import Area from "../../models/master/area.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class AreaService {
  async getAreas(userId, query) {
    const filter = { user_id: userId };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.city = { $regex: escaped, $options: "i" };
    }

    return Pagination.paginate(Area, filter, {
      ...query,
      sort: { createdAt: -1 },
      populate: [
        { path: "agent_id", select: "id name phone" },
        { path: "transport_id", select: "id name phone" },
      ],
    });
  }

  async getAreaById(areaId, userId) {
    const area = await Area.findOne({ _id: areaId, user_id: userId })
      .populate("agent_id", "id name phone")
      .populate("transport_id", "id name phone");
    if (!area) throw ApiError.notFound("Area not found");
    return area;
  }

  async createArea(areaData, userId) {
    const { city, state, pincode, phone, whatsapp, agent_id, transport_id } =
      areaData;

    if (!city || typeof city !== "string" || !city.trim()) {
      throw ApiError.badRequest("City is required");
    }

    if (agent_id) {
      const { default: Agent } =
        await import("../../models/master/agent.model.js");
      const agentExists = await Agent.exists({
        _id: agent_id,
        user_id: userId,
      });
      if (!agentExists) {
        throw ApiError.badRequest(
          "Agent not found. Please select a valid agent.",
        );
      }
    }

    if (transport_id) {
      const { default: Transport } =
        await import("../../models/master/transport.model.js");
      const transportExists = await Transport.exists({
        _id: transport_id,
        user_id: userId,
      });
      if (!transportExists) {
        throw ApiError.badRequest(
          "Transport not found. Please select a valid transport.",
        );
      }
    }

    const area = await Area.create({
      id: await getNextId("Area", userId),
      city: city.trim(),
      state,
      pincode,
      phone,
      whatsapp,
      agent_id: agent_id || null,
      transport_id: transport_id || null,
      user_id: userId,
    });

    return area.populate([
      { path: "agent_id", select: "id name phone" },
      { path: "transport_id", select: "id name phone" },
    ]);
  }

  async updateArea(areaId, userId, updateData) {
    const area = await Area.findOne({ _id: areaId, user_id: userId });
    if (!area) throw ApiError.notFound("Area not found");

    const { city, state, pincode, phone, whatsapp, agent_id, transport_id } =
      updateData;

    if (city !== undefined) {
      if (typeof city !== "string" || !city.trim()) {
        throw ApiError.badRequest("City cannot be empty");
      }
    }

    if (agent_id !== undefined && agent_id !== null) {
      const { default: Agent } =
        await import("../../models/master/agent.model.js");
      const agentExists = await Agent.exists({
        _id: agent_id,
        user_id: userId,
      });
      if (!agentExists) {
        throw ApiError.badRequest(
          "Agent not found. Please select a valid agent.",
        );
      }
    }

    if (transport_id !== undefined && transport_id !== null) {
      const { default: Transport } =
        await import("../../models/master/transport.model.js");
      const transportExists = await Transport.exists({
        _id: transport_id,
        user_id: userId,
      });
      if (!transportExists) {
        throw ApiError.badRequest(
          "Transport not found. Please select a valid transport.",
        );
      }
    }

    const fields = {};
    if (city !== undefined) fields.city = city.trim();
    if (state !== undefined) fields.state = state;
    if (pincode !== undefined) fields.pincode = pincode;
    if (phone !== undefined) fields.phone = phone;
    if (whatsapp !== undefined) fields.whatsapp = whatsapp;
    if (agent_id !== undefined) fields.agent_id = agent_id;
    if (transport_id !== undefined) fields.transport_id = transport_id;

    const updatedArea = await Area.findByIdAndUpdate(areaId, fields, {
      returnDocument: "after",
    })
      .populate("agent_id", "id name phone")
      .populate("transport_id", "id name phone");
    return updatedArea;
  }

  async deleteArea(areaId, userId) {
    const area = await Area.findOne({ _id: areaId, user_id: userId });
    if (!area) throw ApiError.notFound("Area not found");

    const { default: Contact } =
      await import("../../models/master/contact.model.js");
    await Contact.updateMany(
      { area_id: areaId, user_id: userId },
      { $set: { area_id: null } },
    );

    await Area.findByIdAndDelete(areaId);
  }
}

export default new AreaService();
