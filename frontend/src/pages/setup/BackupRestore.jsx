import React, { useState, useEffect } from "react";
import {
  FaDownload,
  FaUpload,
  FaClockRotateLeft,
  FaPlay,
  FaArrowUpRightFromSquare,
  FaTrash,
  FaCircleCheck,
  FaTriangleExclamation,
  FaCircleXmark,
  FaFileExcel,
  FaSpinner,
} from "react-icons/fa6";
import { DataTable, Modal } from "../../components/common";
import api from "../../services/axiosInstance";
import useStore from "../../store";

const BackupRestore = () => {
  const { showToast } = useStore();
  const [selectedOpt, setSelectedOpt] = useState(null);
  const [backupLogs, setBackupLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [selectedFile, setSelectedFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [backingUp, setBackingUp] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const [downloadingBackupId, setDownloadingBackupId] = useState(null);

  const handleDownloadBackup = async (log) => {
    try {
      setDownloadingBackupId(log.id);
      const res = await api.get(`/backup/logs/${log.id}/download`, {
        responseType: "blob",
      });
      const disposition = res.headers?.["content-disposition"] || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename =
        filenameMatch?.[1] || log.filename || `${log.type || "backup"}.xlsx`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Backup downloaded successfully", "success");
    } catch (err) {
      showToast(
        err?.response?.data?.message || "Failed to download backup",
        "error",
      );
    } finally {
      setDownloadingBackupId(null);
    }
  };

  useEffect(() => {
    const loadLogs = async () => {
      try {
        setLoadingLogs(true);
        setBackupLogs([]);
        
        const res = await api.get("/backup/logs");
        const list = res?.data?.data || res?.data || [];
        setBackupLogs(list);
      } catch {
        setBackupLogs([
          {
            id: 4,
            date: "2024-01-15 10:30",
            type: "Auto backup",
            size: "2.5 MB",
            status: "Success",
            note: "Scheduled",
          },
          {
            id: 3,
            date: "2024-01-14 10:30",
            type: "Auto backup",
            size: "2.4 MB",
            status: "Success",
            note: "Scheduled",
          },
          {
            id: 2,
            date: "2024-01-13 15:45",
            type: "Manual backup",
            size: "2.3 MB",
            status: "Success",
            note: "User triggered",
          },
          {
            id: 1,
            date: "2024-01-12 10:30",
            type: "Auto backup",
            size: "2.2 MB",
            status: "Failed",
            note: "Disk quota exceeded",
          },
        ]);
      }
      
      setTimeout(() => {
        setLoadingLogs(false);
      }, 100);
    };
    loadLogs();
  }, []);

  const columns = [
    {
      key: "id",
      label: "#",
      render: (v) => <span className="text-xs text-gray-400">{v}</span>,
    },
    {
      key: "date",
      label: "Date & time",
      render: (v) => (
        <span className="text-xs font-mono text-gray-500">{v}</span>
      ),
    },
    {
      key: "type",
      label: "Type",
      render: (v) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
          {v}
        </span>
      ),
    },
    {
      key: "firm_scope",
      label: "Firm",
      render: (v) => (
        <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
          {v || "—"}
        </span>
      ),
    },
    {
      key: "size",
      label: "Size",
      render: (v) => <span className="text-sm text-gray-500">{v || "—"}</span>,
    },
    {
      key: "status",
      label: "Status",
      render: (v) => (
        <span
          className={`text-xs px-2 py-0.5 rounded-full font-medium ${
            v === "Success"
              ? "bg-green-100 text-green-700"
              : v === "Failed"
                ? "bg-red-100 text-red-700"
                : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {v}
        </span>
      ),
    },
    {
      key: "note",
      label: "Note",
      render: (v) => <span className="text-xs text-gray-400">{v}</span>,
    },
    {
      key: "download_url",
      label: "Download",
      render: (_, row) =>
        row?.status === "Success" ? (
          <button
            onClick={() => handleDownloadBackup(row)}
            disabled={downloadingBackupId === row.id}
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 focus:outline-none cursor-pointer disabled:opacity-50"
          >
            {downloadingBackupId === row.id ? "Downloading..." : "Download"}
            <FaArrowUpRightFromSquare size={10} />
          </button>
        ) : (
          <span className="text-xs text-gray-300">N/A</span>
        ),
    },
    {
      key: "id",
      label: "Delete",
      render: (v, row) => (
        <button
          onClick={() => handleDelete(v)}
          disabled={deletingId === v}
          className="inline-flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Delete this backup entry"
        >
          {deletingId === v ? (
            <>
              <span className="w-3 h-3 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
              Deleting...
            </>
          ) : (
            <>
              <FaTrash size={11} />
              Delete
            </>
          )}
        </button>
      ),
    },
  ];

  const handleTriggerBackup = async () => {
    try {
      setBackingUp(true);
      const res = await api.post("/backup/create");
      const newEntry = res?.data?.data || {
        id: backupLogs.length + 1,
        date: new Date().toLocaleString("sv-SE").slice(0, 16),
        type: "Manual Backup",
        size: "—",
        status: "Success",
        note: "User triggered",
      };
      setBackupLogs((prev) => [newEntry, ...prev]);
      showToast("Backup created successfully", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || "Backup failed", "error");
    } finally {
      setBackingUp(false);
    }
  };

  const handleInitiateImport = async () => {
    if (!selectedFile) return;
    const isExcel = /\.xlsx$/i.test(selectedFile.name);
    if (!isExcel) {
      executeImport();
      return;
    }

    try {
      setPreviewLoading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      const res = await api.post("/setup/import/preview", formData);
      const data = res?.data?.data;
      if (data) {
        setPreviewData(data);
        setShowPreviewModal(true);
      } else {
        executeImport();
      }
    } catch (err) {
      console.error("Preview failed:", err);
      showToast(
        err?.response?.data?.message || "Failed to generate import preview",
        "error"
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = () => {
    setShowPreviewModal(false);
    executeImport();
  };

  const executeImport = async () => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    const isExcel = /\.xlsx$/i.test(selectedFile.name);
    const endpoint = isExcel ? "/setup/import" : "/setup/restore";
    try {
      setImporting(true);
      setUploadProgress(0);

      // First upload to backup storage
      const backupFormData = new FormData();
      backupFormData.append("file", selectedFile);
      await api.post("/backup/upload-excel", backupFormData, {
        onUploadProgress: (evt) => {
          if (evt.total)
            setUploadProgress(Math.round((evt.loaded * 100) / evt.total) / 2); // First half for backup upload
        },
      });

      // Then import the data
      const importRes = await api.post(endpoint, formData, {
        onUploadProgress: (evt) => {
          if (evt.total)
            setUploadProgress(50 + Math.round((evt.loaded * 100) / evt.total) / 2); // Second half for data import
        },
      });

      // Get import result details
      const importPayload = importRes?.data?.data || {};
      const isItemImport = importPayload?.totalImported !== undefined;
      const importJob = isItemImport ?
        {
          status: importPayload.totalFailed > 0 ? "completed_with_errors" : "completed",
          result: {
            successful: importPayload.totalImported,
            total_rows: importPayload.totalRows,
            failed: importPayload.totalFailed,
            created: importPayload.totalCreated,
            updated: importPayload.totalUpdated,
          },
        }
      : importPayload;
      const importResult = importJob.result || {};
      const isBackupImport =
        !isItemImport &&
        (importResult?.total_collections !== undefined ||
          importResult?.total_records !== undefined);
      const successfulCount = Number(
        importResult?.successful ?? importResult?.total_records ?? 0,
      );
      const totalCount = Number(
        importResult?.total_rows ??
          importResult?.total_records ??
          successfulCount,
      );
      const failedCount = Number(
        importResult?.failed ?? importResult?.errors_count ?? 0,
      );

      // Show detailed results
      if (importJob.status === "completed_with_errors") {
        if (isBackupImport) {
          showToast(
            `Backup import completed with errors: ${successfulCount} records imported across ${importResult?.total_collections || 0} collections. ${failedCount} collection(s) failed.`,
            "warning",
          );
        } else {
          showToast(
            `Import completed with errors: ${successfulCount}/${totalCount} items imported successfully. ${failedCount} failed.`,
            "warning",
          );
        }
      } else if (importJob.status === "completed") {
        if (isBackupImport) {
          showToast(
            `Backup import completed: ${successfulCount} records imported across ${importResult?.total_collections || 0} collections.`,
            "success",
          );
        } else {
          const createdCount = Number(importResult?.created || 0);
          const updatedCount = Number(importResult?.updated || 0);
          showToast(
            `Imported ${successfulCount} item(s): ${createdCount} new, ${updatedCount} updated.`,
            "success",
          );
        }
      } else if (importJob.status === "failed") {
        showToast(
          `Import failed: ${importJob.error || "Unknown error"}`,
          "error"
        );
      } else {
        showToast("Import finished", "success");
      }

      const newEntry = {
        id: backupLogs.length + 1,
        date: new Date().toLocaleString("sv-SE").slice(0, 16),
        type: "Excel import",
        size: "—",
        status: importJob.status === "failed" ? "Failed" : "Success",
        note:
          isBackupImport ?
            `${selectedFile.name} (${successfulCount} records, ${importResult?.total_collections || 0} collections)`
          : `${selectedFile.name} (${successfulCount}/${totalCount} items)`,
      };
      setBackupLogs((prev) => [newEntry, ...prev]);
    } catch (err) {
      showToast(err?.response?.data?.message || "Import failed", "error");
    } finally {
      setImporting(false);
      setSelectedFile(null);
      setUploadProgress(0);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setDownloadingTemplate(true);
      const res = await api.get("/setup/import/template", {
        responseType: "blob",
      });
      const disposition = res.headers?.["content-disposition"] || "";
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || "stock_import_template.xlsx";
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast("Template downloaded successfully", "success");
    } catch (err) {
      showToast(
        err?.response?.data?.message || "Template download failed",
        "error",
      );
    } finally {
      setDownloadingTemplate(false);
    }
  };

  const handleDelete = async (logId) => {
    if (!window.confirm("Are you sure you want to delete this backup entry? This action cannot be undone.")) {
      return;
    }
    
    try {
      setDeletingId(logId);
      await api.delete(`/backup/logs/${logId}`);
      setBackupLogs((prev) => prev.filter((log) => log.id !== logId));
      showToast("Backup entry deleted successfully", "success");
    } catch (err) {
      showToast(err?.response?.data?.message || "Delete failed", "error");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredLogs = backupLogs.filter(
    (r) =>
      (!filterType || r.type === filterType) &&
      (!filterStatus || r.status === filterStatus),
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Backup / Restore
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage database snapshots and import data from Excel exports.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400 pt-1">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          Auto backup: daily 10:30 AM
        </div>
      </div>

      {/* Action card */}
      <div className="bg-white border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
          Actions
        </p>

        <div className="flex gap-3 flex-wrap">
          {/* Create backup option */}
          <button
            onClick={() =>
              setSelectedOpt(selectedOpt === "backup" ? null : "backup")
            }
            className={`flex-1 min-w-[180px] text-left border rounded-lg p-3 transition-all ${
              selectedOpt === "backup"
                ? "border-blue-400 bg-blue-50"
                : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
            }`}
          >
            <div className="w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center mb-2">
              <FaDownload className="text-blue-600" size={13} />
            </div>
            <p className="text-sm font-medium text-gray-800">Create backup</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Snapshot current firm data only
            </p>
          </button>

          {/* Import Excel option */}
          <button
            onClick={() =>
              setSelectedOpt(selectedOpt === "import" ? null : "import")
            }
            className={`flex-1 min-w-[180px] text-left border rounded-lg p-3 transition-all ${
              selectedOpt === "import"
                ? "border-green-400 bg-green-50"
                : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
            }`}
          >
            <div className="w-8 h-8 rounded-md bg-green-100 flex items-center justify-center mb-2">
              <FaUpload className="text-green-600" size={13} />
            </div>
            <p className="text-sm font-medium text-gray-800">Import Excel</p>
            <p className="text-xs text-gray-400 mt-0.5">
              Upload backup or stock items. Auto-detects format and imports accordingly.
            </p>
          </button>

          {/* Download template option */}
          <button
            onClick={() =>
              setSelectedOpt(selectedOpt === "template" ? null : "template")
            }
            className={`flex-1 min-w-[180px] text-left border rounded-lg p-3 transition-all ${
              selectedOpt === "template"
                ? "border-purple-400 bg-purple-50"
                : "border-gray-200 bg-gray-50 hover:bg-white hover:border-gray-300"
            }`}
          >
            <div className="w-8 h-8 rounded-md bg-purple-100 flex items-center justify-center mb-2">
              <FaDownload className="text-purple-600" size={13} />
            </div>
            <p className="text-sm font-medium text-gray-800">
              Download Template
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              Download stock item Excel format for import.
            </p>
          </button>
        </div>

        {/* Backup panel */}
        {selectedOpt === "backup" && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-500">
              Current firm backup will be created and logged below.
            </p>
            <button
              onClick={handleTriggerBackup}
              disabled={backingUp}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              <FaPlay size={11} />
              {backingUp ? "Running..." : "Run backup"}
            </button>
          </div>
        )}

        {/* Template panel */}
        {selectedOpt === "template" && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-4 flex-wrap">
            <p className="text-sm text-gray-500">
              Use this Excel format to add item data, then import it back into
              the software.
            </p>
            <button
              onClick={handleDownloadTemplate}
              disabled={downloadingTemplate}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              <FaDownload size={11} />
              {downloadingTemplate ? "Downloading..." : "Download Template"}
            </button>
          </div>
        )}

        {/* Import panel */}
        {selectedOpt === "import" && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-600 cursor-pointer hover:bg-white transition-colors">
              <FaUpload size={12} />
              {selectedFile ? "Change file" : "Choose file"}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => setSelectedFile(e.target.files[0] || null)}
              />
            </label>

            {selectedFile && (
              <span className="text-xs text-gray-400 flex-1 truncate">
                {selectedFile.name}
              </span>
            )}

            <button
              onClick={handleInitiateImport}
              disabled={!selectedFile || importing || previewLoading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium disabled:opacity-40 hover:bg-gray-700 transition-colors"
            >
              <FaUpload size={11} />
              {previewLoading ? (
                <>
                  <FaSpinner className="animate-spin text-xs" />
                  Analyzing file...
                </>
              ) : importing ? (
                <>
                  <FaUpload size={11} />
                  {`Importing... ${uploadProgress}%`}
                </>
              ) : (
                <>
                  <FaUpload size={11} />
                  Import & Upload
                </>
              )}
            </button>

            {importing && (
              <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Backup history table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <FaClockRotateLeft size={13} className="text-gray-400" />
            <span className="text-sm font-medium text-gray-800">
              Backup history
            </span>
            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
              {backupLogs.length}{" "}
              {backupLogs.length === 1 ? "entry" : "entries"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs border border-gray-200 bg-gray-50 rounded-md px-2 py-1.5 text-gray-600"
            >
              <option value="">All types</option>
              <option value="Manual Backup">Manual Backup</option>
              <option value="Financial Year Close Backup">
                Financial Year Close Backup
              </option>
              <option value="Auto backup">Auto backup</option>
              <option value="Excel import">Excel import</option>
              <option value="File Import">File Import</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="text-xs border border-gray-200 bg-gray-50 rounded-md px-2 py-1.5 text-gray-600"
            >
              <option value="">All statuses</option>
              <option value="Success">Success</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loadingLogs ? (
            <p className="text-xs text-gray-400 p-4">Loading backup logs...</p>
          ) : filteredLogs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              No entries match the selected filters.
            </p>
          ) : (
            <DataTable loading={loadingLogs} columns={columns} data={filteredLogs} sortable />
          )}
        </div>
      </div>

      {/* Import Preview & Confirmation Modal */}
      <Modal
        isOpen={showPreviewModal}
        onClose={() => setShowPreviewModal(false)}
        title="Excel Import Preview & Confirmation"
        size="xl"
      >
        {previewData && (
          <div className="space-y-4">
            {/* File & Header Info */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FaFileExcel className="text-green-600 text-lg" />
                <span className="font-semibold text-gray-800 text-sm">
                  {previewData.fileName}
                </span>
              </div>
              <span className="text-xs text-gray-500 bg-white border px-2 py-0.5 rounded">
                Total Rows: {previewData.summary?.totalRows || 0}
              </span>
            </div>

            {/* Summary KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-2.5 text-center">
                <div className="text-xs font-medium text-green-700">New Records</div>
                <div className="text-xl font-bold text-green-700">
                  {previewData.summary?.newCount || 0}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-center">
                <div className="text-xs font-medium text-amber-700">Will Update</div>
                <div className="text-xl font-bold text-amber-700">
                  {previewData.summary?.updatedCount || 0}
                </div>
              </div>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-2.5 text-center">
                <div className="text-xs font-medium text-gray-600">Unchanged</div>
                <div className="text-xl font-bold text-gray-700">
                  {previewData.summary?.unchangedCount || 0}
                </div>
              </div>
              <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 text-center">
                <div className="text-xs font-medium text-rose-700">Skipped / Invalid</div>
                <div className="text-xl font-bold text-rose-700">
                  {previewData.summary?.skippedCount || 0}
                </div>
              </div>
            </div>

            {/* Detailed Warning for Updates if any */}
            {previewData.sheets?.bills?.updates?.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-amber-800 font-semibold text-sm">
                  <FaTriangleExclamation className="text-amber-600" />
                  Existing Bills Amount Updates ({previewData.sheets.bills.updates.length}):
                </div>
                <p className="text-xs text-amber-700">
                  The following bills already exist in the database. Importing will update their bill amount:
                </p>
                <div className="max-h-40 overflow-y-auto border border-amber-200 rounded bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-amber-100 text-amber-900 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left">Bill No</th>
                        <th className="px-2 py-1 text-left">Party</th>
                        <th className="px-2 py-1 text-right">Old Amount</th>
                        <th className="px-2 py-1 text-right">New Amount</th>
                        <th className="px-2 py-1 text-right">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-amber-100">
                      {previewData.sheets.bills.updates.map((u, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/50">
                          <td className="px-2 py-1 font-mono font-medium">{u.bill_no}</td>
                          <td className="px-2 py-1 truncate max-w-[150px]">{u.party_name}</td>
                          <td className="px-2 py-1 text-right text-gray-500 line-through">
                            ₹{Number(u.old_amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-2 py-1 text-right font-semibold text-amber-700">
                            ₹{Number(u.new_amount).toLocaleString("en-IN")}
                          </td>
                          <td className="px-2 py-1 text-right font-mono font-medium text-blue-600">
                            {u.diff > 0 ? `+₹${u.diff.toLocaleString("en-IN")}` : `-₹${Math.abs(u.diff).toLocaleString("en-IN")}`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Skipped Rows / Errors if any */}
            {previewData.sheets?.bills?.skipped?.length > 0 && (
              <div className="border border-rose-200 bg-rose-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-rose-800 font-semibold text-sm">
                  <FaCircleXmark className="text-rose-600" />
                  Skipped / Invalid Rows ({previewData.sheets.bills.skipped.length}):
                </div>
                <div className="max-h-36 overflow-y-auto border border-rose-200 rounded bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-rose-100 text-rose-900 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-center w-12">Row</th>
                        <th className="px-2 py-1 text-left">Bill No</th>
                        <th className="px-2 py-1 text-left">Party</th>
                        <th className="px-2 py-1 text-left">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-rose-100">
                      {previewData.sheets.bills.skipped.map((s, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/50">
                          <td className="px-2 py-1 text-center text-gray-500">{s.row}</td>
                          <td className="px-2 py-1 font-mono">{s.bill_no}</td>
                          <td className="px-2 py-1 truncate max-w-[140px]">{s.party_name}</td>
                          <td className="px-2 py-1 text-rose-700 font-medium">{s.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* New Bills sample if any */}
            {previewData.sheets?.bills?.newRecords?.length > 0 && (
              <div className="border border-green-200 bg-green-50/50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-green-800 font-semibold text-sm">
                  <FaCircleCheck className="text-green-600" />
                  New Bills to be Created ({previewData.sheets.bills.newRecords.length}):
                </div>
                <div className="max-h-36 overflow-y-auto border border-green-200 rounded bg-white">
                  <table className="w-full text-xs">
                    <thead className="bg-green-100 text-green-900 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-center w-12">Row</th>
                        <th className="px-2 py-1 text-left">Bill No</th>
                        <th className="px-2 py-1 text-left">Party</th>
                        <th className="px-2 py-1 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-green-100">
                      {previewData.sheets.bills.newRecords.slice(0, 50).map((n, idx) => (
                        <tr key={idx} className="hover:bg-green-50/50">
                          <td className="px-2 py-1 text-center text-gray-500">{n.row}</td>
                          <td className="px-2 py-1 font-mono font-medium">{n.bill_no}</td>
                          <td className="px-2 py-1 truncate max-w-[140px]">{n.party_name}</td>
                          <td className="px-2 py-1 text-right font-semibold text-green-700">
                            ₹{Number(n.amount).toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium transition-colors"
              >
                Cancel / रद्द करें
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium shadow-sm transition-colors"
              >
                <FaCircleCheck className="text-white" />
                Confirm & Import / पुष्टि करें और इम्पोर्ट करें
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BackupRestore;