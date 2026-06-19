import mongoose from "mongoose";
import Return from "../../models/transaction/return.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Challan from "../../models/transaction/challan.model.js";
import Contact from "../../models/master/contact.model.js";
import Item from "../../models/master/item.model.js";
import stockService from "../inventory/stock.service.js";
import { ApiError, Pagination, toNumber } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

const RETURN_POPULATE = [
  { path: "contact_id", select: "name phone type balance" },
  { path: "bill_id", select: "bill_no amount paid_amount payment_status" },
  { path: "challan_id", select: "challan_no amount challan_type" },
  {
    path: "items.item_id",
    select:
      "item_name alias description hsn_id barcode sale_rate physical_stock logical_stock",
  },
];

class ReturnService {
  _round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  _getDamageCounts(items = []) {
    let damaged_count = 0;
    let not_damaged_count = 0;
    let damaged_quantity = 0;
    let not_damaged_quantity = 0;

    for (const item of items) {
      const qty = Number(item.quantity) || 0;
      if (item.is_damaged) {
        damaged_count++;
        damaged_quantity += qty;
      } else {
        not_damaged_count++;
        not_damaged_quantity += qty;
      }
    }

    return {
      damaged_count,
      not_damaged_count,
      damaged_quantity,
      not_damaged_quantity,
    };
  }

  _attachDamageCounts(doc) {
    const obj = doc.toJSON ? doc.toJSON() : { ...doc };
    return { ...obj, ...this._getDamageCounts(obj.items) };
  }

  _normalizeBillReturnLine(line) {
    if (!line?.item_id) return null;
    const itemId = line.item_id?._id || line.item_id;
    if (!itemId) return null;

    return {
      item_id: itemId,
      quantity: Number(line.quantity) || 0,
      rate: Number(line.rate) || 0,
      discount: Number(line.discount) || 0,
      special_discount: Number(line.special_discount) || 0,
      item_discount: Number(line.item_discount) || 0,
      item_dis2: Number(line.item_dis2) || 0,
      dis3: Number(line.dis3) || 0,
      gross_amount: Number(line.gross_amount) || 0,
      discount_amount: Number(line.discount_amount) || 0,
      total_discount: Number(line.total_discount) || 0,
      taxable_amount: Number(line.taxable_amount) || 0,
      gst_percent: Number(line.gst_percent) || 0,
      gst_amount: Number(line.gst_amount) || 0,
      amount: Number(line.amount) || 0,
      is_gst: Number(line.is_gst) === 1 ? 1 : 0,
    };
  }

  _getBillReturnLines(bill) {
    const autoItems =
      Array.isArray(bill.auto_bill_items) ? bill.auto_bill_items : [];
    if (bill.is_auto_bill && autoItems.length > 0) {
      return autoItems
        .map((line) => this._normalizeBillReturnLine(line))
        .filter(Boolean);
    }

    return (bill.challan_ids || [])
      .flatMap((challan) => (Array.isArray(challan.items) ? challan.items : []))
      .map((line) => this._normalizeBillReturnLine(line))
      .filter(Boolean);
  }

  _buildBillItemReturnRefs(bill) {
    const refs = new Map();

    for (const line of this._getBillReturnLines(bill)) {
      const key = String(line.item_id);
      if (!refs.has(key)) {
        refs.set(key, { ...line });
        continue;
      }

      const existing = refs.get(key);
      existing.quantity += line.quantity;
      existing.gross_amount += line.gross_amount;
      existing.discount_amount += line.discount_amount;
      existing.total_discount += line.total_discount;
      existing.taxable_amount += line.taxable_amount;
      existing.gst_amount += line.gst_amount;
      existing.amount += line.amount;
    }

    return refs;
  }

  _resolvePaymentStatus(
    amount,
    paidAmount,
    settlementDiscount = 0,
    returnAmount = 0,
  ) {
    const due = this._round(
      (amount || 0) -
        (paidAmount || 0) -
        (settlementDiscount || 0) -
        (returnAmount || 0),
    );

    if (Math.abs(due) < 0.01) return "paid";
    if (due > 0) return "due";
    return "overpaid";
  }

  _scaleReturnAmount(sourceAmount, sourceQuantity, returnQuantity) {
    if (!sourceQuantity) return 0;
    return this._round(
      (Number(sourceAmount) || 0) * (returnQuantity / sourceQuantity),
    );
  }

