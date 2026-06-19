import Hsn from "../../models/master/hsn.model.js";
import {
  ApiError,
  Pagination,
  toNumber,
  toNumberIfDefined,
} from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class HsnService {
  async getHsns(userId, query) {
    const filter = { user_id: userId };

    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { hsn_code: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
      ];
    }

    if (query.is_active !== undefined) {
      filter.is_active = query.is_active === "true" || query.is_active === true;
    }

    return Pagination.paginate(Hsn, filter, {
      ...query,
      sort: { createdAt: -1 },
    });
  }

  async getHsnById(hsnId, userId) {
    const hsn = await Hsn.findOne({ _id: hsnId, user_id: userId });
    if (!hsn) throw ApiError.notFound("HSN not found");
    return hsn;
  }

  async createHsn(hsnData, userId) {
    const { hsn_code, description, gst_rate, is_active } = hsnData;

    if (!hsn_code || typeof hsn_code !== "string" || !hsn_code.trim()) {
      throw ApiError.badRequest("HSN code is required");
    }

    if (gst_rate === undefined || gst_rate === null) {
      throw ApiError.badRequest("GST rate is required");
    }
    const parsedGstRate = toNumber(gst_rate, "GST rate", { min: 0, max: 100 });

    const escapedCode = hsn_code.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const duplicate = await Hsn.findOne({
      hsn_code: { $regex: new RegExp(`^${escapedCode}$`, "i") },
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.conflict("HSN with this code already exists");
    }

    const hsn = await Hsn.create({
      id: await getNextId("Hsn", userId),
      hsn_code: hsn_code.trim(),
      description: description || "",
      gst_rate: parsedGstRate,
      is_active: is_active ?? true,
      user_id: userId,
    });

    return hsn;
  }

  async updateHsn(hsnId, userId, updateData) {
    const hsn = await Hsn.findOne({ _id: hsnId, user_id: userId });
    if (!hsn) throw ApiError.notFound("HSN not found");

    const { hsn_code, description, gst_rate, is_active } = updateData;

    if (hsn_code !== undefined) {
      if (typeof hsn_code !== "string" || !hsn_code.trim()) {
        throw ApiError.badRequest("HSN code cannot be empty");
      }
      const escapedCode = hsn_code
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await Hsn.findOne({
        hsn_code: { $regex: new RegExp(`^${escapedCode}$`, "i") },
        user_id: userId,
        _id: { $ne: hsnId },
      });
      if (duplicate) {
        throw ApiError.conflict("Another HSN with this code already exists");
      }
    }

    const fields = {};
    if (hsn_code !== undefined) fields.hsn_code = hsn_code.trim();
    if (description !== undefined) fields.description = description;
    if (gst_rate !== undefined)
      fields.gst_rate = toNumberIfDefined(gst_rate, "GST rate", {
        min: 0,
        max: 100,
      });
    if (is_active !== undefined) fields.is_active = is_active;

    const updatedHsn = await Hsn.findByIdAndUpdate(hsnId, fields, {
      returnDocument: "after",
    });
    return updatedHsn;
  }

  async deleteHsn(hsnId, userId) {
    const hsn = await Hsn.findOne({ _id: hsnId, user_id: userId });
    if (!hsn) throw ApiError.notFound("HSN not found");

    const { default: Brand } =
      await import("../../models/master/brand.model.js");
    await Brand.updateMany(
      { hsn_id: hsnId, user_id: userId },
      { $unset: { hsn_id: 1 } },
    );

    await Hsn.findByIdAndDelete(hsnId);
  }
}

export default new HsnService();
