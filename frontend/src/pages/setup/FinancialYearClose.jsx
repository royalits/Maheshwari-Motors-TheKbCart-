import React, { useState, useMemo, useEffect } from "react";
import {
  FaCalendarXmark,
  FaCircleInfo,
  FaCircleCheck,
} from "react-icons/fa6";
import { Button } from "../../components/ui";
import { ConfirmationDialog } from "../../components/common";
import { useNavigate } from "react-router-dom";
import api from "../../services/axiosInstance";
import useStore from "../../store";
import { getResponseData } from "../../services/apiUtils";

const FinancialYearClose = () => {
  const navigate = useNavigate();
  const {
    showToast,
    financialYears,
    selectedFinancialYear,
    setFinancialYears,
    setSelectedFinancialYear,
  } = useStore();

  const getCurrentFinancialYear = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;
    if (currentMonth >= 4) {
      return `${currentYear}-${currentYear + 1}`;
    } else {
      return `${currentYear - 1}-${currentYear}`;
    }
  };

  const currentFinancialYear = useMemo(
    () => selectedFinancialYear?.label || getCurrentFinancialYear(),
    [selectedFinancialYear],
  );
  const closeAllowedFrom = useMemo(() => {
    const endYear =
      Number(selectedFinancialYear?.end_year) ||
      Number(selectedFinancialYear?.start_year || 0) + 1;
    if (!endYear) return null;
    return new Date(endYear, 2, 1);
  }, [selectedFinancialYear]);
  const canCloseFinancialYear = useMemo(() => {
    if (!closeAllowedFrom) return true;
    const today = new Date();
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return todayDate >= closeAllowedFrom;
  }, [closeAllowedFrom]);
  const closeAllowedFromLabel = closeAllowedFrom
    ? closeAllowedFrom.toLocaleDateString("en-GB")
    : "";
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);
  const [isYearClosed, setIsYearClosed] = useState(false);
  const [isClosingYear, setIsClosingYear] = useState(false);
  const [closeMeta, setCloseMeta] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [closingSummary, setClosingSummary] = useState({
    totalChallans: 0,
    totalBills: 0,
    totalRevenue: 0,
    pendingPayments: 0,
    stockValue: 0,
    gstCollected: 0,
    gstPaid: 0,
  });

  const formatDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
  };

  const formatDateTime = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("en-GB");
  };

  useEffect(() => {
    const fetchSummary = async () => {
      setSummaryLoading(true);
      try {
        const [challansRes, billsRes, dashRes, yearsRes] = await Promise.allSettled([
          api.get("/challans", { params: { page: 1, limit: 1 } }),
          api.get("/bills", { params: { page: 1, limit: 1 } }),
          api.get("/dashboard"),
          api.get("/financial-years", { skipCache: true }),
        ]);

        const totalChallans =
          challansRes.status === "fulfilled"
            ? challansRes.value?.data?.data?.meta?.total ||
              challansRes.value?.data?.data?.totalDocs ||
              0
            : 0;

        const totalBills =
          billsRes.status === "fulfilled"
            ? billsRes.value?.data?.data?.meta?.total ||
              billsRes.value?.data?.data?.totalDocs ||
              0
            : 0;

        const dash =
          dashRes.status === "fulfilled"
            ? getResponseData(dashRes.value) || {}
            : {};

        setClosingSummary({
          totalChallans,
          totalBills,
          totalRevenue: dash?.total_revenue || dash?.totalRevenue || 0,
          pendingPayments: dash?.pending_payments || dash?.pendingPayments || 0,
          stockValue: dash?.stock_value || dash?.stockValue || 0,
          gstCollected: dash?.gst_collected || dash?.gstCollected || 0,
          gstPaid: dash?.gst_paid || dash?.gstPaid || 0,
        });

        if (yearsRes.status === "fulfilled") {
          const years = yearsRes.value?.data?.data || [];
          if (Array.isArray(years)) setFinancialYears(years);
        }
      } catch {
        // keep zeros
      } finally {
        setSummaryLoading(false);
      }
    };
    fetchSummary();
  }, [setFinancialYears, selectedFinancialYear?._id]);

  const handleYearClose = async () => {
    if (!canCloseFinancialYear) {
      showToast(
        `Financial year ${currentFinancialYear} can be closed from ${closeAllowedFromLabel} onwards`,
        "warning",
      );
      return;
    }

    try {
      setIsClosingYear(true);
      const res = await api.post("/setup/financial-year/close", {
        create_backup: true,
      });
      const result = res?.data?.data || {};
      setCloseMeta(result);
      setIsYearClosed(Boolean(!result?.skipped));
      const yearsRes = await api.get("/financial-years", { skipCache: true });
      const years = yearsRes?.data?.data || [];
      if (Array.isArray(years)) {
        setFinancialYears(years);
        const nextYear = years.find(
          (year) => String(year._id) === String(result?.next_financial_year?._id),
        );
        if (nextYear) setSelectedFinancialYear(nextYear);
      }
      setIsCloseDialogOpen(false);
      if (result?.backup?.status === "Success") {
        showToast("Financial year close completed and backup uploaded to AWS.", "success");
      } else {
        showToast(res?.data?.message || "Financial year close completed.", "success");
      }
    } catch (error) {
      showToast(error?.response?.data?.message || "Failed to close financial year", "error");
    } finally {
      setIsClosingYear(false);
    }
  };

  const SummaryCard = ({ title, value, color = "blue" }) => {
    const colorClasses = {
      blue: "bg-blue-50 text-blue-600 border-l-blue-500",
      green: "bg-green-50 text-green-600 border-l-green-500",
      red: "bg-red-50 text-red-600 border-l-red-500",
      purple: "bg-purple-50 text-purple-600 border-l-purple-500",
    };
    return (
      <div className={`p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 ${colorClasses[color]}`}>
        <h3 className="text-xs sm:text-sm font-medium text-gray-700">{title}</h3>
        <p className="text-base sm:text-lg md:text-xl font-bold text-gray-900 mt-1">{value}</p>
      </div>
    );
  };

  const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Financial Year Close</h1>
        <p className="text-gray-600">Close current financial year and prepare for new year</p>
      </div>

      {/* Financial Summary */}
      <div className="bg-white p-4 sm:p-6 rounded-lg border">
        <h3 className="font-medium text-gray-900 text-sm sm:text-base mb-4">
          Financial Year Summary (Read-Only)
        </h3>
        {summaryLoading ? (
          <div className="flex items-center justify-center py-8 text-gray-400 text-sm">
            Loading summary...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
              <SummaryCard title="Total Challans" value={closingSummary.totalChallans.toLocaleString()} />
              <SummaryCard title="Total Bills" value={closingSummary.totalBills.toLocaleString()} color="green" />
              <SummaryCard title="Total Revenue" value={fmt(closingSummary.totalRevenue)} color="purple" />
              <SummaryCard title="Pending Payments" value={fmt(closingSummary.pendingPayments)} color="red" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              <SummaryCard title="Stock Value" value={fmt(closingSummary.stockValue)} />
              <SummaryCard title="GST Collected" value={fmt(closingSummary.gstCollected)} color="green" />
              <SummaryCard title="GST Paid" value={fmt(closingSummary.gstPaid)} color="purple" />
            </div>
          </>
        )}
      </div>

      {/* Current Year Status */}
      <div className="bg-white p-4 sm:p-6 rounded-lg border">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 sm:p-3 bg-blue-50 rounded-lg">
            <FaCalendarXmark className="text-blue-600 text-lg sm:text-xl" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900 text-sm sm:text-base">Current Financial Year</h3>
            <p className="text-xl sm:text-2xl font-bold text-blue-600">{currentFinancialYear}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          {isYearClosed ? (
            <>
              <FaCircleCheck className="text-green-600 text-sm sm:text-base" />
              <span className="text-xs sm:text-sm font-medium text-green-600">Year Closed Successfully</span>
            </>
          ) : (
            <>
              <FaCircleInfo className="text-yellow-600 text-sm sm:text-base" />
              <span className="text-xs sm:text-sm font-medium text-yellow-600">Year is currently active</span>
            </>
          )}
        </div>

        {!isYearClosed && (
          <div className="bg-yellow-50 p-3 sm:p-4 rounded-lg border border-yellow-200">
            <div className="flex items-start gap-3">
              <FaCircleInfo className="text-yellow-600 mt-0.5 text-sm sm:text-base" />
              <div className="text-xs sm:text-sm text-yellow-800">
                <p className="font-medium mb-1">Before closing the financial year:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Ensure all transactions are recorded</li>
                  <li>Complete all pending bill generations</li>
                  <li>Reconcile all accounts</li>
                  <li>Take a complete backup</li>
                  <li>Verify stock counts</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Section */}
      {!isYearClosed && (
        <div className="bg-white p-4 sm:p-6 rounded-lg border">
          <h3 className="font-medium text-gray-900 text-sm sm:text-base mb-4">Close Financial Year</h3>
          <div className="bg-red-50 p-3 sm:p-4 rounded-lg border border-red-200 mb-4">
            <div className="flex items-start gap-3">
              <FaCircleInfo className="text-red-600 mt-0.5 text-sm sm:text-base" />
              <div className="text-xs sm:text-sm text-red-800">
                <p className="font-medium mb-1">Warning:</p>
                <p>Closing moves stock into opening stock and starts next financial year.</p>
              </div>
            </div>
          </div>
          {!canCloseFinancialYear && (
            <p className="text-xs sm:text-sm text-yellow-700 mb-3">
              Financial year can be closed from {closeAllowedFromLabel} onwards.
            </p>
          )}
          <Button
            onClick={() => setIsCloseDialogOpen(true)}
            disabled={!canCloseFinancialYear || isClosingYear}
            className="bg-red-600 hover:bg-red-700 text-white text-sm sm:text-base"
          >
            Close Financial Year {currentFinancialYear}
          </Button>
        </div>
      )}

      {financialYears.length > 0 && (
        <div className="bg-white p-4 sm:p-6 rounded-lg border">
          <h3 className="font-medium text-gray-900 text-sm sm:text-base mb-4">
            Financial Years
          </h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-4">Year</th>
                  <th className="py-2 pr-4">Start Date</th>
                  <th className="py-2 pr-4">End Date</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4">Closed At</th>
                  <th className="py-2 pr-4">Backup</th>
                </tr>
              </thead>
              <tbody>
                {financialYears.map((year) => (
                  <tr key={year._id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{year.label}</td>
                    <td className="py-2 pr-4">
                      {formatDate(year.start_date)}
                    </td>
                    <td className="py-2 pr-4">
                      {formatDate(year.end_date)}
                    </td>
                    <td className="py-2 pr-4 capitalize">{year.status}</td>
                    <td className="py-2 pr-4">
                      {formatDateTime(year.closed_at)}
                    </td>
                    <td className="py-2 pr-4">{year.close_backup_id || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Success Message */}
      {isYearClosed && (
        <div className="bg-green-50 p-4 sm:p-6 rounded-lg border border-green-200">
          <div className="flex items-center gap-3">
            <FaCircleCheck className="text-green-600 text-lg sm:text-xl" />
            <div>
              <h3 className="font-medium text-green-800 text-sm sm:text-base">Financial Year Closed Successfully</h3>
              <p className="text-xs sm:text-sm text-green-700">
                Financial year {currentFinancialYear} has been closed. The system is now ready for the new financial year.
              </p>
              {closeMeta?.backup?.download_url && (
                <a href={closeMeta.backup.download_url} target="_blank" rel="noreferrer"
                  className="inline-block mt-2 text-xs sm:text-sm text-green-700 underline">
                  Download Backup Excel
                </a>
              )}
              <div className="mt-2">
                <Button variant="outline" onClick={() => navigate("/setup/backup-restore")} className="text-xs sm:text-sm">
                  View In Backup / Restore
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationDialog
        isOpen={isCloseDialogOpen}
        onClose={() => setIsCloseDialogOpen(false)}
        onConfirm={handleYearClose}
        title="Close Financial Year"
        message={`Are you sure you want to close financial year ${currentFinancialYear}? This creates the next financial year and moves current stock into opening stock.`}
        confirmText={isClosingYear ? "Closing..." : "Close Year"}
        loading={isClosingYear}
        type="danger"
      />
    </div>
  );
};

export default FinancialYearClose;
