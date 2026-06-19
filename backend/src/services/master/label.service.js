import mongoose from "mongoose";
import Label from "../../models/master/label.model.js";
import Brand from "../../models/master/brand.model.js";
import Contact from "../../models/master/contact.model.js";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

const LABEL_POPULATE = [
  { path: "brand_discounts.brand_id", select: "name" },
  { path: "brand_discounts.item_discounts.item_id", select: "item_name" },
];

class LabelService {
  _escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  _sanitizeDiscountField(value, path) {
    if (value === undefined || value === null) {
      return { normal: 0, special: 0 };
    }

    if (typeof value !== "object" || Array.isArray(value)) {
      throw ApiError.badRequest(`${path} must be an object`);
    }

    const normal = value.normal === undefined ? 0 : Number(value.normal);
    const special = value.special === undefined ? 0 : Number(value.special);

    if (!Number.isFinite(normal) || normal < 0 || normal > 100) {
      throw ApiError.badRequest(`${path}.normal must be between 0 and 100`);
    }

    if (!Number.isFinite(special) || special < 0 || special > 100) {
      throw ApiError.badRequest(`${path}.special must be between 0 and 100`);
    }

    return { normal, special };
  }

  async _sanitizeBrandDiscounts(brandDiscounts, userId) {
    if (!Array.isArray(brandDiscounts)) {
      throw ApiError.badRequest("brand_discounts must be an array");
    }

    const brandSeen = new Set();
    const normalized = [];

    for (let index = 0; index < brandDiscounts.length; index++) {
      const entry = brandDiscounts[index];
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw ApiError.badRequest(
          `brand_discounts[${index}] must be an object`,
        );
      }

      if (!entry.brand_id) {
        throw ApiError.badRequest(
          `brand_discounts[${index}].brand_id is required`,
        );
      }

      const brandIdStr = String(entry.brand_id);
      if (brandSeen.has(brandIdStr)) {
        throw ApiError.badRequest(
          `Duplicate brand_id '${brandIdStr}' in brand_discounts`,
        );
      }
      brandSeen.add(brandIdStr);

      const disc1 = this._sanitizeDiscountField(
        entry.disc1 ?? entry.discount1,
        `brand_discounts[${index}].disc1`,
      );

      const disc2 = this._sanitizeDiscountField(
        entry.disc2 ?? entry.discount2,
        `brand_discounts[${index}].disc2`,
      );

      const itemDiscounts = await this._sanitizeItemDiscounts(
        entry.item_discounts || [],
        brandIdStr,
        userId,
        index,
      );

      normalized.push({
        brand_id: entry.brand_id,
        disc1,
        disc2,
        item_discounts: itemDiscounts,
      });
    }

    const allBrandIds = [...new Set(normalized.map((e) => String(e.brand_id)))];

    if (allBrandIds.length > 0) {
      const validCount = await Brand.countDocuments({
        _id: { $in: allBrandIds },
        user_id: userId,
      });
      if (validCount !== allBrandIds.length) {
        throw ApiError.badRequest(
          "One or more brands in brand_discounts are invalid or do not belong to you",
        );
      }
    }

