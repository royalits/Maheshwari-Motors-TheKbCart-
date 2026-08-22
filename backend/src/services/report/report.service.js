import mongoose from "mongoose";
import Challan from "../../models/transaction/challan.model.js";
import Bill from "../../models/transaction/bill.model.js";
import Contact from "../../models/master/contact.model.js";
import Transaction from "../../models/transaction/transaction.model.js";
import User from "../../models/auth/user.model.js";
import Item from "../../models/master/item.model.js";
import Hsn from "../../models/master/hsn.model.js";
import Return from "../../models/transaction/return.model.js";
import { Pagination } from "../../utils/index.js";

const round2 = (n) => Math.round(n * 100) / 100;

class ReportService {
  /* ── helpers ──────────────────────────────────────────────── */
  _dateRange(from, to) {
    if (!from && !to) return null;
    const r = {};
    if (from) r.$gte = new Date(from);
    if (to) {
      const d = new Date(to);
      d.setHours(23, 59, 59, 999);
      r.$lte = d;
    }
    return r;
  }

  _itemPopulate() {
    return {
      path: "items.item_id",
      select: "item_name brand_id hsn_id",
      populate: [
        { path: "brand_id", select: "name" },
        { path: "hsn_id", select: "hsn_code" },
      ],
    };
  }

  _mapChallanItem(i) {
    const itemId =
      typeof i.item_id === "object" && i.item_id?._id ? i.item_id._id : i.item_id;
    return {
      item_id: itemId,
      item_name: i.item_id?.item_name || "",
      brand_id: i.item_id?.brand_id?._id || i.item_id?.brand_id || null,
      brand: i.item_id?.brand_id?.name || "",
      hsn_code: i.item_id?.hsn_id?.hsn_code || "",
      quantity: i.quantity,
      rate: i.rate,
      discount: i.discount,
      special_discount: i.special_discount,
      item_discount: i.item_discount,
      item_dis2: i.item_dis2,
      dis3: i.dis3,
      taxable_amount: i.taxable_amount,
      gst_percent: i.gst_percent,
      gst_amount: i.gst_amount,
      amount: i.amount,
    };
  }

  _autoBillItemPopulate() {
    return {
      path: "auto_bill_items.item_id",
      select: "item_name brand_id hsn_id",
      populate: [
        { path: "brand_id", select: "name" },
        { path: "hsn_id", select: "hsn_code" },
      ],
    };
  }

  _mapAutoBillItem(i) {
    const item = i.item_id || {};
    const itemId =
      typeof item === "object" && item?._id ? item._id : i.item_id;
    return {
      item_id: itemId,
      item_name: item?.item_name || "",
      brand_id: item?.brand_id?._id || item?.brand_id || null,
      brand: item?.brand_id?.name || "",
      hsn_code: item?.hsn_id?.hsn_code || "",
      quantity: i.quantity,
      rate: i.rate,
      discount: i.discount,
      special_discount: i.special_discount,
      item_discount: i.item_discount,
      item_dis2: i.item_dis2,
      dis3: i.dis3,
      taxable_amount: i.taxable_amount,
      gst_percent: i.gst_percent,
      gst_amount: i.gst_amount,
      amount: i.amount,
    };
  }

  _getBillReportItems(bill) {
    const autoItems = Array.isArray(bill.auto_bill_items)
      ? bill.auto_bill_items
      : [];
    if (autoItems.length > 0) {
      return autoItems.map((item) => this._mapAutoBillItem(item));
    }

    return (bill.challan_ids || []).flatMap((challan) =>
      (challan.items || []).map((item) => this._mapChallanItem(item)),
    );
  }

  _filterBillReportItems(items, query = {}) {
    return items.filter((item) => {
      if (
        query.item_id &&
        String(item.item_id || "") !== String(query.item_id)
      ) {
        return false;
      }
      if (
        query.brand_id &&
        String(item.brand_id || "") !== String(query.brand_id)
      ) {
        return false;
      }
      return true;
    });
  }

