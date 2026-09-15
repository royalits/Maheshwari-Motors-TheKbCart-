import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, SearchableSelect } from '../../components/ui';

import useStore from '../../store';

import api from '../../services/axiosInstance';
import { getResponseData, getResponseList, getEntityId, normalizeContact, fetchAllPages } from '../../services/apiUtils';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa", "Gujarat", "Haryana", 
  "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", 
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", 
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Andaman and Nicobar Islands", "Chandigarh", 
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Lakshadweep", "Puducherry", "Ladakh", "Jammu and Kashmir"
];

const INITIAL_FORM = {
  name: '',
  alias: '',
  phone: '',
  whatsapp_number: '',
  email: '',
  address: '',
  city: '',
  state: '',
  gstin: '',
  is_gst: 0,
  cin: '',
  reg_number: '',
  bank_id: '',
  bank_name: '',
  bank_branch: '',
  ifsc_code: '',
  account_number: '',
  account_holder: '',
  upi_id: '',
  transport_charge: '',
  due_days: 0,
  transport_id: '',
  area_id: '',
  agent: '',
  label_id: ''
};

const PartyMaster = () => {
  const { showToast, user } = useStore();
  const [parties, setParties] = useState([]);
  const [agents, setAgents] = useState([]);
  const [transports, setTransports] = useState([]);
  const [areas, setAreas] = useState([]);
  const [banks, setBanks] = useState([]);
  const [labels, setLabels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, party: null });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);

  const activeFirmType = localStorage.getItem("firm_type") || "";
  const activeFirm =
    activeFirmType === "GST" ? user?.gst_firm :
    activeFirmType === "NON_GST" || activeFirmType === "NONGST" ? user?.nongst_firm :
    user?.gst_firm || user?.nongst_firm || {};
  const defaultFirmState = activeFirm?.state || "";

  const resetForm = () => {
    setFormData({
      ...INITIAL_FORM,
      state: defaultFirmState,
    });
  };

  const [formData, setFormData] = useState({
    ...INITIAL_FORM,
    state: defaultFirmState,
  });
  const [validationModal, setValidationModal] = useState({ isOpen: false, errors: [] });
  const firstFieldRef = useRef(null);

  useEffect(() => {
    if (defaultFirmState && !formData.state && !selectedParty) {
      setFormData((prev) => ({ ...prev, state: defaultFirmState }));
    }
  }, [defaultFirmState, selectedParty]);
  useKeyboardShortcuts({
    onAdd: () => { resetForm(); setIsAddModalOpen(true); },
    onRefresh: () => window.location.reload(),
  });

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

  // Extract PAN from GSTIN (characters 3-12)
  const extractPAN = (gstin) => {
    if (!gstin || gstin.length < 15) return '';
    return gstin.substring(2, 12);
  };

  const mapParty = (contact) => {
    const normalized = normalizeContact(contact);
    const bankDetails =
      contact.bank_id &&
      typeof contact.bank_id === 'object' &&
      (contact.bank_id._id || contact.bank_id.id)
        ? contact.bank_id
        : null;
    const bankId = bankDetails
      ? getEntityId(bankDetails)
      : (typeof contact.bank_id === 'string' ? contact.bank_id : '');
    const labelId = getEntityId(contact.label_id) || getEntityId(contact.label_ids?.[0]);
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
      contact_type: normalized.type || 'party',
      is_gst: normalized.is_gst,
      cin: normalized.cin,
      reg_number: normalized.reg_number,
      bank_id: bankId,
      bank_details: bankDetails,
      bank_name: bankDetails?.bank_name || normalized.bank_name || '',
      bank_branch: bankDetails?.bank_branch || normalized.bank_branch || '',
      ifsc_code: bankDetails?.ifsc_code || normalized.ifsc_code || '',
      account_number: bankDetails?.account_number || normalized.account_number || '',
      account_holder: bankDetails?.account_holder || '',
      upi_id: bankDetails?.upi_id || '',
      transport_charge: normalized.transport_charge,
      due_days: normalized.due_days || 0,
      transport_id: normalized.transport_id,
      area_id: normalized.area_id,
      agent: normalized.agent_id,
      label_id: labelId
    };
  };

  // Fetch parties from backend
  useEffect(() => {
    const fetchParties = async () => {
      setLoading(true);
      try {
        const list = await fetchAllPages(api, '/contacts/parties');
        const filteredParties = list
          .filter(party => {
            const name = party.name?.toLowerCase();
            return name !== 'cashbook' && name !== 'bankbook';
          })
          .map(mapParty);
        setParties(filteredParties);
      } catch (error) {
        console.error("Failed to fetch parties", error);
        showToast("Failed to load parties", "error");
      } finally {
        setLoading(false);
      }
    };
    fetchParties();
  }, [showToast]);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  // Fetch labels
  useEffect(() => {
    const fetchLabels = async () => {
      try {
        const labelRes = await api.get('/labels', { params: { page: 1, limit: 200 } });
        const labelsData = getResponseList(labelRes).map(label => ({
          _id: getEntityId(label),
          name: label.name || label.label_name,
          category_id: getEntityId(label.category_id)
        }));
        setLabels(labelsData);
      } catch (error) {
        console.error("Failed to fetch labels", error);
      }
    };
    fetchLabels();
  }, []);

  // Fetch agents
  useEffect(() => {
    const fetchAgents = async () => {
      try {
        const response = await api.get('/agents');
        setAgents(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch agents", error);
      }
    };
    fetchAgents();
  }, []);

  // Fetch transports
  useEffect(() => {
    const fetchTransports = async () => {
      try {
        const response = await api.get('/transports');
        setTransports(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch transports", error);
      }
    };
    fetchTransports();
  }, []);

  // Fetch areas
  useEffect(() => {
    const fetchAreas = async () => {
      try {
        const response = await api.get('/areas');
        setAreas(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch areas", error);
      }
    };
    fetchAreas();
  }, []);

  // Fetch banks
  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await api.get('/banks');
        setBanks(getResponseList(response));
      } catch (error) {
        console.error("Failed to fetch banks", error);
      }
    };
    fetchBanks();
  }, []);

  const columns = [
    {
      key: 'id',
      label: 'ID',
      width: '50px',
      render: (value, row, index) => <span className="text-xs sm:text-sm">{index + 1}</span>
    },
    {
      key: 'name',
      label: 'Party Name',
      width: '180px',
      render: (value) => <span className="text-xs sm:text-sm font-medium truncate">{value}</span>
    },
    {
      key: 'is_gst',
      label: 'Type',
      width: '80px',
      render: (value) => (
        <span className={`px-2 py-1 text-xs rounded-full ${
          value === 1 ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'
        }`}>
          {value === 1 ? '1' : '0'}
        </span>
      )
    },
    {
      key: 'phone',
      label: 'Phone',
      width: '120px',
      render: (value) => <span className="text-xs sm:text-sm">{value}</span>
    },
    {
      key: 'email',
      label: 'Email',
      width: '160px',
      render: (value) => <span className="text-xs sm:text-sm truncate">{value}</span>
    },
    {
      key: 'gstin',
      label: 'GST No',
      render: (value) => <span className="text-xs sm:text-sm truncate">{value || 'N/A'}</span>,
      width: '130px'
    },
    {
      key: 'due_days',
      label: 'Credit (Days)',
      render: (value) => <span className="text-xs sm:text-sm font-medium">{value ? `${value} Days` : '0 (No Credit)'}</span>,
      width: '110px'
    }
  ];

  const actions = [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (party) => {
        setSelectedParty(party);
        setIsViewModalOpen(true);
      },
      className: 'bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (party) => {
        const resolvedBank =
          party.bank_details ||
          banks.find((b) => getEntityId(b) === party.bank_id) ||
          {};
        setSelectedParty(party);
        setFormData({
          name: party.name || '',
          alias: party.alias || '',
          phone: party.phone || '',
          whatsapp_number: party.whatsapp_number || '',
          email: party.email || '',
          address: party.address || '',
          city: party.city || '',
          state: party.state || '',
          gstin: party.gstin || '',
          is_gst: party.is_gst || 0,
          cin: party.cin || '',
          reg_number: party.reg_number || '',
          bank_id: party.bank_id || '',
          bank_name: resolvedBank.bank_name || party.bank_name || '',
          bank_branch: resolvedBank.bank_branch || party.bank_branch || '',
          ifsc_code: resolvedBank.ifsc_code || party.ifsc_code || '',
          account_number: resolvedBank.account_number || party.account_number || '',
          account_holder: resolvedBank.account_holder || party.account_holder || '',
          upi_id: resolvedBank.upi_id || party.upi_id || '',
          transport_charge: party.transport_charge || '',
          due_days: party.due_days || 0,
          transport_id: party.transport_id || '',
          area_id: party.area_id || '',
          agent: party.agent || '',
          label_id: party.label_id || ''
        });
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (party) => setDeleteDialog({ isOpen: true, party }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ];


  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = [];
    if (!formData.name?.trim()) errors.push('Party Name is required');
    if (!formData.phone?.trim()) errors.push('Phone Number is required');

    // CIN validation (optional field but if filled must be valid)
    if (formData.cin?.trim()) {
      const cinRegex = /^[LUlu][0-9]{5}[A-Za-z]{2}[0-9]{4}[A-Za-z]{3}[0-9]{6}$/;
      if (!cinRegex.test(formData.cin.trim())) {
        errors.push('CIN must be in valid format (e.g. L17110MH1973PLC019786)');
      }
    }
    
    // Prevent cashbook/bankbook names
    const partyName = formData.name?.trim().toLowerCase();
    if (partyName === 'cashbook' || partyName === 'bankbook') {
      errors.push('Party name cannot be "cashbook" or "bankbook"');
    }
    const selectedLabel = formData.label_id
      ? labels.find((label) => label._id === formData.label_id)
      : null;
    if (formData.label_id && !selectedLabel) {
      errors.push('Selected label is invalid. Please reselect the label.');
    }
    // agent is optional per user request (was previously required)
    
    let cleanPhone = formData.phone ? formData.phone.replace(/\D/g, '') : '';
    if (cleanPhone.length > 10) cleanPhone = cleanPhone.slice(-10);
    if (cleanPhone && !/^[6-9][0-9]{9}$/.test(cleanPhone)) {
      errors.push('Phone number must be a valid 10-digit Indian number (starts with 6-9)');
    }
    
    if (errors.length > 0) {
      setValidationModal({ isOpen: true, errors });
      showToast('Please fill all required fields', 'error');
      return;
    }

    const payload = {
      name: formData.name,
      type: 'party',
      is_gst: Number(formData.is_gst) === 1 ? 1 : 0
    };
    if (formData.alias) payload.alias = formData.alias;
    if (cleanPhone) payload.phone = cleanPhone;
    if (formData.whatsapp_number) payload.whatsapp_number = formData.whatsapp_number;
    if (formData.email) payload.email = formData.email;
    if (formData.address) payload.address = formData.address;
    if (formData.city) payload.city = formData.city;
    if (formData.state) payload.state = formData.state;
    if (formData.gstin) payload.gstin = formData.gstin.toUpperCase();
    if (formData.cin) payload.cin = formData.cin;
    if (formData.reg_number) payload.reg_number = formData.reg_number;
    if (formData.transport_charge) payload.transport_charge = formData.transport_charge;
    else payload.transport_charge = 0;
    payload.due_days = Number(formData.due_days) || 0;
    if (formData.transport_id && formData.transport_id.trim() !== '') payload.transport_id = formData.transport_id;
    if (formData.area_id && formData.area_id.trim() !== '') payload.area_id = formData.area_id;
    if (formData.agent && formData.agent.trim() !== '') payload.agent_id = formData.agent;
    if (formData.label_id && formData.label_id !== '') {
      payload.label_id = formData.label_id;
      payload.label_ids = [formData.label_id];
      if (selectedLabel?.category_id) {
        payload.category_id = selectedLabel.category_id;
      }
    } else {
      payload.label_ids = [];
    }

    if (formData.bank_id?.trim()) payload.bank_id = formData.bank_id.trim();
    if (formData.bank_name?.trim()) payload.bank_name = formData.bank_name.trim();
    if (formData.bank_branch?.trim()) payload.bank_branch = formData.bank_branch.trim();
    if (formData.ifsc_code?.trim()) payload.ifsc_code = formData.ifsc_code.trim();
    if (formData.account_number?.trim()) payload.account_number = formData.account_number.trim();
    if (formData.account_holder?.trim()) payload.account_holder_name = formData.account_holder.trim();
    if (formData.upi_id?.trim()) payload.upi_id = formData.upi_id.trim();

    console.log('Submitting payload:', payload);

    try {
      if (isEditModalOpen) {
        console.log('Editing party:', selectedParty.id);
        await api.put(`/contacts/${selectedParty.id}`, payload);
        showToast('Party updated successfully', 'success');
      } else {
        console.log('Creating new party');
        await api.post('/contacts', payload);
        showToast('Party created successfully', 'success');
      }
      
      // Refresh lists so UI always shows latest linked bank details
      const [partyList, bankList] = await Promise.all([
        fetchAllPages(api, '/contacts/parties'),
        fetchAllPages(api, '/banks')
      ]);
      const filteredParties = partyList
        .filter(party => {
          const name = party.name?.toLowerCase();
          return name !== 'cashbook' && name !== 'bankbook';
        })
        .map(mapParty);
      setParties(filteredParties);
      setBanks(bankList);
      
      // after a successful save we reset form; when adding we keep the modal open so user can add more
      resetForm();
      setSelectedParty(null);
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      } else {
        setIsAddModalOpen(true);
        focusFirstField();
      }
      if (!isEditModalOpen) {
        focusFirstField();
      }
      // do not automatically close add modal to allow consecutive entries
    } catch (error) {
      console.error("Party submit error:", error);
      console.error("Error response:", error.response?.data);
      const msg = error.response?.data?.message || 'Operation failed';
      const details = Array.isArray(error.response?.data?.errors) 
          ? error.response.data.errors.join(', ') 
          : '';
      showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.party) return;
    try {
       await api.delete(`/contacts/${deleteDialog.party.id}`);
       showToast('Party deleted successfully', 'success');
       setParties(parties.filter(p => p.id !== deleteDialog.party.id));
       setDeleteDialog({ isOpen: false, party: null });
    } catch (error) {
       console.error(error);
       const msg = error.response?.data?.message || 'Failed to delete party';
       const details = Array.isArray(error.response?.data?.errors)
         ? error.response.data.errors.join(', ')
         : '';
       showToast(details ? `${msg}: ${details}` : msg, 'error');
    }
  };

  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isAddModalOpen || isEditModalOpen);

  const openAddModal = () => {
    resetForm();
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Debitors ( Saler) Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">
            Manage party
          </p>
        </div>
        <Button
          onClick={openAddModal}
          className="flex items-center gap-2 text-xs sm:text-sm"
        >
          <FaPlus className="text-sm sm:text-base" />
          Add Party
        </Button>
      </div>

     

      {/* Parties Table */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={loading}
          columns={columns}
          data={parties}
          actions={actions}
          searchable={true}
          sortable={true}
          pagination={true}
          minWidth="750px"
          className="text-xs sm:text-sm"
        />
      </div>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, party: null })}
        onConfirm={handleDelete}
        itemName={deleteDialog.party?.name}
      />

      {/* View Party Modal */}
      <Modal 
        isOpen={isViewModalOpen} 
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedParty(null);
        }} 
        title="Party Details" 
        size="lg"
      >
        {selectedParty && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Party Name</label>
                <p className="text-sm text-gray-900">{selectedParty.name}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Alias</label>
                <p className="text-sm text-gray-900">{selectedParty.alias || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Phone</label>
                <p className="text-sm text-gray-900">{selectedParty.phone}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                <p className="text-sm text-gray-900">{selectedParty.whatsapp_number || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Email</label>
                <p className="text-sm text-gray-900">{selectedParty.email}</p>
              </div>
              {/* <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Type</label>
                <p className="text-sm text-gray-900">{selectedParty.contact_type || 'party'}</p>
              </div> */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Type</label>
                <p className="text-sm text-gray-900">{selectedParty.is_gst === 1 ? '1' : '0'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Area Mapping</label>
                <p className="text-sm text-gray-900">
                  {areas.find((a) => getEntityId(a) === selectedParty.area_id)?.city
                    ? `${areas.find((a) => getEntityId(a) === selectedParty.area_id)?.city} - ${areas.find((a) => getEntityId(a) === selectedParty.area_id)?.state || ''}`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Transport Mapping</label>
                <p className="text-sm text-gray-900">{transports.find((t) => getEntityId(t) === selectedParty.transport_id)?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Transport Charge</label>
                <p className="text-sm text-gray-900">{selectedParty.transport_charge || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Credit Terms (Days)</label>
                <p className="text-sm text-gray-900">{selectedParty.due_days ? `${selectedParty.due_days} Days` : '0 (No Credit)'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">GST Number</label>
                <p className="text-sm text-gray-900">{selectedParty.gstin || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">PAN Number</label>
                <p className="text-sm text-gray-900 font-mono">{extractPAN(selectedParty.gstin) || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">CIN</label>
                <p className="text-sm text-gray-900">{selectedParty.cin || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Reg Number</label>
                <p className="text-sm text-gray-900">{selectedParty.reg_number || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Bank Name</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.bank_name || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.bank_name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Bank Branch</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.bank_branch || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.bank_branch || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.ifsc_code || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.ifsc_code || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Account Number</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.account_number || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.account_number || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Account Holder</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.account_holder || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.account_holder || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">UPI ID</label>
                <p className="text-sm text-gray-900">{selectedParty.bank_details?.upi_id || banks.find(b => getEntityId(b) === selectedParty.bank_id)?.upi_id || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Agent</label>
                <p className="text-sm text-gray-900">{agents.find(a => getEntityId(a) === selectedParty.agent)?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Label</label>
                <p className="text-sm text-gray-900">{labels.find(l => l._id === selectedParty.label_id)?.name || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">City</label>
                <p className="text-sm text-gray-900">{selectedParty.city || 'N/A'}</p>
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">State</label>
                <p className="text-sm text-gray-900">{selectedParty.state || 'N/A'}</p>
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Address</label>
              <p className="text-sm text-gray-900">{selectedParty.address}</p>
            </div>
            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setIsViewModalOpen(false);
                  setSelectedParty(null);
                }}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Validation Error Modal */}
      <div className={validationModal.isOpen ? 'relative z-[9999]' : ''}>
        <Modal
          isOpen={validationModal.isOpen}
          onClose={() => setValidationModal({ isOpen: false, errors: [] })}
          title="Validation Failed"
          size="sm"
        >
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="text-red-800 font-semibold mb-2">Please fix the following errors:</h3>
              <ul className="list-disc list-inside space-y-1">
                {validationModal.errors.map((error, index) => (
                  <li key={index} className="text-red-700 text-sm">{error}</li>
                ))}
              </ul>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setValidationModal({ isOpen: false, errors: [] })}>
                OK
              </Button>
            </div>
          </div>
        </Modal>
      </div>

      {/* Add/Edit Party Modal */}
      <Modal 
        isOpen={isAddModalOpen || isEditModalOpen} 
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedParty(null);
          resetForm();
        }} 
        title={isEditModalOpen ? 'Edit Party' : 'Add New Party'} 
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto">

                  <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Party Name *</label>
            <input ref={firstFieldRef} type="text" name="name" value={formData.name} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter party name" />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Alias</label>
            <input type="text" name="alias" value={formData.alias} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter alias (optional)" />
          </div>
          
          </div>

          <div>
            {/* <label className="block text-sm font-medium text-gray-700 mb-1">GST Type</label> */}
            <div className="flex items-center gap-3">
              {/* <span className="text-xs sm:text-sm text-gray-700">Non-GST</span> */}
              <div
                onClick={() => setFormData((prev) => ({ ...prev, is_gst: prev.is_gst === 0 ? 1 : 0 }))}
                className={`w-14 h-7 flex items-center rounded-full p-1 cursor-pointer transition-all duration-300 ${
                  formData.is_gst === 1 ? 'bg-green-500' : 'bg-gray-300'
                }`}
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-all duration-300 ${
                    formData.is_gst === 1 ? 'translate-x-7' : 'translate-x-0'
                  }`}
                />
              </div>
              {/* <span className="text-xs sm:text-sm text-gray-700">GST</span> */}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">GST Number</label>
              <input 
                type="text" 
                name="gstin" 
                value={formData.gstin} 
                onChange={handleInputChange}
                maxLength="15"
                style={{ textTransform: 'uppercase' }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="27ABCDE1234F1Z5" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PAN Number (Auto-extracted)</label>
              <input 
                type="text" 
                value={extractPAN(formData.gstin) || ''} 
                disabled 
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-600 font-mono" 
                placeholder="Enter GST to extract PAN"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number *</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Phone" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
              <input type="tel" name="whatsapp_number" value={formData.whatsapp_number} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="WhatsApp Number" />
            </div>
          </div>
          

                  <div className="grid grid-cols-2 gap-4">


          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
            <input type="email" name="email" value={formData.email} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="contact@example.com" />
          </div>

           <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transport Charge</label>
              <input type="number" name="transport_charge" value={formData.transport_charge} onChange={handleInputChange} onWheel={(e) => e.target.blur()} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="0" />
          </div>

          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Credit Terms (Days)</label>
              <input type="number" name="due_days" value={formData.due_days} onChange={handleInputChange} onWheel={(e) => e.target.blur()} min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="e.g. 15, 30 days" />
          </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
            <textarea name="address" value={formData.address} onChange={handleInputChange} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter complete address" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <input type="text" name="city" value={formData.city} onChange={handleInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="City" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Transport mapping</label>
              <SearchableSelect
                value={formData.transport_id}
                onChange={(value) => handleInputChange({ target: { name: "transport_id", value } })}
                placeholder="Select Transport"
                searchPlaceholder="Search transport..."
                options={transports.map((t) => ({ value: getEntityId(t), label: t.name }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Area mapping</label>
              <SearchableSelect
                value={formData.area_id}
                onChange={(value) => handleInputChange({ target: { name: "area_id", value } })}
                placeholder="Select Area"
                searchPlaceholder="Search area..."
                options={areas.map((a) => ({ value: getEntityId(a), label: `${a.city} - ${a.state}` }))}
              />
            </div>
          </div>

         

          

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CIN</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Reg Number</label>
              <input 
                type="text" 
                name="reg_number" 
                value={formData.reg_number || ""} 
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reg_number: e.target.value }))
                }
                autoComplete="off"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" 
                placeholder="e.g. REG-ABC-123" 
              />
            </div>
          </div>


        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label</label>
            <SearchableSelect
              value={formData.label_id}
              onChange={(value) => handleInputChange({ target: { name: "label_id", value } })}
              placeholder="Select Label"
              searchPlaceholder="Search label..."
              options={labels.map((label, index) => ({
                value: label._id,
                label: label.name,
                searchText: `${label.name} ${index}`,
              }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label> {/* optional field now */}
            <SearchableSelect
              value={formData.agent}
              onChange={(value) => handleInputChange({ target: { name: "agent", value } })}
              placeholder="Select Agent"
              searchPlaceholder="Search agent..."
              options={agents.map((agent) => ({
                value: getEntityId(agent),
                label: agent.name,
              }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Name </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Bank Branch</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">IFSC Code</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Number </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">Account Holder</label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">UPI ID</label>
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
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
                setSelectedParty(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button type="submit">
              {isEditModalOpen ? 'Update Party' : 'Add Party'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};



                
export default PartyMaster;
