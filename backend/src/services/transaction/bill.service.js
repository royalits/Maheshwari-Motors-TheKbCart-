import mongoose from "mongoose";
import Bill from "../../models/transaction/bill.model.js";
import Challan from "../../models/transaction/challan.model.js";
import Transaction from "../../models/transaction/transaction.model.js";
import Contact from "../../models/master/contact.model.js";
import Transport from "../../models/master/transport.model.js";
import Bank from "../../models/master/bank.model.js";
import FinancialYear from "../../models/common/financial_year.model.js";
import stockService from "../inventory/stock.service.js";
import { ApiError, Pagination, toNumber } from "../../utils/index.js";
import { convertQueryParamIds } from "../../utils/queryParamConverter.js";
import { getNextId } from "../../helpers/counter.js";
import { emitChallanUpdate } from "../realtime/socket.service.js";

const PAYMENT_TYPES = [
  "bank_transaction_received_amount",
  "cash_payment_received_amount",
  "bank_transfer_payment_given",
  "cash_payment_given",
];

const PAYMENT_TYPE_ALIASES = {
  bank_transaction_recieved_amount: "bank_transaction_received_amount",
  cash_payment_recieved_amount: "cash_payment_received_amount",
  bank_transaction_received_amount: "bank_transaction_received_amount",
  cash_payment_received_amount: "cash_payment_received_amount",
  bank_transfer_payment_given: "bank_transfer_payment_given",
  cash_payment_given: "cash_payment_given",
  "bank transaction recieved amount": "bank_transaction_received_amount",
  "cash payment recieved amount": "cash_payment_received_amount",
  "bank transfer payment given": "bank_transfer_payment_given",
  "cash payment given": "cash_payment_given",
};

const BANK_REQUIRED_PAYMENT_TYPES = new Set([
  "bank_transaction_received_amount",
  "bank_transfer_payment_given",
]);

const DEFAULT_BALANCE_PAYMENT_TYPE = {
  party: "cash_payment_received_amount",
  supplier: "cash_payment_given",
};

class BillService {
  async syncTransactionSettlement(transactionId, userId, isGst) {
    if (!transactionId) return;

    const txn = await Transaction.findOne({ _id: transactionId, user_id: userId, is_gst: isGst });
    if (!txn) return;

    const bills = await Bill.find({
      user_id: userId,
      is_gst: isGst,
      "payment_entries.transaction_id": transactionId,
    }).lean();

    let totalSettled = 0;
    const allocations = [];

    for (const bill of bills) {
      if (Array.isArray(bill.payment_entries)) {
        for (const entry of bill.payment_entries) {
          if (entry.transaction_id && String(entry.transaction_id) === String(transactionId)) {
            totalSettled += entry.amount || 0;
            allocations.push({
              bill_id: bill._id,
              amount: entry.amount || 0,
            });
          }
        }
      }
    }

    const settled = this._round(totalSettled);
    const isSettled = settled >= txn.amount - 0.009;

    await Transaction.updateOne(
      { _id: transactionId },
      {
        $set: {
          settlement_status: isSettled ? "settled" : "none",
          "settlement_summary.settled_amount": settled,
          "settlement_summary.allocations": allocations.map((a) => ({
            bill_id: a.bill_id,
            amount: a.amount,
            settlement_discount: 0,
          })),
        },
      }
    );
  }

  _formatBillNo(sequence) {
    return String(Math.max(0, Number(sequence) || 0)).padStart(6, "0");
  }

  _resolveIsGstValue(isGstInput, fallbackIsGst = 0) {
    if (isGstInput === undefined || isGstInput === null || isGstInput === "") {
      return Number(fallbackIsGst) === 1 ? 1 : 0;
    }
    const normalized = Number(isGstInput);
    if (normalized === 1) return 1;
    if (normalized === 0) return 0;
    throw ApiError.badRequest("is_gst must be either 0 or 1");
  }

