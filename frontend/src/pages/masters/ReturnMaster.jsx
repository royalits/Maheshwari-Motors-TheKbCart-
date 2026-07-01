import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FaDownload,
  FaEdit,
  FaEye,
  FaPlus,
  FaTrash,
  FaTimes,
  FaPrint,
} from "react-icons/fa";
import { DataTable, DeleteConfirmDialog, Modal } from "../../components/common";
import { Button } from "../../components/ui";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import OutStandings from "../transactions/OutStandings";
import {
  getEntityId,
  getResponseData,
  getResponseList,
  normalizeBill,
  normalizeContact,
  normalizeItem,
  toNumber,
} from "../../services/apiUtils";
import { normalizeDisplayDateInput } from "../../utils/dateHelpers";
import useFirmBranding from "../../hooks/useFirmBranding";

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const getToday = () => {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const yyyy = today.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const convertDateToISO = (ddmmyy) => {
  if (!ddmmyy) return "";
  const parts = ddmmyy.split("/");
  if (parts.length !== 3) return "";
  const [dd, mm, yyyy] = parts;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
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

const roundToTwo = (value) =>
  Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const clampPercent = (value) => {
  const parsed = toNumber(value, 0);
  return Math.min(100, Math.max(0, parsed));
};

const createEmptyItem = () => ({
  item_id: "",
  quantity: 1,
  rate: 0,
  discount: 0,
  special_discount: 0,
  item_discount: 0,
  item_dis2: 0,
  dis3: 0,
  gross_amount: 0,
  discount_amount: 0,
  total_discount: 0,
  gst_percent: 0,
  gst_amount: 0,
  taxable_amount: 0,
  amount: 0,
  is_damaged: false,
  is_gst: 1,
  source_quantity: 0,
});

const getInitialFormData = () => ({
  return_no: "Auto Generated",
  date: getToday(),
  return_type: "sale_return",
  contact_id: "",
  bill_id: "",
  challan_id: "",
  items: [createEmptyItem()],
  total_amount: 0,
  note: "",
});

const calculateItemLine = (item) => {
  const quantity = Math.max(1, toNumber(item.quantity, 1));
  const sourceQuantity = toNumber(item.source_quantity, 0);
  if (sourceQuantity > 0) {
    const scale = quantity / sourceQuantity;
    return {
      ...item,
      quantity,
      gross_amount: roundToTwo(
        toNumber(item.source_gross_amount ?? item.gross_amount, 0) * scale,
      ),
      discount_amount: roundToTwo(
        toNumber(item.source_discount_amount ?? item.discount_amount, 0) *
          scale,
      ),
      total_discount: roundToTwo(
        toNumber(item.source_total_discount ?? item.total_discount, 0) * scale,
      ),
      taxable_amount: roundToTwo(
        toNumber(item.source_taxable_amount ?? item.taxable_amount, 0) * scale,
      ),
      gst_amount: roundToTwo(
        toNumber(item.source_gst_amount ?? item.gst_amount, 0) * scale,
      ),
      amount: roundToTwo(
        toNumber(item.source_amount ?? item.amount, 0) * scale,
      ),
    };
  }

  const rate = Math.max(0, toNumber(item.rate, 0));
  const discount = clampPercent(item.discount);
  const specialDiscount = clampPercent(item.special_discount);
  const gstPercent = clampPercent(item.gst_percent);
  const isGst = toNumber(item.is_gst, 1) === 1 ? 1 : 0;

  const gross = quantity * rate;
  const afterDiscount = gross * (1 - discount / 100);
  const afterSpecialDiscount = afterDiscount * (1 - specialDiscount / 100);
  const taxableAmount = roundToTwo(afterSpecialDiscount);
  const gstAmount =
    isGst === 1 ? roundToTwo(taxableAmount * (gstPercent / 100)) : 0;
  const amount = roundToTwo(taxableAmount + gstAmount);

  return {
    ...item,
    quantity,
    rate,
    discount,
    special_discount: specialDiscount,
    gst_percent: gstPercent,
    gst_amount: gstAmount,
    taxable_amount: taxableAmount,
    amount,
    is_damaged: item.is_damaged === true,
    is_gst: isGst,
  };
};

const buildReferenceItemsFromLines = (lines = [], fallbackItems = []) => {
  const fallbackMap = new Map(fallbackItems.map((item) => [item.id, item]));
  const itemMap = new Map();

  for (const line of lines) {
    const itemRef = line?.item_id || {};
    const itemId = getEntityId(itemRef);
    if (!itemId) continue;

    const fallback = fallbackMap.get(itemId);
    const quantity = Math.max(0, toNumber(line?.quantity, 0));
    const rate = toNumber(line?.rate, toNumber(fallback?.rate, 0));
    const gstPercent = toNumber(
      line?.gst_percent,
      toNumber(fallback?.gst_percent, 0),
    );
    const name =
      itemRef?.item_name ||
      itemRef?.name ||
      fallback?.name ||
      `Item ${itemId.slice(-6)}`;

    if (itemMap.has(itemId)) {
      const existing = itemMap.get(itemId);
      existing.billed_quantity = roundToTwo(
        existing.billed_quantity + quantity,
      );
      existing.gross_amount = roundToTwo(
        existing.gross_amount + toNumber(line?.gross_amount, 0),
      );
      existing.discount_amount = roundToTwo(
        existing.discount_amount + toNumber(line?.discount_amount, 0),
      );
      existing.total_discount = roundToTwo(
        existing.total_discount + toNumber(line?.total_discount, 0),
      );
      existing.taxable_amount = roundToTwo(
        existing.taxable_amount + toNumber(line?.taxable_amount, 0),
      );
      existing.gst_amount = roundToTwo(
        existing.gst_amount + toNumber(line?.gst_amount, 0),
      );
      existing.amount = roundToTwo(existing.amount + toNumber(line?.amount, 0));
      if (existing.rate <= 0 && rate > 0) existing.rate = rate;
      if (existing.gst_percent <= 0 && gstPercent > 0) {
        existing.gst_percent = gstPercent;
      }
      continue;
    }

    itemMap.set(itemId, {
      id: itemId,
      name,
      rate,
      discount: toNumber(line?.discount, 0),
      special_discount: toNumber(line?.special_discount, 0),
      item_discount: toNumber(line?.item_discount, 0),
      item_dis2: toNumber(line?.item_dis2, 0),
      dis3: toNumber(line?.dis3, 0),
      gross_amount: toNumber(line?.gross_amount, 0),
      discount_amount: toNumber(line?.discount_amount, 0),
      total_discount: toNumber(line?.total_discount, 0),
      taxable_amount: toNumber(line?.taxable_amount, 0),
      gst_percent: gstPercent,
      gst_amount: toNumber(line?.gst_amount, 0),
      amount: toNumber(line?.amount, 0),
      is_gst: toNumber(line?.is_gst, 1),
      billed_quantity: roundToTwo(quantity),
      already_returned: 0,
      returnable_quantity: roundToTwo(quantity),
    });
  }

  return Array.from(itemMap.values());
};

const applyReturnedQuantities = (baseItems = [], returnDocs = []) => {
  const returnedMap = new Map();

  for (const doc of returnDocs) {
    for (const line of doc?.items || []) {
      const itemId = getEntityId(line?.item_id);
      if (!itemId) continue;
      const existing = returnedMap.get(itemId) || 0;
      returnedMap.set(
        itemId,
        existing + Math.max(0, toNumber(line?.quantity, 0)),
      );
    }
  }

  return baseItems
    .map((item) => {
      const alreadyReturned = roundToTwo(returnedMap.get(item.id) || 0);
      const returnableQuantity = roundToTwo(
        Math.max(0, item.billed_quantity - alreadyReturned),
      );

      return {
        ...item,
        already_returned: alreadyReturned,
        returnable_quantity: returnableQuantity,
      };
    })
    .filter((item) => item.returnable_quantity > 0);
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

const ReturnMaster = () => {
  const { showToast, selectedFirm } = useStore();
  const firmBranding = useFirmBranding();

  const [returns, setReturns] = useState([]);
  const [returnSummary, setReturnSummary] = useState({
    totalItemsReturned: 0,
    damagedItemsReturned: 0,
  });
  const [contacts, setContacts] = useState([]);
  const [bills, setBills] = useState([]);
  const [itemsCatalog, setItemsCatalog] = useState([]);
  const [referenceItems, setReferenceItems] = useState([]);
  const [referenceLoading, setReferenceLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [formData, setFormData] = useState(getInitialFormData());
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    returnId: "",
    itemName: "",
  });
  const [previewDialog, setPreviewDialog] = useState({
    isOpen: false,
    loading: false,
    data: null,
  });
  // outstanding panel is now shown inside the add return modal
  const [showOutstandingInline, setShowOutstandingInline] = useState(false);
  const firstFieldRef = useRef(null);

  const focusFirstField = () => {
    setTimeout(() => {
      if (firstFieldRef.current) {
        firstFieldRef.current.focus();
        if (typeof firstFieldRef.current.select === "function") {
          firstFieldRef.current.select();
        }
      }
    }, 0);
  };

  const fetchReturns = useCallback(async () => {
    setLoading(true);
    setReturns([]);

    try {
      const [response, summaryResponse] = await Promise.all([
        api.get("/returns", { params: { page: 1, limit: 200 } }),
        api.get("/returns/summary"),
      ]);
      const rows = getResponseList(response).map((entry) => {
        const items = Array.isArray(entry?.items) ? entry.items : [];
        return {
          id: getEntityId(entry),
          return_no: entry?.return_no || "-",
          return_type: entry?.return_type || "-",
          date: entry?.date || null,
          contact_name: entry?.contact_id?.name || "-",
          bill_no: entry?.bill_id?.bill_no || "-",
          challan_no: entry?.challan_id?.challan_no || "-",
          total_amount: toNumber(entry?.total_amount, 0),
          items_count: items.length,
          pcs_count: items.reduce(
            (sum, item) => sum + toNumber(item?.quantity, 0),
            0,
          ),
          damaged_pcs_count: items.reduce(
            (sum, item) =>
              item?.is_damaged ? sum + toNumber(item?.quantity, 0) : sum,
            0,
          ),
        };
      });
      setReturns(rows);
      const summary = getResponseData(summaryResponse) || {};
      setReturnSummary({
        totalItemsReturned: toNumber(summary.total_quantity, 0),
        damagedItemsReturned: toNumber(summary.damaged_quantity, 0),
      });
    } catch (error) {
      console.error("Failed to load returns:", error);
      showToast(
        error?.response?.data?.message || "Failed to load returns",
        "error",
      );
      setReturns([]);
      setReturnSummary({ totalItemsReturned: 0, damagedItemsReturned: 0 });
    }

    setTimeout(() => {
      setLoading(false);
    }, 100);
  }, [showToast]);

  const fetchFormOptions = useCallback(async () => {
    const [contactsRes, billsRes, itemsRes] = await Promise.all([
      api.get("/contacts", { params: { page: 1, limit: 500 } }),
      api.get("/bills", { params: { page: 1, limit: 500 } }),
      api.get("/items", { params: { page: 1, limit: 500 } }),
    ]);

    const contactRows = getResponseList(contactsRes)
      .map((contact) => {
        const normalized = normalizeContact(contact);
        return {
          id: normalized.id,
          name: normalized.name || "Unknown",
          type: normalized.type || "party",
        };
      })
      .filter((entry) => entry.id);
    setContacts(contactRows);

    const billRows = getResponseList(billsRes)
      .map((bill) => {
        const normalized = normalizeBill(bill);
        return {
          id: normalized.id,
          bill_no: normalized.billNo || bill?.bill_no || "-",
          contact_id: normalized.partyId || getEntityId(bill?.contact_id),
          contact_name: normalized.party || bill?.contact_id?.name || "-",
          contact_type:
            bill?.contact_type ||
            bill?.contactType ||
            bill?.contact_id?.type ||
            "party",
          date: normalized.date,
          amount: normalized.amount,
        };
      })
      .filter((entry) => entry.id);
    setBills(billRows);

    const itemRows = getResponseList(itemsRes)
      .map((item) => {
        const normalized = normalizeItem(item);
        return {
          id: normalized.id,
          name: normalized.itemName || "Unknown",
          rate: normalized.amount,
          gst_percent: normalized.gst_percent,
        };
      })
      .filter((entry) => entry.id);
    setItemsCatalog(itemRows);
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setReturns([]);
    setContacts([]);
    setBills([]);
    setItemsCatalog([]);

    try {
      await Promise.all([fetchReturns(), fetchFormOptions()]);
    } catch (error) {
      console.error("Failed to load Return Master data:", error);
      showToast(
        error?.response?.data?.message || "Failed to load return data",
        "error",
      );
    }

    setTimeout(() => {
      setLoading(false);
    }, 100);
  }, [fetchFormOptions, fetchReturns, showToast]);

  useKeyboardShortcuts({
    onAdd: () => {
      setFormData(getInitialFormData());
      setReferenceItems([]);
      setIsAddModalOpen(true);
    },
    onRefresh: fetchAllData,
  });

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData, selectedFirm?.id]);

  useEffect(() => {
    if (isAddModalOpen) {
      focusFirstField();
    }
  }, [isAddModalOpen]);

  const isSaleReturn = formData.return_type === "sale_return";

  const filteredContacts = useMemo(() => {
    const primaryType = isSaleReturn ? "party" : "supplier";
    return contacts.filter(
      (contact) => contact.type === primaryType || contact.type === "book",
    );
  }, [contacts, isSaleReturn]);

  const filteredBills = useMemo(() => {
    const requiredType = isSaleReturn ? "party" : "supplier";
    return bills.filter((bill) => {
      if (bill.contact_type !== requiredType) return false;
      if (!formData.contact_id) return true;
      return bill.contact_id === formData.contact_id;
    });
  }, [bills, formData.contact_id, isSaleReturn]);

  const loadReferenceItemsForBill = useCallback(
    async (billId) => {
      if (!billId) {
        setReferenceItems([]);
        return;
      }

      setReferenceLoading(true);
      try {
        const [billRes, billReturnsRes] = await Promise.all([
          api.get(`/bills/${billId}`),
          api.get(`/returns/bill/${billId}`),
        ]);

        const billDoc = getResponseData(billRes) || {};
        const billContactId = getEntityId(billDoc?.contact_id);
        const challans =
          Array.isArray(billDoc?.challan_ids) ? billDoc.challan_ids : [];
        const challanLines = challans.flatMap((challan) =>
          Array.isArray(challan?.items) ? challan.items : [],
        );

        const baseItems = buildReferenceItemsFromLines(
          challanLines,
          itemsCatalog,
        );
        const returnDocs = getResponseList(billReturnsRes);
        const returnableItems = applyReturnedQuantities(baseItems, returnDocs);
        const returnableMap = new Map(
          returnableItems.map((item) => [item.id, item]),
        );

        setReferenceItems(returnableItems);

        setFormData((prev) => {
          const nextItems = prev.items.map((line) => {
            if (!line.item_id) return line;

            const ref = returnableMap.get(line.item_id);
            if (!ref) {
              return createEmptyItem();
            }

            const clampedQty = Math.min(
              Math.max(1, toNumber(line.quantity, 1)),
              ref.returnable_quantity,
            );

            return {
              ...line,
              quantity: clampedQty,
              rate: toNumber(line.rate, 0) > 0 ? line.rate : ref.rate,
              discount: toNumber(ref.discount, 0),
              special_discount: toNumber(ref.special_discount, 0),
              item_discount: toNumber(ref.item_discount, 0),
              item_dis2: toNumber(ref.item_dis2, 0),
              dis3: toNumber(ref.dis3, 0),
              gst_percent:
                toNumber(line.gst_percent, 0) > 0 ?
                  line.gst_percent
                : ref.gst_percent,
              is_gst: toNumber(ref.is_gst, 1),
              source_quantity: toNumber(ref.billed_quantity, 0),
              source_gross_amount: toNumber(ref.gross_amount, 0),
              source_discount_amount: toNumber(ref.discount_amount, 0),
              source_total_discount: toNumber(ref.total_discount, 0),
              source_taxable_amount: toNumber(ref.taxable_amount, 0),
              source_gst_amount: toNumber(ref.gst_amount, 0),
              source_amount: toNumber(ref.amount, 0),
            };
          });

          const hasAnySelected = nextItems.some((line) =>
            Boolean(line.item_id),
          );
          const items = hasAnySelected ? nextItems : [createEmptyItem()];
          const recalculatedItems = items.map(calculateItemLine);
          const totalAmount = Math.ceil(
            recalculatedItems.reduce(
              (sum, item) => sum + toNumber(item.amount, 0),
              0,
            ),
          );

          return {
            ...prev,
            contact_id: billContactId || prev.contact_id,
            items: recalculatedItems,
            total_amount: totalAmount,
          };
        });
      } catch (error) {
        console.error("Failed to load bill reference items:", error);
        showToast(
          error?.response?.data?.message || "Failed to load bill items",
          "error",
        );
        setReferenceItems([]);
      } finally {
        setReferenceLoading(false);
      }
    },
    [itemsCatalog, showToast],
  );

  useEffect(() => {
    if (!isAddModalOpen) return;
    if (!formData.bill_id) {
      setReferenceItems([]);
      return;
    }
    loadReferenceItemsForBill(formData.bill_id);
  }, [formData.bill_id, isAddModalOpen, loadReferenceItemsForBill]);

  const handleReturnTypeChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      return_type: value,
      contact_id: "",
      bill_id: "",
      challan_id: "",
      items: [createEmptyItem()],
      total_amount: 0,
    }));
    setReferenceItems([]);
  };

  const handleContactChange = (value) => {
    setFormData((prev) => ({
      ...prev,
      contact_id: value,
      bill_id: "",
      challan_id: "",
      items: [createEmptyItem()],
      total_amount: 0,
    }));
    setReferenceItems([]);
  };

  const generateReturnPDF = async (entry, action = "download") => {
    try {
      const response = await api.get(`/returns/${entry.id}`);
      const data = getResponseData(response);
      const items = Array.isArray(data?.items) ? data.items : [];

      const isGstBill = !!firmBranding.isGst;
      const doc = new jsPDF(isGstBill ? {
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      } : {
        orientation: "landscape",
        unit: "mm",
        format: "a4",
      });

      const firmName = firmBranding.name || selectedFirm?.name || "Firm";
      const firmAddress = firmBranding.address || selectedFirm?.address || "--";
      const firmPhone = firmBranding.phone || selectedFirm?.phone || "--";
      const firmEmail = firmBranding.email || selectedFirm?.email || "--";
      const firmGstin = firmBranding.gstin || selectedFirm?.gstin || "--";

      const contact = data?.contact_id || {};
      const receiverName = contact?.name || "N/A";
      const receiverAddress = contact?.address || "--";
      const receiverCity = contact?.city || "--";
      const receiverState = contact?.state || "--";
      const receiverGstin = contact?.gstin || "--";
      const receiverPhone = contact?.phone || "--";

      const extractStateCode = (gstinValue) => {
        const gstin = String(gstinValue || "").trim();
        const code = gstin.slice(0, 2);
        return /^\d{2}$/.test(code) ? code : "--";
      };

      const receiverStateCode = contact?.state_code || extractStateCode(receiverGstin);

      const resolvePan = (...values) => {
        for (const value of values) {
          const text = String(value || "").trim().toUpperCase();
          if (/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(text)) return text;
        }
        return "--";
      };
      const receiverPan = resolvePan(contact?.pan, contact?.pan_number, contact?.pan, contact?.reg_number);

      const returnTypeLabel = data?.return_type === "sale_return" ? "SALE RETURN" : "PURCHASE RETURN";
      const returnNo = data?.return_no || "-";
      const returnDate = data?.date ? formatDate(data.date) : "-";

      const parsedItems = items.map((item) => {
        const itemRef = item?.item_id || {};
        const itemName = itemRef?.item_name || itemRef?.name || item?.item_name || "";
        const hsn = itemRef?.hsn_id?.hsn_code || itemRef?.hsn_code || "";
        const quantity = Number(item?.quantity || 0);
        const rate = Number(item?.rate || 0);
        const discount = Number(item?.discount || 0);
        const specialDiscount = Number(item?.special_discount || 0);
        const taxable = Number(item?.taxable_amount || 0);
        const taxPercent = Number(item?.gst_percent || 0);
        const taxAmount = Number(item?.gst_amount || 0);
        const amount = Number(item?.amount || 0);
        const netRate = quantity !== 0 ? amount / quantity : 0;

        return {
          description: itemName,
          hsn,
          quantity,
          rate,
          discount,
          specialDiscount,
          taxable,
          taxPercent,
          taxAmount,
          amount,
          netRate,
        };
      });

      const totalQty = parsedItems.reduce((sum, item) => sum + item.quantity, 0);
      const taxableTotal = parsedItems.reduce((sum, item) => sum + item.taxable, 0);
      const taxTotal = parsedItems.reduce((sum, item) => sum + item.taxAmount, 0);
      const netTotal = Math.round(data.total_amount || 0);
      const sgstAmount = taxTotal / 2;
      const cgstAmount = taxTotal / 2;
      const igstAmount = taxTotal;

      const toWordsIndian = (num) => {
        const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
        const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
        const convertTwoDigits = (n) => {
          if (n < 20) return ones[n];
          return `${tens[Math.floor(n / 10)]}${n % 10 ? ` ${ones[n % 10]}` : ""}`;
        };
        const convertThreeDigits = (n) => {
          const hundred = Math.floor(n / 100);
          const rest = n % 100;
          if (!hundred) return convertTwoDigits(rest);
          return `${ones[hundred]} HUNDRED${rest ? ` ${convertTwoDigits(rest)}` : ""}`;
        };
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
      
      const amountInWords = `${toWordsIndian(Math.floor(netTotal))} ONLY`;

      const resolvedFirm = {
        ...selectedFirm,
        ...firmBranding,
      };

      if (isGstBill) {
        const pageHeight = doc.internal.pageSize.getHeight();
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 6;
        const contentWidth = pageWidth - margin * 2;
        const blue = [0, 0, 190];
        const headerFill = [203, 239, 243];

        const drawPageBorder = () => {
          doc.setDrawColor(0, 0, 0);
          doc.setLineWidth(0.25);
          doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

          const link1 = "thekbclick.com";
          const sep = " / ";
          const link2 = "thekbcart.com";
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          const w1 = doc.getTextWidth(link1);
          const wSep = doc.getTextWidth(sep);
          const w2 = doc.getTextWidth(link2);
          const totalW = w1 + wSep + w2;
          const xOffset = margin + (contentWidth - totalW) / 2;
          const yPos = pageHeight - margin + 3.5;

          doc.setTextColor(0, 102, 204);
          doc.textWithLink(link1, xOffset, yPos, { url: "https://thekbclick.com" });
          doc.setTextColor(0, 0, 0);
          doc.text(sep, xOffset + w1, yPos);
          doc.setTextColor(0, 102, 204);
          doc.textWithLink(link2, xOffset + w1 + wSep, yPos, { url: "https://thekbcart.com" });
          doc.setDrawColor(0, 102, 204);
          doc.line(xOffset, yPos + 0.3, xOffset + w1, yPos + 0.3);
          doc.line(xOffset + w1 + wSep, yPos + 0.3, xOffset + w1 + wSep + w2, yPos + 0.3);
        };

        drawPageBorder();

        let cursorY = margin + 2;

        doc.setFont("times", "bold");
        doc.setFontSize(12.5);
        doc.setTextColor(...blue);
        doc.text(firmName.toUpperCase(), margin + contentWidth / 2, cursorY + 4, { align: "center" });

        doc.setFont("times", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(doc.splitTextToSize(firmAddress, contentWidth - 16), margin + contentWidth / 2, cursorY + 9, { align: "center" });
        doc.text(`Ph.${firmPhone}`, margin + contentWidth / 2, cursorY + 18, { align: "center" });
        doc.text(`Email : ${firmEmail}`, margin + contentWidth / 2, cursorY + 23, { align: "center" });

        doc.setFont("times", "bold");
        doc.setFontSize(10.5);
        doc.text(`GSTIN : ${firmGstin}`, margin + contentWidth / 2, cursorY + 28, { align: "center" });

        doc.setFont("times", "bold");
        doc.setFontSize(8.5);
        doc.setTextColor(...blue);
        doc.text("Original For Recipient [ ]", margin + contentWidth - 2, cursorY + 12, { align: "right" });
        doc.text("Duplicate For Transporter [ ]", margin + contentWidth - 2, cursorY + 18, { align: "right" });

        cursorY += 31;

        doc.setFillColor(...headerFill);
        doc.rect(margin, cursorY, contentWidth, 7.5, "FD");
        doc.setFont("times", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...blue);
        doc.text(returnTypeLabel, margin + contentWidth / 2, cursorY + 5.2, { align: "center" });
        cursorY += 7.5;

        const detailSectionHeight = 24;
        const splitX = margin + contentWidth * 0.53;
        doc.setTextColor(0, 0, 0);
        doc.rect(margin, cursorY, contentWidth, detailSectionHeight);
        doc.line(splitX, cursorY, splitX, cursorY + detailSectionHeight);

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        const leftDetailsX = margin + 1.8;
        const rightDetailsX = splitX + 1.8;
        const baseLineY = cursorY + 6;
        const rowGap = 6;

        doc.text(`Return No : ${returnNo}`, leftDetailsX, baseLineY);
        doc.text(`Return Date : ${returnDate}`, leftDetailsX, baseLineY + rowGap);
        doc.text(`State : ${receiverState}`, leftDetailsX, baseLineY + rowGap * 2);

        doc.text(`Ref. Bill No : ${data.bill_id?.bill_no || "-"}`, rightDetailsX, baseLineY);
        doc.text(`Place Of Supply : ${receiverCity}`, rightDetailsX, baseLineY + rowGap);
        cursorY += detailSectionHeight;

        doc.setFillColor(...headerFill);
        doc.rect(margin, cursorY, contentWidth, 7.5, "FD");
        doc.line(splitX, cursorY, splitX, cursorY + 7.5);
        doc.setFont("times", "bold");
        doc.setFontSize(10);
        doc.setTextColor(...blue);
        doc.text("Details of Customer", margin + 1.8, cursorY + 5.2);
        doc.text("Details of Consignee", splitX + 1.8, cursorY + 5.2);
        cursorY += 7.5;

        const partyBoxHeight = 36;
        doc.setTextColor(0, 0, 0);
        doc.rect(margin, cursorY, contentWidth, partyBoxHeight);
        doc.line(splitX, cursorY, splitX, cursorY + partyBoxHeight);

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.text(`Name : ${receiverName}`, leftDetailsX, cursorY + 6.5);
        doc.setFont("times", "normal");
        doc.text(doc.splitTextToSize(receiverAddress, contentWidth * 0.48).slice(0, 1), leftDetailsX, cursorY + 12.5);
        doc.text(`City : ${receiverCity} | GSTIN : ${receiverGstin}`, leftDetailsX, cursorY + 18.5);
        doc.text(`Phone : ${receiverPhone}`, leftDetailsX, cursorY + 24.5);

        doc.setFont("times", "bold");
        doc.text(`Name : ${receiverName}`, rightDetailsX, cursorY + 6.5);
        doc.setFont("times", "normal");
        doc.text(doc.splitTextToSize(receiverAddress, contentWidth * 0.48).slice(0, 1), rightDetailsX, cursorY + 12.5);
        doc.text(`City : ${receiverCity} | GSTIN : ${receiverGstin}`, rightDetailsX, cursorY + 18.5);
        cursorY += partyBoxHeight;

        const cellPad = 1.5;
        const fs = 7.5;
        const headFs = 7.8;
        const headPad = 3;

        const COL_W = [8, 48, 14, 10, 14, 9, 9, 14, 16, 10, 14, 18];
        const headers = ["Sr.", "Item Description", "HSN", "Qty.", "Rate", "D1%", "D2%", "Net Rate", "Taxable", "Tax%", "TaxAmt", "Amount"];
        const fallbackRow = ["1", "--", "--", "0", "0", "0", "0", "0", "0", "0", "0", "0"];

        const itemRows = parsedItems.map((item, index) => [
          String(index + 1),
          item.description,
          item.hsn,
          String(item.quantity),
          item.rate.toFixed(2),
          item.discount.toFixed(2),
          item.specialDiscount.toFixed(2),
          item.netRate.toFixed(2),
          item.taxable.toFixed(2),
          String(item.taxPercent),
          item.taxAmount.toFixed(2),
          item.amount.toFixed(2),
        ]);

        const colStyles = {};
        COL_W.forEach((w, idx) => {
          colStyles[idx] = {
            cellWidth: w,
            halign: idx === 0 ? "center" : idx === 1 || idx === 2 ? "left" : "right",
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

        cursorY = doc.lastAutoTable.finalY;

        const leftSummaryWidth = contentWidth * 0.58;
        const rightSummaryWidth = contentWidth - leftSummaryWidth;
        const summaryHeight = 42;

        doc.setDrawColor(0, 0, 0);
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, cursorY, leftSummaryWidth, summaryHeight);
        doc.rect(margin + leftSummaryWidth, cursorY, rightSummaryWidth, summaryHeight);

        doc.setFont("times", "bold");
        doc.setFontSize(8.0);
        doc.setTextColor(0, 0, 0);
        doc.text("Terms & Conditions:", margin + 2, cursorY + 4);
        doc.setFont("times", "normal");
        doc.setFontSize(7.0);
        doc.text("1. Goods once sold will not be taken back or exchanged.", margin + 2, cursorY + 7.5);
        doc.text("2. Subject to local jurisdiction only.", margin + 2, cursorY + 11);

        doc.setFont("times", "bold");
        doc.setFontSize(8.0);
        doc.text(`Bank Name : ${resolvedFirm.bank_name || "PRIME CO OP BANK LTD"}`, margin + 2, cursorY + 16);
        doc.text(`IFS Code  : ${resolvedFirm.ifsc_code || "PMEC0000010"}`, margin + 2, cursorY + 19.5);
        doc.text(`A/c No.   : ${resolvedFirm.account_number || "10032001002995"}`, margin + 2, cursorY + 23);

        doc.text(`Total Qty : ${totalQty}`, margin + 2, cursorY + 28);
        doc.text(doc.splitTextToSize(`Amount In Words: ${amountInWords}`, leftSummaryWidth - 4).slice(0, 2), margin + 2, cursorY + 32);

        const rowLeftX = margin + leftSummaryWidth + 2;
        const rowValueX = margin + contentWidth - 2;
        const summaryRowGap = 5.2;
        doc.setFont("times", "bold");
        doc.setFontSize(8.5);

        doc.text("Total Before Tax :", rowLeftX, cursorY + 5.5);
        doc.setFont("times", "normal");
        doc.text(taxableTotal.toFixed(2), rowValueX, cursorY + 5.5, { align: "right" });

        const isIntraState = receiverStateCode === extractStateCode(firmGstin);
        const sgstLabel = isIntraState ? "Add SGST :" : "Add IGST :";
        const sgstVal = isIntraState ? sgstAmount : igstAmount;
        doc.setFont("times", "bold");
        doc.text(sgstLabel, rowLeftX, cursorY + 5.5 + summaryRowGap);
        doc.setFont("times", "normal");
        doc.text(sgstVal.toFixed(2), rowValueX, cursorY + 5.5 + summaryRowGap, { align: "right" });

        if (isIntraState) {
          doc.setFont("times", "bold");
          doc.text("Add CGST :", rowLeftX, cursorY + 5.5 + summaryRowGap * 2);
          doc.setFont("times", "normal");
          doc.text(cgstAmount.toFixed(2), rowValueX, cursorY + 5.5 + summaryRowGap * 2, { align: "right" });
        }

        const taxTotalLabel = "Total Tax Amount :";
        doc.setFont("times", "bold");
        doc.text(taxTotalLabel, rowLeftX, cursorY + 5.5 + summaryRowGap * 3);
        doc.setFont("times", "normal");
        doc.text(taxTotal.toFixed(2), rowValueX, cursorY + 5.5 + summaryRowGap * 3, { align: "right" });

        doc.line(margin + leftSummaryWidth, cursorY + summaryHeight - 7, margin + contentWidth, cursorY + summaryHeight - 7);
        doc.setFont("times", "bold");
        doc.setFontSize(10.0);
        doc.setTextColor(...blue);
        doc.text("Grand Total :", rowLeftX, cursorY + summaryHeight - 2.8);
        doc.text(netTotal.toFixed(2), rowValueX, cursorY + summaryHeight - 2.8, { align: "right" });

        const footerY = cursorY + summaryHeight + 3;
        doc.setFont("times", "normal");
        doc.setFontSize(7.5);
        doc.setTextColor(0, 0, 0);
        doc.text("Receiver's Signature :", margin + 2, footerY + 12);
        doc.line(margin + 2, footerY + 9, margin + 40, footerY + 9);

        doc.text("Authorized Signatory :", margin + contentWidth - 2, footerY + 12, { align: "right" });
        doc.line(margin + contentWidth - 40, footerY + 9, margin + contentWidth - 2, footerY + 9);
      } else {
        const compactPageWidth = doc.internal.pageSize.getWidth();
        const compactPageHeight = doc.internal.pageSize.getHeight();
        const compactMargin = 6;
        const compactContentWidth = 133;
        const compactX = compactPageWidth - compactMargin - compactContentWidth;
        const compactBlue = [0, 0, 190];
        const compactBorder = [35, 35, 35];
        const compactHeaderFill = [247, 247, 247];

        const compactRows = parsedItems.map((item) => [
          item.description || "--",
          String(item.quantity || 0),
          item.rate.toFixed(2),
          item.discount.toFixed(2),
          item.specialDiscount.toFixed(2),
          item.netRate.toFixed(2),
          item.amount.toFixed(2),
        ]);

        doc.setDrawColor(...compactBorder);
        doc.setLineWidth(0.3);
        doc.rect(compactX, compactMargin, compactContentWidth, compactPageHeight - compactMargin * 2);

        let compactY = compactMargin + 4;

        doc.setFont("times", "bold");
        doc.setFontSize(14.5);
        doc.setTextColor(...compactBlue);
        doc.text(String(firmName).toUpperCase(), compactX + compactContentWidth / 2, compactY, { align: "center" });

        doc.setFont("times", "normal");
        doc.setFontSize(8.0);
        doc.text(returnTypeLabel, compactX + compactContentWidth / 2, compactY + 4.2, { align: "center" });
        
        doc.setTextColor(0, 0, 0);
        const compactFirmAddress = doc.splitTextToSize(firmAddress === "--" ? "" : firmAddress, compactContentWidth - 12);
        if (compactFirmAddress.length > 0) {
          doc.text(compactFirmAddress.slice(0, 1), compactX + compactContentWidth / 2, compactY + 7.6, { align: "center" });
        }
        doc.setFontSize(7.5);
        doc.text(`Ph., ${firmPhone}`, compactX + compactContentWidth / 2, compactY + 11.0, { align: "center" });
        
        doc.setFont("times", "bold");
        doc.setFontSize(10.0);
        doc.text(`GSTIN : ${firmGstin === "--" ? "APPLY FOR REGISTRATION" : firmGstin}`, compactX + compactContentWidth / 2, compactY + 15.5, { align: "center" });

        compactY += 17.5;

        doc.setFillColor(...compactHeaderFill);
        doc.rect(compactX, compactY, compactContentWidth, 6.5, "FD");
        doc.setFont("times", "bold");
        doc.setFontSize(11);
        doc.setTextColor(...compactBlue);
        doc.text(`* ${returnTypeLabel} *`, compactX + compactContentWidth / 2, compactY + 4.5, { align: "center" });

        compactY += 6.5;

        const detailsSplitX = compactX + compactContentWidth * 0.655;
        doc.setDrawColor(...compactBorder);
        doc.rect(compactX, compactY, compactContentWidth, 25);
        doc.line(detailsSplitX, compactY, detailsSplitX, compactY + 25);

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...compactBlue);
        doc.text(`M/s. : ${receiverName}`, compactX + 2, compactY + 5);
        doc.setFont("times", "normal");
        doc.setFontSize(8.5);
        doc.setTextColor(0, 0, 0);
        doc.text(doc.splitTextToSize(receiverAddress === "--" ? receiverCity : receiverAddress, compactContentWidth * 0.52).slice(0, 2), compactX + 9, compactY + 9.5);
        doc.text(`City --${receiverCity === "--" ? "" : receiverCity}--  Contact No.${receiverPhone === "--" ? "" : receiverPhone}`, compactX + 9, compactY + 18);

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        doc.text(`Return No.: ${returnNo}`, detailsSplitX + 2, compactY + 6);
        doc.text(`Date          : ${returnDate}`, detailsSplitX + 2, compactY + 12);
        doc.text(`Ref. Bill      : ${data.bill_id?.bill_no || "-"}`, detailsSplitX + 2, compactY + 18);

        compactY += 25;

        const summaryBoxHeight = 12;
        const footerReserve = 52;
        const startTableY = compactY;
        const tableBottomY = compactPageHeight - compactMargin - footerReserve - summaryBoxHeight;
        const headerHeight = 6.5;
        const tableHeight = tableBottomY - startTableY;
        const bodyHeight = tableHeight - headerHeight;
        
        const columnDefs = [
          { label: "Item Name", width: 57, align: "left" },
          { label: "Qty", width: 10, align: "right" },
          { label: "Rate", width: 13, align: "right" },
          { label: "D1", width: 10, align: "right" },
          { label: "D2", width: 10, align: "right" },
          { label: "Net Rate", width: 16, align: "right" },
          { label: "Amount", width: 17, align: "right" },
        ];
        
        const minRows = Math.max(compactRows.length, 12);
        const rowHeight = bodyHeight / minRows;
        const visibleRows = compactRows.length > 0 ? compactRows.slice(0, minRows) : [["--", "0", "0", "0", "0", "0", "0"]];

        doc.setDrawColor(...compactBorder);
        doc.setLineWidth(0.2);
        doc.rect(compactX, startTableY, compactContentWidth, tableHeight);
        doc.setFillColor(...compactHeaderFill);
        doc.rect(compactX, startTableY, compactContentWidth, headerHeight, "FD");
        doc.line(compactX, startTableY + headerHeight, compactX + compactContentWidth, startTableY + headerHeight);

        const columnStarts = [];
        let currentX = compactX;
        columnDefs.forEach((column, index) => {
          columnStarts.push(currentX);
          currentX += column.width;
          if (index < columnDefs.length - 1) {
            doc.line(currentX, startTableY, currentX, tableBottomY);
          }
        });

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(...compactBlue);
        columnDefs.forEach((column, index) => {
          const startX = columnStarts[index];
          if (column.align === "left") {
            doc.text(column.label, startX + 1.2, startTableY + 4.7);
          } else {
            doc.text(column.label, startX + column.width - 1.2, startTableY + 4.7, { align: "right" });
          }
        });

        doc.setFont("times", "normal");
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        visibleRows.forEach((row, rowIndex) => {
          const rowY = startTableY + headerHeight + rowIndex * rowHeight + (rowHeight * 0.72);
          row.forEach((cell, cellIndex) => {
            const value = String(cell ?? "");
            const startX = columnStarts[cellIndex];
            const width = columnDefs[cellIndex].width;
            const align = columnDefs[cellIndex].align;
            if (align === "left") {
              doc.text(doc.splitTextToSize(value, width - 2).slice(0, 1), startX + 1.2, rowY);
            } else {
              doc.text(value, startX + width - 1.2, rowY, { align: "right" });
            }
          });
        });

        const compactSummaryY = tableBottomY;
        doc.rect(compactX, compactSummaryY, compactContentWidth, summaryBoxHeight);
        let summaryLineX = compactX;
        columnDefs.forEach((column, index) => {
          summaryLineX += column.width;
          if (index < columnDefs.length - 1) {
            doc.line(summaryLineX, compactSummaryY, summaryLineX, compactSummaryY + summaryBoxHeight);
          }
        });
        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.setTextColor(0, 0, 0);
        doc.text("Total :", columnStarts[1] - 1.2, compactSummaryY + 5.5, { align: "right" });
        doc.text(String(Math.round(totalQty)), columnStarts[2] - 1.2, compactSummaryY + 5.5, { align: "right" });
        doc.text(netTotal.toFixed(2), compactX + compactContentWidth - 1.2, compactSummaryY + 5.5, { align: "right" });

        const compactFooterY = compactSummaryY + summaryBoxHeight;
        const compactFooterHeight = compactPageHeight - compactMargin - compactFooterY;
        doc.rect(compactX, compactFooterY, compactContentWidth, compactFooterHeight);
        doc.setFont("times", "bold");
        doc.setFontSize(8.5);
        doc.text("Remarks :", compactX + 1.5, compactFooterY + 4.5);
        doc.text(doc.splitTextToSize(data.note || "--", compactContentWidth - 15).slice(0, 2), compactX + 18, compactFooterY + 4.5);
        
        doc.setFont("times", "bold");
        doc.setTextColor(...compactBlue);
        doc.setFontSize(9.0);
        doc.text(`LD BAL. : ${Number(data.contact_id?.balance || 0).toFixed(2)}`, compactX + 1.5, compactFooterY + 10);
        
        doc.setTextColor(0, 0, 0);
        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.text(doc.splitTextToSize(`In Words : Rs. ${amountInWords}`, compactContentWidth - 10).slice(0, 2), compactX + 1.5, compactFooterY + 17);

        doc.setFont("times", "bold");
        doc.setFontSize(9.5);
        doc.text("E.&O.E.", compactX + 1.5, compactPageHeight - compactMargin - 6);
        doc.text("For, " + String(firmName).toUpperCase(), compactX + compactContentWidth - 2, compactPageHeight - compactMargin - 18, { align: "right" });
        doc.text("Auth. Signatory", compactX + compactContentWidth - 2, compactPageHeight - compactMargin - 4, { align: "right" });
      }

      if (action === "print") {
        doc.autoPrint();
        window.open(doc.output("bloburl"), "_blank");
      } else {
        doc.save(`${returnTypeLabel.replace(/\s+/g, "_")}_${returnNo}.pdf`);
        showToast("PDF downloaded successfully", "success");
      }
    } catch (error) {
      console.error("Failed to generate PDF:", error);
      showToast(error?.response?.data?.message || "Failed to generate PDF", "error");
    }
  };

  const columns = [
    {
      key: "serial",
      label: "ID",
      render: (_val, _row, index) => (
        <span className="text-xs sm:text-sm">{index + 1}</span>
      ),
    },
    {
      key: "return_no",
      label: "Return No",
      render: (value) => (
        <span className="text-xs sm:text-sm font-medium">{value}</span>
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
      key: "return_type",
      label: "Type",
      render: (value) => (
        <span
          className={`px-2 py-1 text-xs rounded-full ${
            value === "sale_return" ?
              "bg-red-100 text-red-800"
            : "bg-blue-100 text-blue-800"
          }`}
        >
          {value === "sale_return" ? "Sale Return" : "Purchase Return"}
        </span>
      ),
    },
    {
      key: "contact_name",
      label: "Contact",
      render: (value) => (
        <span className="text-xs sm:text-sm">{value || "-"}</span>
      ),
    },
    {
      key: "reference",
      label: "Reference",
      render: (_val, row) => (
        <span className="text-xs sm:text-sm">
          {row.bill_no || row.challan_no}
        </span>
      ),
    },
    {
      key: "items_count",
      label: "Items",
      render: (value) => <span className="text-xs sm:text-sm">{value}</span>,
    },
    {
      key: "pcs_count",
      label: "PCS",
      render: (value) => (
        <span className="text-xs sm:text-sm">{toNumber(value, 0)}</span>
      ),
    },
    {
      key: "damaged_pcs_count",
      label: "Damaged",
      render: (value) => (
        <span className="text-xs sm:text-sm">{toNumber(value, 0)}</span>
      ),
    },
    {
      key: "total_amount",
      label: "Total Amount",
      render: (value) => (
        <span className="text-xs sm:text-sm">
          Rs {toNumber(value, 0).toFixed(2)}
        </span>
      ),
    },
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: async (entry) => {
        try {
          const response = await api.get(`/returns/${entry.id}`);
          const data = getResponseData(response);
          setFormData({
            return_no: data?.return_no || "Auto Generated",
            date: convertDateFromISO(data?.date) || getToday(),
            return_type: data?.return_type || "sale_return",
            contact_id: getEntityId(data?.contact_id) || "",
            bill_id: getEntityId(data?.bill_id) || "",
            challan_id: getEntityId(data?.challan_id) || "",
            items:
              Array.isArray(data?.items) && data.items.length > 0 ?
                data.items.map((item) => ({
                  item_id: getEntityId(item?.item_id) || "",
                  quantity: toNumber(item?.quantity, 1),
                  rate: toNumber(item?.rate, 0),
                  discount: toNumber(item?.discount, 0),
                  special_discount: toNumber(item?.special_discount, 0),
                  gst_percent: toNumber(item?.gst_percent, 0),
                  gst_amount: toNumber(item?.gst_amount, 0),
                  taxable_amount: toNumber(item?.taxable_amount, 0),
                  amount: toNumber(item?.amount, 0),
                  is_damaged: item?.is_damaged === true,
                  is_gst: toNumber(item?.is_gst, 1),
                }))
              : [createEmptyItem()],
            total_amount: toNumber(data?.total_amount, 0),
            note: data?.note || "",
          });
          setIsAddModalOpen(true);
        } catch (error) {
          console.error("Failed to load return for edit:", error);
          showToast(
            error?.response?.data?.message || "Failed to load return",
            "error",
          );
        }
      },
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaEye size={10} className="sm:size-3 md:size-4" />,
      onClick: async (entry) => {
        setPreviewDialog({ isOpen: true, loading: true, data: null });
        try {
          const response = await api.get(`/returns/${entry.id}`);
          const data = getResponseData(response);
          setPreviewDialog({ isOpen: true, loading: false, data });
        } catch (error) {
          console.error("Failed to load return preview:", error);
          showToast(
            error?.response?.data?.message || "Failed to load return preview",
            "error",
          );
          setPreviewDialog({ isOpen: false, loading: false, data: null });
        }
      },
      className:
        "bg-slate-600 text-white hover:bg-slate-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaPrint size={10} className="sm:size-3 md:size-4" />,
      onClick: (entry) => generateReturnPDF(entry, "print"),
      className:
        "bg-indigo-600 text-white hover:bg-indigo-700 p-1 sm:p-1.5 md:p-2 text-xs",
      title: "Print Return Invoice",
    },
    {
      label: <FaDownload size={10} className="sm:size-3 md:size-4" />,
      onClick: (entry) => generateReturnPDF(entry, "download"),
      className:
        "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
      title: "Download Return Invoice",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (entry) =>
        setDeleteDialog({
          isOpen: true,
          returnId: entry.id,
          itemName: entry.return_no,
        }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  const openAddModal = () => {
    if (bills.length === 0 || contacts.length === 0) {
      // Refetch master data to ensure dropdowns are populated.
      fetchFormOptions().catch((error) =>
        console.error(
          "Failed to refresh form options before adding return",
          error,
        ),
      );
    }
    setFormData(getInitialFormData());
    setReferenceItems([]);
    setIsAddModalOpen(true);
  };

  const updateItems = (updater) => {
    setFormData((prev) => {
      const nextItems = updater(prev.items.map((item) => ({ ...item })));
      const recalculatedItems = nextItems.map(calculateItemLine);
      const totalAmount = Math.ceil(
        recalculatedItems.reduce(
          (sum, item) => sum + toNumber(item.amount, 0),
          0,
        ),
      );

      return {
        ...prev,
        items: recalculatedItems,
        total_amount: totalAmount,
      };
    });
  };

  const handleItemFieldChange = (index, field, value) => {
    updateItems((items) => {
      const currentItem = items[index];
      if (!currentItem) return items;

      if (field === "item_id") {
        currentItem.item_id = value;
        const selectedItem = referenceItems.find((item) => item.id === value);
        if (selectedItem) {
          currentItem.rate = toNumber(selectedItem.rate, 0);
          currentItem.discount = toNumber(selectedItem.discount, 0);
          currentItem.special_discount = toNumber(
            selectedItem.special_discount,
            0,
          );
          currentItem.item_discount = toNumber(selectedItem.item_discount, 0);
          currentItem.item_dis2 = toNumber(selectedItem.item_dis2, 0);
          currentItem.dis3 = toNumber(selectedItem.dis3, 0);
          currentItem.gst_percent = toNumber(selectedItem.gst_percent, 0);
          currentItem.is_gst = toNumber(selectedItem.is_gst, 1);
          currentItem.source_quantity = toNumber(
            selectedItem.billed_quantity,
            0,
          );
          currentItem.source_gross_amount = toNumber(
            selectedItem.gross_amount,
            0,
          );
          currentItem.source_discount_amount = toNumber(
            selectedItem.discount_amount,
            0,
          );
          currentItem.source_total_discount = toNumber(
            selectedItem.total_discount,
            0,
          );
          currentItem.source_taxable_amount = toNumber(
            selectedItem.taxable_amount,
            0,
          );
          currentItem.source_gst_amount = toNumber(selectedItem.gst_amount, 0);
          currentItem.source_amount = toNumber(selectedItem.amount, 0);
          currentItem.quantity = Math.min(
            Math.max(1, toNumber(currentItem.quantity, 1)),
            selectedItem.returnable_quantity,
          );
        } else {
          currentItem.rate = 0;
          currentItem.gst_percent = 0;
          currentItem.source_quantity = 0;
          currentItem.quantity = 1;
        }
        return items;
      }

      if (field === "is_damaged") {
        currentItem.is_damaged = value === true;
        return items;
      }

      if (field === "is_gst") {
        currentItem.is_gst = Number(value) === 1 ? 1 : 0;
        return items;
      }

      if (field === "quantity") {
        const ref = referenceItems.find(
          (item) => item.id === currentItem.item_id,
        );
        const parsedQty = Math.max(1, toNumber(value, 1));
        currentItem.quantity =
          ref ? Math.min(parsedQty, ref.returnable_quantity) : parsedQty;
        return items;
      }

      currentItem[field] = toNumber(value, 0);
      return items;
    });
  };

  const handleAddItem = () => {
    updateItems((items) => [...items, createEmptyItem()]);
  };

  const handleRemoveItem = (index) => {
    updateItems((items) => {
      const nextItems = items.filter((_, itemIndex) => itemIndex !== index);
      return nextItems.length > 0 ? nextItems : [createEmptyItem()];
    });
  };

  const validateForm = () => {
    if (!formData.date) {
      showToast("Please select return date", "error");
      return false;
    }

    if (!formData.bill_id) {
      showToast("Please select bill for return", "error");
      return false;
    }

    if (referenceLoading) {
      showToast("Bill items are still loading, please wait", "error");
      return false;
    }

    const selectedItems = formData.items.filter((item) => item.item_id);
    if (selectedItems.length === 0) {
      showToast("Please select at least one item", "error");
      return false;
    }

    const refMap = new Map(referenceItems.map((item) => [item.id, item]));
    for (const line of selectedItems) {
      const ref = refMap.get(line.item_id);
      if (!ref) {
        showToast("Selected item is not part of this bill", "error");
        return false;
      }
      const qty = toNumber(line.quantity, 0);
      if (qty > ref.returnable_quantity + 0.0001) {
        showToast(
          `Return quantity exceeds returnable qty for '${ref.name}'. Max: ${ref.returnable_quantity}`,
          "error",
        );
        return false;
      }
    }

    const hasInvalidQty = selectedItems.some(
      (item) => toNumber(item.quantity, 0) <= 0,
    );
    if (hasInvalidQty) {
      showToast("Item quantity should be greater than 0", "error");
      return false;
    }

    return true;
  };

  const handleSave = async (event) => {
    event.preventDefault();
    if (saving || !validateForm()) return;

    const processedItems = formData.items
      .filter((item) => item.item_id)
      .map(calculateItemLine)
      .map((item) => ({
        item_id: item.item_id,
        quantity: item.quantity,
        rate: item.rate,
        discount: item.discount,
        special_discount: item.special_discount,
        item_discount: item.item_discount,
        item_dis2: item.item_dis2,
        dis3: item.dis3,
        gross_amount: item.gross_amount,
        discount_amount: item.discount_amount,
        total_discount: item.total_discount,
        gst_percent: item.gst_percent,
        gst_amount: item.gst_amount,
        taxable_amount: item.taxable_amount,
        amount: item.amount,
        is_damaged: item.is_damaged,
        is_gst: item.is_gst,
      }));

    const payload = {
      date: convertDateToISO(formData.date),
      items: processedItems,
      note: formData.note?.trim() || "",
    };

    const endpoint =
      formData.return_type === "sale_return" ?
        "/returns/sale"
      : "/returns/purchase";
    payload.bill_id = formData.bill_id;

    setSaving(true);
    try {
      await api.post(endpoint, payload);
      showToast("Return created successfully", "success");
      setFormData(getInitialFormData());
      setReferenceItems([]);
      setShowOutstandingInline(false);
      await fetchReturns();
      focusFirstField();
    } catch (error) {
      console.error("Failed to create return:", error);
      showToast(
        error?.response?.data?.message || "Failed to create return",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  useSaveShortcut(
    () => handleSave({ preventDefault: () => {} }),
    isAddModalOpen,
  );

  const handleDeleteReturn = async () => {
    if (!deleteDialog.returnId) return;
    try {
      await api.delete(`/returns/${deleteDialog.returnId}`);
      showToast("Return deleted successfully", "success");
      setDeleteDialog({ isOpen: false, returnId: "", itemName: "" });
      await fetchReturns();
    } catch (error) {
      console.error("Failed to delete return:", error);
      showToast(
        error?.response?.data?.message || "Failed to delete return",
        "error",
      );
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Return Master
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm">
            Manage sale and purchase return entries
          </p>
        </div>
        <Button
          onClick={openAddModal}
          className="flex items-center gap-2 text-xs sm:text-sm"
          disabled={loading}
        >
          <FaPlus className="text-sm sm:text-base" />
          Add Return
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-white border rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500">Total Items Returned</div>
          <div className="text-xl font-semibold text-gray-900">
            {returnSummary.totalItemsReturned.toLocaleString()}
          </div>
        </div>
        <div className="bg-white border rounded-lg px-4 py-3">
          <div className="text-xs text-gray-500">Damaged Items Returned</div>
          <div className="text-xl font-semibold text-red-600">
            {returnSummary.damagedItemsReturned.toLocaleString()}
          </div>
        </div>
      </div>

      <DataTable
        loading={loading}
        columns={columns}
        data={returns}
        actions={actions}
        searchable
        sortable
        pagination
      />

      {/*
        Original outstanding section removed; will appear within add-return modal
        so settlement can be done per-contact while creating a return.
      */}

      <Modal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setFormData(getInitialFormData());
          setReferenceItems([]);
          setShowOutstandingInline(false);
        }}
        title="Add Return"
        size="6xl"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Return No</label>
              <input
                type="text"
                value={formData.return_no}
                readOnly
                className="w-full px-3 py-2 border rounded-md text-sm bg-gray-50"
              />
            </div> */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Return Type
              </label>
              <select
                ref={firstFieldRef}
                value={formData.return_type}
                onChange={(event) => handleReturnTypeChange(event.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="sale_return">Sale Return</option>
                <option value="purchase_return">Purchase Return</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date
              </label>
              <input
                type="text"
                placeholder="dd/mm/yyyy"
                value={formData.date}
                onChange={(event) => {
                  setFormData((prev) => ({
                    ...prev,
                    date: normalizeDisplayDateInput(event.target.value),
                  }));
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact
              </label>
              <select
                value={formData.contact_id}
                onChange={(event) => handleContactChange(event.target.value)}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="">Select Contact</option>
                {filteredContacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isSaleReturn ? "Sale Bill" : "Purchase Bill"}
              </label>
              <select
                value={formData.bill_id}
                onChange={(event) => {
                  const selectedBillId = event.target.value;
                  const selectedBill = bills.find(
                    (bill) => bill.id === selectedBillId,
                  );
                  setFormData((prev) => ({
                    ...prev,
                    bill_id: selectedBillId,
                    challan_id: "",
                    contact_id: selectedBill?.contact_id || prev.contact_id,
                    items: [createEmptyItem()],
                    total_amount: 0,
                  }));
                  setReferenceItems([]);
                }}
                className="w-full px-3 py-2 border rounded-md text-sm"
              >
                <option value="">Select Bill</option>
                {filteredBills.map((bill) => (
                  <option key={bill.id} value={bill.id}>
                    {bill.bill_no} - {bill.contact_name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {/* inline outstanding toggle */}
          {formData.contact_id && (
            <div className="mt-4 border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">
                  Outstanding Settlement
                </h3>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setShowOutstandingInline((prev) => !prev)}
                >
                  {showOutstandingInline ? "Hide" : "Show"}
                </Button>
              </div>
              {showOutstandingInline && (
                <div className="border-t pt-3">
                  <OutStandings
                    isEmbedded
                    defaultContactType={isSaleReturn ? "party" : "supplier"}
                    lockContactType
                    initialContact={formData.contact_id}
                    lockContact
                  />
                </div>
              )}
            </div>
          )}

          <div className="border rounded-lg">
            <div className="flex items-center justify-between px-4 py-2 bg-gray-100 border-b">
              <h3 className="font-medium text-gray-900">Items</h3>
              <Button type="button" size="sm" onClick={handleAddItem}>
                Add Item
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-2 py-2 text-left border-r">SNo</th>
                    <th className="px-2 py-2 text-left border-r">Item</th>
                    <th className="px-2 py-2 text-left border-r">Qty</th>
                    <th className="px-2 py-2 text-left border-r">Rate (₹)</th>
                    <th className="px-2 py-2 text-left border-r">Dis (%)</th>
                    <th className="px-2 py-2 text-left border-r">SP Dis (%)</th>
                    <th className="px-2 py-2 text-left border-r">
                      Item Disc (%)
                    </th>
                    <th className="px-2 py-2 text-left border-r">
                      Item Disc2 (%)
                    </th>
                    <th className="px-2 py-2 text-left border-r">Disc Amt</th>
                    <th className="px-2 py-2 text-left border-r">GST (%)</th>
                    <th className="px-2 py-2 text-left border-r">Taxable</th>
                    <th className="px-2 py-2 text-left border-r">
                      GST Amt (₹)
                    </th>
                    <th className="px-2 py-2 text-left border-r">Amount (₹)</th>
                    <th className="px-2 py-2 text-left border-r">Damaged</th>
                    <th className="px-2 py-2 text-left border-r">GST Type</th>
                    <th className="px-2 py-2 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {formData.items.map((item, index) => (
                    <tr key={`item-row-${index}`} className="border-t">
                      <td className="px-2 py-2 border-r">{index + 1}</td>
                      <td className="px-2 py-2 border-r min-w-[220px]">
                        <select
                          value={item.item_id}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "item_id",
                              event.target.value,
                            )
                          }
                          disabled={!formData.bill_id || referenceLoading}
                          className="w-full px-2 py-1 border rounded text-xs disabled:bg-gray-100"
                        >
                          <option value="">
                            {referenceLoading ?
                              "Loading bill items..."
                            : formData.bill_id ?
                              "Select Item"
                            : "Select Bill First"}
                          </option>
                          {referenceItems.map((refItem) => (
                            <option key={refItem.id} value={refItem.id}>
                              {refItem.name} (Max {refItem.returnable_quantity})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "quantity",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          disabled={!item.item_id}
                          className="w-16 px-1 py-1 border rounded text-xs disabled:bg-gray-100"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.item_discount}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "item_discount",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.item_dis2}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "item_dis2",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.dis3}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "dis3",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.rate}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "rate",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-20 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.discount}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "discount",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.special_discount}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "special_discount",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={item.gst_percent}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "gst_percent",
                              event.target.value,
                            )
                          }
                          onWheel={(e) => e.target.blur()}
                          className="w-16 px-1 py-1 border rounded text-xs"
                        />
                      </td>
                      <td className="px-2 py-2 border-r text-xs">
                        {toNumber(item.taxable_amount, 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 border-r text-xs">
                        {toNumber(item.gst_amount, 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 border-r text-xs font-medium">
                        {toNumber(item.amount, 0).toFixed(2)}
                      </td>
                      <td className="px-2 py-2 border-r">
                        <input
                          type="checkbox"
                          checked={item.is_damaged === true}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "is_damaged",
                              event.target.checked,
                            )
                          }
                        />
                      </td>
                      <td className="px-2 py-2 border-r">
                        <select
                          value={item.is_gst}
                          onChange={(event) =>
                            handleItemFieldChange(
                              index,
                              "is_gst",
                              event.target.value,
                            )
                          }
                          className="w-16 px-1 py-1 border rounded text-xs"
                        >
                          <option value={1}>1</option>
                          <option value={0}>0</option>
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-600 hover:text-red-800"
                          title="Remove Item"
                        >
                          <FaTrash size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note
              </label>
              <textarea
                value={formData.note}
                onChange={(event) =>
                  setFormData((prev) => ({ ...prev, note: event.target.value }))
                }
                rows={3}
                className="w-full px-3 py-2 border rounded-md text-sm"
                placeholder="Enter note"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total Amount
              </label>
              <input
                type="number"
                value={Math.ceil(toNumber(formData.total_amount, 0))}
                readOnly
                className="w-full px-3 py-2 border rounded-md text-sm bg-gray-50"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Return"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAddModalOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Modal>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() =>
          setDeleteDialog({ isOpen: false, returnId: "", itemName: "" })
        }
        onConfirm={handleDeleteReturn}
        itemName={deleteDialog.itemName || "this return"}
      />

      <Modal
        isOpen={previewDialog.isOpen}
        onClose={() =>
          setPreviewDialog({ isOpen: false, loading: false, data: null })
        }
        title="Return Preview"
        size="6xl"
      >
        {previewDialog.loading ?
          <div className="py-10 text-center text-sm text-gray-600">
            Loading preview...
          </div>
        : (() => {
            const data = previewDialog.data || {};
            const returnType =
              data?.return_type === "sale_return" ?
                "Sale Return"
              : "Purchase Return";
            const refNo =
              data?.bill_id?.bill_no || data?.challan_id?.challan_no || "-";
            const items = Array.isArray(data?.items) ? data.items : [];

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-xs text-gray-500">Return No</div>
                    <div className="font-medium text-gray-900">
                      {data?.return_no || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Return Type</div>
                    <div className="font-medium text-gray-900">
                      {returnType}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Date</div>
                    <div className="font-medium text-gray-900">
                      {formatDate(data?.date)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Contact</div>
                    <div className="font-medium text-gray-900">
                      {data?.contact_id?.name || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Reference</div>
                    <div className="font-medium text-gray-900">{refNo}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Total Amount</div>
                    <div className="font-medium text-gray-900">
                      Rs {Math.ceil(toNumber(data?.total_amount, 0))}
                    </div>
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="px-4 py-2 bg-gray-100 border-b text-sm font-medium text-gray-900">
                    Items
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-2 py-2 text-left border-r">SNo</th>
                          <th className="px-2 py-2 text-left border-r">Item</th>
                          <th className="px-2 py-2 text-left border-r">Qty</th>
                          <th className="px-2 py-2 text-left border-r">Rate</th>
                          <th className="px-2 py-2 text-left border-r">
                            Dis %
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            SP Dis %
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            GST %
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            Taxable
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            GST Amt
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            Amount
                          </th>
                          <th className="px-2 py-2 text-left border-r">
                            Damaged
                          </th>
                          <th className="px-2 py-2 text-left">GST Type</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.length === 0 ?
                          <tr>
                            <td
                              colSpan={12}
                              className="px-3 py-4 text-center text-gray-500"
                            >
                              No items available.
                            </td>
                          </tr>
                        : items.map((item, index) => {
                            const itemRef = item?.item_id || {};
                            const itemName =
                              itemRef?.item_name ||
                              itemRef?.name ||
                              item?.item_name ||
                              item?.name ||
                              "-";
                            return (
                              <tr
                                key={`preview-item-${index}`}
                                className="border-t"
                              >
                                <td className="px-2 py-2 border-r">
                                  {index + 1}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {itemName}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.quantity, 0)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.rate, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.discount, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.special_discount, 0).toFixed(
                                    2,
                                  )}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.gst_percent, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.taxable_amount, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.gst_amount, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {toNumber(item?.amount, 0).toFixed(2)}
                                </td>
                                <td className="px-2 py-2 border-r">
                                  {item?.is_damaged ? "Yes" : "No"}
                                </td>
                                <td className="px-2 py-2">
                                  {Number(item?.is_gst ?? 1) === 1 ? "1" : "0"}
                                </td>
                              </tr>
                            );
                          })
                        }
                      </tbody>
                    </table>
                  </div>
                </div>

                {data?.note ?
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">Note</div>
                    <div className="text-gray-800">{data.note}</div>
                  </div>
                : null}
              </div>
            );
          })()
        }
      </Modal>
    </div>
  );
};

export default ReturnMaster;