  _processReturnItems(items, referenceMap = null) {
    return items.map((item, idx) => {
      const ref = referenceMap?.get(String(item.item_id));
      const quantity = toNumber(item.quantity ?? 1, `items[${idx}].quantity`, {
        min: 1,
      });

      if (ref) {
        const sourceQuantity = Number(ref.quantity) || 0;
        return {
          item_id: item.item_id,
          quantity,
          rate: Number(ref.rate) || 0,
          discount: Number(ref.discount) || 0,
          special_discount: Number(ref.special_discount) || 0,
          item_discount: Number(ref.item_discount) || 0,
          item_dis2: Number(ref.item_dis2) || 0,
          dis3: Number(ref.dis3) || 0,
          gross_amount: this._scaleReturnAmount(
            ref.gross_amount,
            sourceQuantity,
            quantity,
          ),
          discount_amount: this._scaleReturnAmount(
            ref.discount_amount,
            sourceQuantity,
            quantity,
          ),
          total_discount: this._scaleReturnAmount(
            ref.total_discount,
            sourceQuantity,
            quantity,
          ),
          gst_percent: Number(ref.gst_percent) || 0,
          gst_amount: this._scaleReturnAmount(
            ref.gst_amount,
            sourceQuantity,
            quantity,
          ),
          taxable_amount: this._scaleReturnAmount(
            ref.taxable_amount,
            sourceQuantity,
            quantity,
          ),
          amount: this._scaleReturnAmount(ref.amount, sourceQuantity, quantity),
          is_damaged: item.is_damaged === true,
          is_gst: ref.is_gst ?? 1,
        };
      }

      return {
        item_id: item.item_id,
        quantity,
        rate: toNumber(item.rate, `items[${idx}].rate`, { min: 0 }),
        discount: toNumber(item.discount ?? 0, `items[${idx}].discount`, {
          min: 0,
          max: 100,
        }),
        special_discount: toNumber(
          item.special_discount ?? 0,
          `items[${idx}].special_discount`,
          { min: 0, max: 100 },
        ),
        item_discount: toNumber(
          item.item_discount ?? 0,
          `items[${idx}].item_discount`,
          {
            min: 0,
            max: 100,
          },
        ),
        item_dis2: toNumber(item.item_dis2 ?? 0, `items[${idx}].item_dis2`, {
          min: 0,
          max: 100,
        }),
        dis3: toNumber(item.dis3 ?? 0, `items[${idx}].dis3`, { min: 0 }),
        gross_amount: toNumber(
          item.gross_amount ?? 0,
          `items[${idx}].gross_amount`,
        ),
        discount_amount: toNumber(
          item.discount_amount ?? 0,
          `items[${idx}].discount_amount`,
        ),
        total_discount: toNumber(
          item.total_discount ?? 0,
          `items[${idx}].total_discount`,
        ),
        gst_percent: toNumber(
          item.gst_percent ?? 0,
          `items[${idx}].gst_percent`,
          { min: 0, max: 100 },
        ),
        gst_amount: toNumber(item.gst_amount ?? 0, `items[${idx}].gst_amount`),
        taxable_amount: toNumber(
          item.taxable_amount ?? 0,
          `items[${idx}].taxable_amount`,
        ),
        amount: toNumber(item.amount ?? 0, `items[${idx}].amount`),
        is_damaged: item.is_damaged === true,
        is_gst: item.is_gst ?? 1,
      };
    });
  }

  async getReturns(userId, isGst, query) {
    const filter = { user_id: userId, is_gst: isGst };

    if (query.financial_year_id)
      filter.financial_year_id = query.financial_year_id;
    if (query.return_type) filter.return_type = query.return_type;
    if (query.contact_id) filter.contact_id = query.contact_id;
    if (query.bill_id) filter.bill_id = query.bill_id;
    if (query.challan_id) filter.challan_id = query.challan_id;

    if (query.from_date || query.to_date) {
      filter.date = {};
      if (query.from_date) filter.date.$gte = new Date(query.from_date);
      if (query.to_date) filter.date.$lte = new Date(query.to_date);
    }

    const result = await Pagination.paginate(Return, filter, {
      ...query,
      populate: RETURN_POPULATE,
      sort: { createdAt: -1 },
    });

    if (result.docs) {
      result.docs = result.docs.map((d) => this._attachDamageCounts(d));
    } else if (Array.isArray(result.data)) {
      result.data = result.data.map((d) => this._attachDamageCounts(d));
    }

    return result;
  }

  async getReturnById(returnId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: returnId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const doc = await Return.findOne(filter).populate(RETURN_POPULATE);

    if (!doc) throw ApiError.notFound("Return not found");
    return this._attachDamageCounts(doc);
  }

