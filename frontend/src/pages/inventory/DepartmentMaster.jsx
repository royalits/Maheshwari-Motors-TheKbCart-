import React, { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useSaveShortcut from '../../hooks/useSaveShortcut';

const DepartmentMaster = () => {
  const { showToast } = useStore();
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingDepartment, setEditingDepartment] = useState(null);
  const [departmentName, setDepartmentName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, department: null });
  const [submitting, setSubmitting] = useState(false);
  const addNameRef = useRef(null);
  const editNameRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAdd();
    else if (isEditModalOpen) handleEdit();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => { setDepartmentName(''); setIsAddModalOpen(true); },
    onRefresh: () => fetchDepartments(),
  });

  const focusAddField = () => {
    setTimeout(() => {
      addNameRef.current?.focus();
      addNameRef.current?.select?.();
    }, 0);
  };

  const fetchDepartments = async (signal) => {
    try {
      const res = await api.get('/departments', { params: { page: 1, limit: 200 }, signal });
      const list = res?.data?.data?.data || res?.data?.data || [];
      setDepartments(list.map((d) => ({ id: d._id, name: d.name || '' })));
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to load departments', 'error');
      }
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchDepartments(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAddModalOpen) return;
    focusAddField();
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
    { key: 'id', label: 'ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },
    { key: 'name', label: 'Department Name' }
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (dept) => {
        setEditingDepartment(dept);
        setDepartmentName(dept.name);
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (dept) => setDeleteDialog({ isOpen: true, department: dept }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ];

  const handleAdd = async () => {
    if (!departmentName?.trim() || submitting) {
      showToast('Department name is required', 'error');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/departments', { name: departmentName.trim() });
      showToast('Department added successfully', 'success');
      setDepartmentName('');
      fetchDepartments();
      focusAddField();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to add department', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async () => {
    if (!editingDepartment?.id || !departmentName?.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.put(`/departments/${editingDepartment.id}`, { name: departmentName.trim() });
      showToast('Department updated successfully', 'success');
      setIsEditModalOpen(false);
      setEditingDepartment(null);
      setDepartmentName('');
      fetchDepartments();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update department', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog?.department?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/departments/${deleteDialog.department.id}`);
      showToast('Department deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, department: null });
      fetchDepartments();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete department', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Department Master</h1>
          <p className="text-gray-600">Manage departments</p>
        </div>
        <Button onClick={() => { setDepartmentName(''); setIsAddModalOpen(true); }} className="flex items-center gap-2"><FaPlus />Add Department</Button>
      </div>

      <DataTable loading={loading} columns={columns} data={departments} actions={actions} searchable sortable pagination />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Department">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Department Name</label><Input ref={addNameRef} value={departmentName} onChange={setDepartmentName} allowSpaces={true} placeholder="Enter department name" /></div>
          <div className="flex gap-3 pt-4"><Button onClick={handleAdd} disabled={!departmentName || submitting}>Add Department</Button><Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Department">
        <div className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Department Name</label><Input ref={editNameRef} value={departmentName} onChange={setDepartmentName} allowSpaces={true} placeholder="Enter department name" /></div>
          <div className="flex gap-3 pt-4"><Button onClick={handleEdit} disabled={!departmentName || submitting}>Save Changes</Button><Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, department: null })} onConfirm={handleDelete} itemName={deleteDialog.department?.name} />
    </div>
  );
};

export default DepartmentMaster;