  async _getBillDetailsByContactType(userId, isGst, contactType, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const { page, limit, skip, all } = Pagination.getParams(query);
    const filter = {
      user_id: uid,
      is_gst: Number(isGst) === 1 ? 1 : 0,
      contact_type: contactType,
    };
    this._applyFinancialYear(filter, query);

    const dr = this._dateRange(query.from_date, query.to_date);
    if (dr) filter.date = dr;

    if (query.agent_id || query.area_id) {
      const cf = { user_id: uid, type: contactType };
      if (query.agent_id)
        cf.agent_id = new mongoose.Types.ObjectId(query.agent_id);
      if (query.area_id)
        cf.area_id = new mongoose.Types.ObjectId(query.area_id);
      if (query.contact_id)
        cf._id = new mongoose.Types.ObjectId(query.contact_id);
      const contactIds = await Contact.find(cf).distinct("_id");
      filter.contact_id = { $in: contactIds };
    } else if (query.contact_id) {
      filter.contact_id = new mongoose.Types.ObjectId(query.contact_id);
    }

    const bills = await Bill.find(filter)
      .populate(
        "contact_id",
        "name city gstin phone agent_id area_id",
      )
      .populate({
        path: "challan_ids",
        select: "challan_no challan_type date items",
        populate: this._itemPopulate(),
      })
      .populate(this._autoBillItemPopulate())
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const rows = [];
    for (const bill of bills) {
      const items = this._filterBillReportItems(
        this._getBillReportItems(bill),
        query,
      );
      if (!items.length) continue;

      rows.push({
        _id: bill._id,
        id: bill.id,
        bill_no: bill.bill_no,
        challan_no: bill.bill_no,
        date: bill.date,
        contact: bill.contact_id,
        items: items.map((item, index) => ({
          ...item,
          settlement_discount:
            index === 0 ? round2(bill.settlement_discount || 0) : 0,
        })),
        gross_total: bill.amount,
        discount: bill.discount || 0,
        sub_total: bill.amount,
        amount: round2(bill.amount || 0),
        settlement_discount: round2(bill.settlement_discount || 0),
        is_gst: bill.is_gst,
        payment_status: bill.payment_status,
      });
    }

    const total = rows.length;
    const pagedRows = all ? rows : rows.slice(skip, skip + limit);
    const summary = rows.reduce(
      (acc, bill) => {
        acc.total_amount += Number(bill.amount || 0);
        acc.settlement_discount += Number(bill.settlement_discount || 0);
        acc.total_items += bill.items.length;
        return acc;
      },
      { total_amount: 0, settlement_discount: 0, total_items: 0 },
    );

    return {
      data: pagedRows,
      summary: {
        total_amount: round2(summary.total_amount),
        settlement_discount: round2(summary.settlement_discount),
        total_items: summary.total_items,
        total_bills: total,
        total_challans: total,
      },
      meta: Pagination.createMeta(total, page, limit),
    };
  }

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

