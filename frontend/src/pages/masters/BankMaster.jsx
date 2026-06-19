import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const INITIAL_FORM_DATA = {
  bank_name: '',
  bank_branch: '',
  ifsc_code: '',
  account_number: '',
  account_holder: '',
  upi_id: '',
  // bank_type stays implicitly "firm" on backend
  is_default: false,
};

const INITIAL_FORM_ERRORS = {
  bank_name: '',
  bank_branch: '',
  ifsc_code: '',
  account_number: '',
  account_holder: '',
  upi_id: '',
};

const collapseAndTrimSpaces = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const normalizeIfscInput = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .toUpperCase();

const normalizeAccountNumberInput = (value) =>
  String(value || '').replace(/\D/g, '').slice(0, 18);

const normalizeUpiInput = (value) =>
  String(value || '')
    .replace(/\s+/g, '')
    .trim();

const sanitizeBankFormData = (data) => ({
  bank_name: collapseAndTrimSpaces(data.bank_name),
  bank_branch: collapseAndTrimSpaces(data.bank_branch),
  ifsc_code: normalizeIfscInput(data.ifsc_code),
  account_number: normalizeAccountNumberInput(data.account_number),
  account_holder: collapseAndTrimSpaces(data.account_holder),
  upi_id: normalizeUpiInput(data.upi_id),
  is_default: Boolean(data.is_default),
});

const mapBankToFormData = (bank = {}) =>
  sanitizeBankFormData({
    bank_name: bank.bank_name || '',
    bank_branch: bank.bank_branch || '',
    ifsc_code: bank.ifsc_code || '',
    account_number: bank.account_number || '',
    account_holder: bank.account_holder || '',
    upi_id: bank.upi_id || '',
    is_default: Boolean(bank.is_default),
  });

const validateBankFormData = (data) => {
  const values = sanitizeBankFormData(data);
  const errors = { ...INITIAL_FORM_ERRORS };

  if (!values.bank_name) {
    errors.bank_name = 'Bank name is required';
  } else if (!/^[A-Za-z ]+$/.test(values.bank_name)) {
    errors.bank_name = 'Bank name must contain only alphabets and spaces';
  } else if (values.bank_name.length < 3) {
    errors.bank_name = 'Bank name must be at least 3 characters';
  }

  if (values.bank_branch && !/^[A-Za-z0-9 ]+$/.test(values.bank_branch)) {
    errors.bank_branch = 'Bank branch can contain only letters, numbers, and spaces';
  }

  if (!values.ifsc_code) {
    errors.ifsc_code = 'IFSC code is required';
  } else if (!/^[A-Z]{4}0\d{6}$/.test(values.ifsc_code)) {
    errors.ifsc_code = 'IFSC must be 4 uppercase letters, 0, followed by 6 digits';
  }

  if (!values.account_number) {
    errors.account_number = 'Account number is required';
  } else if (!/^\d{9,18}$/.test(values.account_number)) {
    errors.account_number = 'Account number must be 9 to 18 digits';
  }

  if (!values.account_holder) {
    errors.account_holder = 'Account holder name is required';
  } else if (!/^[A-Za-z ]+$/.test(values.account_holder)) {
    errors.account_holder = 'Account holder name must contain only alphabets and spaces';
  } else if (values.account_holder.length < 3) {
    errors.account_holder = 'Account holder name must be at least 3 characters';
  }

  if (values.upi_id && !/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(values.upi_id)) {
    errors.upi_id = 'UPI ID must be in format username@bank';
  }

  const firstError = Object.values(errors).find(Boolean) || '';
  const isValid = !firstError;

  return { values, errors, isValid, firstError };
};

const extractInputValue = (valueOrEvent, fallbackEvent) => {
  if (typeof valueOrEvent === 'string') return valueOrEvent;
  if (valueOrEvent && typeof valueOrEvent === 'object' && 'target' in valueOrEvent) {
    return valueOrEvent.target?.value ?? '';
  }
  if (fallbackEvent && typeof fallbackEvent === 'object' && 'target' in fallbackEvent) {
    return fallbackEvent.target?.value ?? '';
  }
  return '';
};

