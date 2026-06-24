import { useState, useEffect, useRef, Fragment } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FaTimes,
  FaSave,
  FaPrint,
  FaCamera,
  FaChevronDown,
  FaChevronUp,
  FaCalendarAlt,
} from "react-icons/fa";
import { Button, SearchableSelect } from "../../components/ui";
import useStore from "../../store";
import { Modal } from "../../components/common";
import BillGunScanner from "../../components/BillGunScanner";
import api from "../../services/axiosInstance";
import { STOCK_UPDATE_EVENT } from "../../services/stockSocket";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getResponseData,
  getResponseList,
  getResponseMeta,
  getEntityId,
  normalizeContact,
  normalizeItem,
} from "../../services/apiUtils";
import {
  resolveItemFromScan,
  shouldResolveScannerInput,
} from "../../utils/itemScan";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import {
  getTodayDisplayDate,
  normalizeDisplayDateInput,
} from "../../utils/dateHelpers";

import useFirmBranding from "../../hooks/useFirmBranding";

const getToday = () => {
  return getTodayDisplayDate();
};

const convertDateToISO = (ddmmyy) => {
  if (!ddmmyy) return "";
  const parts = ddmmyy.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !/^\d{2}(?:\d{2})?$/.test(yyyy)) return "";
  const year =
    yyyy.length === 2 ?
      Number(yyyy) >= 70 ?
        1900 + Number(yyyy)
      : 2000 + Number(yyyy)
    : Number(yyyy);
  return `${String(year).padStart(4, "0")}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
};

const convertDateFromISO = (isoDate) => {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return "";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const normalizeTypeValue = (value, fallback = 0) => {
  if (value === 1 || value === "1") return 1;
  if (value === 0 || value === "0") return 0;
  return fallback;
};

const getLinkedChallanId = (challan) => {
  if (!challan) return "";
  if (typeof challan === "string") return challan;
  return challan?._id || challan?.raw?._id || "";
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

const normalizeStateCode = (...values) => {
  for (const value of values) {
    const text = String(value || "").trim();
    if (!text) continue;
    const digits = text.match(/\d{1,2}/);
    if (digits) return digits[0].padStart(2, "0");
  }
  return "";
};

const buildPrintableContact = (
  contact = {},
  normalized = normalizeContact(contact),
) => {
  const gstin = contact?.gstin || normalized?.gstin || "";
  const pin = extractSixDigitPin(
    contact?.pincode,
    contact?.pin,
    contact?.postal_code,
    contact?.zip,
    contact?.area_id?.pincode,
    contact?.area?.pincode,
    contact?.address,
  );
  const pan = extractPanFromValues(
    contact?.pan,
    contact?.pan_number,
    contact?.reg_number,
    normalized?.reg_number,
    gstin ? gstin.slice(2, 12) : "",
  );
  const stateCode = normalizeStateCode(
    contact?.state_code,
    contact?.stateCode,
    contact?.gst_state_code,
    gstin ? gstin.slice(0, 2) : "",
  );

  return {
    ...contact,
    ...normalized,
    phone:
      contact?.phone ||
      contact?.mobile ||
      contact?.mobile_number ||
      contact?.whatsapp ||
      contact?.whatsapp_number ||
      normalized?.phone ||
      "",
    address: contact?.address || contact?.area?.address || "",
    city: contact?.city || contact?.area_id?.city || contact?.area?.city || "",
    pin,
    pincode: pin,
    gstin,
    pan,
    state:
      contact?.state || contact?.area_id?.state || contact?.area?.state || "",
    state_code: stateCode,
    bank_name:
      contact?.bank_name ||
      contact?.bank_id?.bank_name ||
      normalized?.bank_name ||
      "",
    bank_branch:
      contact?.bank_branch ||
      contact?.bank_id?.bank_branch ||
      normalized?.bank_branch ||
      "",
    ifsc_code:
      contact?.ifsc_code ||
      contact?.bank_id?.ifsc_code ||
      normalized?.ifsc_code ||
      "",
    account_number:
      contact?.account_number ||
      contact?.bank_id?.account_number ||
      normalized?.account_number ||
      "",
  };
};

const normalizeSelectedFirmKey = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "_");

const getFinancialYearLabel = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const startYear =
    date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${String(startYear).slice(-2)}-${String(startYear + 1).slice(-2)}`;
};

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
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
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
  currentBillId,
  contactBalance,
}) => {
  const amount = Number(currentAmount) || 0;
  const availableBalance = Math.max(0, Number(contactBalance) || 0);
  try {
    if (!contactId) return Math.max(0, Math.round(amount - availableBalance));
    const response = await apiClient.get(`/outstanding/${contactId}/summary`);
    const summary = getResponseData(response) || {};
    const existingDue = Math.max(0, Number(summary.total_due) || 0);
    const totalDue = currentBillId ? existingDue : existingDue + amount;
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
    pan: pickFirstFilled(
      profileFirm?.pan,
      firmData?.pan,
      selectedFirm?.pan,
      profileFirm?.pan_number,
      firmData?.pan_number,
      selectedFirm?.pan_number,
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

const BillForm = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const isEditMode = !!id;
  const { showToast, user, selectedFirm, selectedFinancialYearId } = useStore();
  const firmBranding = useFirmBranding();

  const normalizeFirmType = (value) =>
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[-\s]/g, "_");

  const getFirmTypeFromToken = () => {
    const token = localStorage.getItem("token");
    if (!token || typeof token !== "string") return "";
    const parts = token.split(".");
    if (parts.length < 2) return "";

    try {
      // JWT payload is base64url encoded JSON
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "===".slice((base64.length + 3) % 4);
      const payload = JSON.parse(atob(padded));
      return payload?.firm_type || payload?.firmType || "";
    } catch {
      return "";
    }
  };

  const firmType =
    selectedFirm?.type ||
    (selectedFirm?.id === "GST" ? "GST"
    : selectedFirm?.id === "NON_GST" ? "NON_GST"
    : "") ||
    getFirmTypeFromToken() ||
    user?.current_firm_type ||
    user?.firm_type ||
    user?.firmType ||
    user?.firm_data?.firm_type ||
    "";

  const isFirmGST =
    selectedFirm?.id === "gst" || normalizeFirmType(firmType) === "GST";

  const getPartyGstType = () => {
    if (!bill.party) return null;
    const contacts =
      bill.contactType === "supplier" ? loadedSuppliers : loadedParties;
    const selectedContact = contacts.find((c) => c.id === bill.party);
    if (!selectedContact) return null;
    return Number(selectedContact?.is_gst ?? 0) === 1 ? 1 : 0;
  };

  const isCashBookContact = (contact) =>
    String(contact?.type || "").toLowerCase() === "book" ||
    String(contact?.name || "")
      .trim()
      .toUpperCase() === "CASHBOOK";

  const getCashBookContact = () =>
    [...loadedParties, ...loadedSuppliers].find(isCashBookContact) || null;

  const getResolvedContactId = () => {
    if (bill.party) return bill.party;
    if (["me", "book"].includes(String(bill.contactType || "").toLowerCase())) {
      return getCashBookContact()?.id || "";
    }
    return "";
  };

  const getResolvedContact = () => {
    const contactId = getResolvedContactId();
    if (!contactId) return null;
    return (
      [...loadedParties, ...loadedSuppliers].find(
        (contact) => contact.id === contactId,
      ) || null
    );
  };

  const isBookOrCashOrBank = (contact) => {
    if (!contact) return false;
    const type = String(contact.type || "").toLowerCase();
    const name = String(contact.name || "")
      .trim()
      .toUpperCase();
    return type === "book" || name === "CASHBOOK" || name === "BANKBOOK";
  };

  const [loadedParties, setLoadedParties] = useState([]);
  const [loadedSuppliers, setLoadedSuppliers] = useState([]);
  const [loadedAgents, setLoadedAgents] = useState([]);
  const [loadedTransports, setLoadedTransports] = useState([]);
  const [loadedBanks, setLoadedBanks] = useState([]);
  const [loadedItems, setLoadedItems] = useState([]);
  const [loadedLabels, setLoadedLabels] = useState([]);
  const [filteredLabels, setFilteredLabels] = useState([]);
  const [loadedDiscounts, setLoadedDiscounts] = useState({});
  const [loadedLabelDiscounts, setLoadedLabelDiscounts] = useState({});
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [totalItemsPages, setTotalItemsPages] = useState(1);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [hasMoreItems, setHasMoreItems] = useState(true);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [itemHistoryMap, setItemHistoryMap] = useState({});
  const [showAllCombinedStock, setShowAllCombinedStock] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [hideDiscountColumnsState, setHideDiscountColumnsState] = useState(
    localStorage.getItem("hide_discount_columns") !== "false",
  );
  const [suggestedBillNumber, setSuggestedBillNumber] = useState("");
  const itemDropdownRef = useRef(null);
  const itemSearchInputRef = useRef(null);
  const itemDropdownListRef = useRef(null);
  const firstFieldRef = useRef(null);
  const billFormRef = useRef(null);
  const billDatePickerRef = useRef(null);
  const itemHistoryInFlightRef = useRef(new Set());
  const processedRouteScanRef = useRef("");
  const processedBillCloneRef = useRef("");
  const processedBillScanRef = useRef("");
  const lastSuggestedBillNoRef = useRef("");

  const openBillDatePicker = () => {
    const picker = billDatePickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.click();
  };
  const [isResolvingScannerInput, setIsResolvingScannerInput] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [bill, setBill] = useState({
    contactType: "party",
    party: "",
    items: [],
    gstType: isFirmGST ? 1 : 0,
    deductFromStock: true,
    date: getToday(),
    itemDetails: {},
    discount: 0,
    billNumber: "",
    transportId: "",
    transportCharge: 0,
    agent: "",
    customerName: "",
    vehicleNo: "",
    printOption: 2,
    from_bank: "",
    to_bank: "",
    labelId: "",
  });

  const resolvedContact = getResolvedContact();
  const isBookSelected = isBookOrCashOrBank(resolvedContact);

  useEffect(() => {
    if (isEditMode) return;
    setBill((prev) => ({
      ...prev,
      date: getToday(),
    }));
  }, [selectedFinancialYearId, isEditMode]);

  useEffect(() => {
    if (isBookSelected) {
      setExpandedItemId(null);
    }
  }, [isBookSelected]);

  const createItemRowId = (itemId, existingRows = []) => {
    const baseId = String(itemId || "");
    if (!baseId) return "";
    if (!existingRows.includes(baseId)) return baseId;

    let suffix = 1;
    let candidate = `${baseId}__${suffix}`;
    while (existingRows.includes(candidate)) {
      suffix += 1;
      candidate = `${baseId}__${suffix}`;
    }
    return candidate;
  };

  const getRowBaseItemId = (rowId, detailsMap = bill.itemDetails) => {
    if (!rowId) return "";
    const detailItemId = detailsMap?.[rowId]?.itemId;
    if (detailItemId) return String(detailItemId);
    return String(rowId).split("__")[0];
  };

  const getLoadedItemByRowId = (rowId, detailsMap = bill.itemDetails) => {
    const baseItemId = getRowBaseItemId(rowId, detailsMap);
    return loadedItems.find((item) => String(item.id) === String(baseItemId));
  };

  const getLabelItemDiscount = (labelId, itemRef, baseItemId) => {
    if (!labelId || !baseItemId) return 0;

    const labelData = loadedLabelDiscounts[labelId];
    if (!labelData) return 0;

    const brandId = getEntityId(
      itemRef?.brand_id || itemRef?.brand || itemRef?.brandId,
    );
    if (!brandId) return 0;

    return Number(
      labelData?.itemDiscounts?.[brandId]?.[String(baseItemId)] || 0,
    );
  };

  const formatItemMetric = (label, value, { currency = false } = {}) => {
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    const formattedValue =
      currency ? safeValue.toFixed(2) : safeValue.toLocaleString("en-IN");
    return `${label}: ${currency ? `Rs ${formattedValue}` : formattedValue}`;
  };

  const getItemStock = (item) => {
    const physical = Number(
      item?.physicalStock ??
        item?.physical_stock ??
        item?.stock ??
        item?.stockCount ??
        item?.qty ??
        0,
    );
    const logical = Number(item?.logicalStock ?? item?.logical_stock ?? 0);
    const value =
      showAllCombinedStock ?
        (Number.isFinite(physical) ? physical : 0) +
        (Number.isFinite(logical) ? logical : 0)
      : physical;
    return Number.isFinite(value) ? value : 0;
  };

  const getStockColumnValue = (details = {}) => {
    const physical = Number(
      details?.physicalStock ?? details?.physical_stock ?? details?.stock ?? 0,
    );
    const logical = Number(
      details?.logicalStock ?? details?.logical_stock ?? 0,
    );
    const value = showAllCombinedStock ? logical : physical;
    const safeValue = Number.isFinite(value) ? value : 0;
    return Number.isInteger(safeValue) ?
        String(safeValue)
      : safeValue.toFixed(1);
  };

  const toggleStockColumnMode = () => {
    setShowAllCombinedStock((prev) => !prev);
    setBill((prev) => {
      const itemDetails = { ...prev.itemDetails };
      prev.items.forEach((rowId) => {
        const current = itemDetails[rowId] || {};
        const item = getLoadedItemByRowId(rowId, itemDetails);
        const physicalStock =
          item?.physicalStock ??
          item?.physical_stock ??
          current.physicalStock ??
          current.physical_stock ??
          current.stock ??
          0;
        const logicalStock =
          item?.logicalStock ??
          item?.logical_stock ??
          current.logicalStock ??
          current.logical_stock ??
          0;
        itemDetails[rowId] = {
          ...current,
          stock: physicalStock,
          physicalStock,
          logicalStock,
        };
      });
      return { ...prev, itemDetails };
    });
  };

  useEffect(() => {
    const handleStockUpdate = (event) => {
      const stock = event.detail || {};
      const updatedId = String(stock.item_id || stock.id || "");
      if (!updatedId) return;

      setLoadedItems((prev) =>
        prev.map((item) => {
          if (String(item.id) !== updatedId) return item;
          return {
            ...item,
            stock: stock.physical_stock,
            physicalStock: stock.physical_stock,
            physical_stock: stock.physical_stock,
            logicalStock: stock.logical_stock,
            logical_stock: stock.logical_stock,
            opening_physical_stock: stock.opening_physical_stock,
            opening_logical_stock: stock.opening_logical_stock,
          };
        }),
      );

      setBill((prev) => {
        let changed = false;
        const itemDetails = { ...prev.itemDetails };

        prev.items.forEach((rowId) => {
          const details = itemDetails[rowId] || {};
          const rowItemId = String(
            details.itemId || getRowBaseItemId(rowId, itemDetails),
          );
          if (rowItemId !== updatedId) return;

          changed = true;
          itemDetails[rowId] = {
            ...details,
            stock: stock.physical_stock,
            physicalStock: stock.physical_stock,
            logicalStock: stock.logical_stock,
          };
        });

        return changed ? { ...prev, itemDetails } : prev;
      });
    };

    window.addEventListener(STOCK_UPDATE_EVENT, handleStockUpdate);
    return () =>
      window.removeEventListener(STOCK_UPDATE_EVENT, handleStockUpdate);
  }, []);

  const toLoadedItemOption = (item = {}) => {
    const source = item?.raw || item;
    const normalized = normalizeItem(source);

    return {
      ...source,
      ...item,
      id: normalized.id,
      name: normalized.itemName || item?.name || source?.name || "",
      itemName: normalized.itemName || item?.itemName || "",
      item_id: normalized.item_id || item?.item_id || "",
      amount: normalized.amount,
      sale_rate: normalized.amount,
      mrp_rate: normalized.mrp_rate || item?.mrp_rate || source?.mrp_rate || 0,
      barcode: normalized.barcode || item?.barcode || "",
      type: normalized.type,
      gst_percent: normalized.gst_percent,
      stock:
        item?.physicalStock ??
        source?.physical_stock ??
        source?.physicalStock ??
        item?.stock ??
        source?.stock ??
        normalized.stockCount ??
        0,
      physicalStock:
        item?.physicalStock ??
        source?.physical_stock ??
        source?.physicalStock ??
        normalized.stockCount ??
        0,
      logicalStock:
        item?.logicalStock ??
        source?.logical_stock ??
        source?.logicalStock ??
        0,
      qrCodeValue:
        normalized.qrCodeValue ||
        item?.qrCodeValue ||
        source?.qr_code_value ||
        source?.qr_code ||
        "",
    };
  };

  const upsertLoadedItem = (item) => {
    const nextItem = toLoadedItemOption(item);
    setLoadedItems((prev) => {
      const index = prev.findIndex(
        (existing) => String(existing.id) === String(nextItem.id),
      );
      if (index === -1) return [nextItem, ...prev];

      const next = [...prev];
      next[index] = { ...next[index], ...nextItem };
      return next;
    });
    return nextItem;
  };

  const effectiveGstType = isFirmGST ? 1 : 0;

  useEffect(() => {
    setBill((prev) => {
      if (prev.gstType === effectiveGstType) return prev;
      return { ...prev, gstType: effectiveGstType };
    });
  }, [effectiveGstType]);

  useEffect(() => {
    if (isEditMode) return;

    let cancelled = false;

    const fetchNextBillNumber = async () => {
      try {
        console.log("[DEBUG] Fetching next bill number with:", {
          is_gst: effectiveGstType,
          contact_type: bill.contactType || "party",
          bill_contactType: bill.contactType,
        });
        const res = await api.get("/bills/next-number", {
          params: {
            is_gst: effectiveGstType,
            contact_type: bill.contactType || "party",
            contact_id: bill.party || undefined,
          },
          skipCache: true,
        });

        if (cancelled) return;

        const nextNumber = String(getResponseData(res)?.bill_no || "").trim();
        if (!nextNumber) return;

        console.log("[DEBUG] Received bill number:", nextNumber);
        setSuggestedBillNumber(nextNumber);
        setBill((prev) => {
          const currentBillNo = String(prev.billNumber || "").trim();
          const shouldAutoFill =
            !currentBillNo || currentBillNo === lastSuggestedBillNoRef.current;

          if (!shouldAutoFill) return prev;
          return { ...prev, billNumber: nextNumber };
        });

        lastSuggestedBillNoRef.current = nextNumber;
      } catch (error) {
        console.error("Failed to fetch next bill number:", error);
      }
    };

    fetchNextBillNumber();

    return () => {
      cancelled = true;
    };
  }, [isEditMode, effectiveGstType, bill.contactType, bill.party]);

  const handleGstToggle = () => {};

  const getLabelName = (labelValue) => {
    if (!labelValue) return "";
    if (typeof labelValue === "string") return labelValue;
    return labelValue?.name || labelValue?.label_name || "";
  };

  const getPartyLabelId = (partyData, labels = loadedLabels) => {
    if (!partyData) return "";

    const directLabelId =
      getEntityId(partyData?.label_id) ||
      getEntityId(partyData?.label) ||
      getEntityId(partyData?.label_ids?.[0]);
    if (directLabelId) return directLabelId;

    const labelName = String(
      partyData?.discount_label || getLabelName(partyData?.label) || "",
    ).trim();
    if (!labelName) return "";

    const matchedLabel = (labels || []).find(
      (label) =>
        String(label?.name || "")
          .trim()
          .toLowerCase() === labelName.toLowerCase(),
    );
    return matchedLabel?.id || "";
  };

  // Enhanced function to fetch party details from backend
  const fetchPartyDetails = async (partyId) => {
    if (!partyId) return null;
    try {
      const response = await api.get(`/contacts/${partyId}`);
      const contact = getResponseData(response);
      if (!contact) return null;

      const printableContact = buildPrintableContact(contact);

      if (String(printableContact.type || "").toLowerCase() === "supplier") {
        setLoadedSuppliers((prev) => {
          const next = [...prev];
          const index = next.findIndex(
            (item) => String(item.id) === String(printableContact.id),
          );
          if (index === -1) return [printableContact, ...prev];
          next[index] = { ...next[index], ...printableContact };
          return next;
        });
      } else {
        setLoadedParties((prev) => {
          const next = [...prev];
          const index = next.findIndex(
            (item) => String(item.id) === String(printableContact.id),
          );
          if (index === -1) return [printableContact, ...prev];
          next[index] = { ...next[index], ...printableContact };
          return next;
        });
      }

      return printableContact;
    } catch (error) {
      console.error("Failed to fetch party details:", error);
      return null;
    }
  };

  // Function to fetch labels for selected party/supplier
  const fetchLabelsForParty = async (selectedParty) => {
    try {
      if (!selectedParty) {
        setFilteredLabels([]);
        return;
      }

      // Fetch labels filtered by category_id if available, else all labels
      const params = { page: 1, limit: 500 };
      if (selectedParty.category_id) {
        params.category_id = selectedParty.category_id;
      }

      const response = await api.get("/labels", { params });
      const labelData = getResponseList(response).map((label) => ({
        id: getEntityId(label),
        name: label?.name || label?.label_name || "",
        category_id: getEntityId(label?.category_id),
      }));

      setFilteredLabels(labelData.length > 0 ? labelData : loadedLabels);

      // Auto-select the contact's label
      const contactLabelId =
        getEntityId(selectedParty?.label_id) ||
        getEntityId(selectedParty?.label_ids?.[0]) ||
        "";

      if (contactLabelId) {
        setBill((prev) => ({ ...prev, labelId: contactLabelId }));
        return;
      }

      // Fallback: match by discount_label name
      const partyLabelId = getPartyLabelId(
        selectedParty,
        labelData.length > 0 ? labelData : loadedLabels,
      );
      if (partyLabelId) {
        setBill((prev) => ({ ...prev, labelId: partyLabelId }));
      }
    } catch (error) {
      console.error("Failed to fetch labels:", error);
      setFilteredLabels(loadedLabels);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select?.();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [pRes, sRes, iRes, brandRes, aRes, tRes, bRes, lRes, billRes] =
          await Promise.all([
            api.get("/contacts/parties", {
              params: { page: 1, limit: 2000, include_books: true },
            }),
            api.get("/contacts/suppliers", {
              params: { page: 1, limit: 2000, include_books: true },
            }),
            api.get("/items", { params: { page: 1, limit: 50, search: "" } }),
            api.get("/brands", { params: { page: 1, limit: 200 } }),
            api.get("/agents", { params: { page: 1, limit: 200 } }),
            api.get("/transports", { params: { page: 1, limit: 200 } }),
            api.get("/banks", { params: { page: 1, limit: 200 } }),
            api.get("/labels", { params: { page: 1, limit: 200 } }),
            isEditMode ? api.get(`/bills/${id}`) : Promise.resolve(null),
          ]);

        const partiesData = getResponseList(pRes).map((party) => {
          const normalized = normalizeContact(party);
          return {
            ...buildPrintableContact(party, normalized),
            id: normalized.id,
            name: normalized.name,
            type: normalized.type,
            is_gst: normalized.is_gst,
            label_id:
              normalized.label_id ||
              getEntityId(party?.label_id) ||
              getEntityId(party?.label) ||
              getEntityId(party?.label_ids?.[0]) ||
              "",
            category_id:
              normalized.category_id || getEntityId(party?.category_id) || "",
            party_code:
              party?.party_code || party?.contact_code || party?.code || "",
            transport: party?.transport || party?.transport_name || "",
            area: party?.area || party?.location || "",
            discount_label:
              party?.discount_label || getLabelName(party?.label) || "",
            transport_charge:
              normalized.transport_charge ||
              party.transport_charge ||
              party.transportCharge ||
              0,
            transport_id:
              normalized.transport_id ||
              party.transport_id ||
              party.transportId ||
              null,
            agent: normalized.agent_id || party.agent || party.agent_id || null,
          };
        });
        const suppliersData = getResponseList(sRes).map((supplier) => {
          const normalized = normalizeContact(supplier);
          return {
            ...buildPrintableContact(supplier, normalized),
            id: normalized.id,
            name: normalized.name,
            type: normalized.type,
            is_gst: normalized.is_gst,
            gstin: supplier.gstin || normalized.gstin || "",
            label_id:
              normalized.label_id ||
              getEntityId(supplier?.label_id) ||
              getEntityId(supplier?.label) ||
              getEntityId(supplier?.label_ids?.[0]) ||
              "",
            category_id:
              normalized.category_id ||
              getEntityId(supplier?.category_id) ||
              "",
            discount_label:
              supplier?.discount_label ||
              getLabelName(supplier?.label) ||
              (typeof supplier?.label_id === "object" ?
                supplier?.label_id?.name
              : "") ||
              "",
            transport_charge:
              normalized.transport_charge ||
              supplier.transport_charge ||
              supplier.transportCharge ||
              0,
            transport_id:
              normalized.transport_id ||
              supplier.transport_id ||
              supplier.transportId ||
              null,
            agent:
              normalized.agent_id ||
              supplier.agent ||
              supplier.agent_id ||
              null,
          };
        });
        const itemsData = getResponseList(iRes).map((item) => {
          const normalized = normalizeItem(item);
          return {
            ...item,
            id: normalized.id,
            name: normalized.itemName,
            amount: normalized.amount,
            barcode: normalized.barcode,
            type: normalized.type, // 1 = GST, 0 = Non-GST
          };
        });

        setLoadedParties(partiesData);
        setLoadedSuppliers(suppliersData);
        setLoadedItems(
          isFirmGST ? itemsData.filter((it) => it.type === 1) : itemsData,
        );

        const agentsData = getResponseList(aRes).map((ag) => ({
          id: getEntityId(ag) || ag._id || ag.id,
          name:
            ag.name ||
            ag.agent_name ||
            ag.fullName ||
            ag.contact_name ||
            "Unknown",
        }));
        setLoadedAgents(agentsData);

        const transportsData = getResponseList(tRes).map((tr) => ({
          id: getEntityId(tr) || tr._id || tr.id,
          name: tr.name || tr.transport_name || tr.title || "Unknown",
          charge: tr.charge || tr.transport_charge || tr.transportCharge || 0,
        }));
        setLoadedTransports(transportsData);

        const banksData = getResponseList(bRes).map((b) => ({
          id: getEntityId(b) || b._id || b.id,
          name: b.name || b.bank_name || "Unknown",
          bank_name: b.bank_name || b.name || "",
          bank_branch: b.bank_branch || "",
          ifsc_code: b.ifsc_code || "",
          account_number: b.account_number || "",
        }));
        setLoadedBanks(banksData);

        const labelsData = getResponseList(lRes).map((label) => ({
          id: getEntityId(label) || label._id || label.id,
          name: label.name || label.label_name || "Unknown",
          category_id: getEntityId(label?.category_id),
        }));
        setLoadedLabels(labelsData);
        setFilteredLabels(labelsData);

        if (isEditMode && billRes) {
          const billData = getResponseData(billRes) || {};
          const challanIds =
            Array.isArray(billData?.challan_ids) ? billData.challan_ids : [];
          const challanItems = challanIds.flatMap((challan) =>
            Array.isArray(challan?.items) ? challan.items : [],
          );
          const firstChallan = challanIds[0] || {};
          const contactRef = billData?.contact_id || {};
          const contactId = getEntityId(contactRef) || "";
          const contactType = billData?.contact_type || "party";

          // Fetch stock for all challan items
          const uniqueItemIds = [
            ...new Set(
              challanItems
                .map((item) => getEntityId(item?.item_id || item))
                .filter(Boolean),
            ),
          ];
          const stockMap = {};
          await Promise.all(
            uniqueItemIds.map(async (itemId) => {
              try {
                const res = await api.get(`/items/${itemId}`);
                const itemData = getResponseData(res);
                if (itemData) {
                  const normalized = normalizeItem(itemData);
                  stockMap[itemId] = {
                    stock:
                      itemData?.physical_stock ??
                      itemData?.physicalStock ??
                      itemData?.stock ??
                      normalized.stockCount ??
                      0,
                    physicalStock:
                      itemData?.physical_stock ??
                      itemData?.physicalStock ??
                      normalized.stockCount ??
                      0,
                    logicalStock:
                      itemData?.logical_stock ?? itemData?.logicalStock ?? 0,
                  };
                }
              } catch {}
            }),
          );

          const itemRows = [];
          const itemDetailsMap = {};
          challanItems.forEach((item) => {
            const itemId = getEntityId(item?.item_id || item);
            if (!itemId) return;
            const rowId = createItemRowId(itemId, itemRows);
            itemRows.push(rowId);
            const itemRef = item?.item_id || {};
            const stockData = stockMap[itemId] || {
              stock: 0,
              physicalStock: 0,
              logicalStock: 0,
            };
            itemDetailsMap[rowId] = {
              itemId,
              pcs: item?.quantity || 1,
              rate: item?.rate || 0,
              disPercent: item?.discount || 0,
              spDis: item?.special_discount || 0,
              itemDiscount: item?.item_discount || 0,
              itemDis2: item?.item_dis2 || 0,
              dis3: item?.dis3 || 0,
              gstPercent: item?.gst_percent || 0,
              type: isFirmGST ? 1 : 0,
              remark: item?.remark || "",
              itemName: itemRef?.item_name || itemRef?.name || "",
              barcode:
                itemRef?.barcode ||
                itemRef?.barcode_no ||
                itemRef?.part_no ||
                "",
              _manualDiscountFields: {
                disPercent: true,
                spDis: true,
                dis3: true,
              },
              ...stockData,
            };
          });

          const rawDate = billData?.date || firstChallan?.date;
          setBill({
            contactType,
            party: contactId,
            items: itemRows,
            gstType: isFirmGST ? 1 : 0,
            deductFromStock:
              billData?.skip_stock_calculation !== undefined ?
                !billData.skip_stock_calculation
              : Number(billData?.deduct_from_stock ?? 1) === 1,
            date: rawDate ? convertDateFromISO(rawDate) : getToday(),
            itemDetails: itemDetailsMap,
            discount: 0,
            billNumber: billData?.bill_no || "",
            transportId: getEntityId(billData?.transport_id) || "",
            transportCharge: billData?.transport_charge || 0,
            agent: getEntityId(billData?.agent_id) || "",
            customerName: billData?.customer_name || "",
            vehicleNo: billData?.vehicle_no || billData?.vehicle_number || "",
            printOption:
              firstChallan?.print_option || billData?.print_option || 2,
            from_bank: getEntityId(billData?.from_bank) || "",
            to_bank: getEntityId(billData?.to_bank) || "",
            labelId: getEntityId(firstChallan?.label_id) || "",
          });
        }

        const brandList = getResponseList(brandRes);
        const discountMap = {};
        brandList.forEach((b) => {
          const brandId = getEntityId(b);
          if (brandId) {
            discountMap[brandId] = {
              discount1: b.discount1 || { normal: 0, special: 0 },
              discount2: b.discount2 || { normal: 0, special: 0 },
            };
          }
        });
        setLoadedDiscounts(discountMap);

        const itemsMeta = getResponseMeta(iRes);
        setTotalItemsPages(itemsMeta?.totalPages || 1);
      } catch (err) {
        console.error("Failed to fetch data", err);
        showToast("Failed to load data", "error");
      }
    };
    fetchData();
  }, []);

  const loadItemsPage = async (page, append = false) => {
    setIsLoadingItems(true);
    try {
      const response = await api.get("/items", {
        params: { page, limit: 50, search: itemSearchTerm },
      });
      const items = getResponseList(response).map((item) => {
        const normalized = normalizeItem(item);
        return {
          ...item,
          id: normalized.id,
          name: normalized.itemName,
          amount: normalized.amount,
          type: normalized.type,
        };
      });

      if (append) {
        setLoadedItems((prev) => [...prev, ...items]);
      } else {
        setLoadedItems(items);
      }
      setItemsPage(page);

      const meta = getResponseMeta(response);
      setTotalItemsPages(meta?.totalPages || 1);
      setHasMoreItems(page < (meta?.totalPages || 1));
    } catch (err) {
      console.error("Failed to load items page:", err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    if (
      scrollTop + clientHeight >= scrollHeight - 10 &&
      hasMoreItems &&
      !isLoadingItems
    ) {
      loadItemsPage(itemsPage + 1, true);
    }
  };

  useEffect(() => {
    const searchItems = async () => {
      setIsLoadingItems(true);
      try {
        const response = await api.get("/items", {
          params: { page: 1, limit: 50, search: itemSearchTerm },
        });
        const searchResults = getResponseList(response).map((item) => {
          const normalized = normalizeItem(item);
          return {
            ...item,
            id: normalized.id,
            name: normalized.itemName,
            amount: normalized.amount,
            type: normalized.type,
          };
        });

        setLoadedItems(searchResults);
        setItemsPage(1);

        const meta = getResponseMeta(response);
        setTotalItemsPages(meta?.totalPages || 1);
        const hasMore = 1 < (meta?.totalPages || 1);
        setHasMoreItems(hasMore);

        // Load second page if available
        if (hasMore) {
          const response2 = await api.get("/items", {
            params: { page: 2, limit: 50, search: itemSearchTerm },
          });
          const searchResults2 = getResponseList(response2).map((item) => {
            const normalized = normalizeItem(item);
            return {
              ...item,
              id: normalized.id,
              name: normalized.itemName,
              amount: normalized.amount,
              type: normalized.type,
            };
          });
          setLoadedItems((prev) => [...prev, ...searchResults2]);
          setItemsPage(2);
          const hasMore2 = 2 < (getResponseMeta(response2)?.totalPages || 1);
          setHasMoreItems(hasMore2);

          // Load third page if available
          if (hasMore2) {
            const response3 = await api.get("/items", {
              params: { page: 3, limit: 50, search: itemSearchTerm },
            });
            const searchResults3 = getResponseList(response3).map((item) => {
              const normalized = normalizeItem(item);
              return {
                ...item,
                id: normalized.id,
                name: normalized.itemName,
                amount: normalized.amount,
                type: normalized.type,
              };
            });
            setLoadedItems((prev) => [...prev, ...searchResults3]);
            setItemsPage(3);
            setHasMoreItems(3 < (getResponseMeta(response3)?.totalPages || 1));
          }
        }
      } catch (err) {
        console.error("Failed to search items:", err);
      } finally {
        setIsLoadingItems(false);
      }
    };

    if (showItemDropdown) {
      const timer = setTimeout(searchItems, 300);
      return () => clearTimeout(timer);
    }
  }, [itemSearchTerm, showItemDropdown]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        itemDropdownRef.current &&
        !itemDropdownRef.current.contains(event.target)
      ) {
        setShowItemDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (bill.contactType !== "party") return;
    const labelId = bill.labelId;
    if (!labelId) return;
    if (loadedLabelDiscounts[labelId]) return;

    const controller = new AbortController();
    const fetchLabelDiscounts = async () => {
      try {
        const res = await api.get(`/labels/${labelId}`, {
          signal: controller.signal,
        });
        const labelData = getResponseData(res) || {};
        const brandDiscounts = labelData?.brand_discounts || [];
        const discountMap = {};
        const itemDiscountMap = {};

        brandDiscounts.forEach((entry) => {
          const brandId = getEntityId(entry?.brand_id);
          if (!brandId) return;

          // Brand-level discounts
          discountMap[brandId] = {
            discount1: entry?.disc1 ||
              entry?.discount1 || { normal: 0, special: 0 },
            discount2: entry?.disc2 ||
              entry?.discount2 || { normal: 0, special: 0 },
          };

          // Item-level discounts
          const itemDiscounts = entry?.item_discounts || [];
          const brandItemDiscounts = {};
          itemDiscounts.forEach((itemEntry) => {
            const itemId = getEntityId(itemEntry?.item_id);
            if (itemId) {
              brandItemDiscounts[itemId] = Number(itemEntry?.discount || 0);
            }
          });
          itemDiscountMap[brandId] = brandItemDiscounts;
        });

        setLoadedLabelDiscounts((prev) => ({
          ...prev,
          [labelId]: {
            brandDiscounts: discountMap,
            itemDiscounts: itemDiscountMap,
          },
        }));
      } catch (error) {
        if (error?.name !== "CanceledError") {
          console.error("Failed to load label discounts", error);
        }
      }
    };

    fetchLabelDiscounts();
    return () => controller.abort();
  }, [bill.contactType, bill.labelId, loadedLabelDiscounts]);

  // Initialize filtered labels when component loads
  useEffect(() => {
    if (
      (bill.contactType === "party" || bill.contactType === "supplier") &&
      bill.party
    ) {
      const list =
        bill.contactType === "party" ? loadedParties : loadedSuppliers;
      const selected = list.find((p) => p.id === bill.party);
      if (selected) {
        fetchLabelsForParty(selected);
      }
    } else {
      setFilteredLabels(loadedLabels);
    }
  }, [
    bill.contactType,
    bill.party,
    loadedParties,
    loadedSuppliers,
    loadedLabels,
  ]);

  useEffect(() => {
    if (!bill.party) return;
    fetchPartyDetails(bill.party);
  }, [bill.party]);

  useEffect(() => {
    if (!bill.party) {
      setBill((prev) => (prev.labelId ? { ...prev, labelId: "" } : prev));
      return;
    }
    if (filteredLabels.length === 0) return;
    const list = bill.contactType === "party" ? loadedParties : loadedSuppliers;
    const contact = list.find((p) => p.id === bill.party);
    const partyLabelId = getPartyLabelId(contact, filteredLabels);
    if (!partyLabelId) return;
    setBill((prev) => {
      if (prev.labelId === partyLabelId) return prev;
      return { ...prev, labelId: partyLabelId };
    });
  }, [
    bill.contactType,
    bill.party,
    loadedParties,
    loadedSuppliers,
    filteredLabels,
  ]);

  useEffect(() => {
    const activeLabelId = bill.labelId;
    if (bill.contactType !== "party") return;
    if (activeLabelId && !loadedLabelDiscounts[activeLabelId]) return;

    setBill((prev) => {
      if (!prev.items.length) return prev;

      let changed = false;
      const nextItemDetails = { ...prev.itemDetails };
      const labelDiscountData =
        activeLabelId ? loadedLabelDiscounts[activeLabelId] : null;
      const labelDiscounts = labelDiscountData?.brandDiscounts || null;

      for (const rowId of prev.items) {
        const details = nextItemDetails[rowId] || {};
        const baseItemId = getRowBaseItemId(rowId, prev.itemDetails);
        const item = getLoadedItemByRowId(rowId, prev.itemDetails);
        const brandId = getEntityId(
          item?.brand_id || item?.brand || item?.brandId,
        );
        const discForBrand = (labelDiscounts && labelDiscounts[brandId]) || {};
        const useDisc =
          (effectiveGstType === 1 ?
            discForBrand.discount1 || {}
          : discForBrand.discount2 || {}) || {};
        const autoDis3 =
          activeLabelId ?
            getLabelItemDiscount(activeLabelId, item, baseItemId)
          : 0;
        const manualDiscountFields = details._manualDiscountFields || {};
        const nextDetails = {
          ...details,
          ...(!manualDiscountFields.disPercent ?
            { disPercent: Number(useDisc.normal || 0) }
          : {}),
          ...(!manualDiscountFields.spDis ?
            { spDis: Number(useDisc.special || 0) }
          : {}),
          ...(!manualDiscountFields.dis3 ?
            { dis3: Number(autoDis3 || 0) }
          : {}),
        };

        const discountChanged =
          (!manualDiscountFields.disPercent &&
            Number(details.disPercent || 0) !==
              Number(nextDetails.disPercent || 0)) ||
          (!manualDiscountFields.spDis &&
            Number(details.spDis || 0) !== Number(nextDetails.spDis || 0)) ||
          (!manualDiscountFields.dis3 &&
            Number(details.dis3 || 0) !== Number(nextDetails.dis3 || 0));

        if (discountChanged) {
          nextItemDetails[rowId] = nextDetails;
          changed = true;
        }
      }

      if (!changed) return prev;
      return {
        ...prev,
        itemDetails: nextItemDetails,
      };
    });
  }, [
    bill.contactType,
    bill.labelId,
    loadedLabelDiscounts,
    loadedItems,
    loadedDiscounts,
    effectiveGstType,
  ]);

  const filteredItems = loadedItems;
  const round2 = (value) => Number((Number(value) || 0).toFixed(2));
  const round0 = (value) => Math.round(Number(value) || 0);
  const roundNetAmount = (value) => Math.ceil(Number(value) || 0);
  const numberDraftPattern = /^\d*(?:\.\d*)?$/;
  const signedNumberDraftPattern = /^-?\d*(?:\.\d*)?$/;
  const integerDraftPattern = /^\d*$/;
  const signedIntegerDraftPattern = /^-?\d*$/;
  const autoDiscountFields = new Set(["disPercent", "spDis", "dis3"]);
  const itemNumberRules = {
    pcs: { label: "PCS", integer: true, required: true, allowNegative: true },
    rate: { label: "Rate (₹)", min: 0, required: true },
    disPercent: { label: "Disc (%)", min: 0, max: 100 },
    spDis: { label: "SP Disc (%)", min: 0, max: 100 },
    itemDiscount: { label: "Item Disc (%)", min: 0, max: 100 },
    itemDis2: { label: "Item Disc2 (%)", min: 0, max: 100 },
    dis3: { label: "Disc Amt (₹)", min: 0 },
    gstPercent: { label: "GST (%)", min: 0, max: 100 },
  };

  const isValidNumberDraft = (value, rule = {}) => {
    const text = String(value ?? "").trim();
    if (text === "") return true;
    if (rule.integer) {
      return (
        rule.allowNegative ?
          signedIntegerDraftPattern
        : integerDraftPattern).test(text);
    }
    return (
      rule.allowNegative ?
        signedNumberDraftPattern
      : numberDraftPattern).test(text);
  };

  const validateNumberInput = (value, rule = {}) => {
    const text = String(value ?? "").trim();
    if (text === "") {
      return rule.required ? `${rule.label} is required` : "";
    }
    if (!isValidNumberDraft(text, rule)) {
      return `${rule.label} must be a valid ${rule.integer ? "integer" : "number"}`;
    }
    const number = Number(text);
    if (!Number.isFinite(number)) return `${rule.label} must be a valid number`;
    if (rule.integer && !Number.isInteger(number)) {
      return `${rule.label} must be a whole number`;
    }
    if (rule.min !== undefined && number < rule.min) {
      return `${rule.label} must be at least ${rule.min}`;
    }
    if (rule.max !== undefined && number > rule.max) {
      return `${rule.label} cannot exceed ${rule.max}`;
    }
    return "";
  };

  const updateNumberDraft = (itemId, field, value) => {
    const rule = itemNumberRules[field] || {};
    if (!isValidNumberDraft(value, rule)) return;
    updateItemDetail(itemId, field, value);
  };

  const validateNegativeItemRows = (items, detailsMap) => {
    const quantityByItem = new Map();
    for (const rowId of items) {
      const details = detailsMap[rowId] || {};
      const baseItemId = getRowBaseItemId(rowId, detailsMap);
      const quantity = Number(details.pcs);
      if (!baseItemId || !Number.isFinite(quantity)) continue;
      if (!quantityByItem.has(baseItemId)) {
        quantityByItem.set(baseItemId, { positive: 0, negative: 0, name: "" });
      }
      const entry = quantityByItem.get(baseItemId);
      if (!entry.name) {
        entry.name =
          details.itemName ||
          getLoadedItemByRowId(rowId, detailsMap)?.name ||
          baseItemId;
      }
      if (quantity > 0) entry.positive += quantity;
      if (quantity < 0) entry.negative += Math.abs(quantity);
    }

    for (const entry of quantityByItem.values()) {
      if (entry.negative <= 0) continue;
      if (entry.positive <= 0) {
        return `${entry.name} negative PCS needs positive PCS row`;
      }
      if (entry.negative > entry.positive) {
        return `${entry.name} negative PCS cannot exceed positive PCS`;
      }
    }
    return "";
  };

  const pruneInvalidNegativeRows = (items, detailsMap) => {
    const quantityByItem = new Map();
    for (const rowId of items) {
      const baseItemId = getRowBaseItemId(rowId, detailsMap);
      const quantity = Number(detailsMap[rowId]?.pcs);
      if (!baseItemId || !Number.isFinite(quantity)) continue;
      if (!quantityByItem.has(baseItemId)) {
        quantityByItem.set(baseItemId, { positive: 0, negative: 0 });
      }
      const entry = quantityByItem.get(baseItemId);
      if (quantity > 0) entry.positive += quantity;
      if (quantity < 0) entry.negative += Math.abs(quantity);
    }

    const invalidItemIds = new Set(
      [...quantityByItem.entries()]
        .filter(
          ([, entry]) => entry.negative > 0 && entry.negative > entry.positive,
        )
        .map(([itemId]) => itemId),
    );
    if (invalidItemIds.size === 0) return { items, itemDetails: detailsMap };

    const nextItems = items.filter((rowId) => {
      const quantity = Number(detailsMap[rowId]?.pcs);
      const baseItemId = getRowBaseItemId(rowId, detailsMap);
      return !(quantity < 0 && invalidItemIds.has(baseItemId));
    });
    const nextItemDetails = { ...detailsMap };
    for (const rowId of items) {
      if (!nextItems.includes(rowId)) delete nextItemDetails[rowId];
    }
    return { items: nextItems, itemDetails: nextItemDetails };
  };

  const validateBillNumbers = () => {
    const transportError = validateNumberInput(bill.transportCharge, {
      label: "Transport Charge",
      min: 0,
    });
    if (transportError) return transportError;

    for (const itemId of bill.items) {
      const details = bill.itemDetails[itemId] || {};
      const itemType = normalizeTypeValue(details.type, effectiveGstType);
      const fields = [
        "pcs",
        "rate",
        "disPercent",
        "spDis",
        "dis3",
        "itemDiscount",
        "itemDis2",
      ];
      if (itemType === 1) fields.push("gstPercent");
      for (const field of fields) {
        const error = validateNumberInput(
          details[field],
          itemNumberRules[field],
        );
        if (error) return error;
      }
      const totalPercent =
        Number(details.disPercent || 0) +
        Number(details.spDis || 0) +
        Number(details.itemDiscount || 0) +
        Number(details.itemDis2 || 0);
      if (totalPercent > 100) {
        return "Total discount percent cannot exceed 100";
      }
    }
    return validateNegativeItemRows(bill.items, bill.itemDetails);
  };

  const buildBillItemDetails = (item, currentBill) => {
    const activeLabelId = currentBill.labelId;
    const labelDiscountData =
      activeLabelId ? loadedLabelDiscounts[activeLabelId] : null;
    const labelDiscounts = labelDiscountData?.brandDiscounts || null;
    const labelItemDiscounts = labelDiscountData?.itemDiscounts || {};

    const brandId = getEntityId(item?.brand_id || item?.brand || item?.brandId);
    const discForBrand = (labelDiscounts && labelDiscounts[brandId]) || {};
    const useDisc =
      (effectiveGstType === 1 ?
        discForBrand.discount1 || {}
      : discForBrand.discount2 || {}) || {};
    const baseItemId = String(item?.id || "");
    const itemSpecificDiscount =
      getLabelItemDiscount(activeLabelId, item, baseItemId) ||
      labelItemDiscounts[brandId]?.[baseItemId] ||
      0;

    return {
      itemId: baseItemId,
      pcs: 1,
      rate: item?.amount || 0,
      disPercent: useDisc.normal || 0,
      spDis: useDisc.special || 0,
      gstPercent: item?.gst_percent || 0,
      itemDiscount: Number(item?.discount || 0),
      itemDis2: 0,
      dis3: itemSpecificDiscount,
      stock: item?.physicalStock ?? item?.physical_stock ?? item?.stock ?? 0,
      physicalStock: item?.physicalStock ?? item?.physical_stock ?? 0,
      logicalStock: item?.logicalStock ?? item?.logical_stock ?? 0,
      type: effectiveGstType,
      remark: item?.name || "",
      itemName: item?.name || "",
      barcode:
        item?.barcode ||
        item?.barcode_no ||
        item?.barcodeNumber ||
        item?.barcode_value ||
        item?.part_no ||
        "",
    };
  };

  const toggleItemSelection = async (
    itemIdOrRowId,
    mode = "toggle",
    sourceItemOverride = null,
  ) => {
    if (mode === "toggle" && expandedItemId === itemIdOrRowId) {
      setExpandedItemId(null);
    }

    let addedRowId = null;
    let addedBaseItemId = null;

    setBill((prev) => {
      if (mode === "add") {
        const baseItemId = String(
          itemIdOrRowId || sourceItemOverride?.id || "",
        );
        const rowId = createItemRowId(baseItemId, prev.items);
        const item =
          sourceItemOverride ||
          loadedItems.find((i) => String(i.id) === String(baseItemId));
        if (!item) return prev;
        const itemDetails = buildBillItemDetails(item, prev);

        addedRowId = rowId;
        addedBaseItemId = baseItemId;

        return {
          ...prev,
          items: [...prev.items, rowId],
          itemDetails: {
            ...prev.itemDetails,
            [rowId]: itemDetails,
          },
        };
      }

      if (!prev.items.includes(itemIdOrRowId)) return prev;
      const items = prev.items.filter((rowId) => rowId !== itemIdOrRowId);
      const nextItemDetails = { ...prev.itemDetails };
      delete nextItemDetails[itemIdOrRowId];
      const pruned = pruneInvalidNegativeRows(items, nextItemDetails);
      return {
        ...prev,
        items: pruned.items,
        itemDetails: pruned.itemDetails,
      };
    });

    if (mode === "add" && addedRowId && addedBaseItemId) {
      ensureItemHistoryOpen(addedRowId, addedBaseItemId);
    }
  };

  const calculateItemAmount = (itemId) => {
    const details = bill.itemDetails[itemId] || {};
    const parsedPcs = parseFloat(details.pcs);
    const pcs = Number.isFinite(parsedPcs) ? parsedPcs : 1;
    const rate = parseFloat(details.rate || 0);
    const disPercent = parseFloat(details.disPercent || 0);
    const spDis = parseFloat(details.spDis || 0);
    const itemDiscount = parseFloat(details.itemDiscount || 0);
    const itemDis2 = parseFloat(details.itemDis2 || 0);
    const dis3 = parseFloat(details.dis3 || 0);
    const gstPercent = parseFloat(details.gstPercent || 0);
    const itemType = normalizeTypeValue(details.type, effectiveGstType);

    const grossRaw = pcs * rate;
    const discountSign = grossRaw < 0 ? -1 : 1;
    const afterDiscount = grossRaw - (grossRaw * disPercent) / 100;
    const afterSpecialDiscount = afterDiscount - (afterDiscount * spDis) / 100;
    const signedFlatDiscount = discountSign * dis3;
    const afterFlatDiscount = afterSpecialDiscount - signedFlatDiscount;
    const afterItemDiscount =
      afterFlatDiscount - (afterFlatDiscount * itemDiscount) / 100;
    const taxableRaw = afterItemDiscount - (afterItemDiscount * itemDis2) / 100;
    const grossAmount = Math.round(grossRaw);
    const discountAmount = Math.round(grossRaw - afterDiscount);
    const totalDiscount = Math.round(grossRaw - taxableRaw);
    const taxableAmount = Math.round(taxableRaw);
    const gstAmount = Math.round(
      itemType === 1 ? (taxableAmount * gstPercent) / 100 : 0,
    );
    const amount = Math.round(taxableAmount + gstAmount);

    return {
      grossAmount,
      totalDiscount,
      discountAmount,
      taxableAmount,
      gstAmount,
      amount,
      baseAmount: grossAmount,
      afterDiscount: taxableAmount,
    };
  };

  const updateItemDetail = (itemId, field, value) => {
    let nextValue = value;

    if (field === "type") {
      const rawValue = String(value ?? "").trim();
      if (rawValue === "") {
        nextValue = "";
      } else {
        const digits = rawValue.replace(/[^01]/g, "");
        const lastDigit = digits.slice(-1);
        if (lastDigit === "1") {
          nextValue = 1;
        } else if (lastDigit === "0") {
          nextValue = 0;
        } else {
          nextValue = bill.itemDetails[itemId]?.type ?? "";
        }
      }
    }

    setBill((prev) => ({
      ...prev,
      itemDetails: {
        ...prev.itemDetails,
        [itemId]: {
          ...prev.itemDetails[itemId],
          [field]: nextValue,
          ...(autoDiscountFields.has(field) ?
            {
              _manualDiscountFields: {
                ...(prev.itemDetails[itemId]?._manualDiscountFields || {}),
                [field]: true,
              },
            }
          : {}),
        },
      },
    }));
  };

  const getItemFieldOrder = (itemType) => {
    const fields = [
      "remark",
      "pcs",
      "rate",
      "disPercent",
      "spDis",
      "dis3",
      "itemDiscount",
      "itemDis2",
    ];
    return fields;
  };

  const focusItemField = (rowIndex, fieldKey) => {
    if (rowIndex === null || rowIndex === undefined) return;
    const selector = `[data-item-row="${rowIndex}"][data-item-field="${fieldKey}"]`;
    const element = document.querySelector(selector);
    if (element && typeof element.focus === "function") {
      element.focus();
      if (typeof element.select === "function") {
        element.select();
      }
    }
  };

  const focusSearchInput = () => {
    requestAnimationFrame(() => {
      itemSearchInputRef.current?.focus();
      itemSearchInputRef.current?.select?.();
    });
  };

  const addItemToBill = (item, options = {}) => {
    if (!item?.id) return false;

    const nextItem = upsertLoadedItem(item);
    const nextIndex = bill.items.length;
    const initialType = effectiveGstType;

    if (options.focusField !== false) {
      setPendingFocus({
        rowIndex: nextIndex,
        fieldKey: getItemFieldOrder(initialType)[0],
      });
    }

    toggleItemSelection(nextItem.id, "add", nextItem);

    if (options.clearSearch !== false) {
      setItemSearchTerm("");
      setShowItemDropdown(false);
    }

    return true;
  };

  const addScannedItemToBill = (item) => {
    if (!item?.id) return false;

    const nextItem = upsertLoadedItem(item);
    let addedRowId = null;

    setBill((prev) => {
      const existingRowId = prev.items.find(
        (rowId) =>
          String(getRowBaseItemId(rowId, prev.itemDetails)) ===
          String(nextItem.id),
      );

      if (existingRowId) {
        const existingDetails = prev.itemDetails[existingRowId] || {};
        const currentQty = Number(existingDetails.pcs || 1);
        return {
          ...prev,
          itemDetails: {
            ...prev.itemDetails,
            [existingRowId]: {
              ...existingDetails,
              pcs: currentQty + 1,
              stock: nextItem?.stock ?? existingDetails.stock ?? 0,
            },
          },
        };
      }

      const rowId = createItemRowId(nextItem.id, prev.items);
      addedRowId = rowId;

      return {
        ...prev,
        items: [...prev.items, rowId],
        itemDetails: {
          ...prev.itemDetails,
          [rowId]: buildBillItemDetails(nextItem, prev),
        },
      };
    });

    if (addedRowId) {
      ensureItemHistoryOpen(addedRowId, nextItem.id);
    }

    setItemSearchTerm("");
    setShowItemDropdown(false);
    focusSearchInput();

    return true;
  };

  const handleScannedItemValue = async (
    rawValue,
    { showSuccessToast = true, showErrorToast = true } = {},
  ) => {
    const scannedValue = String(rawValue || "").trim();
    if (!scannedValue) return false;

    setIsResolvingScannerInput(true);
    try {
      const item = await resolveItemFromScan({
        rawValue: scannedValue,
        loadedItems,
      });
      const added = addScannedItemToBill(item);
      if (added && showSuccessToast) {
        showToast(`${item.name || item.itemName || "Item"} scanned`, "success");
      }
      return added;
    } catch (error) {
      console.error("Failed to resolve scanned item:", error);
      if (showErrorToast) {
        showToast(
          error?.response?.data?.message ||
            error?.message ||
            "Unable to find scanned item",
          "error",
        );
      }
      return false;
    } finally {
      setIsResolvingScannerInput(false);
    }
  };

  const focusNextFocusable = (current, direction = 1) => {
    const root = billFormRef.current || document;
    const all = Array.from(
      root.querySelectorAll(
        'input, select, textarea, button, [tabindex]:not([tabindex="-1"])',
      ),
    );

    const focusables = all.filter((el) => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.hasAttribute("disabled")) return false;
      if (el.getAttribute("aria-disabled") === "true") return false;
      if (el instanceof HTMLInputElement && el.type === "hidden") return false;
      if (typeof el.focus !== "function") return false;
      if (el.getClientRects().length === 0 && el !== document.activeElement) {
        return false;
      }
      return true;
    });

    const index = focusables.indexOf(current);
    if (index === -1) return;
    const next = focusables[index + direction];
    if (!next) return;
    next.focus();
    if (typeof next.select === "function") next.select();
  };

  const handleBillFormKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    if (event.defaultPrevented) return;

    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('[data-enter-nav="off"]')) return;

    const isTextArea = target instanceof HTMLTextAreaElement;
    if (isTextArea) return;

    const isButton =
      target instanceof HTMLButtonElement ||
      (target instanceof HTMLInputElement &&
        (target.type === "button" || target.type === "submit"));
    if (isButton) return;

    if (event.key === "Tab") return;
    event.preventDefault();
    focusNextFocusable(target, event.shiftKey ? -1 : 1);
  };

  const handleItemFieldKeyDown = (event, rowIndex, fieldKey, itemType) => {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();

    const order = getItemFieldOrder(itemType);
    const currentIndex = order.indexOf(fieldKey);
    if (currentIndex === -1) return;

    const isBackward = event.key === "Tab" && event.shiftKey;
    if (isBackward) {
      if (currentIndex > 0) {
        focusItemField(rowIndex, order[currentIndex - 1]);
        return;
      }

      if (rowIndex > 0) {
        const prevItemId = bill.items[rowIndex - 1];
        const prevDetails = bill.itemDetails[prevItemId] || {};
        const prevType =
          prevDetails.type !== undefined ? prevDetails.type : effectiveGstType;
        const prevOrder = getItemFieldOrder(prevType);
        focusItemField(rowIndex - 1, prevOrder[prevOrder.length - 1]);
        return;
      }

      setShowItemDropdown(true);
      focusSearchInput();
      return;
    }

    if (currentIndex < order.length - 1) {
      const nextKey = order[currentIndex + 1];
      focusItemField(rowIndex, nextKey);
      return;
    }

    // Focus delete button of current row
    const deleteBtn = document.querySelector(
      `[data-item-delete="${rowIndex}"]`,
    );
    if (deleteBtn) {
      deleteBtn.focus();
      return;
    }

    if (rowIndex < bill.items.length - 1) {
      const nextItemId = bill.items[rowIndex + 1];
      const nextDetails = bill.itemDetails[nextItemId] || {};
      const nextItemType =
        nextDetails.type !== undefined ? nextDetails.type : effectiveGstType;
      const nextOrder = getItemFieldOrder(nextItemType);
      focusItemField(rowIndex + 1, nextOrder[0]);
      return;
    }

    setShowItemDropdown(true);
    focusSearchInput();
  };

  const handleSelectItem = (item) => {
    if (!item) return;
    addItemToBill(item);
  };

  const handleItemSearchKeyDown = async (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!showItemDropdown) setShowItemDropdown(true);
      setHighlightedItemIndex((prev) => {
        const next = Math.min(prev + 1, Math.max(filteredItems.length - 1, 0));
        requestAnimationFrame(() => {
          itemDropdownListRef.current?.children[next + 1]?.scrollIntoView({
            block: "nearest",
          });
        });
        return next;
      });
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!showItemDropdown) setShowItemDropdown(true);
      setHighlightedItemIndex((prev) => {
        const next = Math.max(prev - 1, 0);
        requestAnimationFrame(() => {
          itemDropdownListRef.current?.children[next + 1]?.scrollIntoView({
            block: "nearest",
          });
        });
        return next;
      });
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const rawInput = String(itemSearchTerm || "").trim();
      if (rawInput && shouldResolveScannerInput(rawInput)) {
        const handled = await handleScannedItemValue(rawInput, {
          showSuccessToast: false,
          showErrorToast: false,
        });
        if (handled) return;
      }
      const selected = filteredItems[highlightedItemIndex] || filteredItems[0];
      if (selected) handleSelectItem(selected);
    }
    if (event.key === "Escape") {
      setShowItemDropdown(false);
    }
    if (event.key === "Tab" && !event.shiftKey) {
      if (bill.items.length === 0) return;
      event.preventDefault();
      const firstItemId = bill.items[0];
      const firstDetails = bill.itemDetails[firstItemId] || {};
      const firstType =
        firstDetails.type !== undefined ? firstDetails.type : effectiveGstType;
      const firstOrder = getItemFieldOrder(firstType);
      focusItemField(0, firstOrder[0]);
      setShowItemDropdown(false);
    }
    if (event.key === "Tab" && event.shiftKey) {
      if (bill.items.length === 0) return;
      event.preventDefault();
      const lastIndex = bill.items.length - 1;
      const lastItemId = bill.items[lastIndex];
      const lastDetails = bill.itemDetails[lastItemId] || {};
      const lastType =
        lastDetails.type !== undefined ? lastDetails.type : effectiveGstType;
      const lastOrder = getItemFieldOrder(lastType);
      focusItemField(lastIndex, lastOrder[lastOrder.length - 1]);
      setShowItemDropdown(false);
    }
  };

  useEffect(() => {
    if (!showItemDropdown) return;
    setHighlightedItemIndex(0);
  }, [showItemDropdown, itemSearchTerm, filteredItems.length]);

  useEffect(() => {
    if (!pendingFocus) return;
    focusItemField(pendingFocus.rowIndex, pendingFocus.fieldKey);
    setPendingFocus(null);
  }, [bill.items, bill.itemDetails, pendingFocus]);

  useEffect(() => {
    if (isEditMode) return;
    const sourceBill = location.state?.cloneBill;
    if (!sourceBill) return;

    const cloneSignature = `bill-clone:${getEntityId(sourceBill) || sourceBill?.bill_no || sourceBill?.billNo || ""}`;
    if (processedBillCloneRef.current === cloneSignature) return;
    processedBillCloneRef.current = cloneSignature;

    const hydrateBillClone = async () => {
      const sourceChallans =
        Array.isArray(sourceBill?.challan_ids) ? sourceBill.challan_ids : [];
      const firstChallan = sourceChallans[0] || {};
      const sourceItems = sourceChallans.flatMap((challan) =>
        Array.isArray(challan?.items) ? challan.items : [],
      );

      if (sourceItems.length === 0) {
        showToast("No bill items found to sell", "error");
        navigate(location.pathname, { replace: true, state: null });
        return;
      }

      const uniqueItemIds = [
        ...new Set(
          sourceItems
            .map((item) => getEntityId(item?.item_id || item))
            .filter(Boolean),
        ),
      ];

      const itemMap = {};
      await Promise.all(
        uniqueItemIds.map(async (itemId) => {
          try {
            const response = await api.get(`/items/${itemId}`);
            const itemData = getResponseData(response);
            if (itemData) itemMap[itemId] = upsertLoadedItem(itemData);
          } catch {
            itemMap[itemId] = null;
          }
        }),
      );

      const sourceContact =
        sourceBill?.contact_id ||
        sourceBill?.party_id ||
        firstChallan?.contact_id ||
        {};
      const sourceContactId = getEntityId(sourceContact);
      const normalizedSourceContactType = String(
        sourceBill?.contact_type ||
          sourceBill?.contactType ||
          sourceContact?.type ||
          (firstChallan?.challan_type === "purchase" ? "supplier" : "party"),
      ).toLowerCase();
      const sourceContactType =
        normalizedSourceContactType === "supplier" ? "supplier" : "party";
      const isPurchaseToSaleClone =
        location.state?.cloneMode === "purchase-to-sale" ||
        sourceContactType === "supplier" ||
        sourceChallans.some(
          (challan) =>
            String(challan?.challan_type || "").toLowerCase() === "purchase",
        );
      const targetContactType =
        isPurchaseToSaleClone ? "party" : sourceContactType;
      const targetContactId =
        targetContactType === sourceContactType ? sourceContactId : "";
      const rawDate = sourceBill?.date || firstChallan?.date;
      const sourceDeductFromStock =
        sourceBill?.skip_stock_calculation !== undefined ?
          !sourceBill.skip_stock_calculation
        : Number(
            sourceBill?.deduct_from_stock ??
              firstChallan?.deduct_from_stock ??
              1,
          ) === 1;
      const getBankSelectionId = (bank) =>
        getEntityId(bank?.bank_id || bank?.bankId) || getEntityId(bank);

      const itemRows = [];
      const itemDetailsMap = {};
      sourceItems.forEach((sourceItem) => {
        const itemId = getEntityId(sourceItem?.item_id || sourceItem);
        if (!itemId) return;

        const rowId = createItemRowId(itemId, itemRows);
        const itemRef = sourceItem?.item_id || {};
        const loadedItem = itemMap[itemId] || toLoadedItemOption(itemRef);
        itemRows.push(rowId);

        itemDetailsMap[rowId] = {
          itemId,
          pcs: sourceItem?.quantity || 1,
          rate: sourceItem?.rate || 0,
          disPercent: sourceItem?.discount || 0,
          spDis: sourceItem?.special_discount || 0,
          itemDiscount: sourceItem?.item_discount || 0,
          itemDis2: sourceItem?.item_dis2 || 0,
          dis3: sourceItem?.dis3 || 0,
          gstPercent: sourceItem?.gst_percent || 0,
          type: normalizeTypeValue(
            sourceItem?.is_gst ?? itemRef?.is_gst,
            effectiveGstType,
          ),
          remark:
            sourceItem?.remark ||
            itemRef?.item_name ||
            itemRef?.name ||
            loadedItem?.name ||
            "",
          itemName:
            itemRef?.item_name || itemRef?.name || loadedItem?.name || "",
          barcode:
            itemRef?.barcode ||
            itemRef?.barcode_no ||
            itemRef?.part_no ||
            loadedItem?.barcode ||
            "",
          stock: loadedItem?.stock ?? 0,
          physicalStock: loadedItem?.physicalStock ?? 0,
          logicalStock: loadedItem?.logicalStock ?? 0,
          _manualDiscountFields: {
            disPercent: true,
            spDis: true,
            dis3: true,
          },
        };
      });

      setBill((prev) => ({
        ...prev,
        contactType: targetContactType,
        party: targetContactId,
        items: itemRows,
        gstType: effectiveGstType,
        deductFromStock: sourceDeductFromStock,
        date: rawDate ? convertDateFromISO(rawDate) : getToday(),
        itemDetails: itemDetailsMap,
        discount: sourceBill?.discount || firstChallan?.discount || 0,
        billNumber: "",
        transportId: getEntityId(sourceBill?.transport_id) || "",
        transportCharge: sourceBill?.transport_charge || 0,
        agent:
          getEntityId(sourceBill?.agent_id || sourceContact?.agent_id) || "",
        customerName:
          sourceBill?.customer_name ||
          (targetContactId ? sourceContact?.name : "") ||
          "",
        vehicleNo:
          sourceBill?.vehicle_no ||
          sourceBill?.vehicle_number ||
          sourceBill?.vehicleNo ||
          "",
        printOption:
          firstChallan?.print_option || sourceBill?.print_option || 2,
        from_bank:
          getBankSelectionId(sourceBill?.from_bank) ||
          getBankSelectionId(firstChallan?.from_bank) ||
          "",
        to_bank:
          getBankSelectionId(sourceBill?.to_bank) ||
          getBankSelectionId(firstChallan?.to_bank) ||
          "",
        labelId:
          getEntityId(firstChallan?.label_id || sourceBill?.label_id) || "",
      }));

      showToast("Bill copied to create screen", "success");
      navigate(location.pathname, { replace: true, state: null });
    };

    hydrateBillClone();
  }, [
    effectiveGstType,
    isEditMode,
    location.pathname,
    location.state,
    navigate,
    showToast,
  ]);

  useEffect(() => {
    if (isEditMode) return;

    const scanPayload = location.state?.aiExtracted;
    const scannedBill = scanPayload?.bill || null;
    const scannedChallan = scannedBill?.challan || {};
    const scannedItems =
      Array.isArray(scanPayload?.items) ? scanPayload.items
      : Array.isArray(scannedBill?.items) ? scannedBill.items
      : Array.isArray(scannedChallan.items) ? scannedChallan.items
      : [];
    if (!scanPayload || scannedItems.length === 0) return;

    const scanSignature = `bill-scan:${location.state?.scanRequestId || scannedItems.map((item) => item?.item_id || item?.barcode || item?.source_item_name || "").join("|")}`;
    if (processedBillScanRef.current === scanSignature) return;
    processedBillScanRef.current = scanSignature;

    const itemRows = [];
    const itemDetailsMap = {};
    let unmatchedItems = 0;

    scannedItems.forEach((scanItem) => {
      const itemId =
        getEntityId(scanItem?.matched_item) ||
        scanItem?.item_id ||
        scanItem?.itemId ||
        "";
      if (!itemId) {
        unmatchedItems += 1;
        return;
      }

      const loadedItem = upsertLoadedItem({
        ...(scanItem?.matched_item || {}),
        _id: itemId,
        id: itemId,
        item_name:
          scanItem?.matched_item?.item_name ||
          scanItem?.source_item_name ||
          scanItem?.matched_item?.name ||
          "",
        barcode:
          scanItem?.matched_item?.barcode || scanItem?.source_barcode || "",
        sale_rate: scanItem?.matched_item?.sale_rate ?? scanItem?.rate ?? 0,
        gst_percent:
          scanItem?.matched_item?.gst_percent ?? scanItem?.gst_percent ?? 0,
        is_gst:
          scanItem?.matched_item?.is_gst ??
          (Number(scanItem?.gst_percent || 0) > 0 ? 1 : effectiveGstType),
      });

      const rowId = createItemRowId(itemId, itemRows);
      itemRows.push(rowId);
      itemDetailsMap[rowId] = {
        itemId,
        pcs: scanItem?.quantity || 1,
        rate: scanItem?.rate || loadedItem?.amount || 0,
        disPercent: scanItem?.discount || 0,
        spDis: scanItem?.special_discount || 0,
        dis3: scanItem?.dis3 || 0,
        itemDiscount: scanItem?.item_discount || 0,
        itemDis2: scanItem?.item_dis2 || 0,
        gstPercent: scanItem?.gst_percent ?? loadedItem?.gst_percent ?? 0,
        type: normalizeTypeValue(
          scanItem?.matched_item?.is_gst ??
            (Number(scanItem?.gst_percent || 0) > 0 ? 1 : effectiveGstType),
          effectiveGstType,
        ),
        remark: scanItem?.source_item_name || loadedItem?.name || "",
        itemName: loadedItem?.name || scanItem?.source_item_name || "",
        barcode: loadedItem?.barcode || scanItem?.source_barcode || "",
        stock: loadedItem?.stock ?? 0,
        physicalStock: loadedItem?.physicalStock ?? 0,
        logicalStock: loadedItem?.logicalStock ?? 0,
        _manualDiscountFields: {
          disPercent: true,
          spDis: true,
          dis3: true,
          itemDiscount: true,
          itemDis2: true,
        },
      };
    });

    setBill((prev) => ({
      ...prev,
      items: itemRows,
      itemDetails: itemDetailsMap,
      gstType: effectiveGstType,
    }));

    if (unmatchedItems > 0) {
      showToast(
        `Bill scanned. ${unmatchedItems} item(s) could not be added.`,
        "warning",
      );
    } else {
      const createdCount = Number(scanPayload?.created_item_count || 0);
      showToast(
        createdCount > 0 ?
          `Bill items scanned. ${createdCount} item(s) created.`
        : "Bill items scanned and filled",
        "success",
      );
    }

    navigate(location.pathname, { replace: true, state: null });
  }, [
    effectiveGstType,
    isEditMode,
    location.pathname,
    location.state,
    navigate,
    showToast,
  ]);

  useEffect(() => {
    const scannerPayload =
      location.state?.scannerPayload ||
      (location.state?.scannedData?.scanType ?
        location.state.scannedData
      : null);
    const scannedValues =
      Array.isArray(scannerPayload?.scannedValues) ?
        scannerPayload.scannedValues
      : [scannerPayload?.rawValue].filter(Boolean);
    const normalizedValues = scannedValues
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const scanSignature = normalizedValues.join("||");

    if (normalizedValues.length === 0) return;
    if (processedRouteScanRef.current === scanSignature) return;

    processedRouteScanRef.current = scanSignature;

    let isActive = true;
    const processScan = async () => {
      let successCount = 0;
      for (const scannedValue of normalizedValues) {
        const handled = await handleScannedItemValue(scannedValue, {
          showSuccessToast: false,
          showErrorToast: true,
        });
        if (handled) successCount += 1;
      }
      if (successCount > 0) {
        showToast(
          `${successCount} scanned item${successCount === 1 ? "" : "s"} added to bill`,
          "success",
        );
      }
      if (isActive) {
        navigate(location.pathname, { replace: true, state: null });
      }
    };

    processScan();

    return () => {
      isActive = false;
    };
  }, [
    handleScannedItemValue,
    location.pathname,
    location.state,
    navigate,
    showToast,
  ]);

  const calculateTotalAmount = () => {
    return bill.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.amount;
    }, 0);
  };

  const getSortedContactsForDropdown = (contacts = []) => {
    const isBookName = (name = "") =>
      ["CASHBOOK", "BANKBOOK"].includes(
        String(name || "")
          .trim()
          .toUpperCase(),
      );

    return [...contacts].sort((a, b) => {
      const aPriority = a?.type === "book" || isBookName(a?.name) ? 0 : 1;
      const bPriority = b?.type === "book" || isBookName(b?.name) ? 0 : 1;

      if (aPriority !== bPriority) return aPriority - bPriority;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  };

  const calculateTotalDiscount = () => {
    return bill.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.totalDiscount;
    }, 0);
  };

  const formatHistoryDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN");
  };

  const fetchItemHistory = async (itemId) => {
    if (isBookSelected) return;
    const contactId = getResolvedContactId();
    if (!contactId) {
      const errorMsg = "Please select contact before loading history";
      showToast(errorMsg, "error");
      setItemHistoryMap((prev) => ({
        ...prev,
        [itemId]: { loading: false, rows: [], error: errorMsg },
      }));
      return;
    }

    setItemHistoryMap((prev) => ({
      ...prev,
      [itemId]: { loading: true, rows: [], error: null },
    }));

    try {
      const params = {};
      params.contact_id = contactId;
      params.is_gst = effectiveGstType;
      const response = await api.get(`/bills/item/${itemId}/last-sold`, {
        params,
      });
      const rows = getResponseList(response);

      setItemHistoryMap((prev) => ({
        ...prev,
        [itemId]: { loading: false, rows, error: null },
      }));
    } catch (error) {
      console.error("Failed to load item history:", error);
      const errorMsg =
        error?.response?.data?.message || "Failed to load item history";
      showToast(errorMsg, "error");
      setItemHistoryMap((prev) => ({
        ...prev,
        [itemId]: { loading: false, rows: [], error: errorMsg },
      }));
    }
  };

  const ensureItemHistoryOpen = (rowId, baseItemIdParam = null) => {
    if (isBookSelected) return;
    if (!rowId) return;
    const baseItemId = baseItemIdParam || getRowBaseItemId(rowId);
    if (!baseItemId) return;

    if (expandedItemId !== rowId) {
      setExpandedItemId(rowId);
    }

    if (!getResolvedContactId()) {
      setItemHistoryMap((prev) => {
        const existing = prev[baseItemId];
        if (existing?.loading) return prev;
        if (Array.isArray(existing?.rows) && existing.rows.length) return prev;
        if (existing?.error) return prev;
        return {
          ...prev,
          [baseItemId]: {
            loading: false,
            rows: [],
            error: "Select party/supplier to view history.",
          },
        };
      });
      return;
    }

    if (itemHistoryInFlightRef.current.has(baseItemId)) return;

    if (
      !itemHistoryMap[baseItemId]?.rows?.length &&
      !itemHistoryMap[baseItemId]?.loading
    ) {
      itemHistoryInFlightRef.current.add(baseItemId);
      fetchItemHistory(baseItemId).finally(() => {
        itemHistoryInFlightRef.current.delete(baseItemId);
      });
    }
  };

  const handleToggleHistory = async (rowId) => {
    if (isBookSelected) return;
    if (expandedItemId === rowId) {
      setExpandedItemId(null);
      return;
    }
    ensureItemHistoryOpen(rowId);
  };

  const LEGACY_handlePrint = () => {
    if (!bill.party || bill.items.length === 0) {
      showToast("Please select a party and add items before printing", "error");
      return;
    }

    const party =
      bill.contactType === "party" ?
        loadedParties.find((c) => c.id === bill.party)
      : bill.contactType === "supplier" ?
        loadedSuppliers.find((c) => c.id === bill.party)
      : null;

    const printContent = `
      <html>
        <head>
          <title>Bill</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 40px;
              font-size: 12px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
            }
            .header h1 {
              margin: 0;
              font-size: 24px;
            }
            .header p {
              margin: 5px 0;
              font-size: 11px;
            }
            .info-section {
              margin-bottom: 20px;
            }
            .info-row {
              display: flex;
              margin-bottom: 5px;
            }
            .info-label {
              font-weight: bold;
              width: 100px;
            }
            .info-value {
              flex: 1;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin: 20px 0;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: left;
              font-size: 11px;
            }
            th {
              background-color: #f0f0f0;
              font-weight: bold;
            }
            .amount-section {
              margin-top: 20px;
              display: flex;
              justify-content: flex-end;
            }
            .amount-box {
              width: 250px;
            }
            .amount-row {
              display: flex;
              justify-content: space-between;
              padding: 5px 0;
              border-bottom: 1px solid #ccc;
            }
            .amount-total {
              display: flex;
              justify-content: space-between;
              padding: 8px 0;
              border-top: 2px solid #000;
              font-weight: bold;
              font-size: 13px;
            }
            .footer {
              margin-top: 40px;
              display: flex;
              justify-content: space-between;
            }
            .signature {
              width: 180px;
              text-align: center;
              border-top: 1px solid #000;
              padding-top: 40px;
              margin-top: 20px;
            }
            @media print {
              body { margin: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>BILL</h1>
            <p>${selectedFirm?.name || "Company Name"}</p>
            <p>Bill No: ${bill.billNumber}</p>
          </div>

          <div class="info-section">
            <div class="info-row">
              <div class="info-label">Date:</div>
              <div class="info-value">${new Date(bill.date).toLocaleDateString("en-IN")}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Party:</div>
              <div class="info-value">${party?.name || ""}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Type:</div>
              <div class="info-value">${effectiveGstType === 1 ? "GST" : "Non-GST"}</div>
            </div>
            ${
              bill.customerName ?
                `
            <div class="info-row">
              <div class="info-label">Customer:</div>
              <div class="info-value">${bill.customerName}</div>
            </div>`
              : ""
            }
            ${
              bill.vehicleNo ?
                `
            <div class="info-row">
              <div class="info-label">Vehicle No:</div>
              <div class="info-value">${bill.vehicleNo}</div>
            </div>`
              : ""
            }
          </div>

          <table>
            <thead>
              <tr>
                <th>S.No</th>
                ${bill.printOption === 2 ? "<th>Item Name</th>" : "<th>Item Code</th>"}
                <th>Qty</th>
                <th>Rate</th>
                <th>Discount %</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${bill.items
                .map((itemId, index) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = bill.itemDetails[itemId] || {};
                  const calc = calculateItemAmount(itemId);

                  return `
                  <tr>
                    <td>${index + 1}</td>
                    ${
                      bill.printOption === 2 ?
                        `<td>${item?.name || "Unknown"}</td>`
                      : `<td>${item?.item_id || item?.part_no || item?.barcode || "-"}</td>`
                    }
                    <td>${details.pcs || 1}</td>
                    <td>₹${parseFloat(details.rate || 0).toFixed(2)}</td>
                    <td>${details.disPercent || 0}%</td>
                    <td>₹${calc.amount.toFixed(2)}</td>
                  </tr>
                `;
                })
                .join("")}
            </tbody>
          </table>

          <div class="amount-section">
            <div class="amount-box">
              <div class="amount-row">
                <span>Discount:</span>
                <span>₹${round2(calculateTotalDiscount())}</span>
              </div>
              ${
                bill.transportCharge ?
                  `
              <div class="amount-row">
                <span>Transport:</span>
                <span>₹${parseFloat(bill.transportCharge).toFixed(2)}</span>
              </div>`
                : ""
              }
              <div class="amount-total">
                <span>Total Amount:</span>
                <span>₹${roundNetAmount(calculateTotalAmount())}</span>
              </div>
            </div>
          </div>

          <div class="footer">
            <div class="signature">
              <p>Authorized Signature</p>
            </div>
            <div class="signature">
              <p>Party Signature</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const printWindow = window.open("", "_blank", "width=800,height=600");
    printWindow.document.write(printContent);
    printWindow.document.close();

    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handlePrint = async () => {
    const contactId = getResolvedContactId();
    if (!contactId || bill.items.length === 0) {
      showToast(
        "Please select a contact and add items before printing",
        "error",
      );
      return;
    }

    let party = getResolvedContact();
    const fetchedParty = await fetchPartyDetails(contactId);
    if (fetchedParty) {
      party = { ...party, ...fetchedParty };
    }
    const transport = loadedTransports.find((t) => t.id === bill.transportId);
    const agent = loadedAgents.find((a) => a.id === bill.agent);
    const fromBank = loadedBanks.find((bank) => bank.id === bill.from_bank);

    let lastPaymentDate = "N/A";
    let lastPaymentAmount = 0;
    try {
      if (contactId) {
        const paymentRes = await api.get(`/transactions/last-payment`, {
          params: {
            contact_id: contactId,
            is_gst: effectiveGstType === 1 ? 1 : 0,
          },
        });
        const paymentData = getResponseData(paymentRes);
        if (paymentData?.last_payment_date) {
          const date = new Date(paymentData.last_payment_date);
          if (!Number.isNaN(date.getTime())) {
            const dd = String(date.getDate()).padStart(2, "0");
            const mm = String(date.getMonth() + 1).padStart(2, "0");
            const yyyy = date.getFullYear();
            lastPaymentDate = `${dd}-${mm}-${yyyy}`;
          }
        }
        if (
          paymentData?.last_payment_amount !== undefined &&
          paymentData?.last_payment_amount !== null
        ) {
          lastPaymentAmount = Number(paymentData.last_payment_amount) || 0;
        }
      }
    } catch (error) {
      console.error("Failed to fetch last payment:", error);
    }

    const toMandatoryText = (val) => String(val || "--").trim();
    const formatDateDDMMYYYY = (value) => {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return "";
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = String(date.getFullYear());
      return `${dd}-${mm}-${yyyy}`;
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
    const firmName = resolvedFirm.name || "Firm";
    const firmAddress = resolvedFirm.address || "";
    const firmPhone = resolvedFirm.phone || "";
    const firmEmail = resolvedFirm.email || "";
    const firmGstin = resolvedFirm.gstin || "";
    let invoiceTitle = "TAX INVOICE";
    if (bill.contactType === "supplier") invoiceTitle = "PURCHASE TAX INVOICE";
    else if (bill.contactType === "party") invoiceTitle = "SALE TAX INVOICE";
    // 'me' will default to TAX INVOICE but you can adjust if needed
    const billNo = String(bill.billNumber || "").trim();
    const financialYear = getFinancialYearLabel(bill.date || new Date());
    const invoiceDate =
      formatDateDDMMYYYY(bill.date) || formatDateDDMMYYYY(new Date());
    const printOption = Number(bill.printOption ?? 2) || 2;

    const receiverName = party?.name || "CASH BOOK";
    const receiverAddress = party?.address || "";
    const receiverCity = party?.city || "";
    const receiverPin = party?.pin || "";
    const receiverPhone = party?.phone || "";
    const receiverGstin = party?.gstin || "";
    const receiverPan = party?.pan || "";
    const receiverState = party?.state || "";
    const receiverStateCode = party?.state_code || "";

    const consigneeName = receiverName;
    const consigneeAddress = receiverAddress;
    const consigneeCity = receiverCity;
    const consigneePin = receiverPin;
    const consigneeGstin = receiverGstin;
    const consigneePan = receiverPan;
    const consigneeState = receiverState;
    const consigneeStateCode = receiverStateCode;
    const transportName = transport?.name || party?.transport || "";
    const brokerName =
      agent?.name ||
      (typeof party?.agent === "object" ? party?.agent?.name : party?.agent) ||
      "";

    const hideDiscountColumns =
      localStorage.getItem("hide_discount_columns") !== "false";

    const itemRows = bill.items.map((itemId, index) => {
      const item = getLoadedItemByRowId(itemId) || {};
      const details = bill.itemDetails[itemId] || {};
      const calc = calculateItemAmount(itemId);
      const itemName = details.itemName || item?.name || "Item";
      const itemCode =
        details.itemCode ||
        item?.item_id ||
        item?.itemId ||
        item?.part_no ||
        item?.barcode ||
        "-";
      const remark = details.remark || "";
      const description = printOption === 2 ? remark || itemName : itemCode;
      const hsn =
        item?.hsn_id?.hsn_code || item?.hsn_number || item?.hsn_code || "--";
      const qty = Number(details.pcs || 1);
      const rate = Number(details.rate || 0);
      const disPercent = Number(details.disPercent || 0);
      const spDis = Number(details.spDis || 0);
      const itemDiscount = Number(details.itemDiscount || 0);
      const itemDis2 = Number(details.itemDis2 || 0);
      const dis3 = Number(details.dis3 || 0);
      const taxable = calc.taxableAmount;
      const gstPercent = Number(details.gstPercent || 0);
      const gstAmount = calc.gstAmount;
      const amount = calc.amount;
      const netRate = qty > 0 ? amount / qty : 0;

      return hideDiscountColumns ?
          [
            String(index + 1),
            description,
            hsn,
            qty.toFixed(0),
            rate.toFixed(2),
            calc.totalDiscount.toFixed(2),
            netRate.toFixed(2),
            taxable.toFixed(2),
            gstPercent.toFixed(2),
            gstAmount.toFixed(2),
            amount.toFixed(2),
          ]
        : [
            String(index + 1),
            description,
            hsn,
            qty.toFixed(0),
            rate.toFixed(2),
            disPercent.toFixed(2),
            spDis.toFixed(2),
            itemDiscount.toFixed(2),
            itemDis2.toFixed(2),
            dis3.toFixed(2),
            netRate.toFixed(2),
            taxable.toFixed(2),
            gstPercent.toFixed(2),
            gstAmount.toFixed(2),
            amount.toFixed(2),
          ];
    });

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
      { align: "center" },
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
      `Transport : ${toMandatoryText(transportName)}`,
      rightX,
      baseLineY,
    );
    doc.text(
      `Vehicle No. : ${toMandatoryText(bill.vehicleNo)}`,
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
    if (effectiveGstType === 1) {
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
    if (effectiveGstType === 1) {
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
    doc.text(`Order No : ${toMandatoryText("")}`, margin + 1.8, cursorY + 5.3);
    doc.text(
      `Broker : ${toMandatoryText(brokerName)}`,
      splitX + 1.8,
      cursorY + 5.3,
    );
    cursorY += 8;

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
          "Tax %",
          "Tax.Amt.",
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
          "Tax %",
          "Tax.Amt.",
          "Amount",
        ];

    const fallbackRow =
      hideDiscountColumns ?
        [
          "1",
          "--",
          "--",
          "0",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
        ]
      : [
          "1",
          "--",
          "--",
          "0",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
          "0.00",
        ];

    const colWidths =
      hideDiscountColumns ?
        {
          0: { cellWidth: 8, halign: "center" },
          1: { cellWidth: 66, halign: "left" },
          2: { cellWidth: 14, halign: "left" },
          3: { cellWidth: 10, halign: "right" },
          4: { cellWidth: 14, halign: "right" },
          5: { cellWidth: 14, halign: "right" },
          6: { cellWidth: 15, halign: "right" },
          7: { cellWidth: 15, halign: "right" },
          8: { cellWidth: 11, halign: "right" },
          9: { cellWidth: 15, halign: "right" },
          10: { cellWidth: 16, halign: "right" },
        }
      : {
          0: { cellWidth: 7, halign: "center" },
          1: { cellWidth: 42, halign: "left" },
          2: { cellWidth: 14, halign: "left" },
          3: { cellWidth: 10, halign: "right" },
          4: { cellWidth: 14, halign: "right" },
          5: { cellWidth: 9, halign: "right" },
          6: { cellWidth: 9, halign: "right" },
          7: { cellWidth: 10, halign: "right" },
          8: { cellWidth: 10, halign: "right" },
          9: { cellWidth: 10, halign: "right" },
          10: { cellWidth: 14, halign: "right" },
          11: { cellWidth: 10, halign: "right" },
          12: { cellWidth: 14, halign: "right" },
          13: { cellWidth: 9, halign: "right" },
          14: { cellWidth: 16, halign: "right" },
        };

    autoTable(doc, {
      head: [headers],
      body: itemRows.length ? itemRows : [fallbackRow],
      startY: cursorY,
      margin: { left: margin, right: margin },
      tableWidth: contentWidth,
      theme: "grid",
      showHead: "everyPage",
      didDrawPage: () => {
        drawPageBorder();
      },
      styles: {
        font: "times",
        fontSize: hideDiscountColumns ? 8 : 7,
        lineColor: [0, 0, 0],
        lineWidth: 0.25,
        minCellHeight: 6,
        cellPadding: { top: 1.5, right: 1.2, bottom: 1.5, left: 1.2 },
      },
      headStyles: {
        fillColor: headerFill,
        textColor: blue,
        fontStyle: "bold",
        fontSize: hideDiscountColumns ? 8.2 : 7.2,
        halign: "center",
        valign: "middle",
        cellPadding: { top: 3, right: 1.2, bottom: 3, left: 1.2 },
      },
      columnStyles: colWidths,
    });

    const formatAmount = (val) => Number(val || 0).toFixed(2);
    const totalQty = bill.items.reduce(
      (sum, itemId) => sum + Number(bill.itemDetails[itemId]?.pcs || 1),
      0,
    );
    const totalBeforeTax = bill.items.reduce(
      (sum, itemId) => sum + calculateItemAmount(itemId).taxableAmount,
      0,
    );
    const taxTotal = bill.items.reduce(
      (sum, itemId) => sum + calculateItemAmount(itemId).gstAmount,
      0,
    );
    const totalAmount = calculateTotalAmount();
    const isGstBill = effectiveGstType === 1;
    const sgstAmount = isGstBill ? taxTotal / 2 : 0;
    const cgstAmount = isGstBill ? taxTotal / 2 : 0;
    const igstAmount = !isGstBill ? taxTotal : 0;
    const transportCharge = Number(bill.transportCharge || 0);
    const firmPan = resolvedFirm.pan || "";
    const bankName = fitTextSingleLine(
      `Bank Name: ${fromBank?.bank_name || resolvedFirm.bank_name || "HDFC BANK"}`,
      52,
    );
    const bankAccountNo = fitTextSingleLine(
      `A/c No: ${fromBank?.account_number || resolvedFirm.account_number || "1234567890"}`,
      52,
    );

    const numberToWords = (num) => {
      const ones = [
        "",
        "One",
        "Two",
        "Three",
        "Four",
        "Five",
        "Six",
        "Seven",
        "Eight",
        "Nine",
      ];
      const tens = [
        "",
        "",
        "Twenty",
        "Thirty",
        "Forty",
        "Fifty",
        "Sixty",
        "Seventy",
        "Eighty",
        "Ninety",
      ];
      const teens = [
        "Ten",
        "Eleven",
        "Twelve",
        "Thirteen",
        "Fourteen",
        "Fifteen",
        "Sixteen",
        "Seventeen",
        "Eighteen",
        "Nineteen",
      ];
      if (num === 0) return "Zero";
      if (num < 10) return ones[num];
      if (num < 20) return teens[num - 10];
      if (num < 100)
        return (
          tens[Math.floor(num / 10)] + (num % 10 ? " " + ones[num % 10] : "")
        );
      if (num < 1000)
        return (
          ones[Math.floor(num / 100)] +
          " Hundred" +
          (num % 100 ? " " + numberToWords(num % 100) : "")
        );
      if (num < 100000)
        return (
          numberToWords(Math.floor(num / 1000)) +
          " Thousand" +
          (num % 1000 ? " " + numberToWords(num % 1000) : "")
        );
      if (num < 10000000)
        return (
          numberToWords(Math.floor(num / 100000)) +
          " Lakh" +
          (num % 100000 ? " " + numberToWords(num % 100000) : "")
        );
      return (
        numberToWords(Math.floor(num / 10000000)) +
        " Crore" +
        (num % 10000000 ? " " + numberToWords(num % 10000000) : "")
      );
    };
    const printNetAmount = roundNetAmount(
      isGstBill ? totalAmount : totalAmount + transportCharge,
    );
    const amountInWords = numberToWords(printNetAmount) + " Rupees Only";
    const netPreviewAmount = printNetAmount;
    const rawPartyBalance =
      Number(
        party?.balance ??
          party?.ledger_balance ??
          party?.closing_balance ??
          party?.outstanding_balance ??
          party?.due_amount ??
          0,
      ) || 0;
    const ledgerBalance = await resolveLdBalanceAmount({
      apiClient: api,
      contactId,
      currentAmount: printNetAmount,
      currentBillId: isEditMode ? id : "",
      contactBalance: rawPartyBalance,
    });

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
      const compactRows = bill.items.map((itemId) => {
        const item = getLoadedItemByRowId(itemId) || {};
        const details = bill.itemDetails[itemId] || {};
        const calc = calculateItemAmount(itemId);
        const itemName = details.itemName || item?.name || "Item";
        const itemCode =
          details.itemCode ||
          item?.item_id ||
          item?.itemId ||
          item?.part_no ||
          item?.barcode ||
          "-";
        const remark = details.remark || "";
        const description = printOption === 2 ? remark || itemName : itemCode;

        return [
          description || "--",
          String(details.pcs || 0),
          formatAmount(details.rate || 0),
          formatAmount(details.disPercent || 0),
          formatAmount(details.spDis || 0),
          formatAmount(calc.amount / (Number(details.pcs || 1) || 1)),
          formatAmount(calc.amount),
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
        String(firmName || "MAHESHWARI MOTORS").toUpperCase(),
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
        firmAddress,
        compactContentWidth - 12,
      );
      if (compactFirmAddress.length > 0) {
        compactDoc.text(
          compactFirmAddress.slice(0, 1),
          compactX + compactContentWidth / 2,
          compactY + 7.6,
          { align: "center" },
        );
      }
      compactDoc.setFontSize(7.5);
      compactDoc.text(
        `Ph., ${toMandatoryText(firmPhone)}`,
        compactX + compactContentWidth / 2,
        compactY + 11.0,
        { align: "center" },
      );
      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(10.0);
      compactDoc.text(
        `GSTIN : ${firmGstin || "APPLY FOR REGISTRATION"}`,
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
      compactDoc.setTextColor(...compactBlue);
      compactDoc.text(`M/s. : ${receiverName}`, compactX + 2, compactY + 5);
      compactDoc.setFont("times", "normal");
      compactDoc.setFontSize(8.5);
      compactDoc.setTextColor(0, 0, 0);
      compactDoc.text(
        compactDoc
          .splitTextToSize(
            receiverAddress || receiverCity,
            compactContentWidth * 0.52,
          )
          .slice(0, 2),
        compactX + 9,
        compactY + 9.5,
      );
      compactDoc.text(
        `City --${receiverCity || ""}--  Contact No.${receiverPhone || ""}`,
        compactX + 9,
        compactY + 18,
      );

      compactDoc.setFont("times", "bold");
      compactDoc.setFontSize(9.5);
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
        `Vehicle No : ${toMandatoryText(bill.vehicleNo, "")}`,
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
      compactDoc.text(
        String(Math.round(totalQty)),
        columnStarts[2] - 1.2,
        compactSummaryY + 5.5,
        {
          align: "right",
        },
      );
      compactDoc.text(
        formatAmount(netPreviewAmount),
        compactX + compactContentWidth - 1.2,
        compactSummaryY + 5.5,
        { align: "right" },
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
        formatAmount(netPreviewAmount),
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
        compactFooterY + 36.8,
        {
          align: "right",
        },
      );
      if (signatureImage) {
        try {
          let imgWidth = 38;
          let imgHeight = 12;
          try {
            const props = compactDoc.getImageProperties(signatureImage);
            const aspect = props.width / props.height;
            const maxW = 38;
            const maxH = 12;
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
            compactFooterY + 39,
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
        { align: "right" },
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

      const previewUrl = compactDoc.output("bloburl");
      const previewWindow = window.open(previewUrl, "_blank");
      if (!previewWindow) {
        showToast(
          "Popup blocked. Please allow popups for print preview.",
          "error",
        );
      }
      return;
    }

    let summaryY = (doc.lastAutoTable?.finalY || cursorY) + 6;
    const totalRowHeight = 13;
    const midBlockHeight = 32;
    const wordsRowHeight = 8;
    const termsBlockHeight = 33;
    // Dynamic breakdown height: title(8) + taxable(5.2) + optional rows + net(8) + padding(4)
    const breakdownRows =
      1 + (isGstBill ? 2 : 0) + (transportCharge > 0 ? 1 : 0);
    const amountBreakdownHeight = 8 + breakdownRows * 5.2 + 12;
    const signatureHeight = 30;
    const summaryHeight =
      totalRowHeight + midBlockHeight + wordsRowHeight + termsBlockHeight;

    if (summaryY + summaryHeight > pageHeight - margin - 1) {
      doc.addPage();
      drawPageBorder();
      summaryY = margin + 8;
    }

    const summaryRightX = margin + contentWidth;
    const tableColumnWidths =
      hideDiscountColumns ?
        [8, 66, 14, 10, 14, 14, 15, 15, 11, 15, 16]
      : [7, 42, 14, 10, 14, 9, 9, 10, 10, 10, 14, 10, 14, 9, 16];
    const columnRightEdges = [];
    let runningX = margin;
    tableColumnWidths.forEach((width) => {
      runningX += width;
      columnRightEdges.push(runningX);
    });

    doc.setFillColor(...headerFill);
    doc.rect(margin, summaryY, contentWidth, totalRowHeight, "FD");
    doc.setFont("times", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...blue);
    const totalLabelCenter =
      margin +
      (tableColumnWidths[0] + tableColumnWidths[1] + tableColumnWidths[2]) / 2;
    doc.text("TOTAL :", totalLabelCenter, summaryY + 5.3, { align: "center" });
    doc.text(
      String(Math.round(totalQty)),
      columnRightEdges[3] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      formatAmount(totalBeforeTax),
      columnRightEdges[hideDiscountColumns ? 7 : 11] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      formatAmount(taxTotal),
      columnRightEdges[hideDiscountColumns ? 9 : 13] - 1.2,
      summaryY + 5.3,
      { align: "right" },
    );
    doc.text(
      formatAmount(totalAmount),
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
    doc.text(bankName, margin + 1.8, midBlockY + 8);
    doc.text(bankAccountNo, margin + 1.8, midBlockY + 16);
    doc.text(`PAN No. : ${firmPan}`, margin + 1.8, midBlockY + 24);

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

    doc.setFont("times", "normal");
    doc.setFontSize(8.2);
    doc.setTextColor(...blue);
    const taxHeaders = ["Tax%", "Taxable%", "SGST", "CGST", "Tax Amt."];
    taxHeaders.forEach((header, idx) => {
      const centerX = taxColumnStarts[idx] + taxColumnWidths[idx] / 2;
      doc.text(header, centerX, midBlockY + 8, { align: "center" });
    });
    doc.text(
      isGstBill ? "18.00" : "0.00",
      taxColumnEnds[0] - 0.8,
      midBlockY + 16,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(totalBeforeTax)),
      taxColumnEnds[1] - 0.8,
      midBlockY + 16,
      { align: "right" },
    );
    doc.text(String(formatAmount(sgstAmount)), taxColumnEnds[2] - 0.8, midBlockY + 16, {
      align: "right",
    });
    doc.text(String(formatAmount(cgstAmount)), taxColumnEnds[3] - 0.8, midBlockY + 16, {
      align: "right",
    });
    doc.text(String(formatAmount(taxTotal)), taxColumnEnds[4] - 0.8, midBlockY + 16, {
      align: "right",
    });

    doc.setFont("times", "bold");
    doc.text("* TOTAL :", taxColumnStarts[0], midBlockY + 24);
    doc.text(
      String(formatAmount(totalBeforeTax)),
      taxColumnEnds[1] - 0.8,
      midBlockY + 24,
      { align: "right" },
    );
    doc.text(String(formatAmount(sgstAmount)), taxColumnEnds[2] - 0.8, midBlockY + 24, {
      align: "right",
    });
    doc.text(String(formatAmount(cgstAmount)), taxColumnEnds[3] - 0.8, midBlockY + 24, {
      align: "right",
    });
    doc.text(String(formatAmount(taxTotal)), taxColumnEnds[4] - 0.8, midBlockY + 24, {
      align: "right",
    });

    const rightLabelX = splitInfoX + 2;
    const rightRateRightX = summaryRightX - 15;
    const rightAmountRightX = summaryRightX - 1.6;
    doc.setTextColor(0, 0, 0);
    doc.setFont("times", "bold");
    doc.setFontSize(8.2);
    doc.text("Total Amount before Tax :", rightLabelX, midBlockY + 8);
    doc.text(String(formatAmount(totalBeforeTax)), rightAmountRightX, midBlockY + 8, {
      align: "right",
    });
    if (transportCharge > 0) {
      doc.text("Transport Charge :", rightLabelX, midBlockY + 12.5);
      doc.text(
        String(formatAmount(transportCharge)),
        rightAmountRightX,
        midBlockY + 12.5,
        {
          align: "right",
        },
      );
    }
    doc.text("+ SGST", rightLabelX, midBlockY + 16);
    doc.text(
      isGstBill ? "9.000 %" : "0.000 %",
      rightRateRightX,
      midBlockY + 16,
      { align: "right" },
    );
    doc.text(String(formatAmount(sgstAmount)), rightAmountRightX, midBlockY + 16, {
      align: "right",
    });
    doc.text(isGstBill ? "+ CGST" : "+ IGST", rightLabelX, midBlockY + 24);
    doc.text(
      isGstBill ? "9.000 %" : "18.000 %",
      rightRateRightX,
      midBlockY + 24,
      { align: "right" },
    );
    doc.text(
      String(formatAmount(isGstBill ? cgstAmount : igstAmount)),
      rightAmountRightX,
      midBlockY + 24,
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
      String(printNetAmount),
      summaryRightX - 1.8,
      wordsY + actualWordsRowHeight / 2 + 1.5,
      {
        align: "right",
      },
    );

    const termsY = wordsY + actualWordsRowHeight;
    const termsSplitX = margin + contentWidth * 0.56;
    const availableFooter = pageHeight - margin - termsY;
    const footerHeight = Math.max(termsBlockHeight, availableFooter);
    const rightColX = termsSplitX;
    const rightColWidth = summaryRightX - rightColX;

    doc.setTextColor(0, 0, 0);
    doc.rect(margin, termsY, contentWidth, footerHeight);
    doc.line(termsSplitX, termsY, termsSplitX, termsY + footerHeight);

    // Left: Terms & Conditions
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

    const isBook = party && (
      String(party.type || "").toLowerCase() === "book" ||
      ["CASHBOOK", "BANKBOOK"].includes(String(party.name || "").trim().toUpperCase())
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

    // Right top: Electronic Reference + Certified line
    doc.setFont("times", "bold");
    doc.setFontSize(8.8);
    doc.setTextColor(0, 0, 0);
    doc.text("Electronic Reference Number", termsSplitX + 2, termsY + 5.2);
    const rightSectionWidth = summaryRightX - termsSplitX - 3.5;
    const certLine = fitTextSingleLine(
      "Certified That Particulars Given Above Are True And Correct",
      rightSectionWidth,
    );
    doc.text(certLine, termsSplitX + 2, termsY + 10.2);

    // --- Amount Breakdown box ---
    const abRowH = 4;
    const abRows = 1 + (isGstBill ? 2 : 0) + (transportCharge > 0 ? 1 : 0);
    const abBoxTitleH = 8;
    const abBoxNetH = 11;
    const abBoxPadB = 1;
    const abBoxH = abBoxTitleH + abRows * abRowH + abBoxNetH + abBoxPadB;

    const signatureLineY = termsY + footerHeight - signatureHeight;
    const amountBoxY = termsY + 16;
    const amountBoxActualH = abBoxH;
    const amountBoxX = rightColX;
    const amountBoxW = rightColWidth;

    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(amountBoxX, amountBoxY, amountBoxW, amountBoxActualH);

    // Title
    doc.setFont("times", "bold");
    doc.setFontSize(8);
    doc.setTextColor(...blue);
    doc.text("Amount Breakdown", amountBoxX + amountBoxW / 2, amountBoxY + 5, {
      align: "center",
    });
    doc.setDrawColor(...blue);
    doc.setLineWidth(0.2);
    doc.line(
      amountBoxX + 1,
      amountBoxY + 6.5,
      amountBoxX + amountBoxW - 1,
      amountBoxY + 6.5,
    );

    const abLabelX = amountBoxX + 2;
    const abValueX = amountBoxX + amountBoxW - 2;
    let abY = amountBoxY + abBoxTitleH + 2;

    const drawAbRow = (label, value, bold = false) => {
      doc.setFont("times", bold ? "bold" : "normal");
      doc.setFontSize(bold ? 8 : 7.5);
      doc.setTextColor(...(bold ? blue : [0, 0, 0]));
      doc.text(label, abLabelX, abY);
      doc.text(value, abValueX, abY, { align: "right" });
      abY += abRowH;
    };

    drawAbRow("Taxable Amount", formatAmount(totalBeforeTax));
    if (isGstBill) {
      drawAbRow("SGST (9%)", formatAmount(sgstAmount));
      drawAbRow("CGST (9%)", formatAmount(cgstAmount));
    }
    if (transportCharge > 0) {
      drawAbRow("Transport Charge", formatAmount(transportCharge));
    }

    // Separator line then Net Amount inside the box
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.3);
    doc.line(abLabelX, abY + 0.5, abValueX, abY + 0.5);
    abY += 3;
    drawAbRow("Net Amount", String(printNetAmount), true);

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

    const previewUrl = doc.output("bloburl");
    const previewWindow = window.open(previewUrl, "_blank");
    if (!previewWindow) {
      showToast(
        "Popup blocked. Please allow popups for print preview.",
        "error",
      );
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    const contactId = getResolvedContactId();
    if (!contactId) {
      showToast(
        bill.contactType === "me" ?
          "Cash book contact not found"
        : "Please select a contact",
        "error",
      );
      return;
    }
    if (bill.contactType === "me" && !String(bill.customerName || "").trim()) {
      showToast("Please enter name", "error");
      return;
    }
    if (bill.items.length === 0) {
      showToast("Please add at least one item", "error");
      return;
    }
    const numberValidationError = validateBillNumbers();
    if (numberValidationError) {
      showToast(numberValidationError, "error");
      return;
    }

    try {
      setIsSaving(true);
      const selectedParty = getResolvedContact();
      const resolvedContactType =
        bill.contactType === "me" ? "book" : bill.contactType || "party";

      const grossTotal = round2(
        bill.items.reduce(
          (sum, itemId) => sum + calculateItemAmount(itemId).grossAmount,
          0,
        ),
      );
      const subTotal = round2(
        bill.items.reduce(
          (sum, itemId) => sum + calculateItemAmount(itemId).amount,
          0,
        ),
      );
      const netAmount = roundNetAmount(calculateTotalAmount());
      const resolvedDeductFromStock =
        effectiveGstType === 1 && bill.contactType === "party" ?
          bill.deductFromStock ?
            1
          : 0
        : 1;

      // Create challan
      const challanPayload = {
        is_bill: true,
        challan_type: "sale",
        date: convertDateToISO(bill.date),
        contact_id: contactId,
        is_gst: effectiveGstType,
        label_id:
          bill.labelId && /^[a-f\d]{24}$/i.test(bill.labelId) ?
            bill.labelId
          : undefined,
        print_option: Number(bill.printOption ?? 2) || 2,
        gross_total: grossTotal,
        sub_total: subTotal,
        discount: 0,
        amount: netAmount,
        deduct_from_stock: resolvedDeductFromStock,
        items: bill.items.map((itemId) => {
          const item = getLoadedItemByRowId(itemId);
          const baseItemId = getRowBaseItemId(itemId);
          const details = bill.itemDetails[itemId] || {};
          const calc = calculateItemAmount(itemId);
          const fallbackDis3 = getLabelItemDiscount(
            bill.labelId,
            item,
            baseItemId,
          );
          const parsedDis3 = parseFloat(details.dis3 ?? 0);
          const resolvedDis3 =
            Number.isFinite(parsedDis3) && parsedDis3 > 0 ?
              parsedDis3
            : fallbackDis3;
          return {
            item_id: baseItemId,
            quantity: parseFloat(details.pcs || 1),
            rate: Math.max(0, parseFloat(details.rate || item?.amount || 0)),
            discount: Math.max(0, parseFloat(details.disPercent || 0)),
            special_discount: Math.max(0, parseFloat(details.spDis || 0)),
            item_discount: Math.max(0, parseFloat(details.itemDiscount || 0)),
            item_dis2: Math.max(0, parseFloat(details.itemDis2 || 0)),
            dis3: round2(Math.max(0, resolvedDis3)),
            gst_percent: Math.max(0, parseFloat(details.gstPercent || 0)),
            gross_amount: round2(calc.grossAmount),
            discount_amount: round2(calc.discountAmount),
            total_discount: round2(calc.totalDiscount),
            taxable_amount: round2(calc.taxableAmount),
            gst_amount: round2(calc.gstAmount),
            amount: round2(calc.amount),
            is_gst: normalizeTypeValue(details.type, effectiveGstType),
          };
        }),
      };

      const requestedBillNo = String(bill.billNumber || "").trim();
      const shouldUseAutoBillNo =
        requestedBillNo && requestedBillNo === lastSuggestedBillNoRef.current;

      const billPayload = {
        contact_id: contactId,
        contact_type: resolvedContactType,
        date: convertDateToISO(bill.date),
        amount: netAmount,
        bill_no: shouldUseAutoBillNo ? undefined : requestedBillNo || undefined,
        transport_id: bill.transportId || undefined,
        transport_charge: parseFloat(bill.transportCharge) || 0,
        customer_name: bill.customerName || undefined,
        vehicle_no: bill.vehicleNo || undefined,
        deduct_from_stock: resolvedDeductFromStock,
      };

      if (isEditMode) {
        // Fetch existing bill to get challan IDs
        const existingBillRes = await api.get(`/bills/${id}`);
        const existingBill = getResponseData(existingBillRes) || {};
        const paidAmount = Number(existingBill?.paid_amount || 0);
        if (paidAmount > 0) {
          throw new Error(
            "Bill cannot be edited after payment has been recorded",
          );
        }
        const existingChallans =
          Array.isArray(existingBill?.challan_ids) ?
            existingBill.challan_ids
          : [];
        const existingChallanId = getLinkedChallanId(existingChallans[0]);
        if (!existingChallanId) {
          throw new Error("Linked challan not found for this bill");
        }
        await api.put(`/challans/${existingChallanId}`, {
          ...challanPayload,
          bill_id: id,
        });
        await api.put(`/bills/${id}`, {
          ...billPayload,
          amount: netAmount,
          challan_ids: existingBill?.challan_ids,
        });
        showToast("Bill updated successfully", "success");
      } else {
        const challanRes = await api.post("/challans", challanPayload);
        const challanId = challanRes.data?.data?._id;
        if (!challanId) throw new Error("Failed to create challan");
        await api.post("/bills", { ...billPayload, challan_ids: [challanId] });
        showToast("Bill created successfully", "success");
      }
      navigate("/transactions/bill-list");
    } catch (error) {
      console.error("Error:", error);
      console.error("Backend error:", error.response?.data);
      const errorMsg =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Failed to create bill";
      showToast(errorMsg, "error");
    } finally {
      setIsSaving(false);
    }
  };

  useSaveShortcut(handleSave);

  return (
    <div
      className="space-y-4"
      ref={billFormRef}
      onKeyDown={handleBillFormKeyDown}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-gray-900">
            {isEditMode ? "Edit Bill" : "Create Bill"}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsScanModalOpen(true)}
            className="flex items-center gap-2"
          >
            <FaCamera />
            Scan Bill
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/transactions/bill-list")}
          >
            Back to List
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 bg-blue-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Type *
            </label>
            <select
              ref={firstFieldRef}
              value={bill.contactType}
              onChange={(e) => {
                const newType = e.target.value;
                setBill((prev) => ({
                  ...prev,
                  contactType: newType,
                  party: "",
                  billNumber: "",
                  customerName: newType === "me" ? prev.customerName : "",
                }));
              }}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="party">Party</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
          <div>
            {bill.contactType === "me" ?
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Name *
                </label>
                <input
                  ref={firstFieldRef}
                  type="text"
                  value={bill.customerName}
                  onChange={(e) =>
                    setBill((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  placeholder="Enter name"
                />
              </>
            : <>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {bill.contactType === "party" ?
                    "Party"
                  : bill.contactType === "book" ?
                    "Book"
                  : "Supplier"}{" "}
                  *
                </label>
                <SearchableSelect
                  value={bill.party}
                  onChange={(selectedId) => {
                    const contacts =
                      bill.contactType === "supplier" ?
                        loadedSuppliers
                      : loadedParties;
                    const selected = contacts.find((c) => c.id === selectedId);

                    if (selected) {
                      fetchLabelsForParty(selected);
                      if (bill.contactType === "party")
                        fetchPartyDetails(selectedId);
                    }

                    setBill((prev) => ({
                      ...prev,
                      party: selectedId,
                      gstType: isFirmGST ? 1 : 0,
                      transportCharge:
                        selected ?
                          selected.transport_charge || 0
                        : prev.transportCharge,
                      transportId:
                        selected ?
                          selected.transport_id || prev.transportId
                        : prev.transportId,
                      agent:
                        selected ? selected.agent || prev.agent : prev.agent,
                      labelId: getPartyLabelId(selected, loadedLabels),
                      customerName:
                        selected ?
                          selected.name || prev.customerName
                        : prev.customerName,
                    }));
                  }}
                  placeholder={`Select ${
                    bill.contactType === "party" ? "Party"
                    : bill.contactType === "book" ? "Book"
                    : "Supplier"
                  }`}
                  searchPlaceholder={`Search...`}
                  options={getSortedContactsForDropdown(
                    bill.contactType === "supplier" ?
                      loadedSuppliers
                    : loadedParties,
                  ).map((contact) => ({
                    value: contact.id,
                    label: contact.name,
                  }))}
                  buttonClassName="text-sm"
                />
              </>
            }
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
              {bill.labelId && loadedLabelDiscounts[bill.labelId] && (
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  Discounts Active
                </span>
              )}
            </label>
            <SearchableSelect
              value={bill.labelId}
              onChange={(newLabelId) => {
                setBill((prev) => ({
                  ...prev,
                  labelId: newLabelId,
                }));
              }}
              disabled={!bill.party}
              placeholder={
                !bill.party ? "Select Contact First" : "Select Label"
              }
              searchPlaceholder="Search label..."
              options={filteredLabels.map((label) => ({
                value: label.id,
                label: label.name,
              }))}
              buttonClassName="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Number
            </label>
            <input
              type="text"
              value={bill.billNumber}
              placeholder={suggestedBillNumber || "BL-000001"}
              onChange={(e) =>
                setBill((prev) => ({ ...prev, billNumber: e.target.value }))
              }
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Date
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="dd/mm/yyyy"
                value={bill.date}
                onChange={(e) => {
                  setBill((prev) => ({
                    ...prev,
                    date: normalizeDisplayDateInput(e.target.value),
                  }));
                }}
                className="w-full px-3 py-2 pr-10 border rounded-md text-sm"
              />
              <button
                type="button"
                onClick={openBillDatePicker}
                className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-800"
                aria-label="Pick invoice date"
              >
                <FaCalendarAlt />
              </button>
              <input
                ref={billDatePickerRef}
                type="date"
                value={convertDateToISO(bill.date)}
                onChange={(e) =>
                  setBill((prev) => ({
                    ...prev,
                    date: convertDateFromISO(e.target.value),
                  }))
                }
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          </div>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setShowAllFields(!showAllFields)}
              className="flex items-center gap-2 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border rounded-md hover:bg-gray-50"
            >
              <span>{showAllFields ? "Hide" : "Show"} All Fields</span>
              <svg
                className={`w-4 h-4 transition-transform ${showAllFields ? "rotate-180" : ""}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Party Details Display */}
        {bill.contactType === "party" &&
          bill.party &&
          (() => {
            const selectedParty = loadedParties.find(
              (p) => p.id === bill.party,
            );
            if (!selectedParty) return null;

            return null; // Removed the duplicate From Bank field
          })()}

        <div className="grid grid-cols-1 md:grid-cols-7 gap-4 p-4">
          {showAllFields && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Agent
                </label>
                <SearchableSelect
                  value={bill.agent}
                  onChange={(agent) => setBill((prev) => ({ ...prev, agent }))}
                  placeholder="Select Agent"
                  searchPlaceholder="Search agent..."
                  options={loadedAgents.map((a) => ({
                    value: a.id,
                    label: a.name,
                  }))}
                  buttonClassName="text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transport
                </label>
                <SearchableSelect
                  value={bill.transportId}
                  onChange={(tid) => {
                    const t = loadedTransports.find((x) => x.id === tid);
                    setBill((prev) => ({
                      ...prev,
                      transportId: tid,
                      transportCharge: Math.max(
                        0,
                        Number(t ? t.charge : prev.transportCharge) || 0,
                      ),
                    }));
                  }}
                  placeholder="Select Transport"
                  searchPlaceholder="Search transport..."
                  options={loadedTransports.map((t) => ({
                    value: t.id,
                    label: t.name,
                  }))}
                  buttonClassName="text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transport Charge
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={bill.transportCharge}
                  onChange={(e) => {
                    if (!isValidNumberDraft(e.target.value)) return;
                    setBill((prev) => ({
                      ...prev,
                      transportCharge: e.target.value,
                    }));
                  }}
                  onBlur={() => {
                    const error = validateNumberInput(bill.transportCharge, {
                      label: "Transport Charge",
                      min: 0,
                    });
                    if (error) showToast(error, "error");
                  }}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name
                </label>
                <input
                  type="text"
                  value={bill.customerName}
                  onChange={(e) =>
                    setBill((prev) => ({
                      ...prev,
                      customerName: e.target.value,
                    }))
                  }
                  placeholder="Enter customer name"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                  readOnly={bill.contactType === "party" && bill.party}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Vehicle No
                </label>
                <input
                  type="text"
                  value={bill.vehicleNo}
                  onChange={(e) =>
                    setBill((prev) => ({ ...prev, vehicleNo: e.target.value }))
                  }
                  placeholder="Vehicle number"
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  From Bank
                </label>
                <SearchableSelect
                  value={bill.from_bank}
                  onChange={(from_bank) =>
                    setBill((prev) => ({
                      ...prev,
                      from_bank,
                    }))
                  }
                  placeholder="Select Bank"
                  searchPlaceholder="Search bank..."
                  options={loadedBanks.map((bank) => ({
                    value: bank.id,
                    label: bank.name,
                  }))}
                  buttonClassName="text-sm"
                />
              </div>
              <button
                type="button"
                disabled
                onClick={handleGstToggle}
                aria-disabled
                className={`w-14 h-7 flex items-center mt-6 rounded-full p-1 transition-all duration-300 ${
                  effectiveGstType === 1 ? "bg-green-500" : "bg-gray-300"
                } cursor-not-allowed opacity-70`}
                title="GST type is controlled by login firm"
              >
                <div
                  className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-all duration-300 ${
                    effectiveGstType === 1 ? "translate-x-7" : "translate-x-0"
                  }`}
                />
              </button>
              {isFirmGST && bill.contactType === "party" && (
                <div className="flex flex-col items-start">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Deduct
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      setBill((prev) => ({
                        ...prev,
                        deductFromStock: !prev.deductFromStock,
                      }))
                    }
                    className={`w-14 h-7 flex items-center rounded-full p-1 transition-all duration-300 ${
                      bill.deductFromStock ?
                        "bg-green-500 cursor-pointer"
                      : "bg-gray-300 cursor-pointer"
                    }`}
                    title={bill.deductFromStock ? "Deduct" : "Do not deduct"}
                  >
                    <div
                      className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-all duration-300 ${
                        bill.deductFromStock ? "translate-x-7" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border rounded-lg  flex flex-col">
          <div className="bg-gray-100 px-4 py-2">
            <h3 className="font-medium text-gray-900">
              Rate Information - Add / Less
            </h3>
          </div>

          <div className="p-4 bg-gray-50 border-t order-2">
            <div className="mb-3">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search & Add Items:
              </label>
              <div className="relative" ref={itemDropdownRef}>
                <input
                  type="text"
                  placeholder="Search by name / alias / item id / barcode..."
                  value={itemSearchTerm}
                  onChange={(e) => {
                    setItemSearchTerm(e.target.value);
                    setShowItemDropdown(true);
                  }}
                  onFocus={() => setShowItemDropdown(true)}
                  onKeyDown={handleItemSearchKeyDown}
                  ref={itemSearchInputRef}
                  className="w-full px-3 py-2 border rounded-md text-sm"
                />
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span></span>
                  {isResolvingScannerInput && (
                    <span className="text-blue-600">
                      Resolving scanned code...
                    </span>
                  )}
                </div>
                {showItemDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
                    <div
                      className="max-h-64 overflow-y-auto"
                      onScroll={handleScroll}
                      ref={itemDropdownListRef}
                    >
                      <div className="px-3 py-2 bg-gray-100 text-xs text-gray-600 sticky top-0 flex items-center justify-between">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadItemsPage(itemsPage - 1);
                          }}
                          disabled={itemsPage === 1 || isLoadingItems}
                          className="px-2 py-0.5 bg-white border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200"
                        >
                          ←
                        </button>
                        <span>
                          Page {itemsPage} of {totalItemsPages}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            loadItemsPage(itemsPage + 1, true);
                          }}
                          disabled={
                            itemsPage === totalItemsPages || isLoadingItems
                          }
                          className="px-2 py-0.5 bg-white border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-200"
                        >
                          →
                        </button>
                      </div>
                      {filteredItems.map((item, index) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            handleSelectItem(item);
                          }}
                          onMouseEnter={() => setHighlightedItemIndex(index)}
                          className={`w-full px-3 py-2 text-left text-sm border-b last:border-b-0 ${
                            index === highlightedItemIndex ? "bg-blue-100" : (
                              "hover:bg-blue-50"
                            )
                          }`}
                        >
                          <div className="flex justify-between items-start gap-3">
                            <span className="truncate block">
                              {item.name}
                              {(item.item_id || item.part_no) && (
                                <span className="text-gray-400 text-xs ml-1">
                                  ({item.item_id || item.part_no})
                                </span>
                              )}
                              {item.barcode && (
                                <span className="text-gray-400 text-xs ml-1">
                                  (Barcode: {item.barcode})
                                </span>
                              )}
                              <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-600">
                                <span>
                                  {formatItemMetric(
                                    "Sale",
                                    item.sale_rate || item.amount,
                                    { currency: true },
                                  )}
                                </span>
                                <span>
                                  {formatItemMetric("MRP", item.mrp_rate, {
                                    currency: true,
                                  })}
                                </span>
                                <span>
                                  {formatItemMetric(
                                    "Stock",
                                    getItemStock(item),
                                  )}
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-blue-700 text-right flex flex-col items-end">
                              <div>
                                {formatItemMetric(
                                  "Sale",
                                  item.sale_rate || item.amount,
                                  { currency: true },
                                )}
                              </div>
                              <div className="text-gray-500 font-normal mt-0.5">
                                {formatItemMetric(
                                  "Net Purchase Rate",
                                  (item.purchase_rate || 0) *
                                    (1 + (item.gst_percent || 0) / 100),
                                  { currency: true },
                                )}
                              </div>
                            </span>
                          </div>
                        </button>
                      ))}
                      {filteredItems.length === 0 && !isLoadingItems && (
                        <div className="px-3 py-2 text-gray-500 text-sm">
                          No items found
                        </div>
                      )}
                      {isLoadingItems && (
                        <div className="px-3 py-2 text-gray-500 text-sm text-center">
                          Loading...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-80 border-t overflow-y-auto order-1">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-1 py-1 text-left border-r">SNo</th>
                  <th className="px-1 py-1 text-left border-r">ItemName</th>
                  <th className="px-1 py-1 text-left border-r">Remark</th>
                  <th className="px-1 py-1 text-left border-r">Type</th>
                  <th
                    className="px-1 py-1 text-left border-r hover:bg-gray-100 cursor-pointer select-none"
                    title="Double click to toggle physical/logical stock"
                    onClick={(event) => {
                      if (event.detail === 2) {
                        event.preventDefault();
                        toggleStockColumnMode();
                      }
                    }}
                  >
                    Stock
                  </th>
                  <th className="px-1 py-1 text-left border-r">PCS</th>
                  <th className="px-1 py-1 text-left border-r">Rate (₹)</th>
                  <th className="px-1 py-1 text-left border-r">Dis (%)</th>
                  <th className="px-1 py-1 text-left border-r">SP Dis (%)</th>
                  <th className="px-1 py-1 text-left border-r">Disc Amt (₹)</th>
                  <th className="px-1 py-1 text-left border-r">
                    Item Disc (%)
                  </th>
                  <th className="px-1 py-1 text-left border-r bg-blue-100">
                    Item Disc2 (%)
                  </th>
                  <th className="px-1 py-1 text-left border-r">GST (%)</th>
                  <th className="px-1 py-1 text-left border-r">GST Amt (₹)</th>
                  <th className="px-1 py-1 text-left border-r">Amount</th>
                  <th className="px-1 py-1 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {bill.items.map((itemId, index) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = bill.itemDetails[itemId] || {};
                  const calc = calculateItemAmount(itemId);
                  const itemType = normalizeTypeValue(
                    details.type,
                    effectiveGstType,
                  );
                  const typeInputValue =
                    details.type === "" ? "" : String(itemType);
                  const displayItemName =
                    details.itemName || item?.name || "Unknown Item";
                  const historyOpen = expandedItemId === itemId;

                  return (
                    <Fragment key={itemId}>
                      <tr className="border-t">
                        <td className="px-1 py-1 border-r">
                          <div className="flex items-center gap-1">
                            <span>{index + 1}</span>
                            <button
                              type="button"
                              onClick={() => handleToggleHistory(itemId)}
                              className="text-gray-500 hover:text-gray-700"
                              title="View last 4 entries"
                            >
                              {historyOpen ?
                                <FaChevronUp size={10} />
                              : <FaChevronDown size={10} />}
                            </button>
                          </div>
                        </td>
                        <td className="px-1 py-1 border-r">
                          <span className="text-xs">{displayItemName}</span>
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            value={details.remark || ""}
                            onChange={(e) =>
                              updateItemDetail(itemId, "remark", e.target.value)
                            }
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "remark",
                                itemType,
                              )
                            }
                            data-item-row={index}
                            data-item-field="remark"
                            className="w-28 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            value={typeInputValue}
                            readOnly
                            tabIndex={-1}
                            className="w-12 px-1 py-0.5 border rounded text-xs bg-gray-100 cursor-not-allowed"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getStockColumnValue(details)}
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                            readOnly
                            tabIndex={-1}
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={details.pcs ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(itemId, "pcs", e.target.value)
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.pcs,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(e, index, "pcs", itemType)
                            }
                            data-item-row={index}
                            data-item-field="pcs"
                            className="w-12 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.rate ?? item?.amount ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(itemId, "rate", e.target.value)
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.rate,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(e, index, "rate", itemType)
                            }
                            data-item-row={index}
                            data-item-field="rate"
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.disPercent ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(
                                itemId,
                                "disPercent",
                                e.target.value,
                              )
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.disPercent,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "disPercent",
                                itemType,
                              )
                            }
                            data-item-row={index}
                            data-item-field="disPercent"
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.spDis ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(itemId, "spDis", e.target.value)
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.spDis,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "spDis",
                                itemType,
                              )
                            }
                            data-item-row={index}
                            data-item-field="spDis"
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.dis3 ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(itemId, "dis3", e.target.value)
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.dis3,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(e, index, "dis3", itemType)
                            }
                            data-item-row={index}
                            data-item-field="dis3"
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                            placeholder="0"
                            title="Discount amount"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.itemDiscount ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(
                                itemId,
                                "itemDiscount",
                                e.target.value,
                              )
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.itemDiscount,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "itemDiscount",
                                itemType,
                              )
                            }
                            data-item-row={index}
                            data-item-field="itemDiscount"
                            className="w-16 px-1 py-0.5 border rounded text-xs"
                          />
                        </td>
                        <td className="px-1 py-1 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={details.itemDis2 ?? ""}
                            onChange={(e) =>
                              updateNumberDraft(
                                itemId,
                                "itemDis2",
                                e.target.value,
                              )
                            }
                            onBlur={(e) => {
                              const error = validateNumberInput(
                                e.target.value,
                                itemNumberRules.itemDis2,
                              );
                              if (error) showToast(error, "error");
                            }}
                            onFocus={() => ensureItemHistoryOpen(itemId)}
                            onKeyDown={(e) =>
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "itemDis2",
                                itemType,
                              )
                            }
                            data-item-row={index}
                            data-item-field="itemDis2"
                            className="w-16 px-1 py-0.5 border rounded text-xs bg-blue-50"
                            placeholder="0"
                          />
                        </td>
                        {itemType === 1 ?
                          <>
                            <td className="px-1 py-1 border-r">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={details.gstPercent ?? ""}
                                readOnly
                                tabIndex={-1}
                                data-item-row={index}
                                data-item-field="gstPercent"
                                className="w-16 px-1 py-0.5 border rounded text-xs bg-gray-100 cursor-not-allowed"
                              />
                            </td>
                            <td className="px-1 py-1 border-r">
                              <span className="text-xs">
                                {round2(calc.gstAmount)}
                              </span>
                            </td>
                          </>
                        : <>
                            <td className="px-1 py-1 border-r">
                              <span className="text-xs">-</span>
                            </td>
                            <td className="px-1 py-1 border-r">
                              <span className="text-xs">-</span>
                            </td>
                          </>
                        }
                        <td className="px-1 py-1 border-r">
                          <span className="text-xs font-medium">
                            {round2(calc.amount)}
                          </span>
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            data-item-delete={index}
                            onClick={() => {
                              toggleItemSelection(itemId);
                              requestAnimationFrame(() => focusSearchInput());
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === "Tab") {
                                e.preventDefault();
                                if (e.key === "Tab" && e.shiftKey) {
                                  const currentDetails =
                                    bill.itemDetails[itemId] || {};
                                  const currentType =
                                    currentDetails.type !== undefined ?
                                      currentDetails.type
                                    : effectiveGstType;
                                  const order = getItemFieldOrder(currentType);
                                  focusItemField(
                                    index,
                                    order[order.length - 1],
                                  );
                                  return;
                                }
                                if (index < bill.items.length - 1) {
                                  const nextItemId = bill.items[index + 1];
                                  const nextDetails =
                                    bill.itemDetails[nextItemId] || {};
                                  const nextType =
                                    nextDetails.type !== undefined ?
                                      nextDetails.type
                                    : effectiveGstType;
                                  focusItemField(
                                    index + 1,
                                    getItemFieldOrder(nextType)[0],
                                  );
                                } else {
                                  setShowItemDropdown(true);
                                  focusSearchInput();
                                }
                              }
                            }}
                            className="text-red-500 hover:text-red-700"
                          >
                            <FaTimes size={12} />
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                {bill.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No items selected. Use the search below to add items.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {bill.items.length > 0 && (
          <div className="border rounded-lg bg-gray-50">
            <div className="bg-gray-100  border-b">
              {/* <span className="text-sm font-medium text-gray-700">
                Selected Items ({bill.items.length})
              </span> */}
            </div>
            <div className="">
              {/* <div className="flex flex-wrap gap-2 mb-4">
                {bill.items.map((itemId) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = bill.itemDetails[itemId] || {};
                  const displayItemName =
                    details.itemName || item?.name || "Unknown Item";
                  const isActive = expandedItemId === itemId;
                  return (
                    <span
                      key={itemId}
                      onClick={() => handleToggleHistory(itemId)}
                      className={`px-2 py-1 text-xs rounded flex items-center gap-1 cursor-pointer transition-colors ${
                        isActive ?
                          "bg-blue-600 text-white"
                        : "bg-blue-100 text-blue-800 hover:bg-blue-200"
                      }`}
                    >
                      {displayItemName}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleItemSelection(itemId);
                        }}
                        className={
                          isActive ?
                            "text-white hover:text-gray-200"
                          : "text-blue-600 hover:text-blue-800"
                        }
                      >
                        <FaTimes size={10} />
                      </button>
                    </span>
                  );
                })}
              </div> */}

              {expandedItemId &&
                (() => {
                  const expandedBaseItemId = getRowBaseItemId(expandedItemId);
                  const historyState = itemHistoryMap[expandedBaseItemId] || {
                    loading: false,
                    rows: [],
                    error: null,
                  };
                  const historyRows =
                    Array.isArray(historyState.rows) ?
                      historyState.rows.slice(0, 4)
                    : [];
                  const item = getLoadedItemByRowId(expandedItemId);
                  const details = bill.itemDetails[expandedItemId] || {};
                  const displayItemName =
                    details.itemName || item?.name || "Unknown Item";

                  return (
                    <div className="border rounded-lg bg-white">
                      <div className="bg-gray-50 px-3 py-2 border-b">
                        <span className="text-xs font-medium text-gray-700">
                          Last 4 Entries - {displayItemName}
                        </span>
                      </div>
                      {historyState.loading ?
                        <div className="px-3 py-4 text-xs text-gray-500 text-center">
                          Loading history...
                        </div>
                      : historyState.error ?
                        <div className="px-3 py-4 text-xs text-red-600 text-center">
                          {historyState.error}
                        </div>
                      : historyRows.length === 0 ?
                        <div className="px-3 py-4 text-xs text-gray-500 text-center">
                          No history found.
                        </div>
                      : <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50">
                                <th className="px-2 py-2 text-left border">
                                  Date
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Bill No
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Rate
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Qty
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Amount
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Net Amount
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Net Rate
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Disc%
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Sp Disc
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {historyRows.map((row, rowIndex) => (
                                <tr
                                  key={`history-${rowIndex}`}
                                  className="hover:bg-blue-50 cursor-pointer"
                                  onClick={() => {
                                    updateItemDetail(
                                      expandedItemId,
                                      "rate",
                                      row?.rate || 0,
                                    );
                                    updateItemDetail(
                                      expandedItemId,
                                      "disPercent",
                                      row?.discount || 0,
                                    );
                                    updateItemDetail(
                                      expandedItemId,
                                      "spDis",
                                      row?.special_discount || 0,
                                    );
                                    updateItemDetail(
                                      expandedItemId,
                                      "gstPercent",
                                      row?.gst_percent || 0,
                                    );
                                    showToast(
                                      "Details filled from history",
                                      "success",
                                    );
                                  }}
                                >
                                  <td className="px-2 py-2 border">
                                    {formatHistoryDate(
                                      row?.bill_date || row?.date,
                                    )}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {row?.bill_no || "-"}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Number(row?.rate || 0).toFixed(2)}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Number(row?.quantity || 0)}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Math.round(Number(row?.amount || 0))}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Math.round(
                                      Number(row?.net_amount ?? row?.amount ?? 0),
                                    )}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Math.round(
                                      Number(row?.quantity || 0) ?
                                        Number(row?.amount || 0) /
                                          Number(row?.quantity || 0)
                                      : 0,
                                    )}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Number(row?.discount || 0).toFixed(2)}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {Number(row?.special_discount || 0).toFixed(
                                      2,
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      }
                    </div>
                  );
                })()}
            </div>
          </div>
        )}

        {/* {bill.items.length > 0 && (
          <div className="border rounded-lg p-4 bg-gray-50">
            <span className="text-sm font-medium text-gray-700">
              Selected Items ({bill.items.length}):
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {bill.items.map((itemId) => {
                const item = loadedItems.find((i) => i.id === itemId);
                const details = bill.itemDetails[itemId] || {};
                const displayItemName = details.itemName || item?.name || "Unknown Item";
                return (
                  <span
                    key={itemId}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded flex items-center gap-1"
                  >
                    {displayItemName}
                    <button
                      onClick={() => toggleItemSelection(itemId)}
                      className="text-blue-600 hover:text-blue-800"
                    >
                      <FaTimes size={10} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )} */}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Discount:</span>
              <input
                type="text"
                inputMode="decimal"
                value={round2(calculateTotalDiscount())}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-100 cursor-not-allowed text-gray-600"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Net Amount:</span>
              <input
                type="text"
                inputMode="decimal"
                value={roundNetAmount(calculateTotalAmount())}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-50"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Print Format:</span>
              <select
                value={bill.printOption}
                onChange={(e) =>
                  setBill((prev) => ({
                    ...prev,
                    printOption: parseInt(e.target.value),
                  }))
                }
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              >
                <option value={1}>Print 1 - Show Item Code</option>
                <option value={2}>Print 2 - Show Item Name</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Discount Cols:</span>
              <label className="flex items-center gap-1.5 cursor-pointer text-sm font-normal">
                <input
                  type="checkbox"
                  checked={hideDiscountColumnsState}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    localStorage.setItem(
                      "hide_discount_columns",
                      checked ? "true" : "false",
                    );
                    setHideDiscountColumnsState(checked);
                  }}
                  className="rounded border-gray-300 accent-blue-600 w-4 h-4 cursor-pointer"
                />
                Hide 5 Discount Columns (Simplified Layout)
              </label>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={
              !getResolvedContactId() || bill.items.length === 0 || isSaving
            }
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ?
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span>Saving...</span>
              </>
            : <>
                <FaSave />
                <span>{isEditMode ? "Update Bill" : "Save Bill"}</span>
              </>
            }
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!getResolvedContactId() || bill.items.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <FaPrint />
            Print Preview
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/transactions/bill-list")}
          >
            Cancel
          </Button>
        </div>
      </div>

      {isScanModalOpen && (
        <BillGunScanner
          onScanComplete={(scannedData) => {
            setIsScanModalOpen(false);
            const scannerPayload =
              String(scannedData?.scanType || "").startsWith("item-qr") ?
                scannedData
              : null;
            if (scannerPayload) {
              const scannedValues =
                Array.isArray(scannerPayload.scannedValues) ?
                  scannerPayload.scannedValues
                : [scannerPayload.rawValue].filter(Boolean);
              scannedValues.forEach((val) => handleScannedItemValue(val));
            }
          }}
          onClose={() => setIsScanModalOpen(false)}
        />
      )}
    </div>
  );
};

export default BillForm;