  /* ═══════════════════════════════════════════════════════════
     1. PURCHASE DASHBOARD
     ═══════════════════════════════════════════════════════════ */
  async getPurchaseReport(userId, isGst, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const filter = { user_id: uid, challan_type: "purchase" };
    this._applyFinancialYear(filter, query);
    const dr = this._dateRange(query.from_date, query.to_date);
    if (dr) filter.date = dr;

    const [totals, monthly, typeSplit, topSuppliers, supplierCount] =
      await Promise.all([
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              gst: {
                $sum: { $cond: [{ $eq: ["$is_gst", 1] }, "$amount", 0] },
              },
              non_gst: {
                $sum: { $cond: [{ $eq: ["$is_gst", 0] }, "$amount", 0] },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { m: { $month: "$date" }, y: { $year: "$date" } },
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.y": 1, "_id.m": 1 } },
        ]),
        Challan.aggregate([
          { $match: filter },
          { $group: { _id: "$is_gst", value: { $sum: "$amount" } } },
        ]),
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: "$contact_id",
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "contacts",
              localField: "_id",
              foreignField: "_id",
              as: "c",
            },
          },
          { $unwind: "$c" },
          {
            $project: {
              name: "$c.name",
              city: "$c.city",
              amount: 1,
              count: 1,
            },
          },
        ]),
        Contact.countDocuments({ user_id: uid, type: "supplier" }),
      ]);

    const t = totals[0] || { total: 0, gst: 0, non_gst: 0, count: 0 };

    return {
      total_purchase: round2(t.total),
      gst_purchase: round2(t.gst),
      non_gst_purchase: round2(t.non_gst),
      total_challans: t.count,
      supplier_count: supplierCount,
      avg_purchase: t.count ? round2(t.total / t.count) : 0,
      monthly_trend: monthly.map((m) => ({
        month: m._id.m,
        year: m._id.y,
        amount: round2(m.amount),
        count: m.count,
      })),
      purchase_type_data: [
        {
          name: "GST",
          value: round2(typeSplit.find((p) => p._id === 1)?.value || 0),
        },
        {
          name: "Non-GST",
          value: round2(typeSplit.find((p) => p._id === 0)?.value || 0),
        },
      ],
      top_suppliers: topSuppliers.map((s) => ({
        ...s,
        amount: round2(s.amount),
      })),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     2. PURCHASE DETAILS (Paginated)
     ═══════════════════════════════════════════════════════════ */
  async getPurchaseDetails(userId, isGst, query = {}) {
    return this._getBillDetailsByContactType(
      userId,
      isGst,
      "supplier",
      query,
    );
  }

  /* ═══════════════════════════════════════════════════════════
     3. SALES DASHBOARD
     ═══════════════════════════════════════════════════════════ */
  async getSalesReport(userId, isGst, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const filter = { user_id: uid, challan_type: "sale" };
    this._applyFinancialYear(filter, query);
    const dr = this._dateRange(query.from_date, query.to_date);
    if (dr) filter.date = dr;

    const [totals, monthly, typeSplit, topCustomers, customerCount] =
      await Promise.all([
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              total: { $sum: "$amount" },
              gst: {
                $sum: { $cond: [{ $eq: ["$is_gst", 1] }, "$amount", 0] },
              },
              non_gst: {
                $sum: { $cond: [{ $eq: ["$is_gst", 0] }, "$amount", 0] },
              },
              count: { $sum: 1 },
            },
          },
        ]),
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: { m: { $month: "$date" }, y: { $year: "$date" } },
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { "_id.y": 1, "_id.m": 1 } },
        ]),
        Challan.aggregate([
          { $match: filter },
          { $group: { _id: "$is_gst", value: { $sum: "$amount" } } },
        ]),
        Challan.aggregate([
          { $match: filter },
          {
            $group: {
              _id: "$contact_id",
              amount: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { amount: -1 } },
          { $limit: 10 },
          {
            $lookup: {
              from: "contacts",
              localField: "_id",
              foreignField: "_id",
              as: "c",
            },
          },
          { $unwind: "$c" },
          {
            $project: {
              name: "$c.name",
              city: "$c.city",
              amount: 1,
              count: 1,
            },
          },
        ]),
        Contact.countDocuments({ user_id: uid, type: "party" }),
      ]);

    const t = totals[0] || { total: 0, gst: 0, non_gst: 0, count: 0 };

    return {
      total_sales: round2(t.total),
      gst_sales: round2(t.gst),
      non_gst_sales: round2(t.non_gst),
      total_challans: t.count,
      customer_count: customerCount,
      avg_sale: t.count ? round2(t.total / t.count) : 0,
      monthly_trend: monthly.map((m) => ({
        month: m._id.m,
        year: m._id.y,
        amount: round2(m.amount),
        count: m.count,
      })),
      sales_type_data: [
        {
          name: "GST",
          value: round2(typeSplit.find((p) => p._id === 1)?.value || 0),
        },
        {
          name: "Non-GST",
          value: round2(typeSplit.find((p) => p._id === 0)?.value || 0),
        },
      ],
      top_customers: topCustomers.map((c) => ({
        ...c,
        amount: round2(c.amount),
      })),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     4. SALES DETAILS (Paginated)
     ═══════════════════════════════════════════════════════════ */
  async getSalesDetails(userId, isGst, query = {}) {
    return this._getBillDetailsByContactType(userId, isGst, "party", query);
  }

  /* ═══════════════════════════════════════════════════════════
     5. COLLECTION REPORT
     ═══════════════════════════════════════════════════════════ */
  async getCollectionReport(userId, isGst, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const { page, limit, skip, all } = Pagination.getParams(query);
    const contactType = query.type === "supplier" ? "supplier" : "party";
    const challanType = contactType === "party" ? "sale" : "purchase";

    const contactFilter = { user_id: uid, type: contactType };
    if (query.contact_id)
      contactFilter._id = new mongoose.Types.ObjectId(query.contact_id);

    const dr = this._dateRange(query.from_date, query.to_date);

    let cq = Contact.find(contactFilter)
      .select("name city phone balance gst_balance nongst_balance")
      .sort({ name: 1 });
    if (!all) cq = cq.skip(skip).limit(limit);

    const [rawContacts, totalContacts] = await Promise.all([
      cq.lean(),
      Contact.countDocuments(contactFilter),
    ]);

    const contacts = rawContacts.map(c => {
      c.balance = isGst === 1 || isGst === true ? (c.gst_balance || 0) : (c.nongst_balance || 0);
      return c;
    });

    const contactIds = contacts.map((c) => c._id);
    if (!contactIds.length) {
      return {
        data: [],
        summary: {
          total_challan_amount: 0,
          total_payment: 0,
          total_balance: 0,
        },
        meta: Pagination.createMeta(0, page, limit),
      };
    }

    const challanMatch = {
      user_id: uid,
      challan_type: challanType,
      contact_id: { $in: contactIds },
    };
    this._applyFinancialYear(challanMatch, query);
    if (dr) challanMatch.date = dr;

    const bankTypes =
      contactType === "party" ? ["bank_received"] : ["bank_payment"];
    const cashTypes =
      contactType === "party" ? ["cash_received"] : ["cash_payment"];
    const paymentTypes = [...bankTypes, ...cashTypes];

    const txnMatch = {
      user_id: uid,
      contact_id: { $in: contactIds },
      type: { $in: paymentTypes },
    };
    this._applyFinancialYear(txnMatch, query);
    if (dr) txnMatch.date = dr;

    const [challanAgg, txnAgg, challanMonthly, txnMonthly] = await Promise.all([
      Challan.aggregate([
        { $match: challanMatch },
        {
          $group: {
            _id: "$contact_id",
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: txnMatch },
        {
          $group: {
            _id: "$contact_id",
            amount: { $sum: "$amount" },
            count: { $sum: 1 },
            bank_amount: {
              $sum: {
                $cond: [{ $in: ["$type", bankTypes] }, "$amount", 0],
              },
            },
            cash_amount: {
              $sum: {
                $cond: [{ $in: ["$type", cashTypes] }, "$amount", 0],
              },
            },
          },
        },
      ]),
      Challan.aggregate([
        { $match: challanMatch },
        {
          $group: {
            _id: {
              cid: "$contact_id",
              m: { $month: "$date" },
              y: { $year: "$date" },
            },
            amount: { $sum: "$amount" },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
      Transaction.aggregate([
        { $match: txnMatch },
        {
          $group: {
            _id: {
              cid: "$contact_id",
              m: { $month: "$date" },
              y: { $year: "$date" },
            },
            amount: { $sum: "$amount" },
            bank_amount: {
              $sum: {
                $cond: [{ $in: ["$type", bankTypes] }, "$amount", 0],
              },
            },
            cash_amount: {
              $sum: {
                $cond: [{ $in: ["$type", cashTypes] }, "$amount", 0],
              },
            },
          },
        },
        { $sort: { "_id.y": 1, "_id.m": 1 } },
      ]),
    ]);

    const challanMap = new Map(challanAgg.map((r) => [r._id.toString(), r]));
    const txnMap = new Map(txnAgg.map((r) => [r._id.toString(), r]));

    const resolvePaymentMode = (bankAmount, cashAmount) => {
      const bank = Number(bankAmount || 0);
      const cash = Number(cashAmount || 0);
      if (bank > 0 && cash > 0) return "Bank+Cash";
      if (bank > 0) return "Bank";
      if (cash > 0) return "Cash";
      return "-";
    };

    const monthlyMap = new Map();
    const addMonthly = (arr, field, valueKey = "amount") => {
      for (const r of arr) {
        const key = r._id.cid.toString();
        const mk = `${r._id.y}-${String(r._id.m).padStart(2, "0")}`;
        if (!monthlyMap.has(key)) monthlyMap.set(key, new Map());
        const m = monthlyMap.get(key);
        if (!m.has(mk))
          m.set(mk, {
            month: r._id.m,
            year: r._id.y,
            challan_amount: 0,
            payment_amount: 0,
            bank_amount: 0,
            cash_amount: 0,
            payment_mode: "-",
          });
        m.get(mk)[field] = round2(r?.[valueKey] ?? 0);
      }
    };
    addMonthly(challanMonthly, "challan_amount");
    addMonthly(txnMonthly, "payment_amount");
    addMonthly(txnMonthly, "bank_amount", "bank_amount");
    addMonthly(txnMonthly, "cash_amount", "cash_amount");

    let totalChallan = 0;
    let totalPayment = 0;

    const data = contacts.map((c) => {
      const cid = c._id.toString();
      const ch = challanMap.get(cid) || { amount: 0, count: 0 };
      const tx = txnMap.get(cid) || {
        amount: 0,
        count: 0,
        bank_amount: 0,
        cash_amount: 0,
      };
      const bal = ch.amount - tx.amount;
      totalChallan += ch.amount;
      totalPayment += tx.amount;

      const monthly =
        monthlyMap.has(cid) ?
          Array.from(monthlyMap.get(cid).values()).map((m) => ({
            ...m,
            payment_mode: resolvePaymentMode(m.bank_amount, m.cash_amount),
          }))
        : [];

      return {
        contact: { _id: c._id, name: c.name, city: c.city, phone: c.phone },
        total_challan_amount: round2(ch.amount),
        challan_count: ch.count,
        total_payment: round2(tx.amount),
        payment_count: tx.count,
        bank_amount: round2(tx.bank_amount || 0),
        cash_amount: round2(tx.cash_amount || 0),
        payment_mode: resolvePaymentMode(tx.bank_amount, tx.cash_amount),
        balance: round2(Math.abs(bal)),
        balance_type: bal >= 0 ? "Dr" : "Cr",
        monthly,
      };
    });

    return {
      data,
      summary: {
        total_challan_amount: round2(totalChallan),
        total_payment: round2(totalPayment),
        total_balance: round2(Math.abs(totalChallan - totalPayment)),
      },
      meta: Pagination.createMeta(totalContacts, page, limit),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     6. ACCOUNT LEDGER (Enhanced – cash / bank / party)
     ═══════════════════════════════════════════════════════════ */
  async getAccountLedger(userId, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const {
      contact_id,
      from_date,
      to_date,
      type,
      doc_no,
      narration,
      firm,
      account_type,
      bank_id,
      financial_year_id,
    } = query;

    if (account_type === "cash" || account_type === "bank") {
      return this._getCashBankLedger(uid, {
        account_type,
        bank_id,
        from_date,
        to_date,
        type,
        doc_no,
        narration,
        firm,
        financial_year_id,
      });
    }

    if (!contact_id) {
      const e = new Error("contact_id (Party) is required");
      e.statusCode = 400;
      throw e;
    }
    const cid = new mongoose.Types.ObjectId(contact_id);

    const dateFilter = {};
    if (from_date) dateFilter.$gte = new Date(from_date);
    if (to_date) {
      const end = new Date(to_date);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const firmFilter = (f) => {
      if (!firm || firm === "all") return true;
      if (firm === "gst") return f === 1;
      if (firm === "nongst") return f === 0;
      return true;
    };

    const normalizedType = String(type || "all")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    const typeWanted = (t) =>
      !type || normalizedType === "all" || normalizedType === t;

    const user = await User.findById(uid).lean();
    const firmName = (isGst) =>
      isGst === 1 ?
        user?.gst_firm?.name || "GST"
      : user?.nongst_firm?.name || "Non-GST";

    const billFilter = { user_id: uid, contact_id: cid };
    this._applyFinancialYear(billFilter, query);
    if (Object.keys(dateFilter).length) billFilter.date = dateFilter;

    const bills = await Bill.find(billFilter)
      .select("id bill_no contact_type date amount is_gst settlement_discount")
      .sort({ date: 1 })
      .lean();

    const returnFilter = { user_id: uid, contact_id: cid };
    this._applyFinancialYear(returnFilter, query);
    if (Object.keys(dateFilter).length) returnFilter.date = dateFilter;

    const returns = await Return.find(returnFilter)
      .populate({ path: "bill_id", select: "bill_no contact_type" })
      .select("id return_no return_type date total_amount is_gst bill_id")
      .sort({ date: 1 })
      .lean();

    const txnFilter = { user_id: uid, contact_id: cid };
    this._applyFinancialYear(txnFilter, query);
    if (Object.keys(dateFilter).length) txnFilter.date = dateFilter;

    const transactions = await Transaction.find(txnFilter)
      .select("id transaction_no type date amount is_gst remarks settlement_summary")
      .sort({ date: 1 })
      .lean();

    const entries = [];

    const TYPE_MAP = {
      sale: "Sale",
      purchase: "Purchase",
      sale_return: "Sale Return",
      purchase_return: "Purchase Return",
      bank_received: "Bank Rec",
      cash_received: "Cash Rec",
      bank_payment: "Bank Pay",
      cash_payment: "Cash Pay",
    };

    const BOOK_MAP = {
      sale_1: "SALE BOOK (GST)",
      sale_0: "SALE BOOK (NON-GST)",
      purchase_1: "PURCHASE BOOK (GST)",
      purchase_0: "PURCHASE BOOK (NON-GST)",
      sale_return_1: "SALE RETURN (GST)",
      sale_return_0: "SALE RETURN (NON-GST)",
      purchase_return_1: "PURCHASE RETURN (GST)",
      purchase_return_0: "PURCHASE RETURN (NON-GST)",
      bank_received: "AC BOOK",
      cash_received: "CASH BOOK",
      bank_payment: "AC BOOK",
      cash_payment: "CASH BOOK",
    };

    for (const bill of bills) {
      if (!firmFilter(bill.is_gst)) continue;

      const isSale = bill.contact_type !== "supplier";
      const entryType = isSale ? "sale" : "purchase";
      if (!typeWanted(entryType)) continue;

      const bookKey = `${entryType}_${bill.is_gst}`;

      entries.push({
        date: bill.date,
        v_no: bill.bill_no || String(bill.id).padStart(5, "0"),
        type: TYPE_MAP[entryType],
        doc_no: bill.bill_no || "",
        narration: BOOK_MAP[bookKey] || bill.bill_no || "",
        debit_amount: isSale ? bill.amount : 0,
        credit_amount: isSale ? 0 : bill.amount,
        discount: bill.settlement_discount || 0,
        is_gst: bill.is_gst,
        firm: firmName(bill.is_gst),
        _sort: new Date(bill.date).getTime(),
      });
    }

    for (const returnDoc of returns) {
      if (!firmFilter(returnDoc.is_gst)) continue;

      const entryType = returnDoc.return_type;
      if (!typeWanted(entryType)) continue;

      const isSaleReturn = entryType === "sale_return";
      const bookKey = `${entryType}_${returnDoc.is_gst}`;
      const linkedBillNo = returnDoc.bill_id?.bill_no || "";
      const returnNo =
        returnDoc.return_no || String(returnDoc.id).padStart(5, "0");
      const amount = Number(returnDoc.total_amount) || 0;

      entries.push({
        date: returnDoc.date,
        v_no: returnNo,
        type: TYPE_MAP[entryType],
        doc_no: linkedBillNo || returnNo,
        narration:
          linkedBillNo ?
            `${BOOK_MAP[bookKey] || TYPE_MAP[entryType]} - Bill ${linkedBillNo}`
          : BOOK_MAP[bookKey] || TYPE_MAP[entryType],
        debit_amount: isSaleReturn ? 0 : amount,
        credit_amount: isSaleReturn ? amount : 0,
        discount: 0,
        is_gst: returnDoc.is_gst,
        firm: firmName(returnDoc.is_gst),
        _sort: new Date(returnDoc.date).getTime(),
      });
    }

    for (const txn of transactions) {
      if (!firmFilter(txn.is_gst)) continue;

      const isReceived = txn.type.includes("received");
      const filterType =
        isReceived ?
          txn.type === "bank_received" ?
            "bank_rec"
          : "cash_rec"
        : txn.type === "bank_payment" ? "bank_pay"
        : "cash_pay";

      if (!typeWanted(filterType) && !typeWanted(txn.type)) continue;

      entries.push({
        date: txn.date,
        v_no: String(txn.id).padStart(5, "0"),
        type: TYPE_MAP[txn.type] || txn.type,
        doc_no: BOOK_MAP[txn.type] || txn.transaction_no,
        narration: txn.remarks || BOOK_MAP[txn.type] || txn.transaction_no,
        debit_amount: isReceived ? 0 : txn.amount,
        credit_amount: isReceived ? txn.amount : 0,
        discount: txn.settlement_summary?.settlement_discount_amount || 0,
        is_gst: txn.is_gst,
        firm: firmName(txn.is_gst),
        _sort: new Date(txn.date).getTime(),
      });
    }

    const filtered = entries.filter((e) => {
      if (doc_no && !e.doc_no.toLowerCase().includes(doc_no.toLowerCase()))
        return false;
      if (
        narration &&
        !e.narration.toLowerCase().includes(narration.toLowerCase())
      )
        return false;
      return true;
    });

    filtered.sort((a, b) => a._sort - b._sort || a.v_no.localeCompare(b.v_no));

    let balance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = filtered.map((e) => {
      totalDebit += e.debit_amount;
      totalCredit += e.credit_amount;
      balance += e.debit_amount - e.credit_amount;

      return {
        date: e.date,
        v_no: e.v_no,
        type: e.type,
        doc_no: e.doc_no,
        narration: e.narration,
        debit_amount: round2(e.debit_amount),
        credit_amount: round2(e.credit_amount),
        balance: round2(Math.abs(balance)),
        cd: balance >= 0 ? "Dr" : "Cr",
        is_gst: e.is_gst,
        firm: e.firm,
      };
    });

    return {
      entries: rows,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      closing_balance: round2(Math.abs(balance)),
      closing_cd: balance >= 0 ? "Dr" : "Cr",
    };
  }

  /* ── Cash / Bank account ledger (private helper) ────────── */
  async _getCashBankLedger(uid, opts) {
    const {
      account_type,
      bank_id,
      from_date,
      to_date,
      doc_no,
      narration,
      firm,
    } = opts;

    const dateFilter = {};
    if (from_date) dateFilter.$gte = new Date(from_date);
    if (to_date) {
      const end = new Date(to_date);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }

    const user = await User.findById(uid).lean();
    const firmName = (isGst) =>
      isGst === 1 ?
        user?.gst_firm?.name || "GST"
      : user?.nongst_firm?.name || "Non-GST";

    const firmFilter = (f) => {
      if (!firm || firm === "all") return true;
      if (firm === "gst") return f === 1;
      if (firm === "nongst") return f === 0;
      return true;
    };

    const types =
      account_type === "cash" ?
        ["cash_received", "cash_payment"]
      : ["bank_received", "bank_payment"];

    const txnFilter = { user_id: uid, type: { $in: types } };
    this._applyFinancialYear(txnFilter, opts);
    if (Object.keys(dateFilter).length) txnFilter.date = dateFilter;
    if (account_type === "bank" && bank_id) {
      txnFilter.bank_id = new mongoose.Types.ObjectId(bank_id);
    }

    const transactions = await Transaction.find(txnFilter)
      .populate("contact_id", "name")
      .select("id transaction_no type date amount is_gst remarks contact_id")
      .sort({ date: 1 })
      .lean();

    const TYPE_MAP = {
      bank_received: "Bank Rec",
      cash_received: "Cash Rec",
      bank_payment: "Bank Pay",
      cash_payment: "Cash Pay",
    };

    const entries = [];
    for (const txn of transactions) {
      if (!firmFilter(txn.is_gst)) continue;

      const isInflow =
        txn.type === "cash_received" || txn.type === "bank_received";

      const entry = {
        date: txn.date,
        v_no: String(txn.id).padStart(5, "0"),
        type: TYPE_MAP[txn.type],
        doc_no: txn.transaction_no || "",
        narration: txn.remarks || txn.contact_id?.name || "",
        debit_amount: isInflow ? txn.amount : 0,
        credit_amount: isInflow ? 0 : txn.amount,
        is_gst: txn.is_gst,
        firm: firmName(txn.is_gst),
        contact_name: txn.contact_id?.name || "",
      };

      if (doc_no && !entry.doc_no.toLowerCase().includes(doc_no.toLowerCase()))
        continue;
      if (
        narration &&
        !entry.narration.toLowerCase().includes(narration.toLowerCase())
      )
        continue;

      entries.push(entry);
    }

    let balance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const rows = entries.map((e) => {
      totalDebit += e.debit_amount;
      totalCredit += e.credit_amount;
      balance += e.debit_amount - e.credit_amount;

      return {
        date: e.date,
        v_no: e.v_no,
        type: e.type,
        doc_no: e.doc_no,
        narration: e.narration,
        debit_amount: round2(e.debit_amount),
        credit_amount: round2(e.credit_amount),
        balance: round2(Math.abs(balance)),
        cd: balance >= 0 ? "Dr" : "Cr",
        is_gst: e.is_gst,
        firm: e.firm,
        contact_name: e.contact_name,
      };
    });

    return {
      entries: rows,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      closing_balance: round2(Math.abs(balance)),
      closing_cd: balance >= 0 ? "Dr" : "Cr",
    };
  }

  /* ═══════════════════════════════════════════════════════════
     7. GST DASHBOARD
     ═══════════════════════════════════════════════════════════ */
  async getGstDashboard(userId, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const dr = this._dateRange(query.from_date, query.to_date);

    const saleFilter = { user_id: uid, is_gst: 1, challan_type: "sale" };
    const purchaseFilter = {
      user_id: uid,
      is_gst: 1,
      challan_type: "purchase",
    };
    this._applyFinancialYear(saleFilter, query);
    this._applyFinancialYear(purchaseFilter, query);
    if (dr) {
      saleFilter.date = dr;
      purchaseFilter.date = dr;
    }

    const allGstFilter = { user_id: uid, is_gst: 1 };
    this._applyFinancialYear(allGstFilter, query);
    if (dr) allGstFilter.date = dr;

    const [outputGst, inputGst, monthlyGst, rateDistrib, topItems] =
      await Promise.all([
        Challan.aggregate([
          { $match: saleFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: null,
              gst: { $sum: "$items.gst_amount" },
              taxable: { $sum: "$items.taxable_amount" },
            },
          },
        ]),
        Challan.aggregate([
          { $match: purchaseFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: null,
              gst: { $sum: "$items.gst_amount" },
              taxable: { $sum: "$items.taxable_amount" },
            },
          },
        ]),
        Challan.aggregate([
          { $match: allGstFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: {
                m: { $month: "$date" },
                y: { $year: "$date" },
                type: "$challan_type",
              },
              gst: { $sum: "$items.gst_amount" },
            },
          },
          { $sort: { "_id.y": 1, "_id.m": 1 } },
        ]),
        Challan.aggregate([
          { $match: saleFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.gst_percent",
              amount: { $sum: "$items.gst_amount" },
              taxable: { $sum: "$items.taxable_amount" },
              count: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),
        Challan.aggregate([
          { $match: saleFilter },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.item_id",
              total_amount: { $sum: "$items.amount" },
              total_gst: { $sum: "$items.gst_amount" },
              quantity: { $sum: "$items.quantity" },
            },
          },
          { $sort: { total_amount: -1 } },
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
              item_name: "$item.item_name",
              total_amount: 1,
              total_gst: 1,
              quantity: 1,
            },
          },
        ]),
      ]);

    const out = outputGst[0] || { gst: 0, taxable: 0 };
    const inp = inputGst[0] || { gst: 0, taxable: 0 };

    const monthlyData = new Map();
    for (const r of monthlyGst) {
      const key = `${r._id.y}-${r._id.m}`;
      if (!monthlyData.has(key))
        monthlyData.set(key, {
          month: r._id.m,
          year: r._id.y,
          output_gst: 0,
          input_gst: 0,
        });
      const e = monthlyData.get(key);
      if (r._id.type === "sale") e.output_gst = round2(r.gst);
      else e.input_gst = round2(r.gst);
    }

    return {
      total_gst: round2(out.gst),
      input_credit: round2(inp.gst),
      net_payable: round2(out.gst - inp.gst),
      effective_rate:
        out.taxable > 0 ? round2((out.gst / out.taxable) * 100) : 0,
      monthly_gst_trend: Array.from(monthlyData.values()),
      gst_rate_distribution: rateDistrib.map((r) => ({
        rate: r._id,
        label: `${r._id}%`,
        amount: round2(r.amount),
        taxable: round2(r.taxable),
        count: r.count,
      })),
      top_gst_items: topItems.map((i) => ({
        item_name: i.item_name,
        total_amount: round2(i.total_amount),
        total_gst: round2(i.total_gst),
        quantity: i.quantity,
      })),
    };
  }

  /* ═══════════════════════════════════════════════════════════
     8. GST REPORT (Enhanced – includes Returns)
     ═══════════════════════════════════════════════════════════ */
  async getGstReport(userId, query = {}) {
    const uid = new mongoose.Types.ObjectId(userId);
    const { type, from_date, to_date, ac_name, gstin, hsn_code } = query;

    const user = await User.findById(uid).lean();
    const firmState = (user?.gst_firm?.state || "").toLowerCase().trim();

    const dr = this._dateRange(from_date, to_date);

    const docs = [];
    const normalizedType = String(type || "all").toLowerCase();
    const isReturn =
      normalizedType === "return" ||
      normalizedType === "sale_return" ||
      normalizedType === "purchase_return";

    const populateOpts = [
      { path: "contact_id", select: "name gstin reg_number state" },
      {
        path: "items.item_id",
        select: "item_name hsn_id",
        populate: { path: "hsn_id", select: "hsn_code" },
      },
    ];

    if (!isReturn) {
      const challanFilter = { user_id: uid, is_gst: 1 };
      this._applyFinancialYear(challanFilter, query);
      if (normalizedType === "sale" || normalizedType === "purchase")
        challanFilter.challan_type = normalizedType;
      if (dr) challanFilter.date = dr;

      const challans = await Challan.find(challanFilter)
        .populate(populateOpts[0])
        .populate(populateOpts[1])
        .sort({ date: 1 })
        .lean();

      for (const ch of challans) {
        docs.push({
          ...ch,
          _src: ch.challan_type === "sale" ? "Sale" : "Purchase",
        });
      }
    }

    if (isReturn || !type || normalizedType === "all") {
      const returnFilter = { user_id: uid, is_gst: 1 };
      this._applyFinancialYear(returnFilter, query);
      if (normalizedType === "sale_return") returnFilter.return_type = "sale_return";
      else if (normalizedType === "purchase_return")
        returnFilter.return_type = "purchase_return";
      if (dr) returnFilter.date = dr;

      const returns = await Return.find(returnFilter)
        .populate(populateOpts[0])
        .populate(populateOpts[1])
        .sort({ date: 1 })
        .lean();

      for (const r of returns) {
        docs.push({
          ...r,
          _src:
            r.return_type === "sale_return" ? "Sale Return" : "Purchase Return",
        });
      }
    }

    docs.sort((a, b) => new Date(a.date) - new Date(b.date));

    const rows = [];
    let totalTaxable = 0;
    let totalGst = 0;
    let totalSgst = 0;
    let totalCgst = 0;
    let totalIgst = 0;
    let totalNet = 0;

    for (const doc of docs) {
      const contact = doc.contact_id || {};
      const contactName = contact.name || "";
      const contactGstin = String(
        contact.gstin || contact.reg_number || "",
      )
        .trim()
        .toUpperCase();
      const contactState = (contact.state || "").toLowerCase().trim();

      if (ac_name && !contactName.toLowerCase().includes(ac_name.toLowerCase()))
        continue;
      if (gstin && !contactGstin.toLowerCase().includes(gstin.toLowerCase()))
        continue;

      const isIntraState =
        firmState && contactState && firmState === contactState;

      for (const line of doc.items || []) {
        const item = line.item_id || {};
        const itemName = item.item_name || "";
        const hsnObj = item.hsn_id || {};
        const hsnCodeVal = hsnObj.hsn_code || "";

        if (
          hsn_code &&
          !hsnCodeVal.toLowerCase().includes(hsn_code.toLowerCase())
        )
          continue;

        const taxableAmt = line.taxable_amount || 0;
        const gstPct = line.gst_percent || 0;
        const gstAmt = line.gst_amount || 0;

        // Calculate discount_amount if not present (for Returns)
        let discountAmount = line.discount_amount || 0;
        if (!discountAmount && line.discount) {
          const grossAmount = (line.quantity || 0) * (line.rate || 0);
          const percentDiscountAmount = round2((grossAmount * (line.discount || 0)) / 100);
          const itemDiscount = line.item_discount || 0;
          discountAmount = round2(percentDiscountAmount + itemDiscount);
        }

        // Extract actual item_discount value (not the calculated discount_amount)
        const itemDiscountValue = line.item_discount || 0;
        const itemDis2Value = line.item_dis2 || 0;
        // Backward compatibility: older challans stored discount-master value in item_discount.
        const dis3Value = round2(line.dis3 || itemDiscountValue || 0);

        let sgst = 0;
        let cgst = 0;
        let igst = 0;

        if (isIntraState) {
          sgst = round2(gstAmt / 2);
          cgst = round2(gstAmt / 2);
        } else {
          igst = round2(gstAmt);
        }

        const netAmt = round2(taxableAmt + gstAmt);

        totalTaxable += taxableAmt;
        totalGst += gstAmt;
        totalSgst += sgst;
        totalCgst += cgst;
        totalIgst += igst;
        totalNet += netAmt;

        rows.push({
          date: doc.date,
          vno: doc.id,
          type: doc._src,
          ac_name: contactName,
          gstin: contactGstin,
          item_name: itemName,
          hsn_code: hsnCodeVal,
          pcs: line.quantity || 0,
          rate: line.rate || 0,
          discount: line.discount || 0,
          special_discount: line.special_discount || 0,
          item_discount: round2(itemDiscountValue),
          item_dis2: round2(itemDis2Value),
          dis3: dis3Value,
          taxable_amount: round2(taxableAmt),
          gst_percent: gstPct,
          gst_amount: round2(gstAmt),
          sgst_amount: sgst,
          cgst_amount: cgst,
          igst_amount: igst,
          net_amount: netAmt,
        });
      }
    }

    return {
      entries: rows,
      totals: {
        taxable: round2(totalTaxable),
        gst: round2(totalGst),
        sgst: round2(totalSgst),
        cgst: round2(totalCgst),
        igst: round2(totalIgst),
        net: round2(totalNet),
      },
    };
  }
}

export default new ReportService();
