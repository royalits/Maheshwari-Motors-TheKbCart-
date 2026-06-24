import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import {
  // FaEye,
  FaFileInvoiceDollar,
  FaFilter,
  FaLink,
  FaEdit,
  FaTrash,
  FaDownload,
  FaPrint,
  FaPlus,
  FaCamera,
  FaShoppingCart,
} from "react-icons/fa";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button, Input, Select } from "../../components/ui";
import BillGunScanner from "../../components/BillGunScanner";
import useStore from "../../store";
import api from "../../services/axiosInstance"; //
import { logBillScanDiagnostics } from "../../services/billScanDiagnostics";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import {
  getResponseData,
  getResponseList,
  getEntityId,
  normalizeBill,
} from "../../services/apiUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import useFirmBranding from "../../hooks/useFirmBranding";
import {
  getFinancialYearStartDate,
  getTodayDate,
  normalizeDisplayDateInput,
  toDisplayDate,
  toISODate,
} from "../../utils/dateHelpers";

const BILL_SCAN_TIMEOUT_MS = 400000;
const BILL_SCAN_MIN_STEP_MS = 1000;
const BILL_SCAN_ACCEPT = "image/*,application/pdf";
const BILL_SCAN_PROGRESS_STEPS = [
  {
    id: "uploading_images",
    label: "Uploading files",
    description: "Securely transferring selected bill files.",
  },
  {
    id: "optimizing_images",
    label: "Optimizing files",
    description: "Preparing files for accurate document analysis.",
  },
  {
    id: "analyzing_bill",
    label: "Analyzing bill",
    description: "Reading document structure and bill content.",
  },
  {
    id: "extracting_items",
    label: "Extracting items",
    description: "Converting item rows into structured bill data.",
  },
  {
    id: "matching_inventory",
    label: "Matching inventory",
    description: "Comparing extracted items with inventory records.",
  },
  {
    id: "creating_missing_items",
    label: "Creating missing items",
    description: "Adding unmatched items with zero opening stock.",
  },
  {
    id: "finalizing_results",
    label: "Finalizing results",
    description: "Validating extracted data before form preparation.",
  },
  {
    id: "opening_bill",
    label: "Opening bill",
    description: "Preparing bill form for final review.",
  },
];

const isSupportedBillScanFile = (file) =>
  file?.type?.startsWith("image/") || file?.type === "application/pdf";

const isPdfBillScanFile = (file) => file?.type === "application/pdf";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const waitForMinimumStepTime = async (startedAt) => {
  const elapsed = Date.now() - startedAt;
  if (elapsed < BILL_SCAN_MIN_STEP_MS) {
    await wait(BILL_SCAN_MIN_STEP_MS - elapsed);
  }
};

const waitForNextPaint = () =>
  new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

const streamBillScan = ({ files, onUploadProgress, onEvent }) =>
  new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    const formData = new FormData();
    files.forEach((file) => formData.append("images", file));

    let parsedLength = 0;
    let responseBuffer = "";
    let result = null;
    let streamError = null;

    const parseResponse = (flush = false) => {
      const responseChunk = request.responseText.slice(parsedLength);
      parsedLength = request.responseText.length;
      responseBuffer += responseChunk;

      const lines = responseBuffer.split("\n");
      responseBuffer = flush ? "" : lines.pop() || "";

      lines
        .concat(flush && responseBuffer ? [responseBuffer] : [])
        .filter(Boolean)
        .forEach((line) => {
          const event = JSON.parse(line);
          if (event.type === "progress") onEvent(event);
          if (event.type === "result") result = event.data;
          if (event.type === "error") {
            streamError = new Error(event.message || "Bill scan failed");
          }
        });
    };

    request.open(
      "POST",
      `${api.defaults.baseURL.replace(/\/$/, "")}/bills/scan/stream`,
    );
    request.timeout = BILL_SCAN_TIMEOUT_MS;

    const token = localStorage.getItem("token");
    const financialYearId = localStorage.getItem("financial_year_id");
    if (token) request.setRequestHeader("Authorization", `Bearer ${token}`);
    if (financialYearId) {
      request.setRequestHeader("X-Financial-Year-Id", financialYearId);
    }

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onUploadProgress(event.loaded / event.total);
      }
    };
    request.onprogress = () => parseResponse();
    request.onload = () => {
      try {
        parseResponse(true);
        if (streamError) {
          reject(streamError);
          return;
        }
        if (request.status < 200 || request.status >= 300 || !result) {
          reject(new Error("Bill scan returned no result"));
          return;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    };
    request.onerror = () => reject(new Error("Bill scan request failed"));
    request.ontimeout = () => reject(new Error("Bill scan request timed out"));
    request.send(formData);
  });

