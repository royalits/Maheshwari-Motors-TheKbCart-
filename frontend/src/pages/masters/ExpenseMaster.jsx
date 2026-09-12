import React, { useState, useEffect } from "react";
import {
  FaPlus,
  FaPenToSquare,
  FaTrash,
  FaMagnifyingGlass,
  FaTags,
  FaCircleCheck,
  FaCircleXmark,
  FaRotate,
} from "react-icons/fa6";
import useStore from "../../store";
import { expenseService } from "../../services/expenseService";

const ExpenseMaster = () => {
  const showToast = useStore((s) => s.showToast);
  const showConfirm = useStore((s) => s.showConfirm);
  const hideConfirm = useStore((s) => s.hideConfirm);

  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    is_active: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const fetchCategories = async () => {
    setLoading(true);
    try {
      const data = await expenseService.getCategories();
      setCategories(data || []);
    } catch (err) {
      showToast(err.message || "Failed to load expense categories", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const handleOpenAddModal = () => {
    setEditingCategory(null);
    setFormData({ name: "", description: "", is_active: true });
    setModalOpen(true);
  };

  const handleOpenEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || "",
      description: category.description || "",
      is_active: category.is_active !== undefined ? category.is_active : true,
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      showToast("Category Name is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      if (editingCategory) {
        await expenseService.updateCategory(editingCategory._id, formData);
        showToast("Expense category updated successfully!", "success");
      } else {
        await expenseService.createCategory(formData);
        showToast("Expense category created successfully!", "success");
      }
      setModalOpen(false);
      fetchCategories();
    } catch (err) {
      showToast(err.message || "Operation failed", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (category) => {
    showConfirm(
      `Are you sure you want to delete category "${category.name}"?`,
      async () => {
        try {
          await expenseService.deleteCategory(category._id);
          showToast("Category deleted successfully", "success");
          fetchCategories();
        } catch (err) {
          showToast(err.message || "Failed to delete category", "error");
        } finally {
          hideConfirm();
        }
      },
      () => hideConfirm()
    );
  };

  const filteredCategories = categories.filter((cat) => {
    const matchesSearch =
      cat.name?.toLowerCase().includes(search.toLowerCase()) ||
      cat.description?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && cat.is_active) ||
      (statusFilter === "inactive" && !cat.is_active);
    return matchesSearch && matchesStatus;
  });

  const activeCount = categories.filter((c) => c.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
        <div>
          <h1 className="text-2xl font-bold text-neutral-800 flex items-center gap-2">
            <FaTags className="text-indigo-600 w-6 h-6" />
            Expense Master
          </h1>
          <p className="text-sm text-neutral-500 mt-1">
            Manage expense categories/heads (e.g. Salary, Rent, Refreshments, Stationery)
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            onClick={fetchCategories}
            className="p-2.5 text-neutral-600 hover:bg-neutral-100 rounded-lg transition border border-neutral-200"
            title="Refresh"
          >
            <FaRotate className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={handleOpenAddModal}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-indigo-700 transition shadow-xs"
          >
            <FaPlus className="w-4 h-4" />
            Add Expense Category
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Total Categories</span>
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <FaTags className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-neutral-800 mt-2">{categories.length}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Active Categories</span>
            <span className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <FaCircleCheck className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{activeCount}</p>
        </div>

        <div className="bg-white p-5 rounded-xl border border-neutral-200 shadow-xs">
          <div className="flex justify-between items-center">
            <span className="text-sm font-medium text-neutral-500">Inactive Categories</span>
            <span className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <FaCircleXmark className="w-5 h-5" />
            </span>
          </div>
          <p className="text-2xl font-bold text-rose-600 mt-2">
            {categories.length - activeCount}
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-neutral-200 shadow-xs flex flex-col sm:flex-row justify-between gap-4">
        <div className="relative flex-1">
          <FaMagnifyingGlass className="absolute left-3 top-3.5 text-neutral-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Search expense category by name or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-neutral-50 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-neutral-600 font-medium">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-neutral-50 border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
          </select>
        </div>
      </div>

      {/* Categories Table */}
      <div className="bg-white rounded-xl border border-neutral-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-neutral-500">
            <FaRotate className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
            Loading expense categories...
          </div>
        ) : filteredCategories.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <FaTags className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
            <p className="font-semibold text-lg text-neutral-700">No Expense Categories Found</p>
            <p className="text-sm text-neutral-400 mt-1">
              Click "Add Expense Category" above to create your first expense head.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold uppercase text-xs">
                <tr>
                  <th className="px-6 py-3.5">#</th>
                  <th className="px-6 py-3.5">Category Name</th>
                  <th className="px-6 py-3.5">Description</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 text-neutral-700">
                {filteredCategories.map((cat, index) => (
                  <tr key={cat._id} className="hover:bg-neutral-50/80 transition">
                    <td className="px-6 py-4 font-mono text-neutral-400">{index + 1}</td>
                    <td className="px-6 py-4 font-semibold text-neutral-900">{cat.name}</td>
                    <td className="px-6 py-4 text-neutral-500 max-w-md truncate">
                      {cat.description || "—"}
                    </td>
                    <td className="px-6 py-4">
                      {cat.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleOpenEditModal(cat)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition"
                          title="Edit"
                        >
                          <FaPenToSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(cat)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-md transition"
                          title="Delete"
                        >
                          <FaTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Dialog */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white w-full max-w-lg rounded-xl shadow-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="flex justify-between items-center px-6 py-4 border-b border-neutral-200 bg-neutral-50">
              <h3 className="font-bold text-lg text-neutral-800 flex items-center gap-2">
                <FaTags className="text-indigo-600 w-5 h-5" />
                {editingCategory ? "Edit Expense Category" : "Add Expense Category"}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-lg font-semibold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Category Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Staff Salary, Tea & Snacks, Office Rent"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-neutral-700 mb-1">
                  Description / Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Optional details or note about this expense category..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="is_active"
                  checked={formData.is_active}
                  onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
                />
                <label htmlFor="is_active" className="text-sm font-medium text-neutral-700 cursor-pointer">
                  Active Category (Enabled for expense vouchers)
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting && <FaRotate className="w-4 h-4 animate-spin" />}
                  {editingCategory ? "Update Category" : "Save Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseMaster;
