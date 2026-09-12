import Expense from "../../models/transaction/expense.model.js";
import ExpenseCategory from "../../models/master/expense_category.model.js";
import Transaction from "../../models/transaction/transaction.model.js";
import Bill from "../../models/transaction/bill.model.js";
import mongoose from "mongoose";

class ExpenseReportService {
  async getExpenseSummaryReport(userId, isGst, financialYearId, query = {}) {
    const filter = {
      user_id: new mongoose.Types.ObjectId(userId),
      is_gst: Number(isGst) === 1 ? 1 : 0,
    };

    if (financialYearId) {
      filter.financial_year_id = new mongoose.Types.ObjectId(financialYearId);
    }

    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    // 1. Fetch Expense Totals
    const expenseAggregation = await Expense.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$expense_category_id",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          cashAmount: {
            $sum: { $cond: [{ $eq: ["$payment_mode", "cash"] }, "$amount", 0] },
          },
          bankAmount: {
            $sum: { $cond: [{ $eq: ["$payment_mode", "bank"] }, "$amount", 0] },
          },
        },
      },
    ]);

    let totalExpense = 0;
    let totalCashExpense = 0;
    let totalBankExpense = 0;

    const categorySummaryMap = {};
    expenseAggregation.forEach((row) => {
      const amt = row.totalAmount || 0;
      totalExpense += amt;
      totalCashExpense += row.cashAmount || 0;
      totalBankExpense += row.bankAmount || 0;

      categorySummaryMap[String(row._id)] = {
        total: amt,
        count: row.count || 0,
        cash: row.cashAmount || 0,
        bank: row.bankAmount || 0,
      };
    });

    // Load categories
    const categories = await ExpenseCategory.find({ user_id: userId })
      .select("name description is_active")
      .lean();

    const categoryBreakdown = categories.map((cat) => {
      const stats = categorySummaryMap[String(cat._id)] || {
        total: 0,
        count: 0,
        cash: 0,
        bank: 0,
      };
      return {
        id: cat._id,
        name: cat.name,
        description: cat.description,
        total: stats.total,
        count: stats.count,
        cash: stats.cash,
        bank: stats.bank,
      };
    });

    // 2. Fetch Cash & Bank Inflows / Outflows from Transaction model
    const transFilter = {
      user_id: new mongoose.Types.ObjectId(userId),
      is_gst: Number(isGst) === 1 ? 1 : 0,
    };
    if (financialYearId) {
      transFilter.financial_year_id = new mongoose.Types.ObjectId(financialYearId);
    }
    if (query.startDate || query.endDate) {
      transFilter.date = filter.date;
    }

    const transactionAggregation = await Transaction.aggregate([
      { $match: transFilter },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
        },
      },
    ]);

    let salesCashIn = 0;
    let salesBankIn = 0;
    let purchaseCashOut = 0;
    let purchaseBankOut = 0;

    transactionAggregation.forEach((row) => {
      const amt = row.totalAmount || 0;
      if (row._id === "cash_received") salesCashIn += amt;
      if (row._id === "bank_received") salesBankIn += amt;
      if (row._id === "cash_payment") purchaseCashOut += amt;
      if (row._id === "bank_payment") purchaseBankOut += amt;
    });

    // 3. Fetch Cash & Bank Inflows / Outflows from Bill payment_entries
    const billMatch = {
      $or: [
        { user_id: new mongoose.Types.ObjectId(userId) },
        { user_id: { $exists: false } },
        { user_id: null },
      ],
      is_gst: Number(isGst) === 1 ? 1 : 0,
    };
    if (financialYearId) {
      billMatch.financial_year_id = new mongoose.Types.ObjectId(financialYearId);
    }

    const billPaymentPipeline = [
      { $match: billMatch },
      { $unwind: "$payment_entries" },
      {
        $match: {
          $or: [
            { "payment_entries.transaction_id": { $exists: false } },
            { "payment_entries.transaction_id": null },
          ],
        },
      },
    ];

    if (query.startDate || query.endDate) {
      const dateFilter = {};
      if (query.startDate) dateFilter.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      billPaymentPipeline.push({
        $match: { "payment_entries.date": dateFilter },
      });
    }

    billPaymentPipeline.push({
      $group: {
        _id: "$payment_entries.payment_type",
        totalAmount: { $sum: "$payment_entries.amount" },
      },
    });

    const billPaymentAggregation = await Bill.aggregate(billPaymentPipeline);

    billPaymentAggregation.forEach((row) => {
      const amt = row.totalAmount || 0;
      if (row._id === "cash_payment_received_amount") salesCashIn += amt;
      if (row._id === "bank_transaction_received_amount") salesBankIn += amt;
      if (row._id === "cash_payment_given") purchaseCashOut += amt;
      if (row._id === "bank_transfer_payment_given") purchaseBankOut += amt;
    });

    const totalCashOut = purchaseCashOut + totalCashExpense;
    const totalBankOut = purchaseBankOut + totalBankExpense;

    return {
      totalExpense,
      totalCashExpense,
      totalBankExpense,
      categoryBreakdown,
      cashFlow: {
        cashIn: salesCashIn,
        cashOut: totalCashOut,
        cashPurchaseOut: purchaseCashOut,
        cashExpenseOut: totalCashExpense,
        netCash: salesCashIn - totalCashOut,
      },
      bankFlow: {
        bankIn: salesBankIn,
        bankOut: totalBankOut,
        bankPurchaseOut: purchaseBankOut,
        bankExpenseOut: totalBankExpense,
        netBank: salesBankIn - totalBankOut,
      },
    };
  }
}

export default new ExpenseReportService();

