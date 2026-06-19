import React, { useEffect, useMemo, useState } from "react";
import {
  FaShoppingBag,
  FaUsers,
  FaRupeeSign,
  FaFileInvoiceDollar,
  FaDownload,
} from "react-icons/fa";
import {
  ResponsiveContainer,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
} from "recharts";
import { exportToPDF } from "../../utils/pdfExport";
import api from "../../services/axiosInstance";
import { getResponseData, toNumber } from "../../services/apiUtils";
import { getFinancialYearStartDate, getTodayDate } from "../../utils/dateHelpers";

const SalesReport = () => {
  const [period, setPeriod] = useState("year");
  const [dateFrom, setDateFrom] = useState(getFinancialYearStartDate());
  const [dateTo, setDateTo] = useState(getTodayDate());
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState({
    total_sales: 0,
    gst_sales: 0,
    non_gst_sales: 0,
    total_challans: 0,
    customer_count: 0,
    avg_sale: 0,
    monthly_trend: [],
    sales_type_data: [],
    top_customers: [],
  });

  const resolveRange = () => {
    const now = new Date();
    if (period === "custom") {
      return { from: dateFrom || "", to: dateTo || "" };
    }
    if (period === "month") {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0],
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0],
      };
    }
    if (period === "quarter") {
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
      setLoading(true);
      try {
        const { from, to } = resolveRange();
        const res = await api.get("/reports/sales", {
          params: {
            from_date: from || undefined,
            to_date: to || undefined,
          },
        });
        const payload = getResponseData(res) || {};
        setReport({
          total_sales: toNumber(payload.total_sales, 0),
          gst_sales: toNumber(payload.gst_sales, 0),
          non_gst_sales: toNumber(payload.non_gst_sales, 0),
          total_challans: toNumber(payload.total_challans, 0),
          customer_count: toNumber(payload.customer_count, 0),
          avg_sale: toNumber(payload.avg_sale, 0),
          monthly_trend: Array.isArray(payload.monthly_trend) ? payload.monthly_trend : [],
          sales_type_data: Array.isArray(payload.sales_type_data) ? payload.sales_type_data : [],
          top_customers: Array.isArray(payload.top_customers) ? payload.top_customers : [],
        });
      } catch (error) {
        console.error("Failed to load sales report", error);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, [period, dateFrom, dateTo]);

  const monthlySalesData = useMemo(
    () =>
      report.monthly_trend.map((m) => ({
        month: new Date(m.year, m.month - 1, 1).toLocaleString("en-US", {
          month: "short",
        }),
        sales: toNumber(m.amount, 0),
        bills: toNumber(m.count, 0),
      })),
    [report.monthly_trend],
  );

  const gstSplit = useMemo(() => {
    const colors = {
      GST: "#10B981",
      "Non-GST": "#3B82F6",
    };
    return report.sales_type_data.map((item) => {
      const label = item.name === "GST" ? "GST Sales" : "Non-GST Sales";
      const key = item.name === "GST" ? "GST" : "Non-GST";
      return {
        name: label,
        value: toNumber(item.value, 0),
        color: colors[key],
      };
    });
  }, [report.sales_type_data]);

  const topCustomers = useMemo(
    () =>
      report.top_customers.map((customer) => ({
        customer: customer.name || "Customer",
        amount: toNumber(customer.amount, 0),
        count: toNumber(customer.count, 0),
        city: customer.city || "",
      })),
    [report.top_customers],
  );

  const formatCurrency = (value) => `Rs ${toNumber(value, 0).toLocaleString()}`;

  return (
    <div className="space-y-6 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
            Sales Performance
          </h1>
          <p className="text-gray-500 mt-1">Revenue, customers and bill insights</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => exportToPDF("sales-report-content", "Sales_Report.pdf")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition"
          >
            <FaDownload /> Download PDF
          </button>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">This Month</option>
            <option value="quarter">This Quarter</option>
            <option value="year">This Year</option>
            <option value="custom">Custom Range</option>
          </select>
          {period === "custom" && (
            <>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </>
          )}
        </div>
      </div>

      <div id="sales-report-content">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Kpi
            title="Total Sales"
            value={formatCurrency(report.total_sales)}
            icon={<FaShoppingBag />}
            color="blue"
          />
          <Kpi
            title="Customers"
            value={report.customer_count}
            icon={<FaUsers />}
            color="green"
          />
          <Kpi
            title="Avg Bill Value"
            value={formatCurrency(report.avg_sale)}
            icon={<FaRupeeSign />}
            color="purple"
          />
          <Kpi
            title="Total Bills"
            value={report.total_challans}
            icon={<FaFileInvoiceDollar />}
            color="orange"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Sales vs Bills Trend</h3>

            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={monthlySalesData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip
                  formatter={(value, name) =>
                    name === "sales"
                      ? [formatCurrency(value), "Sales"]
                      : [value, "Bills"]
                  }
                />
                <Bar dataKey="bills" barSize={30} fill="#CBD5E1" />
                <Line
                  type="monotone"
                  dataKey="sales"
                  stroke="#3B82F6"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col">
            <h3 className="text-lg font-semibold mb-4">GST vs Non-GST Sales</h3>

            <div className="relative flex-1">
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={gstSplit}
                    dataKey="value"
                    innerRadius={70}
                    outerRadius={95}
                    paddingAngle={4}
                  >
                    {gstSplit.map((item, i) => (
                      <Cell key={i} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => [formatCurrency(v), "Sales"]} />
                </PieChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-sm text-gray-500">Total Sales</p>
                <p className="text-xl font-bold text-gray-900">
                  {formatCurrency(report.total_sales)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Top Customers by Sales</h3>

            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={topCustomers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis type="category" dataKey="customer" width={120} />
                <Tooltip formatter={(v) => [formatCurrency(v), "Sales"]} />
                <Bar dataKey="amount" fill="#10B981" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-semibold mb-4">Best Performing Customers</h3>

            <div className="space-y-4">
              {topCustomers.map((c, i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-700">
                        {c.customer}
                      </div>
                      {c.city && (
                        <div className="text-xs text-gray-500">{c.city}</div>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-bold text-gray-900">
                    {formatCurrency(c.amount)}
                  </span>
                </div>
              ))}
              {!loading && topCustomers.length === 0 && (
                <div className="text-sm text-gray-500">No customer data available</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const Kpi = ({ title, value, icon, color }) => {
  const colors = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    purple: "bg-purple-100 text-purple-600",
    orange: "bg-orange-100 text-orange-600",
  };

  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex justify-between items-center">
      <div>
        <p className="text-sm text-gray-500">{title}</p>
        <h3 className="text-2xl font-bold text-gray-900 mt-1">{value}</h3>
      </div>
      <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colors[color]}`}>
        {icon}
      </div>
    </div>
  );
};

export default SalesReport;
