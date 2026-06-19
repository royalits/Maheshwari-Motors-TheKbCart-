import { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import { getResponseList, getEntityId } from '../../services/apiUtils';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const emptyForm = { name: '', address: '', city: '', pincode: '', phone: '' };

const AgentMaster = () => {
  const { showToast } = useStore();
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, agent: null });
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef(null);

  useSaveShortcut(() => handleSubmit({ preventDefault: () => {} }), isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => setIsAddModalOpen(true),
    onRefresh: () => fetchAgents(),
  });

  const normalizeAgent = (a) => ({
    _id: a?._id,
    name: a?.name || '',
    address: a?.address || '',
    city: a?.city || '',
    pincode: a?.pincode || '',
    phone: a?.phone || ''
  });

  const fetchAgents = async (signal) => {
    setLoading(true);
    try {
      const agentsRes = await api.get('/agents', { params: { page: 1, limit: 200 }, signal });
      setAgents(getResponseList(agentsRes).map(normalizeAgent));
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to fetch agents', 'error');
      }
    } finally {
      setLoading(false);
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
    const controller = new AbortController();
    fetchAgents(controller.signal);
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
    { key: 'phone', label: 'Phone', render: (value) => <span className="text-xs sm:text-sm">{value || 'N/A'}</span> }
  ];

  const actions = [
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: (agent) => { setSelectedAgent(agent); setIsViewModalOpen(true); },
      className: 'bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (agent) => { setSelectedAgent(agent); setFormData({ ...agent }); setIsEditModalOpen(true); },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (agent) => setDeleteDialog({ isOpen: true, agent }),
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
    phone: formData.phone?.trim() || undefined
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name?.trim() || submitting) {
      showToast('Name is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      if (isEditModalOpen && selectedAgent?._id) {
        await api.put(`/agents/${selectedAgent._id}`, buildPayload());
        showToast('Agent updated successfully', 'success');
      } else {
        await api.post('/agents', buildPayload());
        showToast('Agent created successfully', 'success');
      }

      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      }
      setFormData(emptyForm);
      setSelectedAgent(null);
      fetchAgents();
      if (!isEditModalOpen) {
        focusFirstField();
      }
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to save agent', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog?.agent?._id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/agents/${deleteDialog.agent._id}`);
      showToast('Agent deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, agent: null });
      fetchAgents();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete agent', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Agent Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage agents</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 text-xs sm:text-sm"><FaPlus className="text-sm sm:text-base" />Add Agent</Button>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable loading={loading} columns={columns} data={agents} actions={actions} searchable sortable pagination minWidth="750px" />
      </div>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, agent: null })} onConfirm={handleDelete} itemName={deleteDialog.agent?.name} />

      <Modal isOpen={isViewModalOpen} onClose={() => { setIsViewModalOpen(false); setSelectedAgent(null); }} title="Agent Details" size="lg">
        {selectedAgent && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Name</label><p className="text-sm text-gray-900">{selectedAgent.name}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">City</label><p className="text-sm text-gray-900">{selectedAgent.city}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Pincode</label><p className="text-sm text-gray-900">{selectedAgent.pincode}</p></div>
              <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Phone</label><p className="text-sm text-gray-900">{selectedAgent.phone || 'N/A'}</p></div>
            </div>
            <div><label className="block text-xs sm:text-sm font-medium text-gray-700 mb-1">Address</label><p className="text-sm text-gray-900">{selectedAgent.address}</p></div>
            <Button variant="outline" onClick={() => { setIsViewModalOpen(false); setSelectedAgent(null); }}>Close</Button>
          </div>
        )}
      </Modal>

      <Modal isOpen={isAddModalOpen || isEditModalOpen} onClose={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAgent(null); setFormData(emptyForm); }} title={isEditModalOpen ? 'Edit Agent' : 'Add New Agent'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><Input ref={firstFieldRef} value={formData.name} onChange={(v) => handleInputChange('name', v)} allowSpaces={true} required /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Address</label><textarea name="address" value={formData.address} onChange={handleNativeInputChange} rows="2" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">City</label><Input value={formData.city} onChange={(v) => handleInputChange('city', v)} allowSpaces={true} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label><Input value={formData.pincode} onChange={(v) => handleInputChange('pincode', v)} allowSpaces={false} /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Phone</label><Input type="tel" value={formData.phone} onChange={(v) => handleInputChange('phone', v)} allowSpaces={false} /></div>
          <div className="flex gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); setSelectedAgent(null); setFormData(emptyForm); }}>Cancel</Button>
            <Button type="submit" disabled={submitting}>{isEditModalOpen ? 'Update Agent' : 'Add Agent'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AgentMaster;
