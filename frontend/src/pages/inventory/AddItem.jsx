import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import { FaDownload, FaSave } from 'react-icons/fa';
import { Button, Input, SearchableSelect } from '../../components/ui';
import ItemQrPreview from '../../components/inventory/ItemQrPreview';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import {
  getResponseData,
  getResponseList,
  normalizeBrand,
  normalizeItem,
  getEntityId,
  toNumber
} from '../../services/apiUtils';
import { downloadSingleItemQrLabel } from '../../utils/itemQr';

const AddItem = () => {
  const navigate = useNavigate();
  const { showToast } = useStore();
  const [allBrands, setAllBrands] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [hsns, setHsns] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [createdItem, setCreatedItem] = useState(null);
  const nameRef = useRef(null);

  const [formData, setFormData] = useState({
    name: '',
    alias: '',
    item_id: '',
    barcode: '',
    stock: '0', // Default to '0'
    brand: '',
    department: '',
    hsn_code: '',
    description: '',
    gst_percent: '',
    sale_rate: '',
    purchase_rate: '',
    mrp_rate: '',
    discount: '',
    image: null,
    threshold: '',
    is_gst: 1
  });

  const [errors, setErrors] = useState({});

  const resetForm = () => {
    setFormData({
      name: '',
      alias: '',
      item_id: '',
      barcode: '',
      stock: '0', // Default to '0' instead of empty
      brand: '',
      department: '',
      hsn_code: '',
      description: '',
      gst_percent: '',
      sale_rate: '',
      purchase_rate: '',
      mrp_rate: '',
      discount: '',
      image: null,
      threshold: '',
      is_gst: 1
    });
    setErrors({});
    // Focus back to the first field
    setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select?.();
    }, 100);
  };

  useEffect(() => {
    const controller = new AbortController();

    const fetchData = async () => {
      try {
        const [brandRes, deptRes, hsnRes] = await Promise.all([
          api.get('/brands', { params: { page: 1, limit: 200 }, signal: controller.signal }),
          api.get('/departments', { params: { page: 1, limit: 200 }, signal: controller.signal }),
          api.get('/hsn', { params: { page: 1, limit: 200 }, signal: controller.signal })
        ]);

        const brds = getResponseList(brandRes).map(normalizeBrand);
        const depts = getResponseList(deptRes).map((dept) => ({
          id: dept._id,
          name: dept.name || ''
        }));
        const hsnList = getResponseList(hsnRes)
          .filter((hsn) => hsn?.is_active !== false)
          .map((hsn) => ({
            id: getEntityId(hsn),
            hsn_number: hsn?.hsn_code || '',
            gst_percentage: toNumber(hsn?.gst_rate, 0)
          }));

        setAllBrands(brds);
        setDepartments(depts);
        setHsns(hsnList);
      } catch (error) {
        if (error?.name !== 'CanceledError') {
          showToast('Failed to load form data', 'error');
        }
      }
    };

    fetchData();
    return () => controller.abort();
  }, [showToast]);

  useEffect(() => {
    const handle = setTimeout(() => {
      nameRef.current?.focus();
      nameRef.current?.select?.();
    }, 0);
    return () => clearTimeout(handle);
  }, []);



  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'brand' && value) {
      const selectedBrand = allBrands.find((brand) => brand.id === value);
      if (selectedBrand?.hsnId) {
        setFormData((prev) => ({ ...prev, hsn_code: selectedBrand.hsnId }));
        const selectedHsn = hsns.find((hsn) => hsn.id === selectedBrand.hsnId);
        if (selectedHsn) {
          setFormData((prev) => ({ ...prev, gst_percent: selectedHsn.gst_percentage }));
        }
      }
    }

    if (name === 'hsn_code' && value) {
      const selectedHsn = hsns.find((hsn) => hsn.id === value);
      if (selectedHsn) {
        setFormData((prev) => ({ ...prev, gst_percent: selectedHsn.gst_percentage }));
      }
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    setFormData((prev) => ({ ...prev, image: file || null }));
  };

  const validateForm = () => {
    const nextErrors = {};
    if (!formData.name?.trim()) nextErrors.name = 'Item name is required';
    if (!formData.sale_rate || Number(formData.sale_rate) <= 0) nextErrors.sale_rate = 'Valid sale rate is required';
    // Remove stock validation - allow zero or empty stock
    if (formData.image && formData.image.size > 5 * 1024 * 1024) nextErrors.image = 'File must be <= 5MB';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const appendOptional = (fd, key, value) => {
    if (value !== undefined && value !== null && String(value) !== '') fd.append(key, value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm() || submitting) return;

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('item_name', formData.name.trim());
      payload.append('sale_rate', Number(formData.sale_rate));
      payload.append('stock', Number(formData.stock) || 0); // Default to 0 if empty
      payload.append('is_gst', Number(formData.is_gst));

      appendOptional(payload, 'purchase_rate', formData.purchase_rate);
      appendOptional(payload, 'mrp_rate', formData.mrp_rate);
      appendOptional(payload, 'gst_percent', formData.gst_percent);
      appendOptional(payload, 'discount', formData.discount);
      appendOptional(payload, 'threshold', formData.threshold);
      appendOptional(payload, 'brand_id', formData.brand);
      appendOptional(payload, 'dept_id', formData.department);
      appendOptional(payload, 'hsn_id', formData.hsn_code);
      appendOptional(payload, 'description', formData.description);
      appendOptional(payload, 'alias', formData.alias);
      appendOptional(payload, 'item_id', formData.item_id);
      appendOptional(payload, 'barcode', formData.barcode);
      if (formData.image) payload.append('image', formData.image);

      const response = await api.post('/items', payload);
      const createdRecord = normalizeItem(getResponseData(response) || {});
      setCreatedItem(createdRecord);
      showToast('Item added successfully. QR label is ready to download.', 'success');
      resetForm(); // Clear form fields after successful creation
    } catch (error) {
      const msg = error?.response?.data?.message || 'Failed to add item';
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  useSaveShortcut(() => {
    if (!submitting) document.querySelector('form')?.requestSubmit();
  });

  const handleDownloadCreatedQr = async () => {
    if (!createdItem) return;

    try {
      await downloadSingleItemQrLabel(createdItem);
      showToast('QR label downloaded successfully', 'success');
    } catch (error) {
      showToast(error?.message || 'Failed to download QR label', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Item</h1>
          <p className="text-gray-600">Create a new inventory item</p>
        </div>
      </div>

      {createdItem && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                Latest Item QR
              </p>
              <div>
                <h2 className="text-xl font-semibold text-slate-900">
                  {createdItem.itemName}
                </h2>
                <p className="text-sm text-slate-600">
                  QR label is ready. You can print this small sticker and paste it on the item.
                </p>
              </div>
              <div className="grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
                <p>Item ID: {createdItem.item_id || '-'}</p>
                <p>Barcode: {createdItem.barcode || '-'}</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={handleDownloadCreatedQr}
                className="flex items-center gap-2"
              >
                <FaDownload />
                Download QR Label
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate('/inventory/item-master')}
              >
                View Items
              </Button>
            </div>
          </div>

          <div className="mt-5 flex justify-start">
            <ItemQrPreview item={createdItem} size={120} className="w-full max-w-[220px] bg-white" />
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-lg border">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item Name *</label>
              <Input ref={nameRef} name="name" value={formData.name} onChange={(value) => handleChange('name', value)} placeholder="Enter item name" />
              {errors.name && <p className="text-red-600 text-sm mt-1">{errors.name}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Alias</label>
              <Input name="alias" value={formData.alias} onChange={(value) => handleChange('alias', value)} placeholder="Enter alias" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Item ID</label>
              <Input 
                name="item_id" 
                type="text" 
                value={formData.item_id} 
                onChange={(value) => handleChange('item_id', value)} 
                placeholder="Enter item code or leave empty for auto-generation" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <Input name="barcode" value={formData.barcode} onChange={(value) => handleChange('barcode', value)} placeholder="Auto-generated if empty" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Stock</label>
              <Input 
                name="stock" 
                type="number" 
                value={formData.stock} 
                onChange={(value) => handleChange('stock', value)} 
                placeholder="Enter stock quantity (can be 0)" 
              />
              {errors.stock && <p className="text-red-600 text-sm mt-1">{errors.stock}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
              <SearchableSelect
                value={formData.brand || ''}
                onChange={(value) => handleChange('brand', value)}
                placeholder="Select Brand"
                searchPlaceholder="Search brand..."
                options={allBrands.map((brand) => ({ value: brand.id, label: brand.name }))}
                buttonClassName="text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <SearchableSelect
                value={formData.department || ''}
                onChange={(value) => handleChange('department', value)}
                placeholder="Select Department"
                searchPlaceholder="Search department..."
                options={departments.map((dept) => ({ value: dept.id, label: dept.name }))}
                buttonClassName="text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
              <SearchableSelect
                value={formData.hsn_code || ''}
                onChange={(value) => handleChange('hsn_code', value)}
                placeholder="Select HSN Code"
                searchPlaceholder="Search HSN..."
                options={hsns.map((hsn) => ({
                  value: hsn.id,
                  label: `${hsn.hsn_number} - ${hsn.gst_percentage}%`,
                  searchText: `${hsn.hsn_number} ${hsn.gst_percentage}`,
                }))}
                buttonClassName="text-sm"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea value={formData.description} onChange={(e) => handleChange('description', e.target.value)} rows="3" className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
            </div>

            <div><label className="block text-sm font-medium text-gray-700 mb-1">GST %</label><Input name="gst_percent" type="number" step="0.01" value={formData.gst_percent} onChange={(value) => handleChange('gst_percent', value)} disabled={!!formData.hsn_code} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Sale Rate *</label><Input name="sale_rate" type="number" step="0.01" value={formData.sale_rate} onChange={(value) => handleChange('sale_rate', value)} />{errors.sale_rate && <p className="text-red-600 text-sm mt-1">{errors.sale_rate}</p>}</div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Purchase Rate</label><Input name="purchase_rate" type="number" step="0.01" value={formData.purchase_rate} onChange={(value) => handleChange('purchase_rate', value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">MRP Rate</label><Input name="mrp_rate" type="number" step="0.01" value={formData.mrp_rate} onChange={(value) => handleChange('mrp_rate', value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Discount (%)</label><Input name="discount" type="number" step="0.01" min="0" max="100" value={formData.discount} onChange={(value) => handleChange('discount', value)} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Threshold</label><Input name="threshold" type="number" value={formData.threshold} onChange={(value) => handleChange('threshold', value)} /></div>
          </div>

          <div>
            <div
              onClick={() => setFormData(prev => ({ ...prev, is_gst: prev.is_gst === 0 ? 1 : 0 }))}
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
            <span className="text-xs text-gray-600 mt-1 block">{formData.is_gst === 1 ? '' : ''}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Item Image</label>
            <input type="file" accept="image/*" onChange={handleFileChange} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            {errors.image && <p className="text-red-600 text-sm mt-1">{errors.image}</p>}
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" className="flex items-center gap-2" disabled={submitting}><FaSave />{submitting ? 'Saving...' : 'Save Item'}</Button>
            <Button type="button" variant="outline" onClick={() => navigate('/inventory/item-master')}>Cancel</Button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddItem;
