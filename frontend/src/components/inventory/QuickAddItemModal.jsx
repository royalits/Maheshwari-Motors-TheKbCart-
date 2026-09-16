import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '../common';
import { Button, SearchableSelect } from '../ui';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import {
  getResponseList,
  normalizeBrand,
  normalizeItem,
  getEntityId,
  toNumber
} from '../../services/apiUtils';

const QuickAddItemModal = ({
  isOpen,
  onClose,
  initialItemName = '',
  defaultGstType = 1,
  onItemCreated
}) => {
  const { showToast } = useStore();
  const [brands, setBrands] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [hsns, setHsns] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const nameInputRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    barcode: '',
    sale_rate: '',
    purchase_rate: '',
    mrp_rate: '',
    stock: '0',
    brand: '',
    department: '',
    hsn_code: '',
    gst_percent: '',
    is_gst: defaultGstType
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!isOpen) return;

    setFormData((prev) => ({
      ...prev,
      name: initialItemName || '',
      is_gst: defaultGstType !== undefined ? Number(defaultGstType) : 1
    }));
    setErrors({});

    const fetchData = async () => {
      try {
        const [brandRes, deptRes, hsnRes] = await Promise.all([
          api.get('/brands', { params: { page: 1, limit: 200 } }),
          api.get('/departments', { params: { page: 1, limit: 200 } }),
          api.get('/hsn', { params: { page: 1, limit: 200 } })
        ]);

        const brds = getResponseList(brandRes).map(normalizeBrand);
        const depts = getResponseList(deptRes).map((dept) => ({
          id: dept._id || dept.id,
          name: dept.name || dept.dept_name || ''
        }));
        const hsnList = getResponseList(hsnRes)
          .filter((hsn) => hsn?.is_active !== false)
          .map((hsn) => ({
            id: getEntityId(hsn),
            hsn_number: hsn?.hsn_code || '',
            gst_percentage: toNumber(hsn?.gst_rate, 0)
          }));

        setBrands(brds);
        setDepartments(depts);
        setHsns(hsnList);
      } catch (err) {
        console.error('Failed to load item master reference data', err);
      }
    };

    fetchData();

    setTimeout(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select?.();
    }, 100);
  }, [isOpen, initialItemName, defaultGstType]);

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'brand' && value) {
      const selectedBrand = brands.find((b) => b.id === value);
      if (selectedBrand?.hsnId) {
        setFormData((prev) => ({ ...prev, hsn_code: selectedBrand.hsnId }));
        const selectedHsn = hsns.find((h) => h.id === selectedBrand.hsnId);
        if (selectedHsn) {
          setFormData((prev) => ({ ...prev, gst_percent: selectedHsn.gst_percentage }));
        }
      }
    }

    if (name === 'hsn_code' && value) {
      const selectedHsn = hsns.find((h) => h.id === value);
      if (selectedHsn) {
        setFormData((prev) => ({ ...prev, gst_percent: selectedHsn.gst_percentage }));
      }
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!formData.name?.trim()) nextErrors.name = 'Item name is required';
    if (!formData.sale_rate || Number(formData.sale_rate) <= 0) {
      nextErrors.sale_rate = 'Valid sale rate is required';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm() || submitting) return;

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('item_name', formData.name.trim());
      payload.append('sale_rate', Number(formData.sale_rate));
      payload.append('stock', Number(formData.stock) || 0);
      payload.append('is_gst', Number(formData.is_gst));

      if (formData.barcode?.trim()) payload.append('barcode', formData.barcode.trim());
      if (formData.purchase_rate) payload.append('purchase_rate', Number(formData.purchase_rate));
      if (formData.mrp_rate) payload.append('mrp_rate', Number(formData.mrp_rate));
      if (formData.gst_percent) payload.append('gst_percent', Number(formData.gst_percent));
      if (formData.brand) payload.append('brand_id', formData.brand);
      if (formData.department) payload.append('dept_id', formData.department);
      if (formData.hsn_code) payload.append('hsn_id', formData.hsn_code);

      const response = await api.post('/items', payload);
      const rawData = response?.data?.data || response?.data || {};
      const normalized = normalizeItem(rawData);

      const itemToReturn = {
        ...rawData,
        id: normalized.id,
        name: normalized.itemName || formData.name.trim(),
        amount: normalized.amount || Number(formData.sale_rate),
        sale_rate: normalized.amount || Number(formData.sale_rate),
        purchase_rate: normalized.purchase_rate || Number(formData.purchase_rate || 0),
        purchaseRate: normalized.purchase_rate || Number(formData.purchase_rate || 0),
        barcode: normalized.barcode || formData.barcode?.trim() || '',
        type: normalized.type,
        stockCount: normalized.stockCount || Number(formData.stock || 0)
      };

      showToast(`Item '${itemToReturn.name}' created and added!`, 'success');

      if (typeof onItemCreated === 'function') {
        onItemCreated(itemToReturn);
      }

      onClose();
    } catch (error) {
      console.error('Quick add item error:', error);
      const msg = error?.response?.data?.message || 'Failed to create item';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quick Add Item"
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Item Name *
            </label>
            <input
              ref={nameInputRef}
              type="text"
              value={formData.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="Enter item name"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Sale Rate (₹) *
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={formData.sale_rate}
              onChange={(e) => handleChange('sale_rate', e.target.value)}
              placeholder="0.00"
              required
              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                errors.sale_rate ? 'border-red-500' : 'border-gray-300'
              }`}
            />
            {errors.sale_rate && (
              <p className="text-xs text-red-500 mt-1">{errors.sale_rate}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchase Rate (₹)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={formData.purchase_rate}
              onChange={(e) => handleChange('purchase_rate', e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              MRP (₹)
            </label>
            <input
              type="number"
              step="any"
              min="0"
              value={formData.mrp_rate}
              onChange={(e) => handleChange('mrp_rate', e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opening Stock (Pcs)
            </label>
            <input
              type="number"
              min="0"
              value={formData.stock}
              onChange={(e) => handleChange('stock', e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Barcode / Part No
            </label>
            <input
              type="text"
              value={formData.barcode}
              onChange={(e) => handleChange('barcode', e.target.value)}
              placeholder="Scan or enter barcode"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brand
            </label>
            <SearchableSelect
              value={formData.brand}
              onChange={(val) => handleChange('brand', val)}
              placeholder="Select Brand"
              searchPlaceholder="Search brand..."
              options={brands.map((b) => ({ value: b.id, label: b.name }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department
            </label>
            <SearchableSelect
              value={formData.department}
              onChange={(val) => handleChange('department', val)}
              placeholder="Select Department"
              searchPlaceholder="Search department..."
              options={departments.map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              HSN Code & GST Rate
            </label>
            <SearchableSelect
              value={formData.hsn_code}
              onChange={(val) => handleChange('hsn_code', val)}
              placeholder="Select HSN Code"
              searchPlaceholder="Search HSN..."
              options={hsns.map((h) => ({
                value: h.id,
                label: `${h.hsn_number} (${h.gst_percentage}%)`
              }))}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Save & Add to Bill'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};

export default QuickAddItemModal;
