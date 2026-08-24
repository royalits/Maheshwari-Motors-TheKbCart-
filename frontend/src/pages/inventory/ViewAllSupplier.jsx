import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaPlus } from 'react-icons/fa';
import { DataTable } from '../../components/common';
import { Button } from '../../components/ui';
import api from '../../services/axiosInstance';

const ViewAllSupplier = () => {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchSuppliers = async () => {
      setLoading(true);
      try {
        const response = await api.get('/contacts', {
          params: { page: 1, limit: 200, type: 'supplier' },
          signal: controller.signal
        });
        const payload = response?.data?.data;
        const list = Array.isArray(payload) ? payload : (Array.isArray(payload?.data) ? payload.data : []);

        setSuppliers(list.map((s) => ({
          id: s._id,
          name: s.name,
          contact: s.phone,
          email: s.email,
          address: s.address,
          city: s.city,
          state: s.state,
          gstin: s.gstin
        })));
      } catch (error) {
        if (error?.name !== 'CanceledError') {
          console.error('Failed to fetch suppliers', error);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSuppliers();
    return () => controller.abort();
  }, []);

  const columns = [
    // { key: 'id', label: 'ID' },
        { key: 'id', label: ' ID', render: (val, row, index) => <span className="text-xs">{index + 1}</span> },

    { key: 'name', label: 'Supplier Name' },
    { key: 'contact', label: 'Contact' },
    { key: 'email', label: 'Email' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { key: 'gstin', label: 'GSTIN', render: (val) => val || 'N/A' }
  ];

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">View All Creditors</h1>
          <p className="text-gray-600 text-xs sm:text-sm">Manage suppliers & creditors</p>
        </div>
        <Button
          onClick={() => navigate('/inventory/add-creditors')}
          className="flex items-center gap-2 text-xs sm:text-sm"
        >
          <FaPlus className="text-sm sm:text-base" />
          Add Supplier
        </Button>
      </div>

      <DataTable loading={loading} columns={columns} data={suppliers} searchable sortable pagination />
    </div>
  );
};

export default ViewAllSupplier;
