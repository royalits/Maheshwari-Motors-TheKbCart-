import expenseCategoryService from "../../services/master/expenseCategory.service.js";
import { asyncHandler, ApiResponse } from "../../utils/index.js";

class ExpenseCategoryController {
  getCategories = asyncHandler(async (req, res) => {
    const categories = await expenseCategoryService.getCategories(
      req.user._id,
      req.query,
    );
    res
      .status(200)
      .json(new ApiResponse(200, categories, "Expense categories fetched successfully"));
  });

  getCategoryById = asyncHandler(async (req, res) => {
    const category = await expenseCategoryService.getCategoryById(
      req.params.categoryId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, category, "Expense category fetched successfully"));
  });

  createCategory = asyncHandler(async (req, res) => {
    const category = await expenseCategoryService.createCategory(
      req.body,
      req.user._id,
    );
    res
      .status(201)
      .json(new ApiResponse(201, category, "Expense category created successfully"));
  });

  updateCategory = asyncHandler(async (req, res) => {
    const category = await expenseCategoryService.updateCategory(
      req.params.categoryId,
      req.body,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, category, "Expense category updated successfully"));
  });

  deleteCategory = asyncHandler(async (req, res) => {
    await expenseCategoryService.deleteCategory(
      req.params.categoryId,
      req.user._id,
    );
    res
      .status(200)
      .json(new ApiResponse(200, null, "Expense category deleted successfully"));
  });
}

export default new ExpenseCategoryController();
