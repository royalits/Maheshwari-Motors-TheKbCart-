import Transaction from "../../models/transaction/transaction.model.js";
import Contact from "../../models/master/contact.model.js";
import Bank from "../../models/master/bank.model.js";
import Bill from "../../models/transaction/bill.model.js";
import mongoose from "mongoose";
import { ApiError, Pagination } from "../../utils/index.js";
import { getNextId } from "../../helpers/counter.js";

const TRANSACTION_POPULATE = [
  { path: "contact_id", select: "name phone type balance gst_balance nongst_balance" },
  { path: "bank_id", select: "bank_name account_number ifsc_code" },
];

const BANK_TYPES = ["bank_received", "bank_payment"];
const CASH_TYPES = ["cash_received", "cash_payment"];
const RECEIVED_TYPES = ["bank_received", "cash_received"];
const PAYMENT_TYPES = ["bank_payment", "cash_payment"];
const ALL_TYPES = [...BANK_TYPES, ...CASH_TYPES];
const BILL_RECEIVED_PAYMENT_TYPES = [
  "bank_transaction_received_amount",
  "cash_payment_received_amount",
  // legacy typo variants kept for backward compatibility with old records
  "bank_transaction_recieved_amount",
  "cash_payment_recieved_amount",
];
const BILL_GIVEN_PAYMENT_TYPES = [
  "bank_transfer_payment_given",
  "cash_payment_given",
];

const BOOK_FILTERS = {
  cash_book: { type: { $in: CASH_TYPES } },
  ac_book: { type: { $in: BANK_TYPES } },
  creditor: { type: { $in: PAYMENT_TYPES } },
  debitor: { type: { $in: RECEIVED_TYPES } },
};

class TransactionService {
  _round(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  async _getBalanceContact(contactId, userId, isGst) {
    if (!contactId) return null;
    return Contact.findOne({
      _id: contactId,
      user_id: userId,
      type: { $in: ["party", "supplier"] },
    }).select(`_id balance gst_balance nongst_balance type`);
  }

  async _adjustContactBalance(contactId, userId, amount, isGst) {
    const delta = this._round(amount);
    if (!contactId || Math.abs(delta) <= 0.009) return null;

    const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";
    return Contact.findOneAndUpdate(
      {
        _id: contactId,
        user_id: userId,
        type: { $in: ["party", "supplier"] },
      },
      { $inc: { [balanceField]: delta } },
      { returnDocument: "after" },
    ).select(`_id balance gst_balance nongst_balance type`);
  }

  async _assertContactBalanceCanDecrease(contactId, userId, amount, message, isGst) {
    const decreaseAmount = this._round(amount);
    if (!contactId || decreaseAmount <= 0.009) return;

    const contact = await this._getBalanceContact(contactId, userId, isGst);
    if (!contact) return;

    const balanceVal = isGst === 1 || isGst === true ? (contact.gst_balance || 0) : (contact.nongst_balance || 0);
    if (this._round(balanceVal) + 0.009 < decreaseAmount) {
      throw ApiError.badRequest(message);
    }
  }

  async getTransactions(userId, isGst, query) {
    const filter = { user_id: userId, is_gst: isGst };

    if (query.financial_year_id) filter.financial_year_id = query.financial_year_id;
    if (query.type) filter.type = query.type;
    if (query.contact_id) filter.contact_id = query.contact_id;
    if (query.bank_id) filter.bank_id = query.bank_id;

    if (query.book && BOOK_FILTERS[query.book]) {
      Object.assign(filter, BOOK_FILTERS[query.book]);
    }

    if (query.from_date || query.to_date) {
      filter.date = {};
      if (query.from_date) filter.date.$gte = new Date(query.from_date);
      if (query.to_date) filter.date.$lte = new Date(query.to_date);
    }

    const result = await Pagination.paginate(Transaction, filter, {
      ...query,
      populate: TRANSACTION_POPULATE,
      sort: { date: -1, createdAt: -1 },
    });
    if (result && Array.isArray(result.data)) {
      result.data = result.data.map(txn => this._mapTxnContactBalance(txn, isGst));
    }
    return result;
  }

  async getTransactionById(transactionId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: transactionId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const doc = await Transaction.findOne(filter)
      .populate(TRANSACTION_POPULATE)
      .lean();

    if (!doc) throw ApiError.notFound("Transaction not found");
    return this._mapTxnContactBalance(doc, isGst);
  }

  async createTransaction(data, userId, isGst) {
    const {
      transaction_no,
      type,
      date,
      contact_id,
      amount,
      bank_id,
      reference,
      remarks,
      financial_year_id,
    } = data;

    if (!type) throw ApiError.badRequest("type is required");
    if (!ALL_TYPES.includes(type))
      throw ApiError.badRequest(
        `Invalid type. Must be one of: ${ALL_TYPES.join(", ")}`,
      );
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0)
      throw ApiError.badRequest("amount must be >= 0");
    if (!contact_id) throw ApiError.badRequest("contact_id is required");

    const contact = await Contact.findOne({ _id: contact_id, user_id: userId });
    if (!contact) throw ApiError.notFound("Contact not found");

    if (BANK_TYPES.includes(type)) {
      if (!bank_id)
        throw ApiError.badRequest("bank_id is required for bank transactions");
      const bank = await Bank.findOne({ _id: bank_id, user_id: userId });
      if (!bank) throw ApiError.notFound("Bank not found");
    }

    const nextId = await getNextId("Transaction", userId);

    let txnNo = transaction_no?.trim();
    if (txnNo) {
      const exists = await Transaction.findOne({
        transaction_no: txnNo,
        user_id: userId,
        is_gst: isGst,
      });
      if (exists)
        throw ApiError.badRequest(
          `Transaction number "${txnNo}" already exists`,
        );
    } else {
      txnNo = `TXN-${nextId}`;
    }

    const doc = await Transaction.create({
      id: nextId,
      transaction_no: txnNo,
      type,
      date: date ? new Date(date) : new Date(),
      contact_id,
      contact_type: contact.type || null,
      amount: this._round(numericAmount),
      bank_id: BANK_TYPES.includes(type) ? bank_id : null,
      reference: reference || "",
      remarks: remarks || "",
      is_gst: isGst,
      financial_year_id: financial_year_id || null,
      user_id: userId,
    });

    await this._adjustContactBalance(contact_id, userId, doc.amount, doc.is_gst);

    const populated = await Transaction.findById(doc._id).populate(TRANSACTION_POPULATE).lean();
    return this._mapTxnContactBalance(populated, isGst);
  }

