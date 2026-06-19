import React, { useState, useEffect, useRef } from "react";
import { FaPlus, FaPenToSquare, FaTrash, FaMoneyBillTransfer } from "react-icons/fa6";
import { Button } from "../../components/ui";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { getResponseData, getResponseList, getEntityId } from "../../services/apiUtils";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";

const toDisplay = (iso) => {
  if (!iso) return "";
  const [yyyy, mm, dd] = iso.split("-");
  return `${dd}/${mm}/${yyyy}`;
};

const toISO = (display) => {
  if (!display) return "";
  const parts = display.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const BillAutomation = () => {
  const { showToast } = useStore();
  const [automationRules, setAutomationRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [deleteRule, setDeleteRule] = useState(null);
  const [parties, setParties] = useState([]);
  const [brands, setBrands] = useState([]);
  const [labels, setLabels] = useState([]);
  const [formData, setFormData] = useState({
    party_id: "",
    party_name: "",
    brand_ids: [],
    label_id: "",
    from_date: "",
    to_date: "",
    amount: "",
    per_day_bill: 0,
    is_active: true,
  });

  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (isModalOpen) {
      setTimeout(() => firstFieldRef.current?.focus(), 20);
    }
  }, [isModalOpen]);

  const buildPartyMap = (partyList = []) =>
    new Map(partyList.map((party) => [party.id, party.name]));

  const buildBrandMap = (brandList = []) =>
    new Map(brandList.map((brand) => [brand.id, brand.name]));

  const buildLabelMap = (labelList = []) =>
    new Map(labelList.map((label) => [label.id, label.name]));

  const mapRule = (rule, partyMap, brandMap, labelMap) => {
    const partyId = getEntityId(
      rule?.party_id || rule?.contact_id || rule?.party,
    );
    const brandIds = Array.isArray(rule?.brand_ids) 
      ? rule.brand_ids.map(b => getEntityId(b))
      : [];
    const brandNames = brandIds
      .map(id => brandMap.get(id))
      .filter(Boolean);
    const labelId = getEntityId(rule?.label_id);
    return {
      id: getEntityId(rule),
      party_id: partyId,
      party_name:
        rule?.party_id?.name ||
        partyMap.get(partyId) ||
        rule?.party_name ||
        "",
      brand_ids: brandIds,
      brand_names: brandNames,
      label_id: labelId || "",
      label_name:
        (labelMap && labelId && labelMap.get(labelId)) ||
        rule?.label_name ||
        "",
      from_date: rule?.from_date,
      to_date: rule?.to_date,
      amount: Number(rule?.amount || rule?.fixed_amount || 0) || 0,
      per_day_bill: Number(rule?.per_day_bill || rule?.perDayBill || 0) || 0,
      is_active: rule?.is_active ?? rule?.enabled ?? true,
      created_at: rule?.createdAt || rule?.created_at || null,
    };
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setAutomationRules([]);
      setParties([]);
      setBrands([]);
      setLabels([]);
      
      try {
        const [partyRes, ruleRes, brandRes, labelRes] = await Promise.all([
          api.get("/contacts/parties", { params: { page: 1, limit: 200 } }),
          api.get("/automation-rules", { params: { page: 1, limit: 200 } }),
          api.get("/brands", { params: { page: 1, limit: 200 } }),
          api.get("/labels", { params: { page: 1, limit: 200 } }),
        ]);

        const partyList = getResponseList(partyRes).map((party) => ({
          id: getEntityId(party),
          name: party?.name || party?.party_name || party?.alias || "",
        }));
        setParties(partyList);

        const brandList = getResponseList(brandRes).map((brand) => ({
          id: getEntityId(brand),
          name: brand?.name || brand?.brand_name || "",
        }));
        setBrands(brandList);

        const labelList = getResponseList(labelRes).map((label) => ({
          id: getEntityId(label),
          name: label?.name || label?.label_name || "",
        }));
        setLabels(labelList);

        const partyMap = buildPartyMap(partyList);
        const brandMap = buildBrandMap(brandList);
        const labelMap = buildLabelMap(labelList);
        const rules = getResponseList(ruleRes).map((rule) =>
          mapRule(rule, partyMap, brandMap, labelMap),
        );
        setAutomationRules(rules);
      } catch (error) {
        console.error("Failed to fetch automation data", error);
        showToast("Failed to load automation rules", "error");
      }
      
      setTimeout(() => {
        setLoading(false);
      }, 100);
    };

    fetchData();
  }, [showToast]);

  const columns = [
    {
      key: "id",
      label: "S.No.",
      render: (_, __, index) => index + 1,
    },
    {
      key: "party_name",
      label: "Party Name",
    },
    {
      key: "brand_names",
      label: "Brands",
      render: (value) => value && value.length > 0 ? value.join(", ") : "-",
    },
    {
      key: "label_name",
      label: "Label",
      render: (value) => value || "-",
    },
    {
      key: "amount",
      label: "Target Amount",
      render: (value) =>
        value ? `₹ ${Number(value).toLocaleString("en-IN")}` : "-",
    },
    {
      key: "per_day_bill",
      label: "Bills/Day",
      render: (value) => {
        const count = Number(value) || 0;
        return (
          <span className={`px-2 py-1 text-xs rounded-full ${
            count > 0 ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"
          }`}>
            {count > 0 ? `${count} per day` : "No Limit"}
          </span>
        );
      },
    },
    {
      key: "from_date",
      label: "From Date",
      render: (value) => {
        if (!value) return "-";
        const [yyyy, mm, dd] = new Date(value).toISOString().split('T')[0].split('-');
        return `${dd}/${mm}/${yyyy}`;
      },
    },
    {
      key: "to_date",
      label: "To Date",
      render: (value) => {
        if (!value) return "-";
        const [yyyy, mm, dd] = new Date(value).toISOString().split('T')[0].split('-');
        return `${dd}/${mm}/${yyyy}`;
      },
    },
    {
      key: "is_active",
      label: "Auto Convert",
      render: (value, row) => (
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={value}
            onChange={(e) => handleToggleActive(row.id, e.target.checked)}
            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="ml-2 text-sm">
            {value ? "Enabled" : "Disabled"}
          </span>
        </div>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (_, row) => (
        <div className="flex gap-2">
          <button
            onClick={() => handleEdit(row)}
            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
            title="Edit"
          >
            <FaPenToSquare size={14} />
          </button>
          <button
            onClick={() => setDeleteRule(row)}
            className="p-1 text-red-600 hover:bg-red-50 rounded"
            title="Delete"
          >
            <FaTrash size={14} />
          </button>
        </div>
      ),
    },
  ];

  const handleToggleActive = async (ruleId, isActive) => {
    try {
      const response = await api.put(`/automation-rules/${ruleId}`, {
        is_active: isActive,
      });
      const partyMap = buildPartyMap(parties);
      const updatedRule = mapRule(getResponseData(response), partyMap);
      setAutomationRules((prev) =>
        prev.map((rule) => (rule.id === ruleId ? updatedRule : rule)),
      );
      showToast(
        `Automation ${isActive ? "enabled" : "disabled"} successfully`,
        "success",
      );
    } catch (error) {
      console.error("Failed to update automation rule", error);
      showToast("Failed to update automation rule", "error");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (
      !formData.party_id ||
      !formData.brand_ids || formData.brand_ids.length === 0 ||
      !formData.from_date ||
      !formData.to_date ||
      !formData.amount
    ) {
      showToast("Please fill all required fields", "error");
      return;
    }

    if (new Date(toISO(formData.from_date)) >= new Date(toISO(formData.to_date))) {
      showToast("To date must be after from date", "error");
      return;
    }

    if (Number(formData.amount) <= 0) {
      showToast("Amount must be a positive value", "error");
      return;
    }

    const selectedParty = parties.find(
      (p) => p.id?.toString() === formData.party_id?.toString(),
    );
    
    try {
      const payload = {
        party_id: formData.party_id,
        brand_ids: formData.brand_ids,
        label_id: formData.label_id || "",
        from_date: toISO(formData.from_date),
        to_date: toISO(formData.to_date),
        amount: Number(formData.amount),
        per_day_bill: Number(formData.per_day_bill) || 0,
        is_active: formData.is_active,
      };

      if (editingRule) {
        const response = await api.put(
          `/automation-rules/${editingRule.id}`,
          payload,
        );
        const partyMap = buildPartyMap(parties);
        const brandMap = buildBrandMap(brands);
        const labelMap = buildLabelMap(labels);
        const updatedRule = mapRule(getResponseData(response), partyMap, brandMap, labelMap);
        setAutomationRules((prev) =>
          prev.map((rule) =>
            rule.id === editingRule.id
              ? { ...updatedRule, party_name: selectedParty?.name || updatedRule.party_name }
              : rule,
          ),
        );
        showToast("Automation rule updated successfully", "success");
      } else {
        const response = await api.post("/automation-rules", payload);
        const partyMap = buildPartyMap(parties);
        const brandMap = buildBrandMap(brands);
        const labelMap = buildLabelMap(labels);
        const createdRule = mapRule(getResponseData(response), partyMap, brandMap, labelMap);
        setAutomationRules((prev) => [
          { ...createdRule, party_name: selectedParty?.name || createdRule.party_name },
          ...prev,
        ]);
        showToast("Automation rule added successfully", "success");
      }

      handleCloseModal();
    } catch (error) {
      console.error("Failed to save automation rule:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.message ||
        "Failed to save automation rule";
      showToast(errorMessage, "error");
    }
  };

  const handleEdit = (rule) => {
    const party = parties.find(
      (p) => p.id?.toString() === rule.party_id?.toString(),
    );
    setFormData({
      party_id: party?.id?.toString() || rule.party_id?.toString() || "",
      party_name: rule.party_name,
      brand_ids: rule.brand_ids || [],
      label_id: rule.label_id?.toString() || "",
      from_date: rule.from_date ? toDisplay(new Date(rule.from_date).toISOString().split("T")[0]) : "",
      to_date: rule.to_date ? toDisplay(new Date(rule.to_date).toISOString().split("T")[0]) : "",
      amount: rule.amount || "",
      per_day_bill: rule.per_day_bill || 0,
      is_active: rule.is_active,
    });
    setEditingRule(rule);
    setIsModalOpen(true);
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/automation-rules/${deleteRule.id}`);
      setAutomationRules((prev) =>
        prev.filter((rule) => rule.id !== deleteRule.id),
      );
      showToast("Automation rule deleted successfully", "success");
      setDeleteRule(null);
    } catch (error) {
      console.error("Failed to delete automation rule", error);
      showToast("Failed to delete automation rule", "error");
    }
  };

  useKeyboardShortcuts({
    onAdd: () => setIsModalOpen(true),
    enabled: !isModalOpen,
  });

  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isModalOpen);

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
    setFormData({
      party_id: "",
      party_name: "",
      brand_ids: [],
      label_id: "",
      from_date: "",
      to_date: "",
      amount: "",
      per_day_bill: 0,
      is_active: true,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FaMoneyBillTransfer className="text-blue-600" />
            Bill Automation
          </h1>
          <p className="text-gray-600">
            Automate challan to bill conversion for selected parties and date ranges
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2"
        >
          <FaPlus size={16} />
          Add Automation Rule
        </Button>
      </div>

      {/* Automation Rules Table */}
      <div className="bg-white rounded-lg border">
        <div className="p-4 border-b">
          <h3 className="font-medium text-gray-900">Automation Rules</h3>
          <p className="text-sm text-gray-600">
            Manage automatic challan to bill conversion rules
          </p>
        </div>
        <div className="p-4">
          <DataTable
            loading={loading}
            columns={columns}
            data={automationRules}
            searchable
            sortable
            emptyMessage="No automation rules found. Add your first rule to get started."
          />
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingRule ? "Edit Automation Rule" : "Add Automation Rule"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Party Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party <span className="text-red-500">*</span>
            </label>
            <select
              ref={firstFieldRef}
              value={formData.party_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, party_id: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">Select Party</option>
              {parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </div>

          {/* Brand Multi-Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brands <span className="text-red-500">*</span>
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
              {brands.length === 0 ? (
                <p className="text-sm text-gray-500">No brands available</p>
              ) : (
                <div className="space-y-2">
                  {brands.map((brand) => (
                    <label key={brand.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={formData.brand_ids.includes(brand.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setFormData((prev) => ({
                              ...prev,
                              brand_ids: [...prev.brand_ids, brand.id],
                            }));
                          } else {
                            setFormData((prev) => ({
                              ...prev,
                              brand_ids: prev.brand_ids.filter((id) => id !== brand.id),
                            }));
                          }
                        }}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">{brand.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {formData.brand_ids.length > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                {formData.brand_ids.length} brand(s) selected
              </p>
            )}
          </div>

          {/* Label Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
            </label>
            <select
              value={formData.label_id}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, label_id: e.target.value }))
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select Label (Optional)</option>
              {labels.map((label) => (
                <option key={label.id} value={label.id}>
                  {label.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Amount <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              min="1"
              step="0.01"
              value={formData.amount}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, amount: e.target.value }))
              }
              onWheel={(e) => e.target.blur()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter target amount for bill generation"
              required
            />
            {/* <p className="text-xs text-gray-500 mt-1">
              Bills will be generated to match this amount
            </p> */}
          </div>

          {/* Date Range */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                From Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                placeholder="dd/mm/yyyy"
                value={toISO(formData.from_date)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    from_date: toDisplay(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                To Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                placeholder="dd/mm/yyyy"
                value={toISO(formData.to_date)}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    to_date: toDisplay(e.target.value),
                  }))
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          </div>

          {/* Per Day Bill Count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Bills Per Day
            </label>
            <input
              type="number"
              min="0"
              max="100"
              value={formData.per_day_bill}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, per_day_bill: Number(e.target.value) || 0 }))
              }
              onWheel={(e) => e.target.blur()}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0 = Disabled, 1-100 = Bills per day"
            />
            {/* <p className="text-xs text-gray-500 mt-1">
              Set to 0 to disable per-day billing. Set to 3, 4, 5, etc. to generate that many bills per day.
              Rule will auto-disable when stock runs out.
            </p> */}
          </div>

          {/* Auto Convert Toggle */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={formData.is_active}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, is_active: e.target.checked }))
              }
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="is_active" className="text-sm font-medium text-gray-700">
              Enable automatic bill generation
            </label>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCloseModal}
            >
              Cancel
            </Button>
            <Button type="submit">
              {editingRule ? "Update Rule" : "Add Rule"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <DeleteConfirmDialog
        isOpen={!!deleteRule}
        onClose={() => setDeleteRule(null)}
        onConfirm={handleDelete}
        title="Delete Automation Rule"
        message={`Are you sure you want to delete the automation rule for "${deleteRule?.party_name}"?`}
      />
    </div>
  );
};

export default BillAutomation;