const BankMaster = () => {
  const { showToast } = useStore();
  const [banks, setBanks] = useState([]);
  const filterType = ''; // '' means all
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingBank, setEditingBank] = useState(null);
  const [viewingBank, setViewingBank] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, bank: null });
  const firstFieldRef = useRef(null);

  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isAddModalOpen || isEditModalOpen);
  useKeyboardShortcuts({
    onAdd: () => { resetFormState(); setIsAddModalOpen(true); },
    onRefresh: () => fetchBanks(),
  });
  const [formErrors, setFormErrors] = useState(INITIAL_FORM_ERRORS);

  const fetchBanks = async (type = filterType) => {
    try {
      const params = { page: 1, limit: 200 };
      if (type) params.bank_type = type;
      const response = await api.get('/banks', { params });
      const data = response.data?.data?.data || response.data?.data || [];
      setBanks(data.map(b => ({ ...b, id: b._id })));
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to load banks', 'error');
    }
  };

  const focusFirstField = () => {
    setTimeout(() => {
      if (firstFieldRef.current) {
        firstFieldRef.current.focus();
        if (typeof firstFieldRef.current.select === 'function') {
          firstFieldRef.current.select();
        }
      }
    }, 0);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBanks();
  }, []);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const resetFormState = () => {
    setFormData(INITIAL_FORM_DATA);
    setFormErrors(INITIAL_FORM_ERRORS);
  };

  const handleFormFieldChange = (field, rawValue) => {
    let value = rawValue;

    if (field === 'ifsc_code') {
      value = normalizeIfscInput(rawValue);
    } else if (field === 'account_number') {
      value = normalizeAccountNumberInput(rawValue);
    } else if (field === 'upi_id') {
      value = normalizeUpiInput(rawValue);
    }
    // Don't process bank_name, bank_branch, account_holder on every keystroke
    // Let user type freely, validation will handle it on submit

    setFormData((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const columns = [
    { key: 'id', label: 'ID', render: (val, row, index) => <span className="text-xs sm:text-sm">{index + 1}</span> },
    { key: 'bank_type', label: 'Type', render: (val) => <span className="text-xs sm:text-sm">{val ? (val.charAt(0).toUpperCase() + val.slice(1)) : 'Firm'}</span> },
    { key: 'bank_name', label: 'Bank Name', render: (val) => <span className="text-xs sm:text-sm font-medium">{val}</span> },
    { key: 'account_number', label: 'Account Number', render: (val) => <span className="text-xs sm:text-sm">{val}</span> },
    { key: 'ifsc_code', label: 'IFSC Code', render: (val) => <span className="text-xs sm:text-sm">{val || '-'}</span> },
    { key: 'is_default', label: 'Default', render: (val) => <span className={`px-2 py-1 text-xs rounded-full ${val ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>{val ? 'Yes' : 'No'}</span> }
  ];

  const actions = [
    { label: <FaEye size={10} className="sm:size-3 md:size-4" />, onClick: (bank) => { setViewingBank(bank); setIsViewModalOpen(true); }, className: 'bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs' },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (bank) => {
        setEditingBank(bank);
        setFormData(mapBankToFormData(bank));
        setFormErrors(INITIAL_FORM_ERRORS);
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs',
    },
    { label: <FaTrash size={10} className="sm:size-3 md:size-4" />, onClick: (bank) => setDeleteDialog({ isOpen: true, bank }), className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs' }
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { values, errors, isValid, firstError } = validateBankFormData(formData);
    setFormData(values);
    setFormErrors(errors);

    if (!isValid) {
      showToast(firstError || 'Please fix validation errors', 'error');
      return;
    }

    try {
      if (isEditModalOpen) {
        await api.put(`/banks/${editingBank.id}`, values);
        showToast('Bank updated successfully', 'success');
      } else {
        await api.post('/banks', values);
        showToast('Bank added successfully', 'success');
      }
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      }
      resetFormState();
      fetchBanks();
      if (!isEditModalOpen) {
        focusFirstField();
      }
    } catch (error) {
      showToast(error.response?.data?.message || 'Operation failed', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/banks/${deleteDialog.bank.id}`);
      showToast('Bank deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, bank: null });
      fetchBanks();
    } catch (error) {
      showToast(error.response?.data?.message || 'Failed to delete bank', 'error');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Bank/Cash Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage bank accounts</p>
        </div>
        <div className="flex items-center gap-3">
          {/* <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2 py-1 border border-gray-300 rounded-lg text-xs sm:text-sm"
          >
            <option value="">All Banks</option>
            <option value="firm">Firm Bank</option>
            <option value="party">Party Bank</option>
            <option value="supplier">Supplier Bank</option>
          </select> */}
          <Button onClick={() => { resetFormState(); setIsAddModalOpen(true); }} className="flex items-center gap-2 text-xs sm:text-sm">
            <FaPlus className="text-sm sm:text-base" />Add Bank
          </Button>
        </div>
      </div>

      <DataTable loading={false} columns={columns} data={banks} actions={actions} searchable sortable pagination />

      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          resetFormState();
        }}
        title={isEditModalOpen ? 'Edit Bank' : 'Add Bank'}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name *</label>
            <Input
              ref={firstFieldRef}
              value={formData.bank_name}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('bank_name', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter bank name"
              required
              allowSpaces={true}
              trimSpaces={false}
            />
            {formErrors.bank_name && <p className="mt-1 text-xs text-red-600">{formErrors.bank_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Branch</label>
            <Input
              value={formData.bank_branch}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('bank_branch', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter branch name"
              allowSpaces={true}
              trimSpaces={false}
            />
            {formErrors.bank_branch && <p className="mt-1 text-xs text-red-600">{formErrors.bank_branch}</p>}
          </div>
          {/* bank_type removed from form; backend will assign default 'firm' */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code *</label>
            <Input
              value={formData.ifsc_code}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('ifsc_code', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter IFSC code"
              required
              allowSpaces={false}
            />
            {formErrors.ifsc_code && <p className="mt-1 text-xs text-red-600">{formErrors.ifsc_code}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number *</label>
            <Input
              value={formData.account_number}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('account_number', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter account number"
              required
              allowSpaces={false}
            />
            {formErrors.account_number && <p className="mt-1 text-xs text-red-600">{formErrors.account_number}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder Name *</label>
            <Input
              value={formData.account_holder}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('account_holder', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter account holder name"
              required
              allowSpaces={true}
              trimSpaces={false}
            />
            {formErrors.account_holder && <p className="mt-1 text-xs text-red-600">{formErrors.account_holder}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
            <Input
              value={formData.upi_id}
              onChange={(valueOrEvent, fallbackEvent) =>
                handleFormFieldChange('upi_id', extractInputValue(valueOrEvent, fallbackEvent))
              }
              placeholder="Enter UPI ID (optional)"
              allowSpaces={false}
            />
            {formErrors.upi_id && <p className="mt-1 text-xs text-red-600">{formErrors.upi_id}</p>}
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={formData.is_default} onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })} className="rounded" />
            <label className="text-sm text-gray-700">Set as default bank</label>
          </div>
          <div className="flex gap-3 pt-4">
            <Button type="submit">{isEditModalOpen ? 'Update' : 'Add'} Bank</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
                resetFormState();
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, bank: null })} onConfirm={handleDelete} itemName={deleteDialog.bank?.bank_name} />

      <Modal isOpen={isViewModalOpen} onClose={() => { setIsViewModalOpen(false); setViewingBank(null); }} title="Bank Details" size="md">
        {viewingBank && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500">Bank Name</label>
                <p className="text-sm font-medium text-gray-900">{viewingBank.bank_name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Bank Type</label>
                <p className="text-sm text-gray-900">{viewingBank.bank_type ? viewingBank.bank_type.charAt(0).toUpperCase()+viewingBank.bank_type.slice(1) : 'Firm'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Bank Branch</label>
                <p className="text-sm text-gray-900">{viewingBank.bank_branch || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">IFSC Code</label>
                <p className="text-sm text-gray-900">{viewingBank.ifsc_code || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Account Number</label>
                <p className="text-sm text-gray-900">{viewingBank.account_number}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Account Holder</label>
                <p className="text-sm text-gray-900">{viewingBank.account_holder || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">UPI ID</label>
                <p className="text-sm text-gray-900">{viewingBank.upi_id || '-'}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500">Default Bank</label>
                <p className="text-sm text-gray-900">{viewingBank.is_default ? 'Yes' : 'No'}</p>
              </div>
            </div>
            <div className="flex justify-end pt-4">
              <Button variant="outline" onClick={() => { setIsViewModalOpen(false); setViewingBank(null); }}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BankMaster;