  async updateTransaction(transactionId, data, userId, isGst) {
    const filter = {
      _id: transactionId,
      user_id: userId,
      is_gst: isGst,
    };
    if (data?.financial_year_id) filter.financial_year_id = data.financial_year_id;

    const doc = await Transaction.findOne(filter);
    if (!doc) throw ApiError.notFound("Transaction not found");

    const previousContactId = doc.contact_id ? String(doc.contact_id) : "";
    const previousAmount = this._round(doc.amount || 0);

    const {
      transaction_no,
      type,
      date,
      contact_id,
      amount,
      bank_id,
      reference,
      remarks,
    } = data;

    const nextContactIdInput =
      contact_id !== undefined && contact_id !== null && contact_id !== "" ?
        String(contact_id)
      : previousContactId;
    const nextAmountInput =
      amount !== undefined && amount !== null ? Number(amount) : previousAmount;
    const balanceDecrease =
      previousContactId && previousContactId !== nextContactIdInput ?
        previousAmount
      : previousContactId ?
        Math.max(0, previousAmount - nextAmountInput)
      : 0;

    if (doc.settlement_status === "settled" && balanceDecrease > 0.009) {
      throw ApiError.badRequest(
        "Cannot reduce this transaction because it is participating in settlement",
      );
    }

    await this._assertContactBalanceCanDecrease(
      previousContactId,
      userId,
      balanceDecrease,
      "Cannot reduce this transaction because its amount is already used in settlement",
      doc.is_gst,
    );

    if (type) {
      if (!ALL_TYPES.includes(type))
        throw ApiError.badRequest(
          `Invalid type. Must be one of: ${ALL_TYPES.join(", ")}`,
        );
      doc.type = type;
    }

    if (transaction_no !== undefined) {
      const txnNo = transaction_no.trim();
      if (txnNo && txnNo !== doc.transaction_no) {
        const exists = await Transaction.findOne({
          transaction_no: txnNo,
          user_id: userId,
          is_gst: isGst,
          _id: { $ne: doc._id },
        });
        if (exists)
          throw ApiError.badRequest(
            `Transaction number "${txnNo}" already exists`,
          );
        doc.transaction_no = txnNo;
      }
    }

    if (contact_id) {
      const contact = await Contact.findOne({
        _id: contact_id,
        user_id: userId,
      });
      if (!contact) throw ApiError.notFound("Contact not found");
      doc.contact_id = contact_id;
      doc.contact_type = contact.type || null;
    } else if (!doc.contact_type && doc.contact_id) {
      const existingContact = await Contact.findOne({
        _id: doc.contact_id,
        user_id: userId,
      }).select("type");
      doc.contact_type = existingContact?.type || null;
    }

    const effectiveType = doc.type;
    if (BANK_TYPES.includes(effectiveType)) {
      const effectiveBankId = bank_id !== undefined ? bank_id : doc.bank_id;
      if (!effectiveBankId)
        throw ApiError.badRequest("bank_id is required for bank transactions");
      const bank = await Bank.findOne({
        _id: effectiveBankId,
        user_id: userId,
      });
      if (!bank) throw ApiError.notFound("Bank not found");
      doc.bank_id = effectiveBankId;
    } else {
      doc.bank_id = null;
    }

    if (date) doc.date = new Date(date);
    if (amount != null) {
      if (!Number.isFinite(nextAmountInput) || nextAmountInput < 0) {
        throw ApiError.badRequest("amount must be >= 0");
      }
      doc.amount = this._round(nextAmountInput);
    }
    if (reference !== undefined) doc.reference = reference;
    if (remarks !== undefined) doc.remarks = remarks;

    await doc.save();
    const nextContactId = doc.contact_id ? String(doc.contact_id) : "";
    const nextAmount = this._round(doc.amount || 0);

    if (previousContactId && previousContactId !== nextContactId) {
      await this._adjustContactBalance(previousContactId, userId, -previousAmount, doc.is_gst);
      await this._adjustContactBalance(nextContactId, userId, nextAmount, doc.is_gst);
    } else if (nextContactId) {
      await this._adjustContactBalance(
        nextContactId,
        userId,
        this._round(nextAmount - previousAmount),
        doc.is_gst,
      );
    }

    const populated = await Transaction.findById(doc._id).populate(TRANSACTION_POPULATE).lean();
    return this._mapTxnContactBalance(populated, isGst);
  }

