import React, { useEffect, useMemo, useState } from "react";
import {
  FaShoppingCart,
  FaTruck,
  FaRupeeSign,
  FaChartBar,
  FaDownload,
} from "react-icons/fa";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { exportToPDF } from "../../utils/pdfExport";
import api from "../../services/axiosInstance";
import { getResponseData, toNumber } from "../../services/apiUtils";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";

const PurchaseReport = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("year");
  const [dateFrom, setDateFrom] = useState(getFinancialYearStartDate());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [report, setReport] = useState({
    total_purchase: 0,
    gst_purchase: 0,
    non_gst_purchase: 0,
    total_challans: 0,
    supplier_count: 0,
    avg_purchase: 0,
    monthly_trend: [],
    purchase_type_data: [],
    top_suppliers: [],
  });

  const resolveRange = () => {
    const now = new Date();
    if (selectedPeriod === "custom") {
      return { from: dateFrom || "", to: dateTo || "" };
    }
    if (selectedPeriod === "month") {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0],
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0],
      };
    }
    if (selectedPeriod === "quarter") {
      const quarterStart = Math.floor(now.getMonth() / 3) * 3;
      return {
        from: new Date(now.getFullYear(), quarterStart, 1)
          .toISOString()
          .split("T")[0],
        to: new Date(now.getFullYear(), quarterStart + 3, 0)
          .toISOString()
          .split("T")[0],
      };
    }
    return {
      from: new Date(now.getFullYear(), 0, 1).toISOString().split("T")[0],
      to: new Date(now.getFullYear(), 11, 31).toISOString().split("T")[0],
    };
  };

  useEffect(() => {
    const loadReport = async () => {
      try {
        const { from, to } = resolveRange();
        const res = await api.get("/reports/purchase", {
          params: {
            from_date: from || undefined,
            to_date: to || undefined,
          },
        });
        const payload = getResponseData(res) || {};
        setReport({
          total_purchase: toNumber(payload.total_purchase, 0),
          gst_purchase: toNumber(payload.gst_purchase, 0),
          non_gst_purchase: toNumber(payload.non_gst_purchase, 0),
          total_challans: toNumber(payload.total_challans, 0),
          supplier_count: toNumber(payload.supplier_count, 0),
          avg_purchase: toNumber(payload.avg_purchase, 0),
          monthly_trend: Array.isArray(payload.monthly_trend) ? payload.monthly_trend : [],
          purchase_type_data: Array.isArray(payload.purchase_type_data)
            ? payload.purchase_type_data
            : [],
          top_suppliers: Array.isArray(payload.top_suppliers) ? payload.top_suppliers : [],
        });
      } catch (error) {
        console.error("Failed to load purchase report", error);
      }
    };
    loadReport();
  }, [selectedPeriod, dateFrom, dateTo]);

  const monthlyPurchaseData = useMemo(
    () =>
      report.monthly_trend.map((m) => ({
        month: new Date(m.year, m.month - 1, 1).toLocaleString("en-US", {
          month: "short",
        }),
        purchase: toNumber(m.amount, 0),
      })),
    [report.monthly_trend],
  );

  const purchaseTypeData = useMemo(
    () =>
      report.purchase_type_data.map((item, index) => ({
        name: item.name === "GST" ? "GST Purchase" : "Non-GST Purchase",
        value: toNumber(item.value, 0),
        color: index === 0 ? "#10B981" : "#3B82F6",
      })),
    [report.purchase_type_data],
  );

  const topSuppliers = useMemo(
    () =>
      report.top_suppliers.map((supplier) => ({
        supplier: supplier.name || "Supplier",
        amount: toNumber(supplier.amount, 0),
      })),
    [report.top_suppliers],
  );

  const formatCurrency = (value) => `Rs ${toNumber(value, 0).toLocaleString()}`;

  return (
    <div className="space-y-4 sm:space-y-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900">
            Purchase Analytics
          </h1>
          <p className="text-gray-500 mt-1 text-xs sm:text-sm">
            Monitor supplier purchases and trends
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() =>
              exportToPDF("purchase-report-content", "Purchase_Report.pdf")
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition text-sm"
          >
            <FaDownload /> Download PDF
          </button>
          <select
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {selectedPeriod === "custom" && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </>
          )}
        </div>
      </div>

      <div id="purchase-report-content">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <StatCard
            title="Total Purchase"
            value={formatCurrency(report.total_purchase)}
            icon={<FaShoppingCart />}
            color="blue"
          />
          <StatCard
            title="GST Purchase"
            value={formatCurrency(report.gst_purchase)}
            subtitle="GST invoices"
            icon={<FaRupeeSign />}
            color="green"
          />
          <StatCard
            title="Suppliers"
            value={report.supplier_count}
            subtitle="Active vendors"
            icon={<FaTruck />}
            color="purple"
          />
          <StatCard
            title="Avg Purchase"
            value={formatCurrency(report.avg_purchase)}
            subtitle="Per invoice"
            icon={<FaChartBar />}
            color="orange"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Monthly Purchase Trend
            </h3>

            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={monthlyPurchaseData}>
                <defs>
                  <linearGradient
                    id="purchaseGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip formatter={(v) => [formatCurrency(v), "Purchase"]} contentStyle={{ borderRadius: 8 }} />
                <Area
                  type="monotone"
                  dataKey="purchase"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  fill="url(#purchaseGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Top Suppliers
            </h3>

            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topSuppliers}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="supplier" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip formatter={(v) => [formatCurrency(v), "Purchase"]} />
                <Bar dataKey="amount" fill="#10B981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Purchase Type Distribution
            </h3>

            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={purchaseTypeData}
                  dataKey="value"
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {purchaseTypeData.map((item, i) => (
                    <Cell key={i} fill={item.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => [formatCurrency(v), "Amount"]} />
              </PieChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-2 gap-3 mt-4">
              {purchaseTypeData.map((item, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-gray-600">{item.name}</span>
                  <span className="text-sm font-semibold ml-auto">
                    {formatCurrency(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">
              Best Suppliers
            </h3>

            <div className="space-y-3">
              {topSuppliers.map((item, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xs">
                      {index + 1}
                    </div>
                    <span className="text-sm font-medium text-gray-700">
                      {item.supplier}
                    </span>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, subtitle, icon, color }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs sm:text-sm text-gray-500 font-medium">{title}</p>
          <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1">
            {value}
          </h3>
          {subtitle && (
            <p className="text-xs sm:text-sm text-gray-500 mt-1">{subtitle}</p>
          )}
        </div>
        <div
          className={`w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 rounded-lg flex items-center justify-center ${colors[color]}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
};

export default PurchaseReport;
