import React, { useEffect } from 'react';
import { FaCheckCircle, FaExclamationCircle, FaInfoCircle, FaTimes } from 'react-icons/fa';
import useStore from '../store';

// Toast Component
export const Toast = () => {
  const toast = useStore((s) => s.toast);
  const hideToast = useStore((s) => s.hideToast);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        hideToast();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  if (!toast) return null;

  const icons = {
    success: <FaCheckCircle className="text-green-500" />,
    error: <FaExclamationCircle className="text-red-500" />,
    warning: <FaExclamationCircle className="text-yellow-500" />,
    info: <FaInfoCircle className="text-blue-500" />
  };

  const bgColors = {
    success: 'bg-green-50 border-green-200',
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    info: 'bg-blue-50 border-blue-200'
  };

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-right duration-300">
      <div className={`flex items-center gap-3 p-4 border rounded-lg shadow-lg max-w-md ${bgColors[toast.type]}`}>
        {icons[toast.type]}
        <p className="text-sm text-gray-800 flex-1">{toast.message}</p>
        <button
          onClick={hideToast}
          className="text-gray-400 hover:text-gray-600"
        >
          <FaTimes className="text-sm" />
        </button>
      </div>
    </div>
  );
};

// Confirm Dialog Component
export const ConfirmDialog = () => {
  const confirmDialog = useStore((s) => s.confirmDialog);
  const hideConfirm = useStore((s) => s.hideConfirm);

  if (!confirmDialog) return null;

  const handleConfirm = () => {
    confirmDialog.onConfirm?.();
    hideConfirm();
  };

  const handleCancel = () => {
    confirmDialog.onCancel?.();
    hideConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />
        
        <div className="inline-block w-full max-w-md p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg">
          <div className="flex items-center gap-3 mb-4">
            <FaExclamationCircle className="text-yellow-500 text-xl" />
            <h3 className="text-lg font-medium text-gray-900">Confirm Action</h3>
          </div>
          
          <p className="text-sm text-gray-600 mb-6">
            {confirmDialog.message}
          </p>
          
          <div className="flex gap-3 justify-end">
            <button
              onClick={handleCancel}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Loading Overlay Component
export const LoadingOverlay = () => {
  const loading = useStore((s) => s.loading);
  const financialYearSwitching = useStore((s) => s.financialYearSwitching);
  
  if (!loading && !financialYearSwitching) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black bg-opacity-25 flex items-center justify-center">
      <div className="bg-white p-6 rounded-lg shadow-lg flex items-center gap-3">
        <svg className="animate-spin h-5 w-5 text-blue-600" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <span className="text-sm text-gray-700">
          {financialYearSwitching ? "Loading financial year..." : "Loading..."}
        </span>
      </div>
    </div>
  );
};
