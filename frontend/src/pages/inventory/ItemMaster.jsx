import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import {
  FaDownload,
  FaEdit,
  FaEye,
  FaImage,
  FaPlus,
  FaQrcode,
  FaTimes,
  FaTrash,
  FaUpload,
} from "react-icons/fa";
import { useQueryClient } from "@tanstack/react-query";
import ItemQrPreview from "../../components/inventory/ItemQrPreview";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button, Input, SearchableSelect } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { normalizeItem } from "../../services/apiUtils";
import { useAllItems } from "../../hooks/useItems";
import { useAllBrands, useHsns, useDepartments } from "../../hooks/useMasters";
import {
  downloadItemsQrPdf,
  downloadSingleItemQrLabel,
} from "../../utils/itemQr";

const ItemMaster = () => {
  const navigate = useNavigate();
  const showToast = useStore((s) => s.showToast);
  const queryClient = useQueryClient();
  const [editingItem, setEditingItem] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [viewingItem, setViewingItem] = useState(null);
  const [editImageFile, setEditImageFile] = useState(null);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    item: null,
  });
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const importInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data: rawItems = [], isLoading } = useAllItems();
  const { data: brands = [] } = useAllBrands();
  const { data: hsns = [] } = useHsns();
  const { data: departments = [] } = useDepartments();

  const items = useMemo(
    () =>
      rawItems.map((item) => {
        const normalized = normalizeItem(item);
        const brandName =
          brands.find(
            (brand) => String(brand.id) === String(normalized.brandId),
          )?.name || "";
        const departmentName =
          departments.find(
            (department) =>
              String(department.id) === String(normalized.departmentId),
          )?.name || "";

        return {
          ...normalized,
          item_id: item?.item_id,
          brandName,
          departmentName,
          status: normalized.stockCount < normalized.threshold ? "LOW" : "OK",
        };
      }),
    [brands, departments, rawItems],
  );

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (
        departmentFilter &&
        departmentFilter !== "all" &&
        String(item.departmentId) !== String(departmentFilter)
      ) {
        return false;
      }

      if (
        brandFilter &&
        brandFilter !== "all" &&
        String(item.brandId) !== String(brandFilter)
      ) {
        return false;
      }

      return true;
    });
  }, [items, departmentFilter, brandFilter]);

  const selectedItems = useMemo(
    () =>
      filteredItems.filter((item) => selectedItemIds.includes(String(item.id))),
    [filteredItems, selectedItemIds],
  );

  useKeyboardShortcuts({
    onAdd: () => navigate("/masters/item-master/add"),
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        setSelectedItemIds((prev) => {
          const allSelected =
            filteredItems.length > 0 &&
            filteredItems.every((item) => prev.includes(String(item.id)));
          if (allSelected) return [];
          return filteredItems.map((item) => String(item.id));
        });
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [filteredItems]);

  const columns = useMemo(
    () => [
      {
        key: "id",
        label: "ID",
        render: (val, row, index) => (
          <span className="text-xs sm:text-sm">{index + 1}</span>
        ),
      },
      {
        key: "item_id",
        label: "Item ID",
        render: (val) => (
          <span className="text-xs sm:text-sm">{val || "-"}</span>
        ),
      },
      {
        key: "barcode",
        label: "Barcode",
        render: (val) => (
          <span className="text-xs sm:text-sm">{val || "-"}</span>
        ),
      },
      {
        key: "itemName",
        label: "Item Name",
        render: (value) => (
          <span className="text-xs sm:text-sm font-medium truncate">
            {value}
          </span>
        ),
      },
      {
        key: "type",
        label: "Type",
        render: (value) => (
          <span
            className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs rounded-full ${
              value === 1 ?
                "bg-green-100 text-green-800"
              : "bg-blue-100 text-blue-800"
            }`}
          >
            {value === 1 ? "1" : "0"}
          </span>
        ),
      },
      {
        key: "amount",
        label: "Amount",
        render: (value) => (
          <span className="text-xs sm:text-sm">
            ₹{Number(value || 0).toFixed(2)}
          </span>
        ),
      },
      {
        key: "stockCount",
        label: "Stock",
        render: (value, row) => (
          <span
            className={`text-xs sm:text-sm ${row.status === "LOW" ? "text-red-600 font-medium" : "text-gray-900"}`}
          >
            {value}
          </span>
        ),
      },
      {
        key: "threshold",
        label: "TH",
        render: (value) => <span className="text-xs sm:text-sm">{value}</span>,
      },
      {
        key: "brandName",
        label: "Brand",
        render: (value) => (
          <span className="text-xs sm:text-sm">{value || "N/A"}</span>
        ),
      },
      {
        key: "departmentName",
        label: "Dept.",
        render: (value) => (
          <span className="text-xs sm:text-sm">{value || "N/A"}</span>
        ),
      },
      {
        key: "status",
        label: "Stock Status",
        render: (value) => (
          <span
            className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs rounded-full ${
              value === "LOW" ?
                "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
            }`}
          >
            {value}
          </span>
        ),
      },
      {
        key: "itemMedia",
        label: "Image",
        render: (value) => (
          <div
            className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 bg-gray-100 rounded flex items-center justify-center cursor-pointer hover:bg-gray-200"
            onClick={() => value && setSelectedImage(value)}
          >
            {value ?
              <img
                src={value}
                alt="Item"
                className="w-full h-full object-cover rounded"
              />
            : <FaImage className="text-gray-400 text-xs sm:text-sm" />}
          </div>
        ),
      },
    ],
    [],
  );

  const actions = [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (item) => {
        setViewingItem(item);
        setIsViewModalOpen(true);
      },
      className:
        "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaQrcode size={10} className="sm:size-3 md:size-4" />,
      onClick: (item) => handleDownloadItemQr(item),
      className:
        "bg-violet-600 text-white hover:bg-violet-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (item) => {
        setEditingItem(item);
        setIsEditModalOpen(true);
      },
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (item) => setDeleteDialog({ isOpen: true, item }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  const handleSaveEdit = async () => {
    if (editingItem) {
      try {
        const formData = new FormData();
        formData.append("item_name", editingItem.itemName);
        formData.append("sale_rate", editingItem.amount);
        formData.append("threshold", editingItem.threshold);
        formData.append("is_gst", editingItem.type);
        formData.append("stock", editingItem.stockCount);

        if (editingItem.item_id)
          formData.append("item_id", editingItem.item_id);
        if (editingItem.barcode)
          formData.append("barcode", editingItem.barcode);
        if (
          editingItem.purchase_rate !== undefined &&
          editingItem.purchase_rate !== ""
        )
          formData.append("purchase_rate", editingItem.purchase_rate);
        if (editingItem.mrp_rate !== undefined && editingItem.mrp_rate !== "")
          formData.append("mrp_rate", editingItem.mrp_rate);
        if (editingItem.discount !== undefined && editingItem.discount !== "")
          formData.append("discount", editingItem.discount);
        if (
          editingItem.gst_percent !== undefined &&
          editingItem.gst_percent !== ""
        )
          formData.append("gst_percent", editingItem.gst_percent);
        if (editingItem.brandId)
          formData.append("brand_id", editingItem.brandId);
        if (editingItem.departmentId)
          formData.append("dept_id", editingItem.departmentId);
        if (editingItem.hsn_code)
          formData.append("hsn_id", editingItem.hsn_code);
        if (editingItem.alias) formData.append("alias", editingItem.alias);
        if (editingItem.description)
          formData.append("description", editingItem.description);

        if (editImageFile) {
          formData.append("image", editImageFile);
        }

        await api.put(`/items/${editingItem.id}`, formData);

        showToast("Item updated successfully", "success");
        setIsEditModalOpen(false);
        setEditingItem(null);
        setEditImageFile(null);

        queryClient.invalidateQueries({ queryKey: ["items"] });
        queryClient.invalidateQueries({ queryKey: ["items-low-stock"] });
      } catch (error) {
        showToast(
          error.response?.data?.message || "Failed to update item",
          "error",
        );
      }
    }
  };

  useSaveShortcut(handleSaveEdit, isEditModalOpen);

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    setEditImageFile(file);
  };

  async function handleDownloadItemQr(item) {
    try {
      await downloadSingleItemQrLabel(item);
      showToast("QR label downloaded successfully", "success");
    } catch (error) {
      showToast(error?.message || "Failed to download QR label", "error");
    }
  }

  async function handleDownloadSelectedQr() {
    if (selectedItems.length === 0) {
      showToast("Select at least one item first", "warning");
      return;
    }

    try {
      await downloadItemsQrPdf(selectedItems);
      showToast("QR PDF downloaded successfully", "success");
    } catch (error) {
      showToast(error?.message || "Failed to download QR PDF", "error");
    }
  }

  async function handleImportItems(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setImporting(true);
      const response = await api.post("/items/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const result = response?.data?.data || {};
      const failed = Number(result.totalFailed || 0);
      const created = Number(result.totalCreated || 0);
      const updated = Number(result.totalUpdated || 0);
      const firstError = Array.isArray(result.errors) ? result.errors[0] : null;
      const failureReason =
        firstError ?
          `: Row ${firstError.row || "?"} - ${firstError.message || "Import failed"}`
        : "";

      showToast(
        `Imported ${Number(result.totalImported || 0)} item(s): ${created} new, ${updated} updated${
          failed ? `, ${failed} failed${failureReason}` : ""
        }`,
        failed ? "warning" : "success",
      );

      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["items-low-stock"] });
    } catch (error) {
      showToast(
        error.response?.data?.message || "Failed to import items",
        "error",
      );
    } finally {
      setImporting(false);
    }
  }

  async function handleExportItems() {
    try {
      setExporting(true);
      const response = await api.get("/items/export", {
        responseType: "blob",
      });
      const blob = new Blob([response.data], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "items-export.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Items exported successfully", "success");
    } catch (error) {
      showToast(
        error.response?.data?.message || "Failed to export items",
        "error",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Item Management
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm">
            Manage inventory items and stock levels
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={handleImportItems}
          />
          <Button
            variant="outline"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 text-xs sm:text-sm"
          >
            <FaUpload className="text-sm sm:text-base" />
            {importing ? "Importing..." : "Import Excel"}
          </Button>
          <Button
            variant="outline"
            onClick={handleExportItems}
            disabled={exporting}
            className="flex items-center gap-2 text-xs sm:text-sm"
          >
            <FaDownload className="text-sm sm:text-base" />
            {exporting ? "Exporting..." : "Export Excel"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setSelectedItemIds([])}
            disabled={selectedItemIds.length === 0}
            className="text-xs sm:text-sm"
          >
            Clear Selection
          </Button>
          <Button
            onClick={handleDownloadSelectedQr}
            disabled={selectedItemIds.length === 0}
            className="flex items-center gap-2 text-xs sm:text-sm"
          >
            <FaDownload className="text-sm sm:text-base" />
            Download Selected QR PDF
          </Button>
          <Button
            onClick={() => navigate("/masters/item-master/add")}
            className="flex items-center gap-2 text-xs sm:text-sm"
          >
            <FaPlus className="text-sm sm:text-base" />
            Add Item
          </Button>
        </div>
      </div>

      {/* Filter Section */}
      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Filter by Department:
            </label>
            <SearchableSelect
              value={departmentFilter}
              onChange={(value) => setDepartmentFilter(value || "all")}
              placeholder="All Departments"
              searchPlaceholder="Search department..."
              options={departments.map((department) => ({
                value: department.id,
                label: department.name,
              }))}
              buttonClassName="min-w-[220px] text-sm"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">
              Filter by Brand:
            </label>
            <SearchableSelect
              value={brandFilter}
              onChange={(value) => setBrandFilter(value || "all")}
              placeholder="All Brands"
              searchPlaceholder="Search brand..."
              options={brands.map((brand) => ({
                value: brand.id,
                label: brand.name,
              }))}
              buttonClassName="min-w-[220px] text-sm"
            />
          </div>
        </div>
      </div>
      {/*
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs sm:text-sm text-slate-700">
        {selectedItemIds.length > 0 ?
          `${selectedItemIds.length} item(s) selected. Download them in one PDF with item name and QR labels.`
        : 'Use the checkbox column to select multiple items and download their QR labels in one PDF.'}
      </div> */}

      {/* Items Table */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={isLoading}
          columns={columns}
          data={filteredItems}
          actions={actions}
          selectable={true}
          selectedRowIds={selectedItemIds}
          onSelectedRowIdsChange={setSelectedItemIds}
          getRowId={(row) => row.id}
          searchable={true}
          searchPlaceholder="Search by ID, Item ID, Barcode, Item Name, Type, Amount, Stock, Threshold, Brand, Department"
          sortable={true}
          pagination={true}
          density="compact"
          pageSize={25}
          minWidth="700px"
          className="text-xs sm:text-sm"
        />
      </div>

      {/* Image Zoom Modal */}
      {selectedImage && (
        <div
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-4xl max-h-screen p-4">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-75"
            >
              <FaTimes size={20} />
            </button>
            <img
              src={selectedImage}
              alt="Zoomed"
              className="max-w-full max-h-screen object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Item"
        size="lg"
      >
        {editingItem && (
          <div className="max-h-[70vh] overflow-y-auto space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Item Name
                </label>
                <Input
                  value={editingItem.itemName}
                  onChange={(value) =>
                    setEditingItem((prev) => ({ ...prev, itemName: value }))
                  }
                  allowSpaces={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Alias
                </label>
                <Input
                  value={editingItem.alias || ""}
                  onChange={(value) =>
                    setEditingItem((prev) => ({ ...prev, alias: value }))
                  }
                  allowSpaces={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Item ID
                </label>
                <Input
                  value={editingItem.item_id || ""}
                  onChange={(value) =>
                    setEditingItem((prev) => ({ ...prev, item_id: value }))
                  }
                  allowSpaces={false}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                  placeholder="Enter item code"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Barcode
                </label>
                <Input
                  value={editingItem.barcode || ""}
                  onChange={(value) =>
                    setEditingItem((prev) => ({ ...prev, barcode: value }))
                  }
                  allowSpaces={false}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                  placeholder="Enter barcode"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Current Stock Count
                </label>
                <Input
                  type="number"
                  value={
                    editingItem.stockCount !== undefined ?
                      editingItem.stockCount
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      stockCount: v === "" ? "" : parseInt(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  allowNegative={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Brand
                </label>
                <select
                  value={editingItem.brandId || ""}
                  onChange={(e) =>
                    setEditingItem((prev) => ({
                      ...prev,
                      brandId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                >
                  <option value="">Select Brand</option>
                  {brands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Department
                </label>
                <select
                  value={editingItem.departmentId || ""}
                  onChange={(e) =>
                    setEditingItem((prev) => ({
                      ...prev,
                      departmentId: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                >
                  <option value="">Select Department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  HSN Code
                </label>
                <select
                  value={editingItem.hsn_code || ""}
                  onChange={(e) => {
                    const hsnId = e.target.value;
                    const selectedHsn = hsns.find((h) => h._id === hsnId);
                    setEditingItem((prev) => ({
                      ...prev,
                      hsn_code: hsnId,
                      gst_percent:
                        selectedHsn ?
                          selectedHsn.gst_percentage
                        : prev.gst_percent,
                    }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                >
                  <option value="">Select HSN Code</option>
                  {hsns.map((h) => (
                    <option key={h._id} value={h._id}>
                      {h.hsn_number} - {h.gst_percentage}%
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  GST %
                </label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={
                    editingItem.gst_percent !== undefined ?
                      editingItem.gst_percent
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      gst_percent: v === "" ? "" : parseFloat(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  disabled={!!editingItem.hsn_code}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Sale Rate (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={
                    editingItem.amount !== undefined ? editingItem.amount : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      amount: v === "" ? "" : parseFloat(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Purchase Rate (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={
                    editingItem.purchase_rate !== undefined ?
                      editingItem.purchase_rate
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      purchase_rate: v === "" ? "" : parseFloat(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  MRP Rate (₹)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={
                    editingItem.mrp_rate !== undefined ?
                      editingItem.mrp_rate
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      mrp_rate: v === "" ? "" : parseFloat(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Discount (%)
                </label>
                <Input
                  type="number"
                  step="0.01"
                  value={
                    editingItem.discount !== undefined ?
                      editingItem.discount
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      discount: v === "" ? "" : parseFloat(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Threshold
                </label>
                <Input
                  type="number"
                  value={
                    editingItem.threshold !== undefined ?
                      editingItem.threshold
                    : ""
                  }
                  onChange={(v) => {
                    setEditingItem((prev) => ({
                      ...prev,
                      threshold: v === "" ? "" : parseInt(v) || 0,
                    }));
                  }}
                  onWheel={(e) => e.target.blur()}
                  allowZero={true}
                  className="text-xs sm:text-sm py-1.5 sm:py-2"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editingItem.description || ""}
                  onChange={(e) =>
                    setEditingItem((prev) => ({
                      ...prev,
                      description: e.target.value,
                    }))
                  }
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs sm:text-sm"
                />
              </div>
            </div>

            <div>
              <div
                onClick={() =>
                  setEditingItem((prev) => ({
                    ...prev,
                    type: prev.type === 0 ? 1 : 0,
                  }))
                }
                className={`w-14 h-7 flex items-center rounded-full p-1 cursor-pointer transition-all duration-300 ${
                  editingItem.type === 1 ? "bg-green-500" : "bg-gray-300"
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-all duration-300 ${
                    editingItem.type === 1 ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </div>
              <span className="text-xs text-gray-600 mt-1 block">
                {editingItem.type === 1 ? "" : ""}
              </span>
            </div>

            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Item Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="w-full text-xs sm:text-sm text-gray-500 file:mr-2 sm:file:mr-4 file:py-1 sm:file:py-1.5  file:px-2 sm:file:px-4 file:rounded-md file:border-0 file:text-xs sm:file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {editingItem.itemMedia && (
                <div className="mt-2">
                  <img
                    src={editingItem.itemMedia}
                    alt="Current"
                    className="w-10 h-10 sm:w-12 sm:h-12 md:w-16 md:h-16 object-cover rounded"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-3 sm:pt-4">
              <Button
                onClick={handleSaveEdit}
                className="text-xs sm:text-sm py-1.5 sm:py-2"
              >
                Save Changes
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsEditModalOpen(false)}
                className="text-xs sm:text-sm py-1.5 sm:py-2"
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title="Item Details"
        size="lg"
      >
        {viewingItem && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Item Name
                </label>
                <p className="text-sm font-medium text-gray-900">
                  {viewingItem.itemName}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Alias
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.alias || "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Item ID
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.item_id || "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Barcode
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.barcode || "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Brand
                </label>
                <p className="text-sm text-gray-900">
                  {brands.find((b) => b.id === viewingItem.brandId)?.name ||
                    "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Department
                </label>
                <p className="text-sm text-gray-900">
                  {departments.find((d) => d.id === viewingItem.departmentId)
                    ?.name || "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  HSN Code
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.hsn_number || "-"}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  GST %
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.gst_percent || 0}%
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Sale Rate
                </label>
                <p className="text-sm font-medium text-gray-900">
                  ₹{viewingItem.amount?.toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Purchase Rate
                </label>
                <p className="text-sm text-gray-900">
                  ₹{viewingItem.purchase_rate?.toLocaleString() || 0}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  MRP Rate
                </label>
                <p className="text-sm text-gray-900">
                  ₹{viewingItem.mrp_rate?.toLocaleString() || 0}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Discount %
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.discount?.toLocaleString() || 0}%
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Stock
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.stockCount}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Threshold
                </label>
                <p className="text-sm text-gray-900">{viewingItem.threshold}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">
                  Type
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.type === 1 ? "GST" : "Non-GST"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500">
                  Description
                </label>
                <p className="text-sm text-gray-900">
                  {viewingItem.description || "-"}
                </p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Item QR
                </label>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <ItemQrPreview
                    item={viewingItem}
                    size={120}
                    className="w-full max-w-[220px] bg-white"
                  />
                  <div className="space-y-2">
                    <p className="text-sm text-slate-600">
                      This QR is unique for this item and can be used for small
                      printed labels.
                    </p>
                    <Button
                      onClick={() => handleDownloadItemQr(viewingItem)}
                      className="flex items-center gap-2 text-xs sm:text-sm"
                    >
                      <FaDownload />
                      Download QR Label
                    </Button>
                  </div>
                </div>
              </div>
              {viewingItem.itemMedia && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-500 mb-2">
                    Image
                  </label>
                  <img
                    src={viewingItem.itemMedia}
                    alt={viewingItem.itemName}
                    className="w-32 h-32 object-cover rounded"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                variant="outline"
                onClick={() => setIsViewModalOpen(false)}
                className="text-xs sm:text-sm"
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, item: null })}
        onConfirm={async () => {
          try {
            await api.delete(`/items/${deleteDialog.item.id}`);
            setSelectedItemIds((prev) =>
              prev.filter((itemId) => itemId !== String(deleteDialog.item.id)),
            );
            showToast("Item deleted successfully", "success");
            setDeleteDialog({ isOpen: false, item: null });
            queryClient.invalidateQueries({ queryKey: ["items"] });
            queryClient.invalidateQueries({ queryKey: ["items-low-stock"] });
          } catch (error) {
            showToast(
              error.response?.data?.message || "Failed to delete item",
              "error",
            );
          }
        }}
        itemName={deleteDialog.item?.itemName}
      />
    </div>
  );
};

export default ItemMaster;
