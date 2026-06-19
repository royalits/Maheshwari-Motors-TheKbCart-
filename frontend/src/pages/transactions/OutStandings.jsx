import React, { useEffect, useMemo, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { Button, Input, Select, Textarea } from "../../components/ui";
import { Modal } from "../../components/common";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseList,
  normalizeContact,
  toNumber,
} from "../../services/apiUtils";
import { getResolvedFirmMeta } from "../../utils/reportPdf";
import { FaCalculator, FaLayerGroup, FaMoneyBillWave } from "react-icons/fa";

const PAYMENT_TYPES = [
  {
    value: "bank_transaction_received_amount",
    label: "Bank Transaction Received Amount",
    hint: "Payment received from party via bank.",
    contactType: "party",
  },
  {
    value: "cash_payment_received_amount",
    label: "Cash Payment Received Amount",
    hint: "Payment received from party in cash.",
    contactType: "party",
  },
  {
    value: "bank_transfer_payment_given",
    label: "Bank Transfer Payment Given",
    hint: "Payment returned to supplier via bank transfer.",
    contactType: "supplier",
  },
  {
    value: "cash_payment_given",
    label: "Cash Payment Given",
    hint: "Payment returned to supplier in cash.",
    contactType: "supplier",
  },
];

const BANK_REQUIRED = new Set([
  "bank_transaction_received_amount",
  "bank_transfer_payment_given",
]);

const PAYMENT_TYPE_BY_TRANSACTION_TYPE = {
  bank_received: "bank_transaction_received_amount",
  cash_received: "cash_payment_received_amount",
  bank_payment: "bank_transfer_payment_given",
  cash_payment: "cash_payment_given",
};

const getPaymentTypeFromTransactionType = (type) =>
  PAYMENT_TYPE_BY_TRANSACTION_TYPE[String(type || "").toLowerCase()] || "";

const padDatePart = (value) => String(value).padStart(2, "0");

const formatDateInput = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

const formatDateForDisplay = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${padDatePart(value.getDate())}/${padDatePart(value.getMonth() + 1)}/${value.getFullYear()}`;
  }

  const normalizedValue = String(value).trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const isoMatch = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${day}/${month}/${year}`;
  }

  return formatDateInput(normalizedValue);
};

const parseDisplayDate = (value) => {
  const normalizedValue = formatDateForDisplay(value);
  const match = normalizedValue.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) return "";

  const [, day, month, year] = match;
  const parsedDate = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.getFullYear() !== Number(year) ||
    parsedDate.getMonth() !== Number(month) - 1 ||
    parsedDate.getDate() !== Number(day)
  ) {
    return "";
  }

  return `${year}-${month}-${day}`;
};

