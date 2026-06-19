import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FaSave, FaPlus } from 'react-icons/fa';
import { Button, Modal } from '../../components/ui';
import { getEntityId, getResponseList, normalizeItem } from '../../services/apiUtils';
import useStore from '../../store';
import api from '../../services/axiosInstance';
import useSaveShortcut from '../../hooks/useSaveShortcut';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const DiscountMaster = () => {
  const { showToast } = useStore();
  const [brands, setBrands] = useState([]);
  const [discounts, setDiscounts] = useState({});
  const [itemDiscounts, setItemDiscounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [labels, setLabels] = useState([]);
  const [labelDetailsMap, setLabelDetailsMap] = useState({});
  const [selectedLabel, setSelectedLabel] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);
  const [itemSearch, setItemSearch] = useState('');
  const [brandItems, setBrandItems] = useState([]);
  const [brandItemsLoading, setBrandItemsLoading] = useState(false);
  const [brandItemsError, setBrandItemsError] = useState('');
  const [isAddLabelModalOpen, setIsAddLabelModalOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const firstFieldRef = useRef(null);

  const listFromResponse = (res) => {
    const payload = res?.data?.data;
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    return [];
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
    const fetchCategoriesAndLabels = async () => {
      try {
        const detailedRes = await api.get('/labels/detailed', {
          params: { page: 1, limit: 200 },
          signal: controller.signal
        });
        const fetchedLabels = listFromResponse(detailedRes);
        const labelList = fetchedLabels.map((label) => ({
          id: getEntityId(label),
          name: label?.name || label?.label_name || '',
          categoryId: getEntityId(label?.category_id)
        }));
        setLabels(labelList);
        const mapped = {};
        fetchedLabels.forEach((label) => {
          const labelId = getEntityId(label);
          if (labelId) mapped[labelId] = label;
        });
        setLabelDetailsMap(mapped);
      } catch (error) {
        if (error?.name === 'CanceledError') return;
        try {
          const res = await api.get('/labels', {
            params: { page: 1, limit: 200 },
            signal: controller.signal
          });
          const fetchedLabels = listFromResponse(res);
          const labelList = fetchedLabels.map((label) => ({
            id: getEntityId(label),
            name: label?.name || label?.label_name || '',
            categoryId: getEntityId(label?.category_id)
          }));
          setLabels(labelList);
          setLabelDetailsMap({});
        } catch (fallbackError) {
          if (fallbackError?.name !== 'CanceledError') {
            showToast('Failed to load labels', 'error');
          }
        }
      }
    };

    fetchCategoriesAndLabels();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (isAddLabelModalOpen) {
      focusFirstField();
    }
  }, [isAddLabelModalOpen]);

  useEffect(() => {
    if (!selectedLabel?.id) {
      setBrands([]);
      setDiscounts({});
      setItemDiscounts({});
      setSelectedBrand(null);
      setBrandItems([]);
      setBrandItemsError('');
      return;
    }

    const controller = new AbortController();
    const fetchLabelDiscounts = async () => {
      try {
        const cached = labelDetailsMap[selectedLabel.id];
        const labelData = cached
          ? cached
          : (await api.get(`/labels/${selectedLabel.id}`, { signal: controller.signal }))
              ?.data?.data;
        const brandDiscounts = labelData?.brand_discounts || [];
        
        const list = brandDiscounts
          .filter((item) => item?.brand_id)
          .map((item) => {
            const normalizedItemDiscounts = Array.isArray(item.item_discounts)
              ? item.item_discounts
                  .map((entry) => {
                    const itemRef = entry?.item_id || {};
                    const itemId = getEntityId(itemRef) || getEntityId(entry?.item_id);
                    if (!itemId) return null;
                    return {
                      item_id: itemId,
                      item_name:
                        itemRef?.item_name || itemRef?.name || entry?.item_name || '',
                      discount: Number(entry?.discount ?? 0)
                    };
                  })
                  .filter(Boolean)
              : [];

            return {
              id: item.brand_id?._id || item.brand_id,
              name: item.brand_id?.name || '',
              discount1: item.disc1 || { normal: 0, special: 0 },
              discount2: item.disc2 || { normal: 0, special: 0 },
              item_discounts: normalizedItemDiscounts
            };
          });
        setBrands(list);
        setSelectedBrand((prev) => {
          if (!prev) return null;
          return list.find((brand) => String(brand.id) === String(prev.id)) || null;
        });

        const discountMap = {};
        const itemDiscountMap = {};
        list.forEach((b) => {
          discountMap[b.id] = {
            discount1: b.discount1,
            discount2: b.discount2
          };

          const perBrand = {};
          b.item_discounts.forEach((entry) => {
            const itemId = getEntityId(entry?.item_id) || entry?.item_id;
            if (!itemId) return;
            const discountValue = Number(entry?.discount ?? 0);
            perBrand[itemId] = Number.isFinite(discountValue) ? discountValue : 0;
          });
          itemDiscountMap[b.id] = perBrand;
        });
        setDiscounts(discountMap);
        setItemDiscounts(itemDiscountMap);
      } catch (error) {
        if (error?.name !== 'CanceledError') {
          showToast('Failed to load brand discounts', 'error');
        }
      }
    };

    fetchLabelDiscounts();
    return () => controller.abort();
  }, [selectedLabel?.id, showToast, labelDetailsMap]);

  useEffect(() => {
    if (!selectedBrand?.id) {
      setBrandItems([]);
      setBrandItemsError('');
      return;
    }

    const controller = new AbortController();
    const loadItems = async () => {
      setBrandItemsLoading(true);
      setBrandItemsError('');

      const seedItems = Array.isArray(selectedBrand?.item_discounts)
        ? selectedBrand.item_discounts
            .map((entry) => {
              const itemId = getEntityId(entry?.item_id) || entry?.item_id;
              if (!itemId) return null;
              return {
                id: itemId,
                itemName: entry?.item_name || entry?.item_id?.item_name || entry?.item_id?.name || '',
                amount: null
              };
            })
            .filter(Boolean)
        : [];

      if (seedItems.length > 0) {
        const seedMap = new Map(seedItems.map((item) => [String(item.id), item]));
        setBrandItems(Array.from(seedMap.values()));
      } else {
        setBrandItems([]);
      }

      try {
        const res = await api.get('/items', {
          params: { page: 1, limit: 200, brand_id: selectedBrand.id },
          signal: controller.signal,
        });
        const itemList = getResponseList(res).map((item) => normalizeItem(item));
        const filtered = itemList.filter(
          (item) => String(item.brandId) === String(selectedBrand.id),
        );
        const mergedMap = new Map(filtered.map((item) => [String(item.id), item]));
        seedItems.forEach((item) => {
          if (!mergedMap.has(String(item.id))) {
            mergedMap.set(String(item.id), item);
          }
        });
        setBrandItems(Array.from(mergedMap.values()));
      } catch (error) {
        if (error?.name === 'CanceledError') return;
        // Fallback: load all items and filter client-side
        try {
          const fallbackRes = await api.get('/items', {
            params: { page: 1, limit: 1000 },
            signal: controller.signal,
          });
          const allItems = getResponseList(fallbackRes).map((item) => normalizeItem(item));
          const filtered = allItems.filter(
            (item) => String(item.brandId) === String(selectedBrand.id),
          );
          const mergedMap = new Map(filtered.map((item) => [String(item.id), item]));
          seedItems.forEach((item) => {
            if (!mergedMap.has(String(item.id))) {
              mergedMap.set(String(item.id), item);
            }
          });
          setBrandItems(Array.from(mergedMap.values()));
        } catch (fallbackError) {
          if (fallbackError?.name === 'CanceledError') return;
          const message =
            fallbackError?.response?.data?.message ||
            error?.response?.data?.message ||
            'Failed to load items';
          setBrandItemsError(message);
          showToast(message, 'error');
        }
      } finally {
        setBrandItemsLoading(false);
      }
    };

    loadItems();

    return () => controller.abort();
  }, [selectedBrand?.id, showToast]);

  const filteredItems = useMemo(() => {
    if (!selectedBrand?.id) return [];
    if (!itemSearch.trim()) return brandItems;
    const needle = itemSearch.trim().toLowerCase();
    return brandItems.filter((item) =>
      String(item.itemName || "").toLowerCase().includes(needle),
    );
  }, [brandItems, selectedBrand, itemSearch]);

  const updateDiscount = (brandId, discountType, field, value) => {
    setDiscounts((prev) => ({
      ...prev,
      [brandId]: {
        ...prev[brandId],
        [discountType]: {
          ...prev[brandId]?.[discountType],
          [field]: Number(value) || 0
        }
      }
    }));
  };

  const updateItemDiscountSingle = (brandId, itemId, value) => {
    const numeric = Number(value) || 0;
    setItemDiscounts((prev) => ({
      ...prev,
      [brandId]: {
        ...prev[brandId],
        [itemId]: numeric
      }
    }));
  };

  const getDiscount = (brandId, discountType, field) => {
    return discounts[brandId]?.[discountType]?.[field] || 0;
  };

  const getItemDiscount = (brandId, itemId) => {
    const value = itemDiscounts[brandId]?.[itemId];
    return Number.isFinite(value) ? value : 0;
  };

  const handleSave = async () => {
    if (saving || !selectedLabel?.id) return;
    
    // Check if we have any brands to save
    if (brands.length === 0) {
      showToast('No brands available to save discounts for', 'error');
      return;
    }
    
    if (Object.keys(discounts).length === 0) {
      showToast('No discount data to save', 'error');
      return;
    }

    const brandValues = Object.values(discounts).flatMap((d) => [
      Number(d?.discount1?.normal || 0),
      Number(d?.discount1?.special || 0),
      Number(d?.discount2?.normal || 0),
      Number(d?.discount2?.special || 0),
    ]);
    const itemValues = Object.values(itemDiscounts).flatMap((brandItems) =>
      Object.values(brandItems || {}).map((value) => Number(value || 0)),
    );
    const allValues = [...brandValues, ...itemValues];

    if (allValues.some((n) => Number.isNaN(n) || n < 0 || n > 100)) {
      showToast('Discount values must be between 0 and 100', 'error');
      return;
    }

    const brandDiscounts = brands.map((brand) => {
      const perBrandItems = itemDiscounts[brand.id] || {};
      const itemDiscountList = Object.entries(perBrandItems)
        .filter(([itemId, discount]) => Number(discount || 0) > 0) // Only include items with actual discounts
        .map(([itemId, discount]) => ({
          item_id: itemId,
          discount: Number(discount || 0)
        }));

      return {
        brand_id: String(brand.id), // Ensure brand_id is a string
        disc1: discounts[brand.id]?.discount1 || { normal: 0, special: 0 },
        disc2: discounts[brand.id]?.discount2 || { normal: 0, special: 0 },
        item_discounts: itemDiscountList
      };
    });

    setSaving(true);
    try {
      console.log('Saving brand discounts:', JSON.stringify(brandDiscounts, null, 2));
      await api.put(`/labels/${selectedLabel.id}`, { brand_discounts: brandDiscounts });
      showToast('✅ Discounts saved successfully! Changes will be applied in bills/challans.', 'success');
      
      // Clear the cache to force fresh data fetch
      setLabelDetailsMap(prev => {
        const updated = { ...prev };
        delete updated[selectedLabel.id];
        return updated;
      });
      
      // Refresh the data to show updated values
      const res = await api.get(`/labels/${selectedLabel.id}`);
      const labelData = res?.data?.data || {};
      const refreshedBrandDiscounts = labelData?.brand_discounts || [];
      
      const list = refreshedBrandDiscounts
        .filter((item) => item?.brand_id)
        .map((item) => {
          const normalizedItemDiscounts = Array.isArray(item.item_discounts)
            ? item.item_discounts
                .map((entry) => {
                  const itemRef = entry?.item_id || {};
                  const itemId = getEntityId(itemRef) || getEntityId(entry?.item_id);
                  if (!itemId) return null;
                  return {
                    item_id: itemId,
                    item_name:
                      itemRef?.item_name || itemRef?.name || entry?.item_name || '',
                    discount: Number(entry?.discount ?? 0)
                  };
                })
                .filter(Boolean)
            : [];

          return {
            id: item.brand_id?._id || item.brand_id,
            name: item.brand_id?.name || '',
            discount1: item.disc1 || { normal: 0, special: 0 },
            discount2: item.disc2 || { normal: 0, special: 0 },
            item_discounts: normalizedItemDiscounts
          };
        });
      setBrands(list);
      setSelectedBrand((prev) => {
        if (!prev) return null;
        return list.find((brand) => String(brand.id) === String(prev.id)) || null;
      });

      const discountMap = {};
      const itemDiscountMap = {};
      list.forEach((b) => {
        discountMap[b.id] = {
          discount1: b.discount1,
          discount2: b.discount2
        };

        const perBrand = {};
        b.item_discounts.forEach((entry) => {
          const itemId = getEntityId(entry?.item_id) || entry?.item_id;
          if (!itemId) return;
          const discountValue = Number(entry?.discount ?? 0);
          perBrand[itemId] = Number.isFinite(discountValue) ? discountValue : 0;
        });
        itemDiscountMap[b.id] = perBrand;
      });
      setDiscounts(discountMap);
      setItemDiscounts(itemDiscountMap);
    } catch (error) {
      console.error('Save error details:', {
        message: error?.response?.data?.message,
        status: error?.response?.status,
        data: error?.response?.data,
        fullError: error
      });
      const errorMessage = error?.response?.data?.message || 
                          error?.message || 
                          'Failed to save discounts';
      showToast(`❌ ${errorMessage}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(handleSave, !!selectedLabel);

  useKeyboardShortcuts({
    onAdd: () => setIsAddLabelModalOpen(true),
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Discount Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage discount rates by label and brand</p>
        </div>
        <Button onClick={handleSave} className="flex items-center gap-2 text-xs sm:text-sm" disabled={saving || !selectedLabel}><FaSave className="text-sm sm:text-base" />Save Changes</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3 sm:p-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-semibold text-gray-900">Labels</h3>
                <p className="text-xs text-gray-500 mt-1">Select label to manage</p>
              </div>
              <button onClick={() => setIsAddLabelModalOpen(true)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors">
                <FaPlus className="text-blue-600 text-sm" />
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {labels.length === 0 ? (
                <div className="p-4 text-center text-gray-500 text-sm">No labels available</div>
              ) : labels.map((label) => (
                <div key={label.id} onClick={() => setSelectedLabel(label)} className={`p-3 cursor-pointer border-b border-gray-100 hover:bg-green-50 transition-colors ${selectedLabel?.id === label.id ? 'bg-green-50 border-l-4 border-l-green-500 text-green-900' : 'text-gray-700'}`}>
                  <div className="text-sm font-medium">{label.name}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="p-3 sm:p-4 border-b border-gray-200">
              <h3 className="text-sm sm:text-base font-semibold text-gray-900">{selectedLabel ? `${selectedLabel.name} - Brand Discounts` : 'Brand Discounts'}</h3>
            </div>

            {!selectedLabel ? (
              <div className="flex items-center justify-center py-12"><p className="text-sm text-gray-500">Select a label to manage discount rates</p></div>
            ) : brands.length === 0 ? (
              <div className="flex items-center justify-center py-12"><p className="text-sm text-gray-500">No brands available for this label</p></div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 p-3 sm:p-4">
                <div className="xl:col-span-2 overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 sm:px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">Brand</th>
                        <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200">
                          <div className="mb-2">Discount</div>
                          <div className="flex gap-2 text-[10px] normal-case font-normal">
                            <div className="w-full">Normal</div>
                            <div className="w-full">Special</div>
                          </div>
                        </th>
                        <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          <div className="mb-2"> Discount</div>
                          <div className="flex gap-2 text-[10px] normal-case font-normal">
                            <div className="w-full">Normal</div>
                            <div className="w-full">Special</div>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {brands.map((brand) => {
                        const isActive = String(selectedBrand?.id || '') === String(brand.id);
                        return (
                          <tr
                            key={brand.id}
                            onClick={() => setSelectedBrand(brand)}
                            className={`cursor-pointer transition-colors ${
                              isActive ? 'bg-blue-50' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-3 sm:px-4 py-3 text-xs sm:text-sm font-medium text-gray-900 border-r border-gray-200">
                              <div className="flex items-center gap-2">
                                <span>{brand.name}</span>
                                {isActive && <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Selected</span>}
                              </div>
                            </td>
                            <td className="px-2 py-3 border-r border-gray-200">
                              <div className="flex gap-2">
                                <input type="number" step="0.01" min="0" max="100" value={getDiscount(brand.id, 'discount1', 'normal')} onChange={(e) => updateDiscount(brand.id, 'discount1', 'normal', e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-xs text-center border border-gray-300 rounded-md" />
                                <input type="number" step="0.01" min="0" max="100" value={getDiscount(brand.id, 'discount1', 'special')} onChange={(e) => updateDiscount(brand.id, 'discount1', 'special', e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-xs text-center border border-gray-300 rounded-md" />
                              </div>
                            </td>
                            <td className="px-2 py-3">
                              <div className="flex gap-2">
                                <input type="number" step="0.01" min="0" max="100" value={getDiscount(brand.id, 'discount2', 'normal')} onChange={(e) => updateDiscount(brand.id, 'discount2', 'normal', e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-xs text-center border border-gray-300 rounded-md" />
                                <input type="number" step="0.01" min="0" max="100" value={getDiscount(brand.id, 'discount2', 'special')} onChange={(e) => updateDiscount(brand.id, 'discount2', 'special', e.target.value)} onWheel={(e) => e.target.blur()} className="w-full px-2 py-1.5 text-xs text-center border border-gray-300 rounded-md" />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="xl:col-span-1">
                  <div className="border rounded-lg h-full">
                    <div className="px-4 py-3 border-b bg-gray-50">
                      <div className="text-sm font-semibold text-gray-900">Brand Items</div>
                      <div className="text-xs text-gray-500">
                        {selectedBrand ? `${selectedBrand.name} (${brandItems.length})` : 'Select a brand to view items'}
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <input
                        type="text"
                        value={itemSearch}
                        onChange={(e) => setItemSearch(e.target.value)}
                        placeholder="Search items..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                        disabled={!selectedBrand}
                      />
                      <div className="max-h-[420px] overflow-y-auto">
                        {!selectedBrand ? (
                          <p className="text-sm text-gray-500">Click a brand row to see items.</p>
                        ) : brandItemsLoading ? (
                          <p className="text-sm text-gray-500">Loading items...</p>
                        ) : brandItemsError ? (
                          <p className="text-sm text-red-600">{brandItemsError}</p>
                        ) : filteredItems.length === 0 ? (
                          <p className="text-sm text-gray-500">No items found for this brand.</p>
                        ) : (
                          <ul className="space-y-2">
                            {filteredItems.map((item) => (
                              <li key={item.id} className="rounded-md border border-gray-100 px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                  <div className="font-medium text-gray-900 truncate">{item.itemName}</div>
                                  <div className="text-xs text-gray-500">
                                      {Number.isFinite(Number(item.amount))
                                        ? `Rs. ${Number(item.amount).toFixed(2)}`
                                        : 'Rs. --'}
                                  </div>
                                </div>
                                  <div className="flex flex-col items-end gap-1">
                                    <div className="text-[10px] text-gray-500">Item Discount (%)</div>
                                    <input
                                      type="number"
                                      step="0.01"
                                      min="0"
                                      max="100"
                                      value={getItemDiscount(selectedBrand.id, item.id)}
                                      onChange={(e) =>
                                        updateItemDiscountSingle(selectedBrand.id, item.id, e.target.value)
                                      }
                                      onWheel={(e) => e.target.blur()}
                                      className="w-20 px-2 py-1.5 text-xs text-center border border-gray-300 rounded-md"
                                      placeholder="0"
                                    />
                                  </div>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <Modal isOpen={isAddLabelModalOpen} onClose={() => { setIsAddLabelModalOpen(false); setNewLabelName(''); }} title="Add New Label" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Label Name</label>
            <input ref={firstFieldRef} type="text" value={newLabelName} onChange={(e) => setNewLabelName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500" placeholder="Enter label name" />
          </div>
          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => { setIsAddLabelModalOpen(false); setNewLabelName(''); }}>Cancel</Button>
            <Button onClick={async () => {
              if (!newLabelName.trim()) {
                showToast('Label name is required', 'error');
                return;
              }
              try {
                await api.post('/labels', { name: newLabelName });
                showToast('Label added successfully', 'success');
                let fetchedLabels = [];
                try {
                  const res = await api.get('/labels/detailed', { params: { page: 1, limit: 200 } });
                  fetchedLabels = listFromResponse(res);
                  const mapped = {};
                  fetchedLabels.forEach((label) => {
                    const labelId = getEntityId(label);
                    if (labelId) mapped[labelId] = label;
                  });
                  setLabelDetailsMap(mapped);
                } catch (fetchError) {
                  const fallbackRes = await api.get('/labels', { params: { page: 1, limit: 200 } });
                  fetchedLabels = listFromResponse(fallbackRes);
                  setLabelDetailsMap({});
                }
                const list = fetchedLabels.map((label) => ({
                  id: getEntityId(label),
                  name: label?.name || label?.label_name || '',
                  categoryId: getEntityId(label?.category_id)
                }));
                setLabels(list);
                setNewLabelName('');
                focusFirstField();
              } catch (error) {
                showToast(error?.response?.data?.message || 'Failed to add label', 'error');
              }
            }}>Add Label</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default DiscountMaster;

