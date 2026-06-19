import React, { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useSaveShortcut from '../../hooks/useSaveShortcut';

const BrandMaster = () => {
  const { showToast } = useStore();
  const [brands, setBrands] = useState([]);
  const [hsns, setHsns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [newBrandName, setNewBrandName] = useState('');
  const [selectedHsn, setSelectedHsn] = useState('');
  const [gstRate, setGstRate] = useState(0);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, brand: null });
  const [submitting, setSubmitting] = useState(false);
  const firstFieldRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAddBrand();
    else if (isEditModalOpen) handleEditBrand();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => { setNewBrandName(''); setSelectedHsn(''); setGstRate(0); setIsAddModalOpen(true); },
    onRefresh: () => fetchBrands(),
  });

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const fetchBrands = async (signal) => {
    setLoading(true);
    try {
      const [brandRes, hsnRes] = await Promise.all([
        api.get('/brands', { params: { page: 1, limit: 200 }, signal }),
        api.get('/hsn', { params: { page: 1, limit: 200 }, signal })
      ]);

      const hsnList = listFromResponse(hsnRes).filter((h) => h?.is_active !== false).map((h) => ({
        _id: h._id,
        hsn_number: h.hsn_code,
        gst_percentage: Number(h.gst_rate || 0)
      }));
      setHsns(hsnList);

      const brandList = listFromResponse(brandRes).map((b) => ({
        id: b._id,
        name: b.brand_name || b.name || '',
        hsn_id: typeof b.hsn_id === 'object' ? b.hsn_id?._id : (b.hsn_id || '')
      }));
      setBrands(brandList);
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to load data', 'error');
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
    fetchBrands(controller.signal);
    return () => controller.abort();
  }, []);
  
  useEffect(() => {
    if (isAddModalOpen && !isEditModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const columns = [
    { key: 'id', label: 'Brand ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },
    { key: 'name', label: 'Brand Name' },
    {
      key: 'hsn_id',
      label: 'HSN Code',
      render: (value) => {
        const hsn = hsns.find((h) => h._id === value);
        return <span className="text-sm">{hsn ? `${hsn.hsn_number} (${hsn.gst_percentage}%)` : '-'}</span>;
      }
    }
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (brand) => {
        setEditingBrand(brand);
        setNewBrandName(brand.name);
        setSelectedHsn(brand.hsn_id || '');
        const hsn = hsns.find(h => h._id === brand.hsn_id);
        setGstRate(hsn ? hsn.gst_percentage : 0);
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (brand) => setDeleteDialog({ isOpen: true, brand }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ];

  const handleAddBrand = async () => {
    if (!newBrandName?.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.post('/brands', {
        brand_name: newBrandName?.trim(),
        hsn_id: selectedHsn || undefined
      });
      showToast('Brand added successfully', 'success');
      setNewBrandName('');
      setSelectedHsn('');
      setGstRate(0);
      fetchBrands();
      focusFirstField();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to add brand', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditBrand = async () => {
    if (!editingBrand?.id || !newBrandName?.trim() || submitting) return;
    setSubmitting(true);
    try {
      await api.put(`/brands/${editingBrand.id}`, {
        brand_name: newBrandName?.trim(),
        hsn_id: selectedHsn || undefined
      });
      showToast('Brand updated successfully', 'success');
      setIsEditModalOpen(false);
      setEditingBrand(null);
      setNewBrandName('');
      setSelectedHsn('');
      setGstRate(0);
      fetchBrands();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update brand', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!deleteDialog?.brand?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/brands/${deleteDialog.brand.id}`);
      showToast('Brand deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, brand: null });
      fetchBrands();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete brand', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Brand Master</h1>
          <p className="text-gray-600">Manage item brands and groupings</p>
        </div>
        <Button onClick={() => {
          setNewBrandName('');
          setSelectedHsn('');
          setGstRate(0);
          setIsAddModalOpen(true);
        }} className="flex items-center gap-2">
          <FaPlus />Add Brand
        </Button>
      </div>

      <DataTable loading={loading} columns={columns} data={brands} actions={actions} searchable sortable pagination />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Brand" size="md">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <Input ref={firstFieldRef} value={newBrandName} onChange={setNewBrandName} allowSpaces={true} placeholder="Enter brand name" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
            <select value={selectedHsn} onChange={(e) => {
              setSelectedHsn(e.target.value);
              const hsn = hsns.find(h => h._id === e.target.value);
              setGstRate(hsn ? hsn.gst_percentage : 0);
            }} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option value="">Select HSN Code</option>
              {hsns.map((h) => <option key={h._id} value={h._id}>{h.hsn_number} - {h.gst_percentage}%</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
            <Input type="number" value={gstRate} disabled className="bg-gray-50" />
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleAddBrand} disabled={!newBrandName || submitting}>Add Brand</Button>
            <Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Brand" size="md">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Brand Name</label>
            <Input value={newBrandName} onChange={setNewBrandName} allowSpaces={true} placeholder="Enter brand name" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
            <select value={selectedHsn} onChange={(e) => {
              setSelectedHsn(e.target.value);
              const hsn = hsns.find(h => h._id === e.target.value);
              setGstRate(hsn ? hsn.gst_percentage : 0);
            }} className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm">
              <option value="">Select HSN Code</option>
              {hsns.map((h) => <option key={h._id} value={h._id}>{h.hsn_number} - {h.gst_percentage}%</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
            <Input type="number" value={gstRate} disabled className="bg-gray-50" />
          </div>

          <div className="flex gap-3 pt-4">
            <Button onClick={handleEditBrand} disabled={!newBrandName || submitting}>Save Changes</Button>
            <Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, brand: null })} onConfirm={handleDeleteBrand} itemName={deleteDialog.brand?.name} />
    </div>
  );
};

export default BrandMaster;