const OutStandings = ({
  isEmbedded = false,
  defaultContactType = "party",
  lockContactType = false,
  // when provided the component will preselect and optionally lock a contact
  initialContact = "",
  lockContact = false,
}) => {
  const { showToast } = useStore();
  const location = useLocation();
  const settlementState = useMemo(() => {
    if (location.state?.settleTransaction) return location.state.settleTransaction;

    const params = new URLSearchParams(location.search || "");
    if (params.get("settle") !== "1") return null;

    return {
      contact_type: params.get("contact_type") || "party",
      contact_id: params.get("contact_id") || "",
      transaction_id: params.get("transaction_id") || "",
      type: params.get("type") || "",
      payment_type: params.get("payment_type") || "",
      amount: params.get("amount") || "",
      bank_id: params.get("bank_id") || "",
      reference_no: params.get("reference_no") || "",
      date: params.get("date") || "",
    };
  }, [location.state, location.search]);
  const settlementStateKey = useMemo(() => {
    if (!settlementState) return "";
    return [
      settlementState.contact_type,
      settlementState.contact_id,
      settlementState.transaction_id,
      settlementState.type,
      settlementState.payment_type,
      settlementState.amount,
      settlementState.bank_id,
      settlementState.reference_no,
      settlementState.date,
    ].join("|");
  }, [settlementState]);
  const settlementStateAppliedRef = useRef("");
  const [loading, setLoading] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [parties, setParties] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [banks, setBanks] = useState([]);
  const firstFieldRef = useRef(null);
  const [contactType, setContactType] = useState(
    defaultContactType === "supplier" ? "supplier" : "party",
  );
  const [selectedContact, setSelectedContact] = useState(initialContact || "");
  const [bills, setBills] = useState([]);
  const [allocations, setAllocations] = useState({});
  const [discountDrafts, setDiscountDrafts] = useState({});
  const [lastSettlement, setLastSettlement] = useState(null);
  const [isReceiptOpen, setIsReceiptOpen] = useState(false);
  const [payment, setPayment] = useState({
    amount: "",
    payment_type: "bank_transaction_received_amount",
    bank_id: "",
    reference_no: "",
    note: "",
    date: formatDateForDisplay(new Date()),
    apply_remaining_to_balance: false,
  });

  const contacts = contactType === "party" ? parties : suppliers;
  const availablePaymentTypes = useMemo(
    () => PAYMENT_TYPES.filter((type) => type.contactType === contactType),
    [contactType],
  );
  const selectedContactDetails = contacts.find((c) => c.id === selectedContact);
  const selectedContactBalance = toNumber(selectedContactDetails?.balance, 0);
  const selectedPaymentType = PAYMENT_TYPES.find(
    (p) => p.value === payment.payment_type,
  );
  const shouldShowBank = BANK_REQUIRED.has(payment.payment_type);
  const selectedBank = banks.find(
    (bank) => String(bank.id) === String(payment.bank_id),
  );

  const billMap = useMemo(
    () => new Map(bills.map((bill) => [bill.id, bill])),
    [bills],
  );

  const totals = useMemo(() => {
    const totalAmount = toNumber(payment.amount, 0);
    const allocatedAmount = bills.reduce((sum, bill) => {
      return sum + toNumber(allocations[bill.id], 0);
    }, 0);
    const settlementDiscountAmount = bills.reduce((sum, bill) => {
      return sum + toNumber(discountDrafts[bill.id], 0);
    }, 0);
    const totalAllocatedAmount = Number(allocatedAmount.toFixed(2));
    const totalSettlementDiscountAmount = Number(
      settlementDiscountAmount.toFixed(2),
    );
    const totalDue = bills.reduce(
      (sum, bill) => sum + toNumber(bill.due, 0),
      0,
    );
    const remaining = Number((totalAmount - allocatedAmount).toFixed(2));
    const dueAfterSettlement = Math.max(
      0,
      Number((totalDue - allocatedAmount - settlementDiscountAmount).toFixed(2)),
    );
    return {
      totalAmount,
      allocatedAmount,
      totalAllocatedAmount,
      settlementDiscountAmount,
      totalSettlementDiscountAmount,
      totalDue,
      remaining,
      dueAfterSettlement,
    };
  }, [payment.amount, allocations, discountDrafts, bills]);

  useEffect(() => {
    const timer = setTimeout(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select?.();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loadBaseData = async () => {
      try {
        const [partyRes, supplierRes, bankRes] = await Promise.all([
          api.get("/contacts/parties", { params: { page: 1, limit: 200 } }),
          api.get("/contacts/suppliers", { params: { page: 1, limit: 200 } }),
          api.get("/banks"),
        ]);

        const mappedParties = getResponseList(partyRes).map((contact) => {
          const normalized = normalizeContact(contact);
          return {
            id: normalized.id,
            name: normalized.name,
            balance: toNumber(contact?.balance ?? contact?.balance_amount, 0),
            raw: contact,
          };
        });

        const mappedSuppliers = getResponseList(supplierRes).map((contact) => {
          const normalized = normalizeContact(contact);
          return {
            id: normalized.id,
            name: normalized.name,
            balance: toNumber(contact?.balance ?? contact?.balance_amount, 0),
            raw: contact,
          };
        });

        const mappedBanks = getResponseList(bankRes).map((bank) => ({
          id: getEntityId(bank) || bank._id,
          name: bank.bank_name || bank.name || "Bank",
          account: bank.account_number || bank.accountNo || "",
        }));

        setParties(mappedParties);
        setSuppliers(mappedSuppliers);
        setBanks(mappedBanks);
      } catch (error) {
        console.error("Failed to load base data", error);
        showToast(
          error?.response?.data?.message || "Failed to load parties/banks",
          "error",
        );
      }
    };

    loadBaseData();
  }, [showToast]);

  useEffect(() => {
    if (lockContact && initialContact) {
      // keep the locked contact selection when type changes
      setSelectedContact(initialContact);
    } else {
      setSelectedContact("");
      setBills([]);
      setAllocations({});
      setDiscountDrafts({});
      setPayment((prev) => ({
        ...prev,
        payment_type:
          contactType === "supplier"
            ? "bank_transfer_payment_given"
            : "bank_transaction_received_amount",
      }));
    }
  }, [contactType, lockContact, initialContact]);

  useEffect(() => {
    if (!settlementState || settlementStateAppliedRef.current === settlementStateKey) {
      return;
    }

    const nextContactType =
      settlementState.contact_type === "supplier" ? "supplier" : "party";
    if (contactType !== nextContactType) {
      setContactType(nextContactType);
      return;
    }

    const nextPaymentType =
      settlementState.payment_type ||
      getPaymentTypeFromTransactionType(settlementState.type) ||
      (nextContactType === "supplier"
        ? "bank_transfer_payment_given"
        : "bank_transaction_received_amount");

    setSelectedContact(String(settlementState.contact_id || ""));
    setPayment((prev) => ({
      ...prev,
      amount:
        settlementState.amount !== undefined && settlementState.amount !== null
          ? String(settlementState.amount)
          : prev.amount,
      payment_type: nextPaymentType,
      bank_id: BANK_REQUIRED.has(nextPaymentType)
        ? String(settlementState.bank_id || "")
        : "",
      reference_no: settlementState.reference_no || "",
      date: formatDateForDisplay(settlementState.date) || prev.date,
      apply_remaining_to_balance: false,
    }));
    settlementStateAppliedRef.current = settlementStateKey;
  }, [settlementState, settlementStateKey, contactType]);

  useEffect(() => {
    const hasValidPaymentType = availablePaymentTypes.some(
      (type) => type.value === payment.payment_type,
    );
    const fallbackPaymentType = availablePaymentTypes[0]?.value || "";

    if (!hasValidPaymentType && fallbackPaymentType) {
      setPayment((prev) => ({
        ...prev,
        payment_type: fallbackPaymentType,
        bank_id: BANK_REQUIRED.has(fallbackPaymentType) ? prev.bank_id : "",
      }));
      return;
    }

    if (!BANK_REQUIRED.has(payment.payment_type) && payment.bank_id) {
      setPayment((prev) => ({ ...prev, bank_id: "" }));
    }
  }, [availablePaymentTypes, payment.payment_type, payment.bank_id]);

  useEffect(() => {
    // Keep contact type synced with parent defaults when locked.
    if (lockContactType) {
      const next = defaultContactType === "supplier" ? "supplier" : "party";
      if (next !== contactType) {
        setContactType(next);
      }
    }
  }, [defaultContactType, lockContactType, contactType]);

  // keep selectedContact synced with prop when it changes
  useEffect(() => {
    if (initialContact) {
      setSelectedContact(initialContact);
    }
  }, [initialContact]);

  useEffect(() => {
    if (!selectedContact) {
      setBills([]);
      setAllocations({});
      setDiscountDrafts({});
      setPayment((prev) => ({ ...prev, amount: "" }));
      return;
    }

    const fetchBills = async () => {
      try {
        setLoadingBills(true);
        const response = await api.get(`/bills/contact/${selectedContact}`, {
          params: { page: 1, limit: 200, payment_status: "due" },
          skipCache: true,
        });

        const list = getResponseList(response).map((bill) => {
	          const amount = toNumber(bill.amount ?? bill.total_amount, 0);
	          const paidAmount = toNumber(bill.paid_amount ?? bill.paidAmount, 0);
	          const returnAmount = toNumber(
	            bill.return_amount ?? bill.returnAmount,
	            0,
	          );
	          const settlementDiscount = toNumber(
	            bill.settlement_discount ?? bill.settlementDiscount,
	            0,
	          );
	          const dueAmount = toNumber(
	            amount - paidAmount - returnAmount - settlementDiscount,
	            0,
	          );
          return {
            id: getEntityId(bill) || bill._id,
            billNo: bill.bill_no || bill.billNo || bill.id || "-",
            date: bill.date,
	            amount,
	            paidAmount,
	            returnAmount,
	            settlementDiscount,
            due: Number(dueAmount.toFixed(2)),
            status: bill.payment_status || "due",
          };
        });

        const sorted = [...list].sort(
          (a, b) => new Date(a.date) - new Date(b.date),
        );
        setBills(sorted);

        const contactBalanceAmount = Math.max(0, selectedContactBalance);
        const routedTransactionMatches =
          settlementStateAppliedRef.current === settlementStateKey &&
          settlementState &&
          String(settlementState.contact_id || "") === String(selectedContact);
        const suggestedPaymentType =
          routedTransactionMatches
            ? settlementState.payment_type ||
              getPaymentTypeFromTransactionType(settlementState.type)
            : availablePaymentTypes[0]?.value || "";
        const suggestedBankId =
          routedTransactionMatches ? settlementState.bank_id : "";
        const suggestedReference =
          routedTransactionMatches ? settlementState.reference_no : "";
        const suggestedDate =
          routedTransactionMatches ? settlementState.date : "";

        setPayment((prev) => ({
          ...prev,
          amount: contactBalanceAmount ? String(contactBalanceAmount) : "",
          payment_type: suggestedPaymentType || prev.payment_type,
          bank_id:
            suggestedPaymentType && BANK_REQUIRED.has(suggestedPaymentType)
              ? String(suggestedBankId || "")
              : suggestedPaymentType
                ? ""
                : prev.bank_id,
          reference_no: suggestedReference || prev.reference_no,
          date: formatDateForDisplay(suggestedDate) || prev.date,
          apply_remaining_to_balance: false,
        }));

        const nextAllocations = {};
        sorted.forEach((bill) => {
          nextAllocations[bill.id] = "";
        });
        setAllocations(nextAllocations);
        setDiscountDrafts({});
      } catch (error) {
        console.error("Failed to fetch bills", error);
        showToast(
          error?.response?.data?.message || "Failed to load bills",
          "error",
        );
      } finally {
        setLoadingBills(false);
      }
    };

    fetchBills();
  }, [
    selectedContact,
    selectedContactBalance,
    contactType,
    availablePaymentTypes,
    showToast,
    settlementState,
    settlementStateKey,
  ]);

  const clearDiscountDraft = (billId) => {
    setDiscountDrafts((prev) => {
      if (!prev[billId]) return prev;
      const next = { ...prev };
      delete next[billId];
      return next;
    });
  };

  const updateAllocation = (billId, value) => {
    const bill = billMap.get(billId);
    if (!bill) return;
    clearDiscountDraft(billId);
    if (value === "") {
      setAllocations((prev) => ({ ...prev, [billId]: "" }));
      return;
    }
    const numeric = toNumber(value, 0);
    const fallbackDue = Math.max(
      0,
      toNumber(bill.amount, 0) - toNumber(bill.paidAmount, 0),
    );
    const dueCap =
      Number.isFinite(bill.due) && bill.due > 0 ? bill.due : fallbackDue;
    const capped =
      dueCap > 0
        ? Math.max(0, Math.min(numeric, dueCap))
        : Math.max(0, numeric);
    setAllocations((prev) => ({ ...prev, [billId]: capped }));
  };

  const handleSettleFull = (billId) => {
    const bill = billMap.get(billId);
    if (!bill) return;
    clearDiscountDraft(billId);
    setAllocations((prev) => ({ ...prev, [billId]: bill.due }));
  };

  const applyDiscountToBill = (bill) => {
    const currentAllocation = toNumber(allocations[bill?.id], 0);
    const discountAmount = Math.max(
      0,
      Number((toNumber(bill?.due, 0) - currentAllocation).toFixed(2)),
    );

    if (!bill?.id) return;

    if (toNumber(discountDrafts[bill.id], 0) > 0.009) {
      clearDiscountDraft(bill.id);
      return;
    }

    if (discountAmount <= 0.009) {
      showToast("No due amount available for discount", "warning");
      return;
    }

    setDiscountDrafts((prev) => ({
      ...prev,
      [bill.id]: discountAmount,
    }));
  };

  const handleClearAllocations = () => {
    const nextAllocations = {};
    bills.forEach((bill) => {
      nextAllocations[bill.id] = "";
    });
    setAllocations(nextAllocations);
    setDiscountDrafts({});
  };

  const handleAutoAllocate = () => {
    const totalAmount = toNumber(payment.amount, 0);
    if (totalAmount <= 0) {
      showToast("Enter payment amount first", "warning");
      return;
    }
    let remaining = totalAmount;
    const nextAllocations = {};
    bills.forEach((bill) => {
      const settle = Math.min(remaining, bill.due);
      nextAllocations[bill.id] = settle > 0 ? Number(settle.toFixed(2)) : 0;
      remaining = Number((remaining - settle).toFixed(2));
    });
    setAllocations(nextAllocations);
    setDiscountDrafts({});
  };

  const handleAutoAllocateFullOnly = () => {
    const totalAmount = toNumber(payment.amount, 0);
    if (totalAmount <= 0) {
      showToast("Enter payment amount first", "warning");
      return;
    }
    let remaining = totalAmount;
    const nextAllocations = {};
    bills.forEach((bill) => {
      if (remaining >= bill.due && bill.due > 0) {
        nextAllocations[bill.id] = bill.due;
        remaining = Number((remaining - bill.due).toFixed(2));
      } else {
        nextAllocations[bill.id] = 0;
      }
    });
    setAllocations(nextAllocations);
    setDiscountDrafts({});
  };

  const handleAllocateRemaining = (billId) => {
    const bill = billMap.get(billId);
    if (!bill) return;
    const currentAlloc = toNumber(allocations[billId], 0);
    const maxAdditional = Math.max(0, bill.due - currentAlloc);
    const allocateAmount = Math.min(totals.remaining, maxAdditional);
    if (allocateAmount <= 0) return;
    clearDiscountDraft(billId);
    setAllocations((prev) => ({
      ...prev,
      [billId]: Number((currentAlloc + allocateAmount).toFixed(2)),
    }));
  };

  const handleSubmit = async () => {
    const totalAmount = toNumber(payment.amount, 0);
    const normalizedPaymentDate = parseDisplayDate(payment.date);
    const allocationsPayload = bills
      .map((bill) => {
        const amount = toNumber(allocations[bill.id], 0);
        const remainingDue = Math.max(0, toNumber(bill.due, 0) - amount);
        const settlementDiscount = Math.min(
          remainingDue,
          toNumber(discountDrafts[bill.id], 0),
        );

        return {
          bill_id: bill.id,
          amount,
          settlement_discount: Number(settlementDiscount.toFixed(2)),
        };
      })
      .filter((row) => row.amount > 0 || row.settlement_discount > 0);
    const settlementDiscountAmount = allocationsPayload.reduce(
      (sum, row) => sum + toNumber(row.settlement_discount, 0),
      0,
    );
    if (!selectedContact) {
      showToast("Select a party/supplier", "warning");
      return;
    }
    if (totalAmount <= 0 && totals.allocatedAmount > 0) {
      showToast("Payment amount must be greater than 0", "warning");
      return;
    }
    if (
      totals.allocatedAmount <= 0 &&
      settlementDiscountAmount <= 0
    ) {
      showToast("Allocate payment to at least one bill", "warning");
      return;
    }
    if (totals.allocatedAmount > totals.totalAmount + 0.009) {
      showToast("Allocated total cannot exceed payment amount", "warning");
      return;
    }
    if (totals.allocatedAmount > 0 && !normalizedPaymentDate) {
      showToast("Enter payment date in dd/mm/yyyy format", "warning");
      return;
    }

    if (allocationsPayload.length === 0) {
      showToast("Allocate payment to at least one bill", "warning");
      return;
    }

    const payload = {
      contact_id: selectedContact,
      total_amount: totalAmount,
      payment_type: payment.payment_type,
      bank_id: payment.bank_id || undefined,
      reference_no: payment.reference_no || undefined,
      note: payment.note || undefined,
      date: normalizedPaymentDate,
      allocations: allocationsPayload,
      apply_remaining_to_balance: false,
    };

    try {
      setLoading(true);
      const response = await api.post("/bills/settlements", payload);
      const result = response?.data?.data || response?.data;
      const appliedRows = Array.isArray(result?.applied) ? result.applied : [];
      const appliedFallback = allocationsPayload
        .map((row) => {
          const bill = billMap.get(row.bill_id);
          if (!bill) return null;
          const dueBefore = toNumber(bill.due, 0);
          const dueAfter = Math.max(
            0,
            Number(
              (
                dueBefore -
                row.amount -
                toNumber(row.settlement_discount, 0)
              ).toFixed(2),
            ),
          );
          return {
            bill_no: bill.billNo,
            settled_amount: row.amount,
            settlement_discount: toNumber(row.settlement_discount, 0),
            due_before: dueBefore,
            due_after: dueAfter,
            payment_status: dueAfter <= 0.009 ? "paid" : "partial",
          };
        })
        .filter(Boolean);

      const settlementPayload = {
        contactName:
          result?.contact?.name || selectedContactDetails?.name || "-",
        contactType,
        paymentDate: payment.date,
        paymentType: result?.payment_type || payment.payment_type,
        bankName:
          selectedBank?.name ||
          banks.find((b) => String(b.id) === String(result?.bank_id))?.name ||
          "",
        referenceNo: payment.reference_no || "",
        note: payment.note || "",
        totalAmount: toNumber(result?.total_amount, totalAmount),
        allocatedAmount: toNumber(
          result?.allocated_amount,
          totals.allocatedAmount,
        ),
        settlementDiscountAmount: toNumber(
          result?.settlement_discount_amount,
          settlementDiscountAmount,
        ),
        unsettledAmount: toNumber(result?.unsettled_amount, totals.remaining),
        applied: appliedRows.length ? appliedRows : appliedFallback,
      };
      setLastSettlement(settlementPayload);
      setIsReceiptOpen(true);

      if (result?.contact) {
        const contactId = getEntityId(result.contact) || result.contact._id;
        const nextBalance = toNumber(result.contact.balance, 0);
        if (contactId) {
          if (contactType === "party") {
            setParties((prev) =>
              prev.map((c) =>
                c.id === contactId ? { ...c, balance: nextBalance } : c,
              ),
            );
          } else {
            setSuppliers((prev) =>
              prev.map((c) =>
                c.id === contactId ? { ...c, balance: nextBalance } : c,
              ),
            );
          }
        }
      }

      showToast("Bills settled successfully", "success");
      handleClearAllocations();
      setDiscountDrafts({});
      const remainingPaymentAmount = Math.max(
        0,
        toNumber(result?.contact?.balance, totals.remaining),
      );
      setPayment((prev) => ({
        ...prev,
        amount: remainingPaymentAmount ? String(remainingPaymentAmount) : "",
        reference_no: "",
        note: "",
      }));
      if (selectedContact) {
        const refreshed = await api.get(`/bills/contact/${selectedContact}`, {
          params: { page: 1, limit: 200, payment_status: "due" },
        });
        const list = getResponseList(refreshed).map((bill) => {
          const amount = toNumber(bill.amount ?? bill.total_amount, 0);
          const paidAmount = toNumber(bill.paid_amount ?? bill.paidAmount, 0);
          const settlementDiscount = toNumber(
            bill.settlement_discount ?? bill.settlementDiscount,
            0,
          );
          const dueAmount = toNumber(
            bill.balance ?? amount - paidAmount - settlementDiscount,
            0,
          );
          return {
            id: getEntityId(bill) || bill._id,
            billNo: bill.bill_no || bill.billNo || bill.id || "-",
            date: bill.date,
            amount,
            paidAmount,
            settlementDiscount,
            due: Number(dueAmount.toFixed(2)),
            status: bill.payment_status || "due",
          };
        });
        setBills(list);
      }
    } catch (error) {
      console.error("Failed to settle bills", error);
      showToast(
        error?.response?.data?.message || "Failed to settle bills",
        "error",
      );
    } finally {
      setLoading(false);
    }
  };

  const formatRs = (value) => `Rs ${toNumber(value, 0).toLocaleString()}`;

  const generateSettlementPDF = (settlement) => {
    if (!settlement) return;
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [105, 148],
    });
    const marginX = 7;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const contentWidth = pageWidth - marginX * 2;
    const rightX = pageWidth - marginX;
    let cursorY = 8;

    const paymentLabel =
      PAYMENT_TYPES.find((p) => p.value === settlement.paymentType)?.label ||
      settlement.paymentType ||
      "";
    const firmMeta = getResolvedFirmMeta();
    const contactLabel =
      settlement.contactType === "supplier" ? "Supplier" : "Party";
    const generatedAt = new Date().toLocaleString("en-IN");

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 22, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text((firmMeta.firmName || "Firm").toUpperCase(), marginX, cursorY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.8);
    doc.setTextColor(203, 213, 225);
    const firmLine = [
      firmMeta.phone ? `Ph: ${firmMeta.phone}` : "",
      firmMeta.gstin ? `GSTIN: ${firmMeta.gstin}` : "",
    ].filter(Boolean).join(" | ");
    if (firmLine) doc.text(firmLine, marginX, cursorY + 4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text("SETTLEMENT RECEIPT", rightX, cursorY, { align: "right" });

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(203, 213, 225);
    doc.text(`Generated: ${generatedAt}`, rightX, cursorY + 4, {
      align: "right",
    });
    cursorY = 28;

    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(187, 247, 208);
    doc.roundedRect(marginX, cursorY, contentWidth, 14, 2, 2, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(22, 101, 52);
    doc.text("AMOUNT ALLOCATED", marginX + 3, cursorY + 5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(formatRs(settlement.allocatedAmount), marginX + 3, cursorY + 10.5);
    doc.setFontSize(7);
    doc.text("PAID", rightX - 3, cursorY + 8, { align: "right" });
    cursorY += 18;

    autoTable(doc, {
      startY: cursorY,
      head: [["Receipt Details", ""]],
      body: [
        [contactLabel, settlement.contactName || "-"],
        ["Payment Date", settlement.paymentDate || "-"],
        ["Payment Type", paymentLabel || "-"],
        ...(settlement.bankName ? [["Bank", settlement.bankName]] : []),
        ...(settlement.referenceNo
          ? [["Reference", settlement.referenceNo]]
          : []),
        ...(settlement.note ? [["Note", settlement.note]] : []),
      ],
      theme: "grid",
      styles: {
        fontSize: 7.5,
        cellPadding: 1.7,
        lineColor: [226, 232, 240],
        lineWidth: 0.2,
      },
      headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42] },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        0: { cellWidth: 25, fontStyle: "bold", textColor: [71, 85, 105] },
      },
    });
    cursorY = doc.lastAutoTable.finalY + 4;

    autoTable(doc, {
      startY: cursorY,
      head: [["Summary", "Amount"]],
      body: [
        ["Total Amount", formatRs(settlement.totalAmount)],
        ["Allocated", formatRs(settlement.allocatedAmount)],
        [
          "Settlement Discount",
          formatRs(settlement.settlementDiscountAmount),
        ],
        ["Unsettled", formatRs(settlement.unsettledAmount)],
      ],
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.7 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: {
        1: { halign: "right" },
      },
    });
    cursorY = doc.lastAutoTable.finalY + 4;

    const appliedRows = settlement.applied || [];
    if (appliedRows.length > 0) {
      autoTable(doc, {
        startY: cursorY,
        head: [
          [
            "Bill No",
            "Due Before",
            "Paid Now",
            "Sett. Disc.",
            "Due After",
            "Status",
          ],
        ],
        body: appliedRows.map((row) => [
          row.bill_no || "-",
          formatRs(row.due_before),
          formatRs(row.settled_amount),
          formatRs(row.settlement_discount),
          formatRs(row.due_after),
          (row.payment_status || "").toString().toUpperCase(),
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [248, 250, 252], textColor: [15, 23, 42] },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        margin: { left: marginX, right: marginX },
        columnStyles: {
          1: { halign: "right" },
          2: { halign: "right" },
          3: { halign: "right" },
          4: { halign: "right" },
        },
      });
      cursorY = doc.lastAutoTable.finalY + 4;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 16, rightX, pageHeight - 16);
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("System-generated receipt.", marginX, pageHeight - 10);
    doc.text(firmMeta.firmName || "Firm", rightX, pageHeight - 10, {
      align: "right",
    });

    const safeName = settlement.contactName
      .replace(/[^\w-]+/g, "_")
      .slice(0, 40);
    const safeDate = (
      settlement.paymentDate || formatDateForDisplay(new Date())
    ).replaceAll("/", "-");
    doc.save(`Settlement_${safeName}_${safeDate}.pdf`);
  };

  return (
    <div className={isEmbedded ? "space-y-4" : "space-y-6"}>
      {!isEmbedded && (
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OutStandings</h1>
          <p className="text-gray-600">
            Settle payments against bills and manage unsettled balances.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-lg border lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 text-gray-800">
            <FaMoneyBillWave className="text-blue-600" />
            <h3 className="font-semibold">Payment Details</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Type
              </label>
              {lockContactType ? (
                <div className="px-3 py-2 border rounded-md bg-gray-50 text-sm capitalize">
                  {contactType === "party" ? "party" : "supplier"}
                </div>
              ) : (
                <Select
                  ref={firstFieldRef}
                  value={contactType}
                  onChange={setContactType}
                >
                  <option value="party">Party</option>
                  <option value="supplier">Supplier</option>
                </Select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {contactType === "party" ? "Party" : "Supplier"} *
              </label>
              {lockContact && selectedContact ? (
                <div className="px-3 py-2 border rounded-md bg-gray-50 text-sm">
                  {selectedContactDetails?.name || "-"}
                </div>
              ) : (
                <Select
                  value={selectedContact}
                  onChange={setSelectedContact}
                  placeholder={`Select ${contactType}`}
                >
                  {(contacts || []).map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Amount
              </label>
              <Input
                ref={!lockContactType ? null : firstFieldRef}
                type="number"
                value={payment.amount}
                disabled
                onWheel={(e) => e.target.blur()}
                placeholder="Loaded from balance"
                min="0"
                step="0.01"
              />
              <p className="mt-1 text-xs text-gray-500">
                Loaded from the selected party/supplier balance.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Return Type *
              </label>
              <Select
                value={payment.payment_type}
                onChange={(value) =>
                  setPayment((prev) => ({ ...prev, payment_type: value }))
                }
              >
                {availablePaymentTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                {contactType === "party"
                  ? "Show only received payment options for the selected party."
                  : "Show only payment-given options for the selected supplier."}
              </p>
              {selectedPaymentType?.hint && (
                <p className="text-xs text-gray-500 mt-1">
                  {selectedPaymentType.hint}
                </p>
              )}
            </div>
            {shouldShowBank && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bank
                </label>
                <Select
                  value={payment.bank_id}
                  onChange={(value) =>
                    setPayment((prev) => ({ ...prev, bank_id: value }))
                  }
                  placeholder="Select bank"
                >
                  {banks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                      {bank.account ? ` - ${bank.account}` : ""}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reference No
              </label>
              <Input
                value={payment.reference_no}
                onChange={(value) =>
                  setPayment((prev) => ({ ...prev, reference_no: value }))
                }
                placeholder="NEFT/UPI/Cheque reference"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Payment Date
              </label>
              <Input
                value={payment.date}
                onChange={(value) =>
                  setPayment((prev) => ({
                    ...prev,
                    date: formatDateInput(value),
                  }))
                }
                placeholder="dd/mm/yyyy"
                inputMode="numeric"
                maxLength={10}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Note
              </label>
              <Textarea
                value={payment.note}
                onChange={(value) =>
                  setPayment((prev) => ({ ...prev, note: value }))
                }
                placeholder="Optional note"
                rows={2}
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border space-y-4">
          <div className="flex items-center gap-2 text-gray-800">
            <FaCalculator className="text-green-600" />
            <h3 className="font-semibold">Summary</h3>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            <div className="flex items-center justify-between">
              <span>Total Due (Bills)</span>
              <span className="font-semibold">
                Rs {totals.totalDue.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Payment Amount</span>
              <span className="font-semibold">
                Rs {totals.totalAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Allocated</span>
              <span className="font-semibold text-green-700">
                Rs {totals.totalAllocatedAmount.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Settlement Discount</span>
              <span className="font-semibold text-blue-700">
                Rs {totals.totalSettlementDiscountAmount.toLocaleString()}
              </span>
            </div>
            <div
              className={`flex items-center justify-between rounded-md px-2 py-1 -mx-2 ${
                totals.remaining > 0
                  ? "bg-amber-50 border border-amber-200"
                  : totals.remaining < 0
                    ? "bg-red-50 border border-red-200"
                    : ""
              }`}
            >
              <span className="font-medium">Remaining</span>
              <span
                className={`font-bold ${
                  totals.remaining > 0
                    ? "text-amber-700"
                    : totals.remaining < 0
                      ? "text-red-600"
                      : "text-green-700"
                }`}
              >
                Rs {totals.remaining.toLocaleString()}
              </span>
            </div>
            {selectedContactDetails && (
              <div className="flex items-center justify-between">
                <span>
                  {contactType === "supplier" ? "Supplier Balance" : "Party Balance"}
                </span>
                <span className="font-semibold">
                  Rs{" "}
                  {toNumber(selectedContactDetails.balance, 0).toLocaleString()}
                </span>
              </div>
            )}
          </div>

          <div className="pt-2 border-t">
            <Button
              className="w-full"
              onClick={handleSubmit}
              loading={loading}
              disabled={loading || loadingBills || bills.length === 0}
            >
              Settle Bills
            </Button>
            {lastSettlement && (
              <Button
                variant="outline"
                className="w-full mt-2"
                onClick={() => generateSettlementPDF(lastSettlement)}
              >
                Download Settlement PDF
              </Button>
            )}
            {totals.remaining < 0 && (
              <p className="text-xs text-red-600 mt-2">
                Allocated total exceeds payment amount.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-lg border space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2 text-gray-800">
            <FaLayerGroup className="text-purple-600" />
            <h3 className="font-semibold">Bills to Settle</h3>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoAllocate}
              disabled={loadingBills}
              title="Settle bills in order, including partial amounts"
            >
              Auto Allocate
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAutoAllocateFullOnly}
              disabled={loadingBills}
              title="Only settle bills that can be fully paid"
            >
              Full Bills Only
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClearAllocations}
              disabled={loadingBills}
            >
              Clear
            </Button>
          </div>
        </div>

        {loadingBills ? (
          <div className="text-sm text-gray-600">Loading bills...</div>
        ) : bills.length === 0 ? (
          <div className="text-sm text-gray-600">
            {selectedContact
              ? "No due bills available."
              : "Select a party/supplier to view bills."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-3 py-2">Bill No</th>
	                  <th className="text-left px-3 py-2">Date</th>
	                  <th className="text-right px-3 py-2">Amount</th>
	                  <th className="text-right px-3 py-2">Returned</th>
	                  <th className="text-right px-3 py-2">Paid</th>
                  <th className="text-right px-3 py-2">
                    Settlement Discount
                  </th>
                  <th className="text-right px-3 py-2">Due</th>
                  <th className="text-left px-3 py-2 min-w-[120px]">
                    Allocate
                  </th>
                  <th className="text-center px-3 py-2">After</th>
                  <th className="text-left px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((bill) => {
                  const alloc = toNumber(allocations[bill.id], 0);
                  const draftDiscount = toNumber(discountDrafts[bill.id], 0);
                  const projectedDue = Math.max(
                    0,
                    Number((bill.due - alloc - draftDiscount).toFixed(2)),
                  );
                  const hasDraftDiscount = draftDiscount > 0.009;
                  const hasDraftChange = alloc > 0 || hasDraftDiscount;
                  const isFullySettled = hasDraftChange && projectedDue < 0.01;
                  const isPartial = hasDraftChange && !isFullySettled;
                  const canAllocMore = totals.remaining > 0 && alloc < bill.due;

                  return (
                    <tr
                      key={bill.id}
                      className={`border-b last:border-b-0 transition-colors ${
                        isFullySettled
                          ? "bg-green-50"
                          : isPartial
                            ? "bg-amber-50"
                            : ""
                      }`}
                    >
                      <td className="px-3 py-2 font-medium text-gray-900">
                        {bill.billNo}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {formatDateForDisplay(bill.date) || "-"}
                      </td>
	                      <td className="px-3 py-2 text-right">
	                        Rs {bill.amount.toLocaleString()}
	                      </td>
	                      <td className="px-3 py-2 text-right">
	                        Rs {toNumber(bill.returnAmount, 0).toLocaleString()}
	                      </td>
	                      <td className="px-3 py-2 text-right">
                        Rs {bill.paidAmount.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        Rs {toNumber(bill.settlementDiscount, 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        Rs {bill.due.toLocaleString()}
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={
                            allocations[bill.id] === 0
                              ? ""
                              : (allocations[bill.id] ?? "")
                          }
                          onChange={(value) => updateAllocation(bill.id, value)}
                          onWheel={(e) => e.target.blur()}
                          className="text-right"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        {hasDraftChange ? (
                          <span
                            className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full ${
                              hasDraftDiscount
                                ? "bg-blue-100 text-blue-800"
                                : isFullySettled
                                ? "bg-green-100 text-green-800"
                                : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {hasDraftDiscount
                              ? `Disc ${draftDiscount.toLocaleString()}`
                              : isFullySettled
                              ? "Paid"
                              : `Due ${projectedDue.toLocaleString()}`}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSettleFull(bill.id)}
                            title="Allocate full due amount"
                          >
                            Full
                          </Button>
                          {canAllocMore && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAllocateRemaining(bill.id)}
                              title={`Allocate remaining Rs ${Math.min(totals.remaining, bill.due - alloc).toLocaleString()}`}
                              className="text-amber-700 border-amber-300 hover:bg-amber-50"
                            >
                              +Rem
                            </Button>
                          )}
                          {bill.due > 0.009 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => applyDiscountToBill(bill)}
                              title="Settle remaining due as discount"
                              className="text-blue-700 border-blue-300 hover:bg-blue-50"
                            >
                              {hasDraftDiscount ? "Clear" : "Disc"}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        isOpen={isReceiptOpen}
        onClose={() => setIsReceiptOpen(false)}
        title="Settlement Summary"
        size="lg"
      >
        {lastSettlement ? (
          <div className="space-y-4 text-sm text-gray-700">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs text-gray-500">
                  {lastSettlement.contactType === "supplier" ? "Supplier" : "Party"}
                </div>
                <div className="text-base font-semibold text-gray-900">
                  {lastSettlement.contactName}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Payment Date: {lastSettlement.paymentDate || "-"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-700 border border-blue-100">
                  {PAYMENT_TYPES.find(
                    (p) => p.value === lastSettlement.paymentType,
                  )?.label || lastSettlement.paymentType}
                </span>
                {lastSettlement.bankName && (
                  <span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700 border">
                    {lastSettlement.bankName}
                  </span>
                )}
                {lastSettlement.referenceNo && (
                  <span className="px-2 py-1 rounded-full text-xs bg-gray-50 text-gray-700 border">
                    Ref: {lastSettlement.referenceNo}
                  </span>
                )}
              </div>
            </div>

            {lastSettlement.note && (
              <div className="p-3 rounded-md bg-gray-50 border text-sm">
                <div className="text-xs text-gray-500 mb-1">Note</div>
                <div className="font-medium text-gray-800">
                  {lastSettlement.note}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-sm">
              <div className="p-3 rounded-md bg-slate-50 border">
                <div className="text-xs text-gray-500">Total Amount</div>
                <div className="font-semibold text-gray-900">
                  {formatRs(lastSettlement.totalAmount)}
                </div>
              </div>
              <div className="p-3 rounded-md bg-emerald-50 border border-emerald-100">
                <div className="text-xs text-gray-500">Allocated</div>
                <div className="font-semibold text-emerald-700">
                  {formatRs(lastSettlement.allocatedAmount)}
                </div>
              </div>
              <div className="p-3 rounded-md bg-blue-50 border border-blue-100">
                <div className="text-xs text-gray-500">Settlement Discount</div>
                <div className="font-semibold text-blue-700">
                  {formatRs(lastSettlement.settlementDiscountAmount)}
                </div>
              </div>
              <div className="p-3 rounded-md bg-amber-50 border border-amber-100">
                <div className="text-xs text-gray-500">Unsettled</div>
                <div className="font-semibold text-amber-700">
                  {formatRs(lastSettlement.unsettledAmount)}
                </div>
              </div>
            </div>

            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-3 py-2">Bill No</th>
                    <th className="text-right px-3 py-2">Due Before</th>
                    <th className="text-right px-3 py-2">Paid Now</th>
                    <th className="text-right px-3 py-2">Sett. Disc.</th>
                    <th className="text-right px-3 py-2">Due After</th>
                    <th className="text-left px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(lastSettlement.applied || []).map((row, idx) => (
                    <tr
                      key={`${row.bill_no || "bill"}-${idx}`}
                      className="border-t even:bg-gray-50"
                    >
                      <td className="px-3 py-2">{row.bill_no || "-"}</td>
                      <td className="px-3 py-2 text-right">
                        {formatRs(row.due_before)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatRs(row.settled_amount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatRs(row.settlement_discount)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatRs(row.due_after)}
                      </td>
                      <td className="px-3 py-2">
                        {(row.payment_status || "").toString().toUpperCase()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsReceiptOpen(false)}>
                Close
              </Button>
              <Button onClick={() => generateSettlementPDF(lastSettlement)}>
                Download PDF
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-sm text-gray-600">No settlement data found.</div>
        )}
      </Modal>
    </div>
  );
};

export default OutStandings;
