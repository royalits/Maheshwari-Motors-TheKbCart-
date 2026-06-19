import mongoose from "mongoose";
import Bill from "../../models/transaction/bill.model.js";
import Contact from "../../models/master/contact.model.js";
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

    return Pagination.paginate(Contact, filter, {
      ...query,
      select: "id name city balance type address state agent_id area_id",
      populate: [
        { path: "agent_id", select: "name" },
      ],
      sort: { balance: 1, name: 1 },
    });
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
      .select("id name city balance type address state agent_id area_id")
      .populate([
        { path: "agent_id", select: "name" },
      ])
      .lean();

    if (!contact) throw ApiError.notFound("Contact not found");

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
          total_bills: { $sum: 1 },
          due_count: {
            $sum: { $cond: [{ $eq: ["$payment_status", "due"] }, 1, 0] },
          },
          settled_count: {
            $sum: {
              $cond: [{ $in: ["$payment_status", ["paid", "overpaid"]] }, 1, 0],
            },
          },
        },
      },
    ]);

    return {
      contact,
      total_amount: summary?.total_amount || 0,
      total_paid: summary?.total_paid || 0,
      total_discount: summary?.total_discount || 0,
      total_due: summary?.total_due || 0,
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
      filter.payment_status = "due";
    } else if (query.status === "settled") {
      filter.payment_status = { $in: ["paid", "overpaid"] };
    }

    return Pagination.paginate(Bill, filter, {
      ...query,
      select:
        "id bill_no date amount paid_amount return_amount settlement_discount payment_status payment_entries",
      sort: { date: -1, createdAt: -1 },
    });
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
