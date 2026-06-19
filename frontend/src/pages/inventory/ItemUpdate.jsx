import React, {
  memo,
  useState,
  useMemo,
  useCallback,
  useDeferredValue,
} from "react";
import { useNavigate } from "react-router-dom";
import { FaTimes, FaImage, FaSearch, FaSave, FaUndo } from "react-icons/fa";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Input } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { useAllItems } from "../../hooks/useItems";
import { useAllBrands, useHsns, useDepartments } from "../../hooks/useMasters";
import { normalizeItem, getEntityId } from "../../services/apiUtils";
import useSaveShortcut from "../../hooks/useSaveShortcut";

const FIELD_TO_API = {
  itemName: "item_name",
  amount: "sale_rate",
  stockCount: "stock",
  type: "is_gst",
  brandId: "brand_id",
  departmentId: "dept_id",
  hsn_code: "hsn_id",
  item_id: "item_id",
  barcode: "barcode",
  alias: "alias",
  purchase_rate: "purchase_rate",
  mrp_rate: "mrp_rate",
  discount: "discount",
  gst_percent: "gst_percent",
  threshold: "threshold",
  description: "description",
};

function mapItemRecord(item) {
  const normalized = normalizeItem(item);
  return {
    ...normalized,
    item_id: item?.item_id,
    alias: item?.alias || "",
    description: item?.description || "",
    purchase_rate: item?.purchase_rate || 0,
    mrp_rate: item?.mrp_rate || 0,
    discount: item?.discount || 0,
    gst_percent: item?.gst_percent || 0,
    brandId: getEntityId(item?.brand_id) || "",
    departmentId: getEntityId(item?.dept_id) || "",
    hsn_code: getEntityId(item?.hsn_id) || "",
    status: normalized.stockCount < normalized.threshold ? "LOW" : "OK",
  };
}

