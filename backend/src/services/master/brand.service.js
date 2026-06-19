import mongoose from "mongoose";
import Brand from "../../models/master/brand.model.js";
import Item from "../../models/master/item.model.js";
import { ApiError, Pagination, toNumber } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

class BrandService {
  async getBrands(userId, query) {
    const filter = { user_id: userId };
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.name = { $regex: escaped, $options: "i" };
    }

    const result = await Pagination.paginate(Brand, filter, {
      ...query,
      populate: {
        path: "hsn_id",
        select: "hsn_code description gst_rate",
      },
      sort: { createdAt: -1 },
    });

    if (result.data.length > 0) {
      const brandIds = result.data.map((b) => b._id);
      const counts = await Item.aggregate([
        { $match: { brand_id: { $in: brandIds }, user_id: userId } },
        { $group: { _id: "$brand_id", total_items: { $sum: 1 } } },
      ]);
      const countMap = new Map(
        counts.map((c) => [String(c._id), c.total_items]),
      );
      for (const brand of result.data) {
        brand.total_items = countMap.get(String(brand._id)) || 0;
      }
    }

    return result;
  }

  async getBrandById(brandId, userId) {
    const brand = await Brand.findOne({
      _id: brandId,
      user_id: userId,
    })
      .populate("hsn_id", "hsn_code description gst_rate")
      .populate(
        "item_ids",
        "item_name alias description barcode item_id sale_rate stock hsn_id",
      )
      .lean();
    if (!brand) throw ApiError.notFound("Brand not found");

    brand.total_items = await Item.countDocuments({
      brand_id: brandId,
      user_id: userId,
    });

    return brand;
  }

  async createBrand(data, userId) {
    const { name, discount1, discount2, hsn_id, item_ids } = data;

    if (!name || typeof name !== "string" || !name.trim()) {
      throw ApiError.badRequest("Brand name is required");
    }

    const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const existing = await Brand.findOne({
      name: { $regex: new RegExp(`^${escapedName}$`, "i") },
      user_id: userId,
    });
    if (existing) {
      throw ApiError.conflict("Brand with this name already exists");
    }

    if (hsn_id) {
      const Hsn = (await import("../../models/master/hsn.model.js")).default;
      const hsnExists = await Hsn.exists({ _id: hsn_id, user_id: userId });
      if (!hsnExists) {
        throw ApiError.badRequest("HSN not found. Please select a valid HSN.");
      }
    }

    let validItemIds = [];
    if (item_ids && Array.isArray(item_ids) && item_ids.length > 0) {
      const validItems = await Item.find({
        _id: { $in: item_ids },
        user_id: userId,
      }).select("_id");
      validItemIds = validItems.map((i) => i._id);
      if (validItemIds.length !== item_ids.length) {
        throw ApiError.badRequest(
          "One or more item IDs are invalid or do not belong to you",
        );
      }
    }

    const brand = await Brand.create({
      id: await getNextId("Brand", userId),
      name: name.trim(),
      discount1: discount1 || { normal: 0, special: 0 },
      discount2: discount2 || { normal: 0, special: 0 },
      hsn_id: hsn_id || undefined,
      item_ids: validItemIds,
      user_id: userId,
    });

    if (validItemIds.length > 0) {
      await Item.updateMany(
        { _id: { $in: validItemIds }, user_id: userId },
        { $set: { brand_id: brand._id } },
      );
    }

    return brand.populate("hsn_id", "hsn_code description gst_rate");
  }

  async updateBrand(brandId, userId, updateData) {
    const brand = await Brand.findOne({ _id: brandId, user_id: userId });
    if (!brand) throw ApiError.notFound("Brand not found");

    const { name, discount1, discount2, hsn_id, item_ids } = updateData;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        throw ApiError.badRequest("Brand name cannot be empty");
      }
      const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const duplicate = await Brand.findOne({
        name: { $regex: new RegExp(`^${escapedName}$`, "i") },
        user_id: userId,
        _id: { $ne: brandId },
      });
      if (duplicate) {
        throw ApiError.conflict("Another brand with this name already exists");
      }
    }

    if (hsn_id !== undefined && hsn_id !== null) {
      const Hsn = (await import("../../models/master/hsn.model.js")).default;
      const hsnExists = await Hsn.exists({ _id: hsn_id, user_id: userId });
      if (!hsnExists) {
        throw ApiError.badRequest("HSN not found. Please select a valid HSN.");
      }
    }

    const validateDiscountField = (field, label) => {
      if (!field) return;
      if (field.normal !== undefined) {
        field.normal = toNumber(field.normal, `${label} normal %`, {
          min: 0,
          max: 100,
        });
      }
      if (field.special !== undefined) {
        field.special = toNumber(field.special, `${label} special %`, {
          min: 0,
          max: 100,
        });
      }
    };
    if (discount1 !== undefined) validateDiscountField(discount1, "Discount 1");
    if (discount2 !== undefined) validateDiscountField(discount2, "Discount 2");

    const fields = {};
    if (name !== undefined) fields.name = name.trim();
    if (discount1 !== undefined) fields.discount1 = discount1;
    if (discount2 !== undefined) fields.discount2 = discount2;
    if (hsn_id !== undefined) fields.hsn_id = hsn_id;

    if (item_ids !== undefined) {
      const newItemIds = Array.isArray(item_ids) ? item_ids : [];

      if (newItemIds.length > 0) {
        const validItems = await Item.find({
          _id: { $in: newItemIds },
          user_id: userId,
        }).select("_id");
        if (validItems.length !== newItemIds.length) {
          throw ApiError.badRequest(
            "One or more item IDs are invalid or do not belong to you",
          );
        }
      }

      const oldItemIds = (brand.item_ids || []).map(String);
      const newItemIdStrings = newItemIds.map(String);

      const removedIds = oldItemIds.filter(
        (id) => !newItemIdStrings.includes(id),
      );

      const addedIds = newItemIdStrings.filter(
        (id) => !oldItemIds.includes(id),
      );

      if (removedIds.length > 0) {
        await Item.updateMany(
          { _id: { $in: removedIds }, brand_id: brandId, user_id: userId },
          { $unset: { brand_id: 1 } },
        );
      }

      if (addedIds.length > 0) {
        await Brand.updateMany(
          {
            _id: { $ne: brandId },
            item_ids: { $in: addedIds },
            user_id: userId,
          },
          {
            $pull: {
              item_ids: {
                $in: addedIds.map((id) => new mongoose.Types.ObjectId(id)),
              },
            },
          },
        );
        await Item.updateMany(
          { _id: { $in: addedIds }, user_id: userId },
          { $set: { brand_id: brandId } },
        );
      }

      fields.item_ids = newItemIds;
    }

    const updatedBrand = await Brand.findByIdAndUpdate(brandId, fields, {
      returnDocument: "after",
    }).populate("hsn_id", "hsn_code description gst_rate");
    return updatedBrand;
  }

  async updateDiscount(brandId, userId, discountData) {
    const brand = await Brand.findOne({ _id: brandId, user_id: userId });
    if (!brand) throw ApiError.notFound("Brand not found");

    const { discount1, discount2 } = discountData;

    const validateDiscountField = (field, label) => {
      if (!field) return;
      if (field.normal !== undefined) {
        field.normal = toNumber(field.normal, `${label} normal %`, {
          min: 0,
          max: 100,
        });
      }
      if (field.special !== undefined) {
        field.special = toNumber(field.special, `${label} special %`, {
          min: 0,
          max: 100,
        });
      }
    };
    validateDiscountField(discount1, "Discount 1");
    validateDiscountField(discount2, "Discount 2");

    const fields = {};
    if (discount1 !== undefined) fields.discount1 = discount1;
    if (discount2 !== undefined) fields.discount2 = discount2;

    const updatedBrand = await Brand.findByIdAndUpdate(brandId, fields, {
      returnDocument: "after",
    }).populate("hsn_id", "hsn_code description gst_rate");
    return updatedBrand;
  }

  async deleteBrand(brandId, userId) {
    const brand = await Brand.findOne({ _id: brandId, user_id: userId });
    if (!brand) throw ApiError.notFound("Brand not found");

    await Item.updateMany(
      { brand_id: brandId, user_id: userId },
      { $unset: { brand_id: 1 } },
    );

    await Brand.findByIdAndDelete(brandId);
  }
}

export default new BrandService();
