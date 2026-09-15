import React, { useState, useEffect, useMemo } from 'react';
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
  FaWhatsapp,
  FaBell,
  FaPhoneAlt,
  FaShoppingBag,
  FaHourglassHalf,
  FaBoxOpen,
  FaFilter,
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

  const [slowMovingMonths, setSlowMovingMonths] = useState(6);

  const dashboardQuery = useQuery({
    queryKey: [
      'dashboard',
      selectedFirm?.id || selectedFirm?._id || selectedFirm?.name || 'firm',
      selectedFirm?.firm_type || selectedFirm?.type || 'firm',
      selectedFinancialYearId,
      user?.id || user?._id || 'user',
      slowMovingMonths,
    ],
    queryFn: () => api.get('/dashboard', { params: { slow_moving_months: slowMovingMonths } }),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    enabled,
  });

  const loading = dashboardQuery.isLoading;

  const {
    recentChallans,
    recentBills,
    overdueReminders,
    overdueSummary,
    newlyPurchasedItems,
    newlyPurchasedSummary,
    slowMovingStock,
    slowMovingSummary,
    subscriptionExpiryAlert,
    metricCards,
    detailGroups,
  } = useMemo(() => {
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
      overdueReminders: Array.isArray(payload.overdue_reminders) ? payload.overdue_reminders : [],
      overdueSummary: payload.overdue_summary || { total_overdue_count: 0, total_overdue_amount: 0 },
      newlyPurchasedItems: Array.isArray(payload.newly_purchased_items) ? payload.newly_purchased_items : [],
      newlyPurchasedSummary: payload.newly_purchased_summary || { total_items: 0, total_investment: 0 },
      slowMovingStock: Array.isArray(payload.slow_moving_stock) ? payload.slow_moving_stock : [],
      slowMovingSummary: payload.slow_moving_summary || { slow_moving_months: 6, total_slow_moving_count: 0, total_slow_moving_capital: 0 },
      subscriptionExpiryAlert: payload.subscription_expiry_alert || null,
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

{/* Subscription Expiry Emergency Alert Banner */}
{subscriptionExpiryAlert?.is_expiring_soon && (
  <div
    className={`p-4 rounded-xl border shadow-xs transition-all duration-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
      subscriptionExpiryAlert.days_remaining <= 3 || subscriptionExpiryAlert.is_expired
        ? 'bg-red-50 border-red-200 text-red-900'
        : 'bg-amber-50 border-amber-200 text-amber-900'
    }`}
  >
    <div className="flex items-center gap-3">
      <div
        className={`p-2.5 rounded-lg ${
          subscriptionExpiryAlert.days_remaining <= 3 || subscriptionExpiryAlert.is_expired
            ? 'bg-red-100 text-red-600 animate-pulse'
            : 'bg-amber-100 text-amber-600'
        }`}
      >
        <FaExclamationTriangle className="text-xl sm:text-2xl" />
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wide rounded-full ${
              subscriptionExpiryAlert.days_remaining <= 3 || subscriptionExpiryAlert.is_expired
                ? 'bg-red-600 text-white'
                : 'bg-amber-600 text-white'
            }`}
          >
            {subscriptionExpiryAlert.is_expired
              ? 'Subscription Expired'
              : subscriptionExpiryAlert.days_remaining === 1
              ? 'Expires Tomorrow!'
              : `${subscriptionExpiryAlert.days_remaining} Days Remaining`}
          </span>
          <span className="text-[11px] font-bold text-gray-500 uppercase">
            ({subscriptionExpiryAlert.plan_type} Plan)
          </span>
        </div>
        <p className="text-xs sm:text-sm font-semibold mt-1">
          {subscriptionExpiryAlert.is_expired
            ? 'Emergency Alert: Your subscription plan has expired! Please renew immediately to prevent service lockout.'
            : `Emergency Alert: Your subscription plan will expire in ${subscriptionExpiryAlert.days_remaining} day${
                subscriptionExpiryAlert.days_remaining === 1 ? '' : 's'
              } on ${formatDate(new Date(subscriptionExpiryAlert.expiry_date))}. Please renew your plan to ensure continuous access.`}
        </p>
      </div>
    </div>
  </div>
)}

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
      {/* Overdue Payment Reminders Widget */}
      <div className="bg-white rounded-lg border border-red-100 shadow-sm overflow-hidden">
        <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border-b border-red-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-red-100 text-red-600 rounded-lg">
              <FaBell className="text-base sm:text-lg animate-bounce" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base sm:text-lg flex items-center gap-2">
                Overdue Payment Reminders
                {overdueReminders.length > 0 && (
                  <span className="px-2.5 py-0.5 text-xs font-semibold bg-red-600 text-white rounded-full">
                    {overdueReminders.length}
                  </span>
                )}
              </h3>
              <p className="text-xs text-gray-600">
                Track payments past their due date and collect outstanding dues
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500 font-medium">Total Overdue</div>
              <div className="text-base sm:text-lg font-bold text-red-600">
                {formatCurrency(overdueSummary.total_overdue_amount || 0)}
              </div>
            </div>
            <button
              onClick={() => navigate('/transactions/bill-list')}
              className="px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition flex items-center gap-1 shadow-sm"
            >
              View Bills
              <FaArrowRight size={10} />
            </button>
          </div>
        </div>

        <div className="p-4">
          {overdueReminders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b text-gray-500 font-semibold uppercase text-[11px] bg-gray-50">
                    <th className="py-2.5 px-3">Party Name</th>
                    <th className="py-2.5 px-3">Bill No & Date</th>
                    <th className="py-2.5 px-3">Due Date & Overdue</th>
                    <th className="py-2.5 px-3 text-right">Due Amount</th>
                    <th className="py-2.5 px-3 text-center">Quick Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overdueReminders.slice(0, 10).map((item) => {
                    const phone = item.contact_whatsapp || item.contact_phone || '';
                    const cleanPhone = phone.replace(/\D/g, '');
                    const waMessage = encodeURIComponent(
                      `Dear ${item.contact_name}, your payment of ${formatCurrency(item.due_amount)} for Bill No. ${item.bill_no} (Due Date: ${formatDate(new Date(item.due_date))}) is overdue by ${item.overdue_days} days. Kindly clear the dues.`
                    );
                    const waUrl = cleanPhone ? `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}?text=${waMessage}` : null;

                    return (
                      <tr key={item.bill_id} className="hover:bg-red-50/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-semibold text-gray-900">{item.contact_name}</div>
                          {phone && (
                            <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                              <FaPhoneAlt className="text-[10px] text-gray-400" />
                              {phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-900">{item.bill_no}</div>
                          <div className="text-xs text-gray-500">{formatDate(new Date(item.date))}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="text-xs text-gray-700 font-medium">{formatDate(new Date(item.due_date))}</div>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-700 mt-0.5">
                            {item.overdue_days} Days Overdue
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-bold text-red-600 text-sm">{formatCurrency(item.due_amount)}</div>
                          {item.paid_amount > 0 && (
                            <div className="text-[11px] text-gray-500">Paid: {formatCurrency(item.paid_amount)}</div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => navigate('/transactions/bill-list')}
                            className="px-2.5 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-xs font-medium shadow-xs"
                          >
                            Settle
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-6 text-gray-500">
              <FaCheckCircle className="text-green-500 text-2xl mx-auto mb-2" />
              <p className="font-medium text-sm text-gray-800">All payments are up to date!</p>
              <p className="text-xs text-gray-500">No overdue bill collections found.</p>
            </div>
          )}
        </div>
      </div>

      {/* Newly Purchased Items & Slow-Moving Stock Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Newly Purchased Items (This Month Inflow) */}
        <div className="bg-white rounded-lg border border-blue-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                <FaShoppingBag className="text-base" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-2">
                  New Purchased Items
                  {newlyPurchasedItems.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-blue-600 text-white rounded-full">
                      {newlyPurchasedItems.length}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500">Items received via purchase this month</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] text-gray-500 font-medium">New Inflow Total</div>
              <div className="text-sm font-bold text-blue-700">
                {formatCurrency(newlyPurchasedSummary.total_investment || 0)}
              </div>
            </div>
          </div>

          <div className="p-4 flex-1">
            {newlyPurchasedItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 font-semibold uppercase text-[10px] bg-gray-50">
                      <th className="py-2 px-2">Item Name</th>
                      <th className="py-2 px-2">Supplier</th>
                      <th className="py-2 px-2 text-center">Date</th>
                      <th className="py-2 px-2 text-right">Qty</th>
                      <th className="py-2 px-2 text-right">Rate</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {newlyPurchasedItems.slice(0, 7).map((item) => (
                      <tr key={item.item_id} className="hover:bg-blue-50/30 transition-colors">
                        <td className="py-2.5 px-2">
                          <div className="font-semibold text-gray-900">{item.item_name}</div>
                          {item.barcode && <div className="text-[10px] text-gray-400 font-mono">{item.barcode}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-gray-600 text-xs truncate max-w-[120px]">
                          {item.supplier_name}
                        </td>
                        <td className="py-2.5 px-2 text-center text-xs text-gray-500">
                          {formatDate(new Date(item.purchase_date))}
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-gray-900">
                          {item.total_quantity}
                        </td>
                        <td className="py-2.5 px-2 text-right font-medium text-blue-700">
                          {formatCurrency(item.purchase_rate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FaBoxOpen className="text-blue-300 text-3xl mx-auto mb-2" />
                <p className="font-medium text-xs text-gray-700">No new item purchases this month</p>
                <p className="text-[11px] text-gray-400">Newly purchased items will automatically appear here.</p>
              </div>
            )}
          </div>
        </div>

        {/* Slow-Moving / Dead Stock Indicator */}
        <div className="bg-white rounded-lg border border-amber-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
                <FaHourglassHalf className="text-base" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm sm:text-base flex items-center gap-2">
                  Unsold / Slow-Moving Stock
                  {slowMovingStock.length > 0 && (
                    <span className="px-2 py-0.5 text-xs font-semibold bg-amber-600 text-white rounded-full">
                      {slowMovingStock.length}
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500">Items with no sales in selected duration</p>
              </div>
            </div>

            {/* Duration Selector Buttons */}
            <div className="flex items-center gap-1 bg-amber-100/60 p-1 rounded-lg">
              {[1, 2, 3, 6, 12].map((m) => (
                <button
                  key={m}
                  onClick={() => setSlowMovingMonths(m)}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded transition ${
                    slowMovingMonths === m
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'text-amber-800 hover:bg-amber-200/60'
                  }`}
                >
                  {m}M
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 flex-1">
            <div className="mb-3 flex items-center justify-between bg-amber-50/70 p-2.5 rounded-lg border border-amber-100/80">
              <span className="text-xs font-medium text-amber-900">Capital Locked in Unsold Stock ({slowMovingMonths} Months):</span>
              <span className="text-sm font-bold text-amber-700">
                {formatCurrency(slowMovingSummary.total_slow_moving_capital || 0)}
              </span>
            </div>

            {slowMovingStock.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b text-gray-500 font-semibold uppercase text-[10px] bg-gray-50">
                      <th className="py-2 px-2">Item Name</th>
                      <th className="py-2 px-2 text-center">Unsold Duration</th>
                      <th className="py-2 px-2 text-right">Available Stock</th>
                      <th className="py-2 px-2 text-right">Locked Capital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {slowMovingStock.slice(0, 7).map((item) => (
                      <tr key={item.item_id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-2.5 px-2">
                          <div className="font-semibold text-gray-900">{item.item_name}</div>
                          {item.barcode && <div className="text-[10px] text-gray-400 font-mono">{item.barcode}</div>}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                            {item.days_unsold !== null ? `${item.days_unsold} Days Unsold` : 'Never Sold'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-semibold text-gray-900">
                          {item.current_stock}
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-amber-700">
                          {formatCurrency(item.capital_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <FaCheckCircle className="text-green-500 text-2xl mx-auto mb-2" />
                <p className="font-medium text-xs text-gray-700">No slow-moving inventory detected</p>
                <p className="text-[11px] text-gray-400">All items with stock have been sold in the last {slowMovingMonths} months.</p>
              </div>
            )}
          </div>
        </div>
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