  async createSaleReturn(data, userId, isGst) {
    const { bill_id, items, note, date, financial_year_id } = data;

    if (!bill_id) {
      throw ApiError.badRequest("bill_id is required for sale return");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest("At least one item is required");
    }

    const bill = await Bill.findOne({
      _id: bill_id,
      user_id: userId,
      is_gst: isGst,
      ...(financial_year_id ? { financial_year_id } : {}),
    })
      .populate({
        path: "challan_ids",
        select: "items",
      })
      .populate({
        path: "auto_bill_items.item_id",
        select: "_id",
      });

    if (!bill) throw ApiError.notFound("Bill not found");

    const billedItemMap = this._buildBillItemReturnRefs(bill);

    const existingReturns = await Return.find({
      bill_id,
      user_id: userId,
      return_type: "sale_return",
      ...(financial_year_id ? { financial_year_id } : {}),
    })
      .select("items")
      .lean();

    const returnedItemMap = new Map();
    for (const ret of existingReturns) {
      for (const line of ret.items || []) {
        const key = String(line.item_id);
        const existing = returnedItemMap.get(key) || 0;
        returnedItemMap.set(key, existing + (line.quantity || 0));
      }
    }

    const itemIds = [...new Set(items.map((i) => String(i.item_id)))];
    const dbItems = await Item.find({
      _id: { $in: itemIds },
      user_id: userId,
    })
      .select("_id item_name")
      .lean();

    if (dbItems.length !== itemIds.length) {
      throw ApiError.badRequest(
        "One or more items are invalid or do not belong to your account",
      );
    }

    for (const item of items) {
      const key = String(item.item_id);
      const billedQty = billedItemMap.get(key)?.quantity || 0;
      const alreadyReturned = returnedItemMap.get(key) || 0;
      const returnableQty = billedQty - alreadyReturned;
      const requestedQty = Number(item.quantity) || 0;

      if (billedQty === 0) {
        throw ApiError.badRequest(
          `Item '${key}' was not part of this bill's challans`,
        );
      }

      if (requestedQty > returnableQty) {
        throw ApiError.badRequest(
          `Return quantity for item '${key}' exceeds returnable quantity. Billed: ${billedQty}, Already returned: ${alreadyReturned}, Requested: ${requestedQty}`,
        );
      }
    }

    const processedItems = this._processReturnItems(items, billedItemMap);
    const totalAmount = Math.ceil(
      processedItems.reduce((sum, i) => sum + i.amount, 0),
    );

    const nonDamagedItems = processedItems.filter((i) => !i.is_damaged);
    if (nonDamagedItems.length > 0) {
      await stockService.restoreStock(nonDamagedItems, userId, isGst);
    }

    const paymentStatus = this._resolvePaymentStatus(
      bill.amount,
      bill.paid_amount || 0,
      bill.settlement_discount || 0,
      (bill.return_amount || 0) + totalAmount,
    );

    await Bill.findByIdAndUpdate(bill_id, {
      payment_status: paymentStatus,
      $inc: { return_amount: totalAmount },
    });

    await Contact.findByIdAndUpdate(bill.contact_id, {
      $inc: { balance: totalAmount },
    });

    const seqKey = `ReturnNo_${isGst === 1 ? "GST" : "NONGST"}`;
    const returnNoSeq = await getNextId(seqKey, userId);
    const return_no = `SR-${String(returnNoSeq).padStart(6, "0")}`;
    const nextId = await getNextId("Return", userId);

    const returnDoc = await Return.create({
      id: nextId,
      return_no,
      return_type: "sale_return",
      date: date || new Date(),
      contact_id: bill.contact_id,
      bill_id,
      items: processedItems,
      total_amount: totalAmount,
      note: note || "",
      is_gst: isGst,
      financial_year_id: financial_year_id || null,
      user_id: userId,
    });

    await returnDoc.populate(RETURN_POPULATE);
    return this._attachDamageCounts(returnDoc);
  }

