import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useSaveShortcut from '../../hooks/useSaveShortcut';

const emptyForm = { hsn_number: '', gst_percentage: '', description: '' };

const HsnMaster = () => {
  const { showToast } = useStore();
  const [hsns, setHsns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingHsn, setEditingHsn] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, hsn: null });
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAdd();
    else if (isEditModalOpen) handleEdit();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => setIsAddModalOpen(true),
    onRefresh: () => fetchHsns(),
  });

  const normalize = (doc) => ({
    _id: doc?._id,
    hsn_number: doc?.hsn_code || '',
    gst_percentage: Number(doc?.gst_rate ?? 0),
    description: doc?.description || ''
  });

  const fetchHsns = async (signal) => {
    setLoading(true);
    try {
      const response = await api.get('/hsn', { params: { page: 1, limit: 200 }, signal });
      const payload = response?.data?.data;
      const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);
      setHsns(list.map(normalize));
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to fetch HSN codes', 'error');
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
    fetchHsns(controller.signal);
    return () => controller.abort();
  }, []);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const columns = useMemo(() => [
    { key: '_id', label: 'ID', render: (value, row, index) => index + 1 },
    { key: 'hsn_number', label: 'HSN Number' },
    { key: 'gst_percentage', label: 'GST %', render: (value) => `${value}%` },
    { key: 'description', label: 'Description' }
  ], []);

  const actions = useMemo(() => [
    {
      label: <FaEdit size={14} />,
      onClick: (hsn) => {
        setEditingHsn(hsn);
        setFormData({ ...hsn });
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-2'
    },
    {
      label: <FaTrash size={14} />,
      onClick: (hsn) => setDeleteDialog({ isOpen: true, hsn }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-2'
    }
  ], []);

  const buildPayload = () => ({
    hsn_code: formData.hsn_number?.trim(),
    description: formData.description?.trim() || undefined,
    gst_rate: Number(formData.gst_percentage || 0)
  });

  const validate = () => {
    if (!formData.hsn_number?.trim()) {
      showToast('HSN number is required', 'error');
      return false;
    }
    const gstRate = Number(formData.gst_percentage);
    if (Number.isNaN(gstRate) || gstRate < 0 || gstRate > 100) {
      showToast('GST % must be between 0 and 100', 'error');
      return false;
    }
    return true;
  };

  const handleAdd = async () => {
    if (!validate() || submitting) return;
    setSubmitting(true);
    try {
      await api.post('/hsn', buildPayload());
      showToast('HSN added successfully', 'success');
      setFormData(emptyForm);
      fetchHsns();
      focusFirstField();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to add HSN', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingHsn?._id || !validate() || submitting) return;
    setSubmitting(true);
    try {
      await api.put(`/hsn/${editingHsn._id}`, buildPayload());
      showToast('HSN updated successfully', 'success');
      setIsEditModalOpen(false);
      setEditingHsn(null);
      setFormData(emptyForm);
      fetchHsns();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update HSN', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog?.hsn?._id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/hsn/${deleteDialog.hsn._id}`);
      showToast('HSN deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, hsn: null });
      fetchHsns();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete HSN', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HSN Master</h1>
          <p className="text-gray-600 text-sm">Manage HSN codes and GST percentages</p>
        </div>
        <Button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2"><FaPlus />Add HSN</Button>
      </div>

      <DataTable loading={loading} columns={columns} data={hsns} actions={actions} searchable sortable pagination />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add HSN Code">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">HSN Number *</label><Input ref={firstFieldRef} value={formData.hsn_number} onChange={(v) => setFormData({ ...formData, hsn_number: v })} allowSpaces={false} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">GST Percentage *</label><Input type="number" step="0.01" value={formData.gst_percentage} onChange={(v) => setFormData({ ...formData, gst_percentage: v })} onWheel={(e) => e.target.blur()} required /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div className="flex gap-3 pt-4"><Button onClick={handleAdd} disabled={submitting}>Add HSN</Button><Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit HSN Code">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">HSN Number *</label><Input value={formData.hsn_number} onChange={(v) => setFormData({ ...formData, hsn_number: v })} allowSpaces={false} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">GST Percentage *</label><Input type="number" step="0.01" value={formData.gst_percentage} onChange={(v) => setFormData({ ...formData, gst_percentage: v })} onWheel={(e) => e.target.blur()} required /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
          </div>
          <div className="flex gap-3 pt-4"><Button onClick={handleEdit} disabled={submitting}>Save Changes</Button><Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, hsn: null })} onConfirm={handleDelete} itemName={deleteDialog.hsn?.hsn_number} />
    </div>
  );
};

export default HsnMaster;
