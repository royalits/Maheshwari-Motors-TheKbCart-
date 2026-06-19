import Item from "../../models/master/item.model.js";
import { ApiError } from "../../utils/index.js";
import { emitStockUpdate } from "../realtime/socket.service.js";

class StockService {
  _buildFilter(itemId, ownerId) {
    const filter = { _id: itemId };
    if (ownerId) filter.user_id = ownerId;
    return filter;
  }

  _normalizeIsGst(value, fallback = 1) {
    if (value === undefined || value === null || value === "") {
      return Number(fallback) === 1 ? 1 : 0;
    }

    if (typeof value === "boolean") return value ? 1 : 0;

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "gst"].includes(normalized)) return 1;
      if (["0", "false", "nongst", "non_gst", "non-gst"].includes(normalized)) {
        return 0;
      }
    }

    return Number(value) === 1 ? 1 : 0;
  }

  _quantity(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  _number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  async _emitSyncedStock(ownerId, itemDoc) {
    if (!itemDoc) return;

    const physicalStock = this._number(itemDoc.physical_stock);
    if (this._number(itemDoc.stock) !== physicalStock) {
      itemDoc.stock = physicalStock;
      await itemDoc.save();
    }

    emitStockUpdate(ownerId, itemDoc);
  }

  _consumeOpeningFirst(dbItem, quantity, stockKey) {
    const openingKey =
      stockKey === "logical_stock" ?
        "opening_logical_stock"
      : "opening_physical_stock";

    const remainingToDeduct = Math.max(0, this._quantity(quantity));
    const openingStock = Math.max(0, this._number(dbItem?.[openingKey]));
    const openingToConsume = Math.min(openingStock, remainingToDeduct);
    const currentToConsume = remainingToDeduct - openingToConsume;

    return {
      [openingKey]: -openingToConsume,
      [stockKey]: -currentToConsume,
    };
  }

  async _adjustStock(items, ownerId, { physical = 0, logical = 0 }) {
    for (const item of items || []) {
      const quantity = this._quantity(item.quantity);
      if (quantity === 0) continue;

      const physicalDelta = quantity * physical;
      const logicalDelta = quantity * logical;
      if (physicalDelta === 0 && logicalDelta === 0) continue;

      const filter = this._buildFilter(item.item_id, ownerId);
      const exists = await Item.exists(filter);
      if (!exists) {
        throw ApiError.notFound(`Item ${item.item_id} not found`);
      }

      const inc = {};
      if (physicalDelta !== 0) {
        inc.physical_stock = physicalDelta;
      }
      if (logicalDelta !== 0) inc.logical_stock = logicalDelta;

      const updatedItem = await Item.findOneAndUpdate(
        filter,
        { $inc: inc },
        { new: true },
      ).select(
        "item_id stock physical_stock logical_stock opening_physical_stock opening_logical_stock",
      );
      await this._emitSyncedStock(ownerId, updatedItem);
    }
  }

  async _deductOpeningFirst(
    items,
    ownerId,
    { physical = false, logical = false },
  ) {
    for (const item of items || []) {
      const quantity = this._quantity(item.quantity);
      if (quantity === 0) continue;

      if (quantity < 0) {
        await this._adjustStock([item], ownerId, {
          physical: physical ? -1 : 0,
          logical: logical ? -1 : 0,
        });
        continue;
      }

      const filter = this._buildFilter(item.item_id, ownerId);
      const dbItem = await Item.findOne(filter)
        .select(
          "physical_stock logical_stock opening_physical_stock opening_logical_stock",
        )
        .lean();

      if (!dbItem) {
        throw ApiError.notFound(`Item ${item.item_id} not found`);
      }

      const inc = {};
      if (physical) {
        Object.assign(
          inc,
          this._consumeOpeningFirst(dbItem, quantity, "physical_stock"),
        );
      }
      if (logical) {
        Object.assign(
          inc,
          this._consumeOpeningFirst(dbItem, quantity, "logical_stock"),
        );
      }

      const updatedItem = await Item.findOneAndUpdate(
        filter,
        { $inc: inc },
        { new: true },
      ).select(
        "item_id stock physical_stock logical_stock opening_physical_stock opening_logical_stock",
      );
      await this._emitSyncedStock(ownerId, updatedItem);
    }
  }

  async deductStockForChallan(items, ownerId) {
    // Sale challan: consume OPS first, then PS. Negative quantities reverse into PS.
    await this._deductOpeningFirst(items, ownerId, { physical: true });
  }

  async adjustStock(items, ownerId, deltas) {
    await this._adjustStock(items, ownerId, deltas);
  }

  async addStockForChallan(items, ownerId) {
    // Purchase challan: PS += PCS. Negative quantities reverse the operation.
    await this._adjustStock(items, ownerId, { physical: 1 });
  }

  async deductStockForBill(items, ownerId, _firmIsGst = 1, deduct = 1) {
    // Sale bill: deduct ON consumes OPS/PS and OLS/LS; deduct OFF consumes OLS/LS.
    const deductFlag = Number(deduct) === 1 ? 1 : 0;
    await this._deductOpeningFirst(items, ownerId, {
      physical: deductFlag === 1,
      logical: true,
    });
  }

  async addStockForBill(items, ownerId, firmIsGst = 1) {
    // Purchase bill: GST firm => PS += PCS and LS += PCS; NONGST firm => PS += PCS.
    const firm = this._normalizeIsGst(firmIsGst, 1);
    await this._adjustStock(items, ownerId, {
      physical: 1,
      logical: firm === 1 ? 1 : 0,
    });
  }

  async deductStock(items, ownerId, challanIsGst = 1, isBill = false) {
    if (!isBill) {
      await this.deductStockForChallan(items, ownerId);
      return;
    }
    await this.deductStockForBill(items, ownerId, challanIsGst, 1);
  }

  async addStock(items, ownerId, challanIsGst = 1, isBill = false) {
    if (!isBill) {
      await this.addStockForChallan(items, ownerId);
      return;
    }
    await this.addStockForBill(items, ownerId, challanIsGst);
  }

  async removeStock(items, ownerId) {
    await this.addStockForChallan(
      (items || []).map((item) => ({
        item_id: item.item_id,
        quantity: -this._quantity(item.quantity),
      })),
      ownerId,
    );
  }

  async restoreStock(items, ownerId) {
    await this.deductStockForChallan(
      (items || []).map((item) => ({
        item_id: item.item_id,
        quantity: -this._quantity(item.quantity),
      })),
      ownerId,
    );
  }
}

export default new StockService();