  async deleteTransaction(transactionId, userId, isGst, financialYearId = null) {
    const filter = {
      _id: transactionId,
      user_id: userId,
      is_gst: isGst,
    };
    if (financialYearId) filter.financial_year_id = financialYearId;

    const doc = await Transaction.findOne(filter);
    if (!doc) throw ApiError.notFound("Transaction not found");

    const linkedBill = await Bill.exists({
      user_id: userId,
      is_gst: isGst,
      "payment_entries.transaction_id": doc._id,
      ...(financialYearId ? { financial_year_id: financialYearId } : {}),
    });

    if (linkedBill) {
      throw ApiError.badRequest(
        "Cannot delete transaction because it is linked to bill settlement",
      );
    }

    await this._assertContactBalanceCanDecrease(
      doc.contact_id,
      userId,
      doc.amount || 0,
      "Cannot delete transaction because its amount is already used in settlement",
      doc.is_gst,
    );

    await Transaction.deleteOne({ _id: doc._id });
    await this._adjustContactBalance(doc.contact_id, userId, -(doc.amount || 0), doc.is_gst);
    return doc;
  }

  async getBookSummary(userId, isGst, query) {
    const filter = { user_id: userId, is_gst: isGst };

    if (query.financial_year_id) filter.financial_year_id = query.financial_year_id;

    if (query.from_date || query.to_date) {
      filter.date = {};
      if (query.from_date) filter.date.$gte = new Date(query.from_date);
      if (query.to_date) filter.date.$lte = new Date(query.to_date);
    }

    const result = await Transaction.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$type",
          total_amount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const summary = {
      bank_received: { total_amount: 0, count: 0 },
      cash_received: { total_amount: 0, count: 0 },
      bank_payment: { total_amount: 0, count: 0 },
      cash_payment: { total_amount: 0, count: 0 },
    };

    for (const r of result) {
      if (summary[r._id]) {
        summary[r._id] = {
          total_amount: r.total_amount,
          count: r.count,
        };
      }
    }

    summary.cash_book = {
      total_received: summary.cash_received.total_amount,
      total_payment: summary.cash_payment.total_amount,
      net:
        summary.cash_received.total_amount - summary.cash_payment.total_amount,
      count: summary.cash_received.count + summary.cash_payment.count,
    };

    summary.ac_book = {
      total_received: summary.bank_received.total_amount,
      total_payment: summary.bank_payment.total_amount,
      net:
        summary.bank_received.total_amount - summary.bank_payment.total_amount,
      count: summary.bank_received.count + summary.bank_payment.count,
    };

    summary.creditor = {
      total_amount:
        summary.bank_payment.total_amount + summary.cash_payment.total_amount,
      count: summary.bank_payment.count + summary.cash_payment.count,
    };

    summary.debitor = {
      total_amount:
        summary.bank_received.total_amount + summary.cash_received.total_amount,
      count: summary.bank_received.count + summary.cash_received.count,
    };

    return summary;
  }

