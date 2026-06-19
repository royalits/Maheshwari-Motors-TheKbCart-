import mongoose from "mongoose";
import Challan from "../../models/transaction/challan.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Item from "../../models/master/item.model.js";
import Contact from "../../models/master/contact.model.js";
import Label from "../../models/master/label.model.js";
import bankService from "../master/bank.service.js";
import { ApiError, Pagination, toNumber } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";
import stockService from "../inventory/stock.service.js";
import { emitChallanUpdate } from "../realtime/socket.service.js";

class ChallanService {
  _round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  _roundNetAmount(value) {
    return Math.ceil(Number(value) || 0);
  }

  _formatChallanNo(sequence) {
    return String(Math.max(0, Number(sequence) || 0)).padStart(6, "0");
  }

  _extractChallanSerial(challanNo) {
    const match = String(challanNo || "")
      .trim()
      .match(/^(\d+)$/);
    return match ? Number(match[1]) : null;
  }

  _normalizeDeductFromStock(value, fallback = 1) {
    if (value === undefined || value === null || value === "") {
      return Number(fallback) === 1 ? 1 : 0;
    }
    return Number(value) === 1 ? 1 : 0;
  }

  async _getMaxExistingChallanSerial(userId) {
    const [row] = await Challan.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(String(userId)),
          challan_no: { $regex: /^\d+$/ },
        },
      },
      {
        $project: {
          serial: { $toInt: "$challan_no" },
        },
      },
      {
        $group: {
          _id: null,
          max_serial: { $max: "$serial" },
        },
      },
    ]);

    return Number(row?.max_serial || 0);
  }

  async _consumeNextChallanNo(userId) {
    const maxExistingSerial = await this._getMaxExistingChallanSerial(userId);
    return this._formatChallanNo(maxExistingSerial + 1);
  }

  _validateCreateChallanPayload(challanData, challanType) {
    if (!challanType || !["sale", "purchase"].includes(challanType)) {
      throw ApiError.badRequest(
        "challan_type must be either 'sale' or 'purchase'",
      );
    }

    if (!challanData || typeof challanData !== "object") {
      throw ApiError.badRequest("Invalid challan payload");
    }

    if (!challanData.contact_id) {
      throw ApiError.badRequest("contact_id is required");
    }

    if (!mongoose.Types.ObjectId.isValid(challanData.contact_id)) {
      throw ApiError.badRequest("Invalid contact_id");
    }

    if (challanData.date !== undefined && challanData.date !== null) {
      const parsedDate = new Date(challanData.date);
      if (Number.isNaN(parsedDate.getTime())) {
        throw ApiError.badRequest("Invalid date format");
      }
    }

    if (challanData.print_option !== undefined) {
      const normalizedPrintOption = Number(challanData.print_option);
      if (![1, 2].includes(normalizedPrintOption)) {
        throw ApiError.badRequest("print_option must be 1 or 2");
      }
    }

    if (challanData.is_gst !== undefined) {
      const normalizedChallanGst = Number(challanData.is_gst);
      if (![0, 1].includes(normalizedChallanGst)) {
        throw ApiError.badRequest("is_gst must be 0 or 1");
      }
    }

    if (!Array.isArray(challanData.items) || challanData.items.length === 0) {
      throw ApiError.badRequest("At least one item is required");
    }

    challanData.items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        throw ApiError.badRequest(`items[${index}] must be an object`);
      }

      if (!item.item_id) {
        throw ApiError.badRequest(`items[${index}].item_id is required`);
      }

      if (!mongoose.Types.ObjectId.isValid(item.item_id)) {
        throw ApiError.badRequest(`items[${index}].item_id is invalid`);
      }
    });

    if (
      challanData.label_id &&
      !mongoose.Types.ObjectId.isValid(challanData.label_id)
    ) {
      throw ApiError.badRequest("Invalid label_id");
    }

    if (challanData.gross_total !== undefined) {
      toNumber(challanData.gross_total, "gross_total");
    }
    if (challanData.sub_total !== undefined) {
      toNumber(challanData.sub_total, "sub_total");
    }
    if (challanData.discount !== undefined) {
      toNumber(challanData.discount, "discount");
    }
    if (challanData.amount !== undefined) {
      toNumber(challanData.amount, "amount");
    }
  }

  _challanPopulate() {
    return [
      { path: "contact_id", select: "name alias phone type" },
      { path: "label_id", select: "name is_active" },
      {
        path: "items.item_id",
        select:
          "item_name alias description hsn_id stock physical_stock logical_stock",
      },
    ];
  }

  _attachLegacyLabelName(challan) {
    if (!challan) return challan;

    const normalized =
      typeof challan.toObject === "function" ?
        challan.toObject()
      : { ...challan };

    const populatedLabel =
      normalized.label_id && typeof normalized.label_id === "object" ?
        normalized.label_id
      : null;

    const legacyLabelName =
      populatedLabel?.name ||
      populatedLabel?.label_name ||
      (typeof normalized.label_name === "string" ?
        normalized.label_name.trim() || null
      : null);

    normalized.label_name = legacyLabelName;
    return normalized;
  }

  _attachLegacyLabelNames(challans = []) {
    return challans.map((challan) => this._attachLegacyLabelName(challan));
  }

  async _normalizeBankPayload(bankIdOrObj, userId) {
    if (!bankIdOrObj) return null;

    const bankId =
      typeof bankIdOrObj === "object" ? bankIdOrObj.bank_id : bankIdOrObj;
    if (!bankId) return null;

    return bankService.getBankSnapshot(bankId, userId);
  }

  async _resolveLabelId({
    labelId,
    labelName,
    userId,
    contact = null,
    requiredForSale = false,
  }) {
    let candidateLabelId = labelId;

    if (
      (candidateLabelId === undefined ||
        candidateLabelId === null ||
        candidateLabelId === "") &&
      typeof labelName === "string" &&
      labelName.trim()
    ) {
      const escaped = labelName.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const filter = {
        user_id: userId,
        name: { $regex: new RegExp(`^${escaped}$`, "i") },
      };

      const resolvedByName = await Label.findOne(filter).select("_id").lean();
      candidateLabelId = resolvedByName?._id || null;
    }

    if (
      candidateLabelId === undefined ||
      candidateLabelId === null ||
      candidateLabelId === ""
    ) {
      if (requiredForSale) {
        throw ApiError.badRequest("label_id is required for sale challan");
      }
      return null;
    }

    if (!mongoose.Types.ObjectId.isValid(candidateLabelId)) {
      throw ApiError.badRequest("Invalid label_id");
    }

    const label = await Label.findOne({
      _id: candidateLabelId,
      user_id: userId,
    })
      .select("_id")
      .lean();
    if (!label) {
      throw ApiError.badRequest(
        "Label not found for this account. Please select a valid label_id.",
      );
    }

    return label._id;
  }

  async _buildLabelItemDiscountLookup(labelId, userId) {
    if (!labelId) return null;

    const label = await Label.findOne({
      _id: labelId,
      user_id: userId,
    })
      .select("brand_discounts.item_discounts")
      .lean();

    if (!label) return null;

    const lookup = new Map();
    for (const brandDiscount of label.brand_discounts || []) {
      for (const itemDiscount of brandDiscount.item_discounts || []) {
        const itemId = itemDiscount?.item_id;
        if (!itemId) continue;

        const discount = Number(itemDiscount?.discount ?? 0);
        if (!Number.isFinite(discount) || discount <= 0) continue;

        lookup.set(String(itemId), discount);
      }
    }

    return lookup;
  }

  _processItems(items, challanIsGst, labelItemDiscountLookup = null) {
    const processedItems = items.map((item, index) => {
      if (!item?.item_id) {
        throw ApiError.badRequest(`items[${index}].item_id is required`);
      }

      const quantityInput = item.quantity ?? item.pcs ?? 1;
      const rateInput = item.rate;
      const discountInput = item.discount ?? item.disPercent ?? 0;
      const specialDiscountInput = item.special_discount ?? item.spDis ?? 0;
      const itemDiscountInput = item.item_discount ?? item.itemDiscount ?? 0;
      const itemDis2Input = item.item_dis2 ?? item.itemDis2 ?? 0;
      const dis3Input = item.dis3 ?? 0;
      const gstPercentInput = item.gst_percent ?? item.gstPercent ?? 0;
      const lineTypeInput = item.is_gst ?? item.isGst ?? challanIsGst;

      if (rateInput === undefined) {
        throw ApiError.badRequest(`items[${index}].rate is required`);
      }

      const normalizedType = Number(lineTypeInput);
      if (![0, 1].includes(normalizedType)) {
        throw ApiError.badRequest(`items[${index}].is_gst must be 0 or 1`);
      }

      const quantity = toNumber(quantityInput, `items[${index}].quantity`, {
        allowNegative: true,
      });
      if (quantity === 0) {
        throw ApiError.badRequest(`items[${index}].quantity cannot be zero`);
      }
      const rate = toNumber(rateInput, `items[${index}].rate`);
      const discountPercent = toNumber(
        discountInput,
        `items[${index}].discount`,
        {
          min: 0,
          max: 100,
        },
      );
      const specialDiscount = toNumber(
        specialDiscountInput,
        `items[${index}].special_discount`,
        { min: 0, max: 100 },
      );
      const itemDiscount = toNumber(
        itemDiscountInput,
        `items[${index}].item_discount`,
        { min: 0, max: 100 },
      );
      const itemDis2 = toNumber(itemDis2Input, `items[${index}].item_dis2`, {
        min: 0,
        max: 100,
      });
      const dis3FromInput = toNumber(dis3Input, `items[${index}].dis3`, {
        min: 0,
      });
      const configuredDis3 = Number(
        labelItemDiscountLookup?.get(String(item.item_id)) || 0,
      );
      const hasDis3Field = Object.prototype.hasOwnProperty.call(item, "dis3");
      const dis3 =
        !hasDis3Field && dis3FromInput <= 0 && configuredDis3 > 0 ?
          configuredDis3
        : dis3FromInput;

      const grossRaw = quantity * rate;
      const discountSign = grossRaw < 0 ? -1 : 1;
      const totalPercent =
        discountPercent + specialDiscount + itemDiscount + itemDis2;
      if (totalPercent > 100) {
        throw ApiError.badRequest(
          `items[${index}] total discount percent cannot exceed 100`,
        );
      }
      const afterDiscount = grossRaw - (grossRaw * discountPercent) / 100;
      const afterSpecialDiscount =
        afterDiscount - (afterDiscount * specialDiscount) / 100;
      const signedFlatDiscount = discountSign * dis3;
      const afterFlatDiscount = afterSpecialDiscount - signedFlatDiscount;
      const afterItemDiscount =
        afterFlatDiscount - (afterFlatDiscount * itemDiscount) / 100;
      const taxableRaw =
        afterItemDiscount - (afterItemDiscount * itemDis2) / 100;
      const grossAmount = this._round(grossRaw);
      const discountAmount = this._round(grossRaw - afterDiscount);
      const totalDiscount = this._round(grossRaw - taxableRaw);
      const taxableAmount = this._round(taxableRaw);

      const gstPercent =
        normalizedType === 1 ?
          toNumber(gstPercentInput, `items[${index}].gst_percent`, {
            min: 0,
            max: 100,
          })
        : 0;
      const gstAmount =
        normalizedType === 1 ?
          this._round((taxableAmount * gstPercent) / 100)
        : 0;
      const amount = this._round(taxableAmount + gstAmount);

      return {
        item_id: item.item_id,
        quantity,
        rate,
        discount: discountPercent,
        special_discount: specialDiscount,
        item_discount: itemDiscount,
        item_dis2: itemDis2,
        dis3,
        gross_amount: grossAmount,
        discount_amount: discountAmount,
        total_discount: totalDiscount,
        taxable_amount: taxableAmount,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        amount,
        is_gst: normalizedType,
      };
    });

    this._validateNegativeItemQuantities(processedItems);
    return processedItems;
  }

  _validateNegativeItemQuantities(items = []) {
    const quantityByItem = new Map();
    for (const item of items) {
      const itemId = String(item.item_id || "");
      if (!itemId) continue;
      if (!quantityByItem.has(itemId)) {
        quantityByItem.set(itemId, { positive: 0, negative: 0 });
      }
      const entry = quantityByItem.get(itemId);
      const quantity = Number(item.quantity || 0);
      if (quantity > 0) entry.positive += quantity;
      if (quantity < 0) entry.negative += Math.abs(quantity);
    }

    for (const [itemId, entry] of quantityByItem.entries()) {
      if (entry.negative <= 0) continue;
      if (entry.positive <= 0) {
        throw ApiError.badRequest(
          `Negative PCS for item ${itemId} needs a positive PCS row`,
        );
      }
      if (entry.negative > entry.positive) {
        throw ApiError.badRequest(
          `Negative PCS for item ${itemId} cannot exceed positive PCS`,
        );
      }
    }
  }

  _aggregateTotals(processedItems = []) {
    const gross_total = this._round(
      processedItems.reduce(
        (sum, item) => sum + Number(item.gross_amount || 0),
        0,
      ),
    );
    const sub_total = this._round(
      processedItems.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    );

    return {
      gross_total,
      sub_total,
      amount: this._roundNetAmount(sub_total),
      discount: 0,
    };
  }

  _normalizeChallanTotals(payload = {}, processedItems = []) {
    const fallback = this._aggregateTotals(processedItems);

    const grossTotalInput = payload.gross_total ?? payload.grossTotal;
    const subTotalInput = payload.sub_total ?? payload.subTotal;
    const discountInput = payload.discount;
    const amountInput = payload.amount;

    const gross_total =
      grossTotalInput !== undefined ?
        toNumber(grossTotalInput, "gross_total")
      : fallback.gross_total;

    const sub_total =
      subTotalInput !== undefined ?
        toNumber(subTotalInput, "sub_total")
      : fallback.sub_total;

    const discount =
      discountInput !== undefined ?
        toNumber(discountInput, "discount")
      : fallback.discount;

    const amount =
      amountInput !== undefined ?
        toNumber(amountInput, "amount")
      : fallback.amount;

    return {
      gross_total: this._round(gross_total),
      sub_total: this._round(sub_total),
      discount: this._round(discount),
      amount: this._roundNetAmount(amount),
    };
  }

  async getChallans(userId, isGst, challanType, query) {
    const filter = { user_id: userId };

    if (query.financial_year_id)
      filter.financial_year_id = query.financial_year_id;
    if (challanType) filter.challan_type = challanType;
    const gstFilter = query.is_gst ?? query.isGst;
    if (gstFilter !== undefined && gstFilter !== null && gstFilter !== "") {
      filter.is_gst = Number(gstFilter);
    }

    if (query.contact_id) filter.contact_id = query.contact_id;
    if (query.payment_status) filter.payment_status = query.payment_status;

    if (query.from_date || query.to_date) {
      filter.date = {};
      if (query.from_date) filter.date.$gte = new Date(query.from_date);
      if (query.to_date) filter.date.$lte = new Date(query.to_date);
    }

    filter.converted_to_bill = false;

    const result = await Pagination.paginate(Challan, filter, {
      ...query,
      populate: this._challanPopulate(),
      sort: { createdAt: -1 },
    });

    result.data = this._attachLegacyLabelNames(result.data);
    return result;
  }

  async getChallanById(challanId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: challanId,
      user_id: userId,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const challan = await Challan.findOne(filter).populate(
      this._challanPopulate(),
    );

    if (!challan) throw ApiError.notFound("Challan not found");
    return this._attachLegacyLabelName(challan);
  }

  async _resolveChallanNo(
    providedChallanNo,
    counterKey,
    prefix,
    userId,
    isGst,
    challanType,
  ) {
    if (
      providedChallanNo &&
      typeof providedChallanNo === "string" &&
      providedChallanNo.trim()
    ) {
      const trimmed = providedChallanNo.trim();
      const exists = await Challan.exists({
        challan_no: trimmed,
        user_id: userId,
      });
      if (exists) {
        throw ApiError.conflict(
          `Challan number '${trimmed}' already exists. Please use a different challan number.`,
        );
      }
      return trimmed;
    }
    return this._consumeNextChallanNo(userId);
  }

  async checkChallanNoUnique(challanNo, isGst, challanType, userId) {
    if (!challanNo || typeof challanNo !== "string" || !challanNo.trim()) {
      throw ApiError.badRequest("challan_no is required");
    }
    const filter = {
      challan_no: challanNo.trim(),
      user_id: userId,
    };
    const exists = await Challan.exists(filter);
    return { challan_no: challanNo.trim(), is_unique: !exists };
  }

  async createChallan(challanData, userId, isGst, challanType) {
    this._validateCreateChallanPayload(challanData, challanType);

    const {
      is_bill,
      deduct_from_stock,
      items,
      contact_id,
      date,
      label_id,
      label_name,
      from_bank,
      to_bank,
      challan_no: providedChallanNo,
      financial_year_id,
    } = challanData;

    const printOption =
      Number(challanData?.print_option ?? challanData?.printOption ?? 2) === 1 ?
        1
      : 2;

    if (!contact_id) {
      throw ApiError.badRequest("Contact ID is required");
    }

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest("At least one item is required");
    }

    const itemIds = [
      ...new Set(items.map((item) => String(item.item_id || ""))),
    ].filter(Boolean);
    const dbItems = await Item.find({ _id: { $in: itemIds }, user_id: userId })
      .select("_id item_name is_gst gst_percent")
      .lean();

    if (dbItems.length !== itemIds.length) {
      throw ApiError.badRequest(
        "One or more items are invalid or do not belong to your account",
      );
    }

    const itemMasterMap = new Map(
      dbItems.map((item) => [String(item._id), item]),
    );

    const normalizedFromBank = await this._normalizeBankPayload(
      from_bank,
      userId,
    );
    const normalizedToBank = await this._normalizeBankPayload(to_bank, userId);

    const contact = await Contact.findOne({
      _id: contact_id,
      user_id: userId,
    })
      .select("type label_ids is_gst")
      .lean();

    if (!contact) {
      throw ApiError.badRequest("Contact not found");
    }

    // Compatibility fallback: supplier bill flow from bill form can still send
    // challan_type as "sale". In that case, process it as purchase challan.
    const effectiveChallanType =
      challanType === "sale" && contact.type === "supplier" ?
        "purchase"
      : challanType;

    if (effectiveChallanType === "sale") {
      if (!["party", "book"].includes(contact.type)) {
        throw ApiError.badRequest("No such contact type exists");
      }

      const resolvedLabelId = await this._resolveLabelId({
        labelId: label_id,
        labelName: label_name,
        userId,
        contact,
        requiredForSale: false,
      });

      return this._createChallanFromPayload({
        is_bill,
        challanType: "sale",
        items,
        totalsInput: challanData,
        contact_id,
        date,
        userId,
        isGst,
        itemMasterMap,
        labelId: resolvedLabelId,
        fromBank: normalizedFromBank,
        toBank: normalizedToBank,
        printOption,
        providedChallanNo,
        deductFromStock: deduct_from_stock,
        financialYearId: financial_year_id || null,
      });
    }

    if (contact.type !== "supplier") {
      throw ApiError.badRequest("Supplier not found for purchase challan");
    }

    const resolvedLabelId = await this._resolveLabelId({
      labelId: label_id,
      labelName: label_name,
      userId,
      requiredForSale: false,
    });

    return this._createChallanFromPayload({
      is_bill,
      deductFromStock: challanData.deduct_from_stock,
      challanType: "purchase",
      items,
      totalsInput: challanData,
      contact_id,
      date,
      userId,
      challanIsGst: challanData.is_gst ?? isGst,
      itemMasterMap,
      labelId: resolvedLabelId,
      fromBank: normalizedFromBank,
      toBank: normalizedToBank,
      printOption,
      providedChallanNo,
      financialYearId: financial_year_id || null,
    });
  }

  async updateChallan(challanId, userId, isGst, updateData) {
    const incomingContactCandidate =
      updateData?.contact_id ??
      updateData?.contactId ??
      updateData?.party_id ??
      updateData?.partyId ??
      updateData?.contact ??
      updateData?.party;

    const billId =
      (
        typeof updateData?.bill_id === "string" &&
        mongoose.Types.ObjectId.isValid(updateData.bill_id)
      ) ?
        updateData.bill_id
      : null;

    const challan = await Challan.findOne({
      _id: challanId,
      user_id: userId,
      ...(updateData.financial_year_id ?
        { financial_year_id: updateData.financial_year_id }
      : {}),
      // challan_type: "sale",
    });

    if (!challan) throw ApiError.notFound("Bill/Challan not found");

    const challan_type = challan.challan_type;

    if (incomingContactCandidate !== undefined) {
      const incomingContactId =
        (
          incomingContactCandidate &&
          typeof incomingContactCandidate === "object"
        ) ?
          incomingContactCandidate._id ||
          incomingContactCandidate.id ||
          incomingContactCandidate.contact_id ||
          incomingContactCandidate.contactId ||
          incomingContactCandidate.party_id ||
          incomingContactCandidate.partyId
        : incomingContactCandidate;

      if (incomingContactId) {
        const normalizedIncomingContactId = String(incomingContactId);

        if (!mongoose.Types.ObjectId.isValid(normalizedIncomingContactId)) {
          throw ApiError.badRequest("Invalid contact_id");
        }

        if (String(challan.contact_id) !== normalizedIncomingContactId) {
          throw ApiError.badRequest("Contact is not editable");
        }
      }
    }

    if (challan.converted_to_bill) {
      if (!billId) {
        throw ApiError.badRequest(
          "Cannot update challan that is already billed",
        );
      }

      const linkedBill = await Bill.findOne({
        _id: challan.bill_id,
        user_id: userId,
      }).select("_id paid_amount");

      if (!linkedBill) throw ApiError.notFound("Bill not found");

      if (String(linkedBill._id) !== billId) {
        throw ApiError.badRequest("Challan is linked to a different bill");
      }

      if (Number(linkedBill.paid_amount || 0) > 0) {
        throw ApiError.badRequest(
          "Cannot edit bill after payment has been recorded",
        );
      }
    }

    const fields = {};

    // Whitelist allowed fields to prevent mass assignment
    const ALLOWED_FIELDS = [
      "items",
      "date",
      "remarks",
      "print_option",
      "gross_total",
      "grossTotal",
      "sub_total",
      "subTotal",
      "discount",
      "amount",
      "from_bank",
      "to_bank",
      "label_id",
      "label_name",
      "challan_no",
    ];

    for (const key of ALLOWED_FIELDS) {
      if (updateData[key] !== undefined) fields[key] = updateData[key];
    }

    let effectiveLabelId = challan.label_id;
    if (
      updateData.label_id !== undefined ||
      updateData.label_name !== undefined
    ) {
      const party = await Contact.findOne({
        _id: challan.contact_id,
        user_id: userId,
        type: "party",
      })
        .select("label_ids")
        .lean();

      fields.label_id = await this._resolveLabelId({
        labelId: updateData.label_id,
        labelName: updateData.label_name,
        userId,
        contact: party,
        requiredForSale: false,
      });
      effectiveLabelId = fields.label_id;
    }

    const labelItemDiscountLookup =
      updateData.items ?
        await this._buildLabelItemDiscountLookup(effectiveLabelId, userId)
      : null;

    if (updateData.items) {
      // Build map of old items by item_id to correctly match quantities
      const oldItemsMap = new Map();
      for (const oldItem of challan.items) {
        const itemIdStr = String(oldItem.item_id);
        oldItemsMap.set(
          itemIdStr,
          (oldItemsMap.get(itemIdStr) || 0) + (Number(oldItem.quantity) || 0),
        );
      }

      const processedItems = this._processItems(
        updateData.items,
        challan.is_gst,
        labelItemDiscountLookup,
      );

      const isBillUpdate =
        challan.converted_to_bill === true || challan.stock_context === "bill";

      if (!isBillUpdate) {
        const oldItems = Array.from(oldItemsMap.entries()).map(
          ([itemId, quantity]) => ({
            item_id: new mongoose.Types.ObjectId(itemId),
            quantity: -quantity,
          }),
        );

        if (challan_type === "sale") {
          await stockService.deductStockForChallan(oldItems, userId);
          await stockService.deductStockForChallan(processedItems, userId);
        } else {
          await stockService.addStockForChallan(oldItems, userId);
          await stockService.addStockForChallan(processedItems, userId);
        }
      } else {
        let billFirmIsGst = Number(challan.is_gst ?? 1) === 1 ? 1 : 0;
        let saleDeductFlag = this._normalizeDeductFromStock(
          challan.deduct_from_stock,
          1,
        );

        if (challan.converted_to_bill === true) {
          const linkedBill = await Bill.findOne({
            _id: challan.bill_id,
            user_id: userId,
          }).lean();

          if (!linkedBill) {
            throw ApiError.notFound("Bill not found");
          }

          billFirmIsGst = Number(linkedBill.is_gst ?? 1) === 1 ? 1 : 0;
          saleDeductFlag = linkedBill.skip_stock_calculation ? 0 : 1;
        }

        const reverseItems = (challan.items || []).map((item) => ({
          item_id: item.item_id,
          quantity: -(Number(item.quantity) || 0),
        }));

        if (challan_type === "sale") {
          await stockService.deductStockForBill(
            reverseItems,
            userId,
            billFirmIsGst,
            saleDeductFlag,
          );
          await stockService.deductStockForBill(
            processedItems,
            userId,
            billFirmIsGst,
            saleDeductFlag,
          );
        } else {
          await stockService.addStockForBill(
            reverseItems,
            userId,
            billFirmIsGst,
          );
          await stockService.addStockForBill(
            processedItems,
            userId,
            billFirmIsGst,
          );
        }
      }

      const totals = this._normalizeChallanTotals(updateData, processedItems);

      fields.items = processedItems;
      fields.gross_total = totals.gross_total;
      fields.sub_total = totals.sub_total;
      fields.discount = totals.discount;
      fields.amount = totals.amount;
    } else {
      if (
        updateData.gross_total !== undefined ||
        updateData.grossTotal !== undefined
      ) {
        fields.gross_total = toNumber(
          updateData.gross_total ?? updateData.grossTotal,
          "gross_total",
        );
      }
      if (
        updateData.sub_total !== undefined ||
        updateData.subTotal !== undefined
      ) {
        fields.sub_total = toNumber(
          updateData.sub_total ?? updateData.subTotal,
          "sub_total",
        );
      }
      if (updateData.discount !== undefined) {
        fields.discount = toNumber(updateData.discount, "discount");
      }
      if (updateData.amount !== undefined) {
        fields.amount = toNumber(updateData.amount, "amount");
      }
    }

    if (updateData.from_bank !== undefined) {
      fields.from_bank = await this._normalizeBankPayload(
        updateData.from_bank,
        userId,
      );
    }

    if (updateData.to_bank !== undefined) {
      fields.to_bank = await this._normalizeBankPayload(
        updateData.to_bank,
        userId,
      );
    }

    delete fields.label_name;
    delete fields.grossTotal;
    delete fields.subTotal;

    const updatedChallan = await Challan.findByIdAndUpdate(challanId, fields, {
      returnDocument: "after",
    }).populate(this._challanPopulate());

    const normalized = this._attachLegacyLabelName(updatedChallan);
    emitChallanUpdate(userId, "updated", normalized);
    return normalized;
  }

  async deleteChallan(challanId, userId, isGst, financialYearId = null) {
    const challan = await Challan.findOne({
      _id: challanId,
      user_id: userId,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });

    if (!challan) throw ApiError.notFound("Challan not found");

    if (challan.converted_to_bill) {
      throw ApiError.badRequest("Cannot delete challan that is already billed");
    }

    const reversedItems = (challan.items || []).map((item) => ({
      item_id: item.item_id,
      quantity: -(Number(item.quantity) || 0),
    }));

    if (challan.stock_context === "bill") {
      const firmIsGst = Number(challan.is_gst ?? 1) === 1 ? 1 : 0;
      const deductFlag = this._normalizeDeductFromStock(
        challan.deduct_from_stock,
        1,
      );
      if (challan.challan_type === "sale") {
        await stockService.deductStockForBill(
          reversedItems,
          userId,
          firmIsGst,
          deductFlag,
        );
      } else {
        await stockService.addStockForBill(reversedItems, userId, firmIsGst);
      }
    } else if (challan.challan_type === "sale") {
      await stockService.deductStockForChallan(reversedItems, userId);
    } else {
      await stockService.addStockForChallan(reversedItems, userId);
    }

    if (challan.linked_challan_id) {
      await Challan.findByIdAndUpdate(challan.linked_challan_id, {
        linked_challan_id: null,
      });
    }

    await Challan.findByIdAndDelete(challanId);
    emitChallanUpdate(userId, "deleted", challan);
  }

  async getUnconvertedChallansForContact(
    contactId,
    userId,
    isGst,
    financialYearId = null,
  ) {
    const challans = await Challan.find({
      contact_id: contactId,
      user_id: userId,
      is_gst: isGst,
      challan_type: "sale",
      converted_to_bill: false,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    })
      .populate(this._challanPopulate())
      .sort({ createdAt: -1 })
      .lean();

    return this._attachLegacyLabelNames(challans);
  }

  async recordPayment(challanId, userId, amount, financialYearId = null) {
    const challan = await Challan.findOne({
      _id: challanId,
      user_id: userId,
      challan_type: "purchase",
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });
    if (!challan) throw ApiError.notFound("Purchase challan not found");

    const newPaidAmount = this._round(
      (challan.paid_amount || 0) + Number(amount || 0),
    );
    let paymentStatus = "overpaid";
    if (Math.abs(newPaidAmount - challan.amount) < 0.01) paymentStatus = "paid";
    else if (newPaidAmount < challan.amount) paymentStatus = "due";

    const updatedChallan = await Challan.findByIdAndUpdate(
      challanId,
      { paid_amount: newPaidAmount, payment_status: paymentStatus },
      { returnDocument: "after" },
    ).populate(this._challanPopulate());

    const normalized = this._attachLegacyLabelName(updatedChallan);
    emitChallanUpdate(userId, "updated", normalized);
    return normalized;
  }

  async _createChallanFromPayload(payload) {
    const {
      is_bill,
      deductFromStock,
      challanType,
      items,
      totalsInput,
      contact_id,
      date,
      userId,
      isGst,
      challanIsGst,
      itemMasterMap,
      labelId,
      fromBank,
      toBank,
      printOption,
      providedChallanNo,
      financialYearId,
    } = payload;

    if (challanType === "sale") {
      const gstItems = [];
      const nonGstItems = [];

      for (const item of items) {
        const masterItem = itemMasterMap.get(String(item.item_id));
        const masterIsGst = masterItem?.is_gst ?? 1;
        const saleIsGst = item.is_gst ?? item.isGst ?? masterIsGst;

        const normalizedItem = {
          ...item,
          gst_percent:
            item.gst_percent ?? item.gstPercent ?? masterItem?.gst_percent ?? 0,
          is_gst: Number(saleIsGst) === 1 ? 1 : 0,
        };

        if (normalizedItem.is_gst === 1) gstItems.push(normalizedItem);
        else nonGstItems.push(normalizedItem);
      }

      if (gstItems.length === 0 && nonGstItems.length === 0) {
        throw ApiError.badRequest("At least one item is required");
      }

      const hasMixedGroups = gstItems.length > 0 && nonGstItems.length > 0;
      const labelItemDiscountLookup = await this._buildLabelItemDiscountLookup(
        labelId,
        userId,
      );

      let challanNoUsed = false;
      const buildChallanDoc = async (groupItems, groupIsGst) => {
        let challan_no;
        if (!challanNoUsed && providedChallanNo) {
          challan_no = await this._resolveChallanNo(
            providedChallanNo,
            `ChallanNo_${groupIsGst === 1 ? "GST" : "NONGST"}`,
            "CH",
            userId,
            groupIsGst,
            "sale",
          );
          challanNoUsed = true;
        } else {
          challan_no = await this._resolveChallanNo(
            null,
            `ChallanNo_${groupIsGst === 1 ? "GST" : "NONGST"}`,
            "CH",
            userId,
            groupIsGst,
            "sale",
          );
        }

        const nextId = await getNextId("Challan", userId);
        const processedItems = this._processItems(
          groupItems,
          groupIsGst,
          labelItemDiscountLookup,
        );
        const totals =
          hasMixedGroups ?
            this._normalizeChallanTotals({}, processedItems)
          : this._normalizeChallanTotals(totalsInput, processedItems);

        return {
          doc: {
            id: nextId,
            challan_no,
            challan_type: "sale",
            contact_id,
            date: date ? new Date(date) : new Date(),
            label_id: labelId,
            print_option: printOption,
            from_bank: fromBank,
            to_bank: toBank,
            items: processedItems,
            gross_total: totals.gross_total,
            sub_total: totals.sub_total,
            discount: totals.discount,
            amount: totals.amount,
            is_gst: groupIsGst,
            stock_context: is_bill ? "bill" : "challan",
            deduct_from_stock:
              is_bill ? this._normalizeDeductFromStock(deductFromStock, 1) : 1,
            financial_year_id: financialYearId || null,
            user_id: userId,
          },
          processedItems,
        };
      };

      // let gstChallan = null;
      // let nonGstChallan = null;
      let createdChallan = null;

      /** NONGST items logical se - hogi and GST items physical se */
      /**
      * if (gstItems.length > 0) {
          const { doc, processedItems } = await buildChallanDoc(gstItems, 1);
          await stockService.deductStock(processedItems, userId, 1, is_bill);
          gstChallan = await Challan.create(doc);
        }

        if (nonGstItems.length > 0) {
          const { doc, processedItems } = await buildChallanDoc(nonGstItems, 0);
          await stockService.deductStock(processedItems, userId, 0, is_bill);
          nonGstChallan = await Challan.create(doc);
        }
      */

      if (!is_bill) {
        // this is a challan so items stock will always be deducted from physical stock
        // challan will contain both items 0 & 1, they will only be seperated in 2 bills when creating bill
        const allItems = [...gstItems, ...nonGstItems];
        const { doc, processedItems } = await buildChallanDoc(allItems, 1);
        await stockService.deductStockForChallan(processedItems, userId);
        createdChallan = await Challan.create(doc);
      } else {
        // this is a bill, so items stock will be substracted based on firm type:
        // GST => physical, NON_GST => logical
        if (isGst === 1) {
          gstItems.push(...nonGstItems);
          const { doc, processedItems } = await buildChallanDoc(gstItems, 1);
          await stockService.deductStockForBill(
            processedItems,
            userId,
            1,
            Number(deductFromStock ?? 1) === 1 ? 1 : 0,
          );
          createdChallan = await Challan.create(doc);
        } else {
          nonGstItems.push(...gstItems);
          const { doc, processedItems } = await buildChallanDoc(nonGstItems, 0);
          await stockService.deductStockForBill(
            processedItems,
            userId,
            0,
            Number(deductFromStock ?? 1) === 1 ? 1 : 0,
          );
          createdChallan = await Challan.create(doc);
        }
      }

      // if (gstChallan && nonGstChallan) {
      //   await Challan.findByIdAndUpdate(gstChallan._id, {
      //     linked_challan_id: nonGstChallan._id,
      //   });
      //   await Challan.findByIdAndUpdate(nonGstChallan._id, {
      //     linked_challan_id: gstChallan._id,
      //   });
      //   gstChallan.linked_challan_id = nonGstChallan._id;
      //   nonGstChallan.linked_challan_id = gstChallan._id;
      // }

      const populated = await createdChallan.populate(this._challanPopulate());
      const normalized = this._attachLegacyLabelName(populated);
      emitChallanUpdate(userId, "created", normalized);
      return normalized;
    }

    const supplier = await Contact.findOne({
      _id: contact_id,
      user_id: userId,
      type: "supplier",
    }).lean();
    if (!supplier) {
      throw ApiError.badRequest("Supplier not found");
    }

    const purchaseIsGst = Number(challanIsGst ?? 1) === 1 ? 1 : 0;

    const challan_no = await this._resolveChallanNo(
      providedChallanNo,
      `PurchaseNo_${purchaseIsGst === 1 ? "GST" : "NONGST"}`,
      "PO",
      userId,
      purchaseIsGst,
      "purchase",
    );
    const nextId = await getNextId("Challan", userId);

    const processedItems = this._processItems(items, purchaseIsGst);
    const totals = this._normalizeChallanTotals(totalsInput, processedItems);

    // For purchase: use bill logic if is_bill=true, else use challan logic
    if (!is_bill) {
      // Challan flow: PS += PCS only
      await stockService.addStockForChallan(processedItems, userId);
    } else {
      // Bill flow: GST firm adds PS/LS; NONGST firm adds PS only.
      await stockService.addStockForBill(processedItems, userId, purchaseIsGst);
    }

    const itemIds = [
      ...new Set(processedItems.map((item) => String(item.item_id))),
    ];
    await Item.updateMany(
      { _id: { $in: itemIds }, user_id: userId },
      { is_gst: purchaseIsGst },
    );

    const challan = await Challan.create({
      id: nextId,
      challan_no,
      challan_type: "purchase",
      contact_id,
      date: date ? new Date(date) : new Date(),
      label_id: labelId || null,
      print_option: printOption,
      from_bank: fromBank,
      to_bank: toBank,
      items: processedItems,
      gross_total: totals.gross_total,
      sub_total: totals.sub_total,
      discount: totals.discount,
      amount: totals.amount,
      is_gst: purchaseIsGst,
      stock_context: is_bill ? "bill" : "challan",
      deduct_from_stock: 1,
      financial_year_id: financialYearId || null,
      user_id: userId,
    });

    const populated = await challan.populate(this._challanPopulate());
    const normalized = this._attachLegacyLabelName(populated);
    emitChallanUpdate(userId, "created", normalized);
    return normalized;
  }

  async getLastSoldItem(
    itemId,
    userId,
    contactId = null,
    financialYearId = null,
  ) {
    const query = {
      user_id: userId,
      challan_type: "sale",
      "items.item_id": itemId,
    };
    if (financialYearId) query.financial_year_id = financialYearId;
    if (contactId) query.contact_id = contactId;

    const challans = await Challan.find(query)
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .populate("contact_id", "name phone type")
      .populate(
        "items.item_id",
        "item_name alias description hsn_id barcode item_id sale_rate purchase_rate mrp_rate gst_percent stock physical_stock logical_stock image is_gst",
      )
      .lean();

    if (challans.length === 0) return [];

    const normalizedItemId = String(itemId);
    const entries = [];

    for (const challan of challans) {
      for (const line of challan.items || []) {
        const lineItem = line?.item_id;
        const lineItemId =
          typeof lineItem === "object" && lineItem?._id ?
            String(lineItem._id)
          : String(lineItem);

        if (lineItemId !== normalizedItemId) continue;

        entries.push({
          challan_id: challan._id,
          challan_no: challan.challan_no,
          challan_date: challan.date,
          contact: challan.contact_id,
          is_gst: challan.is_gst,
          item: lineItem,
          quantity: line.quantity,
          rate: line.rate,
          discount: line.discount,
          special_discount: line.special_discount,
          discount_amount: line.discount_amount,
          gst_percent: line.gst_percent,
          gst_amount: line.gst_amount,
          taxable_amount: line.taxable_amount,
          amount: line.amount,
        });
      }
    }

    return entries.slice(0, 4);
  }
}

export default new ChallanService();
