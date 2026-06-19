import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const emptyForm = { name: '', address: '', city: '', pincode: '', phone: '', whatsapp: '', gstin: '' };

const TransportMaster = () => {
  const { showToast } = useStore();
  const [transports, setTransports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, transport: null });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTransport, setSelectedTransport] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef(null);

  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => setIsAddModalOpen(true),
    onRefresh: () => fetchTransports(),
  });

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const normalize = (t) => ({
    _id: t?._id,
    name: t?.name || '',
    address: t?.address || '',
    city: t?.city || '',
    pincode: t?.pincode || '',
    phone: t?.phone || '',
    whatsapp: t?.whatsapp || '',
    gstin: t?.gstin || ''
  });

  const fetchTransports = async (signal) => {
    setLoading(true);
    setTransports([]);
    
    try {
      const response = await api.get('/transports', { params: { page: 1, limit: 200 }, signal });
      setTransports(listFromResponse(response).map(normalize));
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to fetch transports', 'error');
      }
      setTransports([]);
    }
    
    setTimeout(() => {
      setLoading(false);
    }, 100);
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
    const controller = new AbortController();
    fetchTransports(controller.signal);
    return () => controller.abort();
  }, []);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const columns = [

        { key: 'id', label: 'ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },

    { key: 'name', label: 'Name', render: (value) => <span className="text-xs sm:text-sm font-medium">{value}</span> },
    { key: 'city', label: 'City', render: (value) => <span className="text-xs sm:text-sm">{value}</span> },
    { key: 'whatsapp', label: 'WhatsApp', render: (value) => <span className="text-xs sm:text-sm">{value || '-'}</span> },
    { key: 'phone', label: 'Phone', render: (value) => <span className="text-xs sm:text-sm">{value || 'N/A'}</span> }
  ];

  const actions = [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (transport) => { setSelectedTransport(transport); setIsViewModalOpen(true); },
      className: 'bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (transport) => { setSelectedTransport(transport); setFormData({ ...transport }); setIsEditModalOpen(true); },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (transport) => setDeleteDialog({ isOpen: true, transport }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ];

  const handleInputChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
  };

  const handleNativeInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const buildPayload = () => ({
    name: formData.name?.trim(),
    address: formData.address?.trim() || undefined,
    city: formData.city?.trim() || undefined,
    pincode: formData.pincode?.trim() || undefined,
    phone: formData.phone?.trim() || undefined,
    whatsapp: formData.whatsapp?.trim() || undefined,
    gstin: formData.gstin?.trim().toUpperCase() || undefined
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim() || submitting) {
      showToast('Transport name is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditModalOpen && selectedTransport?._id) {
        await api.put(`/transports/${selectedTransport._id}`, buildPayload());
        showToast('Transport updated successfully', 'success');
      } else {
        await api.post('/transports', buildPayload());
        showToast('Transport created successfully', 'success');
      }
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      }
      setFormData(emptyForm);
      setSelectedTransport(null);
      fetchTransports();
      if (!isEditModalOpen) {
        focusFirstField();
      }
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to save transport', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog?.transport?._id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/transports/${deleteDialog.transport._id}`);
      showToast('Transport deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, transport: null });
      fetchTransports();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete transport', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Transport Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage transports</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 text-xs sm:text-sm"><FaPlus className="text-sm sm:text-base" />Add Transport</Button>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable loading={loading} columns={columns} data={transports} actions={actions} searchable sortable pagination minWidth="750px" />
      </div>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, transport: null })} onConfirm={handleDelete} itemName={deleteDialog.transport?.name} />

      <Modal isOpen={isViewModalOpen} onClose={() => { setIsViewModalOpen(false); setSelectedTransport(null); }} title="Transport Details" size="lg">
        {selectedTransport && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Name</label><p className="text-sm text-gray-900">{selectedTransport.name}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">City</label><p className="text-sm text-gray-900">{selectedTransport.city}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Pincode</label><p className="text-sm text-gray-900">{selectedTransport.pincode}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Phone</label><p className="text-sm text-gray-900">{selectedTransport.phone || 'N/A'}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">WhatsApp</label><p className="text-sm text-gray-900">{selectedTransport.whatsapp || 'N/A'}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">GSTIN</label><p className="text-sm text-gray-900">{selectedTransport.gstin || '-'}</p></div>
            </div>
            <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Address</label><p className="text-sm text-gray-900">{selectedTransport.address}</p></div>
            <Button variant="outline" onClick={() => { setIsViewModalOpen(false); setSelectedTransport(null); }}>Close</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isAddModalOpen || isEditModalOpen} onClose={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedTransport(null); setFormData(emptyForm); }} title={isEditModalOpen ? 'Edit Transport' : 'Add New Transport'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input ref={firstFieldRef} name="name" value={formData.name} onChange={handleNativeInputChange} required className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea name="address" value={formData.address} onChange={handleNativeInputChange} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label><input name="city" value={formData.city} onChange={handleNativeInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label><input name="pincode" value={formData.pincode} onChange={handleNativeInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><input name="phone" value={formData.phone} onChange={handleNativeInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp</label><input name="whatsapp" value={formData.whatsapp} onChange={handleNativeInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">GSTIN</label><input name="gstin" value={formData.gstin} onChange={handleNativeInputChange} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" /></div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedTransport(null); setFormData(emptyForm); }}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{isEditModalOpen ? 'Update Transport' : 'Add Transport'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TransportMaster;
