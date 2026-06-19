import mongoose from "mongoose";
import Item from "../../models/master/item.model.js";
import Challan from "../../models/transaction/challan.model.js";
import { ApiError, Pagination } from "../../utils/index.js";

class ItemLedgerService {
  _applyFinancialYear(filter, query = {}) {
    if (
      query.financial_year_id &&
      mongoose.Types.ObjectId.isValid(String(query.financial_year_id))
    ) {
      filter.financial_year_id = new mongoose.Types.ObjectId(
        query.financial_year_id,
      );
    }
    return filter;
  }

  /**
   * 1. ITEM DETAILS — brand / department / search filter, paginated
   *    Returns items with current stock, sale_rate, purchase_rate, brand, dept.
   */
  async getItems(userId, isGst, query) {
    const filter = { user_id: new mongoose.Types.ObjectId(userId) };

    if (query.brand_id && mongoose.Types.ObjectId.isValid(query.brand_id)) {
      filter.brand_id = new mongoose.Types.ObjectId(query.brand_id);
    }
    if (query.dept_id && mongoose.Types.ObjectId.isValid(query.dept_id)) {
      filter.dept_id = new mongoose.Types.ObjectId(query.dept_id);
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { item_name: { $regex: escaped, $options: "i" } },
        { alias: { $regex: escaped, $options: "i" } },
        { barcode: { $regex: escaped, $options: "i" } },
      ];
    }

    const result = await Pagination.paginate(Item, filter, {
      ...query,
      select:
        "id item_id item_name alias barcode sale_rate purchase_rate mrp_rate gst_percent physical_stock logical_stock stock brand_id dept_id hsn_id",
      populate: [
        { path: "brand_id", select: "name" },
        { path: "dept_id", select: "department_name" },
        { path: "hsn_id", select: "hsn_code" },
      ],
      sort: { item_name: 1 },
    });

    if (!result.data.length) {
      return result;
    }

    const itemIds = result.data
      .map((item) => item?._id)
      .filter(Boolean);

    const movementMatch = {
      user_id: new mongoose.Types.ObjectId(userId),
      "items.item_id": { $in: itemIds },
    };
    this._applyFinancialYear(movementMatch, query);

    if (isGst !== undefined && isGst !== null) {
      movementMatch.is_gst = Number(isGst);
    }

    const movementRows = await Challan.aggregate([
      { $match: movementMatch },
      { $unwind: "$items" },
      { $match: { "items.item_id": { $in: itemIds } } },
      { $sort: { date: -1, createdAt: -1 } },
      {
        $group: {
          _id: {
            item_id: "$items.item_id",
            challan_type: "$challan_type",
          },
          last_date: { $first: "$date" },
          last_contact_id: { $first: "$contact_id" },
          total_qty: { $sum: "$items.quantity" },
        },
      },
      {
        $lookup: {
          from: "contacts",
          localField: "last_contact_id",
          foreignField: "_id",
          as: "last_contact",
        },
      },
      {
        $unwind: {
          path: "$last_contact",
          preserveNullAndEmptyArrays: true,
        },
      },
    ]);

    const movementMap = new Map();
    movementRows.forEach((row) => {
      const itemKey = String(row?._id?.item_id || row?._id || "");
      if (!itemKey) return;

      const current = movementMap.get(itemKey) || {
        last_stock_added_at: null,
        last_stock_sold_at: null,
        total_qty_purchased: 0,
        total_qty_sold: 0,
      };

      if (row?._id?.challan_type === "purchase") {
        current.last_stock_added_at = row.last_date || current.last_stock_added_at;
        current.last_supplier_name = row.last_contact?.name || current.last_supplier_name || "";
        current.total_qty_purchased = Number(row.total_qty || current.total_qty_purchased || 0);
      }

      if (row?._id?.challan_type === "sale") {
        current.last_stock_sold_at = row.last_date || current.last_stock_sold_at;
        current.last_party_name = row.last_contact?.name || current.last_party_name || "";
        current.total_qty_sold = Number(row.total_qty || current.total_qty_sold || 0);
      }

      movementMap.set(itemKey, current);
    });

    result.data = result.data.map((item) => {
      const movement = movementMap.get(String(item._id)) || {};
      return {
        ...item,
        last_stock_added_at: movement.last_stock_added_at || null,
        last_stock_sold_at: movement.last_stock_sold_at || null,
        last_supplier_name: movement.last_supplier_name || "",
        last_party_name: movement.last_party_name || "",
        total_qty_purchased: movement.total_qty_purchased || 0,
        total_qty_sold: movement.total_qty_sold || 0,
      };
    });