  async getLastPayment(userId, isGst, query = {}) {
    let effectiveIsGst = isGst;
    if (query.is_gst !== undefined && query.is_gst !== null && query.is_gst !== "") {
      const parsed = Number(query.is_gst);
      if (![0, 1].includes(parsed)) {
        throw ApiError.badRequest("is_gst must be 0 or 1");
      }
      effectiveIsGst = parsed;
    }

    const filter = {
      user_id: userId,
      is_gst: effectiveIsGst,
      type: { $in: ALL_TYPES },
    };

    if (query.financial_year_id) {
      filter.financial_year_id = query.financial_year_id;
    }

    if (query.contact_id) {
      if (!mongoose.Types.ObjectId.isValid(query.contact_id)) {
        throw ApiError.badRequest("Invalid contact_id");
      }
      filter.contact_id = query.contact_id;
    }

    const side = String(query.side || "").trim().toLowerCase();
    if (side === "received") {
      filter.type = { $in: RECEIVED_TYPES };
    } else if (side === "payment") {
      filter.type = { $in: PAYMENT_TYPES };
    }

    const lastTxn = await Transaction.findOne(filter)
      .sort({ date: -1, createdAt: -1, _id: -1 })
      .select("date amount type transaction_no contact_id")
      .lean();

    let lastBillPayment = null;
    if (query.contact_id) {
      const paymentEntryTypeFilter =
        side === "received" ? { $in: BILL_RECEIVED_PAYMENT_TYPES }
        : side === "payment" ? { $in: BILL_GIVEN_PAYMENT_TYPES }
        : { $in: [...BILL_RECEIVED_PAYMENT_TYPES, ...BILL_GIVEN_PAYMENT_TYPES] };

      const [entry] = await Bill.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            is_gst: effectiveIsGst,
            contact_id: new mongoose.Types.ObjectId(query.contact_id),
            ...(query.financial_year_id
              ? { financial_year_id: new mongoose.Types.ObjectId(query.financial_year_id) }
              : {}),
          },
        },
        { $unwind: "$payment_entries" },
        {
          $match: {
            "payment_entries.amount": { $gt: 0 },
            "payment_entries.payment_type": paymentEntryTypeFilter,
          },
        },
        { $sort: { "payment_entries.date": -1, createdAt: -1, _id: -1 } },
        { $limit: 1 },
        {
          $project: {
            _id: 0,
            date: "$payment_entries.date",
            amount: "$payment_entries.amount",
          },
        },
      ]);
      lastBillPayment = entry || null;

      // Older databases can have paid_amount updated without payment_entries.
      // Fallback to latest paid bill if no payment entry exists.
      if (!lastBillPayment) {
        const paidBill = await Bill.findOne({
          user_id: userId,
          is_gst: effectiveIsGst,
          contact_id: query.contact_id,
          ...(query.financial_year_id
            ? { financial_year_id: query.financial_year_id }
            : {}),
          paid_amount: { $gt: 0 },
        })
          .sort({ updatedAt: -1, date: -1, _id: -1 })
          .select("updatedAt date paid_amount")
          .lean();

        if (paidBill) {
          lastBillPayment = {
            date: paidBill.updatedAt || paidBill.date || null,
            amount: Number(paidBill.paid_amount || 0),
          };
        }
      }
    }

    const txnDate = lastTxn?.date ? new Date(lastTxn.date) : null;
    const billDate = lastBillPayment?.date ? new Date(lastBillPayment.date) : null;
    const useBillEntry =
      billDate &&
      (!txnDate || billDate.getTime() > txnDate.getTime());
    const finalDate =
      useBillEntry ? lastBillPayment?.date
      : lastTxn?.date || lastBillPayment?.date || null;
    const finalAmount =
      useBillEntry ? lastBillPayment?.amount
      : lastTxn?.amount ?? lastBillPayment?.amount ?? null;

    return {
      last_payment_date: finalDate || null,
      last_payment_amount:
        Number.isFinite(Number(finalAmount)) ?
          Number(finalAmount)
        : null,
    };
  }

  _mapTxnContactBalance(txn, isGst) {
    if (!txn) return txn;
    const isGstVal = isGst === 1 || isGst === true;
    
    // Support both mongoose document and lean object
    const txnObj = typeof txn.toObject === "function" ? txn.toObject() : txn;
    
    if (txnObj.contact_id) {
      txnObj.contact_id.balance = isGstVal
        ? (txnObj.contact_id.gst_balance ?? txnObj.contact_id.balance ?? 0)
        : (txnObj.contact_id.nongst_balance ?? txnObj.contact_id.balance ?? 0);
    }
    return txnObj;
  }
}

export default new TransactionService();
