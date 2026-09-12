import ExpenseCategory from "../../models/master/expense_category.model.js";
import { ApiError } from "../../utils/index.js";

class ExpenseCategoryService {
  async getCategories(userId, { is_active } = {}) {
    const filter = { user_id: userId };
    if (is_active !== undefined) {
      filter.is_active = is_active === "true" || is_active === true;
    }
    return ExpenseCategory.find(filter).sort({ name: 1 }).lean();
  }

  async getCategoryById(categoryId, userId) {
    const category = await ExpenseCategory.findOne({
      _id: categoryId,
      user_id: userId,
    });
    if (!category) {
      throw ApiError.notFound("Expense category not found");
    }
    return category;
  }

  async createCategory(data, userId) {
    const { name, description, is_active } = data;
    if (!name || !name.trim()) {
      throw ApiError.badRequest("Category name is required");
    }

    const existing = await ExpenseCategory.findOne({
      name: name.trim(),
      user_id: userId,
    });
    if (existing) {
      throw ApiError.conflict(`Expense category '${name.trim()}' already exists`);
    }

    return ExpenseCategory.create({
      name: name.trim(),
      description: description ? description.trim() : "",
      is_active: is_active !== undefined ? Boolean(is_active) : true,
      user_id: userId,
    });
  }

  async updateCategory(categoryId, data, userId) {
    const category = await this.getCategoryById(categoryId, userId);

    if (data.name && data.name.trim() !== category.name) {
      const existing = await ExpenseCategory.findOne({
        _id: { $ne: categoryId },
        name: data.name.trim(),
        user_id: userId,
      });
      if (existing) {
        throw ApiError.conflict(`Expense category '${data.name.trim()}' already exists`);
      }
      category.name = data.name.trim();
    }

    if (data.description !== undefined) {
      category.description = data.description ? data.description.trim() : "";
    }
    if (data.is_active !== undefined) {
      category.is_active = Boolean(data.is_active);
    }

    await category.save();
    return category;
  }

  async deleteCategory(categoryId, userId) {
    const category = await ExpenseCategory.findOneAndDelete({
      _id: categoryId,
      user_id: userId,
    });
    if (!category) {
      throw ApiError.notFound("Expense category not found");
    }
    return category;
  }
}

export default new ExpenseCategoryService();
