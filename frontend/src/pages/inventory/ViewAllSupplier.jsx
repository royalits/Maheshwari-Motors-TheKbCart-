import React, { useState, useEffect } from 'react';
import { DataTable } from '../../components/common';
import api from '../../services/axiosInstance';

const ViewAllSupplier = () => {
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">View All Creditors</h1>
          {/* <p className="text-gray-600">View all supplier</p> */}
        </div>
      </div>

      <DataTable loading={loading} columns={columns} data={suppliers} searchable sortable pagination />
    </div>
  );
};

export default ViewAllSupplier;
