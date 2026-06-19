import React, { useEffect, useRef, useState } from "react";
import { FaTimes } from "react-icons/fa";
import useStore from "../store";
import {
  normalizeItemScanValue,
  resolveItemFromScan,
} from "../utils/itemScan";

const SCANNER_CHAR_GAP_MS = 80;
const SCANNER_IDLE_SUBMIT_MS = 120;
const MIN_SCAN_LENGTH = 6;

const BillGunScanner = ({ onScanComplete, onClose }) => {
  const [scannerValue, setScannerValue] = useState("");
  const [scannedItems, setScannedItems] = useState([]);
  const [scannerActive, setScannerActive] = useState(false);
  const scannerActiveTimerRef = useRef(null);
  const scannerInputRef = useRef(null);
  const scannerValueRef = useRef("");
  const scanBufferRef = useRef("");
  const autoSubmitTimerRef = useRef(null);
  const lastProcessedScanRef = useRef({ value: "", time: 0 });
  const lastKeyTimeRef = useRef(0);
  const scanCounterRef = useRef(0);
  const { showToast } = useStore();

  const clearAutoSubmitTimer = () => {
    if (autoSubmitTimerRef.current) {
      window.clearTimeout(autoSubmitTimerRef.current);
      autoSubmitTimerRef.current = null;
    }
  };

  const syncScannerValue = (value) => {
    scannerValueRef.current = value;
    scanBufferRef.current = value;
    setScannerValue(value);
    // mark scanner as active
    setScannerActive(true);
    if (scannerActiveTimerRef.current) clearTimeout(scannerActiveTimerRef.current);
    scannerActiveTimerRef.current = setTimeout(() => setScannerActive(false), 1500);
  };

  const focusScannerInput = () => {
    window.setTimeout(() => {
      scannerInputRef.current?.focus();
      scannerInputRef.current?.select?.();
    }, 30);
  };

  const handleScannerSubmit = (valueOverride) => {
    const rawValue = normalizeItemScanValue(
      valueOverride ?? scannerValueRef.current ?? scannerValue,
    );
    if (!rawValue) return;
    if (rawValue.length < MIN_SCAN_LENGTH) return;

    const now = Date.now();
    if (
      lastProcessedScanRef.current.value === rawValue &&
      now - lastProcessedScanRef.current.time < 250
    ) {
      return;
    }

    lastProcessedScanRef.current = { value: rawValue, time: now };
    clearAutoSubmitTimer();
    syncScannerValue("");
    focusScannerInput();

    const scanId = `scan-${Date.now()}-${scanCounterRef.current++}`;
    setScannedItems((prev) => [
      ...prev,
      {
        id: scanId,
        rawValue,
        itemName: "Resolving item...",
        itemCode: "",
        status: "loading",
      },
    ]);

    resolveItemFromScan({ rawValue, loadedItems: [] })
      .then((item) => {
        setScannedItems((prev) =>
          prev.map((entry) =>
            entry.id === scanId ?
              {
                ...entry,
                itemName: item?.name || item?.itemName || "Unknown Item",
                itemCode: item?.item_id || item?.barcode || "",
                status: "resolved",
              }
            : entry,
          ),
        );
      })
      .catch((error) => {
        setScannedItems((prev) =>
          prev.map((entry) =>
            entry.id === scanId ?
              {
                ...entry,
                itemName: "Item not found",
                itemCode: rawValue,
                status: "error",
              }
            : entry,
          ),
        );
        showToast(
          error?.response?.data?.message ||
            error?.message ||
            "Unable to resolve scanned item",
          "error",
        );
      });
  };

  const handleContinue = () => {
    const successfulScans = scannedItems.filter(
      (item) => item.status === "resolved",
    );
    if (successfulScans.length === 0) {
      showToast("Please scan at least one item QR code", "error");
      return;
    }

    onScanComplete({
      scanType: "item-qr-bulk",
      scannedValues: successfulScans.map((item) => item.rawValue),
      source: "hardware-scanner",
    });
  };

  const handleClearAll = () => {
    setScannedItems([]);
    syncScannerValue("");
    lastProcessedScanRef.current = { value: "", time: 0 };
    lastKeyTimeRef.current = 0;
    focusScannerInput();
  };

  useEffect(() => {
    focusScannerInput();
    return () => clearAutoSubmitTimer();
  }, []);

  useEffect(() => {
    const scheduleAutoSubmit = (value) => {
      clearAutoSubmitTimer();
      autoSubmitTimerRef.current = window.setTimeout(() => {
        const nextValue = normalizeItemScanValue(value);
        if (nextValue.length >= MIN_SCAN_LENGTH) {
          handleScannerSubmit(nextValue);
        }
      }, SCANNER_IDLE_SUBMIT_MS);
    };

    const handleGlobalKeyDown = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Enter") {
        const nextValue = normalizeItemScanValue(
          scanBufferRef.current || scannerValueRef.current,
        );
        if (!nextValue) return;
        event.preventDefault();
        handleScannerSubmit(nextValue);
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        const nextValue = scanBufferRef.current.slice(0, -1);
        syncScannerValue(nextValue);
        if (nextValue) scheduleAutoSubmit(nextValue);
        return;
      }

      if (event.key.length !== 1) return;

      event.preventDefault();
      const now = Date.now();
      const gap = now - lastKeyTimeRef.current;
      if (gap > SCANNER_CHAR_GAP_MS) {
        syncScannerValue("");
      }
      lastKeyTimeRef.current = now;
      const nextValue = `${scanBufferRef.current}${event.key}`;
      syncScannerValue(nextValue);
      scheduleAutoSubmit(nextValue);
    };

    window.addEventListener("keydown", handleGlobalKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown, true);
      clearAutoSubmitTimer();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-lg">
        <div className="sticky top-0 flex items-center justify-between border-b bg-white p-4">
          <h2 className="text-xl font-semibold text-gray-900">Item QR Scanner</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <FaTimes size={20} />
          </button>
        </div>

        <div className="p-6">
          <div className="space-y-5">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="text-lg font-semibold text-gray-900">Scan Item QR</h3>
              <p className="mt-1 text-sm text-gray-600">
                Use the hardware scanner to scan the QR labels attached to items. After scanning all items, click Continue to add them to the bill.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700">Scanner Status</label>
                <div className="flex items-center gap-1.5">
                  <span className={`inline-block w-2.5 h-2.5 rounded-full ${scannerActive ? "bg-green-500 animate-pulse" : "bg-gray-300"}`} />
                  <span className={`text-xs font-semibold ${scannerActive ? "text-green-600" : "text-gray-400"}`}>
                    {scannerActive ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
              <input
                ref={scannerInputRef}
                type="text"
                value={scannerValue}
                readOnly
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleScannerSubmit();
                  }
                }}
                className={`w-full rounded-lg border px-3 py-3 focus:border-transparent focus:ring-2 focus:ring-blue-500 transition-colors ${
                  scannerActive ? "border-green-400 bg-green-50" : "border-gray-300"
                }`}
                placeholder="Ready for scanner..."
              />
              <p className="mt-2 text-xs text-gray-500">
                The scanner reads the QR code and fills this field automatically.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">Scanned Items</h4>
                  <p className="text-xs text-gray-500">
                    {
                      scannedItems.filter((item) => item.status === "resolved")
                        .length
                    }{" "}
                    item scan
                    {scannedItems.filter((item) => item.status === "resolved")
                      .length === 1 ?
                      ""
                    : "s"}{" "}
                    ready for billing
                  </p>
                </div>
                {scannedItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {scannedItems.length > 0 ? (
                <div className="mt-3 max-h-40 space-y-2 overflow-y-auto">
                  {scannedItems.map((item, index) => (
                    <div
                      key={item.id}
                      className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium text-gray-900">
                            #{index + 1} {item.itemName}
                          </div>
                          <div className="mt-1 font-mono text-[11px] text-gray-500">
                            {item.itemCode || item.rawValue}
                          </div>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            item.status === "resolved" ?
                              "bg-green-100 text-green-700"
                            : item.status === "error" ?
                              "bg-red-100 text-red-700"
                            : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {item.status === "resolved" ?
                            "Added"
                          : item.status === "error" ?
                            "Error"
                          : "Scanning"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs text-gray-500">
                  Scanned item names will appear here automatically.
                </p>
              )}
            </div>

            <div className="flex gap-3 border-t pt-2">
              <button
                onClick={onClose}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 transition hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={handleContinue}
                disabled={
                  scannedItems.filter((item) => item.status === "resolved")
                    .length === 0
                }
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BillGunScanner;
