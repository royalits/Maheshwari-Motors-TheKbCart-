import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  FaFileInvoiceDollar,
  FaExclamationTriangle,
  FaCalendarDay,
  FaArrowRight,
  FaBoxes,
  FaTags,
  FaUsers,
  FaHandshake,
  FaIndustry,
  FaUniversity,
  FaExchangeAlt,
  FaUndo,
  FaCheckCircle,
  FaClock,
  FaFileAlt,
} from 'react-icons/fa';
import useStore from '../../store';
import { StatsCard } from '../../components/common';
import { formatCurrency, formatDate } from '../../utils';
import { getResponseData } from '../../services/apiUtils';
import api from '../../services/axiosInstance';

const Dashboard = () => {
  const navigate = useNavigate();
  const selectedFirm = useStore((s) => s.selectedFirm);
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (user?.role === 'admin') {
      navigate('/masters/user-master');
    }
  }, [user, navigate]);

  const selectedFinancialYearId =
    localStorage.getItem('financial_year_id') || 'default';
  const enabled = Boolean(localStorage.getItem('token')) && user?.role !== 'admin';

  const dashboardQuery = useQuery({
    queryKey: [
      'dashboard',
      selectedFirm?.id || selectedFirm?._id || selectedFirm?.name || 'firm',
      selectedFirm?.firm_type || selectedFirm?.type || 'firm',
      selectedFinancialYearId,
      user?.id || user?._id || 'user',
    ],
    queryFn: () => api.get('/dashboard'),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled,
  });

  const loading = dashboardQuery.isLoading;

  const { recentChallans, recentBills, metricCards, detailGroups } = useMemo(() => {
    const payload = getResponseData(dashboardQuery.data) || {};
    const counts = payload.counts || {};
    const metrics = payload.metrics || {};
    const inventory = metrics.inventory || {};
    const bills = metrics.bills || {};
    const challans = metrics.challans || {};
    const masters = metrics.masters || {};
    const transactions = metrics.transactions || {};
    const returns = metrics.returns || {};

    const number = (value) => Number(value || 0);
    const formatNumber = (value) => number(value).toLocaleString();

    const summary = {
      totalBills: number(bills.total ?? counts.total_bills),
      totalChallans: number(challans.total ?? counts.total_challans),
      lowStockAlerts: number(inventory.low_stock_items ?? counts.low_stock_items),
      totalItems: number(inventory.total_items ?? counts.total_items ?? counts.items),
      unsettledBills: number(bills.unsettled ?? counts.unsettled_bills),
      settledBills: number(bills.settled ?? counts.settled_bills),
      totalBrands: number(masters.brands ?? counts.brands),
      parties: number(masters.parties ?? counts.parties),
      suppliers: number(masters.suppliers ?? counts.suppliers),
      transactions: number(transactions.total ?? counts.transactions),
      stockValue: number(inventory.stock_value ?? payload.stock_value),
      returns: number(returns.total ?? counts.returns),
    };

    const cards = [
      {
        title: 'Total Bills',
        value: formatNumber(summary.totalBills),
        subtitle: `${formatNumber(summary.unsettledBills)} unsettled`,
        icon: FaFileInvoiceDollar,
        color: 'purple',
        onClick: () => navigate('/transactions/bill-list'),
      },
      {
        title: 'Total Challans',
        value: formatNumber(summary.totalChallans),
        subtitle: `${formatNumber(challans.unconverted ?? counts.unconverted_challans)} pending conversion`,
        icon: FaFileAlt,
        color: 'green',
        onClick: () => navigate('/transactions/challan-list'),
      },
      {
        title: 'Low Stock Alerts',
        value: formatNumber(summary.lowStockAlerts),
        subtitle: `${formatNumber(inventory.zero_stock_items ?? counts.zero_stock_items)} zero stock`,
        icon: FaExclamationTriangle,
        color: 'red',
        onClick: () => navigate('/inventory/stock-alert-master'),
      },
      {
        title: 'Total Items',
        value: formatNumber(summary.totalItems),
        subtitle: `Stock value ${formatCurrency(summary.stockValue)}`,
        icon: FaBoxes,
        color: 'blue',
        onClick: () => navigate('/inventory/item-master'),
      },
      {
        title: 'Unsettled Bills',
        value: formatNumber(summary.unsettledBills),
        subtitle: `Due ${formatCurrency(bills.total_due || payload.pending_payments || 0)}`,
        icon: FaClock,
        color: 'yellow',
        onClick: () => navigate('/transactions/outstanding-list'),
      },
      {
        title: 'Settled Bills',
        value: formatNumber(summary.settledBills),
        subtitle: `${formatNumber(bills.overpaid ?? counts.overpaid_bills)} overpaid`,
        icon: FaCheckCircle,
        color: 'green',
        onClick: () => navigate('/transactions/bill-list'),
      },
      {
        title: 'Total Brands',
        value: formatNumber(summary.totalBrands),
        subtitle: `${formatNumber(masters.departments ?? counts.departments)} departments`,
        icon: FaTags,
        color: 'blue',
        onClick: () => navigate('/masters/brand-master'),
      },
      {
        title: 'Parties',
        value: formatNumber(summary.parties),
        subtitle: `${formatNumber(summary.suppliers)} suppliers`,
        icon: FaUsers,
        color: 'purple',
        onClick: () => navigate('/masters/debitors-master'),
      },
      {
        title: 'Suppliers',
        value: formatNumber(summary.suppliers),
        subtitle: `${formatNumber(masters.transports ?? counts.transports)} transports`,
        icon: FaHandshake,
        color: 'green',
        onClick: () => navigate('/inventory/add-creditors'),
      },
      {
        title: 'Transactions',
        value: formatNumber(summary.transactions),
        subtitle: `Net ${formatCurrency(transactions.net_amount || 0)}`,
        icon: FaExchangeAlt,
        color: 'yellow',
        onClick: () => navigate('/masters/transaction-master'),
      },
      {
        title: 'Banks',
        value: formatNumber(masters.banks ?? counts.banks),
        subtitle: `${formatNumber(masters.agents ?? counts.agents)} agents`,
        icon: FaUniversity,
        color: 'blue',
        onClick: () => navigate('/masters/bank-master'),
      },
      {
        title: 'Returns',
        value: formatNumber(summary.returns),
        subtitle: `${formatNumber(returns.sale || counts.sale_returns)} sale / ${formatNumber(returns.purchase || counts.purchase_returns)} purchase`,
        icon: FaUndo,
        color: 'red',
        onClick: () => navigate('/masters/return-master'),
      },
    ];

    const groups = [
      {
        title: 'Billing',
        icon: FaFileInvoiceDollar,
        rows: [
          ['Total Bills', summary.totalBills],
          ['Unsettled Bills', summary.unsettledBills],
          ['Settled Bills', summary.settledBills],
          ['Bill Amount', formatCurrency(bills.total_amount || 0)],
          ['Paid Amount', formatCurrency(bills.total_paid || 0)],
          ['Settlement Discount', formatCurrency(bills.total_discount || 0)],
        ],
      },
      {
        title: 'Challans',
        icon: FaFileAlt,
        rows: [
          ['Sale Challans', challans.sale ?? counts.sale_challans],
          ['Purchase Challans', challans.purchase ?? counts.purchase_challans],
          ['Converted', challans.converted ?? counts.converted_challans],
          ['Not Converted', challans.unconverted ?? counts.unconverted_challans],
          ['Pending Conversion', challans.unconverted ?? counts.unconverted_challans],
        ],
      },
      {
        title: 'Inventory',
        icon: FaBoxes,
        rows: [
          ['Total Items', inventory.total_items ?? counts.total_items],
          ['Low Stock', inventory.low_stock_items ?? counts.low_stock_items],
          ['Zero Stock', inventory.zero_stock_items ?? counts.zero_stock_items],
          ['Negative Stock', inventory.negative_stock_items ?? counts.negative_stock_items],
          ['Stock Value', formatCurrency(inventory.stock_value ?? payload.stock_value ?? 0)],
        ],
      },
      {
        title: 'Masters',
        icon: FaIndustry,
        rows: [
          ['Brands', masters.brands ?? counts.brands],
          ['Departments', masters.departments ?? counts.departments],
          ['HSN Codes', masters.hsn_codes ?? counts.hsn_codes],
          ['Labels', masters.labels ?? counts.labels],
          ['Areas', masters.areas ?? counts.areas],
        ],
      },
    ];

    return {
      recentChallans: Array.isArray(payload.recent_challans) ? payload.recent_challans : [],
      recentBills: Array.isArray(payload.recent_bills) ? payload.recent_bills : [],
      metricCards: cards,
      detailGroups: groups,
    };
  }, [dashboardQuery.data, navigate]);

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
     {/* Header */}
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Dashboard</h1>
    <p className="text-gray-600 text-xs sm:text-sm">
      Welcome back! Here's your business overview.
    </p>
  </div>
  <div className="flex items-center gap-2 text-xs sm:text-sm text-gray-600">
    <FaCalendarDay className="text-sm sm:text-base" />
    {formatDate(new Date())}
  </div>