  _normalizeDeductFromStock(value, fallback = 1) {
    if (value === undefined || value === null || value === "") {
      return Number(fallback) === 1 ? 1 : 0;
    }

    if (typeof value === "boolean") return value ? 1 : 0;

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) return 1;
      if (["0", "false", "no", "off"].includes(normalized)) return 0;
    }

    const parsed = Number(value);
    if (parsed === 1) return 1;
    if (parsed === 0) return 0;

    throw ApiError.badRequest("deduct_from_stock must be 0 or 1");
  }

  async _getMaxExistingBillSerial(
    userId,
    isGst,
    contactType,
    financialYearId,
    contactId = null,
  ) {
    const userObjectId = new mongoose.Types.ObjectId(String(userId));
    const resolvedContactType = contactType || "party";
    const isSale = ["party", "book"].includes(resolvedContactType);
    const normalizedContactId =
      contactId && mongoose.Types.ObjectId.isValid(String(contactId)) ?
        new mongoose.Types.ObjectId(String(contactId))
      : null;
    let financialYear = null;
    if (financialYearId) {
      financialYear = await FinancialYear.findOne({
        _id: financialYearId,
        user_id: userId,
      })
        .select("start_date end_date")
        .lean();
    }

    const [row] = await Bill.aggregate([
      {
        $match: {
          user_id: userObjectId,
          is_gst: Number(isGst) === 1 ? 1 : 0,
          ...(isSale ?
            { contact_type: { $in: ["party", "book"] } }
          : (normalizedContactId ?
              { contact_id: normalizedContactId }
            : { contact_type: "supplier" })),
          ...(financialYearId ?
            {
              $or: [
                {
                  financial_year_id: new mongoose.Types.ObjectId(
                    String(financialYearId),
                  ),
                },
                ...(financialYear ?
                  [
                    {
                      date: {
                        $gte: financialYear.start_date,
                        $lte: financialYear.end_date,
                      },
                    },
                  ]
                : []),
              ],
            }
          : {}),
          bill_no: { $regex: /^\d+$/ },
        },
      },
      {
        $project: {
          serial: { $toInt: "$bill_no" },
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

  async _peekNextAvailableBillSequence(
    userId,
    isGst,
    contactType,
    financialYearId,
    contactId = null,
  ) {
    let nextSequence =
      (await this._getMaxExistingBillSerial(
        userId,
        isGst,
        contactType,
        financialYearId,
        contactId,
      )) + 1;

    while (
      await this._billNoExists(
        this._formatBillNo(nextSequence),
        userId,
        isGst,
        { contactType, contactId, financialYearId },
      )
    ) {
      nextSequence += 1;
    }

    return nextSequence;
  }

  async _consumeNextBillNo(
    isGst,
    userId,
    contactType,
    financialYearId,
    contactId = null,
  ) {
    let nextSequence =
      (await this._getMaxExistingBillSerial(
        userId,
        isGst,
        contactType,
        financialYearId,
        contactId,
      )) + 1;

    while (true) {
      const billNo = this._formatBillNo(nextSequence);

      if (
        !(await this._billNoExists(billNo, userId, isGst, {
          contactType,
          contactId,
          financialYearId,
        }))
      ) {
        return billNo;
      }

      nextSequence += 1;
    }
  }

  _round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  _roundNetAmount(value) {
    return Math.ceil(Number(value) || 0);
  }

  _resolvePaymentStatus(
    amount,
    paidAmount,
    settlementDiscount = 0,
    returnAmount = 0,
  ) {
    const normalizedAmount = Math.max(
      0,
      this._round(amount - settlementDiscount - returnAmount),
    );
    const normalizedPaid = this._round(paidAmount);

    if (Math.abs(normalizedPaid - normalizedAmount) < 0.01) {
      return "paid";
    }

    if (normalizedPaid < normalizedAmount) {
      return "due";
    }

    return "overpaid";
  }

  _getBillDue(bill) {
    return Math.max(
      0,
      this._round(
        (bill.amount || 0) -
          (bill.paid_amount || 0) -
          (bill.return_amount || 0) -
          (bill.settlement_discount || 0),
      ),
    );
  }

  _normalizePaymentType(paymentType) {
    if (
      paymentType === undefined ||
      paymentType === null ||
      paymentType === ""
    ) {
      throw ApiError.badRequest("payment_type is required");
    }

    if (typeof paymentType !== "string") {
      throw ApiError.badRequest("payment_type must be a string");
    }

    if (!PAYMENT_TYPES.includes(paymentType)) {
      throw ApiError.badRequest(
        `payment_type must be one of: ${PAYMENT_TYPES.join(", ")}`,
      );
    }

    return paymentType;
  }

  _normalizeOptionalText(value) {
    if (value === undefined || value === null) return "";
    if (typeof value !== "string") return String(value);
    return value.trim();
  }

  async _resolvePaymentBank(bankId, userId, paymentType) {
    const requiresBank = BANK_REQUIRED_PAYMENT_TYPES.has(paymentType);

    if (!bankId) {
      if (requiresBank) {
        throw ApiError.badRequest(
          `bank_id is required for payment_type '${paymentType}'`,
        );
      }
      return null;
    }

    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      throw ApiError.badRequest("Invalid bank_id");
    }

    const exists = await Bank.exists({ _id: bankId, user_id: userId });
    if (!exists) {
      throw ApiError.badRequest(
        "Bank not found. Please select a valid bank for this firm.",
      );
    }

    return bankId;
  }

  async _resolveOptionalPaymentBank(bankId, userId) {
    if (!bankId) return null;

    if (!mongoose.Types.ObjectId.isValid(bankId)) {
      throw ApiError.badRequest("Invalid bank_id");
    }

    const exists = await Bank.exists({ _id: bankId, user_id: userId });
    if (!exists) {
      throw ApiError.badRequest(
        "Bank not found. Please select a valid bank for this firm.",
      );
    }

    return bankId;
  }

  _buildPaymentEntry({
    amount,
    paymentType,
    bankId,
    referenceNo,
    note,
    settledTo = "bill",
    date,
    transactionId,
  }) {
    return {
      amount: this._round(amount),
      payment_type: paymentType,
      bank_id: bankId || null,
      reference_no: this._normalizeOptionalText(referenceNo),
      note: this._normalizeOptionalText(note),
      settled_to: settledTo,
      date: date || new Date(),
      transaction_id: transactionId || null,
    };
  }

  _normalizeAutoBillLine(line) {
    if (!line) return null;

    const itemId =
      typeof line.item_id === "object" && line.item_id?._id ?
        line.item_id._id
      : line.item_id;

    if (!itemId) return null;

    return {
      source_challan_id:
        (
          typeof line.source_challan_id === "object" &&
          line.source_challan_id?._id
        ) ?
          line.source_challan_id._id
        : line.source_challan_id || null,
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

  _buildSyntheticAutoBillChallans(bill = {}) {
    const autoItems =
      Array.isArray(bill.auto_bill_items) ? bill.auto_bill_items : [];
    if (autoItems.length === 0) {
      return bill.challan_ids || [];
    }

    const sourceMeta = new Map();
    for (const challan of bill.challan_ids || []) {
      const sourceId =
        challan ? String(challan._id || challan.id || challan) : "";
      if (!sourceId) continue;
      sourceMeta.set(sourceId, challan);
    }

    const groupedBySource = new Map();
    for (const rawLine of autoItems) {
      const line = this._normalizeAutoBillLine(rawLine);
      if (!line || !line.item_id) continue;

      const sourceId =
        line.source_challan_id ? String(line.source_challan_id) : "";
      const key = sourceId || "__auto__";

      if (!groupedBySource.has(key)) groupedBySource.set(key, []);
      groupedBySource.get(key).push(line);
    }

    if (!groupedBySource.size) {
      return bill.challan_ids || [];
    }

    const synthetic = [];
    for (const [sourceKey, lines] of groupedBySource.entries()) {
      const source = sourceMeta.get(sourceKey);
      const amount = this._round(
        lines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
      );

      synthetic.push({
        _id: source?._id || sourceKey,
        challan_no:
          source?.challan_no ||
          `CH-AUTO-${String(bill.bill_no || bill._id || "").slice(-6)}`,
        challan_type: "sale",
        date: source?.date || bill.date || new Date(),
        amount,
        print_option: source?.print_option || 2,
        items: lines.map(({ source_challan_id, ...item }) => item),
      });
    }

    return synthetic;
  }

  _applyAutoBillSnapshotToBill(bill) {
    if (!bill) return bill;

    const normalized =
      typeof bill.toObject === "function" ? bill.toObject() : { ...bill };

    if (normalized.contact_id) {
      const isGst = normalized.is_gst === 1 || normalized.is_gst === true;
      normalized.contact_id.balance = isGst
        ? (normalized.contact_id.gst_balance ?? normalized.contact_id.balance ?? 0)
        : (normalized.contact_id.nongst_balance ?? normalized.contact_id.balance ?? 0);
    }

    const autoItems =
      Array.isArray(normalized.auto_bill_items) ? normalized.auto_bill_items : [];
    if (!normalized.is_auto_bill && autoItems.length === 0) return normalized;

    normalized.challan_ids = this._buildSyntheticAutoBillChallans(normalized);
    return normalized;
  }

  _normalizeFirmType(value, fallback = 1) {
    const rawValue = value ?? fallback;
    return Number(rawValue) === 1 ? 1 : 0;
  }

  _resolveLineIsGst(line) {
    const rawValue =
      line?.is_gst ??
      line?.isGst ??
      line?.item_id?.is_gst ??
      line?.item?.is_gst ??
      1;
    return this._normalizeFirmType(rawValue, 1);
  }

  _buildSnapshotLine(line, sourceChallanId, fallbackIsGst = 1) {
    return this._normalizeAutoBillLine({
      ...line,
      item_id:
        typeof line?.item_id === "object" && line.item_id?._id ?
          line.item_id._id
        : line?.item_id,
      source_challan_id: sourceChallanId,
      is_gst: this._normalizeFirmType(
        line?.is_gst ?? line?.isGst,
        fallbackIsGst,
      ),
    });
  }

  _groupSaleChallansByItemType(challans = []) {
    const groups = new Map();

    for (const challan of challans) {
      const contactId = String(challan.contact_id?._id || challan.contact_id);
      const linesByType = new Map();

      for (const line of challan.items || []) {
        const lineIsGst = this._resolveLineIsGst(line);
        if (!linesByType.has(lineIsGst)) linesByType.set(lineIsGst, []);
        linesByType.get(lineIsGst).push(line);
      }

      for (const [lineIsGst, lines] of linesByType.entries()) {
        const key = `${lineIsGst}_${contactId}`;
        if (!groups.has(key)) {
          groups.set(key, {
            is_gst: lineIsGst,
            contact_id: contactId,
            contact_name: challan.contact_id?.name || "Unknown",
            source_challan_ids: new Set(),
            challans: [],
            auto_bill_items: [],
          });
        }

        const group = groups.get(key);
        group.source_challan_ids.add(String(challan._id));
        group.challans.push({ ...challan, items: lines });

        for (const line of lines) {
          const snapshotLine = this._buildSnapshotLine(
            line,
            challan._id,
            lineIsGst,
          );
          if (snapshotLine) group.auto_bill_items.push(snapshotLine);
        }
      }
    }

    return groups;
  }

  _recalculateChallanTotals(items = []) {
    const normalizedItems = items
      .map((rawLine) => this._normalizeAutoBillLine(rawLine))
      .filter(
        (line) => line && Number(line.quantity || 0) !== 0 && line.item_id,
      )
      .map(({ source_challan_id, ...line }) => line);

    const gross_total = this._round(
      normalizedItems.reduce(
        (sum, line) => sum + Number(line.gross_amount || 0),
        0,
      ),
    );
    const sub_total = this._round(
      normalizedItems.reduce((sum, line) => sum + Number(line.amount || 0), 0),
    );

    return {
      items: normalizedItems,
      gross_total,
      sub_total,
      discount: 0,
      amount: this._roundNetAmount(sub_total),
    };
  }

  async _restoreAutoBillChallans(bill) {
    const autoItems =
      Array.isArray(bill?.auto_bill_items) ? bill.auto_bill_items : [];
    if (!autoItems.length) {
      return;
    }

    const groupedBySource = new Map();
    for (const rawLine of autoItems) {
      const line = this._normalizeAutoBillLine(rawLine);
      const sourceId =
        line?.source_challan_id ? String(line.source_challan_id) : "";
      if (!line || !sourceId) continue;

      const { source_challan_id, ...lineWithoutSource } = line;
      if (!groupedBySource.has(sourceId)) groupedBySource.set(sourceId, []);
      groupedBySource.get(sourceId).push(lineWithoutSource);
    }

    if (!groupedBySource.size) {
      return;
    }

    const sourceIds = Array.from(groupedBySource.keys())
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (!sourceIds.length) {
      return;
    }

    const sourceChallans = await Challan.find({
      _id: { $in: sourceIds },
      user_id: bill.user_id,
      challan_type: "sale",
    });

    const sourceMap = new Map(
      sourceChallans.map((challan) => [String(challan._id), challan]),
    );

    for (const [sourceId, linesToRestore] of groupedBySource.entries()) {
      const challan = sourceMap.get(sourceId);
      if (!challan) continue;

      const restoredItems = [...(challan.items || []), ...linesToRestore];
      const totals = this._recalculateChallanTotals(restoredItems);

      challan.items = totals.items;
      challan.gross_total = totals.gross_total;
      challan.sub_total = totals.sub_total;
      challan.discount = totals.discount;
      challan.amount = totals.amount;
      challan.converted_to_bill = false;
      challan.bill_id = null;
    }

    if (sourceChallans.length > 0) {
      await Promise.all(sourceChallans.map((challan) => challan.save()));
      emitChallanUpdate(bill.user_id, "restored", sourceChallans);
    }
  }

  async _restoreSplitBillChallans(bill, userId) {
    const challanIds = (
      Array.isArray(bill?.challan_ids) ?
        bill.challan_ids
      : [])
      .filter(Boolean)
      .map(String);
    if (!challanIds.length) return;

    const otherBills = await Bill.find({
      _id: { $ne: bill._id },
      user_id: userId,
      challan_ids: { $in: challanIds },
    })
      .select("_id challan_ids")
      .lean();

    const fallbackBillByChallan = new Map();
    for (const otherBill of otherBills) {
      for (const challanId of otherBill.challan_ids || []) {
        const normalizedId = String(challanId);
        if (!fallbackBillByChallan.has(normalizedId)) {
          fallbackBillByChallan.set(normalizedId, otherBill._id);
        }
      }
    }

    const bulkOps = challanIds.map((challanId) => {
      const fallbackBillId = fallbackBillByChallan.get(challanId) || null;
      return {
        updateOne: {
          filter: { _id: challanId, user_id: userId },
          update: {
            $set: {
              converted_to_bill: Boolean(fallbackBillId),
              bill_id: fallbackBillId,
            },
          },
        },
      };
    });

    if (bulkOps.length) await Challan.bulkWrite(bulkOps, { ordered: false });
    emitChallanUpdate(userId, "restored", { challan_ids: challanIds });
  }

  async _reverseAndDeleteLinkedChallans(bill, userId) {
    const challanIds = Array.isArray(bill?.challan_ids) ? bill.challan_ids : [];
    if (!challanIds.length) return 0;

    const linkedChallans = await Challan.find({
      _id: { $in: challanIds },
      user_id: userId,
    })
      .select("_id challan_type is_gst items bill_id converted_to_bill")
      .lean();

    if (linkedChallans.length !== challanIds.length) {
      throw ApiError.badRequest(
        "Cannot delete bill because one or more linked challans are missing",
      );
    }

    const billFirmIsGst = Number(bill?.is_gst ?? 1) === 1 ? 1 : 0;
    const saleDeductFlag = bill?.skip_stock_calculation ? 0 : 1;

    for (const challan of linkedChallans) {
      const reversedItems = (challan.items || []).map((item) => ({
        item_id: item.item_id,
        quantity: -(Number(item.quantity) || 0),
      }));

      if (challan.challan_type === "sale") {
        await stockService.deductStockForBill(
          reversedItems,
          userId,
          billFirmIsGst,
          saleDeductFlag,
        );
      } else {
        await stockService.addStockForBill(
          reversedItems,
          userId,
          billFirmIsGst,
        );
      }
    }

    await Challan.deleteMany({
      _id: { $in: linkedChallans.map((c) => c._id) },
      user_id: userId,
    });
    emitChallanUpdate(userId, "deleted", linkedChallans);

    return linkedChallans.length;
  }

  async _applyChallanConversionStock(challans, userId, billType, options = {}) {
    for (const challan of challans || []) {
      if (challan.stock_context === "bill") continue;

      const items = (challan.items || []).map((item) => ({
        item_id: item.item_id,
        quantity: Number(item.quantity) || 0,
      }));
      if (!items.length) continue;

      if (billType === "sale") {
        const deductFlag = this._normalizeDeductFromStock(
          options.deduct_from_stock,
          1,
        );
        if (deductFlag === 0) {
          await stockService.adjustStock(items, userId, { physical: 1 });
        }
        await stockService.deductStockForBill(items, userId, 1, 0);
        continue;
      }

      const firmIsGst = Number(options.firm_is_gst ?? 1) === 1 ? 1 : 0;
      if (firmIsGst === 1) {
        await stockService.adjustStock(items, userId, { logical: 1 });
      }
    }
  }

  async _ensureCashBookContact(userId) {
    const existing = await Contact.findOne({
      user_id: userId,
      type: "book",
      name: { $regex: /^CASHBOOK$/i },
    })
      .select("_id name")
      .lean();

    if (existing) {
      if (existing.name !== "CASHBOOK") {
        await Contact.updateOne({ _id: existing._id }, { name: "CASHBOOK" });
      }
      return existing._id;
    }

    const created = await Contact.create({
      id: await getNextId("Contact", userId),
      name: "CASHBOOK",
      type: "book",
      user_id: userId,
    });

    return created._id;
  }

  _extractCompensationItems(challans = []) {
    const extracted = [];

    for (const challan of challans) {
      for (const line of challan.items || []) {
        const quantity = Number(line.quantity) || 0;
        if (quantity <= 0) continue;

        extracted.push({
          item_id: line.item_id,
          quantity,
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
          is_gst: 1,
        });
      }
    }

    return extracted;
  }

  async _createNoDeductCompensation({
    userId,
    challans,
    billDate,
    sourceBillNo,
  }) {
    const items = this._extractCompensationItems(challans);
    if (!items.length) return null;

    const cashBookId = await this._ensureCashBookContact(userId);
    const challanSeq = await getNextId("PurchaseNo_GST", userId);
    const nextId = await getNextId("Challan", userId);

    const grossTotal = this._round(
      items.reduce((sum, item) => sum + Number(item.gross_amount || 0), 0),
    );
    const totalDiscount = this._round(
      items.reduce((sum, item) => sum + Number(item.total_discount || 0), 0),
    );
    const totalAmount = this._roundNetAmount(
      items.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    );

    const compensationChallan = await Challan.create({
      id: nextId,
      challan_no: String(challanSeq).padStart(6, "0"),
      challan_type: "purchase",
      date: billDate || new Date(),
      contact_id: cashBookId,
      print_option: 2,
      items,
      gross_total: grossTotal,
      sub_total: totalAmount,
      discount: totalDiscount,
      amount: totalAmount,
      converted_to_bill: true,
      payment_status: "paid",
      paid_amount: totalAmount,
      is_gst: 1,
      user_id: userId,
      from_bank: null,
      to_bank: null,
    });

    try {
      await stockService.addStockForChallan(items, userId);
    } catch (error) {
      await Challan.findByIdAndDelete(compensationChallan._id);
      throw error;
    }

    return {
      challan_id: compensationChallan._id,
      challan_no: compensationChallan.challan_no,
      source_bill_no: sourceBillNo,
      contact_id: cashBookId,
      amount: totalAmount,
      mode: "no_deduct_stock_compensation",
    };
  }

  async getBills(userId, isGst, query) {
    const filter = { user_id: userId, is_gst: isGst };

    // Convert query parameters with _id to ObjectIds to prevent CastError
    const convertedQuery = convertQueryParamIds(query);

    if (convertedQuery.financial_year_id)
      filter.financial_year_id = convertedQuery.financial_year_id;
    if (convertedQuery.contact_id)
      filter.contact_id = convertedQuery.contact_id;
    if (convertedQuery.payment_status)
      filter.payment_status = convertedQuery.payment_status;

    if (convertedQuery.from_date || convertedQuery.to_date) {
      filter.date = {};
      if (convertedQuery.from_date)
        filter.date.$gte = new Date(convertedQuery.from_date);
      if (convertedQuery.to_date)
        filter.date.$lte = new Date(convertedQuery.to_date);
    }

    const result = await Pagination.paginate(Bill, filter, {
      ...convertedQuery,
      populate: [
        {
          path: "contact_id",
          select:
            "name phone type balance transport_charge transport_id gstin reg_number area area_id city state address",
          populate: { path: "area_id", select: "city state pincode" },
        },
        { path: "transport_id", select: "name phone gstin" },
        {
          path: "challan_ids",
          select: "challan_no challan_type date amount print_option items",
          populate: {
            path: "items.item_id",
            select:
              "item_name barcode item_id sale_rate gst_percent stock physical_stock logical_stock",
          },
        },
        {
          path: "auto_bill_items.item_id",
          select:
            "item_name barcode item_id sale_rate gst_percent stock physical_stock logical_stock",
        },
      ],
      sort: { createdAt: -1 },
    });

    result.data = (result.data || []).map((bill) =>
      this._applyAutoBillSnapshotToBill(bill),
    );

    return result;
  }

  async getBillById(billId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: billId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const bill = await Bill.findOne(filter)
      .populate({
        path: "contact_id",
        select:
          "name phone type balance transport_charge transport_id gstin reg_number area area_id city state address",
        populate: { path: "area_id", select: "city state pincode" },
      })
      .populate("transport_id")
      .populate({
        path: "challan_ids",
        populate: {
          path: "items.item_id",
          select:
            "item_name alias description hsn_id stock physical_stock logical_stock",
        },
      })
      .populate({
        path: "auto_bill_items.item_id",
        select:
          "item_name alias description hsn_id barcode item_id sale_rate gst_percent stock physical_stock logical_stock",
      })
      .populate(
        "payment_entries.bank_id",
        "bank_name account_number ifsc_code",
      );

    if (!bill) throw ApiError.notFound("Bill not found");
    return this._applyAutoBillSnapshotToBill(bill);
  }

  async _resolveFinancialYearByDate(userId, dateValue) {
    if (!dateValue) return null;

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) {
      throw ApiError.badRequest("date must be a valid date");
    }

    return FinancialYear.findOne({
      user_id: userId,
      start_date: { $lte: date },
      end_date: { $gte: date },
    })
      .select("_id")
      .lean();
  }

  async _billNoExists(billNo, userId, isGst, scope = {}) {
    const trimmed = String(billNo || "").trim();
    if (!trimmed) return false;

    const { contactId, contactType, financialYearId, date, excludeBillId } =
      typeof scope === "string" ? { contactType: scope } : scope || {};

    const resolvedFinancialYearId =
      financialYearId ||
      (await this._resolveFinancialYearByDate(userId, date))?._id ||
      null;
    let resolvedFinancialYear = null;
    if (resolvedFinancialYearId) {
      resolvedFinancialYear = await FinancialYear.findOne({
        _id: resolvedFinancialYearId,
        user_id: userId,
      })
        .select("start_date end_date")
        .lean();
    }

    let resolvedContactType = contactType || null;
    if (!resolvedContactType && contactId) {
      const contactDoc = await Contact.findById(contactId).select("type").lean();
      resolvedContactType = contactDoc?.type || "party";
    }
    if (!resolvedContactType) resolvedContactType = "party";

    const isSale = ["party", "book"].includes(resolvedContactType);

    return Boolean(
      await Bill.exists({
        bill_no: trimmed,
        user_id: userId,
        is_gst: Number(isGst) === 1 ? 1 : 0,
        ...(isSale ?
          { contact_type: { $in: ["party", "book"] } }
        : (contactId ? { contact_id: contactId, contact_type: "supplier" } : { contact_type: "supplier" })),
        ...(resolvedFinancialYearId ?
          {
            $or: [
              { financial_year_id: resolvedFinancialYearId },
              ...(resolvedFinancialYear ?
                [
                  {
                    date: {
                      $gte: resolvedFinancialYear.start_date,
                      $lte: resolvedFinancialYear.end_date,
                    },
                  },
                ]
              : []),
            ],
          }
        : { financial_year_id: null }),
        ...(excludeBillId ? { _id: { $ne: excludeBillId } } : {}),
      }),
    );
  }

  async _resolveBillNo(providedBillNo, isGst, userId, contactType, scope = {}) {
    const hasProvidedBillNo =
      providedBillNo &&
      typeof providedBillNo === "string" &&
      providedBillNo.trim();

    // Allow alphanumeric bill numbers when manually provided
    if (hasProvidedBillNo) {
      const trimmed = providedBillNo.trim();

      const exists = await this._billNoExists(trimmed, userId, isGst, {
        ...scope,
        contactType,
      });
      if (exists) {
        throw ApiError.conflict(
          `Bill number '${trimmed}' already exists. Please use a different bill number.`,
        );
      }

      return trimmed;
    }

    return this._consumeNextBillNo(
      isGst,
      userId,
      contactType,
      scope.financialYearId,
      scope.contactId,
    );
  }

  async getNextBillNo(
    userId,
    fallbackIsGst,
    requestedIsGst,
    contactType,
    financialYearId = null,
    contactId = null,
  ) {
    const resolvedIsGst = this._resolveIsGstValue(
      requestedIsGst,
      fallbackIsGst,
    );
    const nextSeq = await this._peekNextAvailableBillSequence(
      userId,
      resolvedIsGst,
      contactType || "party",
      financialYearId,
      contactId,
    );

    return {
      bill_no: this._formatBillNo(nextSeq),
      sequence: nextSeq,
      is_gst: resolvedIsGst,
    };
  }

  async checkBillNoUnique(billNo, isGst, userId, scope = {}) {
    if (!billNo || typeof billNo !== "string" || !billNo.trim()) {
      throw ApiError.badRequest("bill_no is required");
    }
    const trimmed = billNo.trim();
    const exists = await this._billNoExists(trimmed, userId, isGst, scope);
    return { bill_no: trimmed, is_unique: !exists };
  }

  async createBill(billData, userId) {
    const {
      challan_ids,
      delivered_amount,
      transport_id,
      customer_name,
      vehicle_number,
      vehicle_no,
      transport_charge,
      amount: providedAmount,
      total_amount: providedTotalAmount,
      bill_no: providedBillNo,
      deduct_from_stock,
      financial_year_id,
      has_custom_shipping,
      shipping_name,
      shipping_address,
      shipping_city,
      shipping_state,
      shipping_state_code,
      shipping_pincode,
      shipping_gstin,
      shipping_pan,
    } = billData;
    const normalizedVehicleNumber =
      typeof vehicle_number === "string" ? vehicle_number : vehicle_no;

    if (!challan_ids || challan_ids.length === 0) {
      throw ApiError.badRequest("At least one challan is required");
    }

    const challanFilter = {
      _id: { $in: challan_ids },
      user_id: userId,
      converted_to_bill: false,
    };
    if (financial_year_id) challanFilter.financial_year_id = financial_year_id;

    const challans = await Challan.find(challanFilter);

    if (challans.length !== challan_ids.length) {
      throw ApiError.badRequest(
        "Some challans are invalid, already billed, or do not belong to your account",
      );
    }

    const challanTypes = [
      ...new Set(challans.map((challan) => challan.challan_type)),
    ];
    if (challanTypes.length !== 1) {
      throw ApiError.badRequest(
        "Selected challans contain mixed sale and purchase types. Please convert them separately.",
      );
    }
    const resolvedChallanType = challanTypes[0];
    const rawAmount =
      providedAmount !== undefined ? providedAmount : providedTotalAmount;

    const isChallanListConversion =
      rawAmount === undefined &&
      providedBillNo === undefined &&
      billData?.bill_no === undefined;

    const shouldRouteByItemType =
      resolvedChallanType === "sale" &&
      (isChallanListConversion ||
        challans.some((challan) => challan.stock_context !== "bill"));

    if (shouldRouteByItemType) {
      return this.batchConvertChallans(challan_ids, userId, {
        deduct_from_stock,
        financial_year_id,
      });
    }

    const groupedByContactAndFirm = new Map();
    for (const challan of challans) {
      const key = `${challan.challan_type}_${challan.is_gst}_${String(challan.contact_id)}`;
      if (!groupedByContactAndFirm.has(key)) {
        groupedByContactAndFirm.set(key, []);
      }
      groupedByContactAndFirm.get(key).push(challan._id);
    }

    // For challan-list conversion, split sale items into GST/NONGST bills.
    if (groupedByContactAndFirm.size > 1 && resolvedChallanType === "sale") {
      return this.batchConvertChallans(
        challans.map((challan) => challan._id),
        userId,
        { financial_year_id },
      );
    }

    if (groupedByContactAndFirm.size > 1) {
      throw ApiError.badRequest(
        "Selected purchase challans belong to multiple suppliers. Please convert one supplier at a time.",
      );
    }

    const contact_id = String(challans[0].contact_id);
    const resolvedIsGst = challans[0].is_gst;

    // Normalize deduct_from_stock: should be 1 or 0
    let requestedDeductFromStock = 1;
    if (resolvedChallanType === "sale") {
      requestedDeductFromStock = this._normalizeDeductFromStock(
        deduct_from_stock,
        1,
      );
    }

    const totalAmount =
      rawAmount === undefined || rawAmount === null || rawAmount === "" ?
        this._roundNetAmount(
          challans.reduce(
            (sum, challan) => sum + Number(challan.amount || 0),
            0,
          ),
        )
      : Number(rawAmount);
    if (!Number.isFinite(totalAmount) || totalAmount < 0) {
      throw ApiError.badRequest("amount must be a non-negative number");
    }
    const roundedTotalAmount = this._roundNetAmount(totalAmount);

    const contact = await Contact.findOne({
      _id: contact_id,
      user_id: userId,
    }).lean();
    if (!contact) throw ApiError.notFound("Contact not found");

    const shouldDeductFromStock = requestedDeductFromStock;

    let resolvedTransportId = null;
    if (transport_id) {
      const transportExists = await Transport.exists({
        _id: transport_id,
        user_id: userId,
      });
      if (!transportExists) {
        throw ApiError.badRequest(
          "Transport not found. Please select a valid transport.",
        );
      }
      resolvedTransportId = transport_id;
    } else if (contact.transport_id) {
      resolvedTransportId = contact.transport_id;
    }

    let resolvedTransportCharge = Number(
      transport_charge ?? contact.transport_charge ?? 0,
    );
    if (
      !Number.isFinite(resolvedTransportCharge) ||
      resolvedTransportCharge < 0
    ) {
      throw ApiError.badRequest(
        "transport_charge must be a non-negative number",
      );
    }

    let deliveredNum = null;
    if (delivered_amount !== undefined && delivered_amount !== null) {
      deliveredNum = this._round(Number(delivered_amount));
      if (!Number.isFinite(deliveredNum) || deliveredNum < 0) {
        throw ApiError.badRequest(
          "Delivered amount must be a non-negative number",
        );
      }
    }

    if (deliveredNum !== null && deliveredNum > roundedTotalAmount) {
      throw ApiError.badRequest("Delivered amount cannot exceed total amount");
    }

    let partialReturnAmount = 0;
    let billAmount = roundedTotalAmount;

    if (deliveredNum !== null) {
      partialReturnAmount = this._round(roundedTotalAmount - deliveredNum);
      billAmount = deliveredNum;
    }

    const contactType =
      resolvedChallanType === "purchase" ?
        "supplier"
      : billData.contact_type || contact.type || "party";
    const bill_no = await this._resolveBillNo(
      providedBillNo,
      resolvedIsGst,
      userId,
      contactType,
      {
        contactId: contact_id,
        financialYearId: financial_year_id || null,
        date: billData.date,
      },
    );
    const nextId = await getNextId("Bill", userId);

    const billDateObj = billData.date ? new Date(billData.date) : new Date();
    const partyDueDays = Number(contact?.due_days || 0);
    const computedDueDate = billData.due_date ? new Date(billData.due_date) : new Date(billDateObj.getTime() + partyDueDays * 24 * 60 * 60 * 1000);

    const bill = await Bill.create({
      id: nextId,
      bill_no,
      contact_id,
      contact_type: contactType,
      transport_id: resolvedTransportId,
      customer_name:
        typeof customer_name === "string" && customer_name.trim() ?
          customer_name.trim()
        : contact.name || "",
      vehicle_number:
        typeof normalizedVehicleNumber === "string" ?
          normalizedVehicleNumber.trim()
        : "",
      transport_charge: resolvedTransportCharge,
      date: billDateObj,
      due_date: computedDueDate,
      amount: billAmount,
      return_amount: 0,
      challan_ids,
      user_id: userId,
      is_gst: resolvedIsGst,
      financial_year_id: financial_year_id || null,
      paid_amount: 0,
      payment_status: "due",
      skip_stock_calculation:
        resolvedChallanType === "sale" && requestedDeductFromStock === 0,
      has_custom_shipping: Boolean(has_custom_shipping),
      shipping_name: this._normalizeOptionalText(shipping_name),
      shipping_address: this._normalizeOptionalText(shipping_address),
      shipping_city: this._normalizeOptionalText(shipping_city),
      shipping_state: this._normalizeOptionalText(shipping_state),
      shipping_state_code: this._normalizeOptionalText(shipping_state_code),
      shipping_pincode: this._normalizeOptionalText(shipping_pincode),
      shipping_gstin: this._normalizeOptionalText(shipping_gstin),
      shipping_pan: this._normalizeOptionalText(shipping_pan),
    });

    try {
      await this._applyChallanConversionStock(
        challans,
        userId,
        resolvedChallanType,
        {
          deduct_from_stock: shouldDeductFromStock,
          firm_is_gst: resolvedIsGst,
        },
      );
    } catch (error) {
      await Bill.findByIdAndDelete(bill._id);
      throw error;
    }

    await Challan.updateMany(
      { _id: { $in: challans.map((challan) => challan._id) } },
      { converted_to_bill: true, bill_id: bill._id },
    );
    emitChallanUpdate(userId, "converted", {
      challan_ids: challans.map((challan) => challan._id),
      bill_id: bill._id,
      converted_to_bill: true,
    });

    const stockCompensation = null;

    const populatedBill = await Bill.findById(bill._id)
      .populate("contact_id", "name type balance gst_balance nongst_balance transport_charge")
      .populate("transport_id", "name phone")
      .populate({
        path: "challan_ids",
        select: "amount discount sub_total date items",
      });

    return {
      bill: this._applyAutoBillSnapshotToBill(populatedBill),
      balance_applied: 0,
      partial_return: partialReturnAmount,
      deduct_from_stock: requestedDeductFromStock,
      stock_compensation: stockCompensation,
    };
  }

  /**
   * Batch-convert challans into bills by item GST type and contact.
   * Item is_gst=1 goes to GST bills; is_gst=0 goes to NONGST bills.
   */
  async batchConvertChallans(challanIds, userId, options = {}) {
    if (!Array.isArray(challanIds) || challanIds.length === 0) {
      throw ApiError.badRequest("At least one challan_id is required");
    }

    const filter = {
      _id: { $in: challanIds },
      user_id: userId,
      challan_type: "sale",
      converted_to_bill: false,
    };
    if (options.financial_year_id) {
      filter.financial_year_id = options.financial_year_id;
    }

    const challans = await Challan.find(filter)
      .populate("contact_id", "name balance transport_charge transport_id")
      .populate("items.item_id", "is_gst")
      .lean();

    if (challans.length !== challanIds.length) {
      throw ApiError.badRequest(
        "Some challans are invalid, already billed, or do not belong to your account",
      );
    }

    const groups = this._groupSaleChallansByItemType(challans);
    if (!groups.size) {
      throw ApiError.badRequest(
        "No billable GST/NONGST items found in selected challans",
      );
    }

    const createdBills = [];
    const billIdsBySourceChallan = new Map();
    const requestedDeductFromStock = this._normalizeDeductFromStock(
      options.deduct_from_stock,
      1,
    );

    for (const [, group] of groups) {
      const groupChallanIds = [...group.source_challan_ids];
      const totalAmount = this._roundNetAmount(
        group.auto_bill_items.reduce(
          (sum, item) => sum + (item.amount || 0),
          0,
        ),
      );
      if (totalAmount <= 0 || group.auto_bill_items.length === 0) continue;

      const contact = await Contact.findOne({
        _id: group.contact_id,
        user_id: userId,
      }).lean();

      if (!contact) {
        throw ApiError.notFound(
          `Contact not found for party '${group.contact_name}'`,
        );
      }

      let resolvedTransportId = null;
      if (contact.transport_id) {
        const transportExists = await Transport.exists({
          _id: contact.transport_id,
          user_id: userId,
        });
        if (transportExists) {
          resolvedTransportId = contact.transport_id;
        }
      }

      const resolvedTransportCharge = Number(contact.transport_charge || 0);

      const bill_no = await this._resolveBillNo(
        null,
        group.is_gst,
        userId,
        contact.type || "party",
        {
          contactId: group.contact_id,
          financialYearId: options.financial_year_id || null,
          date: group.challans?.[0]?.date,
        },
      );
      const nextId = await getNextId("Bill", userId);

      const batchBillDate = group.challans?.[0]?.date || new Date();
      const batchPartyDueDays = Number(contact?.due_days || 0);
      const batchDueDate = new Date(new Date(batchBillDate).getTime() + batchPartyDueDays * 24 * 60 * 60 * 1000);

      const bill = await Bill.create({
        id: nextId,
        bill_no,
        contact_id: group.contact_id,
        contact_type: contact.type || "party",
        transport_id: resolvedTransportId,
        customer_name: contact.name || "",
        vehicle_number: "",
        transport_charge: resolvedTransportCharge,
        date: batchBillDate,
        due_date: batchDueDate,
        amount: totalAmount,
        return_amount: 0,
        challan_ids: groupChallanIds,
        user_id: userId,
        is_gst: group.is_gst,
        financial_year_id: options.financial_year_id || null,
        paid_amount: 0,
        payment_status: "due",
        skip_stock_calculation: requestedDeductFromStock === 0,
        auto_bill_items: group.auto_bill_items,
      });

      try {
        await this._applyChallanConversionStock(
          group.challans,
          userId,
          "sale",
          { deduct_from_stock: requestedDeductFromStock },
        );
      } catch (error) {
        await Bill.findByIdAndDelete(bill._id);
        throw error;
      }

      for (const challanId of groupChallanIds) {
        if (!billIdsBySourceChallan.has(challanId)) {
          billIdsBySourceChallan.set(challanId, bill._id);
        }
      }
      emitChallanUpdate(userId, "converted", {
        challan_ids: groupChallanIds,
        bill_id: bill._id,
        converted_to_bill: true,
      });

      createdBills.push(bill);
    }

    if (createdBills.length === 0) {
      throw ApiError.badRequest(
        "No bill could be created for selected challan items",
      );
    }

    await Promise.all(
      [...billIdsBySourceChallan.entries()].map(([challanId, billId]) =>
        Challan.findByIdAndUpdate(challanId, {
          converted_to_bill: true,
          bill_id: billId,
        }),
      ),
    );

    const populatedBills = await Bill.find({
      _id: { $in: createdBills.map((b) => b._id) },
    })
      .populate("contact_id", "name type balance gst_balance nongst_balance transport_charge")
      .populate("transport_id", "name phone")
      .populate({
        path: "challan_ids",
        select: "amount discount sub_total date items",
      })
      .populate({
        path: "auto_bill_items.item_id",
        select:
          "item_name barcode item_id sale_rate gst_percent stock physical_stock logical_stock",
      });

    const normalizedBills = populatedBills.map((bill) =>
      this._applyAutoBillSnapshotToBill(bill),
    );

    return {
      bills: normalizedBills,
      total_bills_created: normalizedBills.length,
      groups: [...groups.values()].map((g) => ({
        is_gst: g.is_gst,
        firm_type: g.is_gst === 1 ? "GST" : "NON_GST",
        contact_id: g.contact_id,
        contact_name: g.contact_name,
        challan_count: g.challans.length,
      })),
    };
  }

  async settleBills(payload, userId, isGst, financialYearId = null) {
    const {
      contact_id,
      total_amount,
      payment_type,
      bank_id,
      reference_no,
      note,
      date,
      allocations,
      transaction_id,
    } = payload || {};

    let txnId = null;
    if (transaction_id && mongoose.Types.ObjectId.isValid(transaction_id)) {
      txnId = new mongoose.Types.ObjectId(transaction_id);
    }

    if (!contact_id) {
      throw ApiError.badRequest("contact_id is required");
    }

    const contact = await Contact.findOne({ _id: contact_id, user_id: userId });
    if (!contact) {
      throw ApiError.notFound("Contact not found");
    }
    const contactBalance = Math.max(
      0,
      this._round(
        (isGst === 1 || isGst === true ? contact.gst_balance : contact.nongst_balance) || 0
      )
    );

    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw ApiError.badRequest("allocations is required");
    }

    let allocationInputs = allocations;
    const normalizedAllocations = [];

    const seen = new Set();
    for (let i = 0; i < allocationInputs.length; i++) {
      const row = allocationInputs[i];
      if (!row?.bill_id) {
        throw ApiError.badRequest(`allocations[${i}].bill_id is required`);
      }

      const billId = String(row.bill_id);
      if (seen.has(billId)) {
        throw ApiError.badRequest(
          `Duplicate bill_id '${billId}' in allocations`,
        );
      }
      seen.add(billId);

      const amount = toNumber(row.amount ?? 0, `allocations[${i}].amount`, {
        min: 0,
      });
      const settlementDiscount = toNumber(
        row.settlement_discount ??
          row.settlementDiscount ??
          row.discount_amount ??
          row.discountAmount ??
          row.disc_amount ??
          row.discAmount ??
          0,
        `allocations[${i}].settlement_discount`,
        { min: 0 },
      );

      if (amount <= 0.009 && settlementDiscount <= 0.009) {
        throw ApiError.badRequest(
          `allocations[${i}] must include amount or settlement_discount`,
        );
      }

      normalizedAllocations.push({
        bill_id: billId,
        amount: this._round(amount),
        settlement_discount: this._round(settlementDiscount),
      });
    }

    const allocatedAmount = this._round(
      normalizedAllocations.reduce((sum, row) => sum + row.amount, 0),
    );
    const settlementDiscountAmount = this._round(
      normalizedAllocations.reduce(
        (sum, row) => sum + row.settlement_discount,
        0,
      ),
    );
    const totalAmount = this._round(
      toNumber(total_amount ?? contactBalance, "Total amount", { min: 0 }),
    );
    const hasPayment = allocatedAmount > 0;
    const paymentType =
      hasPayment ?
        this._normalizePaymentType(
          payment_type || DEFAULT_BALANCE_PAYMENT_TYPE[contact.type],
        )
      : null;
    const bankId =
      hasPayment ?
        await this._resolveOptionalPaymentBank(bank_id, userId)
      : null;
    const paymentDate =
      date !== undefined && date !== null && date !== "" ?
        new Date(date)
      : new Date();
    if (hasPayment && Number.isNaN(paymentDate.getTime())) {
      throw ApiError.badRequest("date must be a valid date");
    }

    const bills = await Bill.find({
      _id: { $in: normalizedAllocations.map((a) => a.bill_id) },
      contact_id,
      user_id: userId,
      is_gst: isGst,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });

    if (bills.length !== normalizedAllocations.length) {
      throw ApiError.badRequest(
        "One or more allocated bills are invalid or do not belong to this contact/firm",
      );
    }

    const billMap = new Map(bills.map((bill) => [String(bill._id), bill]));
    for (const allocation of normalizedAllocations) {
      const bill = billMap.get(allocation.bill_id);
      const due = this._getBillDue(bill);
      const totalSettlement = this._round(
        allocation.amount + allocation.settlement_discount,
      );
      if (totalSettlement > due + 0.009) {
        throw ApiError.badRequest(
          `Settlement for bill '${bill.bill_no}' exceeds due amount ${due}`,
        );
      }
    }

    if (allocatedAmount > totalAmount + 0.009) {
      throw ApiError.badRequest("Allocated total cannot exceed total_amount");
    }

    if (allocatedAmount > contactBalance + 0.009) {
      throw ApiError.badRequest(
        "Allocated total cannot exceed contact balance",
      );
    }

    const remainingAmount = this._round(totalAmount - allocatedAmount);

    const applied = [];
    let latestContact = null;

    if (allocatedAmount > 0.009) {
      const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";
      latestContact = await Contact.findOneAndUpdate(
        {
          _id: contact_id,
          user_id: userId,
          type: { $in: ["party", "supplier"] },
          [balanceField]: { $gte: allocatedAmount - 0.009 },
        },
        { $inc: { [balanceField]: -allocatedAmount } },
        { returnDocument: "after" },
      )
        .select(`_id name balance gst_balance nongst_balance`)
        .lean();

      if (!latestContact) {
        throw ApiError.badRequest(
          "Contact balance is not enough for this settlement",
        );
      }
    }

    for (const row of normalizedAllocations) {
      const bill = billMap.get(row.bill_id);
      if (!bill) continue;

      const dueBefore = this._getBillDue(bill);
      const paidAfter = this._round((bill.paid_amount || 0) + row.amount);
      const settlementDiscountAfter = this._round(
        (bill.settlement_discount || 0) + row.settlement_discount,
      );
      const paymentStatus = this._resolvePaymentStatus(
        bill.amount,
        paidAfter,
        settlementDiscountAfter,
        bill.return_amount || 0,
      );
      const dueAfter = Math.max(
        0,
        this._round(
          bill.amount -
            paidAfter -
            (bill.return_amount || 0) -
            settlementDiscountAfter,
        ),
      );

      const update = {
        paid_amount: paidAfter,
        settlement_discount: settlementDiscountAfter,
        payment_status: paymentStatus,
      };
      if (row.amount > 0.009) {
        update.$push = {
          payment_entries: this._buildPaymentEntry({
            amount: row.amount,
            paymentType,
            bankId,
            referenceNo: reference_no,
            note,
            settledTo: "bill",
            date: paymentDate,
            transactionId: txnId || null,
          }),
        };
      }
      const updated = await Bill.findByIdAndUpdate(bill._id, update, {
        returnDocument: "after",
      });

      if (!updated) continue;

      bill.paid_amount = paidAfter;
      bill.settlement_discount = settlementDiscountAfter;

      applied.push({
        bill_id: updated._id,
        bill_no: updated.bill_no,
        settled_amount: row.amount,
        settlement_discount: row.settlement_discount,
        due_before: dueBefore,
        due_after: dueAfter,
        payment_status: updated.payment_status,
      });
    }

    const unsettledAmount = Math.max(0, remainingAmount);

    if (!latestContact) {
      latestContact = await Contact.findById(contact_id)
        .select("_id name balance gst_balance nongst_balance")
        .lean();
    }

    if (latestContact) {
      const isGstVal = isGst === 1 || isGst === true;
      latestContact.balance = isGstVal
        ? (latestContact.gst_balance ?? latestContact.balance ?? 0)
        : (latestContact.nongst_balance ?? latestContact.balance ?? 0);
    }

    if (txnId) {
      await this.syncTransactionSettlement(txnId, userId, isGst);
    }

    await this._recalculateContactBalance(contact_id, userId, isGst);

    latestContact = await Contact.findById(contact_id)
      .select("_id name balance gst_balance nongst_balance")
      .lean();
    if (latestContact) {
      const isGstVal = isGst === 1 || isGst === true;
      latestContact.balance = isGstVal
        ? (latestContact.gst_balance ?? latestContact.balance ?? 0)
        : (latestContact.nongst_balance ?? latestContact.balance ?? 0);
    }

    return {
      contact: latestContact,
      total_amount: this._round(totalAmount),
      allocated_amount: allocatedAmount,
      settlement_discount_amount: settlementDiscountAmount,
      unsettled_amount: unsettledAmount,
      payment_type: paymentType,
      bank_id: bankId,
      applied,
    };
  }

  async recordPayment(billId, userId, isGst, payload, financialYearId = null) {
    if (typeof payload !== "object" || payload === null) {
      throw ApiError.badRequest("payload must be an object");
    }

    const amount = toNumber(payload.amount, "Payment amount", {
      min: 0.01,
    });

    const paymentType = this._normalizePaymentType(payload.payment_type);

    const bankId = await this._resolvePaymentBank(
      payload.bank_id,
      userId,
      paymentType,
    );

    const bill = await Bill.findOne({
      _id: billId,
      user_id: userId,
      is_gst: isGst,
    });
    if (!bill) throw ApiError.notFound("Bill not found");

    const newPaidAmount = this._round((bill.paid_amount || 0) + amount);
    const paymentStatus = this._resolvePaymentStatus(
      bill.amount,
      newPaidAmount,
      bill.settlement_discount || 0,
    );

    const excessAmount = Math.max(0, this._round(newPaidAmount - bill.amount));

    const entry = this._buildPaymentEntry({
      amount,
      paymentType,
      bankId,
      referenceNo: payload.reference_no,
      note: payload.note,
      settledTo: excessAmount > 0 ? "unsettled_balance" : "bill",
    });

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      {
        paid_amount: newPaidAmount,
        payment_status: paymentStatus,
        $push: { payment_entries: entry },
      },
      { returnDocument: "after" },
    ).populate("contact_id", "name type balance gst_balance nongst_balance");

    if (excessAmount > 0) {
      const balanceField = bill.is_gst === 1 || bill.is_gst === true ? "gst_balance" : "nongst_balance";
      await Contact.findByIdAndUpdate(bill.contact_id, {
        $inc: { [balanceField]: excessAmount },
      });
    }

    await this._recalculateContactBalance(bill.contact_id, userId, isGst);

    return this._applyAutoBillSnapshotToBill(updatedBill);
  }

  async handleReturn(billId, userId, isGst, payload, financialYearId = null) {
    if (typeof payload !== "object" || payload === null) {
      throw ApiError.badRequest("payload must be an object");
    }

    const returnAmount = toNumber(payload.return_amount, "Return amount", {
      min: 0.01,
    });

    const paymentType = this._normalizePaymentType(payload.payment_type);

    const bankId = await this._resolvePaymentBank(
      payload.bank_id,
      userId,
      paymentType,
    );

    const bill = await Bill.findOne({
      _id: billId,
      user_id: userId,
      is_gst: isGst,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });
    if (!bill) throw ApiError.notFound("Bill not found");

    if (returnAmount > bill.amount + 0.009) {
      throw ApiError.badRequest("Return amount cannot exceed bill amount");
    }

    const paymentStatus = this._resolvePaymentStatus(
      bill.amount,
      bill.paid_amount || 0,
      bill.settlement_discount || 0,
      (bill.return_amount || 0) + returnAmount,
    );

    const entry = this._buildPaymentEntry({
      amount: returnAmount,
      paymentType,
      bankId,
      referenceNo: payload.reference_no,
      note: payload.note,
      settledTo: "unsettled_balance",
    });

    const updatedBill = await Bill.findByIdAndUpdate(
      billId,
      {
        payment_status: paymentStatus,
        $inc: { return_amount: returnAmount },
        $push: { payment_entries: entry },
      },
      { returnDocument: "after" },
    ).populate("contact_id", "name type balance gst_balance nongst_balance");

    const prevOverpaid = Math.max(
      0,
      (bill.paid_amount || 0) -
        Math.max(0, bill.amount - (bill.settlement_discount || 0) - (bill.return_amount || 0)),
    );

    const newOverpaid = Math.max(
      0,
      (bill.paid_amount || 0) -
        Math.max(
          0,
          bill.amount -
            (bill.settlement_discount || 0) -
            ((bill.return_amount || 0) + returnAmount),
        ),
    );

    const contactBalanceDelta = Math.round((newOverpaid - prevOverpaid) * 100) / 100;

    const balanceField = bill.is_gst === 1 || bill.is_gst === true ? "gst_balance" : "nongst_balance";
    if (Math.abs(contactBalanceDelta) > 0.009) {
      await Contact.findByIdAndUpdate(bill.contact_id, {
        $inc: { [balanceField]: contactBalanceDelta },
      });
    }

    return this._applyAutoBillSnapshotToBill(updatedBill);
  }

  async updateBill(billId, userId, isGst, payload) {
    const bill = await Bill.findOne({
      _id: billId,
      user_id: userId,
      is_gst: isGst,
      ...(payload.financial_year_id ?
        { financial_year_id: payload.financial_year_id }
      : {}),
    });
    if (!bill) throw ApiError.notFound("Bill not found");
    if (Number(bill.paid_amount || 0) > 0) {
      throw ApiError.badRequest(
        "Cannot edit bill after payment has been recorded",
      );
    }

    const fields = {};

    if (payload.transport_id !== undefined) {
      if (payload.transport_id) {
        const transportExists = await Transport.exists({
          _id: payload.transport_id,
          user_id: userId,
        });
        if (!transportExists) throw ApiError.badRequest("Transport not found");
        fields.transport_id = payload.transport_id;
      } else {
        fields.transport_id = null;
      }
    }

    if (payload.customer_name !== undefined)
      fields.customer_name = this._normalizeOptionalText(payload.customer_name);
    const vehicleNumber =
      payload.vehicle_number ?? payload.vehicle_no ?? payload.vehicleNo;
    if (vehicleNumber !== undefined) {
      fields.vehicle_number = this._normalizeOptionalText(vehicleNumber);
    }
    if (payload.transport_charge !== undefined) {
      const charge = Number(payload.transport_charge);
      if (!Number.isFinite(charge) || charge < 0)
        throw ApiError.badRequest(
          "transport_charge must be a non-negative number",
        );
      fields.transport_charge = charge;
    }
    if (payload.date !== undefined) {
      const d = new Date(payload.date);
      if (isNaN(d.getTime())) throw ApiError.badRequest("Invalid date");
      fields.date = d;
    }
    if (payload.amount !== undefined) {
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || amount < 0) {
        throw ApiError.badRequest("amount must be a non-negative number");
      }
      fields.amount = this._round(amount);
    }
    if (payload.deduct_from_stock !== undefined) {
      fields.skip_stock_calculation =
        this._normalizeDeductFromStock(payload.deduct_from_stock, 1) === 0;
    }
    if (payload.has_custom_shipping !== undefined) {
      fields.has_custom_shipping = Boolean(payload.has_custom_shipping);
    }
    if (payload.shipping_name !== undefined) {
      fields.shipping_name = this._normalizeOptionalText(payload.shipping_name);
    }
    if (payload.shipping_address !== undefined) {
      fields.shipping_address = this._normalizeOptionalText(
        payload.shipping_address,
      );
    }
    if (payload.shipping_city !== undefined) {
      fields.shipping_city = this._normalizeOptionalText(payload.shipping_city);
    }
    if (payload.shipping_state !== undefined) {
      fields.shipping_state = this._normalizeOptionalText(
        payload.shipping_state,
      );
    }
    if (payload.shipping_state_code !== undefined) {
      fields.shipping_state_code = this._normalizeOptionalText(
        payload.shipping_state_code,
      );
    }
    if (payload.shipping_pincode !== undefined) {
      fields.shipping_pincode = this._normalizeOptionalText(
        payload.shipping_pincode,
      );
    }
    if (payload.shipping_gstin !== undefined) {
      fields.shipping_gstin = this._normalizeOptionalText(
        payload.shipping_gstin,
      );
    }
    if (payload.shipping_pan !== undefined) {
      fields.shipping_pan = this._normalizeOptionalText(payload.shipping_pan);
    }

    if (Object.keys(fields).length === 0)
      throw ApiError.badRequest("No valid fields to update");

    const updated = await Bill.findByIdAndUpdate(billId, fields, {
      returnDocument: "after",
    })
      .populate({
        path: "contact_id",
        select:
          "name phone type balance transport_charge transport_id gstin reg_number area area_id city state address",
        populate: { path: "area_id", select: "city state pincode" },
      })
      .populate("transport_id", "name phone gstin")
      .populate({
        path: "challan_ids",
        populate: {
          path: "items.item_id",
          select: "item_name alias description hsn_id",
        },
      })
      .populate({
        path: "auto_bill_items.item_id",
        select:
          "item_name alias description hsn_id barcode item_id sale_rate gst_percent",
      });

    return this._applyAutoBillSnapshotToBill(updated);
  }

  async getBillSummary(userId, isGst, financialYearId = null) {
    const baseFilter = { user_id: userId, is_gst: isGst };
    if (financialYearId) baseFilter.financial_year_id = financialYearId;
    const [total, paid, due] = await Promise.all([
      Bill.countDocuments(baseFilter),
      Bill.countDocuments({ ...baseFilter, payment_status: "paid" }),
      Bill.countDocuments({ ...baseFilter, payment_status: "due" }),
    ]);
    return { total, paid, due };
  }

  async deleteBill(billId, userId, isGst, financialYearId = null) {
    const bill = await Bill.findOne({
      _id: billId,
      user_id: userId,
      is_gst: isGst,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });
    if (!bill) throw ApiError.notFound("Bill not found");

    const hasSettlement =
      Number(bill.paid_amount || 0) > 0 ||
      Number(bill.settlement_discount || 0) > 0 ||
      Number(bill.return_amount || 0) > 0 ||
      (Array.isArray(bill.payment_entries) &&
        bill.payment_entries.length > 0) ||
      bill.payment_status === "paid" ||
      bill.payment_status === "overpaid";

    if (hasSettlement) {
      throw ApiError.badRequest(
        "Cannot delete bill because it has payment or settlement entries",
      );
    }

    const balanceField = bill.is_gst === 1 || bill.is_gst === true ? "gst_balance" : "nongst_balance";

    if (bill.paid_amount > bill.amount) {
      const excessAmount = bill.paid_amount - bill.amount;
      await Contact.findByIdAndUpdate(bill.contact_id, {
        $inc: { [balanceField]: -excessAmount },
      });
    }

    const prevOverpaid = Math.max(
      0,
      (bill.paid_amount || 0) -
        Math.max(0, bill.amount - (bill.settlement_discount || 0) - (bill.return_amount || 0)),
    );
    if (prevOverpaid > 0) {
      await Contact.findByIdAndUpdate(bill.contact_id, {
        $inc: { [balanceField]: -prevOverpaid },
      });
    }

    const hasSnapshotItems =
      Array.isArray(bill.auto_bill_items) && bill.auto_bill_items.length > 0;

    if (!bill.is_auto_bill && hasSnapshotItems) {
      const snapshotItems = bill.auto_bill_items.map((item) => ({
        item_id: item.item_id,
        quantity: Number(item.quantity) || 0,
      }));

      if (bill.skip_stock_calculation) {
        await stockService.adjustStock(snapshotItems, userId, {
          physical: -1,
          logical: 1,
        });
      } else {
        await stockService.adjustStock(snapshotItems, userId, { logical: 1 });
      }

      await this._restoreSplitBillChallans(bill, userId);
    } else if (bill.is_auto_bill && hasSnapshotItems) {
      await stockService.deductStockForBill(
        bill.auto_bill_items.map((item) => ({
          item_id: item.item_id,
          quantity: -(Number(item.quantity) || 0),
        })),
        userId,
        Number(bill.is_gst ?? 1) === 1 ? 1 : 0,
        bill.skip_stock_calculation ? 0 : 1,
      );
      await this._restoreAutoBillChallans(bill);
    } else {
      const reversedCount = await this._reverseAndDeleteLinkedChallans(
        bill,
        userId,
      );

      // Fallback for older records where linked challans may not match bill_id.
      if (reversedCount === 0) {
        await Challan.updateMany(
          { _id: { $in: bill.challan_ids } },
          { converted_to_bill: false, bill_id: null },
        );
        emitChallanUpdate(userId, "restored", {
          challan_ids: bill.challan_ids,
          converted_to_bill: false,
        });
      }
    }

    await Bill.findByIdAndDelete(billId);
  }

  async undoBillSettlement(billId, userId, isGst, financialYearId = null) {
    const bill = await Bill.findOne({
      _id: billId,
      user_id: userId,
      is_gst: isGst,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });
    if (!bill) throw ApiError.notFound("Bill not found");

    const paidAmount = this._round(bill.paid_amount || 0);
    const settlementDiscount = this._round(bill.settlement_discount || 0);
    const refundAmount = this._round(paidAmount + settlementDiscount);

    if (refundAmount <= 0.009) {
      throw ApiError.badRequest("Bill does not have settlement to undo");
    }

    const settlementTransactionIds = [
      ...new Set(
        (bill.payment_entries || [])
          .filter((entry) => entry?.settled_to === "bill" && entry?.transaction_id)
          .map((entry) => String(entry.transaction_id)),
      ),
    ];

    bill.paid_amount = 0;
    bill.settlement_discount = 0;
    bill.payment_status = this._resolvePaymentStatus(bill.amount, 0, 0);
    bill.payment_entries = (bill.payment_entries || []).filter(
      (entry) => entry?.settled_to && entry.settled_to !== "bill",
    );

    await bill.save();

    if (settlementTransactionIds.length) {
      await Promise.all(
        settlementTransactionIds.map(async (transactionId) => {
          await this.syncTransactionSettlement(transactionId, userId, isGst);
        }),
      );
    }

    const balanceField = bill.is_gst === 1 || bill.is_gst === true ? "gst_balance" : "nongst_balance";

    await Contact.findOneAndUpdate(
      { _id: bill.contact_id, user_id: userId },
      { $inc: { [balanceField]: refundAmount } },
    );

    await this._recalculateContactBalance(bill.contact_id, userId, isGst);

    const contact = await Contact.findById(bill.contact_id)
      .select("_id name balance gst_balance nongst_balance")
      .lean();

    if (contact) {
      contact.balance = bill.is_gst === 1 || bill.is_gst === true
        ? (contact.gst_balance || 0)
        : (contact.nongst_balance || 0);
    }

    return {
      bill,
      contact,
      refunded_amount: refundAmount,
      paid_amount: paidAmount,
      settlement_discount: settlementDiscount,
    };
  }

  async getBillsForContact(contactId, userId, isGst, query) {
    const filter = {
      contact_id: contactId,
      user_id: userId,
      is_gst: isGst,
    };
    if (query.financial_year_id)
      filter.financial_year_id = query.financial_year_id;
    if (query.payment_status) filter.payment_status = query.payment_status;
    return Pagination.paginate(Bill, filter, {
      ...query,
      populate: [
        {
          path: "contact_id",
          select: "name phone type balance transport_charge transport_id",
        },
        { path: "transport_id", select: "name phone" },
      ],
      sort: { createdAt: -1 },
    });
  }

  async getLastSoldItem(itemId, userId, isGst, query = {}) {
    if (!itemId || !mongoose.Types.ObjectId.isValid(itemId)) {
      throw ApiError.badRequest("Valid item_id is required");
    }

    let contactId = null;
    let contactType = null;
    if (query.contact_id) {
      if (!mongoose.Types.ObjectId.isValid(query.contact_id)) {
        throw ApiError.badRequest("Invalid contact_id");
      }
      const contact = await Contact.findOne({
        _id: query.contact_id,
        user_id: userId,
      })
        .select("type")
        .lean();
      if (!contact) {
        throw ApiError.notFound("Contact not found");
      }
      contactId = query.contact_id;
      contactType = contact.type || null;
    }

    let entryType = String(query.entry_type || "")
      .trim()
      .toLowerCase();
    if (!["sale", "purchase"].includes(entryType)) {
      entryType = contactType === "supplier" ? "purchase" : "sale";
    }

    if (entryType === "purchase") {
      const purchaseFilter = {
        user_id: userId,
        is_gst: isGst,
        challan_type: "purchase",
        converted_to_bill: true,
        "items.item_id": itemId,
      };
      if (query.financial_year_id) {
        purchaseFilter.financial_year_id = query.financial_year_id;
      }
      if (contactId) purchaseFilter.contact_id = contactId;

      const challans = await Challan.find(purchaseFilter)
        .sort({ date: -1, createdAt: -1, _id: -1 })
        .select(
          "bill_id challan_no date amount payment_status items contact_id createdAt",
        )
        .populate("contact_id", "name phone type")
        .populate(
          "items.item_id",
          "item_name alias description hsn_id barcode item_id sale_rate mrp_rate gst_percent image",
        )
        .lean();

      if (!challans.length) return [];

      const billIds = [
        ...new Set(challans.map((c) => String(c.bill_id)).filter(Boolean)),
      ];

      const bills =
        billIds.length ?
          await Bill.find({
            _id: { $in: billIds },
            user_id: userId,
            is_gst: isGst,
            ...(query.financial_year_id ?
              { financial_year_id: query.financial_year_id }
            : {}),
          })
            .select("_id bill_no date amount payment_status")
            .lean()
        : [];

      const billMap = new Map(bills.map((bill) => [String(bill._id), bill]));
      const normalizedItemId = String(itemId);
      const entries = [];

      for (const challan of challans) {
        const bill =
          challan.bill_id ? billMap.get(String(challan.bill_id)) : null;
        if (!bill) continue;

        for (const line of challan.items || []) {
          const lineItem = line?.item_id;
          const lineItemId =
            typeof lineItem === "object" && lineItem?._id ?
              String(lineItem._id)
            : String(lineItem);

          if (lineItemId !== normalizedItemId) continue;

          entries.push({
            bill_id: bill._id,
            bill_no: bill.bill_no,
            bill_date: bill.date,
            bill_amount: bill.amount,
            bill_payment_status: bill.payment_status,
            challan_no: challan.challan_no,
            challan_date: challan.date,
            contact: challan.contact_id,
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
            is_gst: line.is_gst,
            entry_type: "purchase",
          });
        }
      }

      entries.sort((a, b) => {
        const dateDiff =
          new Date(b.bill_date || b.challan_date).getTime() -
          new Date(a.bill_date || a.challan_date).getTime();
        if (dateDiff !== 0) return dateDiff;
        return (
          new Date(b.challan_date).getTime() -
          new Date(a.challan_date).getTime()
        );
      });

      return entries.slice(0, 4);
    }

    const saleFilter = {
      user_id: userId,
      is_gst: isGst,
      challan_type: "sale",
      converted_to_bill: true,
      "items.item_id": itemId,
    };
    if (query.financial_year_id) {
      saleFilter.financial_year_id = query.financial_year_id;
    }
    if (contactId) saleFilter.contact_id = contactId;

    const challans = await Challan.find(saleFilter)
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .select("bill_id challan_no date items contact_id")
      .populate("contact_id", "name phone type")
      .populate(
        "items.item_id",
        "item_name alias description hsn_id barcode item_id sale_rate mrp_rate gst_percent image",
      )
      .lean();

    if (challans.length === 0) return [];

    const billIds = [
      ...new Set(challans.map((c) => String(c.bill_id)).filter(Boolean)),
    ];

    const bills = await Bill.find({
      _id: { $in: billIds },
      user_id: userId,
      is_gst: isGst,
      ...(query.financial_year_id ?
        { financial_year_id: query.financial_year_id }
      : {}),
    })
      .select("_id bill_no date amount payment_status")
      .lean();

    const billMap = new Map(bills.map((b) => [String(b._id), b]));
    const normalizedItemId = String(itemId);
    const entries = [];

    for (const challan of challans) {
      const bill =
        challan.bill_id ? billMap.get(String(challan.bill_id)) : null;
      if (!bill) continue;

      for (const line of challan.items || []) {
        const lineItem = line?.item_id;
        const lineItemId =
          typeof lineItem === "object" && lineItem?._id ?
            String(lineItem._id)
          : String(lineItem);

        if (lineItemId !== normalizedItemId) continue;

        entries.push({
          bill_id: bill._id,
          bill_no: bill.bill_no,
          bill_date: bill.date,
          bill_amount: bill.amount,
          bill_payment_status: bill.payment_status,
          challan_no: challan.challan_no,
          challan_date: challan.date,
          contact: challan.contact_id,
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
          is_gst: line.is_gst,
          entry_type: "sale",
        });
      }
    }

    entries.sort((a, b) => {
      const billDateDiff =
        new Date(b.bill_date).getTime() - new Date(a.bill_date).getTime();
      if (billDateDiff !== 0) return billDateDiff;
      return (
        new Date(b.challan_date).getTime() - new Date(a.challan_date).getTime()
      );
    });

    return entries.slice(0, 4);
  }

  async createAutoBill(billData, userId) {
    const {
      contact_id,
      amount,
      auto_bill_rule_id,
      auto_bill_items,
      is_gst,
      financial_year_id,
      date,
    } = billData;

    const contact = await Contact.findOne({
      _id: contact_id,
      user_id: userId,
    }).lean();
    if (!contact) throw ApiError.notFound("Contact not found");

    const billDate = date ? new Date(date) : new Date();
    if (Number.isNaN(billDate.getTime())) {
      throw ApiError.badRequest("date must be a valid date");
    }
    const resolvedFinancialYearId =
      financial_year_id ||
      (await this._resolveFinancialYearByDate(userId, billDate))?._id ||
      null;

    const contactType = contact.type || "party";
    const bill_no = await this._resolveBillNo(
      null,
      is_gst,
      userId,
      contactType,
      {
        contactId: contact_id,
        financialYearId: resolvedFinancialYearId,
        date: billDate,
      },
    );
    const nextId = await getNextId("Bill", userId);

    const autoBillDateObj = billDate || new Date();
    const autoPartyDueDays = Number(contact?.due_days || 0);
    const autoDueDate = new Date(new Date(autoBillDateObj).getTime() + autoPartyDueDays * 24 * 60 * 60 * 1000);

    const bill = await Bill.create({
      id: nextId,
      bill_no,
      contact_id,
      contact_type: contactType,
      transport_id: contact.transport_id || null,
      customer_name: contact.name || "",
      vehicle_number: "",
      transport_charge: Number(contact.transport_charge || 0),
      date: autoBillDateObj,
      due_date: autoDueDate,
      amount: this._roundNetAmount(amount),
      return_amount: 0,
      challan_ids: [],
      user_id: userId,
      is_gst,
      financial_year_id: resolvedFinancialYearId,
      paid_amount: 0,
      payment_status: "due",
      is_auto_bill: true,
      auto_bill_rule_id,
      auto_bill_items,
      skip_stock_calculation: false,
    });

    return bill;
  }

  async _recalculateContactBalance(contactId, userId, isGst) {
    if (!contactId) return;
    const isGstVal = isGst === 1 || isGst === true;
    const balanceField = isGstVal ? "gst_balance" : "nongst_balance";

    const [txns, bills] = await Promise.all([
      Transaction.find({
        contact_id: contactId,
        user_id: userId,
        is_gst: isGstVal ? 1 : 0,
      }).lean(),
      Bill.find({
        contact_id: contactId,
        user_id: userId,
        is_gst: isGstVal ? 1 : 0,
      }).lean(),
    ]);

    let balance = 0;
    for (const txn of txns) {
      const settled = txn.settlement_summary?.settled_amount || 0;
      const unsettled = Number(txn.amount || 0) - settled;
      balance += Math.max(0, unsettled);
    }
    for (const bill of bills) {
      const netAmount = Math.max(
        0,
        Number(bill.amount || 0) -
          Number(bill.settlement_discount || 0) -
          Number(bill.return_amount || 0),
      );
      const overpaid = Math.max(0, Number(bill.paid_amount || 0) - netAmount);
      balance += overpaid;
    }
    balance = Math.round(balance * 100) / 100;

    await Contact.updateOne(
      { _id: contactId, user_id: userId },
      { $set: { [balanceField]: balance } },
    );
  }
}

export default new BillService();
