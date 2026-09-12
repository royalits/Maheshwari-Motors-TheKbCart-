import Expense from "../../models/transaction/expense.model.js";
import ExpenseCategory from "../../models/master/expense_category.model.js";
import Bank from "../../models/master/bank.model.js";
import { getNextId } from "../../helpers/counter.js";
import { ApiError } from "../../utils/index.js";

class ExpenseService {
  async getExpenses(userId, isGst, financialYearId, query = {}) {
    const filter = {
      user_id: userId,
      is_gst: Number(isGst) === 1 ? 1 : 0,
    };

    if (financialYearId) {
      filter.financial_year_id = financialYearId;
    }

    if (query.payment_mode) {
      filter.payment_mode = query.payment_mode;
    }

    if (query.expense_category_id) {
      filter.expense_category_id = query.expense_category_id;
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

    const expenses = await Expense.find(filter)
      .populate("expense_category_id", "name description")
      .populate("bank_id", "bank_name account_number")
      .sort({ date: -1, createdAt: -1 })
      .lean();

    return expenses.map((exp) => ({
      ...exp,
      category_name: exp.expense_category_id?.name || "General",
      bank_name: exp.bank_id?.bank_name || null,
    }));
  }

  async getExpenseById(expenseId, userId) {
    const expense = await Expense.findOne({ _id: expenseId, user_id: userId })
      .populate("expense_category_id", "name description")
      .populate("bank_id", "bank_name account_number");

    if (!expense) {
      throw ApiError.notFound("Expense entry not found");
    }
    return expense;
  }

  async createExpense(data, userId, isGst, financialYearId) {
    const {
      expense_category_id,
      date,
      amount,
      payment_mode,
      bank_id,
      reference_no,
      remarks,
    } = data;

    if (!expense_category_id) {
      throw ApiError.badRequest("Expense category is required");
    }

    const categoryExists = await ExpenseCategory.exists({
      _id: expense_category_id,
      user_id: userId,
    });
    if (!categoryExists) {
      throw ApiError.notFound("Invalid expense category");
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      throw ApiError.badRequest("Valid expense amount is required");
    }

    if (payment_mode === "bank" && bank_id) {
      const bankExists = await Bank.exists({ _id: bank_id, user_id: userId });
      if (!bankExists) {
        throw ApiError.notFound("Invalid bank account");
      }
    }

    const seqId = await getNextId("Expense", userId);
    const expDate = date ? new Date(date) : new Date();
    const yearStr = expDate.getFullYear();
    const voucher_no = `EXP-${yearStr}-${String(seqId).padStart(4, "0")}`;

    const expense = await Expense.create({
      id: seqId,
      voucher_no,
      expense_category_id,
      date: expDate,
      amount: parsedAmount,
      payment_mode: payment_mode === "bank" ? "bank" : "cash",
      bank_id: payment_mode === "bank" ? bank_id || null : null,
      reference_no: reference_no ? String(reference_no).trim() : "",
      remarks: remarks ? String(remarks).trim() : "",
      is_gst: Number(isGst) === 1 ? 1 : 0,
      financial_year_id: financialYearId || null,
      user_id: userId,
    });

    return this.getExpenseById(expense._id, userId);
  }

  async updateExpense(expenseId, data, userId) {
    const expense = await Expense.findOne({ _id: expenseId, user_id: userId });
    if (!expense) {
      throw ApiError.notFound("Expense entry not found");
    }

    if (data.expense_category_id) {
      const categoryExists = await ExpenseCategory.exists({
        _id: data.expense_category_id,
        user_id: userId,
      });
      if (!categoryExists) {
        throw ApiError.notFound("Invalid expense category");
      }
      expense.expense_category_id = data.expense_category_id;
    }

    if (data.amount !== undefined) {
      const parsedAmount = Number(data.amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        throw ApiError.badRequest("Valid expense amount is required");
      }
      expense.amount = parsedAmount;
    }

    if (data.date) {
      expense.date = new Date(data.date);
    }

    if (data.payment_mode) {
      expense.payment_mode = data.payment_mode === "bank" ? "bank" : "cash";
      if (expense.payment_mode === "cash") {
        expense.bank_id = null;
      }
    }

    if (expense.payment_mode === "bank" && data.bank_id) {
      const bankExists = await Bank.exists({
        _id: data.bank_id,
        user_id: userId,
      });
      if (!bankExists) {
        throw ApiError.notFound("Invalid bank account");
      }
      expense.bank_id = data.bank_id;
    }

    if (data.reference_no !== undefined) {
      expense.reference_no = String(data.reference_no || "").trim();
    }

    if (data.remarks !== undefined) {
      expense.remarks = String(data.remarks || "").trim();
    }

    await expense.save();
    return this.getExpenseById(expense._id, userId);
  }

  async deleteExpense(expenseId, userId) {
    const expense = await Expense.findOneAndDelete({
      _id: expenseId,
      user_id: userId,
    });
    if (!expense) {
      throw ApiError.notFound("Expense entry not found");
    }
    return expense;
  }
}

export default new ExpenseService();