const ItemRow = memo(function ItemRow({
  item,
  index,
  rowChanges,
  imageFile,
  brands,
  departments,
  hsns,
  onFieldChange,
  onImageChange,
  onPreviewImage,
}) {
  const getDisplayValue = (field) => {
    if (rowChanges && field in rowChanges) {
      return rowChanges[field];
    }
    return item[field];
  };

  const isFieldChanged = (field) => Boolean(rowChanges && field in rowChanges);

  const cellClass = (field) => {
    const base = "px-4 py-3";
    return isFieldChanged(field) ? `${base} bg-purple-50` : base;
  };

  const inputClass = (field) => {
    const base =
      "w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500";
    return isFieldChanged(field) ?
        `${base} border-purple-300 bg-purple-50`
      : base;
  };

  const status =
    (
      Number(getDisplayValue("stockCount") || 0) <
      Number(getDisplayValue("threshold") || 0)
    ) ?
      "LOW"
    : "OK";

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-500">{index + 1}</td>
      <td className={`${cellClass("item_id")} min-w-[120px]`}>
        <input
          type="text"
          value={getDisplayValue("item_id") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "item_id", e.target.value, item.item_id)
          }
          className={inputClass("item_id")}
        />
      </td>
      <td className={`${cellClass("barcode")} min-w-[120px]`}>
        <input
          type="text"
          value={getDisplayValue("barcode") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "barcode", e.target.value, item.barcode)
          }
          className={inputClass("barcode")}
        />
      </td>
      <td className={`${cellClass("itemName")} min-w-[200px]`}>
        <input
          type="text"
          value={getDisplayValue("itemName") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "itemName", e.target.value, item.itemName)
          }
          className={inputClass("itemName")}
        />
      </td>
      <td className={`${cellClass("alias")} min-w-[150px]`}>
        <input
          type="text"
          value={getDisplayValue("alias") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "alias", e.target.value, item.alias)
          }
          className={inputClass("alias")}
        />
      </td>
      <td className={`${cellClass("brandId")} min-w-[150px]`}>
        <select
          value={getDisplayValue("brandId") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "brandId", e.target.value, item.brandId)
          }
          className={inputClass("brandId")}
        >
          <option value="">Select...</option>
          {brands.map((brand) => (
            <option key={brand.id} value={brand.id}>
              {brand.name}
            </option>
          ))}
        </select>
      </td>
      <td className={`${cellClass("departmentId")} min-w-[150px]`}>
        <select
          value={getDisplayValue("departmentId") || ""}
          onChange={(e) =>
            onFieldChange(
              item.id,
              "departmentId",
              e.target.value,
              item.departmentId,
            )
          }
          className={inputClass("departmentId")}
        >
          <option value="">Select...</option>
          {departments.map((dept) => (
            <option key={dept.id} value={dept.id}>
              {dept.name}
            </option>
          ))}
        </select>
      </td>
      <td className={`${cellClass("hsn_code")} min-w-[150px]`}>
        <select
          value={getDisplayValue("hsn_code") || ""}
          onChange={(e) =>
            onFieldChange(item.id, "hsn_code", e.target.value, item.hsn_code)
          }
          className={inputClass("hsn_code")}
        >
          <option value="">Select...</option>
          {hsns.map((hsn) => (
            <option key={hsn._id} value={hsn._id}>
              {hsn.hsn_number} - {hsn.gst_percentage}%
            </option>
          ))}
        </select>
      </td>
      <td className={cellClass("type")}>
        <div
          onClick={() => {
            const current = getDisplayValue("type");
            onFieldChange(item.id, "type", current === 0 ? 1 : 0, item.type);
          }}
          className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all duration-300 ${
            getDisplayValue("type") === 1 ? "bg-green-500" : "bg-gray-300"
          } ${isFieldChanged("type") ? "ring-2 ring-purple-400" : ""}`}
        >
          <div
            className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-all duration-300 ${
              getDisplayValue("type") === 1 ? "translate-x-6" : "translate-x-0"
            }`}
          />
        </div>
      </td>
      <td className={`${cellClass("amount")} min-w-[120px]`}>
        <div className="flex items-center">
          <span className="text-gray-500 mr-1">&#8377;</span>
          <input
            type="number"
            value={getDisplayValue("amount") ?? ""}
            onChange={(e) =>
              onFieldChange(
                item.id,
                "amount",
                parseFloat(e.target.value) || 0,
                item.amount,
              )
            }
            onWheel={(e) => e.target.blur()}
            className={inputClass("amount")}
            step="0.01"
          />
        </div>
      </td>
      <td className={`${cellClass("purchase_rate")} min-w-[120px]`}>
        <div className="flex items-center">
          <span className="text-gray-500 mr-1">&#8377;</span>
          <input
            type="number"
            value={getDisplayValue("purchase_rate") ?? ""}
            onChange={(e) =>
              onFieldChange(
                item.id,
                "purchase_rate",
                parseFloat(e.target.value) || 0,
                item.purchase_rate,
              )
            }
            onWheel={(e) => e.target.blur()}
            className={inputClass("purchase_rate")}
            step="0.01"
          />
        </div>
      </td>
      <td className={`${cellClass("mrp_rate")} min-w-[120px]`}>
        <div className="flex items-center">
          <span className="text-gray-500 mr-1">&#8377;</span>
          <input
            type="number"
            value={getDisplayValue("mrp_rate") ?? ""}
            onChange={(e) =>
              onFieldChange(
                item.id,
                "mrp_rate",
                parseFloat(e.target.value) || 0,
                item.mrp_rate,
              )
            }
            onWheel={(e) => e.target.blur()}
            className={inputClass("mrp_rate")}
            step="0.01"
          />
        </div>
      </td>
      <td className={`${cellClass("stockCount")} min-w-[100px]`}>
        <input
          type="number"
          value={getDisplayValue("stockCount") ?? ""}
          onChange={(e) =>
            onFieldChange(
              item.id,
              "stockCount",
              parseFloat(e.target.value) || 0,
              item.stockCount,
            )
          }
          onWheel={(e) => e.target.blur()}
          className={inputClass("stockCount")}
          step="0.01"
        />
      </td>
      <td className={`${cellClass("threshold")} min-w-[100px]`}>
        <input
          type="number"
          value={getDisplayValue("threshold") ?? ""}
          onChange={(e) =>
            onFieldChange(
              item.id,
              "threshold",
              parseFloat(e.target.value) || 0,
              item.threshold,
            )
          }
          onWheel={(e) => e.target.blur()}
          className={inputClass("threshold")}
          step="0.01"
        />
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2 py-1 text-xs rounded-full ${
            status === "LOW" ?
              "bg-red-100 text-red-800"
            : "bg-green-100 text-green-800"
          }`}
        >
          {status}
        </span>
      </td>
      <td className={`${cellClass("gst_percent")} min-w-[100px]`}>
        <div className="flex items-center">
          <input
            type="number"
            value={getDisplayValue("gst_percent") ?? ""}
            onChange={(e) =>
              onFieldChange(
                item.id,
                "gst_percent",
                parseFloat(e.target.value) || 0,
                item.gst_percent,
              )
            }
            onWheel={(e) => e.target.blur()}
            className={inputClass("gst_percent")}
            step="0.01"
          />
          <span className="text-gray-500 ml-1">%</span>
        </div>
      </td>
      <td className={`${cellClass("discount")} min-w-[100px]`}>
        <div className="flex items-center">
          <input
            type="number"
            value={getDisplayValue("discount") ?? ""}
            onChange={(e) =>
              onFieldChange(
                item.id,
                "discount",
                parseFloat(e.target.value) || 0,
                item.discount,
              )
            }
            onWheel={(e) => e.target.blur()}
            className={inputClass("discount")}
            step="0.01"
            min="0"
            max="100"
          />
          <span className="text-gray-500 ml-1">%</span>
        </div>
      </td>
      <td className={`${cellClass("description")} min-w-[200px]`}>
        <textarea
          value={getDisplayValue("description") || ""}
          onChange={(e) =>
            onFieldChange(
              item.id,
              "description",
              e.target.value,
              item.description,
            )
          }
          className={inputClass("description")}
          rows="2"
        />
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col gap-2">
          <div
            className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center cursor-pointer hover:bg-gray-200"
            onClick={() => item.itemMedia && onPreviewImage(item.itemMedia)}
          >
            {item.itemMedia ?
              <img
                src={item.itemMedia}
                alt="Item"
                className="w-full h-full object-cover rounded"
              />
            : <FaImage className="text-gray-400 text-xs" />}
          </div>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => onImageChange(item.id, e.target.files[0])}
            className="text-xs"
          />
          {imageFile && (
            <span className="text-xs text-purple-600">New image selected</span>
          )}
        </div>
      </td>
    </tr>
  );
});

const ItemUpdate = () => {
  const navigate = useNavigate();
  const showToast = useStore((s) => s.showToast);
  const queryClient = useQueryClient();

  const [searchTerm, setSearchTerm] = useState("");
  const [changedItems, setChangedItems] = useState({});
  const [imageFiles, setImageFiles] = useState({});
  const [selectedImage, setSelectedImage] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  const {
    data: rawItems = [],
    isLoading: itemsLoading,
    isError: itemsError,
  } = useAllItems();
  const { data: brands = [] } = useAllBrands();
  const { data: hsns = [] } = useHsns();
  const { data: departments = [] } = useDepartments();
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const items = useMemo(() => rawItems.map(mapItemRecord), [rawItems]);

  const filteredItems = useMemo(() => {
    if (!deferredSearchTerm) return items;
    const term = deferredSearchTerm.toLowerCase();
    return items.filter(
      (item) =>
        item.itemName?.toLowerCase().includes(term) ||
        String(item.item_id || "")
          .toLowerCase()
          .includes(term) ||
        String(item.barcode || "")
          .toLowerCase()
          .includes(term) ||
        String(item.alias || "")
          .toLowerCase()
          .includes(term),
    );
  }, [deferredSearchTerm, items]);

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, endIndex);

  // Reset to first page when search changes
  React.useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm]);

  const changeCount = useMemo(() => {
    const allIds = new Set([
      ...Object.keys(changedItems),
      ...Object.keys(imageFiles),
    ]);
    return allIds.size;
  }, [changedItems, imageFiles]);

  const hasChanges = changeCount > 0;

  const updateField = useCallback((itemId, field, value, originalValue) => {
    setChangedItems((prev) => {
      const existing = prev[itemId] || {};
      const isSameAsOriginal =
        value === originalValue ||
        (typeof value === "number" &&
          typeof originalValue === "number" &&
          value === originalValue);

      if (isSameAsOriginal) {
        const { [field]: _, ...rest } = existing;
        if (Object.keys(rest).length === 0) {
          const { [itemId]: __, ...remaining } = prev;
          return remaining;
        }
        return { ...prev, [itemId]: rest };
      }

      return {
        ...prev,
        [itemId]: { ...existing, [field]: value },
      };
    });
  }, []);

  const handleImageChange = useCallback((itemId, file) => {
    if (file) {
      setImageFiles((prev) => ({ ...prev, [itemId]: file }));
    }
  }, []);

  const discardAllChanges = useCallback(() => {
    setChangedItems({});
    setImageFiles({});
    setSaveResult(null);
  }, []);

  const saveAllChanges = useCallback(async () => {
    if (!hasChanges) return;
    setIsSaving(true);
    setSaveResult(null);

    try {
      const textUpdates = Object.entries(changedItems).map(([id, changes]) => {
        const apiChanges = {};
        for (const [frontendField, value] of Object.entries(changes)) {
          const apiField = FIELD_TO_API[frontendField];
          if (apiField) {
            apiChanges[apiField] = value;
          }
        }
        return { id, changes: apiChanges };
      });

      let batchResult = null;
      if (textUpdates.length > 0) {
        try {
          const response = await api.put("/items/batch-update", {
            updates: textUpdates,
          });
          batchResult = response.data?.data;
        } catch (error) {
          const errorMessage = error.response?.data?.message || "";
          const shouldFallback =
            errorMessage.toLowerCase().includes("invalid _id: batch-update") ||
            error.response?.status === 404;

          if (!shouldFallback) {
            showToast(errorMessage || "Batch update failed", "error");
            setIsSaving(false);
            return;
          }

          const fallbackResults = [];
          const fallbackErrors = [];
          for (const update of textUpdates) {
            try {
              const response = await api.put(
                `/items/${update.id}`,
                update.changes,
              );
              fallbackResults.push({
                id: update.id,
                data: response.data?.data,
              });
            } catch (fallbackError) {
              fallbackErrors.push({
                id: update.id,
                error: fallbackError.response?.data?.message || "Update failed",
              });
            }
          }

          batchResult = {
            totalUpdated: fallbackResults.length,
            totalFailed: fallbackErrors.length,
            results: fallbackResults,
            errors: fallbackErrors,
          };
        }
      }

      const imageResults = [];
      for (const itemId of Object.keys(imageFiles)) {
        const file = imageFiles[itemId];
        if (!file) continue;

        try {
          const formData = new FormData();
          formData.append("image", file);
          await api.put(`/items/${itemId}`, formData);
          imageResults.push({ id: itemId, success: true });
        } catch (error) {
          imageResults.push({
            id: itemId,
            success: false,
            error: error.response?.data?.message || "Image upload failed",
          });
        }
      }

      const totalUpdated =
        (batchResult?.totalUpdated || 0) +
        imageResults.filter((r) => r.success).length;
      const totalFailed =
        (batchResult?.totalFailed || 0) +
        imageResults.filter((r) => !r.success).length;

      if (totalFailed > 0 && totalUpdated > 0) {
        const failedIds = new Set([
          ...(batchResult?.errors || []).map((e) => e.id),
          ...imageResults.filter((r) => !r.success).map((r) => r.id),
        ]);

        setChangedItems((prev) => {
          const remaining = {};
          for (const [id, changes] of Object.entries(prev)) {
            if (failedIds.has(id)) remaining[id] = changes;
          }
          return remaining;
        });

        setImageFiles((prev) => {
          const remaining = {};
          for (const [id, file] of Object.entries(prev)) {
            if (failedIds.has(id)) remaining[id] = file;
          }
          return remaining;
        });

        setSaveResult({
          type: "partial",
          updated: totalUpdated,
          failed: totalFailed,
          errors: [
            ...(batchResult?.errors || []),
            ...imageResults.filter((r) => !r.success),
          ],
        });
        showToast(
          `${totalUpdated} items updated, ${totalFailed} failed. Failed items preserved for retry.`,
          "warning",
        );
      } else if (totalFailed > 0) {
        setSaveResult({
          type: "error",
          failed: totalFailed,
          errors: [
            ...(batchResult?.errors || []),
            ...imageResults.filter((r) => !r.success),
          ],
        });
        showToast("All updates failed. Changes preserved for retry.", "error");
      } else {
        setChangedItems({});
        setImageFiles({});
        setSaveResult({ type: "success", updated: totalUpdated });
        showToast(`${totalUpdated} item(s) updated successfully`, "success");
      }

      queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.invalidateQueries({ queryKey: ["items-low-stock"] });
    } catch {
      showToast("Unexpected error during save", "error");
    } finally {
      setIsSaving(false);
    }
  }, [hasChanges, changedItems, imageFiles, showToast, queryClient]);

  useSaveShortcut(saveAllChanges, hasChanges);

  if (itemsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        <span className="ml-3 text-gray-600">Loading items...</span>
      </div>
    );
  }

  if (itemsError) {
    return (
      <div className="text-center py-8 text-red-600">
        Failed to load items. Please try refreshing the page.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Update</h1>
          <p className="text-gray-600 text-sm">
            Edit items directly in the table. Modified cells are highlighted in
            purple.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <>
              <Button
                variant="outline"
                onClick={discardAllChanges}
                className="flex items-center gap-2"
                disabled={isSaving}
              >
                <FaUndo size={12} />
                Discard ({changeCount})
              </Button>
              <Button
                variant="primary"
                onClick={saveAllChanges}
                loading={isSaving}
                className="flex items-center gap-2"
              >
                <FaSave size={12} />
                Save Changes ({changeCount})
              </Button>
            </>
          )}
          <Button
            variant="outline"
            onClick={() => navigate("/inventory/item-master")}
            className="flex items-center gap-2"
          >
            Back to Item Master
          </Button>
        </div>
      </div>

      {saveResult && (
        <div
          className={`p-3 rounded-lg text-sm ${
            saveResult.type === "success" ?
              "bg-green-50 text-green-800 border border-green-200"
            : saveResult.type === "partial" ?
              "bg-yellow-50 text-yellow-800 border border-yellow-200"
            : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {saveResult.type === "success" && (
            <span>{saveResult.updated} item(s) updated successfully.</span>
          )}
          {saveResult.type === "partial" && (
            <span>
              {saveResult.updated} updated, {saveResult.failed} failed. Failed
              items are still editable below.
            </span>
          )}
          {saveResult.type === "error" && (
            <span>
              All {saveResult.failed} updates failed. Modify and retry.
            </span>
          )}
          <button
            onClick={() => setSaveResult(null)}
            className="ml-2 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="relative">
        <FaSearch className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search by name, item ID, barcode, or alias..."
          value={searchTerm}
          onChange={setSearchTerm}
          className="pl-10"
        />
      </div>

      {hasChanges && (
        <div className="bg-purple-50 border border-purple-200 rounded-lg px-4 py-2 text-sm text-purple-800 flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-purple-300" />
          <span>
            {Object.keys(changedItems).length} item(s) with text changes
            {Object.keys(imageFiles).length > 0 &&
              `, ${Object.keys(imageFiles).length} image(s) pending upload`}
          </span>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                #
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Item ID
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Barcode
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Item Name
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Alias
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Brand
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Department
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                HSN Code
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Type
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Sale Rate
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Purchase Rate
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                MRP Rate
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Stock Count
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Threshold
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Stock Status
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                GST %
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Discount %
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Description
              </th>
              <th className="px-4 py-3 text-left font-medium text-gray-900">
                Image
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedItems.map((item, index) => (
              <ItemRow
                key={item.id}
                item={item}
                index={startIndex + index}
                rowChanges={changedItems[item.id]}
                imageFile={imageFiles[item.id]}
                brands={brands}
                departments={departments}
                hsns={hsns}
                onFieldChange={updateField}
                onImageChange={handleImageChange}
                onPreviewImage={setSelectedImage}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between bg-white px-4 py-3 border-t rounded-b-lg">
          <div className="flex items-center text-sm text-gray-700">
            <span>
              Showing {startIndex + 1} to {Math.min(endIndex, filteredItems.length)} of {filteredItems.length} items
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 text-sm rounded ${
                      currentPage === pageNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {paginatedItems.length === 0 && !itemsLoading && (
        <div className="text-center py-8 text-gray-500">
          No items found matching your search criteria.
        </div>
      )}

      {hasChanges && (
        <div className="sticky bottom-0 bg-white border-t shadow-lg p-3 flex items-center justify-between rounded-t-lg">
          <span className="text-sm text-gray-600">
            {changeCount} unsaved change(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={discardAllChanges}
              disabled={isSaving}
            >
              <FaUndo size={10} className="mr-1" />
              Discard All
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={saveAllChanges}
              loading={isSaving}
            >
              <FaSave size={10} className="mr-1" />
              Save All Changes
            </Button>
          </div>
        </div>
      )}

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
    </div>
  );
};

export default ItemUpdate;
