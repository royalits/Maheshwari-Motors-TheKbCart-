import transactionService from "../transaction/transaction.service.js";
import mongoose from "mongoose";
import Bill from "../../models/transaction/bill.model.js";
import Contact from "../../models/master/contact.model.js";
import Return from "../../models/transaction/return.model.js";
import { ApiError, Pagination } from "../../utils/index.js";

class OutstandingService {
  _financialYearMatch(financialYearId) {
    return financialYearId &&
      mongoose.Types.ObjectId.isValid(String(financialYearId)) ?
        { financial_year_id: new mongoose.Types.ObjectId(financialYearId) }
      : {};
  }

  async getContacts(userId, isGst, query) {
    const { type, search } = query;

    const filter = { user_id: userId, type: { $in: ["party", "supplier"] } };

    if (type === "party" || type === "supplier") {
      filter.type = type;
    }

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { city: { $regex: escaped, $options: "i" } },
      ];
    }

    const balanceField = isGst === 1 || isGst === true ? "gst_balance" : "nongst_balance";

    // Handle sorting based on active balance field
    const resolvedSort = query.sort ? { ...query.sort } : { [balanceField]: 1, name: 1 };
    if (resolvedSort.balance) {
      resolvedSort[balanceField] = resolvedSort.balance;
      delete resolvedSort.balance;
    }

    const contacts = await Pagination.paginate(Contact, filter, {
      ...query,
      select: "id name city balance gst_balance nongst_balance type address state agent_id area_id",
      populate: [
        { path: "agent_id", select: "name" },
      ],
      sort: resolvedSort,
    });

    if (contacts && Array.isArray(contacts.data)) {
      contacts.data = contacts.data.map(c => {
        const cObj = typeof c.toObject === 'function' ? c.toObject() : c;
        cObj.balance = isGst === 1 || isGst === true ? (cObj.gst_balance || 0) : (cObj.nongst_balance || 0);
        return cObj;
      });
    }

    return contacts;
  }

  async getContactSummary(contactId, userId, isGst, financialYearId = null) {
    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      throw ApiError.badRequest("Invalid contact ID");
    }

    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
      type: { $in: ["party", "supplier"] },
    })
      .select("id name city balance gst_balance nongst_balance type address state agent_id area_id")
      .populate([
        { path: "agent_id", select: "name" },
      ])
      .lean();

    if (!contact) throw ApiError.notFound("Contact not found");

    contact.balance = isGst === 1 || isGst === true ? (contact.gst_balance || 0) : (contact.nongst_balance || 0);

    const [summary] = await Bill.aggregate([
      {
        $match: {
          contact_id: new mongoose.Types.ObjectId(contactId),
          user_id: new mongoose.Types.ObjectId(userId),
          is_gst: isGst,
          ...this._financialYearMatch(financialYearId),
        },
      },
      {
        $group: {
          _id: null,
          total_amount: { $sum: "$amount" },
          total_paid: { $sum: "$paid_amount" },
          total_discount: { $sum: { $ifNull: ["$settlement_discount", 0] } },
          total_due: {
            $sum: {
              $cond: [
                { $eq: ["$payment_status", "due"] },
                {
                  $subtract: [
                    "$amount",
                    {
                      $add: [
                        { $ifNull: ["$paid_amount", 0] },
                        { $ifNull: ["$return_amount", 0] },
                        { $ifNull: ["$settlement_discount", 0] },
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },
          total_overpaid: {
            $sum: {
              $cond: [
                {
                  $gt: [
                    { $ifNull: ["$paid_amount", 0] },
                    {
                      $subtract: [
                        "$amount",
                        {
                          $add: [
                            { $ifNull: ["$return_amount", 0] },
                            { $ifNull: ["$settlement_discount", 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                {
                  $subtract: [
                    { $ifNull: ["$paid_amount", 0] },
                    {
                      $subtract: [
                        "$amount",
                        {
                          $add: [
                            { $ifNull: ["$return_amount", 0] },
                            { $ifNull: ["$settlement_discount", 0] },
                          ],
                        },
                      ],
                    },
                  ],
                },
                0,
              ],
            },
          },
          total_bills: { $sum: 1 },
          due_count: {
            $sum: { $cond: [{ $in: ["$payment_status", ["due", "overpaid"]] }, 1, 0] },
          },
          settled_count: {
            $sum: {
              $cond: [{ $eq: ["$payment_status", "paid"] }, 1, 0],
            },
          },
        },
      },
    ]);

    const unlinkedReturns = await Return.aggregate([
      {
        $match: {
          contact_id: new mongoose.Types.ObjectId(contactId),
          user_id: new mongoose.Types.ObjectId(userId),
          is_gst: isGst,
          bill_id: null,
          ...this._financialYearMatch(financialYearId),
        },
      },
      {
        $group: {
          _id: null,
          total_unlinked: { $sum: "$total_amount" },
        },
      },
    ]);

    const unsettledTxns = await transactionService.getUnsettledTransactions(
      contactId,
      userId,
      isGst
    );
    const totalUnsettled = (unsettledTxns || []).reduce(
      (sum, t) => sum + (t.remaining_amount ?? t.unsettled_amount ?? t.amount ?? 0),
      0
    );

    const totalOverpaid = summary?.total_overpaid || 0;
    const totalUnlinkedReturns = unlinkedReturns[0]?.total_unlinked || 0;
    const totalCredit = totalOverpaid + totalUnlinkedReturns + totalUnsettled;
    const grossDue = summary?.total_due || 0;
    const netDue = Math.max(0, Math.round((grossDue - totalCredit) * 100) / 100);

    return {
      contact,
      total_amount: summary?.total_amount || 0,
      total_paid: (summary?.total_paid || 0) + totalUnsettled,
      total_discount: summary?.total_discount || 0,
      total_due: netDue,
      gross_due: grossDue,
      total_overpaid: totalOverpaid,
      total_unsettled: totalUnsettled,
      total_unlinked_returns: totalUnlinkedReturns,
      total_credit: totalCredit,
      total_bills: summary?.total_bills || 0,
      due_count: summary?.due_count || 0,
      settled_count: summary?.settled_count || 0,
    };
  }

  async getContactBills(contactId, userId, isGst, query) {
    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      throw ApiError.badRequest("Invalid contact ID");
    }

    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
      type: { $in: ["party", "supplier"] },
    }).lean();
    if (!contact) throw ApiError.notFound("Contact not found");

    const filter = {
      contact_id: new mongoose.Types.ObjectId(contactId),
      user_id: new mongoose.Types.ObjectId(userId),
      is_gst: isGst,
    };
    Object.assign(filter, this._financialYearMatch(query.financial_year_id));

    if (query.status === "due") {
      filter.payment_status = { $in: ["due", "overpaid"] };
    } else if (query.status === "settled") {
      filter.payment_status = "paid";
    }

    const billsResult = await Pagination.paginate(Bill, filter, {
      ...query,
      select:
        "id bill_no date createdAt amount paid_amount return_amount settlement_discount payment_status payment_entries",
      sort: { date: -1, createdAt: -1 },
    });

    if (query.status === "due") {
      const unsettledTxns = await transactionService.getUnsettledTransactions(
        contactId,
        userId,
        isGst
      );

      if (unsettledTxns && unsettledTxns.length > 0) {
        const txnRows = unsettledTxns.map((t) => {
          const remaining = t.remaining_amount ?? t.unsettled_amount ?? t.amount ?? 0;
          const displayType =
            t.type === "bank_received"
              ? "Bank Rec"
              : t.type === "cash_received"
              ? "Cash Rec"
              : t.type === "bank_payment"
              ? "Bank Pmt"
              : t.type === "cash_payment"
              ? "Cash Pmt"
              : t.type;

          return {
            _id: t._id,
            id: t._id,
            bill_no: t.transaction_no,
            date: t.date,
            createdAt: t.createdAt,
            amount: 0,
            paid_amount: remaining,
            return_amount: 0,
            settlement_discount: 0,
            payment_status: "on_account",
            payment_entries: [],
            type: displayType,
            is_transaction: true,
          };
        });

        billsResult.data = [...billsResult.data, ...txnRows];
        billsResult.data.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        billsResult.meta.total += txnRows.length;
      }
    }

    return billsResult;
  }

  async getContactHistory(contactId, userId, isGst, query) {
    if (!mongoose.Types.ObjectId.isValid(contactId)) {
      throw ApiError.badRequest("Invalid contact ID");
    }

    const contact = await Contact.findOne({
      _id: contactId,
      user_id: userId,
      type: { $in: ["party", "supplier"] },
    }).lean();
    if (!contact) throw ApiError.notFound("Contact not found");

    const { page, limit, skip, all } = Pagination.getParams(query);

    const pipeline = [
      {
        $match: {
          contact_id: new mongoose.Types.ObjectId(contactId),
          user_id: new mongoose.Types.ObjectId(userId),
          is_gst: isGst,
          ...this._financialYearMatch(query.financial_year_id),
        },
      },
      { $unwind: "$payment_entries" },
      { $sort: { "payment_entries.date": -1 } },
      {
        $facet: {
          data: [
            ...(all ? [] : [{ $skip: skip }, { $limit: limit }]),
            {
              $project: {
                _id: 0,
                bill_no: 1,
                bill_id: "$_id",
                amount: "$payment_entries.amount",
                payment_type: "$payment_entries.payment_type",
                reference_no: "$payment_entries.reference_no",
                note: "$payment_entries.note",
                settled_to: "$payment_entries.settled_to",
                date: "$payment_entries.date",
              },
            },
          ],
          total: [{ $count: "count" }],
        },
      },
    ];

    const [result] = await Bill.aggregate(pipeline);

    const total = result.total[0]?.count || 0;

    return {
      data: result.data,
      meta: Pagination.createMeta(total, page, limit),
    };
  }
}

const outstandingService = new OutstandingService();
export default outstandingService;
