import React, { useEffect, useMemo, useState } from "react";
import {
  FaFileInvoiceDollar,
  FaChartPie,
  FaCalculator,
  FaDownload,
  FaFilter,
  FaArrowUp,
} from "react-icons/fa";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";
import { exportToPDF } from "../../utils/pdfExport";
import { Input } from "../../components/ui";
import api from "../../services/axiosInstance";
import { getFinancialYearStartDate } from "../../utils/dateHelpers";
import { getResponseData, toNumber } from "../../services/apiUtils";

const GSTReport = () => {
  const [selectedPeriod, setSelectedPeriod] = useState("year");
  const [selectedGSTRate, setSelectedGSTRate] = useState("all");
  const [dateFrom, setDateFrom] = useState(getFinancialYearStartDate()); // Automatically set to financial year start
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState({
    total_gst: 0,
    input_credit: 0,
    net_payable: 0,
    effective_rate: 0,
    monthly_gst_trend: [],
    gst_rate_distribution: [],
    top_gst_items: [],
  });

  const resolveRange = () => {
    const now = new Date();
    if (selectedPeriod === "custom") {
      let fromDate = dateFrom;
      let toDate = dateTo;

      if (fromDate && !fromDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = new Date(fromDate);
        if (!isNaN(date.getTime())) {
          fromDate = date.toISOString().split("T")[0];
        }
      }

      if (toDate && !toDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const date = new Date(toDate);
        if (!isNaN(date.getTime())) {
          toDate = date.toISOString().split("T")[0];
        }
      }

      return { from: fromDate || "", to: toDate || "" };
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

    // "year" → Indian Financial Year: Apr 1 to Mar 31
    const fyStartYear =
      now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    return {
      from: new Date(fyStartYear, 3, 1).toISOString().split("T")[0], // Apr 1
      to: new Date(fyStartYear + 1, 2, 31).toISOString().split("T")[0], // Mar 31
    };
  };

  useEffect(() => {
    const loadReport = async () => {
      setLoading(true);
      try {
        const { from, to } = resolveRange();
        const res = await api.get("/reports/gst-dashboard", {
          params: {
            from_date: from || undefined,
            to_date: to || undefined,
          },
        });
        const payload = getResponseData(res) || {};
        setReport({
          total_gst: toNumber(payload.total_gst, 0),
          input_credit: toNumber(payload.input_credit, 0),
          net_payable: toNumber(payload.net_payable, 0),
          effective_rate: toNumber(payload.effective_rate, 0),
          monthly_gst_trend: Array.isArray(payload.monthly_gst_trend)
            ? payload.monthly_gst_trend
            : [],
          gst_rate_distribution: Array.isArray(payload.gst_rate_distribution)
            ? payload.gst_rate_distribution
            : [],
          top_gst_items: Array.isArray(payload.top_gst_items)
            ? payload.top_gst_items
            : [],
        });
      } catch (error) {
        console.error("Failed to load GST dashboard", error);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [selectedPeriod, dateFrom, dateTo]);

  const monthlyGSTData = useMemo(
    () =>
      report.monthly_gst_trend.map((m) => ({
        month: new Date(m.year, m.month - 1, 1).toLocaleString("en-US", {
          month: "short",
        }),
        total: toNumber(m.output_gst, 0),
        input: toNumber(m.input_gst, 0),
      })),
    [report.monthly_gst_trend],
  );

  const filteredRateDistribution = useMemo(() => {
    if (selectedGSTRate === "all") return report.gst_rate_distribution;
    return report.gst_rate_distribution.filter(
      (item) => String(item.rate) === String(selectedGSTRate),
    );
  }, [report.gst_rate_distribution, selectedGSTRate]);

  const gstRateData = useMemo(() => {
    const palette = [
      "#10B981",
      "#3B82F6",
      "#F59E0B",
      "#8B5CF6",
      "#EF4444",
      "#14B8A6",
    ];
    return filteredRateDistribution.map((item, index) => ({
      rate: item.label || `${item.rate}%`,
      amount: toNumber(item.amount, 0),
      taxable: toNumber(item.taxable, 0),
      count: toNumber(item.count, 0),
      color: palette[index % palette.length],
    }));
  }, [filteredRateDistribution]);

  const topSellingGSTItems = useMemo(
    () =>
      report.top_gst_items.map((item) => ({
        item: item.item_name || "Item",
        sales: toNumber(item.total_amount, 0),
        gstAmount: toNumber(item.total_gst, 0),
        quantity: toNumber(item.quantity, 0),
      })),
    [report.top_gst_items],
  );

  const formatCurrency = (value) => `Rs ${toNumber(value, 0).toLocaleString()}`;
  const formatPercent = (value) => `${toNumber(value, 0).toFixed(1)}%`;

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 flex items-center gap-3">
            GST Analytics
          </h1>
          <p className="text-gray-500 mt-1">
            Comprehensive GST reporting and analysis
          </p>
        </div>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => exportToPDF("gst-report-content", "GST_Report.pdf")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
          >
            <FaDownload /> Download PDF
          </button>
          <select
            value={selectedGSTRate}
            onChange={(e) => setSelectedGSTRate(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All GST Rates</option>
            <option value="5">5% GST</option>
            <option value="12">12% GST</option>
            <option value="18">18% GST</option>
            <option value="28">28% GST</option>
          </select>
          <select
            value={selectedPeriod}
            onChange={(e) => {
              const newPeriod = e.target.value;
              setSelectedPeriod(newPeriod);
              // Auto-set from date to financial year start when switching to custom
              if (newPeriod === "custom" && !dateFrom) {
                setDateFrom(getFinancialYearStartDate());
              }
            }}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {selectedPeriod === "custom" && (
            <>
              <Input
                type="date"
                placeholder="From Date"
                value={dateFrom}
                onChange={(newValue) => {
                  setDateFrom(newValue);
                }}
              />
              <Input
                type="date"
                placeholder="To Date"
                value={dateTo}
                onChange={(newValue) => setDateTo(newValue)}
              />
            </>
          )}
        </div>
      </div>

      <div id="gst-report-content">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  Total GST Collected
                </p>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {formatCurrency(report.total_gst)}
                </h3>
                <p className="text-xs sm:text-sm text-green-600 mt-1 sm:mt-2 flex items-center gap-1">
                  <FaArrowUp size={10} className="sm:size-3" /> Output GST
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <FaCalculator className="text-green-600 text-sm sm:text-base md:text-xl" />
              </div>
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  Input Tax Credit
                </p>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {formatCurrency(report.input_credit)}
                </h3>
                <p className="text-xs sm:text-sm text-blue-600 mt-1 sm:mt-2">
                  Available for offset
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <FaChartPie className="text-blue-600 text-sm sm:text-base md:text-xl" />
              </div>
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  Net GST Payable
                </p>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {formatCurrency(report.net_payable)}
                </h3>
                <p className="text-xs sm:text-sm text-purple-600 mt-1 sm:mt-2">
                  Due this period
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <FaFileInvoiceDollar className="text-purple-600 text-sm sm:text-base md:text-xl" />
              </div>
            </div>
          </div>

          <div className="bg-white p-3 sm:p-4 md:p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm text-gray-500 font-medium">
                  Effective GST Rate
                </p>
                <h3 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mt-1 sm:mt-2">
                  {formatPercent(report.effective_rate)}
                </h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 sm:mt-2">
                  Weighted average
                </p>
              </div>
              <div className="w-8 h-8 sm:w-10 sm:h-10 md:w-12 md:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                <FaFilter className="text-orange-600 text-sm sm:text-base md:text-xl" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Monthly GST Output
              </h3>
              <button className="text-blue-600 hover:text-blue-700">
                <FaDownload />
              </button>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={monthlyGSTData}>
                <defs>
                  <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="month" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                  }}
                  formatter={(value) => [formatCurrency(value), "GST Amount"]}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="#3B82F6"
                  fillOpacity={1}
                  fill="url(#colorTotal)"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!loading && monthlyGSTData.length === 0 && (
              <div className="text-sm text-gray-500 mt-2">
                No GST trend data available
              </div>
            )}
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-md border border-gray-100 hover:shadow-lg transition-shadow duration-300">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Top Selling GST Items
                </h3>
                <p className="text-sm text-gray-500">
                  Based on total sales amount
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium">
                GST Sales
              </div>
            </div>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart
                data={topSellingGSTItems}
                margin={{ top: 10, right: 10, left: 0, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="4 4" stroke="#f3f4f6" />
                <XAxis
                  dataKey="item"
                  stroke="#9CA3AF"
                  tick={{ fontSize: 10 }}
                  angle={0}
                  textAnchor="end"
                  height={70}
                />
                <YAxis
                  stroke="#9CA3AF"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `Rs ${Math.round(value / 1000)}k`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
                  contentStyle={{
                    backgroundColor: "#ffffff",
                    borderRadius: "10px",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.08)",
                    fontSize: "13px",
                  }}
                  formatter={(value) => [formatCurrency(value), "Sales Amount"]}
                />
                <defs>
                  <linearGradient
                    id="gstSalesGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop offset="0%" stopColor="#34D399" />
                    <stop offset="100%" stopColor="#10B981" />
                  </linearGradient>
                </defs>
                <Bar
                  dataKey="sales"
                  fill="url(#gstSalesGradient)"
                  radius={[8, 8, 0, 0]}
                  barSize={38}
                />
              </BarChart>
            </ResponsiveContainer>
            {!loading && topSellingGSTItems.length === 0 && (
              <div className="text-sm text-gray-500 mt-2">
                No GST item data available
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              GST Rate Distribution
            </h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={gstRateData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={2}
                  dataKey="amount"
                >
                  {gstRateData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => [formatCurrency(value), "Amount"]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-3 mt-4">
              {gstRateData.map((item, index) => (
                <div key={index} className="flex items-center gap-2">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  ></div>
                  <span className="text-sm text-gray-600">{item.rate}</span>
                  <span className="text-sm font-semibold ml-auto">
                    {formatCurrency(item.amount)}
                  </span>
                </div>
              ))}
              {!loading && gstRateData.length === 0 && (
                <div className="text-sm text-gray-500">
                  No GST rate data available
                </div>
              )}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Best Selling Items by GST
            </h3>
            <div className="space-y-4">
              {topSellingGSTItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm">
                      {index + 1}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-700">
                        {item.item}
                      </p>
                      <p className="text-xs text-gray-500">
                        GST: {formatCurrency(item.gstAmount)} | Qty:{" "}
                        {item.quantity}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCurrency(item.sales)}
                  </span>
                </div>
              ))}
              {!loading && topSellingGSTItems.length === 0 && (
                <div className="text-sm text-gray-500">
                  No GST items available
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTReport;