  async createPurchaseReturn(data, userId, isGst) {
    const { bill_id, items, note, date, financial_year_id } = data;

    if (!bill_id) {
      throw ApiError.badRequest("bill_id is required for purchase return");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest("At least one item is required");
    }

    const bill = await Bill.findOne({
      _id: bill_id,
      user_id: userId,
      is_gst: isGst,
      contact_type: "supplier",
      ...(financial_year_id ? { financial_year_id } : {}),
    })
      .populate({
        path: "challan_ids",
        select: "items",
      })
      .populate({
        path: "auto_bill_items.item_id",
        select: "_id",
      });

    if (!bill) throw ApiError.notFound("Purchase bill not found");

    const purchasedItemMap = this._buildBillItemReturnRefs(bill);

    const existingReturns = await Return.find({
      bill_id,
      user_id: userId,
      return_type: "purchase_return",
      ...(financial_year_id ? { financial_year_id } : {}),
    })
      .select("items")
      .lean();

    const returnedItemMap = new Map();
    for (const ret of existingReturns) {
      for (const line of ret.items || []) {
        const key = String(line.item_id);
        const existing = returnedItemMap.get(key) || 0;
        returnedItemMap.set(key, existing + (line.quantity || 0));
      }
    }

    const itemIds = [...new Set(items.map((i) => String(i.item_id)))];
    const dbItems = await Item.find({
      _id: { $in: itemIds },
      user_id: userId,
    })
      .select("_id item_name")
      .lean();

    if (dbItems.length !== itemIds.length) {
      throw ApiError.badRequest(
        "One or more items are invalid or do not belong to your account",
      );
    }

    for (const item of items) {
      const key = String(item.item_id);
      const purchasedQty = purchasedItemMap.get(key)?.quantity || 0;
      const alreadyReturned = returnedItemMap.get(key) || 0;
      const returnableQty = purchasedQty - alreadyReturned;
      const requestedQty = Number(item.quantity) || 0;

      if (purchasedQty === 0) {
        throw ApiError.badRequest(
          `Item '${key}' was not part of this purchase bill`,
        );
      }

      if (requestedQty > returnableQty) {
        throw ApiError.badRequest(
          `Return quantity for item '${key}' exceeds returnable quantity. Purchased: ${purchasedQty}, Already returned: ${alreadyReturned}, Requested: ${requestedQty}`,
        );
      }
    }

    const processedItems = this._processReturnItems(items, purchasedItemMap);
    const totalAmount = Math.ceil(
      processedItems.reduce((sum, i) => sum + i.amount, 0),
    );

    await stockService.removeStock(processedItems, userId, isGst);

    const paymentStatus = this._resolvePaymentStatus(
      bill.amount,
      bill.paid_amount || 0,
      bill.settlement_discount || 0,
      (bill.return_amount || 0) + totalAmount,
    );

    await Bill.findByIdAndUpdate(bill_id, {
      payment_status: paymentStatus,
      $inc: { return_amount: totalAmount },
    });

    const seqKey = `PurchaseReturnNo_${isGst === 1 ? "GST" : "NONGST"}`;
    const returnNoSeq = await getNextId(seqKey, userId);
    const return_no = `PR-${String(returnNoSeq).padStart(6, "0")}`;
    const nextId = await getNextId("Return", userId);

    const returnDoc = await Return.create({
      id: nextId,
      return_no,
      return_type: "purchase_return",
      date: date || new Date(),
      contact_id: bill.contact_id,
      bill_id,
      items: processedItems,
      total_amount: totalAmount,
      note: note || "",
      is_gst: isGst,
      financial_year_id: financial_year_id || null,
      user_id: userId,
    });

    await returnDoc.populate(RETURN_POPULATE);
    return this._attachDamageCounts(returnDoc);
  }