    return result;
  }

  /**
   * 2. ITEM MOVEMENT (IN / OUT) — per-item, shows each challan entry
   *    with party/supplier name, date, qty, rate, amount.
   *    type filter: "sale" | "purchase" | omit for both.
   */
  async getItemMovement(itemId, userId, isGst, query) {
    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      throw ApiError.badRequest("Invalid item ID");
    }

    const itemExists = await Item.exists({
      _id: itemId,
      user_id: new mongoose.Types.ObjectId(userId),
    });
    if (!itemExists) throw ApiError.notFound("Item not found");

    const { page, limit, skip, all } = Pagination.getParams(query);

    const matchStage = {
      user_id: new mongoose.Types.ObjectId(userId),
      "items.item_id": new mongoose.Types.ObjectId(itemId),
    };
    this._applyFinancialYear(matchStage, query);

    if (query.type === "sale" || query.type === "purchase") {
      matchStage.challan_type = query.type;
    }

    if (isGst !== undefined && isGst !== null) {
      matchStage.is_gst = Number(isGst);
    }

    if (query.from_date || query.to_date) {
      matchStage.date = {};
      if (query.from_date) matchStage.date.$gte = new Date(query.from_date);
      if (query.to_date) matchStage.date.$lte = new Date(query.to_date);
    }

    if (query.contact_id && mongoose.Types.ObjectId.isValid(query.contact_id)) {
      matchStage.contact_id = new mongoose.Types.ObjectId(query.contact_id);
    }

    const pipeline = [
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $match: {
          "items.item_id": new mongoose.Types.ObjectId(itemId),
        },
      },
      { $sort: { date: -1, createdAt: -1 } },
      {
        $facet: {
          data: [
            ...(all ? [] : [{ $skip: skip }, { $limit: limit }]),
            {
              $lookup: {
                from: "contacts",
                localField: "contact_id",
                foreignField: "_id",
                as: "contact",
              },
            },
            { $unwind: { path: "$contact", preserveNullAndEmptyArrays: true } },
            {
              $project: {
                _id: 0,
                challan_no: 1,
                challan_type: 1,
                date: 1,
                contact_name: "$contact.name",
                contact_type: "$contact.type",
                contact_city: "$contact.city",
                quantity: "$items.quantity",
                rate: "$items.rate",
                discount: "$items.discount",
                special_discount: "$items.special_discount",
                taxable_amount: "$items.taxable_amount",
                gst_percent: "$items.gst_percent",
                gst_amount: "$items.gst_amount",
                amount: "$items.amount",
              },
            },
          ],
          total: [{ $count: "count" }],
          totals: [
            {
              $group: {
                _id: null,
                total_qty_in: {
                  $sum: {
                    $cond: [
                      { $eq: ["$challan_type", "purchase"] },
                      "$items.quantity",
                      0,
                    ],
                  },
                },
                total_qty_out: {
                  $sum: {
                    $cond: [
                      { $eq: ["$challan_type", "sale"] },
                      "$items.quantity",
                      0,
                    ],
                  },
                },
                total_purchase_amount: {
                  $sum: {
                    $cond: [
                      { $eq: ["$challan_type", "purchase"] },
                      "$items.amount",
                      0,
                    ],
                  },
                },
                total_sale_amount: {
                  $sum: {
                    $cond: [
                      { $eq: ["$challan_type", "sale"] },
                      "$items.amount",
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ];

    const [result] = await Challan.aggregate(pipeline);

    const total = result.total[0]?.count || 0;
    const agg = result.totals[0] || {};

    return {
      data: result.data,
      meta: Pagination.createMeta(total, page, limit),
      totals: {
        qty_in: agg.total_qty_in || 0,
        qty_out: agg.total_qty_out || 0,
        purchase_amount: agg.total_purchase_amount || 0,
        sale_amount: agg.total_sale_amount || 0,
      },
    };
  }

  /**
   * 3. ITEM SUMMARY — aggregated stats across all (or filtered) items.
   *    Brand-wise breakdown, top movers, overall value.
   */
  async getItemSummary(userId, isGst, query) {
    const userOid = new mongoose.Types.ObjectId(userId);

    const challanMatch = { user_id: userOid };
    this._applyFinancialYear(challanMatch, query);
    if (isGst !== undefined && isGst !== null) {
      challanMatch.is_gst = Number(isGst);
    }
    if (query.from_date || query.to_date) {
      challanMatch.date = {};
      if (query.from_date) challanMatch.date.$gte = new Date(query.from_date);
      if (query.to_date) challanMatch.date.$lte = new Date(query.to_date);
    }

    const itemMatch = { user_id: userOid };
    if (query.brand_id && mongoose.Types.ObjectId.isValid(query.brand_id)) {
      itemMatch.brand_id = new mongoose.Types.ObjectId(query.brand_id);
    }

    // overall item counts + stock value
    const [itemStats] = await Item.aggregate([
      { $match: itemMatch },
      {
        $group: {
          _id: null,
          total_items: { $sum: 1 },
          total_stock: { $sum: "$physical_stock" },
          total_stock_value: {
            $sum: { $multiply: ["$physical_stock", "$purchase_rate"] },
          },
          total_sale_value: {
            $sum: { $multiply: ["$physical_stock", "$sale_rate"] },
          },
        },
      },
    ]);

    // brand-wise item count and stock
    const brandBreakdown = await Item.aggregate([
      { $match: itemMatch },
      {
        $group: {
          _id: "$brand_id",
          item_count: { $sum: 1 },
          total_stock: { $sum: "$physical_stock" },
          stock_value: {
            $sum: { $multiply: ["$physical_stock", "$purchase_rate"] },
          },
        },
      },
      {
        $lookup: {
          from: "brands",
          localField: "_id",
          foreignField: "_id",
          as: "brand",
        },
      },
      {
        $unwind: { path: "$brand", preserveNullAndEmptyArrays: true },
      },
      {
        $project: {
          _id: 0,
          brand_id: "$_id",
          brand_name: { $ifNull: ["$brand.name", "Unassigned"] },
          item_count: 1,
          total_stock: 1,
          stock_value: 1,
        },
      },
      { $sort: { stock_value: -1 } },
    ]);

    // restrict movement aggregation to selected items (brand filter)
    let itemIdFilter = null;
    if (query.brand_id && mongoose.Types.ObjectId.isValid(query.brand_id)) {
      const itemIds = await Item.find(itemMatch).distinct("_id");
      itemIdFilter = itemIds;
    }

    const movementMatch = { ...challanMatch };
    if (itemIdFilter) {
      movementMatch["items.item_id"] = { $in: itemIdFilter };
    }

    // top sold items
    const topSold = await Challan.aggregate([
      { $match: { ...movementMatch, challan_type: "sale" } },
      { $unwind: "$items" },
      ...(itemIdFilter ?
        [{ $match: { "items.item_id": { $in: itemIdFilter } } }]
      : []),
      {
        $group: {
          _id: "$items.item_id",
          total_qty: { $sum: "$items.quantity" },
          total_amount: { $sum: "$items.amount" },
        },
      },
      { $sort: { total_qty: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $project: {
          _id: 0,
          item_id: "$_id",
          item_name: "$item.item_name",
          barcode: "$item.barcode",
          total_qty: 1,
          total_amount: 1,
        },
      },
    ]);

    // top purchased items
    const topPurchased = await Challan.aggregate([
      { $match: { ...movementMatch, challan_type: "purchase" } },
      { $unwind: "$items" },
      ...(itemIdFilter ?
        [{ $match: { "items.item_id": { $in: itemIdFilter } } }]
      : []),
      {
        $group: {
          _id: "$items.item_id",
          total_qty: { $sum: "$items.quantity" },
          total_amount: { $sum: "$items.amount" },
        },
      },
      { $sort: { total_qty: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "items",
          localField: "_id",
          foreignField: "_id",
          as: "item",
        },
      },
      { $unwind: "$item" },
      {
        $project: {
          _id: 0,
          item_id: "$_id",
          item_name: "$item.item_name",
          barcode: "$item.barcode",
          total_qty: 1,
          total_amount: 1,
        },
      },
    ]);

    // overall movement totals
    const [movementTotals] = await Challan.aggregate([
      { $match: movementMatch },
      { $unwind: "$items" },
      ...(itemIdFilter ?
        [{ $match: { "items.item_id": { $in: itemIdFilter } } }]
      : []),
      {
        $group: {
          _id: null,
          total_qty_sold: {
            $sum: {
              $cond: [{ $eq: ["$challan_type", "sale"] }, "$items.quantity", 0],
            },
          },
          total_qty_purchased: {
            $sum: {
              $cond: [
                { $eq: ["$challan_type", "purchase"] },
                "$items.quantity",
                0,
              ],
            },
          },
          total_sale_amount: {
            $sum: {
              $cond: [{ $eq: ["$challan_type", "sale"] }, "$items.amount", 0],
            },
          },
          total_purchase_amount: {
            $sum: {
              $cond: [
                { $eq: ["$challan_type", "purchase"] },
                "$items.amount",
                0,
              ],
            },
          },
        },
      },
    ]);

    return {
      items: {
        total_items: itemStats?.total_items || 0,
        total_stock: itemStats?.total_stock || 0,
        stock_value_at_purchase: itemStats?.total_stock_value || 0,
        stock_value_at_sale: itemStats?.total_sale_value || 0,
      },
      movement: {
        total_qty_sold: movementTotals?.total_qty_sold || 0,
        total_qty_purchased: movementTotals?.total_qty_purchased || 0,
        total_sale_amount: movementTotals?.total_sale_amount || 0,
        total_purchase_amount: movementTotals?.total_purchase_amount || 0,
      },
      brand_breakdown: brandBreakdown,
      top_sold: topSold,
      top_purchased: topPurchased,
    };
  }
}

const itemLedgerService = new ItemLedgerService();
export default itemLedgerService;
