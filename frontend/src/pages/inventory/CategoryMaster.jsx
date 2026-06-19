import React, { useState, useEffect, useRef } from 'react';
import { FaPlus, FaEdit, FaTrash, FaTimes } from 'react-icons/fa';
import { DataTable, Modal, DeleteConfirmDialog } from '../../components/common';
import { Button, Input } from '../../components/ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';
import useSaveShortcut from '../../hooks/useSaveShortcut';

const CategoryMaster = () => {
  const { showToast } = useStore();
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, category: null });
  const [submitting, setSubmitting] = useState(false);
  const addNameRef = useRef(null);
  const editNameRef = useRef(null);

  useSaveShortcut(() => {
    if (isAddModalOpen) handleAddCategory();
    else if (isEditModalOpen) handleEditCategory();
  }, isAddModalOpen || isEditModalOpen);

  useKeyboardShortcuts({
    onAdd: () => { setNewCategoryName(''); setSelectedBrands([]); setIsAddModalOpen(true); },
    onRefresh: () => fetchData(),
  });

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
  };

  const fetchData = async (signal) => {
    setLoading(true);
    
    // Clear existing data first
    setCategories([]);
    setBrands([]);
    
    try {
      const [catRes, brandRes, itemRes] = await Promise.all([
        api.get('/categories', { params: { page: 1, limit: 200 }, signal }),
        api.get('/brands', { params: { page: 1, limit: 200 }, signal }),
        api.get('/items', { params: { page: 1, limit: 1000 }, signal })
      ]);

      const itemList = listFromResponse(itemRes);
      const brandList = listFromResponse(brandRes).map((b) => {
        const itemCount = itemList.filter(item => {
          const brandId = typeof item.brand_id === 'object' ? item.brand_id?._id : item.brand_id;
          return brandId === b._id;
        }).length;
        return { id: b._id, name: b.brand_name || b.name || '', itemCount };
      });
      const categoryList = listFromResponse(catRes).map((c) => ({
        id: c._id,
        name: c.category_name || c.name || '',
        brands: (c.brands || c.brand_ids || []).map((raw) => {
          const id = typeof raw === 'object' ? raw._id : raw;
          const matched = brandList.find((b) => b.id === id);
          return matched ? { ...matched } : null;
        }).filter(Boolean)
      }));

      setBrands(brandList);
      setCategories(categoryList);
    } catch (error) {
      if (error?.name !== 'CanceledError') {
        showToast('Failed to load data', 'error');
      }
    }
    
    // Use setTimeout to ensure state updates are processed
    setTimeout(() => {
      setLoading(false);
    }, 100);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!isAddModalOpen) return;
    const handle = setTimeout(() => {
      addNameRef.current?.focus();
      addNameRef.current?.select?.();
    }, 0);
    return () => clearTimeout(handle);
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
    { key: 'id', label: 'Category ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },
    { key: 'name', label: 'Category Name' },
    { key: 'brands', label: 'Brands', render: (value) => `${value?.length || 0}` }
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (category) => {
        setEditingCategory(category);
        setNewCategoryName(category.name);
        setSelectedBrands(category.brands || []);
        setIsEditModalOpen(true);
      },
      className: 'bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs'
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (category) => setDeleteDialog({ isOpen: true, category }),
      className: 'bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs'
    }
  ];

  const payload = () => ({
    category_name: newCategoryName?.trim(),
    brands: selectedBrands.map((b) => b.id)
  });

  const handleAddCategory = async () => {
    if (submitting) return;

    setSubmitting(true);
    try {
      await api.post('/categories', payload());
      showToast('Category added successfully', 'success');
      setNewCategoryName('');
      setSelectedBrands([]);
      setIsAddModalOpen(false);
      fetchData();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to add category', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.put(`/categories/${editingCategory.id}`, payload());
      showToast('Category updated successfully', 'success');
      setIsEditModalOpen(false);
      setEditingCategory(null);
      setNewCategoryName('');
      setSelectedBrands([]);
      fetchData();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to update category', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!deleteDialog?.category?.id || submitting) return;
    setSubmitting(true);
    try {
      await api.delete(`/categories/${deleteDialog.category.id}`);
      showToast('Category deleted successfully', 'success');
      setDeleteDialog({ isOpen: false, category: null });
      fetchData();
    } catch (error) {
      showToast(error?.response?.data?.message || 'Failed to delete category', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBrandToggle = (brand) => {
    setSelectedBrands((prev) => {
      const exists = prev.find((b) => b.id === brand.id);
      if (exists) return prev.filter((b) => b.id !== brand.id);
      return [...prev, brand];
    });
  };

  const removeBrandFromCategory = (brandId) => {
    setSelectedBrands((prev) => prev.filter((b) => b.id !== brandId));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Category Master</h1>
          <p className="text-gray-600">Manage item categories</p>
        </div>
        <Button onClick={() => { setNewCategoryName(''); setSelectedBrands([]); setIsAddModalOpen(true); }} className="flex items-center gap-2"><FaPlus />Add Category</Button>
      </div>

      <DataTable loading={loading} columns={columns} data={categories} actions={actions} searchable sortable pagination />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Category" size="lg">
        <div className="space-y-6">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Category Name</label><Input ref={addNameRef} value={newCategoryName} onChange={setNewCategoryName} allowSpaces={true} /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brands in Category ({selectedBrands.length})</label>
            <div className="bg-gray-50 p-3 rounded-lg min-h-[100px] max-h-[200px] overflow-y-auto">
              {selectedBrands.length === 0 ? <p className="text-gray-500 text-sm">No brands selected</p> : (
                <div className="flex flex-wrap gap-2">{selectedBrands.map((brand) => <div key={brand.id} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"><span>{brand.name}</span><button onClick={() => removeBrandFromCategory(brand.id)} className="text-blue-600 hover:text-blue-800"><FaTimes size={12} /></button></div>)}</div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Available Brands</label>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {brands.length === 0 ? <p className="text-gray-500 text-sm p-4">No brands available</p> : (
                <div className="divide-y">{brands.map((brand) => { const isSelected = selectedBrands.find((b) => b.id === brand.id); return <div key={brand.id} className="p-3 hover:bg-gray-50"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={!!isSelected} onChange={() => handleBrandToggle(brand)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><div className="flex-1"><div className="flex items-center justify-between"><span className="font-medium text-gray-900">{brand.name}</span><span className="text-sm text-gray-500">{brand.itemCount || 0} items</span></div></div></label></div>; })}</div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-4"><Button onClick={handleAddCategory} disabled={submitting}>Add Category</Button><Button variant="outline" onClick={() => setIsAddModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <Modal isOpen={isEditModalOpen} onClose={() => setIsEditModalOpen(false)} title="Edit Category" size="lg">
        <div className="space-y-6">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Category Name</label><Input ref={editNameRef} value={newCategoryName} onChange={setNewCategoryName} allowSpaces={true} /></div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Brands in Category ({selectedBrands.length})</label>
            <div className="bg-gray-50 p-3 rounded-lg min-h-[100px] max-h-[200px] overflow-y-auto">
              {selectedBrands.length === 0 ? <p className="text-gray-500 text-sm">No brands selected</p> : (
                <div className="flex flex-wrap gap-2">{selectedBrands.map((brand) => <div key={brand.id} className="flex items-center gap-2 bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm"><span>{brand.name}</span><button onClick={() => removeBrandFromCategory(brand.id)} className="text-blue-600 hover:text-blue-800"><FaTimes size={12} /></button></div>)}</div>
              )}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Available Brands</label>
            <div className="border rounded-lg max-h-[300px] overflow-y-auto">
              {brands.length === 0 ? <p className="text-gray-500 text-sm p-4">No brands available</p> : (
                <div className="divide-y">{brands.map((brand) => { const isSelected = selectedBrands.find((b) => b.id === brand.id); return <div key={brand.id} className="p-3 hover:bg-gray-50"><label className="flex items-center gap-3 cursor-pointer"><input type="checkbox" checked={!!isSelected} onChange={() => handleBrandToggle(brand)} className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" /><div className="flex-1"><div className="flex items-center justify-between"><span className="font-medium text-gray-900">{brand.name}</span><span className="text-sm text-gray-500">{brand.itemCount || 0} items</span></div></div></label></div>; })}</div>
              )}
            </div>
          </div>
          <div className="flex gap-3 pt-4"><Button onClick={handleEditCategory} disabled={submitting}>Save Changes</Button><Button variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancel</Button></div>
        </div>
      </Modal>

      <DeleteConfirmDialog isOpen={deleteDialog.isOpen} onClose={() => setDeleteDialog({ isOpen: false, category: null })} onConfirm={handleDeleteCategory} itemName={deleteDialog.category?.name} />
    </div>
  );
};

export default CategoryMaster;
