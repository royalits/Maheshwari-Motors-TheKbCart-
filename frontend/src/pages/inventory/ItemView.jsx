import React, { useMemo, useState } from "react";
import { FaDownload, FaEye, FaImage, FaTimes } from "react-icons/fa";
import ItemQrPreview from "../../components/inventory/ItemQrPreview";
import { DataTable, Modal } from "../../components/common";
import { Button, SearchableSelect } from "../../components/ui";
import { usePermission } from "../../hooks/usePermission";
import { useAllBrands, useDepartments } from "../../hooks/useMasters";
import { useAllItems } from "../../hooks/useItems";
import { normalizeItem } from "../../services/apiUtils";
import useStore from "../../store";
import {
  downloadItemsQrPdf,
  downloadSingleItemQrLabel,
} from "../../utils/itemQr";

const ItemView = () => {
  const showToast = useStore((s) => s.showToast);
  const { isClient } = usePermission();
  const { data: rawItems = [], isLoading } = useAllItems();
  const { data: brands = [] } = useAllBrands();
  const { data: departments = [] } = useDepartments();

  const [selectedImage, setSelectedImage] = useState(null);
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [qrItem, setQrItem] = useState(null);
  const isClientUser = isClient();

  const items = useMemo(
    () =>
      rawItems.map((item) => {
        const normalized = normalizeItem(item);
        return {
          ...normalized,
          brandName:
            brands.find((brand) => String(brand.id) === String(normalized.brandId))
              ?.name || "",
          departmentName:
            departments.find(
              (department) =>
                String(department.id) === String(normalized.departmentId),
            )?.name || "",
        };
      }),
    [brands, departments, rawItems],
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
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
      }),
    [brandFilter, departmentFilter, items],
  );

  const selectedItems = useMemo(
    () => items.filter((item) => selectedItemIds.includes(String(item.id))),
    [items, selectedItemIds],
  );

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

  const columns = useMemo(() => {
    const imageColumn = {
      key: "itemMedia",
      label: "Image",
      render: (value) => (
        <div
          className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center cursor-pointer hover:bg-gray-200"
          onClick={() => value && setSelectedImage(value)}
        >
          {value ?
            <img
              src={value}
              alt="Item"
              className="w-full h-full object-cover rounded"
            />
          : <FaImage className="text-gray-400 text-sm" />}
        </div>
      ),
    };

    if (isClientUser) {
      return [
        {
          key: "itemName",
          label: "Name",
          render: (value) => (
            <span className="text-xs sm:text-sm font-medium">
              {value || "-"}
            </span>
          ),
        },
        {
          key: "item_id",
          label: "Item Code",
          render: (value) => (
            <span className="text-xs sm:text-sm">{value || "-"}</span>
          ),
        },
        {
          key: "mrp_rate",
          label: "MRP",
          render: (value) => (
            <span className="text-xs sm:text-sm">
              Rs. {Number(value || 0).toFixed(2)}
            </span>
          ),
        },
        {
          key: "stockCount",
          label: "Stock",
          render: (value) => (
            <span className="text-xs sm:text-sm">{Number(value || 0)}</span>
          ),
        },
        imageColumn,
      ];
    }

    return [
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
        key: "stockCount",
        label: "Stock",
        render: (value) => (
          <span className="text-xs sm:text-sm">{Number(value || 0)}</span>
        ),
      },
      {
        key: "itemName",
        label: "Item Name",
        render: (value) => (
          <span className="text-xs sm:text-sm font-medium">{value || "-"}</span>
        ),
      },
      {
        key: "departmentName",
        label: "Department",
        render: (value) => (
          <span className="text-xs sm:text-sm">{value || "N/A"}</span>
        ),
      },
      {
        key: "brandName",
        label: "Brand",
        render: (value) => (
          <span className="text-xs sm:text-sm">{value || "N/A"}</span>
        ),
      },
      {
        key: "amount",
        label: "Amount",
        render: (value) => (
          <span className="text-xs sm:text-sm">
            Rs. {Number(value || 0).toFixed(2)}
          </span>
        ),
      },
      imageColumn,
    ];
  }, [isClientUser]);

  const actions =
    isClientUser ?
      []
    : [
        {
          label: <FaEye size={10} className="sm:size-3 md:size-4" />,
          onClick: (item) => setQrItem(item),
          className:
            "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
        },
        {
          label: <FaDownload size={10} className="sm:size-3 md:size-4" />,
          onClick: (item) => handleDownloadItemQr(item),
          className:
            "bg-violet-600 text-white hover:bg-violet-700 p-1 sm:p-1.5 md:p-2 text-xs",
        },
      ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item View</h1>
          <p className="text-gray-600">
            View item QR labels and download them in bulk
          </p>
        </div>

        {!isClientUser && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setSelectedItemIds([])}
              disabled={selectedItemIds.length === 0}
            >
              Clear Selection
            </Button>
            <Button
              onClick={handleDownloadSelectedQr}
              disabled={selectedItemIds.length === 0}
            >
              Download Selected QR PDF
            </Button>
          </div>
        )}
      </div>

      {/* <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {isClientUser ?
          "Search items and view MRP with item images."
        : selectedItemIds.length > 0 ?
          `${selectedItemIds.length} item(s) selected. You can export them in one QR PDF with item names.`
        : "Open any item to see its QR. Use multi-select checkboxes to create a combined QR PDF."
        }
      </div> */}

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

      {isLoading ?
        <div className="rounded-lg border bg-white p-8 text-center text-sm text-slate-500">
          Loading items...
        </div>
      : <DataTable
          columns={columns}
          data={filteredItems}
          actions={actions}
          selectable={!isClientUser}
          selectedRowIds={selectedItemIds}
          onSelectedRowIdsChange={setSelectedItemIds}
          getRowId={(row) => row.id}
          searchable={true}
          searchPlaceholder="Search by ID, Item ID, Barcode, Item Name, Department, Brand, Amount..."
          sortable={true}
          pagination={true}
        />
      }

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

      <Modal
        isOpen={Boolean(qrItem)}
        onClose={() => setQrItem(null)}
        title="Item QR"
        size="lg"
      >
        {qrItem && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-[220px_1fr]">
              <ItemQrPreview item={qrItem} size={140} className="bg-white" />

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Item Name
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {qrItem.itemName}
                  </p>
                </div>

                <div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
                  <p>Item ID: {qrItem.item_id || "-"}</p>
                  <p>Barcode: {qrItem.barcode || "-"}</p>
                  <p>
                    Department:{" "}
                    {departments.find((item) => item.id === qrItem.departmentId)
                      ?.name || "-"}
                  </p>
                  <p>
                    Brand:{" "}
                    {brands.find((item) => item.id === qrItem.brandId)?.name ||
                      "-"}
                  </p>
                </div>

                <p className="text-sm text-slate-600">
                  This QR is unique for this item. You can download a small
                  single-label PDF or select multiple items and export them
                  together.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setQrItem(null)}>
                Close
              </Button>
              <Button
                onClick={() => handleDownloadItemQr(qrItem)}
                className="flex items-center gap-2"
              >
                <FaDownload />
                Download QR Label
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default ItemView;