    return normalized;
  }

  async _sanitizeItemDiscounts(itemDiscounts, brandIdStr, userId, brandIndex) {
    if (!Array.isArray(itemDiscounts)) {
      throw ApiError.badRequest(
        `brand_discounts[${brandIndex}].item_discounts must be an array`,
      );
    }

    if (itemDiscounts.length === 0) return [];

    const itemSeen = new Set();
    const normalized = itemDiscounts.map((entry, i) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        throw ApiError.badRequest(
          `brand_discounts[${brandIndex}].item_discounts[${i}] must be an object`,
        );
      }

      if (!entry.item_id) {
        throw ApiError.badRequest(
          `brand_discounts[${brandIndex}].item_discounts[${i}].item_id is required`,
        );
      }

      const itemIdStr = String(entry.item_id);
      if (itemSeen.has(itemIdStr)) {
        throw ApiError.badRequest(
          `Duplicate item_id '${itemIdStr}' in brand_discounts[${brandIndex}].item_discounts`,
        );
      }
      itemSeen.add(itemIdStr);

      const discount =
        entry.discount === undefined ? 0 : Number(entry.discount);
      if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
        throw ApiError.badRequest(
          `brand_discounts[${brandIndex}].item_discounts[${i}].discount must be between 0 and 100`,
        );
      }

      return { item_id: entry.item_id, discount };
    });

    // Validate all item_ids belong to this brand via Brand.item_ids
    const brand = await Brand.findOne({
      _id: brandIdStr,
      user_id: userId,
    }).select("item_ids");

    if (!brand) {
      throw ApiError.badRequest(
        `Brand in brand_discounts[${brandIndex}] not found`,
      );
    }

    const brandItemIdSet = new Set((brand.item_ids || []).map(String));
    for (const item of normalized) {
      if (!brandItemIdSet.has(String(item.item_id))) {
        throw ApiError.badRequest(
          `Item '${item.item_id}' does not belong to brand '${brandIdStr}'`,
        );
      }
    }

    return normalized;
  }

  async getLabels(userId, query) {
    const filter = { user_id: userId };

    if (query.search) {
      const escaped = this._escapeRegex(query.search);
      filter.name = { $regex: escaped, $options: "i" };
    }

    return Pagination.paginate(Label, filter, {
      ...query,
      select: "-brand_discounts",
      sort: { createdAt: -1 },
    });
  }

  async getLabelBrands(labelId, userId) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }

    const label = await Label.findOne(
      { _id: labelId, user_id: userId },
      { brand_discounts: 1 },
    ).populate({ path: "brand_discounts.brand_id", select: "name" });

    if (!label) throw ApiError.notFound("Label not found");

    return (label.brand_discounts || []).map((bd) => ({
      brand_id: bd.brand_id,
      disc1: bd.disc1 || { normal: 0, special: 0 },
      disc2: bd.disc2 || { normal: 0, special: 0 },
    }));
  }

  async getLabelBrandItems(labelId, brandId, userId) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      throw ApiError.badRequest("Invalid brand ID");
    }

    const label = await Label.findOne(
      { _id: labelId, user_id: userId },
      { brand_discounts: 1 },
    );
    if (!label) throw ApiError.notFound("Label not found");

    const brandEntry = (label.brand_discounts || []).find(
      (bd) => String(bd.brand_id) === String(brandId),
    );
    if (!brandEntry) {
      throw ApiError.notFound("Brand not configured in this label");
    }

    const brand = await Brand.findOne({
      _id: brandId,
      user_id: userId,
    }).populate({ path: "item_ids", select: "item_name sale_rate" });

    if (!brand) throw ApiError.notFound("Brand not found");

    const discountMap = new Map(
      (brandEntry.item_discounts || []).map((d) => [
        String(d.item_id),
        d.discount,
      ]),
    );

    return (brand.item_ids || []).map((item) => ({
      item_id: { _id: item._id, item_name: item.item_name },
      sale_rate: item.sale_rate,
      discount: discountMap.get(String(item._id)) ?? 0,
    }));
  }

  async updateBrandDiscount(labelId, brandId, userId, discountData) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      throw ApiError.badRequest("Invalid brand ID");
    }

    const label = await Label.findOne({ _id: labelId, user_id: userId });
    if (!label) throw ApiError.notFound("Label not found");

    const brandEntry = (label.brand_discounts || []).find(
      (bd) => String(bd.brand_id) === String(brandId),
    );
    if (!brandEntry) {
      throw ApiError.notFound("Brand not configured in this label");
    }

    const { disc1, disc2 } = discountData;

    if (disc1 !== undefined) {
      brandEntry.disc1 = this._sanitizeDiscountField(disc1, "disc1");
    }
    if (disc2 !== undefined) {
      brandEntry.disc2 = this._sanitizeDiscountField(disc2, "disc2");
    }

    await label.save();

    await label.populate({
      path: "brand_discounts.brand_id",
      select: "name",
    });

    const updated = label.brand_discounts.find(
      (bd) => String(bd.brand_id._id || bd.brand_id) === String(brandId),
    );

    return {
      brand_id: updated.brand_id,
      disc1: updated.disc1,
      disc2: updated.disc2,
    };
  }

  async updateItemDiscount(labelId, brandId, itemId, userId, discountData) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }
    if (!mongoose.Types.ObjectId.isValid(brandId)) {
      throw ApiError.badRequest("Invalid brand ID");
    }
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw ApiError.badRequest("Invalid item ID");
    }

    const label = await Label.findOne({ _id: labelId, user_id: userId });
    if (!label) throw ApiError.notFound("Label not found");

    const brandEntry = (label.brand_discounts || []).find(
      (bd) => String(bd.brand_id) === String(brandId),
    );
    if (!brandEntry) {
      throw ApiError.notFound("Brand not configured in this label");
    }

    // Validate item belongs to this brand
    const brand = await Brand.findOne({
      _id: brandId,
      user_id: userId,
    }).select("item_ids");
    if (!brand) throw ApiError.notFound("Brand not found");

    if (!brand.item_ids.some((id) => String(id) === String(itemId))) {
      throw ApiError.badRequest("Item does not belong to this brand");
    }

    const discount =
      discountData.discount === undefined ? 0 : Number(discountData.discount);
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      throw ApiError.badRequest("discount must be between 0 and 100");
    }

    const existingIdx = (brandEntry.item_discounts || []).findIndex(
      (d) => String(d.item_id) === String(itemId),
    );

    if (discount === 0 && existingIdx !== -1) {
      // Remove item discount entry when set to 0 (no point storing it)
      brandEntry.item_discounts.splice(existingIdx, 1);
    } else if (discount > 0) {
      if (existingIdx !== -1) {
        brandEntry.item_discounts[existingIdx].discount = discount;
      } else {
        brandEntry.item_discounts.push({ item_id: itemId, discount });
      }
    }

    await label.save();

    return { item_id: itemId, discount };
  }

  async getLabelById(labelId, userId) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }

    const label = await Label.findOne({
      _id: labelId,
      user_id: userId,
    }).populate(LABEL_POPULATE);

    if (!label) throw ApiError.notFound("Label not found");
    return label;
  }

  async createLabel(labelData, userId) {
    const { name, description, is_active, brand_discounts } = labelData;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Label name is required");
    }

    const escapedName = this._escapeRegex(name.trim());
    const duplicate = await Label.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });
    if (duplicate) {
      throw ApiError.badRequest("A label with this name already exists");
    }

    const normalizedBrandDiscounts = await this._sanitizeBrandDiscounts(
      brand_discounts || [],
      userId,
    );

    const label = await Label.create({
      id: await getNextId("Label", userId),
      name: name.trim(),
      description: typeof description === "string" ? description.trim() : "",
      is_active: is_active === undefined ? true : Boolean(is_active),
      brand_discounts: normalizedBrandDiscounts,
      user_id: userId,
    });

    return label.populate(LABEL_POPULATE);
  }

  async updateLabel(labelId, userId, updateData) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }

    const label = await Label.findOne({ _id: labelId, user_id: userId });
    if (!label) throw ApiError.notFound("Label not found");

    const { name, description, is_active, brand_discounts } = updateData;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Label name cannot be empty");
      }
      const escapedName = this._escapeRegex(name.trim());
      const duplicate = await Label.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        user_id: userId,
        _id: { $ne: labelId },
      });
      if (duplicate) {
        throw ApiError.badRequest(
          "Another label with this name already exists",
        );
      }
    }

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (description !== undefined) {
      fields.description =
        typeof description === "string" ? description.trim() : "";
    }
    if (is_active !== undefined) fields.is_active = Boolean(is_active);

    if (brand_discounts !== undefined) {
      fields.brand_discounts = await this._sanitizeBrandDiscounts(
        brand_discounts,
        userId,
      );
    }

    const updatedLabel = await Label.findByIdAndUpdate(labelId, fields, {
      returnDocument: "after",
    }).populate(LABEL_POPULATE);

    return updatedLabel;
  }

  async deleteLabel(labelId, userId) {
    if (!mongoose.Types.ObjectId.isValid(labelId)) {
      throw ApiError.badRequest("Invalid label ID");
    }

    const label = await Label.findOne({ _id: labelId, user_id: userId });
    if (!label) throw ApiError.notFound("Label not found");

    const contactCount = await Contact.countDocuments({
      label_ids: labelId,
      user_id: userId,
    });
    if (contactCount > 0) {
      throw ApiError.badRequest(
        `Cannot delete label assigned to ${contactCount} contact(s). Remove label assignment from contacts first.`,
      );
    }

    await Label.findByIdAndDelete(labelId);
  }
}

export default new LabelService();
