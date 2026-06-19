import { useState, useEffect, useRef } from "react";
import { FaPlus, FaEdit, FaTrash, FaEye } from "react-icons/fa";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button, SearchableSelect } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import {
  getResponseList,
  getEntityId,
  normalizeContact,
} from "../../services/apiUtils";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Lakshadweep",
  "Puducherry",
  "Ladakh",
  "Jammu and Kashmir",
];

const INITIAL_FORM = {
  name: "",
  alias: "",
  phone: "",
  whatsapp_number: "",
  email: "",
  address: "",
  city: "",
  state: "",
  gstin: "",
  cin: "",
  reg_number: "",
  bank_id: "",
  bank_name: "",
  bank_branch: "",
  ifsc_code: "",
  account_number: "",
  account_holder: "",
  upi_id: "",
  label_id: "",
};

const AddSupplier = () => {
  const { showToast } = useStore();
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    supplier: null,
  });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [validationModal, setValidationModal] = useState({
    isOpen: false,
    errors: [],
  });
  const nameInputRef = useRef(null);

  const extractPAN = (gstin) => {
    if (!gstin || gstin.length < 15) return "";
    return gstin.substring(2, 12);
  };

  const mapSupplier = (contact) => {
    const normalized = normalizeContact(contact);
    const bankId =
      typeof contact.bank_id === "object"
        ? getEntityId(contact.bank_id)
        : contact.bank_id;
    return {
      id: normalized.id,
      name: normalized.name,
      alias: normalized.alias,
      phone: normalized.phone,
      whatsapp_number: normalized.whatsapp_number,
      email: normalized.email,
      address: normalized.address,
      city: normalized.city,
      state: normalized.state,
      gstin: normalized.gstin,
      cin: normalized.cin,
      reg_number: normalized.reg_number,
      bank_id: bankId,
      bank_details: typeof contact.bank_id === "object" ? contact.bank_id : null,
      bank_name: contact.bank_id?.bank_name || "",
      bank_branch: contact.bank_id?.bank_branch || "",
      ifsc_code: contact.bank_id?.ifsc_code || "",
      account_number: contact.bank_id?.account_number || "",
      account_holder: contact.bank_id?.account_holder || "",
      upi_id: contact.bank_id?.upi_id || "",
      label_id: getEntityId(contact.label_id) || normalized.label_id || null,
    };
  };

  useKeyboardShortcuts({
    onAdd: () => { setFormData(INITIAL_FORM); setIsAddModalOpen(true); },
    enabled: !isAddModalOpen && !isEditModalOpen,
  });

  useEffect(() => {
    const fetchSuppliers = async () => {
      setLoading(true);
      try {
        const response = await api.get("/contacts/suppliers", {
          params: { page: 1, limit: 200 },
        });
        const filteredSuppliers = getResponseList(response)
          .filter(supplier => {
            const name = supplier.name?.toLowerCase();
            return name !== 'cashbook' && name !== 'bankbook';
          })
          .map(mapSupplier);
        setSuppliers(filteredSuppliers);
      } catch {
        showToast("Failed to load suppliers", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchSuppliers();
  }, [showToast]);

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await api.get("/banks");
        setBanks(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch banks", error);
      }
    };
    fetchBanks();
  }, []);

  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const response = await api.get("/labels");
        setLabels(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch labels", error);
      }
    };
    fetchLabels();
  }, []);

  useEffect(() => {
    if (!isAddModalOpen && !isEditModalOpen) return;
    const handle = setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select?.();
    }, 0);
    return () => clearTimeout(handle);
  }, [isAddModalOpen, isEditModalOpen]);

  const columns = [
    {
      key: "id",
      label: "ID",
      width: "50px",
      render: (value, row, index) => (
        <span className="text-xs sm:text-sm">{index + 1}</span>
      ),
    },
    {
      key: "name",
      label: "Supplier Name",
      width: "180px",
      render: (value) => (
        <span className="text-xs sm:text-sm font-medium truncate">{value}</span>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      width: "120px",
      render: (value) => <span className="text-xs sm:text-sm">{value}</span>,
    },
    {
      key: "email",
      label: "Email",
      width: "160px",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">
          {value ? value.substring(0, 15) + "..." : "-"}
        </span>
      ),
    },
    {
      key: "city",
      label: "City",
      width: "160px",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">{value}</span>
      ),
    },
    {
      key: "state",
      label: "State",
      width: "160px",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">{value}</span>
      ),
    },
    {
      key: "gstin",
      label: "GSTIN",
      width: "160px",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">{value}</span>
      ),
    },
  ];

  const actions = [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (supplier) => {
        setSelectedSupplier(supplier);
        setIsViewModalOpen(true);
      },
      className:
        "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (supplier) => {
        // Find the bank details for this supplier
        const bankDetails = supplier.bank_details ||
          banks.find((b) => getEntityId(b) === supplier.bank_id);

        // Populate form data with supplier info and bank details
        const editFormData = {
          name: supplier.name || "",
          alias: supplier.alias || "",
          phone: supplier.phone || "",
          whatsapp_number: supplier.whatsapp_number || "",
          email: supplier.email || "",
          address: supplier.address || "",
          city: supplier.city || "",
          state: supplier.state || "",
          gstin: supplier.gstin || "",
          cin: supplier.cin || "",
          reg_number: supplier.reg_number || "",
          bank_id: supplier.bank_id || "",
          bank_name: supplier.bank_name || bankDetails?.bank_name || "",
          bank_branch: supplier.bank_branch || bankDetails?.bank_branch || "",
          ifsc_code: supplier.ifsc_code || bankDetails?.ifsc_code || "",
          account_number: supplier.account_number || bankDetails?.account_number || "",
          account_holder: supplier.account_holder || bankDetails?.account_holder || "",
          upi_id: supplier.upi_id || bankDetails?.upi_id || "",
          label_id: supplier.label_id || "",
        };

        setSelectedSupplier(supplier);
        setFormData(editFormData);
        setIsEditModalOpen(true);
      },
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (supplier) => setDeleteDialog({ isOpen: true, supplier }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Handle number fields with validation
    if (name === "phone" || name === "whatsapp_number") {
      // Only allow numbers and limit to 10 digits
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData({ ...formData, [name]: numericValue });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const errors = [];
    if (!formData.name?.trim()) errors.push("Supplier Name is required");
    if (!formData.phone?.trim()) errors.push("Phone Number is required");

    // Prevent cashbook/bankbook names
    const supplierName = formData.name?.trim().toLowerCase();
    if (supplierName === 'cashbook' || supplierName === 'bankbook') {
      errors.push('Supplier name cannot be "cashbook" or "bankbook"');
    }

    // CIN validation (optional but if filled must be valid)
    if (formData.cin?.trim()) {
      const cinRegex = /^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/;
      if (!cinRegex.test(formData.cin.trim())) {
        errors.push('CIN must be in valid format (e.g. L17110MH1973PLC019786)');
      }
    }

    let cleanPhone = formData.phone ? formData.phone.replace(/\D/g, "") : "";
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
    if (cleanPhone && !/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      errors.push(
        "Phone number must be a valid 10-digit Indian number (starts with 6-9)",
      );
    }

    if (errors.length > 0) {
      setValidationModal({ isOpen: true, errors });
      showToast("Please fill all required fields", "error");
      return;
    }

    const payload = {
      name: formData.name,
      alias: formData.alias || undefined,
      type: "supplier",
      phone: cleanPhone || undefined,
      whatsapp_number: formData.whatsapp_number || undefined,
      email: formData.email || undefined,
      address: formData.address || undefined,
      city: formData.city || undefined,
      state: formData.state || undefined,
      gstin: formData.gstin ? formData.gstin.toUpperCase() : undefined,
      cin: formData.cin || undefined,
      reg_number: formData.reg_number || undefined,
      bank_id: formData.bank_id || undefined,
      bank_name: formData.bank_name || undefined,
      bank_branch: formData.bank_branch || undefined,
      ifsc_code: formData.ifsc_code || undefined,
      account_number: formData.account_number || undefined,
      account_holder: formData.account_holder || undefined,
      upi_id: formData.upi_id || undefined,
      label_id: formData.label_id || undefined,
    };

    try {
      if (isEditModalOpen) {
        await api.put(`/contacts/${selectedSupplier.id}`, payload);
        showToast("Supplier updated successfully", "success");
      } else {
        await api.post("/contacts", payload);
        showToast("Supplier created successfully", "success");
      }

      const response = await api.get("/contacts/suppliers", {
        params: { page: 1, limit: 200 },
      });
      const filteredSuppliers = getResponseList(response)
        .filter(supplier => {
          const name = supplier.name?.toLowerCase();
          return name !== 'cashbook' && name !== 'bankbook';
        })
        .map(mapSupplier);
      setSuppliers(filteredSuppliers);

      setFormData(INITIAL_FORM);
      setSelectedSupplier(null);
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      } else {
        setIsAddModalOpen(true);
        setTimeout(() => {
          nameInputRef.current?.focus();
          nameInputRef.current?.select?.();
        }, 0);
      }
    } catch (error) {
      const msg = error.response?.data?.message || "Operation failed";
      const details = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors.join(", ")
        : "";
      showToast(details ? `${msg}: ${details}` : msg, "error");
    }
  };

  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isAddModalOpen || isEditModalOpen);

  const handleDelete = async () => {
    if (!deleteDialog.supplier) return;
    try {
      await api.delete(`/contacts/${deleteDialog.supplier.id}`);
      showToast("Supplier deleted successfully", "success");
      setSuppliers(suppliers.filter((s) => s.id !== deleteDialog.supplier.id));
      setDeleteDialog({ isOpen: false, supplier: null });
    } catch (error) {
      const msg = error.response?.data?.message || "Failed to delete supplier";
      showToast(msg, "error");
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Creditors ( Purchasers) Master
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage suppliers</p>
        </div>
        <Button
          onClick={() => {
            setFormData(INITIAL_FORM);
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2 text-xs sm:text-sm"
        >
          <FaPlus className="text-sm sm:text-base" />
          Add Supplier
        </Button>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={loading}
          columns={columns}
          data={suppliers}
          actions={actions}
          searchable
          sortable
          pagination
          minWidth="750px"
          className="text-xs sm:text-sm"
        />
      </div>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, supplier: null })}
        onConfirm={handleDelete}
        itemName={deleteDialog.supplier?.name}
      />

      <div className={validationModal.isOpen ? "relative z-[9999]" : ""}>
        <Modal
          isOpen={validationModal.isOpen}
          onClose={() => setValidationModal({ isOpen: false, errors: [] })}
          title="Validation Failed"
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-semibold mb-2">
                Please fix the following errors:
              </h3>
              <ul className="list-disc list-inside space-y-1">
                {validationModal.errors.map((error, index) => (
                  <li key={index} className="text-red-700 text-sm">
                    {error}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() =>
                  setValidationModal({ isOpen: false, errors: [] })
                }
              >
                OK
              </Button>
            </div>
          </div>
        </Modal>
      </div>

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedSupplier(null);
        }}
        title="Supplier Details"
        size="lg"
      >
        {selectedSupplier && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Supplier Name
                </label>
                <p className="text-sm text-gray-900">{selectedSupplier.name}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Alias
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.alias || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.phone}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  WhatsApp Number
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.whatsapp_number || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.email}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  GST Number
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.gstin || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  PAN Number
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.gstin
                    ? extractPAN(selectedSupplier.gstin)
                    : "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  CIN
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.cin || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Reg Number
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.reg_number || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Bank Name
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.bank_name || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Bank Branch
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.bank_branch || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  IFSC Code
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.ifsc_code || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  Label
                </label>
                <p className="text-sm text-gray-900">
                  {labels.find((l) => getEntityId(l) === selectedSupplier.label_id)
                    ?.name || "N/A"}
                </p>
              </div>
              {/* <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Account Number</label><p className="text-sm text-gray-900">{selectedSupplier.bank_details?.account_number || banks.find(b => getEntityId(b) === selectedSupplier.bank_id)?.account_number || 'N/A'}</p></div> */}

              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  City
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.city || "N/A"}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <p className="text-sm text-gray-900">
                  {selectedSupplier.state || "N/A"}
                </p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">
                Address
              </label>
              <p className="text-sm text-gray-900">
                {selectedSupplier.address}
              </p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsViewModalOpen(false);
                  setSelectedSupplier(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedSupplier(null);
          setFormData(INITIAL_FORM);
        }}
        title={isEditModalOpen ? "Edit Supplier" : "Add New Supplier"}
        size="md"
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[70vh] overflow-y-auto"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Supplier Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameInputRef}
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter supplier name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Alias
              </label>
              <input
                type="text"
                name="alias"
                value={formData.alias}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter alias (optional)"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Phone"
                maxLength="10"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                WhatsApp Number
              </label>
              <input
                type="tel"
                name="whatsapp_number"
                value={formData.whatsapp_number}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="WhatsApp Number"
                maxLength="10"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="contact@example.com"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                GST Number
              </label>
              <input
                type="text"
                name="gstin"
                value={formData.gstin}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="GST Number"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                PAN Number
              </label>
              <input
                type="text"
                value={formData.gstin ? extractPAN(formData.gstin) : ""}
                disabled
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100"
                placeholder="Auto-filled from GST"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Address
            </label>
            <textarea
              name="address"
              value={formData.address}
              onChange={handleInputChange}
              rows="2"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter complete address"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                name="city"
                value={formData.city}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="City"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                State
              </label>
              <SearchableSelect
                value={formData.state}
                onChange={(value) => handleInputChange({ target: { name: "state", value } })}
                placeholder="Select State"
                searchPlaceholder="Search state..."
                options={INDIAN_STATES.map((state) => ({ value: state, label: state }))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                CIN
              </label>
              <input
                type="text"
                name="cin"
                value={formData.cin}
                onChange={handleInputChange}
                maxLength={21}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                  formData.cin?.trim() && !/^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/.test(formData.cin.trim())
                    ? 'border-red-400 bg-red-50'
                    : 'border-gray-300'
                }`}
                placeholder="e.g. L17110MH1973PLC019786"
              />
              {formData.cin?.trim() && !/^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/.test(formData.cin.trim()) && (
                <p className="text-xs text-red-500 mt-1">Invalid CIN format</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reg Number
              </label>
              <input
                type="text"
                name="reg_number"
                value={formData.reg_number}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Registration Number"
              />
            </div>
          </div>
          {/* <div><label className="block text-sm font-medium text-gray-700 mb-1">Bank</label><select name="bank_id" value={formData.bank_id} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"><option value="">Select Bank</option>{banks.map(bank => <option key={getEntityId(bank)} value={getEntityId(bank)}>{bank.bank_name} - {bank.account_number}</option>)}</select></div> */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Name
              </label>
              <input
                type="text"
                name="bank_name"
                value={formData.bank_name}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter bank name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Branch
              </label>
              <input
                type="text"
                name="bank_branch"
                value={formData.bank_branch}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter branch name"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                name="ifsc_code"
                value={formData.ifsc_code}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter IFSC code"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Number
              </label>
              <input
                type="text"
                name="account_number"
                value={formData.account_number}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter account number"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Account Holder
              </label>
              <input
                type="text"
                name="account_holder"
                value={formData.account_holder}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter account holder name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UPI ID
              </label>
              <input
                type="text"
                name="upi_id"
                value={formData.upi_id}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter UPI ID"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
            </label>
            <SearchableSelect
              value={formData.label_id}
              onChange={(value) => handleInputChange({ target: { name: "label_id", value } })}
              placeholder="Select Label"
              searchPlaceholder="Search label..."
              options={labels.map((label, index) => ({
                value: getEntityId(label),
                label: label.name,
                
              }))}
            />
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
                setSelectedSupplier(null);
                setFormData(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditModalOpen ? "Update Supplier" : "Add Supplier"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AddSupplier;