  async getReturnsForBill(billId, userId, isGst, financialYearId = null) {
    const filter = {
      bill_id: billId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const returns = await Return.find(filter)
      .populate(RETURN_POPULATE)
      .sort({ createdAt: -1 });

    return returns.map((d) => this._attachDamageCounts(d));
  }

  async getReturnsForChallan(challanId, userId, isGst, financialYearId = null) {
    const filter = {
      challan_id: challanId,
      user_id: userId,
      is_gst: isGst,
      return_type: "purchase_return",
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const returns = await Return.find(filter)
      .populate(RETURN_POPULATE)
      .sort({ createdAt: -1 });

    return returns.map((d) => this._attachDamageCounts(d));
  }

  async getReturnSummary(userId, isGst, query) {
    const match = {
      user_id: new mongoose.Types.ObjectId(userId),
      is_gst: isGst,
    };

    if (query.financial_year_id) {
      match.financial_year_id = new mongoose.Types.ObjectId(
        query.financial_year_id,
      );
    }
    if (query.return_type) match.return_type = query.return_type;
    if (query.contact_id)
      match.contact_id = new mongoose.Types.ObjectId(query.contact_id);
    if (query.bill_id)
      match.bill_id = new mongoose.Types.ObjectId(query.bill_id);
    if (query.challan_id)
      match.challan_id = new mongoose.Types.ObjectId(query.challan_id);

    const [result] = await Return.aggregate([
      { $match: match },
      { $unwind: "$items" },
      {
        $group: {
          _id: null,
          total_returns: { $addToSet: "$_id" },
          total_items: { $sum: 1 },
          total_quantity: { $sum: "$items.quantity" },
          total_amount: { $sum: "$items.amount" },
          damaged_items: {
            $sum: { $cond: ["$items.is_damaged", 1, 0] },
          },
          damaged_quantity: {
            $sum: {
              $cond: ["$items.is_damaged", "$items.quantity", 0],
            },
          },
          damaged_amount: {
            $sum: {
              $cond: ["$items.is_damaged", "$items.amount", 0],
            },
          },
          not_damaged_items: {
            $sum: { $cond: ["$items.is_damaged", 0, 1] },
          },
          not_damaged_quantity: {
            $sum: {
              $cond: ["$items.is_damaged", 0, "$items.quantity"],
            },
          },
          not_damaged_amount: {
            $sum: {
              $cond: ["$items.is_damaged", 0, "$items.amount"],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          total_returns: { $size: "$total_returns" },
          total_items: 1,
          total_quantity: 1,
          total_amount: { $round: ["$total_amount", 2] },
          damaged_items: 1,
          damaged_quantity: 1,
          damaged_amount: { $round: ["$damaged_amount", 2] },
          not_damaged_items: 1,
          not_damaged_quantity: 1,
          not_damaged_amount: { $round: ["$not_damaged_amount", 2] },
        },
      },
    ]);

    return (
      result || {
        total_returns: 0,
        total_items: 0,
        total_quantity: 0,
        total_amount: 0,
        damaged_items: 0,
        damaged_quantity: 0,
        damaged_amount: 0,
        not_damaged_items: 0,
        not_damaged_quantity: 0,
        not_damaged_amount: 0,
      }
    );
  }

  async deleteReturn(returnId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: returnId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const doc = await Return.findOne(filter);

    if (!doc) throw ApiError.notFound("Return not found");

    if (doc.return_type === "sale_return") {
      const nonDamagedItems = doc.items.filter((i) => !i.is_damaged);
      if (nonDamagedItems.length > 0) {
        await stockService.deductStock(nonDamagedItems, userId, isGst);
      }

      if (doc.bill_id) {
        const bill = await Bill.findById(doc.bill_id);
        if (bill) {
          const paymentStatus = this._resolvePaymentStatus(
            bill.amount,
            bill.paid_amount || 0,
            bill.settlement_discount || 0,
            Math.max(0, (bill.return_amount || 0) - doc.total_amount),
          );

          await Bill.findByIdAndUpdate(doc.bill_id, {
            payment_status: paymentStatus,
            $inc: { return_amount: -doc.total_amount },
          });
        }

        await Contact.findByIdAndUpdate(doc.contact_id, {
          $inc: { balance: -doc.total_amount },
        });
      }
    } else if (doc.return_type === "purchase_return") {
      await stockService.addStock(doc.items, userId, isGst);

      if (doc.bill_id) {
        const bill = await Bill.findById(doc.bill_id);
        if (bill) {
          const paymentStatus = this._resolvePaymentStatus(
            bill.amount,
            bill.paid_amount || 0,
            bill.settlement_discount || 0,
            Math.max(0, (bill.return_amount || 0) - doc.total_amount),
          );

          await Bill.findByIdAndUpdate(doc.bill_id, {
            payment_status: paymentStatus,
            $inc: { return_amount: -doc.total_amount },
          });
        }
      } else if (doc.challan_id) {
        const challan = await Challan.findById(doc.challan_id);
        if (challan) {
          const restoredAmount = this._round(challan.amount + doc.total_amount);
          const paidAmount = challan.paid_amount || 0;
          let paymentStatus;
          if (Math.abs(paidAmount - restoredAmount) < 0.01) {
            paymentStatus = "paid";
          } else if (paidAmount < restoredAmount) {
            paymentStatus = "due";
          } else {
            paymentStatus = "overpaid";
          }

          await Challan.findByIdAndUpdate(doc.challan_id, {
            amount: restoredAmount,
            payment_status: paymentStatus,
          });
        }
      }
    }

    await Return.findByIdAndDelete(returnId);
  }
}

export default new ReturnService();
