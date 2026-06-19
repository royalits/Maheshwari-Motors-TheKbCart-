import React, { useState, useEffect, useRef } from "react";
import { FaPlus, FaEdit, FaTrash, FaTimes } from "react-icons/fa";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { getEntityId } from "../../services/apiUtils";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";

const LabelMaster = () => {
  const { showToast } = useStore();
  const [labels, setLabels] = useState([]);
  const [brands, setBrands] = useState([]);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLabel, setEditingLabel] = useState(null);
  const [newLabelName, setNewLabelName] = useState("");
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [brandSearchTerm, setBrandSearchTerm] = useState("");
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    label: null,
  });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const addNameRef = useRef(null);
  const editNameRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAddLabel();
    else if (isEditModalOpen) handleEditLabel();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => { setNewLabelName(""); setSelectedBrands([]); setBrandSearchTerm(""); setIsAddModalOpen(true); },
    onRefresh: () => fetchData(),
  });

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const fetchData = async (signal = null) => {
    setLoading(true);
    
    // Initialize empty states first
    setLabels([]);
    setBrands([]);
    
    let brandList = [];
    try {
      const brandRes = await api.get("/brands", {
        params: { page: 1, limit: 200 },
        ...(signal && { signal }),
      });
      brandList = listFromResponse(brandRes).map((b) => ({
        id: b._id || b.id,
        name: b.brand_name || b.name || "",
      }));
      setBrands(brandList);
    } catch (error) {
      if (error?.name !== "CanceledError") {
        showToast("Failed to load brands", "error");
      }
      setBrands([]);
    }

    try {
      const labelRes = await api.get("/labels", {
        params: { page: 1, limit: 200 },
        ...(signal && { signal }),
      });
      const labelList = listFromResponse(labelRes);

      // Fetch brands for each label
      const labelsWithBrands = await Promise.all(
        labelList.map(async (l) => {
          try {
            const brandsRes = await api.get(`/labels/${l._id || l.id}/brands`, {
              ...(signal && { signal }),
            });
            const labelBrands = listFromResponse(brandsRes).map((brand) => ({
              id: brand._id || brand.id,
              name: brand.brand_name || brand.name || "",
            }));
            return {
              id: l._id || l.id,
              name: l.name || "",
              brands: labelBrands,
            };
          } catch (error) {
            return {
              id: l._id || l.id,
              name: l.name || "",
              brands: [],
            };
          }
        }),
      );

      setLabels(labelsWithBrands);
    } catch (error) {
      if (error?.name !== "CanceledError") {
        showToast("Failed to load labels", "error");
      }
      setLabels([]);
    }
    
    // Use setTimeout to ensure state updates are processed
    setTimeout(() => {
      setLoading(false);
    }, 100);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAddModalOpen) return;
    const handle = setTimeout(() => {
      addNameRef.current?.focus();
      addNameRef.current?.select?.();
    }, 0);
    return () => clearTimeout(handle);
  }, [isAddModalOpen]);

  useEffect(() => {
    if (!isEditModalOpen) return;
    const handle = setTimeout(() => {
      editNameRef.current?.focus();
      editNameRef.current?.select?.();
    }, 0);
    return () => clearTimeout(handle);
  }, [isEditModalOpen]);

  const columns = [
    {
      key: "id",
      label: "Label ID",
      render: (val, row, index) => <span className="text-xs">{index + 1}</span>,
    },
    { key: "name", label: "Label Name" },
    {
      key: "brands",
      label: "Brands",
      render: (value) => `${value?.length || 0}`,
    },
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: async (label) => {
        setEditingLabel(label);
        setNewLabelName(label.name);
        
        try {
          const res = await api.get(`/labels/${label.id}`);
          const labelData = res?.data?.data;
          const brandDiscounts = labelData?.brand_discounts || [];
          const loadedBrands = brandDiscounts
            .map((bd) => {
              const brandId = getEntityId(bd?.brand_id);
              const name =
                bd?.brand_id?.name ||
                brands.find((b) => String(b.id) === String(brandId))?.name ||
                "";
              return brandId ? { id: brandId, name } : null;
            })
            .filter(Boolean);
          setSelectedBrands(loadedBrands);
        } catch (error) {
          showToast("Failed to load label brands", "error");
          setSelectedBrands([]);
        }
        
        setIsEditModalOpen(true);
      },
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (label) => setDeleteDialog({ isOpen: true, label }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  const payload = () => {
    const data = {
      name: newLabelName?.trim(),
      brand_discounts: selectedBrands
        .filter((b) => b && b.id)
        .map((b) => ({
          brand_id: b.id,
          disc1: {
            normal: 0,
            special: 0,
          },
          disc2: {
            normal: 0,
            special: 0,
          },
          item_discounts: [],
        })),
    };
    return data;
  };

  const handleAddLabel = async () => {
    if (submitting) return;

    if (!newLabelName?.trim()) {
      showToast("Label name is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const data = payload();
      console.log("Sending label data:", data);
      const response = await api.post("/labels", data);
      console.log("Label created:", response.data);
      showToast("Label added successfully", "success");
      setNewLabelName("");
      setSelectedBrands([]);
      fetchData();
      setTimeout(() => addNameRef.current?.focus(), 0);
    } catch (error) {
      console.error("Add label error:", error.response?.data || error);
      showToast(
        error?.response?.data?.message || "Failed to add label",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditLabel = async () => {
    if (!editingLabel?.id || submitting) return;

    if (!newLabelName?.trim()) {
      showToast("Label name is required", "error");
      return;
    }

    setSubmitting(true);
    try {
      const data = payload();
      console.log("Updating label:", editingLabel.id, data);
      const response = await api.put(`/labels/${editingLabel.id}`, data);
      console.log("Label updated:", response.data);
      showToast("Label updated successfully", "success");
      setIsEditModalOpen(false);
      setEditingLabel(null);
      setNewLabelName("");
      setSelectedBrands([]);
      fetchData();
    } catch (error) {
      console.error("Update label error:", error.response?.data || error);
      showToast(
        error?.response?.data?.message || "Failed to update label",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteLabel = async () => {
    if (!deleteDialog?.label?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/labels/${deleteDialog.label.id}`);
      showToast("Label deleted successfully", "success");
      setDeleteDialog({ isOpen: false, label: null });
      fetchData();
    } catch (error) {
      showToast(
        error?.response?.data?.message || "Failed to delete label",
        "error",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleBrandToggle = (brand) => {
    setSelectedBrands((prev) => {
      const exists = prev.find((b) => b.id === brand.id);
      if (exists) return prev.filter((b) => b.id !== brand.id);
      return [...prev, brand];
    });
  };

  const handleSelectAll = () => {
    const filteredBrands = brands.filter((brand) =>
      brand.name.toLowerCase().includes(brandSearchTerm.toLowerCase()),
    );
    const allFilteredSelected = filteredBrands.every((brand) =>
      selectedBrands.find((b) => b.id === brand.id),
    );

    if (allFilteredSelected) {
      setSelectedBrands((prev) =>
        prev.filter(
          (selected) =>
            !filteredBrands.find((filtered) => filtered.id === selected.id),
        ),
      );
    } else {
      const newSelections = filteredBrands.filter(
        (brand) => !selectedBrands.find((b) => b.id === brand.id),
      );
      setSelectedBrands((prev) => [...prev, ...newSelections]);
    }
  };

  const removeBrandFromLabel = (brandId) => {
    setSelectedBrands((prev) => prev.filter((b) => b.id !== brandId));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Label Master</h1>
          <p className="text-gray-600">Manage party labels</p>
        </div>
        <Button
          onClick={() => {
            setNewLabelName("");
            setSelectedBrands([]);
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <FaPlus />
          Add Label
        </Button>
      </div>

      <DataTable
        loading={loading}
        columns={columns}
        data={labels}
        actions={actions}
        searchable
        sortable
        pagination
      />

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add Label"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label Name
            </label>
            <input
              ref={addNameRef}
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brands in Label ({selectedBrands.length})</label>
            <div className="bg-gray-50 p-3 rounded-lg min-h-[100px] max-h-[200px] overflow-y-auto">
              {selectedBrands.length === 0 ? <p className="text-gray-500 text-sm">No brands selected</p> : (
                <div className="flex flex-wrap gap-2">{selectedBrands.map((brand) => <div key={brand.id} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"><span>{brand.name}</span><button onClick={() => removeBrandFromLabel(brand.id)} className="text-blue-600 hover:text-blue-800"><FaTimes size={12} /></button></div>)}</div>
              )}
            </div>
          </div> */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Brands
            </label>
            <div className="mb-3">
              <input
                placeholder="Search brands..."
                value={brandSearchTerm}
                onChange={(e) => setBrandSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {brands.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No brands available</p>
              ) : (
                <div>
                  <div className="p-3 border-b bg-gray-50">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          brands.filter((brand) =>
                            brand.name
                              .toLowerCase()
                              .includes(brandSearchTerm.toLowerCase()),
                          ).length > 0 &&
                          brands
                            .filter((brand) =>
                              brand.name
                                .toLowerCase()
                                .includes(brandSearchTerm.toLowerCase()),
                            )
                            .every((brand) =>
                              selectedBrands.find((b) => b.id === brand.id),
                            )
                        }
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">
                          Select All (
                          {
                            brands.filter((brand) =>
                              brand.name
                                .toLowerCase()
                                .includes(brandSearchTerm.toLowerCase()),
                            ).length
                          }
                          )
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="divide-y">
                    {brands
                      .filter((brand) =>
                        brand.name
                          .toLowerCase()
                          .includes(brandSearchTerm.toLowerCase()),
                      )
                      .sort((a, b) => {
                        const aSelected = selectedBrands.find(
                          (s) => s.id === a.id,
                        );
                        const bSelected = selectedBrands.find(
                          (s) => s.id === b.id,
                        );
                        if (aSelected && !bSelected) return -1;
                        if (!aSelected && bSelected) return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((brand) => {
                        const isSelected = selectedBrands.find(
                          (b) => b.id === brand.id,
                        );
                        return (
                          <div key={brand.id} className="p-3 hover:bg-gray-50">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!isSelected}
                                onChange={() => handleBrandToggle(brand)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">
                                  {brand.name}
                                </span>
                              </div>
                            </label>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddLabel} disabled={submitting}>
              Add Label
            </Button>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Edit Label"
        size="lg"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label Name
            </label>
            <input
              ref={editNameRef}
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brands in Label ({selectedBrands.length})</label>
            <div className="bg-gray-50 p-3 rounded-lg min-h-[100px] max-h-[200px] overflow-y-auto">
              {selectedBrands.length === 0 ? <p className="text-gray-500 text-sm">No brands selected</p> : (
                <div className="flex flex-wrap gap-2">{selectedBrands.map((brand) => <div key={brand.id} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"><span>{brand.name}</span><button onClick={() => removeBrandFromLabel(brand.id)} className="text-blue-600 hover:text-blue-800"><FaTimes size={12} /></button></div>)}</div>
              )}
            </div>
          </div> */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Brands
            </label>
            <div className="mb-3">
              <input
                placeholder="Search brands..."
                value={brandSearchTerm}
                onChange={(e) => setBrandSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {brands.length === 0 ? (
                <p className="text-gray-500 text-sm p-4">No brands available</p>
              ) : (
                <div>
                  <div className="p-3 border-b bg-gray-50">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={
                          brands.filter((brand) =>
                            brand.name
                              .toLowerCase()
                              .includes(brandSearchTerm.toLowerCase()),
                          ).length > 0 &&
                          brands
                            .filter((brand) =>
                              brand.name
                                .toLowerCase()
                                .includes(brandSearchTerm.toLowerCase()),
                            )
                            .every((brand) =>
                              selectedBrands.find((b) => b.id === brand.id),
                            )
                        }
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1">
                        <span className="font-medium text-gray-900">
                          Select All (
                          {
                            brands.filter((brand) =>
                              brand.name
                                .toLowerCase()
                                .includes(brandSearchTerm.toLowerCase()),
                            ).length
                          }
                          )
                        </span>
                      </div>
                    </label>
                  </div>
                  <div className="divide-y">
                    {brands
                      .filter((brand) =>
                        brand.name
                          .toLowerCase()
                          .includes(brandSearchTerm.toLowerCase()),
                      )
                      .sort((a, b) => {
                        const aSelected = selectedBrands.find(
                          (s) => s.id === a.id,
                        );
                        const bSelected = selectedBrands.find(
                          (s) => s.id === b.id,
                        );
                        if (aSelected && !bSelected) return -1;
                        if (!aSelected && bSelected) return 1;
                        return a.name.localeCompare(b.name);
                      })
                      .map((brand) => {
                        const isSelected = selectedBrands.find(
                          (b) => b.id === brand.id,
                        );
                        return (
                          <div key={brand.id} className="p-3 hover:bg-gray-50">
                            <label className="flex items-center gap-3 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!isSelected}
                                onChange={() => handleBrandToggle(brand)}
                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              />
                              <div className="flex-1">
                                <span className="font-medium text-gray-900">
                                  {brand.name}
                                </span>
                              </div>
                            </label>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={handleEditLabel} disabled={submitting}>
              Save Changes
            </Button>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, label: null })}
        onConfirm={handleDeleteLabel}
        itemName={deleteDialog.label?.name}
      />
    </div>
  );
};

export default LabelMaster;
