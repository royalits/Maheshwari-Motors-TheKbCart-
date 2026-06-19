import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useSaveShortcut from '../../hooks/useSaveShortcut';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana',
  'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana',
  'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Lakshadweep', 'Puducherry', 'Ladakh', 'Jammu and Kashmir'
];

const emptyForm = { city: '', state: '', pincode: '', agent_id: '' };

const AreaMaster = () => {
  const { showToast } = useStore();
  const [areas, setAreas] = useState([]);
  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [viewingArea, setViewingArea] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, area: null });
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAdd();
    else if (isEditModalOpen) handleEdit();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => setIsAddModalOpen(true),
    onRefresh: () => fetchAreas(),
  });

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const normalizeArea = (a) => ({
    _id: a?._id,
    city: a?.city || '',
    state: a?.state || '',
    pincode: a?.pincode || '',
    agent_id: typeof a?.agent_id === 'object' ? a.agent_id?._id : (a?.agent_id || '')
  });

  const fetchAreas = async (signal) => {
    setLoading(true);
    try {
      const [areasRes, agentsRes] = await Promise.all([
        api.get('/areas', { params: { page: 1, limit: 200 }, signal }),
        api.get('/agents', { params: { page: 1, limit: 200 }, signal })
      ]);

      setAreas(listFromResponse(areasRes).map(normalizeArea));
      setAgents(listFromResponse(agentsRes));
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to load area data', 'error');
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
    fetchAreas(controller.signal);
    return () => controller.abort();
  }, []);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const columns = useMemo(() => [
    { key: 'id', label: 'ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'pincode', label: 'Pincode' }
  ], []);

  const actions = useMemo(() => [
    {
      label: <FaEye size={14} />,
      onClick: (area) => { setViewingArea(area); setFormData({ ...area }); setIsViewModalOpen(true); },
      className: 'bg-gray-600 text-white hover:bg-gray-700 p-2'
    },
    {
      label: <FaEdit size={14} />,
      onClick: (area) => { setEditingArea(area); setFormData({ ...area }); setIsEditModalOpen(true); },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-2'
    },
    {
      label: <FaTrash size={14} />,
      onClick: (area) => setDeleteDialog({ isOpen: true, area }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-2'
    }
  ], []);

  const buildPayload = () => ({
    city: formData.city?.trim(),
    state: formData.state?.trim(),
    pincode: formData.pincode?.trim() || undefined,
    agent_id: formData.agent_id || undefined
  });

  const validate = () => {
    if (!formData.city?.trim() || !formData.state?.trim()) {
      showToast('City and state are required', 'error');
      return false;
    }
    if (formData.pincode?.trim() && !/^[1-9][0-9]{5}$/.test(formData.pincode.trim())) {
      showToast('Pincode must be a valid 6-digit Indian pincode', 'error');
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      await api.post('/areas', buildPayload());
      showToast('Area added successfully', 'success');
      setFormData(emptyForm);
      fetchAreas();
      focusFirstField();
    } catch (error) {
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || 'Failed to add area';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingArea?._id || !validate() || submitting) return;
    setSubmitting(true);
    try {
      await api.put(`/areas/${editingArea._id}`, buildPayload());
      showToast('Area updated successfully', 'success');
      setIsEditModalOpen(false);
      setEditingArea(null);
      setFormData(emptyForm);
      fetchAreas();
    } catch (error) {
      const errorMsg = error?.response?.data?.error || error?.response?.data?.message || 'Failed to update area';
      showToast(errorMsg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog?.area?._id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/areas/${deleteDialog.area._id}`);
      showToast('Area deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, area: null });
      fetchAreas();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete area', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const renderForm = (isView = false) => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div><label className="block text-sm font-medium text-gray-700 mb-1">Area *</label><Input ref={isAddModalOpen && !isEditModalOpen ? firstFieldRef : null} value={formData.city} onChange={(v) => setFormData({ ...formData, city: v })} disabled={isView} /></div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
          <select value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })} disabled={isView} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
            <option value="">Select State</option>
            {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
          <Input
            value={formData.pincode}
            onChange={(v) => {
              const numeric = v.replace(/\D/g, '').slice(0, 6);
              setFormData({ ...formData, pincode: numeric });
            }}
            disabled={isView}
            className={formData.pincode?.trim() && !/^[1-9][0-9]{5}$/.test(formData.pincode.trim()) ? 'border-red-400 bg-red-50' : ''}
          />
          {formData.pincode?.trim() && !/^[1-9][0-9]{5}$/.test(formData.pincode.trim()) && (
            <p className="text-xs text-red-500 mt-1">Invalid pincode (6 digits, cannot start with 0)</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
          <select value={formData.agent_id} onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })} disabled={isView} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
            <option value="">Select Agent</option>
            {agents.map((a) => <option key={a._id} value={a._id}>{a.name}</option>)}
          </select>
        </div>
      </div>
    </div>
  );

  const renderViewForm = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Area</label>
          <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">{formData.city || 'N/A'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
          <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">{formData.state || 'N/A'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Pincode</label>
          <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">{formData.pincode || 'N/A'}</p>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Agent</label>
          <p className="text-sm text-gray-900 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
            {agents.find(a => a._id === formData.agent_id)?.name || 'N/A'}
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold text-gray-900">Area Master</h1><p className="text-gray-600 text-sm">Manage area information</p></div>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2"><FaPlus />Add Area</Button>
      </div>

      <DataTable loading={loading} columns={columns} data={areas} actions={actions} searchable sortable pagination />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Area">{renderForm()}<div className="flex gap-3 pt-4"><Button onClick={handleAdd} disabled={submitting}>Add Area</Button><Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button></div></Modal>
      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Area">{renderForm()}<div className="flex gap-3 pt-4"><Button onClick={handleEdit} disabled={submitting}>Save Changes</Button><Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button></div></Modal>
      <Modal isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} title="View Area">{renderViewForm()}<div className="flex justify-end pt-4"><Button variant="outline" onClick={() => setIsViewModalOpen(false)}>Close</Button></div></Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, area: null })} onConfirm={handleDelete} itemName={deleteDialog.area?.city} />
    </div>
  );
};

export default AreaMaster;
