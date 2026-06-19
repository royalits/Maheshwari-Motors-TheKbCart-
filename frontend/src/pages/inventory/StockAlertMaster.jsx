import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { DataTable } from '../../components/common';
import { SearchableSelect } from '../../components/ui';
import api from '../../services/axiosInstance';
import useKeyboardShortcuts from '../../hooks/useKeyboardShortcuts';

const StockAlertMaster = () => {
  const queryClient = useQueryClient();
  const [labelFilter, setLabelFilter] = useState('all');
  const [brandFilter, setBrandFilter] = useState('all');

  useKeyboardShortcuts({
    onRefresh: () => {
      queryClient.invalidateQueries({ queryKey: ['items-low-stock'] });
      queryClient.invalidateQueries({ queryKey: ['labels', 'stock-alert'] });
      queryClient.invalidateQueries({ queryKey: ['brands', 'stock-alert'] });
    },
    onResetFilters: () => { setLabelFilter('all'); setBrandFilter('all'); },
  });

  const { data: lowStockData, isLoading: lowStockLoading } = useQuery({
    queryKey: ['items-low-stock', { page: 1, limit: 200 }],
    queryFn: () => api.get('/items/low-stock', { params: { page: 1, limit: 200 } }),
    staleTime: 2 * 60 * 1000,
  });

  const { data: labelsData, isLoading: labelsLoading } = useQuery({
    queryKey: ['labels', 'stock-alert'],
    queryFn: () => api.get('/labels'),
    staleTime: 10 * 60 * 1000,
  });

  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ['brands', 'stock-alert'],
    queryFn: () => api.get('/brands'),
    staleTime: 10 * 60 * 1000,
  });

  const isLoading = lowStockLoading || labelsLoading || brandsLoading;

  const stockAlerts = useMemo(() => {
    const val = lowStockData?.data?.data;
    const items = Array.isArray(val) ? val : (val?.data || []);
    return items.map(i => ({
      id: i._id,
      itemName: i.item_name,
      stockCount: i.stock,
      threshold: i.threshold || i.low_stock_threshold || 5,
      status: (Number(i.stock) || 0) <= (Number(i.threshold) || Number(i.low_stock_threshold) || 5) ? 'LOW' : 'OK',
      labelId: i.label_id,
      brandId: i.brand_id,
    }));
  }, [lowStockData]);

  const labels = useMemo(() => {
    const data = labelsData?.data?.data;
    return Array.isArray(data) ? data : (data?.data || []);
  }, [labelsData]);

  const brands = useMemo(() => {
    const data = brandsData?.data?.data;
    return Array.isArray(data) ? data : (data?.data || []);
  }, [brandsData]);

  const columns = [
    { key: 'id', label: 'ID', render: (value, row, index) => <span className="text-xs sm:text-sm">{index + 1}</span> },
    { key: 'itemName', label: 'Item Name', render: (value) => <span className="text-xs sm:text-sm font-medium truncate">{value}</span> },
    {
      key: 'stockCount',
      label: 'Stock Count',
      render: (value, row) => (
        <span className={`text-xs sm:text-sm ${row.status === 'LOW' ? 'text-red-600 font-medium' : 'text-gray-900'}`}>
          {value}
        </span>
      )
    },
    { key: 'threshold', label: 'Threshold', render: (value) => <span className="text-xs sm:text-sm">{value}</span> },
    {
      key: 'brandId',
      label: 'Brand',
      render: (value) => {
        const brand = brands.find(b => b._id === value);
        return <span className="text-xs sm:text-sm">{brand?.brand_name || brand?.name || 'N/A'}</span>;
      }
    }
  ];

  const [showOnlyLow, setShowOnlyLow] = useState(false);
  const filteredData = stockAlerts.filter(item => {
    if (showOnlyLow && item.status !== 'LOW') return false;
    if (labelFilter !== 'all' && String(item.labelId) !== String(labelFilter)) return false;
    if (brandFilter !== 'all' && String(item.brandId) !== String(brandFilter)) return false;
    return true;
  });

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Stock Alert Master</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Monitor items below threshold levels</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div className="bg-red-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-red-500">
          <h3 className="text-xs sm:text-sm font-medium text-red-800">Low Stock Items</h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-red-900">
            {stockAlerts.filter(item => item.status === 'LOW').length}
          </p>
        </div>
        <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-blue-500">
          <h3 className="text-xs sm:text-sm font-medium text-blue-800">Total Items</h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-900">{stockAlerts.length}</p>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter by Label:</label>
            <SearchableSelect
              value={labelFilter}
              onChange={setLabelFilter}
              placeholder="All Labels"
              searchPlaceholder="Search label..."
              options={labels.map((label) => ({ value: label._id, label: label.name }))}
              buttonClassName="min-w-[220px] text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Filter by Brand:</label>
            <SearchableSelect
              value={brandFilter}
              onChange={setBrandFilter}
              placeholder="All Brands"
              searchPlaceholder="Search brand..."
              options={brands.map((brand) => ({ value: brand._id, label: brand.name }))}
              buttonClassName="min-w-[220px] text-sm"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={isLoading}
          columns={columns}
          data={filteredData}
          searchable={true}
          searchPlaceholder="Search by Item Name, Stock Count, Threshold, Brand, Label..."
          sortable={true}
          pagination={true}
          minWidth="600px"
          className="text-xs sm:text-sm"
        />
      </div>
    </div>
  );
};

export default StockAlertMaster;