</div>

     {/* Summary Metrics */}
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
  {metricCards.map((card) => (
    <StatsCard
      key={card.title}
      title={card.title}
      value={card.value}
      subtitle={card.subtitle}
      icon={card.icon}
      color={card.color}
      onClick={card.onClick}
    />
  ))}
</div>

      {/* Detailed Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {detailGroups.map((group) => {
          const Icon = group.icon;
          return (
            <div key={group.title} className="bg-white rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Icon className="text-blue-600" />
                <h3 className="font-medium text-gray-900">{group.title}</h3>
              </div>
              <div className="space-y-2 text-sm">
                {group.rows.map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b last:border-b-0 pb-2 last:pb-0">
                    <span className="text-gray-600">{label}</span>
                    <span className="font-semibold text-gray-900">
                      {typeof value === 'number' ? value.toLocaleString() : value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Challans */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Recent Challans</h3>
            <button
              onClick={() => navigate('/transactions/challan-list')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              View
              <FaArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {recentChallans.length > 0 ? recentChallans.map((challan) => (
              <div key={challan._id || challan.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{challan.challan_no || challan.id}</span>
                  <span className="text-gray-600 ml-2">{challan.contact_id?.name || challan.party_name || 'N/A'}</span>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900">{formatCurrency(challan.amount || 0)}</div>
                  <div className="text-xs text-gray-500">{formatDate(new Date(challan.date))}</div>
                  <div className="text-xs mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${challan.converted_to_bill ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-700'}`}>
                      {challan.converted_to_bill ? 'Converted' : 'Not Converted'}
                    </span>
                  </div>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center py-4">No recent challans</p>
            )}
          </div>
        </div>

        {/* Recent Bills */}
        <div className="bg-white rounded-lg border">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-medium text-gray-900">Recent Bills</h3>
            <button
              onClick={() => navigate('/transactions/bill-list')}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
            >
              View
              <FaArrowRight size={12} />
            </button>
          </div>
          <div className="p-4 space-y-3">
            {recentBills.length > 0 ? recentBills.map((bill) => (
              <div key={bill._id || bill.id} className="flex items-center justify-between text-sm">
                <div>
                  <span className="font-medium text-gray-900">{bill.bill_no || bill.id}</span>
                  <span className="text-gray-600 ml-2">{bill.contact_id?.name || bill.party_id?.name || bill.party_name || 'N/A'}</span>
                </div>
                <div className="text-right">
                  <div className="font-medium text-gray-900">{formatCurrency(bill.amount || 0)}</div>
                  <div className="text-xs text-gray-500">{formatDate(new Date(bill.date))}</div>
                </div>
              </div>
            )) : (
              <p className="text-sm text-gray-500 text-center py-4">No recent bills</p>
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  );
};

export default Dashboard;
