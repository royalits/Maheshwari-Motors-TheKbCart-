import Transport from "../../models/master/transport.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class TransportService {
  async getTransports(userId, query) {
    const filter = { user_id: userId };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    return Pagination.paginate(Transport, filter, {
      ...query,
      sort: { createdAt: -1 },
    });
  }

  async getTransportById(transportId, userId) {
    const transport = await Transport.findOne({
      _id: transportId,
      user_id: userId,
    });
    if (!transport) throw ApiError.notFound("Transport not found");
    return transport;
  }

  async createTransport(transportData, userId) {
    const { name, address, city, pincode, phone, whatsapp, gstin } =
      transportData;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Transport name is required");
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await Transport.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.conflict("Transport with this name already exists");
    }

    const transport = await Transport.create({
      id: await getNextId("Transport", userId),
      name: name.trim(),
      address,
      city,
      pincode,
      phone,
      whatsapp,
      gstin,
      user_id: userId,
    });

    return transport;
  }

  async updateTransport(transportId, userId, updateData) {
    const transport = await Transport.findOne({
      _id: transportId,
      user_id: userId,
    });
    if (!transport) throw ApiError.notFound("Transport not found");

    const { name, address, city, pincode, phone, whatsapp, gstin } = updateData;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Transport name cannot be empty");
      }
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await Transport.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        user_id: userId,
        _id: { $ne: transportId },
      });
      if (duplicate) {
        throw ApiError.conflict(
          "Another transport with this name already exists",
        );
      }
    }

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (address !== undefined) fields.address = address;
    if (city !== undefined) fields.city = city;
    if (pincode !== undefined) fields.pincode = pincode;
    if (phone !== undefined) fields.phone = phone;
    if (whatsapp !== undefined) fields.whatsapp = whatsapp;
    if (gstin !== undefined) fields.gstin = gstin;

    const updatedTransport = await Transport.findByIdAndUpdate(
      transportId,
      fields,
      { returnDocument: "after" },
    );
    return updatedTransport;
  }

  async deleteTransport(transportId, userId) {
    const transport = await Transport.findOne({
      _id: transportId,
      user_id: userId,
    });
    if (!transport) throw ApiError.notFound("Transport not found");
    await Transport.findByIdAndDelete(transportId);
  }
}

export default new TransportService();