const getToday = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yy = String(today.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const convertDateToISO = (ddmmyy) => {
  if (!ddmmyy) return "";
  const parts = ddmmyy.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yy] = parts;
  const fullYear = yy.length === 2 ? `20${yy}` : yy;
  return `${fullYear}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const convertDateFromISO = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const extractSixDigitPin = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const match = text.match(/\b\d{6}\b/);
    if (match) return match[0];
  }
  return "";
};

const extractPanFromValues = (...values) => {
  for (const value of values) {
    const text = String(value || "")
      .trim()
      .toUpperCase();
    if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text)) return text;
  }
  return "";
};

const STATE_CODE_MAP = {
  "jammu and kashmir": "01",
  "jammu & kashmir": "01",
  "himachal pradesh": "02",
  punjab: "03",
  chandigarh: "04",
  uttarakhand: "05",
  haryana: "06",
  delhi: "07",
  "new delhi": "07",
  rajasthan: "08",
  "uttar pradesh": "09",
  bihar: "10",
  sikkim: "11",
  "arunachal pradesh": "12",
  nagaland: "13",
  manipur: "14",
  mizoram: "15",
  tripura: "16",
  meghalaya: "17",
  assam: "18",
  "west bengal": "19",
  jharkhand: "20",
  odisha: "21",
  orissa: "21",
  chhattisgarh: "22",
  "madhya pradesh": "23",
  madhyapradesh: "23",
  gujarat: "24",
  "daman and diu": "25",
  "dadra and nagar haveli and daman and diu": "26",
  maharashtra: "27",
  karnataka: "29",
  goa: "30",
  lakshadweep: "31",
  kerala: "32",
  "tamil nadu": "33",
  tamilnadu: "33",
  puducherry: "34",
  pondicherry: "34",
  "andaman and nicobar islands": "35",
  telangana: "36",
  "andhra pradesh": "37",
  ladakh: "38",
};

const normalizeStateCode = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const digits = text.match(/\d{1,2}/);
    if (digits) return digits[0].padStart(2, "0");
    const normalized = text
      .toLowerCase()
      .replace(/[.,]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (STATE_CODE_MAP[normalized]) return STATE_CODE_MAP[normalized];
  }
  return "";
};

const buildPrintableContact = (contact = {}) => {
  const gstin = contact?.gstin || "";
  const pin = extractSixDigitPin(
    contact?.pincode,
    contact?.pin,
    contact?.postal_code,
    contact?.zip,
    contact?.area_id?.pincode,
    contact?.area?.pincode,
    contact?.address,
  );
  return {
    ...contact,
    phone:
      contact?.phone ||
      contact?.mobile ||
      contact?.mobile_number ||
      contact?.whatsapp ||
      contact?.whatsapp_number ||
      "",
    city: contact?.city || contact?.area_id?.city || contact?.area?.city || "",
    state:
      contact?.state || contact?.area_id?.state || contact?.area?.state || "",
    pin,
    pincode: pin,
    gstin,
    pan: extractPanFromValues(
      contact?.pan,
      contact?.pan_number,
      contact?.reg_number,
      gstin ? gstin.slice(2, 12) : "",
    ),
    state_code: normalizeStateCode(
      contact?.state_code,
      contact?.stateCode,
      contact?.gst_state_code,
      contact?.state,
      contact?.area_id?.state,
      contact?.area?.state,
      gstin ? gstin.slice(0, 2) : "",
    ),
  };
};

const normalizeSelectedFirmKey = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "_");

const loadImageDataUrl = async (src, firmType) => {
  const imageSrc = String(src || "").trim();
  if (!imageSrc) return "";
  try {
    const params = {};
    if (firmType) params.firmType = firmType;
    const response = await api.get("/auth/signature", {
      params,
      responseType: "blob",
    });
    const blob = response.data;
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch {
    // Fall back to direct image loading.
  }

  return new Promise((resolve) => {
    if (imageSrc.startsWith("data:image")) return resolve(imageSrc);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        canvas.getContext("2d").drawImage(image, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      } catch {
        resolve("");
      }
    };
    image.onerror = () => resolve("");
    image.src = imageSrc;
  });
};

const resolveLdBalanceAmount = async ({
  apiClient,
  contactId,
  currentAmount,
  contactBalance,
}) => {
  const amount = Number(currentAmount) || 0;
  const availableBalance = Math.max(0, Number(contactBalance) || 0);
  try {
    if (!contactId) return Math.max(0, Math.round(amount - availableBalance));
    const response = await apiClient.get(`/outstanding/${contactId}/summary`);
    const summary = getResponseData(response) || {};
    const totalDue = Math.max(0, Number(summary.total_due) || amount);
    return Math.max(0, Math.round(totalDue - availableBalance));
  } catch (error) {
    console.error("Failed to resolve LD balance:", error);
    return Math.max(0, Math.round(amount - availableBalance));
  }
};

const resolveFirmPrintData = (selectedFirm, user) => {
  const selectedKey = normalizeSelectedFirmKey(
    selectedFirm?.id ||
      selectedFirm?.type ||
      selectedFirm?.firm_type ||
      user?.current_firm_type ||
      user?.firm_data?.firm_type,
  );
  const profileFirm =
    selectedKey === "NON_GST" || selectedKey === "NONGST" ? user?.nongst_firm
    : selectedKey === "GST" ? user?.gst_firm
    : user?.gst_firm || user?.nongst_firm || null;
  const firmData = user?.firm_data || {};

  const pickFirstFilled = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) return trimmed;
        continue;
      }
      return value;
    }
    return "";
  };

  const bankRef =
    profileFirm?.bank_ids?.[0] ||
    profileFirm?.banks?.[0] ||
    selectedFirm?.bank_ids?.[0] ||
    selectedFirm?.banks?.[0] ||
    firmData?.bank_ids?.[0] ||
    {};

  return {
    name: pickFirstFilled(
      profileFirm?.name,
      firmData?.name,
      selectedFirm?.name,
    ),
    address: pickFirstFilled(
      profileFirm?.address,
      firmData?.address,
      selectedFirm?.address,
      profileFirm?.godown_address,
      firmData?.godown_address,
      selectedFirm?.godown_address,
    ),
    phone: pickFirstFilled(
      profileFirm?.phone,
      firmData?.phone,
      selectedFirm?.phone,
      profileFirm?.mobile,
      firmData?.mobile,
      selectedFirm?.mobile,
      profileFirm?.mobile_number,
      firmData?.mobile_number,
      selectedFirm?.mobile_number,
    ),
    email: pickFirstFilled(
      profileFirm?.email,
      firmData?.email,
      selectedFirm?.email,
    ),
    gstin: pickFirstFilled(
      profileFirm?.GSTIN,
      profileFirm?.gstin,
      firmData?.GSTIN,
      firmData?.gstin,
      selectedFirm?.GSTIN,
      selectedFirm?.gstin,
      profileFirm?.gst,
      firmData?.gst,
      selectedFirm?.gst,
    ),
    signature: pickFirstFilled(
      profileFirm?.signature,
      profileFirm?.signature_url,
      profileFirm?.signatureUrl,
      firmData?.signature,
      firmData?.signature_url,
      firmData?.signatureUrl,
      selectedFirm?.signature,
      selectedFirm?.signature_url,
      selectedFirm?.signatureUrl,
      user?.signature,
    ),
    bank_name:
      bankRef?.bank_name ||
      bankRef?.name ||
      profileFirm?.bank_name ||
      firmData?.bank_name ||
      selectedFirm?.bank_name ||
      profileFirm?.bankName ||
      firmData?.bankName ||
      selectedFirm?.bankName ||
      "",
    account_number:
      bankRef?.account_number ||
      profileFirm?.account_number ||
      firmData?.account_number ||
      selectedFirm?.account_number ||
      profileFirm?.accountNumber ||
      firmData?.accountNumber ||
      selectedFirm?.accountNumber ||
      "",
    ifsc_code:
      bankRef?.ifsc_code ||
      profileFirm?.ifsc_code ||
      firmData?.ifsc_code ||
      selectedFirm?.ifsc_code ||
      profileFirm?.ifscCode ||
      firmData?.ifscCode ||
      selectedFirm?.ifscCode ||
      "",
    bank_branch:
      bankRef?.bank_branch ||
      profileFirm?.bank_branch ||
      firmData?.bank_branch ||
      selectedFirm?.bank_branch ||
      profileFirm?.bankBranch ||
      firmData?.bankBranch ||
      selectedFirm?.bankBranch ||
      "",
    firm_type:
      selectedKey === "NON_GST" || selectedKey === "NONGST" ? "NON_GST" : "GST",
  };
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const BillList = () => {
  const navigate = useNavigate();
  const { showToast, selectedFirm, user, selectedFinancialYearId } = useStore();
  const firmBranding = useFirmBranding();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [transports, setTransports] = useState([]);
  const [isLoadingTransports, setIsLoadingTransports] = useState(false);
  const [editDialog, setEditDialog] = useState({
    isOpen: false,
    bill: null,
  });
  const [editForm, setEditForm] = useState({
    date: "",
    transportId: "",
    transportCharge: "",
    customerName: "",
    vehicleNumber: "",
  });
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  const sortBills = (items) =>
    [...items].sort((a, b) => {
      const dateA = new Date(a.createdAt || a.date);
      const dateB = new Date(b.createdAt || b.date);
      return dateB - dateA;
    });

  const toInputDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const yy = String(date.getFullYear()).slice(-2);
    return `${dd}/${mm}/${yy}`;
  };

  const fetchBills = async () => {
    setLoading(true);
    try {
      let allBills = [];
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 50) {
        const response = await api.get("/bills", {
          params: { page, limit: 100 },
          skipCache: true,
        });
        const data = response?.data?.data;

        let pageData = [];
        if (Array.isArray(data)) {
          pageData = data;
          hasMore = false;
        } else {
          pageData = data?.data || [];
          if (data?.meta?.hasNextPage) {
            page++;
          } else {
            hasMore = false;
          }
        }
        allBills = [...allBills, ...pageData];
      }

      setBills(sortBills(allBills.map(normalizeBill)));
    } catch (error) {
      console.error("Failed to fetch bills", error);
      showToast(
        error?.response?.data?.message || "Failed to load bills",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setFilters((prev) => ({
      ...prev,
      dateFrom: getFinancialYearStartDate(),
      dateTo: getTodayDate(),
    }));
    fetchBills();
  }, [selectedFinancialYearId]);

  const loadTransports = async () => {
    if (isLoadingTransports) return;
    setIsLoadingTransports(true);
    try {
      const response = await api.get("/transports", {
        params: { page: 1, limit: 200 },
      });
      setTransports(getResponseList(response));
    } catch (error) {
      console.error("Failed to fetch transports", error);
      showToast(
        error?.response?.data?.message || "Failed to load transports",
        "error",
      );
    } finally {
      setIsLoadingTransports(false);
    }
  };

  const openEditDialog = (bill) => {
    if (!bill?.id) return;
    const rawBill = bill?.raw || {};
    const transportRef =
      rawBill?.transport_id || rawBill?.transportId || rawBill?.transport || "";
    const transportId =
      typeof transportRef === "object" ? transportRef?._id || "" : transportRef;
    const transportChargeRaw =
      rawBill?.transport_charge ??
      rawBill?.transportCharge ??
      rawBill?.transportcharge;
    setEditForm({
      date: toInputDate(rawBill?.date || bill?.date),
      transportId: transportId || "",
      transportCharge:
        transportChargeRaw === 0 || transportChargeRaw ?
          String(transportChargeRaw)
        : "",
      customerName: rawBill?.customer_name || rawBill?.customerName || "",
      vehicleNumber:
        rawBill?.vehicle_number ||
        rawBill?.vehicle_no ||
        rawBill?.vehicleNumber ||
        "",
    });
    setEditDialog({ isOpen: true, bill });
    if (transports.length === 0) {
      loadTransports();
    }
  };

  const closeEditDialog = () => {
    setEditDialog({ isOpen: false, bill: null });
    setEditForm({
      date: "",
      transportId: "",
      transportCharge: "",
      customerName: "",
      vehicleNumber: "",
    });
  };

  const isPurchaseBill = (bill) => {
    const rawBill = bill?.raw || {};
    const contactType =
      rawBill?.contact_type ||
      rawBill?.contactType ||
      rawBill?.contact_id?.type ||
      rawBill?.party_id?.type ||
      "";
    if (String(contactType).toLowerCase() === "supplier") return true;

    return (rawBill?.challan_ids || []).some(
      (challan) =>
        String(challan?.challan_type || "").toLowerCase() === "purchase",
    );
  };

  const openPurchaseBillAsSale = async (bill) => {
    if (!bill?.id) return;

    try {
      const response = await api.get(`/bills/${bill.id}`);
      const billData = getResponseData(response) || bill.raw || bill;
      navigate("/transactions/bills/create", {
        state: {
          cloneBill: billData,
          cloneMode: "purchase-to-sale",
        },
      });
    } catch (error) {
      console.error("Failed to clone purchase bill", error);
      showToast(
        error?.response?.data?.message || "Failed to load purchase bill",
        "error",
      );
    }
  };

  const saveEdit = async () => {
    if (!editDialog?.bill?.id || isSavingEdit) return;
    if (!editForm.date) {
      showToast("Bill date is required", "error");
      return;
    }
    setIsSavingEdit(true);
    try {
      const chargeValue = Number(editForm.transportCharge);
      const payload = {
        date: convertDateToISO(editForm.date),
        transport_id: editForm.transportId || null,
        transport_charge: Number.isFinite(chargeValue) ? chargeValue : 0,
        customer_name: editForm.customerName,
        vehicle_number: editForm.vehicleNumber,
      };
      const response = await api.put(`/bills/${editDialog.bill.id}`, payload);
      const updatedBill = getResponseData(response);
      if (updatedBill) {
        const normalized = normalizeBill(updatedBill);
        setBills((prev) => {
          const index = prev.findIndex((item) => item.id === normalized.id);
          const next = [...prev];
          if (index >= 0) {
            next[index] = normalized;
          } else {
            next.unshift(normalized);
          }
          return sortBills(next);
        });
      }
      showToast("Bill updated successfully", "success");
      closeEditDialog();
    } catch (error) {
      console.error("Failed to update bill", error);
      showToast(
        error?.response?.data?.message || "Failed to update bill",
        "error",
      );
    } finally {
      setIsSavingEdit(false);
    }
  };

  const [filters, setFilters] = useState({
    dateFrom: getFinancialYearStartDate(),
    dateTo: getTodayDate(),
    party: "",
    contactType: "all",
  });

  const [selectedBill] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  useKeyboardShortcuts({
    onAdd: () => navigate("/transactions/bills/create"),
    onRefresh: () => window.location.reload(),
    onResetFilters: () =>
      setFilters({
        dateFrom: getFinancialYearStartDate(),
        dateTo: getTodayDate(),
        party: "",
        contactType: "all",
      }),
  });
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadFiles, setUploadFiles] = useState([]);
  const [uploadPreviews, setUploadPreviews] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [billScanProgress, setBillScanProgress] = useState({
    isActive: false,
    currentStageId: BILL_SCAN_PROGRESS_STEPS[0].id,
    completedStageIds: [],
    uploadRatio: 0,
  });
  const uploadInputRef = React.useRef(null);
  const uploadPreviewsRef = React.useRef([]);
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    bill: null,
  });

  useEffect(() => {
    uploadPreviewsRef.current = uploadPreviews;
  }, [uploadPreviews]);

  useEffect(() => {
    return () => {
      uploadPreviewsRef.current.forEach((previewUrl) =>
        URL.revokeObjectURL(previewUrl),
      );
    };
  }, []);

  const resetBillUpload = () => {
    uploadPreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    setUploadFiles([]);
    setUploadPreviews([]);
    setBillScanProgress({
      isActive: false,
      currentStageId: BILL_SCAN_PROGRESS_STEPS[0].id,
      completedStageIds: [],
      uploadRatio: 0,
    });
    if (uploadInputRef.current) uploadInputRef.current.value = "";
  };

  const handleBillImageFiles = (fileList, { append = false } = {}) => {
    const selectedFiles = Array.from(fileList || []);
    if (selectedFiles.length === 0) return;

    const billScanFiles = selectedFiles.filter(isSupportedBillScanFile);
    if (billScanFiles.length !== selectedFiles.length) {
      showToast("Only image and PDF files are allowed", "error");
      return;
    }
    const nextFiles =
      append ? [...uploadFiles, ...billScanFiles] : billScanFiles;
    if (nextFiles.length > 8) {
      showToast("Maximum 8 bill files allowed", "error");
      return;
    }

    if (!append) {
      uploadPreviews.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
    }
    setUploadFiles(nextFiles);
    setUploadPreviews((prev) => {
      const newPreviews = billScanFiles.map((file) =>
        URL.createObjectURL(file),
      );
      return append ? [...prev, ...newPreviews] : newPreviews;
    });
  };

  const removeBillImage = (indexToRemove) => {
    const previewToRemove = uploadPreviews[indexToRemove];
    if (previewToRemove) URL.revokeObjectURL(previewToRemove);
    setUploadFiles((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
    setUploadPreviews((prev) =>
      prev.filter((_, index) => index !== indexToRemove),
    );
  };

  const processUploadedBillImages = async () => {
    if (uploadFiles.length === 0 || isUploading) return;

    try {
      setIsUploading(true);
      const completedStageIds = new Set();
      let visibleStageId = BILL_SCAN_PROGRESS_STEPS[0].id;
      let visibleStageStartedAt = Date.now();
      let progressEventQueue = Promise.resolve();

      const publishProgress = (updates = {}) => {
        setBillScanProgress((current) => ({
          ...current,
          isActive: true,
          currentStageId: visibleStageId,
          completedStageIds: [...completedStageIds],
          ...updates,
        }));
      };

      const displayProgressEvent = async ({ stage, status }) => {
        if (!BILL_SCAN_PROGRESS_STEPS.some((step) => step.id === stage)) return;

        if (visibleStageId !== stage) {
          visibleStageId = stage;
          visibleStageStartedAt = Date.now();
          publishProgress();
          await waitForNextPaint();
        }

        if (status === "completed") {
          await waitForMinimumStepTime(visibleStageStartedAt);
          completedStageIds.add(stage);
          publishProgress(
            stage === "uploading_images" ? { uploadRatio: 1 } : {},
          );
        }
      };

      const enqueueProgressEvent = (event) => {
        progressEventQueue = progressEventQueue.then(() =>
          displayProgressEvent(event),
        );
      };

      publishProgress({ uploadRatio: 0 });
      await waitForNextPaint();

      const scanResult = await streamBillScan({
        files: uploadFiles,
        onUploadProgress: (uploadRatio) => {
          setBillScanProgress((current) => ({
            ...current,
            uploadRatio,
          }));
        },
        onEvent: enqueueProgressEvent,
      });
      await progressEventQueue;
      logBillScanDiagnostics(scanResult);

      await displayProgressEvent({
        stage: "opening_bill",
        status: "started",
      });
      await displayProgressEvent({
        stage: "opening_bill",
        status: "completed",
      });

      setIsUploadModalOpen(false);
      resetBillUpload();
      navigate("/transactions/bills/create", {
        state: {
          aiExtracted: scanResult,
          scanRequestId: `${Date.now()}`,
        },
      });
    } catch (error) {
      const scanErrorMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to scan bill images";
      showToast(scanErrorMessage, "error");
      setBillScanProgress({
        isActive: false,
        currentStageId: BILL_SCAN_PROGRESS_STEPS[0].id,
        completedStageIds: [],
        uploadRatio: 0,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const generateBillPDF = async (bill, action = "download") => {
    if (!bill?.id) {
      showToast("Invalid bill selected", "error");
      return;
    }

    let billData = bill?.raw || {};
    try {
      const response = await api.get(`/bills/${bill.id}`);
      billData = getResponseData(response) || billData;
    } catch (error) {
      console.error("Failed to fetch bill details for PDF:", error);
      showToast("Failed to load bill details for PDF", "error");
      return;
    }

    const challans =
      Array.isArray(billData?.challan_ids) ?
        billData.challan_ids.filter(Boolean)
      : [];
    if (challans.length === 0) {
      showToast("No challan found in this bill", "error");
      return;
    }

    const toMandatoryText = (value, fallback = "--") => {
      if (value === 0) return "0";
      if (value === null || value === undefined) return fallback;
      const text = String(value).trim();
      return text ? text : fallback;
    };

    const toNumberValue = (value, fallback = 0) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const formatDateDDMMYYYY = (value) => {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return "--";
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = date.getFullYear();
      return `${dd}-${mm}-${yyyy}`;
    };

    const formatAmount = (value) => Math.round(toNumberValue(value, 0));

    const extractStateCode = (gstinValue) => {
      const gstin = String(gstinValue || "").trim();
      const code = gstin.slice(0, 2);
      return /^\d{2}$/.test(code) ? code : "--";
    };

    const extractPan = (gstinValue) => {
      const gstin = String(gstinValue || "").trim();
      return gstin.length >= 12 ? gstin.slice(2, 12) : "--";
    };

    const extractPincode = (value) => {
      const raw = String(value || "").trim();
      if (!raw) return "--";
      const match = raw.match(/\b\d{6}\b/);
      return match ? match[0] : "--";
    };

    const resolvePan = (...values) => {
      for (const value of values) {
        const text = String(value || "")
          .trim()
          .toUpperCase();
        if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text)) return text;
      }
      return "--";
    };

    const resolvePartyPincode = (party = {}) => {
      const candidates = [
        party?.pincode,
        party?.pin,
        party?.zip,
        party?.postal_code,
        party?.area_id?.pincode,
        party?.area?.pincode,
        party?.area,
        party?.address,
      ];
      for (const candidate of candidates) {
        const parsed = extractPincode(candidate);
        if (parsed !== "--") return parsed;
      }
      return "--";
    };

    const profileFirm = resolveFirmPrintData(selectedFirm, user);
    const resolvedFirm = {
      ...profileFirm,
      ...firmBranding,
      signature: firmBranding.signature || profileFirm.signature,
    };
    const signatureImage = await loadImageDataUrl(
      resolvedFirm.signature,
      resolvedFirm.firm_type,
    );
    const firmName = toMandatoryText(resolvedFirm.name || "Firm");
    const firmAddress = toMandatoryText(resolvedFirm.address);
    const firmPhone = toMandatoryText(resolvedFirm.phone);
    const firmEmail = toMandatoryText(resolvedFirm.email);
    const firmGstin = toMandatoryText(resolvedFirm.gstin);
    const firmPan = extractPan(firmGstin);
    const bankName = toMandatoryText(
      resolvedFirm.bank_name || "PRIME CO OP BANK LTD",
    );
    const bankAccountNo = toMandatoryText(
      resolvedFirm.account_number || "10032001002995",
    );
    const invoiceDateObj =
      billData?.date ? new Date(billData.date) : new Date();
    const invoiceDate = formatDateDDMMYYYY(invoiceDateObj);
    const financialYearStart =
      invoiceDateObj.getMonth() >= 3 ?
        invoiceDateObj.getFullYear()
      : invoiceDateObj.getFullYear() - 1;
    const financialYear = `${String(financialYearStart).slice(-2)}-${String(
      financialYearStart + 1,
    ).slice(-2)}`;

    let contact = buildPrintableContact(billData?.contact_id || {});
    const contactId = getEntityId(contact) || bill?.partyId || "";
    if (contactId) {
      try {
        const contactRes = await api.get(`/contacts/${contactId}`);
        const fullContact = getResponseData(contactRes);
        if (fullContact) {
          contact = buildPrintableContact(fullContact);
        }
      } catch (error) {
        console.error("Failed to fetch contact details for PDF:", error);
      }
    }
    const transport = billData?.transport_id || {};

    let lastPaymentDate = "N/A";
    let lastPaymentAmount = 0;
    try {
      if (contactId) {
        const paymentRes = await api.get(`/transactions/last-payment`, {
          params: {
            contact_id: contactId,
            is_gst:
              Number(billData?.is_gst ?? bill?.gstType ?? 1) === 1 ? 1 : 0,
          },
        });
        const paymentData = getResponseData(paymentRes);
        if (paymentData?.last_payment_date) {
          lastPaymentDate = formatDateDDMMYYYY(paymentData.last_payment_date);
        }
        if (
          paymentData?.last_payment_amount !== undefined &&
          paymentData?.last_payment_amount !== null
        ) {
          lastPaymentAmount = toNumberValue(paymentData.last_payment_amount, 0);
        }
      }
    } catch (error) {
      console.error("Failed to fetch last payment:", error);
    }

    const receiverName = toMandatoryText(
      contact?.name || bill?.party || "CASH BOOK",
    );
    const receiverAddress = toMandatoryText(contact?.address);
    const receiverCity = toMandatoryText(contact?.city);
    const receiverState = toMandatoryText(contact?.state);
    const receiverGstin = toMandatoryText(contact?.gstin);
    const receiverStateCode = toMandatoryText(
      contact?.state_code,
      normalizeStateCode(
        contact?.state,
        contact?.area_id?.state,
        contact?.area?.state,
      ),
      extractStateCode(contact?.gstin),
    );
    const receiverPhone = toMandatoryText(contact?.phone);
    const receiverPin = resolvePartyPincode(contact);
    const receiverPan = resolvePan(
      contact?.pan,
      contact?.pan_number,
      contact?.pan,
      contact?.reg_number,
      extractPan(contact?.gstin),
    );

    const consigneeName = toMandatoryText(
      billData?.customer_name || contact?.name,
    );
    const consigneeAddress = toMandatoryText(
      billData?.shipping_address || contact?.address,
    );
    const consigneeCity = toMandatoryText(
      billData?.shipping_city || contact?.city,
    );
    const consigneeState = toMandatoryText(
      billData?.shipping_state || contact?.state,
    );
    const consigneeGstin = toMandatoryText(
      billData?.shipping_gstin || contact?.gstin,
    );
    const consigneeStateCode = toMandatoryText(
      normalizeStateCode(
        billData?.shipping_state_code,
        billData?.shippingStateCode,
        billData?.shipping_state,
        billData?.shipping_gstin ?
          String(billData.shipping_gstin).slice(0, 2)
        : "",
        contact?.state_code,
        contact?.state,
      ),
      extractStateCode(billData?.shipping_gstin || contact?.gstin),
    );
    const consigneePin = (() => {
      const candidates = [
        billData?.shipping_pincode,
        billData?.shipping_pin,
        billData?.shipping_zip,
        billData?.shipping_postal_code,
        billData?.shipping_address,
        resolvePartyPincode(contact),
      ];
      for (const candidate of candidates) {
        const parsed = extractPincode(candidate);
        if (parsed !== "--") return parsed;
      }
      return "--";
    })();
    const consigneePan = resolvePan(
      billData?.shipping_pan,
      billData?.shipping_pan_no,
      billData?.shipping_reg_no,
      extractPan(billData?.shipping_gstin || contact?.gstin),
      receiverPan,
    );

    const billNo = toMandatoryText(
      billData?.bill_no || billData?.billNo || bill?.billNo,
    );
    const challanNos = challans
      .map((challan) => challan?.challan_no || challan?.challanNo || "")
      .filter(Boolean)
      .join(", ");

    const printOption =
      Number(
        challans.find((challan) => Number(challan?.print_option ?? 0) > 0)
          ?.print_option ??
          billData?.print_option ??
          2,
      ) || 2;

    const parsedItems = await Promise.all(
      challans.flatMap((challan) => {
        const challanItems = Array.isArray(challan?.items) ? challan.items : [];
        return challanItems.map(async (item) => {
          const itemRef = item?.item_id || {};
          const itemId = getEntityId(itemRef) || getEntityId(item?.item_id);

          // Fetch full item details if hsn_id is not populated
          let fullItemRef = itemRef;
          if (itemId && !itemRef?.hsn_id?.hsn_code && !itemRef?.hsn_code) {
            try {
              const itemRes = await api.get(`/items/${itemId}`);
              fullItemRef = getResponseData(itemRes) || itemRef;
            } catch {
              /* use existing itemRef */
            }
          }

          const itemName =
            fullItemRef?.item_name ||
            fullItemRef?.name ||
            itemRef?.item_name ||
            itemRef?.name ||
            item?.item_name ||
            item?.remark ||
            "";
          const hsn =
            fullItemRef?.hsn_id?.hsn_code ||
            fullItemRef?.hsn_id?.code ||
            fullItemRef?.hsn_code ||
            fullItemRef?.hsn ||
            itemRef?.hsn_id?.hsn_code ||
            itemRef?.hsn_code ||
            itemRef?.hsn ||
            item?.hsn_code ||
            item?.hsn ||
            "";
          const remark = item?.remark || item?.remarks || "";
          const itemCode =
            fullItemRef?.item_id ||
            fullItemRef?.itemId ||
            itemRef?.item_id ||
            itemRef?.itemId ||
            item?.item_code ||
            item?.source_item_code ||
            fullItemRef?.barcode ||
            itemRef?.barcode ||
            "";
          const description =
            printOption === 2 ?
              toMandatoryText(remark || itemName, "Item")
            : toMandatoryText(itemCode, "Item");

          const quantity = toNumberValue(item?.quantity, 0);
          const rate = toNumberValue(item?.rate, 0);
          const discount = toNumberValue(item?.discount, 0);
          const specialDiscount = toNumberValue(item?.special_discount, 0);
          const itemDiscount = toNumberValue(item?.item_discount, 0);
          const itemDis2 = toNumberValue(item?.item_dis2, 0);
          const dis3 = toNumberValue(item?.dis3, 0);
          const taxable = toNumberValue(item?.taxable_amount, 0);
          const taxPercent = toNumberValue(item?.gst_percent, 0);
          const taxAmount = toNumberValue(item?.gst_amount, 0);
          const calculatedAmount = taxable + taxAmount;
          const amount = toNumberValue(item?.amount, calculatedAmount);
          const netRate = quantity !== 0 ? amount / quantity : 0;

          return {
            description,
            hsn,
            quantity,
            rate,
            discount,
            specialDiscount,
            itemDiscount,
            itemDis2,
            dis3,
            taxable,
            taxPercent,
            taxAmount,
            amount,
            netRate,
          };
        });
      }),
    );

    const hideDiscountColumns =
      localStorage.getItem("hide_discount_columns") !== "false";

    const itemRows = parsedItems.map((item, index) => {
      const totalDiscount = toNumberValue(
        item.total_discount,
        item.quantity * item.rate - item.taxable,
      );
      return hideDiscountColumns ?
          [
            String(index + 1),
            item.description,
            item.hsn,
            String(item.quantity),
            formatAmount(item.rate),
            formatAmount(totalDiscount),
            formatAmount(item.netRate),
            formatAmount(item.taxable),
            formatAmount(item.taxPercent),
            formatAmount(item.taxAmount),
            formatAmount(item.amount),
          ]
        : [
            String(index + 1),
            item.description,
            item.hsn,
            String(item.quantity),
            formatAmount(item.rate),
            formatAmount(item.discount),
            formatAmount(item.specialDiscount),
            formatAmount(item.itemDiscount),
            formatAmount(item.itemDis2),
            formatAmount(item.dis3),
            formatAmount(item.netRate),
            formatAmount(item.taxable),
            formatAmount(item.taxPercent),
            formatAmount(item.taxAmount),
            formatAmount(item.amount),
          ];
    });

    const taxableTotal = parsedItems.reduce(
      (sum, item) => sum + item.taxable,
      0,
    );
    const taxTotal = parsedItems.reduce((sum, item) => sum + item.taxAmount, 0);
    const totalFromItems = parsedItems.reduce(
      (sum, item) => sum + item.amount,
      0,
    );
    const totalQty = parsedItems.reduce((sum, item) => sum + item.quantity, 0);
    const transportCharge = toNumberValue(billData?.transport_charge, 0);
    const isGstBill = Number(billData?.is_gst ?? bill?.gstType ?? 1) === 1;
    const storedBillAmount = toNumberValue(billData?.amount, totalFromItems);
    const netTotal = Math.round(
      isGstBill ? storedBillAmount : storedBillAmount + transportCharge,
    );
    const totalAmount = isGstBill ? netTotal : netTotal - transportCharge;
    const sgstAmount = isGstBill ? taxTotal / 2 : 0;
    const cgstAmount = isGstBill ? taxTotal / 2 : 0;
    const igstAmount = isGstBill ? 0 : taxTotal;
    const totalBeforeTax = taxableTotal;

    const amountInWords = (() => {
      const ones = [
        "",
        "ONE",
        "TWO",
        "THREE",
        "FOUR",
        "FIVE",
        "SIX",
        "SEVEN",
        "EIGHT",
        "NINE",
        "TEN",
        "ELEVEN",
        "TWELVE",
        "THIRTEEN",
        "FOURTEEN",
        "FIFTEEN",
        "SIXTEEN",
        "SEVENTEEN",
        "EIGHTEEN",
        "NINETEEN",
      ];
      const tens = [
        "",
        "",
        "TWENTY",
        "THIRTY",
        "FORTY",
        "FIFTY",
        "SIXTY",
        "SEVENTY",
        "EIGHTY",
        "NINETY",
      ];
      const convertTwoDigits = (num) => {
        if (num < 20) return ones[num];
        const ten = Math.floor(num / 10);
        const unit = num % 10;
        return `${tens[ten]}${unit ? ` ${ones[unit]}` : ""}`.trim();
      };
      const convertThreeDigits = (num) => {
        const hundred = Math.floor(num / 100);
        const rest = num % 100;
        if (!hundred) return convertTwoDigits(rest);
        return `${ones[hundred]} HUNDRED${rest ? ` ${convertTwoDigits(rest)}` : ""}`;
      };
      const toWordsIndian = (num) => {
        if (num === 0) return "ZERO";
        const crore = Math.floor(num / 10000000);
        const lakh = Math.floor((num % 10000000) / 100000);
        const thousand = Math.floor((num % 100000) / 1000);
        const hundred = num % 1000;
        const parts = [];
        if (crore) parts.push(`${convertTwoDigits(crore)} CRORE`);
        if (lakh) parts.push(`${convertTwoDigits(lakh)} LAKH`);
        if (thousand) parts.push(`${convertTwoDigits(thousand)} THOUSAND`);
        if (hundred) parts.push(convertThreeDigits(hundred));
        return parts.join(" ").trim();
      };

      const rupees = Math.floor(toNumberValue(netTotal, 0));
      const paise = Math.round((toNumberValue(netTotal, 0) - rupees) * 100);
      const rupeesText = toWordsIndian(rupees);
      if (paise > 0) {
        return `${rupeesText} RUPEES AND ${toWordsIndian(paise)} PAISE ONLY`;
      }
      return `${rupeesText} ONLY`;
    })();
    const rawPartyBalance = toNumberValue(
      contact?.balance ??
        contact?.ledger_balance ??
        contact?.closing_balance ??
        contact?.outstanding_balance ??
        contact?.due_amount ??
        billData?.closing_balance ??
        billData?.outstanding_balance,
      0,
    );
    const ledgerBalance = await resolveLdBalanceAmount({
      apiClient: api,
      contactId,
      currentAmount: netTotal,
      contactBalance: rawPartyBalance,
    });

    const safeBillNo = String(billNo || bill?.billNo || bill?.id).replace(
      /[^\w-]+/g,
      "_",
    );
    const outputFileName = `${firmName.replace(/[^\w-]+/g, "_")}_Invoice_${safeBillNo}.pdf`;

    if (!isGstBill) {
      const compactDoc = new jsPDF({
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });
      const compactPageWidth = compactDoc.internal.pageSize.getWidth();
      const compactPageHeight = compactDoc.internal.pageSize.getHeight();
      const compactMargin = 6;
      const compactContentWidth = 133;
      const compactX = compactPageWidth - compactMargin - compactContentWidth;
      const compactBlue = [0, 0, 190];
      const compactBorder = [35, 35, 35];
      const compactHeaderFill = [247, 247, 247];

      const compactRows = parsedItems.map((item) => {
        return [
          item.description || "--",
          String(item.quantity || 0),
          formatAmount(item.rate),
          formatAmount(item.discount),
          formatAmount(item.specialDiscount),
          formatAmount(item.netRate),
          formatAmount(item.amount),
        ];
      });

      compactDoc.setDrawColor(...compactBorder);
      compactDoc.setLineWidth(0.3);
      compactDoc.rect(
        compactX,
        compactMargin,
        compactContentWidth,
        compactPageHeight - compactMargin * 2,
      );

      let compactY = compactMargin + 4;

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(14.5);
      compactDoc.setTextColor(...compactBlue);
      compactDoc.text(
        String(firmName || "Firm").toUpperCase(),
        compactX + compactContentWidth / 2,
        compactY,
        { align: "center" },
      );

      compactDoc.setFont("times", "normal");
      compactDoc.setFontSize(8.0);
      compactDoc.text(
        "DELIVERY CHALLAN",
        compactX + compactContentWidth / 2,
        compactY + 4.2,
        { align: "center" },
      );
      compactDoc.setTextColor(0, 0, 0);
      const compactFirmAddress = compactDoc.splitTextToSize(
        firmAddress === "--" ? "" : firmAddress,
        compactContentWidth - 12,
      );
      if (compactFirmAddress.length > 0) {
        compactDoc.text(
          compactFirmAddress.slice(0, 1),
          compactX + compactContentWidth / 2,
          compactY + 7.6,
          {
            align: "center",
          },
        );
      }
      compactDoc.setFontSize(7.5);
      compactDoc.text(
        `Ph., ${toMandatoryText(firmPhone, "--")}`,
        compactX + compactContentWidth / 2,
        compactY + 11.0,
        { align: "center" },
      );
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(10.0);
      compactDoc.text(
        `GSTIN : ${firmGstin === "--" ? "APPLY FOR REGISTRATION" : firmGstin}`,
        compactX + compactContentWidth / 2,
        compactY + 15.5,
        { align: "center" },
      );

      compactY += 17.5;

      compactDoc.setFillColor(...compactHeaderFill);
      compactDoc.rect(compactX, compactY, compactContentWidth, 6.5, "FD");
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(11);
      compactDoc.setTextColor(...compactBlue);
      compactDoc.text(
        "* INVOICE *",
        compactX + compactContentWidth / 2,
        compactY + 4.5,
        {
          align: "center",
        },
      );

      compactY += 6.5;

      const detailsSplitX = compactX + compactContentWidth * 0.655;
      compactDoc.setDrawColor(...compactBorder);
      compactDoc.rect(compactX, compactY, compactContentWidth, 25);
      compactDoc.line(detailsSplitX, compactY, detailsSplitX, compactY + 25);

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.setTextColor(...compactBlue);
      compactDoc.text(`M/s. : ${receiverName}`, compactX + 2, compactY + 5);
      compactDoc.setFont("times", "normal");
      compactDoc.setFontSize(8.5);
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.text(
        compactDoc
          .splitTextToSize(
            receiverAddress === "--" ? receiverCity : receiverAddress,
            compactContentWidth * 0.52,
          )
          .slice(0, 2),
        compactX + 9,
        compactY + 9.5,
      );
      compactDoc.text(
        `City --${receiverCity === "--" ? "" : receiverCity}--  Contact No.${receiverPhone === "--" ? "" : receiverPhone}`,
        compactX + 9,
        compactY + 18,
      );

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.text(
        `Invoice No.: ${billNo}`,
        detailsSplitX + 2,
        compactY + 6,
      );
      compactDoc.text(
        `Date          : ${invoiceDate}`,
        detailsSplitX + 2,
        compactY + 12,
      );
      compactDoc.text(
        `Vehicle No : ${toMandatoryText(
          billData?.vehicle_number ||
            billData?.vehicle_no ||
            billData?.vehicleNumber,
          "",
        )}`,
        detailsSplitX + 2,
        compactY + 18,
      );

      compactY += 25;

      const summaryBoxHeight = 12;
      const footerReserve = 52;
      const startTableY = compactY;
      const tableBottomY =
        compactPageHeight - compactMargin - footerReserve - summaryBoxHeight;
      const headerHeight = 6.5;
      const tableHeight = tableBottomY - startTableY;
      const bodyHeight = tableHeight - headerHeight;
      const columnDefs = [
        { label: "Item Name", width: 44, align: "left" },
        { label: "Qty", width: 10, align: "right" },
        { label: "Rate", width: 13, align: "right" },
        { label: "D1", width: 10, align: "right" },
        { label: "D2", width: 10, align: "right" },
        { label: "Net Rate", width: 16, align: "right" },
        { label: "Amount", width: 30, align: "right" },
      ];
      const minRows = Math.max(compactRows.length, 12);
      const rowHeight = bodyHeight / minRows;
      const visibleRows =
        compactRows.length > 0 ?
          compactRows.slice(0, minRows)
        : [["--", "0", "0", "0", "0", "0", "0"]];

      compactDoc.setDrawColor(...compactBorder);
      compactDoc.setLineWidth(0.2);
      compactDoc.rect(compactX, startTableY, compactContentWidth, tableHeight);
      compactDoc.setFillColor(...compactHeaderFill);
      compactDoc.rect(
        compactX,
        startTableY,
        compactContentWidth,
        headerHeight,
        "FD",
      );
      compactDoc.line(
        compactX,
        startTableY + headerHeight,
        compactX + compactContentWidth,
        startTableY + headerHeight,
      );

      const columnStarts = [];
      let currentX = compactX;
      columnDefs.forEach((column, index) => {
        columnStarts.push(currentX);
        currentX += column.width;
        if (index < columnDefs.length - 1) {
          compactDoc.line(currentX, startTableY, currentX, tableBottomY);
        }
      });

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
      compactDoc.setTextColor(...compactBlue);
      columnDefs.forEach((column, index) => {
        const startX = columnStarts[index];
        if (column.align === "left") {
          compactDoc.text(column.label, startX + 1.2, startTableY + 4.7);
        } else {
          compactDoc.text(
            column.label,
            startX + column.width - 1.2,
            startTableY + 4.7,
            { align: "right" },
          );
        }
      });

      compactDoc.setFont("times", "normal");
      compactDoc.setFontSize(9.5);
      compactDoc.setTextColor(0, 0, 0);
      visibleRows.forEach((row, rowIndex) => {
        const rowY = startTableY + headerHeight + rowIndex * rowHeight + (rowHeight * 0.72);
        row.forEach((cell, cellIndex) => {
          const value = String(cell ?? "");
          const startX = columnStarts[cellIndex];
          const width = columnDefs[cellIndex].width;
          const align = columnDefs[cellIndex].align;
          if (align === "left") {
            const clipped = compactDoc
              .splitTextToSize(value, width - 2)
              .slice(0, 1);
            compactDoc.text(clipped, startX + 1.2, rowY);
          } else {
            compactDoc.text(value, startX + width - 1.2, rowY, {
              align: "right",
            });
          }
        });
      });

      const compactSummaryY = tableBottomY;
      compactDoc.rect(
        compactX,
        compactSummaryY,
        compactContentWidth,
        summaryBoxHeight,
      );
      let summaryLineX = compactX;
      columnDefs.forEach((column, index) => {
        summaryLineX += column.width;
        if (index < columnDefs.length - 1) {
          compactDoc.line(
            summaryLineX,
            compactSummaryY,
            summaryLineX,
            compactSummaryY + summaryBoxHeight,
          );
        }
      });
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.text("Total :", columnStarts[1] - 1.2, compactSummaryY + 5.5, { align: "right" });
      compactDoc.setFont("times", "bold");
      compactDoc.text(
        String(Math.round(totalQty)),
        columnStarts[2] - 1.2,
        compactSummaryY + 5.5,
        {
          align: "right",
        },
      );
      compactDoc.text(
        String(formatAmount(netTotal)),
        compactX + compactContentWidth - 1.2,
        compactSummaryY + 5.5,
        {
          align: "right",
        },
      );

      const compactFooterY = compactSummaryY + summaryBoxHeight;
      const compactFooterHeight =
        compactPageHeight - compactMargin - compactFooterY;
      compactDoc.rect(
        compactX,
        compactFooterY,
        compactContentWidth,
        compactFooterHeight,
      );
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(8.5);
      compactDoc.text("Remarks :", compactX + 1.5, compactFooterY + 4.5);
      compactDoc.setFont("times", "bold");
      compactDoc.setTextColor(...compactBlue);
      compactDoc.setFontSize(9.0);
      compactDoc.text(
        `LD BAL. : ${formatAmount(ledgerBalance)}`,
        compactX + 1.5,
        compactFooterY + 10,
      );
      compactDoc.text(
        `Last Pay Date : ${lastPaymentDate === "--" ? "N/A" : lastPaymentDate}`,
        compactX + 1.5,
        compactFooterY + 15,
      );
      compactDoc.text(
        `Last Pay Amt. : ${lastPaymentDate === "N/A" || lastPaymentDate === "--" ? "N/A" : formatAmount(lastPaymentAmount)}`,
        compactX + 1.5,
        compactFooterY + 20,
      );

      compactDoc.setTextColor(0, 0, 0);
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
      compactDoc.text(
        compactDoc
          .splitTextToSize(
            `In Words : Rs. ${amountInWords}`,
            compactContentWidth - 55,
          )
          .slice(0, 1),
        compactX + 1.5,
        compactFooterY + 28,
      );
      compactDoc.setTextColor(...compactBlue);
      compactDoc.setFontSize(10.0);
      compactDoc.text(
        "Net Amount",
        compactX + compactContentWidth - 31,
        compactFooterY + 28,
      );
      compactDoc.setFontSize(11.0);
      compactDoc.text(
        String(formatAmount(netTotal)),
        compactX + compactContentWidth - 1.2,
        compactFooterY + 28,
        { align: "right" },
      );
      compactDoc.setDrawColor(...compactBorder);
      compactDoc.setLineWidth(0.2);
      compactDoc.line(
        compactX,
        compactFooterY + 31,
        compactX + compactContentWidth,
        compactFooterY + 31,
      );
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(8.5);
      compactDoc.text(
        "SUBJECT TO SURAT JURISDICTION",
        compactX + 1.5,
        compactFooterY + 34.2,
      );

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(10.0);
      compactDoc.setTextColor(...compactBlue);
      compactDoc.text(
        "Receiver's Signature",
        compactX + 1.5,
        compactPageHeight - compactMargin - 3.2,
      );
      compactDoc.text(
        `FOR ${String(firmName || "").toUpperCase()}`,
        compactX + compactContentWidth - 2,
        compactFooterY + 34.2,
        {
          align: "right",
        },
      );
      if (signatureImage) {
        try {
          let imgWidth = 28;
          let imgHeight = 9;
          try {
            const props = compactDoc.getImageProperties(signatureImage);
            const aspect = props.width / props.height;
            const maxW = 28;
            const maxH = 9;
            if (aspect > maxW / maxH) {
              imgWidth = maxW;
              imgHeight = maxW / aspect;
            } else {
              imgHeight = maxH;
              imgWidth = maxH * aspect;
            }
          } catch (e) {
            console.error(
              "Failed to parse compact signature image properties:",
              e,
            );
          }
          compactDoc.addImage(
            signatureImage,
            "PNG",
            compactX + compactContentWidth - 2 - imgWidth,
            compactPageHeight - compactMargin - 5.8 - imgHeight,
            imgWidth,
            imgHeight,
          );
        } catch {
          // Ignore unsupported signature images.
        }
      }
      compactDoc.text(
        "Authorised Signatory",
        compactX + compactContentWidth - 2,
        compactPageHeight - compactMargin - 3.2,
        {
          align: "right",
        },
      );

      // Add footer branding as clickable links
      const link1 = "thekbclick.com";
      const sep = " / ";
      const link2 = "thekbcart.com";
      const fontSize = 6.5;
      compactDoc.setFont("helvetica", "normal");
      compactDoc.setFontSize(fontSize);

      const w1 = compactDoc.getTextWidth(link1);
      const wSep = compactDoc.getTextWidth(sep);
      const w2 = compactDoc.getTextWidth(link2);
      const totalW = w1 + wSep + w2;

      const xOffset = compactX + (compactContentWidth - totalW) / 2;
      const yPos = compactPageHeight - compactMargin + 3.5;

      // Draw first link
      compactDoc.setTextColor(0, 102, 204);
      compactDoc.textWithLink(link1, xOffset, yPos, { url: "https://thekbclick.com" });

      // Draw separator
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.text(sep, xOffset + w1, yPos);

      // Draw second link
      compactDoc.setTextColor(0, 102, 204);
      compactDoc.textWithLink(link2, xOffset + w1 + wSep, yPos, { url: "https://thekbcart.com" });

      // Add underlines for links
      compactDoc.setDrawColor(0, 102, 204);
      compactDoc.setLineWidth(0.1);
      compactDoc.line(xOffset, yPos + 0.3, xOffset + w1, yPos + 0.3);
      compactDoc.line(xOffset + w1 + wSep, yPos + 0.3, xOffset + w1 + wSep + w2, yPos + 0.3);

      if (action === "download") {
        compactDoc.save(outputFileName);
      } else {
        compactDoc.autoPrint();
        const previewUrl = compactDoc.output("bloburl");
        const previewWindow = window.open(previewUrl, "_blank");
        if (!previewWindow) {
          showToast(
            "Popup blocked. Please allow popups for print preview.",
            "error",
          );
        }
      }
      return;
    }

    const invoiceTitleInput = window.prompt("Enter bill title", "TAX INVOICE");
    const invoiceTitle = toMandatoryText(
      invoiceTitleInput,
      "TAX INVOICE",
    ).toUpperCase();

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 6;
    const contentWidth = pageWidth - margin * 2;
    const blue = [0, 0, 190];
    const headerFill = [203, 239, 243];
    const fitTextSingleLine = (text, maxWidth) => {
      const source = String(text || "");
      if (!source) return "";
      if (doc.getTextWidth(source) <= maxWidth) return source;
      let trimmed = source;
      while (
        trimmed.length > 0 &&
        doc.getTextWidth(`${trimmed}...`) > maxWidth
      ) {
        trimmed = trimmed.slice(0, -1);
      }
      return trimmed ? `${trimmed}...` : "";
    };
    const drawPageBorder = () => {
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.25);
      doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

      // Add footer branding as clickable links
      const link1 = "thekbclick.com";
      const sep = " / ";
      const link2 = "thekbcart.com";
      const fontSize = 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(fontSize);

      const w1 = doc.getTextWidth(link1);
      const wSep = doc.getTextWidth(sep);
      const w2 = doc.getTextWidth(link2);
      const totalW = w1 + wSep + w2;

      const xOffset = margin + (contentWidth - totalW) / 2;
      const yPos = pageHeight - margin + 3.5;

      // Draw first link
      doc.setTextColor(0, 102, 204);
      doc.textWithLink(link1, xOffset, yPos, { url: "https://thekbclick.com" });

      // Draw separator
      doc.setTextColor(0, 0, 0);
      doc.text(sep, xOffset + w1, yPos);

      // Draw second link
      doc.setTextColor(0, 102, 204);
      doc.textWithLink(link2, xOffset + w1 + wSep, yPos, { url: "https://thekbcart.com" });

      // Add underlines for links
      doc.setDrawColor(0, 102, 204);
      doc.setLineWidth(0.1);
      doc.line(xOffset, yPos + 0.3, xOffset + w1, yPos + 0.3);
      doc.line(xOffset + w1 + wSep, yPos + 0.3, xOffset + w1 + wSep + w2, yPos + 0.3);
    };

    drawPageBorder();

    let cursorY = margin + 2;

    doc.setFont("times", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...blue);
    doc.text(firmName.toUpperCase(), margin + contentWidth / 2, cursorY + 4, {
      align: "center",
    });

    doc.setFont("times", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      doc.splitTextToSize(firmAddress, contentWidth - 16),
      margin + contentWidth / 2,
      cursorY + 9,
      {
        align: "center",
      },
    );

    doc.text(`Ph.${firmPhone}`, margin + contentWidth / 2, cursorY + 18, {
      align: "center",
    });
    doc.text(`Email : ${firmEmail}`, margin + contentWidth / 2, cursorY + 23, {
      align: "center",
    });

    doc.setFont("times", "bold");
    doc.setFontSize(10.5);
    doc.text(`GSTIN : ${firmGstin}`, margin + contentWidth / 2, cursorY + 28, {
      align: "center",
    });

    doc.setFont("times", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...blue);
    doc.text(
      "Original For Recipient [ ]",
      margin + contentWidth - 2,
      cursorY + 12,
      { align: "right" },
    );
    doc.text(
      "Duplicate For Transporter [ ]",
      margin + contentWidth - 2,
      cursorY + 18,
      { align: "right" },
    );
    doc.text(
      "Triplicate For Supplier [ ]",
      margin + contentWidth - 2,
      cursorY + 24,
      { align: "right" },
    );

    cursorY += 31;

    doc.setFillColor(...headerFill);
    doc.rect(margin, cursorY, contentWidth, 7.5, "FD");
    doc.setFont("times", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...blue);
    doc.text(invoiceTitle, margin + contentWidth / 2, cursorY + 5.2, {
      align: "center",
    });
    cursorY += 7.5;

    const detailSectionHeight = 32;
    const splitX = margin + contentWidth * 0.53;
    doc.setTextColor(0, 0, 0);
    doc.rect(margin, cursorY, contentWidth, detailSectionHeight);
    doc.line(splitX, cursorY, splitX, cursorY + detailSectionHeight);

    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    const leftX = margin + 1.8;
    const rightX = splitX + 1.8;
    const baseLineY = cursorY + 6;
    const rowGap = 6;

    doc.text(`Invoice No : ${billNo} (${financialYear})`, leftX, baseLineY);
    doc.text(`Invoice Date : ${invoiceDate}`, leftX, baseLineY + rowGap);
    doc.text(
      "Tax is Payable On Reverse Charge (Y/N) : --",
      leftX,
      baseLineY + rowGap * 2,
    );
    doc.text(`State : ${receiverState}`, leftX, baseLineY + rowGap * 3);
    doc.text(
      `State Code : ${receiverStateCode}`,
      leftX + 55,
      baseLineY + rowGap * 3,
    );

    doc.text(
      `Transport : ${toMandatoryText(transport?.name || contact?.transport)}`,
      rightX,
      baseLineY,
    );
    doc.text(
      `Vehicle No. : ${toMandatoryText(
        billData?.vehicle_number ||
          billData?.vehicle_no ||
          billData?.vehicleNumber,
      )}`,
      rightX,
      baseLineY + rowGap,
    );
    doc.text(
      `Date & Time Of Supply : ${invoiceDate}`,
      rightX,
      baseLineY + rowGap * 2,
    );
    doc.text(
      `Place Of Supply : ${receiverCity}`,
      rightX,
      baseLineY + rowGap * 3,
    );

    cursorY += detailSectionHeight;

    doc.setFillColor(...headerFill);
    doc.rect(margin, cursorY, contentWidth, 7.5, "FD");
    doc.line(splitX, cursorY, splitX, cursorY + 7.5);
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...blue);
    doc.text(
      "Details Of Receivers (Billed To)  Recipient",
      margin + 1.8,
      cursorY + 5.2,
    );
    doc.text("Details Of Consignee (Shipped To)", splitX + 1.8, cursorY + 5.2);
    cursorY += 7.5;

    const partyBoxHeight = 52;
    doc.setTextColor(0, 0, 0);
    doc.rect(margin, cursorY, contentWidth, partyBoxHeight);
    doc.line(splitX, cursorY, splitX, cursorY + partyBoxHeight);

    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    const leftPartyX = margin + 1.8;
    const rightPartyX = splitX + 1.8;

    doc.text(`Name : ${receiverName}`, leftPartyX, cursorY + 6.5);
    doc.setFont("times", "normal");
    doc.text(
      doc.splitTextToSize(receiverAddress, contentWidth * 0.48),
      leftPartyX,
      cursorY + 12.5,
    );
    doc.text(`City : ${receiverCity}`, leftPartyX, cursorY + 24.5);
    if (isGstBill) {
      doc.text(`Pin : ${receiverPin}`, leftPartyX + 32, cursorY + 24.5);
      doc.text(`Phone : ${receiverPhone}`, leftPartyX, cursorY + 29.2);
      doc.text(`GSTIN : ${receiverGstin}`, leftPartyX, cursorY + 34);
      doc.text(`PAN No. : ${receiverPan}`, leftPartyX + 62, cursorY + 34);
      doc.setFont("times", "bold");
      doc.text(`State : ${receiverState}`, leftPartyX, cursorY + 41);
      doc.text(
        `State Code : ${receiverStateCode}`,
        leftPartyX + 62,
        cursorY + 41,
      );
    } else {
      doc.text(`Phone : ${receiverPhone}`, leftPartyX, cursorY + 29.2);
    }

    doc.setFont("times", "bold");
    doc.text(`Name : ${consigneeName}`, rightPartyX, cursorY + 6.5);
    doc.setFont("times", "normal");
    doc.text(
      doc.splitTextToSize(consigneeAddress, contentWidth * 0.48),
      rightPartyX,
      cursorY + 12.5,
    );
    doc.text(`City : ${consigneeCity}`, rightPartyX, cursorY + 24.5);
    if (isGstBill) {
      doc.text(`Pin : ${consigneePin}`, rightPartyX + 32, cursorY + 24.5);
      doc.text(`GSTIN : ${consigneeGstin}`, rightPartyX, cursorY + 34);
      doc.text(`PAN No. : ${consigneePan}`, rightPartyX + 56, cursorY + 34);
      doc.setFont("times", "bold");
      doc.text(`State : ${consigneeState}`, rightPartyX, cursorY + 41);
      doc.text(
        `State Code : ${consigneeStateCode}`,
        rightPartyX + 56,
        cursorY + 41,
      );
    }

    cursorY += partyBoxHeight;

    doc.rect(margin, cursorY, contentWidth, 8);
    doc.line(splitX, cursorY, splitX, cursorY + 8);
    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(
      `Order No : ${toMandatoryText(challanNos)}`,
      margin + 1.8,
      cursorY + 5.3,
    );
    doc.text(
      `Broker : ${toMandatoryText(
        billData?.broker_name ||
          billData?.agent_name ||
          billData?.agent_id?.name ||
          contact?.agent_id?.name,
      )}`,
      splitX + 1.8,
      cursorY + 5.3,
    );
    cursorY += 8;

    const cellPad = 1.5;
    const fs = hideDiscountColumns ? 8 : 7;
    const headFs = hideDiscountColumns ? 8.2 : 7.2;
    const headPad = 3;

    // COL_W sum = 198mm
    const COL_W =
      hideDiscountColumns ?
        [8, 66, 14, 10, 14, 14, 15, 15, 11, 15, 16]
      : [7, 42, 14, 10, 14, 9, 9, 10, 10, 10, 14, 10, 14, 9, 16];

    const headers =
      hideDiscountColumns ?
        [
          "Sr.",
          printOption === 2 ? "Item Description" : "Item Code",
          "HSN",
          "Qty.",
          "Rate",
          "Disc.",
          "Net Rate",
          "Taxable",
          "Tax%",
          "TaxAmt",
          "Amount",
        ]
      : [
          "Sr.",
          printOption === 2 ? "Item Description" : "Item Code",
          "HSN",
          "Qty.",
          "Rate",
          "D1%",
          "D2%",
          "I1",
          "I2",
          "D3RS",
          "Net Rate",
          "Taxable",
          "Tax%",
          "TaxAmt",
          "Amount",
        ];

    const fallbackRow =
      hideDiscountColumns ?
        ["1", "--", "--", "0", "0", "0", "0", "0", "0", "0", "0"]
      : [
          "1",
          "--",
          "--",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
          "0",
        ];

    const colStyles = {};
    COL_W.forEach((w, idx) => {
      colStyles[idx] = {
        cellWidth: w,
        halign:
          idx === 0 ? "center"
          : idx === 1 || idx === 2 ? "left"
          : "right",
      };
    });

    autoTable(doc, {
      head: [headers],
      body: itemRows.length ? itemRows : [fallbackRow],
      startY: cursorY,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      theme: "grid",
      styles: {
        font: "times",
        fontSize: fs,
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        minCellHeight: 6,
        cellPadding: { top: cellPad, right: 1.2, bottom: cellPad, left: 1.2 },
      },
      headStyles: {
        fillColor: headerFill,
        textColor: blue,
        fontStyle: "bold",
        fontSize: headFs,
        halign: "center",
        valign: "middle",
        cellPadding: { top: headPad, right: 1.2, bottom: headPad, left: 1.2 },
      },
      showHead: "everyPage",
      columnStyles: colStyles,
      didDrawPage: () => drawPageBorder(),
    });

    const tableColumnWidths = COL_W;
    const columnRightEdges = [];
    let runningX = margin;
    tableColumnWidths.forEach((width) => {
      runningX += width;
      columnRightEdges.push(runningX);
    });

    let summaryY = (doc.lastAutoTable?.finalY || cursorY) + 6;
    const totalRowHeight = 13;
    const midBlockHeight = 32;
    const wordsRowHeight = 8;
    const termsBlockHeight = 33;
    const summaryHeight =
      totalRowHeight + midBlockHeight + wordsRowHeight + termsBlockHeight;

    if (summaryY + summaryHeight > pageHeight - margin - 1) {
      doc.addPage();
      drawPageBorder();
      summaryY = margin + 8;
    }

    const summaryRightX = margin + contentWidth;

    doc.setFillColor(...headerFill);
    doc.rect(margin, summaryY, contentWidth, totalRowHeight, "FD");
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...blue);
    const totalLabelCenter = margin + (COL_W[0] + COL_W[1] + COL_W[2]) / 2;
    doc.text("TOTAL :", totalLabelCenter, summaryY + 5.3, { align: "center" });
    doc.text(
      String(Math.round(totalQty)),
      columnRightEdges[3] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(totalBeforeTax)),
      columnRightEdges[hideDiscountColumns ? 7 : 11] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(taxTotal)),
      columnRightEdges[hideDiscountColumns ? 9 : 13] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(netTotal)),
      columnRightEdges[hideDiscountColumns ? 10 : 14] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );

    const midBlockY = summaryY + totalRowHeight;
    const rightInfoWidth = 58;
    const splitInfoX = summaryRightX - rightInfoWidth;
    doc.setTextColor(0, 0, 0);
    doc.rect(margin, midBlockY, contentWidth, midBlockHeight);
    doc.line(splitInfoX, midBlockY, splitInfoX, midBlockY + midBlockHeight);
    const bankAreaRightX = margin + 58;
    doc.line(
      bankAreaRightX,
      midBlockY,
      bankAreaRightX,
      midBlockY + midBlockHeight,
    );

    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    const bankY1 = midBlockY + Math.min(8, midBlockHeight * 0.28);
    const bankY2 = midBlockY + Math.min(16, midBlockHeight * 0.55);
    const bankY3 = midBlockY + Math.min(24, midBlockHeight * 0.82);
    doc.text(bankName, margin + 1.8, bankY1);
    doc.text(bankAccountNo, margin + 1.8, bankY2);
    doc.text(`PAN No. : ${firmPan}`, margin + 1.8, bankY3);

    const taxGridLeftX = bankAreaRightX + 2;
    const taxColumnWidths = [12, 18, 11, 11, 11];
    const taxColumnStarts = [];
    const taxColumnEnds = [];
    let taxCursorX = taxGridLeftX;
    taxColumnWidths.forEach((width) => {
      taxColumnStarts.push(taxCursorX);
      taxColumnEnds.push(taxCursorX + width);
      taxCursorX += width;
    });

    // Tax grid rows spaced evenly within midBlockHeight
    const taxRow1Y = midBlockY + Math.min(8, midBlockHeight * 0.28);
    const taxRow2Y = midBlockY + Math.min(16, midBlockHeight * 0.55);
    const taxRow3Y = midBlockY + Math.min(24, midBlockHeight * 0.82);

    doc.setFont("times", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...blue);
    const taxHeaders = ["Tax%", "Taxable%", "SGST", "CGST", "Tax Amt."];
    taxHeaders.forEach((header, idx) => {
      const centerX = taxColumnStarts[idx] + taxColumnWidths[idx] / 2;
      doc.text(header, centerX, taxRow1Y, { align: "center" });
    });
    doc.text(isGstBill ? "18.00" : "0.00", taxColumnEnds[0] - 0.8, taxRow2Y, {
      align: "right",
    });
    doc.text(
      String(formatAmount(totalBeforeTax)),
      taxColumnEnds[1] - 0.8,
      taxRow2Y,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(sgstAmount)),
      taxColumnEnds[2] - 0.8,
      taxRow2Y,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(cgstAmount)),
      taxColumnEnds[3] - 0.8,
      taxRow2Y,
      { align: "right" },
    );
    doc.text(String(formatAmount(taxTotal)), taxColumnEnds[4] - 0.8, taxRow2Y, {
      align: "right",
    });

    doc.setFont("times", "bold");
    doc.text("* TOTAL :", taxColumnStarts[0], taxRow3Y);
    doc.text(
      String(formatAmount(totalBeforeTax)),
      taxColumnEnds[1] - 0.8,
      taxRow3Y,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(sgstAmount)),
      taxColumnEnds[2] - 0.8,
      taxRow3Y,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(cgstAmount)),
      taxColumnEnds[3] - 0.8,
      taxRow3Y,
      { align: "right" },
    );
    doc.text(String(formatAmount(taxTotal)), taxColumnEnds[4] - 0.8, taxRow3Y, {
      align: "right",
    });

    const rightLabelX = splitInfoX + 2;
    const rightRateRightX = summaryRightX - 15;
    const rightAmountRightX = summaryRightX - 1.6;
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "bold");
    doc.setFontSize(8.2);
    doc.text("Total Amount before Tax :", rightLabelX, taxRow1Y);
    doc.text(
      String(formatAmount(totalBeforeTax)),
      rightAmountRightX,
      taxRow1Y,
      { align: "right" },
    );
    if (transportCharge > 0) {
      const tcY = midBlockY + Math.min(12.5, midBlockHeight * 0.42);
      doc.text("Transport Charge :", rightLabelX, tcY);
      doc.text(String(formatAmount(transportCharge)), rightAmountRightX, tcY, {
        align: "right",
      });
    }
    doc.text("+ SGST", rightLabelX, taxRow2Y);
    doc.text(isGstBill ? "9.000 %" : "0.000 %", rightRateRightX, taxRow2Y, {
      align: "right",
    });
    doc.text(String(formatAmount(sgstAmount)), rightAmountRightX, taxRow2Y, {
      align: "right",
    });
    doc.text(isGstBill ? "+ CGST" : "+ IGST", rightLabelX, taxRow3Y);
    doc.text(isGstBill ? "9.000 %" : "18.000 %", rightRateRightX, taxRow3Y, {
      align: "right",
    });
    doc.text(
      String(formatAmount(isGstBill ? cgstAmount : igstAmount)),
      rightAmountRightX,
      taxRow3Y,
      { align: "right" },
    );

    const wordsY = midBlockY + midBlockHeight;
    const netAmountSectionWidth = 44;
    const netAmountLeftX = summaryRightX - netAmountSectionWidth;
    doc.setFont("times", "bold");
    doc.setFontSize(9.2);
    const wordsMaxWidth = netAmountLeftX - margin - 3;
    const wordsLines = doc.splitTextToSize(
      `(in Words) : ${amountInWords}`,
      wordsMaxWidth,
    );
    const actualWordsRowHeight = Math.max(
      wordsRowHeight,
      wordsLines.length * 4.5 + 3,
    );
    doc.setFillColor(...headerFill);
    doc.rect(margin, wordsY, contentWidth, actualWordsRowHeight, "FD");
    doc.line(
      netAmountLeftX,
      wordsY,
      netAmountLeftX,
      wordsY + actualWordsRowHeight,
    );
    doc.setTextColor(0, 0, 0);
    doc.text(wordsLines, margin + 1.8, wordsY + 5.3);
    doc.text(
      "NET AMOUNT :",
      netAmountLeftX + 2,
      wordsY + actualWordsRowHeight / 2 + 1.5,
    );
    doc.setTextColor(...blue);
    doc.setFontSize(11);
    doc.text(
      String(formatAmount(netTotal)),
      summaryRightX - 1.8,
      wordsY + actualWordsRowHeight / 2 + 1.5,
      {
        align: "right",
      },
    );

    const termsY = wordsY + actualWordsRowHeight;
    const termsSplitX = margin + contentWidth * 0.56;

    // allow the bottom footer (terms + signatures) to expand to the very bottom of the page
    const availableFooter = pageHeight - margin - termsY;
    const footerHeight = Math.max(termsBlockHeight, availableFooter);

    doc.setTextColor(0, 0, 0);
    doc.rect(margin, termsY, contentWidth, footerHeight);
    doc.line(termsSplitX, termsY, termsSplitX, termsY + footerHeight);

    doc.setFont("times", "bold");
    doc.setFontSize(9.2);
    doc.setTextColor(...blue);
    doc.text("Term & Condition :-", margin + 1.8, termsY + 5.2);
    doc.setFont("times", "normal");
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(8.8);
    doc.text(
      "Payment will be accepted by A/c. pay cheque only.",
      margin + 1.8,
      termsY + 10.2,
    );
    doc.text(
      "We are not responsible for any lose or damage during transit.",
      margin + 1.8,
      termsY + 14.7,
    );
    const ldBalance = ledgerBalance;

    const drawRupee = (pdfDoc, x, y, size = 8.5) => {
      const scale = size / 8.5;
      const topY = y - 1.8 * scale;
      pdfDoc.setLineWidth(0.18 * scale);
      pdfDoc.setDrawColor(0, 0, 0);
      
      // Top bar
      pdfDoc.line(x, topY, x + 1.3 * scale, topY);
      // Mid bar
      pdfDoc.line(x + 0.1 * scale, topY + 0.5 * scale, x + 1.1 * scale, topY + 0.5 * scale);
      // Loop
      pdfDoc.line(x + 0.2 * scale, topY, x + 0.2 * scale, topY + 1.0 * scale);
      pdfDoc.line(x + 0.2 * scale, topY + 1.0 * scale, x + 0.9 * scale, topY + 1.0 * scale);
      pdfDoc.line(x + 0.9 * scale, topY, x + 0.9 * scale, topY + 1.0 * scale);
      // Diagonal leg
      pdfDoc.line(x + 0.4 * scale, topY + 1.0 * scale, x + 1.1 * scale, y);
    };

    const labelX = margin + 1.8;
    const valueX = margin + 34;

    doc.text("GST Rule Follow.", margin + 1.8, termsY + 17.5);
    doc.setFont("times", "bold");
    doc.setFontSize(8.5);

    const isBook = contact && (
      String(contact.type || "").toLowerCase() === "book" ||
      ["CASHBOOK", "BANKBOOK"].includes(String(contact.name || "").trim().toUpperCase())
    );

    let currentY = termsY + 21.7;
    if (!isBook) {
      // LD Balance
      doc.text("LD Balance", labelX, currentY);
      doc.text(":", valueX, currentY);
      drawRupee(doc, valueX + 1.8, currentY);
      doc.text(String(formatAmount(ldBalance)), valueX + 3.5, currentY);
      currentY += 4.0;
    }

    // Last Payment Date
    doc.text("Last Payment Date", labelX, currentY);
    doc.text(`: ${lastPaymentDate === "--" ? "N/A" : lastPaymentDate}`, valueX, currentY);
    currentY += 4.0;

    // Last Payment Amount
    doc.text("Last Payment Amount", labelX, currentY);
    doc.text(":", valueX, currentY);
    if (lastPaymentDate === "N/A" || lastPaymentDate === "--") {
      doc.text("N/A", valueX + 1.8, currentY);
    } else {
      drawRupee(doc, valueX + 1.8, currentY);
      doc.text(String(formatAmount(lastPaymentAmount)), valueX + 3.5, currentY);
    }

    doc.setFont("times", "bold");
    doc.setFontSize(8.8);
    doc.text("Electronic Reference Number", termsSplitX + 2, termsY + 5.2);
    const rightSectionWidth = summaryRightX - termsSplitX - 3.5;
    const certLine = fitTextSingleLine(
      "Certified That Particulars Given Above Are True And Correct",
      rightSectionWidth,
    );
    doc.text(certLine, termsSplitX + 2, termsY + 10.2);

    // --- Amount Breakdown box ---
    const rightColX = termsSplitX;
    const rightColWidth = summaryRightX - rightColX;
    const signatureHeight = 30;
    const signatureLineY = termsY + footerHeight - signatureHeight;
    const abRowH = 4;
    const abRows = 1 + (isGstBill ? 2 : 0) + (transportCharge > 0 ? 1 : 0);
    const abBoxTitleH = 8;
    const abBoxNetH = 11;
    const abBoxPadB = 1;
    const abBoxH = abBoxTitleH + abRows * abRowH + abBoxNetH + abBoxPadB;
    const amountBoxY = termsY + 16;
    const amountBoxW = rightColWidth;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(rightColX, amountBoxY, amountBoxW, abBoxH);

    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...blue);
    doc.text("Amount Breakdown", rightColX + amountBoxW / 2, amountBoxY + 5, {
      align: "center",
    });
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.2);
    doc.line(
      rightColX + 1,
      amountBoxY + 6.5,
      rightColX + amountBoxW - 1,
      amountBoxY + 6.5,
    );

    const abLabelX = rightColX + 2;
    const abValueX = rightColX + amountBoxW - 2;
    let abY = amountBoxY + abBoxTitleH + 2;

    const drawAbRow = (label, value, bold = false) => {
      doc.setFont("times", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 8 : 7.5);
      doc.setTextColor(...(bold ? blue : [0, 0, 0]));
      doc.text(label, abLabelX, abY);
      doc.text(value, abValueX, abY, { align: "right" });
      abY += abRowH;
    };

    drawAbRow("Taxable Amount", String(formatAmount(totalBeforeTax)));
    if (isGstBill) {
      drawAbRow("SGST (9%)", String(formatAmount(sgstAmount)));
      drawAbRow("CGST (9%)", String(formatAmount(cgstAmount)));
    }
    if (transportCharge > 0) {
      drawAbRow("Transport Charge", String(formatAmount(transportCharge)));
    }

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(abLabelX, abY + 0.5, abValueX, abY + 0.5);
    abY += 3;
    drawAbRow("Net Amount", String(formatAmount(netTotal)), true);

    // --- Signature area ---
    const rightSectionCenterX = termsSplitX + rightColWidth / 2;
    const leftSectionCenterX = margin + (termsSplitX - margin) / 2;
    const signatureY = termsY + footerHeight - 2.2;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(rightColX, signatureLineY, summaryRightX, signatureLineY);

    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...blue);
    doc.text(
      `For : ${firmName.toUpperCase()}`,
      rightSectionCenterX,
      signatureLineY + 8,
      { align: "center" },
    );
    if (signatureImage) {
      try {
        let imgWidth = 52;
        let imgHeight = 11;
        try {
          const props = doc.getImageProperties(signatureImage);
          const aspect = props.width / props.height;
          const maxW = 52;
          const maxH = 11;
          if (aspect > maxW / maxH) {
            imgWidth = maxW;
            imgHeight = maxW / aspect;
          } else {
            imgHeight = maxH;
            imgWidth = maxH * aspect;
          }
        } catch (e) {
          console.error("Failed to parse signature image properties:", e);
        }
        doc.addImage(
          signatureImage,
          "PNG",
          rightSectionCenterX - imgWidth / 2,
          signatureLineY + 10.5,
          imgWidth,
          imgHeight,
        );
      } catch {
        // Ignore unsupported signature images.
      }
    }
    doc.text("Receiver's Signature", leftSectionCenterX, signatureY, {
      align: "center",
    });
    doc.text("Authorised Signatory", rightSectionCenterX, signatureY, {
      align: "center",
    });

    if (action === "download") {
      doc.save(outputFileName);
    } else {
      doc.autoPrint();
      const previewUrl = doc.output("bloburl");
      const previewWindow = window.open(previewUrl, "_blank");
      if (!previewWindow) {
        showToast(
          "Popup blocked. Please allow popups for print preview.",
          "error",
        );
      }
    }
  };

  const columns = [
    {
      key: "billNo",
      label: "Bill No",
      render: (value, row) => (
        <span
          className={`text-xs sm:text-sm ${
            row?.skipStockCalculation ? "font-bold" : "font-medium"
          }`}
        >
          {value}
        </span>
      ),
    },
    {
      key: "date",
      label: "Date",
      render: (value) => (
        <span className="text-xs sm:text-sm">{formatDate(value)}</span>
      ),
    },
    {
      key: "party",
      label: "Party",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">{value}</span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (value) => (
        <span className="text-xs sm:text-sm">
          ₹{Math.round(Number(value) || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "settlementDiscount",
      label: "Settlement Discount",
      render: (value) => (
        <span className="text-xs sm:text-sm">
          ₹{Math.round(Number(value) || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "linkedChallans",
      label: "Linked Challans",
      render: (value) => (
        <div className="flex items-center gap-1">
          <FaLink className="text-gray-400 text-xs" />
          <span className="text-xs sm:text-sm">{value.length} challan(s)</span>
        </div>
      ),
    },
  ];

  const actions = [
    {
      label: (
        <span className="inline-flex items-center gap-1">
          <FaShoppingCart size={10} className="sm:size-3 md:size-4" />
          <span>Sell</span>
        </span>
      ),
      show: isPurchaseBill,
      onClick: openPurchaseBillAsSale,
      className:
        "bg-emerald-600 text-white hover:bg-emerald-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (bill) => navigate(`/transactions/bills/edit/${bill.id}`),
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (bill) => setDeleteDialog({ isOpen: true, bill }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaDownload size={10} className="sm:size-3 md:size-4" />,
      onClick: (bill) => generateBillPDF(bill, "download"),
      className:
        "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaPrint size={10} className="sm:size-3 md:size-4" />,
      onClick: (bill) => generateBillPDF(bill, "print"),
      className:
        "bg-cyan-600 text-white hover:bg-cyan-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  // Apply filters
  const filteredBills = bills.filter((bill) => {
    const defaultDateFrom = getFinancialYearStartDate();
    const defaultDateTo = getTodayDate();
    const billFinancialYearId = getEntityId(bill?.raw?.financial_year_id);
    const isDefaultFinancialYearRange =
      selectedFinancialYearId &&
      billFinancialYearId &&
      String(billFinancialYearId) === String(selectedFinancialYearId) &&
      filters.dateFrom === defaultDateFrom &&
      filters.dateTo === defaultDateTo;

    if (filters.contactType !== "all") {
      const rawContactType =
        bill?.raw?.contact_id?.type ||
        bill?.raw?.contact_type ||
        bill?.raw?.contactType ||
        "";
      if (rawContactType !== filters.contactType) return false;
    }
    if (!isDefaultFinancialYearRange) {
      if (filters.dateFrom && new Date(bill.date) < new Date(filters.dateFrom))
        return false;
      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (new Date(bill.date) > toDate) return false;
      }
    }
    return true;
  });

  const currentBillScanStep =
    BILL_SCAN_PROGRESS_STEPS.find(
      (step) => step.id === billScanProgress.currentStageId,
    ) || BILL_SCAN_PROGRESS_STEPS[0];
  const currentBillScanStepIndex = BILL_SCAN_PROGRESS_STEPS.findIndex(
    (step) => step.id === currentBillScanStep.id,
  );
  const completedBillScanSteps = new Set(
    billScanProgress.completedStageIds || [],
  );
  const uploadProgressUnits =
    (
      currentBillScanStep.id === "uploading_images" &&
      !completedBillScanSteps.has("uploading_images")
    ) ?
      billScanProgress.uploadRatio
    : 0;
  const billScanProgressPercent = Math.round(
    ((completedBillScanSteps.size + uploadProgressUnits) /
      BILL_SCAN_PROGRESS_STEPS.length) *
      100,
  );

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Bill List
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm">
            View and manage final bills
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setIsUploadModalOpen(true)}
            variant="outline"
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start"
          >
            <FaCamera className="text-sm sm:text-base" />
            Upload Bill
          </Button>
          <Button
            onClick={() => navigate("/transactions/bills/create")}
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start"
          >
            <FaPlus className="text-sm sm:text-base" />
            Create Bill
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-blue-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-blue-500">
          <h3 className="text-xs sm:text-sm font-medium text-blue-800">
            Total Bills
          </h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-blue-900">
            {bills.length}
          </p>
        </div>
        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-green-500">
          <h3 className="text-xs sm:text-sm font-medium text-green-800">
            Total Amount
          </h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">
            ₹
            {Math.round(
              bills.reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
            ).toLocaleString()}
          </p>
        </div>
        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-green-500">
          <h3 className="text-xs sm:text-sm font-medium text-green-800">
            Total Sale Amount
          </h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">
            ₹
            {Math.round(
              bills
                .filter(
                  (b) =>
                    String(b.raw?.contact_type || "").toLowerCase() === "party",
                )
                .reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
            ).toLocaleString()}
          </p>
        </div>

        <div className="bg-green-50 p-3 sm:p-4 rounded-lg border-l-2 sm:border-l-4 border-l-green-500">
          <h3 className="text-xs sm:text-sm font-medium text-green-800">
            Total Purchase Amount
          </h3>
          <p className="text-lg sm:text-xl md:text-2xl font-bold text-green-900">
            ₹
            {Math.round(
              bills
                .filter(
                  (b) =>
                    String(b.raw?.contact_type || "").toLowerCase() ===
                    "supplier",
                )
                .reduce((sum, b) => sum + (Number(b.amount) || 0), 0),
            ).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 sm:p-4 rounded-lg border">
        <div className="flex items-center gap-2 mb-3 sm:mb-4">
          <FaFilter className="text-gray-500 text-sm sm:text-base" />
          <h3 className="font-medium text-gray-900 text-sm sm:text-base">
            Filters
          </h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <select
            value={filters.contactType}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, contactType: e.target.value }))
            }
            className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
          >
            <option value="all">All Contact Types</option>
            <option value="party">Party</option>
            <option value="supplier">Supplier</option>
          </select>
          <input
            type="text"
            value={toDisplayDate(filters.dateFrom) || filters.dateFrom}
            onChange={(e) => {
              const value = normalizeDisplayDateInput(e.target.value);
              setFilters((prev) => ({
                ...prev,
                dateFrom: toISODate(value) || value,
              }));
            }}
            placeholder="dd/mm/yyyy"
            className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
            title="From Date"
          />
          <input
            type="text"
            value={toDisplayDate(filters.dateTo) || filters.dateTo}
            onChange={(e) => {
              const value = normalizeDisplayDateInput(e.target.value);
              setFilters((prev) => ({
                ...prev,
                dateTo: toISODate(value) || value,
              }));
            }}
            placeholder="dd/mm/yyyy"
            className="px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-xs sm:text-sm"
            title="To Date"
          />
          <Button
            variant="outline"
            onClick={() =>
              setFilters({
                dateFrom: getFinancialYearStartDate(),
                dateTo: getTodayDate(),
                party: "",
                contactType: "all",
              })
            }
            className="text-xs sm:text-sm py-1.5 sm:py-2"
          >
            Clear
          </Button>
        </div>
      </div>

      {/* Bills Table */}
      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={loading}
          columns={columns}
          data={filteredBills}
          actions={actions}
          searchable={true}
          sortable={true}
          pagination={true}
          className="text-xs sm:text-sm"
          minWidth="700px"
        />
      </div>

      {/* View Bill Modal */}
      <Modal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        title={`Bill Details - ${selectedBill?.billNo}`}
        size="lg"
      >
        {selectedBill && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Bill No
                </label>
                <p className="text-gray-900 font-medium">
                  {selectedBill.billNo}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Date
                </label>
                <p className="text-gray-900">{formatDate(selectedBill.date)}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Party
                </label>
                <p className="text-gray-900">{selectedBill.party}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Amount
                </label>
                <p className="text-gray-900 font-bold">
                  ₹
                  {Math.round(
                    Number(selectedBill.amount) || 0,
                  ).toLocaleString()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Settlement Discount
                </label>
                <p className="text-gray-900 font-bold">
                  ₹
                  {Math.round(
                    Number(selectedBill.settlementDiscount) || 0,
                  ).toLocaleString()}
                </p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Linked Challans
              </label>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex flex-wrap gap-2">
                  {selectedBill.linkedChallans.map((challan, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                    >
                      {challan}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button className="flex items-center gap-2">
                <FaFileInvoiceDollar />
                Print Bill
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsViewModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit Bill Modal */}
      <Modal
        isOpen={editDialog.isOpen}
        onClose={closeEditDialog}
        title={`Edit Bill${editDialog.bill?.billNo ? ` - ${editDialog.bill.billNo}` : ""}`}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="text"
                placeholder="dd/mm/yy"
                value={editForm.date}
                onChange={(e) => {
                  const value = e.target.value;
                  const filtered = value.replace(/[^0-9/]/g, "");
                  let formatted = filtered;
                  if (filtered.length >= 2 && !filtered.includes("/")) {
                    formatted = filtered.slice(0, 2) + "/" + filtered.slice(2);
                  }
                  if (
                    filtered.length >= 5 &&
                    filtered.split("/").length === 2
                  ) {
                    const parts = filtered.split("/");
                    formatted =
                      parts[0] +
                      "/" +
                      parts[1].slice(0, 2) +
                      "/" +
                      parts[1].slice(2);
                  }
                  if (formatted.length <= 8) {
                    setEditForm((prev) => ({ ...prev, date: formatted }));
                  }
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transport
              </label>
              <Select
                value={editForm.transportId}
                onChange={(value) => {
                  const selectedTransport = transports.find((transport) => {
                    const id = transport?._id || transport?.id;
                    return id === value;
                  });
                  const charge =
                    selectedTransport?.transport_charge ??
                    selectedTransport?.charge ??
                    selectedTransport?.transportCharge;
                  setEditForm((prev) => ({
                    ...prev,
                    transportId: value,
                    transportCharge:
                      charge === 0 || charge ?
                        String(charge)
                      : prev.transportCharge,
                  }));
                }}
                disabled={isLoadingTransports}
              >
                <option value="">No Transport</option>
                {transports.map((transport) => {
                  const id = transport?._id || transport?.id;
                  if (!id) return null;
                  const label =
                    transport?.name ||
                    transport?.transport_name ||
                    transport?.transportName ||
                    "Transport";
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transport Charge
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editForm.transportCharge}
                onChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    transportCharge: value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Customer Name
              </label>
              <Input
                value={editForm.customerName}
                onChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    customerName: value,
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Number
              </label>
              <Input
                value={editForm.vehicleNumber}
                onChange={(value) =>
                  setEditForm((prev) => ({
                    ...prev,
                    vehicleNumber: value,
                  }))
                }
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button onClick={saveEdit} disabled={isSavingEdit}>
              Save Changes
            </Button>
            <Button variant="outline" onClick={closeEditDialog}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Bill Modal */}
      {isUploadModalOpen &&
        createPortal(
          <div className="fixed left-0 top-0 z-[9999] flex h-screen w-screen items-center justify-center bg-black/50 p-4">
            <div className="relative w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-2xl">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">
                    Upload Bill
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Upload bill images or PDF documents for automatic data
                    extraction.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isUploading) return;
                    setIsUploadModalOpen(false);
                    resetBillUpload();
                  }}
                  disabled={isUploading}
                  className="text-gray-400 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50 text-xl leading-none"
                >
                  ×
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Drop zone */}
                <div
                  onClick={() => {
                    if (!isUploading) uploadInputRef.current?.click();
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (isUploading) return;
                    handleBillImageFiles(e.dataTransfer.files, {
                      append: uploadFiles.length > 0,
                    });
                  }}
                  className={`border-2 border-dashed border-gray-300 rounded-lg p-8 text-center transition-colors ${
                    isUploading ?
                      "cursor-not-allowed opacity-90"
                    : "cursor-pointer hover:border-blue-400 hover:bg-blue-50"
                  }`}
                >
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept={BILL_SCAN_ACCEPT}
                    multiple
                    disabled={isUploading}
                    className="hidden"
                    onChange={(e) => {
                      handleBillImageFiles(e.target.files, {
                        append: uploadFiles.length > 0,
                      });
                      e.target.value = "";
                    }}
                  />
                  {uploadFiles.length > 0 ?
                    <div className="space-y-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {uploadPreviews.map((previewUrl, index) => (
                          <div key={previewUrl} className="relative">
                            {isPdfBillScanFile(uploadFiles[index]) ?
                              <div className="flex h-24 w-full flex-col items-center justify-center rounded border bg-white px-2 text-center">
                                <FaFileInvoiceDollar className="mb-1 text-xl text-red-600" />
                                <span className="max-w-full truncate text-xs font-medium text-gray-700">
                                  {uploadFiles[index]?.name || "Bill PDF"}
                                </span>
                                <span className="text-[10px] uppercase text-gray-400">
                                  PDF
                                </span>
                              </div>
                            : <img
                                src={previewUrl}
                                alt={`Bill file ${index + 1}`}
                                className="h-24 w-full rounded border object-contain bg-white"
                              />
                            }
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                if (isUploading) return;
                                removeBillImage(index);
                              }}
                              disabled={isUploading}
                              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white shadow hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Remove bill file ${index + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {uploadFiles.length} bill file
                        {uploadFiles.length === 1 ? "" : "s"} selected
                      </p>
                      <p className="text-xs text-gray-400">
                        Drag more files here or use Add File below.
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isUploading) return;
                            uploadInputRef.current?.click();
                          }}
                          disabled={isUploading}
                        >
                          Add File
                        </Button>
                      </div>
                    </div>
                  : <div className="space-y-2">
                      <div className="text-4xl">📁</div>
                      <p className="text-sm font-medium text-gray-700">
                        Click Add File or drag & drop
                      </p>
                      <p className="text-xs text-gray-400">
                        Select one or more bill images or PDF documents.
                      </p>
                      <div className="pt-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (isUploading) return;
                            uploadInputRef.current?.click();
                          }}
                          disabled={isUploading}
                        >
                          Add File
                        </Button>
                      </div>
                    </div>
                  }
                </div>

                <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-3 py-3">
                  <FaFileInvoiceDollar className="mt-0.5 flex-shrink-0 text-blue-600" />
                  <p className="text-xs leading-5 text-blue-900">
                    <span className="font-semibold">
                      Automated bill extraction
                    </span>{" "}
                    reviews every selected file, structures item details, and
                    prepares the bill form for your verification.
                  </p>
                </div>
              </div>

              {billScanProgress.isActive ?
                <div className="border-t bg-gray-50 p-5">
                  <div className="rounded-xl border border-blue-100 bg-white px-5 py-5 shadow-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full bg-blue-50">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="32"
                          height="32"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#2563eb"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-semibold text-blue-700">
                          Step {currentBillScanStepIndex + 1} of{" "}
                          {BILL_SCAN_PROGRESS_STEPS.length}
                        </p>
                        <p className="mt-1 text-lg font-semibold text-gray-900">
                          {currentBillScanStep.label}
                        </p>
                        <p className="mt-1 text-sm text-gray-600">
                          {currentBillScanStep.description}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xl font-semibold text-gray-700">
                        {billScanProgressPercent}%
                      </span>
                    </div>
                    <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div
                        className="relative h-full overflow-hidden rounded-full bg-blue-600 transition-all duration-500"
                        style={{ width: `${billScanProgressPercent}%` }}
                      >
                        <span className="bill-scan-progress-shimmer absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                      </div>
                    </div>
                  </div>
                </div>
              : <div className="flex justify-end gap-2 border-t bg-gray-50 px-5 py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setIsUploadModalOpen(false);
                      resetBillUpload();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={uploadFiles.length === 0}
                    onClick={processUploadedBillImages}
                  >
                    Process & Create Bill
                  </Button>
                </div>
              }
            </div>
          </div>,
          document.body,
        )}

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, bill: null })}
        onConfirm={async () => {
          try {
            await api.delete(`/bills/${deleteDialog.bill.id}`);
            showToast("Bill deleted successfully", "success");
            setBills((prev) =>
              prev.filter((b) => b.id !== deleteDialog.bill.id),
            );
            setDeleteDialog({ isOpen: false, bill: null });
          } catch (error) {
            console.error(error);
            showToast(
              error?.response?.data?.message || "Failed to delete bill",
              "error",
            );
          }
        }}
        itemName={deleteDialog.bill?.billNo}
      />
    </div>
  );
};

export default BillList;
