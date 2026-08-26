import { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { FaPlus, FaEye, FaEdit, FaTrash, FaPrint, FaDownload } from "react-icons/fa";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button, Input, SearchableSelect } from "../../components/ui";
import jsPDF from "jspdf";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import { getEntityId, fetchAllPages, getResponseList } from "../../services/apiUtils";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import {
  getFinancialYearStartDisplayDate,
  getTodayDisplayDate,
  toISODate,
  toDisplayDate,
} from "../../utils/dateHelpers";
import { getResolvedFirmMeta } from "../../utils/reportPdf";

const getToday = () => {
  return getTodayDisplayDate();
};

const convertDateToISO = (val) => toISODate(val) || "";

const convertDateFromISO = (val) => toDisplayDate(val) || "";

const sortContactsWithBooksOnTop = (contacts = []) => {
  return [...contacts].sort((a, b) => {
    const aName = (a?.name || "").trim().toUpperCase();
    const bName = (b?.name || "").trim().toUpperCase();

    const getRank = (name) => {
      if (name === "CASHBOOK") return 1;
      if (name === "BANKBOOK") return 2;
      return 3;
    };

    const rankA = getRank(aName);
    const rankB = getRank(bName);

    if (rankA !== rankB) {
      return rankA - rankB;
    }

    return aName.localeCompare(bName, undefined, { numeric: true, sensitivity: "base" });
  });
};

const formatDate = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const formatChequeDate = (value) => {
  const formattedDate = formatDate(value);
  return formattedDate === "-" ? "" : (
      formattedDate.replace(/\D/g, "").split("").join(" ")
    );
};

const numberToWords = (amount) => {
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

  const convert = (num) => {
    if (num === 0) return "Zero";
    if (num < 10) return ones[num];
    if (num < 20) return teens[num - 10];
    if (num < 100)
      return `${tens[Math.floor(num / 10)]}${num % 10 ? ` ${ones[num % 10]}` : ""}`;
    if (num < 1000)
      return `${ones[Math.floor(num / 100)]} Hundred${num % 100 ? ` ${convert(num % 100)}` : ""}`;
    if (num < 100000)
      return `${convert(Math.floor(num / 1000))} Thousand${num % 1000 ? ` ${convert(num % 1000)}` : ""}`;
    if (num < 10000000)
      return `${convert(Math.floor(num / 100000))} Lakh${num % 100000 ? ` ${convert(num % 100000)}` : ""}`;
    return `${convert(Math.floor(num / 10000000))} Crore${num % 10000000 ? ` ${convert(num % 10000000)}` : ""}`;
  };

  const safeAmount = Math.max(0, Number(amount) || 0);
  const rupees = Math.floor(safeAmount);
  const paise = Math.round((safeAmount - rupees) * 100);
  const rupeeText = `${convert(rupees)} Rupees`;
  return paise > 0 ?
      `${rupeeText} And ${convert(paise)} Paise Only`
    : `${rupeeText} Only`;
};

const getChequeFieldStyle = (key) => {
  switch (key) {
    case "ac_pay":
      return {
        fontSize: 13,
        fontStyle: "normal",
        fontWeight: "normal",
        fontFamily: "times",
      };
    case "date":
      return {
        fontSize: 14,
        fontStyle: "bold",
        fontWeight: "bold",
        fontFamily: "courier",
      };
    case "amount":
      return {
        fontSize: 14,
        fontStyle: "bold",
        fontWeight: "bold",
        fontFamily: "courier",
      };
    case "ac_name":
      return {
        fontSize: 14,
        fontStyle: "bold",
        fontWeight: "bold",
        fontFamily: "times",
      };
    case "amount_word":
      return {
        fontSize: 12,
        fontStyle: "normal",
        fontWeight: "normal",
        fontFamily: "times",
      };
    case "narration":
      return {
        fontSize: 10,
        fontStyle: "normal",
        fontWeight: "normal",
        fontFamily: "times",
      };
    case "firm_name":
      return {
        fontSize: 11,
        fontStyle: "bold",
        fontWeight: "bold",
        fontFamily: "times",
      };
    case "signature":
      return {
        fontSize: 10,
        fontStyle: "normal",
        fontWeight: "normal",
        fontFamily: "times",
      };
    default:
      return {
        fontSize: 11,
        fontStyle: "normal",
        fontWeight: "normal",
        fontFamily: "times",
      };
  }
};

const TRANSACTION_TYPES = {
  CASH_RECEIVED: "cash_received",
  BANK_RECEIVED: "bank_received",
  CASH_PAYMENT: "cash_payment",
  BANK_PAYMENT: "bank_payment",
};

const BOOK_TYPES = {
  CASHBOOK: "cashbook",
  BANKBOOK: "bankbook",
};

const BOOKS = {
  CASH: "cash_book",
  AC: "ac_book",
  CREDITOR: "creditor",
  DEBITOR: "debitor",
};

const PAYMENT_TYPE_BY_TRANSACTION_TYPE = {
  [TRANSACTION_TYPES.BANK_RECEIVED]: "bank_transaction_received_amount",
  [TRANSACTION_TYPES.CASH_RECEIVED]: "cash_payment_received_amount",
  [TRANSACTION_TYPES.BANK_PAYMENT]: "bank_transfer_payment_given",
  [TRANSACTION_TYPES.CASH_PAYMENT]: "cash_payment_given",
};

const INITIAL_FORM = {
  transaction_no: "",
  contact_type: "",
  type: "",
  contact_id: "",
  amount: "",
  bank_id: "",
  book_type: "",
  date: getToday(),
  reference: "",
  remarks: "",
};

const TransactionMaster = () => {
  const { showToast } = useStore();
  const navigate = useNavigate();
  const [activeBook, setActiveBook] = useState("all");
  const [transactions, setTransactions] = useState([]);
  const [parties, setParties] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [books, setBooks] = useState([]);
  const [banks, setBanks] = useState([]);
  const [chequeSetups, setChequeSetups] = useState({});
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    transaction: null,
  });
  const [loading, setLoading] = useState(false);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => {
    return getFinancialYearStartDisplayDate();
  });
  const [toDate, setToDate] = useState(() => getToday());
  const firstFieldRef = useRef(null);
  useSaveShortcut(
    () => handleSubmit({ preventDefault: () => {} }),
    isAddModalOpen || isEditModalOpen,
  );

  const getResponseList = (res) => {
    const data = res?.data?.data;
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.data)) return data.data;
    if (Array.isArray(data?.docs)) return data.docs;
    if (Array.isArray(data?.items)) return data.items;
    return [];
  };

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

  const fetchParties = async () => {
    try {
      const list = await fetchAllPages(api, "/contacts/parties", { compact: true });
      setParties(list);
    } catch (error) {
      showToast("Failed to fetch parties", "error");
    }
  };

  const fetchSuppliers = async () => {
    try {
      const list = await fetchAllPages(api, "/contacts/suppliers", { compact: true });
      setSuppliers(list);
    } catch (error) {
      showToast("Failed to fetch suppliers", "error");
    }
  };

  const fetchBooks = async () => {
    try {
      const list = await fetchAllPages(api, "/contacts/books", { compact: true });
      setBooks(list);
    } catch (error) {
      showToast("Failed to fetch books", "error");
    }
  };

  const fetchBanks = async () => {
    try {
      const list = await fetchAllPages(api, "/banks");
      setBanks(list);
    } catch (error) {
      showToast("Failed to fetch banks", "error");
    }
  };

  const fetchChequeSetups = async () => {
    try {
      const list = await fetchAllPages(api, "/setup/cheque-setup");
      const setupMap = {};
      list.forEach((setup) => {
        const bankId = getEntityId(setup?.bank_id);
        if (bankId) setupMap[String(bankId)] = setup;
      });
      setChequeSetups(setupMap);
    } catch (error) {
      setChequeSetups({});
    }
  };

  const fetchTransactions = async () => {
    setLoading(true);
    setTransactions([]);
    try {
      const params = { page: 1, limit: 500 };
      if (fromDate) params.from_date = convertDateToISO(fromDate);
      if (toDate) params.to_date = convertDateToISO(toDate);
      const res = await api.get("/transactions", { params });
      setTransactions(getResponseList(res));
    } catch (error) {
      showToast("Failed to fetch transactions", "error");
      setTransactions([]);
    }
    setLoading(false);
  };

  useKeyboardShortcuts({
    onAdd: () => {
      setFormData(INITIAL_FORM);
      setIsAddModalOpen(true);
    },
    onRefresh: fetchTransactions,
    enabled: !isAddModalOpen && !isEditModalOpen,
  });

  useEffect(() => {
    fetchTransactions();
    fetchParties();
    fetchSuppliers();
    fetchBooks();
    fetchBanks();
    fetchChequeSetups();
  }, []);

  useEffect(() => {
    if (isAddModalOpen || isEditModalOpen) {
      fetchParties();
      fetchSuppliers();
      fetchBooks();
      fetchBanks();
      fetchChequeSetups();
      if (isAddModalOpen) {
        focusFirstField();
      }
    }
  }, [isAddModalOpen, isEditModalOpen]);

  const getBookTransactionTypes = (book) => {
    switch (book) {
      case BOOKS.CASH:
        return [
          TRANSACTION_TYPES.CASH_RECEIVED,
          TRANSACTION_TYPES.CASH_PAYMENT,
        ];
      case BOOKS.AC:
        return [
          TRANSACTION_TYPES.BANK_RECEIVED,
          TRANSACTION_TYPES.BANK_PAYMENT,
        ];
      case BOOKS.CREDITOR:
        return [TRANSACTION_TYPES.BANK_PAYMENT, TRANSACTION_TYPES.CASH_PAYMENT];
      case BOOKS.DEBITOR:
        return [
          TRANSACTION_TYPES.BANK_RECEIVED,
          TRANSACTION_TYPES.CASH_RECEIVED,
        ];
      default:
        return [];
    }
  };

  const activeBookTypes = getBookTransactionTypes(activeBook);

  const contactsById = useMemo(() => {
    const map = new Map();
    [...parties, ...suppliers].forEach((c) => {
      map.set(String(getEntityId(c)), c);
    });
    return map;
  }, [parties, suppliers]);

  const bankNameById = useMemo(() => {
    const entries = banks.map((bank) => [
      String(getEntityId(bank)),
      bank?.bank_name || bank?.name || "",
    ]);
    return new Map(entries);
  }, [banks]);

  const bankById = useMemo(() => {
    const entries = banks.map((bank) => [String(getEntityId(bank)), bank]);
    return new Map(entries);
  }, [banks]);

  const resolveContact = (value) => {
    const contactId = getEntityId(value);
    if (!contactId) return value && typeof value === "object" ? value : null;
    return contactsById.get(String(contactId)) || null;
  };

  const filteredTransactions = useMemo(() => {
    const rows = Array.isArray(transactions) ? transactions : [];
    let scoped = rows;

    // Tab filter
    if (activeBook === BOOKS.CASH) {
      scoped = scoped.filter(
        (t) =>
          t?.type === TRANSACTION_TYPES.CASH_RECEIVED ||
          t?.type === TRANSACTION_TYPES.CASH_PAYMENT,
      );
    } else if (activeBook === BOOKS.AC) {
      scoped = scoped.filter(
        (t) =>
          t?.type === TRANSACTION_TYPES.BANK_RECEIVED ||
          t?.type === TRANSACTION_TYPES.BANK_PAYMENT,
      );
    } else if (activeBook === BOOKS.CREDITOR) {
      scoped = scoped.filter(
        (t) =>
          t?.type === TRANSACTION_TYPES.BANK_PAYMENT ||
          t?.type === TRANSACTION_TYPES.CASH_PAYMENT,
      );
    } else if (activeBook === BOOKS.DEBITOR) {
      scoped = scoped.filter(
        (t) =>
          t?.type === TRANSACTION_TYPES.BANK_RECEIVED ||
          t?.type === TRANSACTION_TYPES.CASH_RECEIVED,
      );
    }
    // 'all' — no filter

    if (historyFilter !== "all") {
      scoped = scoped.filter((t) => {
        const contact = resolveContact(t?.contact_id);
        const contactType =
          t?.contact_type || contact?.type || t?.contact_id?.type;
        return historyFilter === "supplier" ?
            contactType === "supplier"
          : contactType === "party";
      });
    }

    if (fromDate || toDate) {
      const fromIso = convertDateToISO(fromDate);
      const toIso = convertDateToISO(toDate);
      const fromTs = fromIso ? new Date(fromIso + "T00:00:00").getTime() : null;
      const toTs = toIso ? new Date(toIso + "T23:59:59.999").getTime() : null;

      scoped = scoped.filter((t) => {
        if (!t?.date) return false;
        const txnIso = toISODate(t.date);
        const dateTs = txnIso ? new Date(txnIso + "T12:00:00").getTime() : new Date(t.date).getTime();
        if (Number.isNaN(dateTs)) return false;
        if (fromTs && dateTs < fromTs) return false;
        if (toTs && dateTs > toTs) return false;
        return true;
      });
    }

    return scoped.map((t) => {
      const contactId = getEntityId(t?.contact_id);
      const partyName =
        contactsById.get(String(contactId))?.name ||
        t?.contact_id?.name ||
        "N/A";
      return { ...t, partyName };
    });
  }, [
    transactions,
    activeBook,
    resolveContact,
    historyFilter,
    fromDate,
    toDate,
  ]);

  const columns = [
    { key: "id", label: "ID", width: "50px", render: (v, r, i) => i + 1 },
    { key: "transaction_no", label: "Trans No", width: "100px" },
    {
      key: "date",
      label: "Date",
      width: "100px",
      render: (v) => formatDate(v),
    },
    {
      key: "type",
      label: "Type",
      width: "120px",
      render: (_v, row) =>
        row?.typeLabel ||
        (row?.type ? row.type.replace(/_/g, " ").toUpperCase() : "N/A"),
    },
    {
      key: "partyName",
      label: "Party",
      width: "150px",
    },
    {
      key: "amount",
      label: "Amount",
      width: "150px",
      render: (v, row) => {
        const num = Number(v) || 0;
        const isSettled = row?.settlement_status === "settled";
        return (
          <div className="flex items-center gap-2">
            <span className={isSettled ? "text-green-600 font-bold" : "text-neutral-900"}>
              ₹{num.toFixed(2)}
            </span>
            {isSettled && (
              <span className="px-2 py-0.5 text-[10px] leading-tight font-medium bg-green-100 text-green-800 rounded-full border border-green-200">
                Settled
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "bank_id",
      label: "Bank",
      width: "120px",
      render: (v) => {
        if (!v) return "N/A";
        if (v?.bank_name) return v.bank_name;
        const bankId = getEntityId(v);
        return bankId ? bankNameById.get(String(bankId)) || "N/A" : "N/A";
      },
    },
    { key: "reference", label: "Reference", width: "100px" },
  ];

  const getTransactionBankId = (transaction) => {
    const bankId = getEntityId(transaction?.bank_id);
    return bankId ? String(bankId) : "";
  };

  const resolveTransactionContactType = (transaction) => {
    const directType =
      transaction?.contact_type ||
      transaction?.contact_id?.type ||
      resolveContact(transaction?.contact_id)?.type;
    if (directType) return String(directType).toLowerCase();

    const contactId = String(getEntityId(transaction?.contact_id) || "");
    if (!contactId) return "";
    if (
      suppliers.some((supplier) => String(getEntityId(supplier)) === contactId)
    ) {
      return "supplier";
    }
    if (parties.some((party) => String(getEntityId(party)) === contactId)) {
      return "party";
    }
    return "";
  };

  const isSupplierBankPaymentTransaction = (transaction) =>
    transaction?.type === TRANSACTION_TYPES.BANK_PAYMENT &&
    resolveTransactionContactType(transaction) === "supplier";

  const findChequeSetupByBank = (bankId, bank) => {
    if (chequeSetups[bankId]) return chequeSetups[bankId];
    const bankName = String(bank?.bank_name || "")
      .trim()
      .toLowerCase();
    const accountNumber = String(bank?.account_number || "").trim();

    return Object.values(chequeSetups).find((setup) => {
      const setupBank = setup?.bank_id || {};
      const setupBankId = String(getEntityId(setupBank));
      const setupBankName = String(setupBank?.bank_name || "")
        .trim()
        .toLowerCase();
      const setupAccountNumber = String(setupBank?.account_number || "").trim();

      return (
        (setupBankId && setupBankId === bankId) ||
        (accountNumber &&
          setupAccountNumber &&
          setupAccountNumber === accountNumber) ||
        (bankName && setupBankName && setupBankName === bankName)
      );
    });
  };

  const loadChequeSetupForBank = async (bankId) => {
    const res = await api.get(`/setup/cheque-setup/${bankId}`);
    const setup = res?.data?.data;
    if (setup?._id) {
      setChequeSetups((prev) => ({ ...prev, [bankId]: setup }));
      return setup;
    }
    return null;
  };

  const getChequePrintValues = (transaction, bank) => {
    const contact = resolveContact(transaction?.contact_id);
    const firmMeta = getResolvedFirmMeta();
    const amount = Number(transaction?.amount) || 0;
    const contactName =
      contact?.name ||
      transaction?.contact_id?.name ||
      transaction?.partyName ||
      "";
    const firmName = firmMeta?.firmName || "";
    const narration =
      transaction?.remarks ||
      transaction?.reference ||
      transaction?.transaction_no ||
      "";

    return {
      ac_pay: "A/C PAYEES",
      date: formatChequeDate(transaction?.date),
      ac_name: contactName || firmName,
      amount_word: numberToWords(amount),
      amount: amount.toFixed(2),
      narration,
      firm_name: firmName,
      signature: "",
      bank_name: bank?.bank_name || "",
    };
  };

  const handleChequePrint = async (transaction) => {
    if (!isSupplierBankPaymentTransaction(transaction)) {
      showToast(
        "Cheque print is available only for supplier bank payments",
        "error",
      );
      return;
    }

    const bankId = getTransactionBankId(transaction);
    if (!bankId) {
      showToast("Cheque print requires bank transaction", "error");
      return;
    }

    const bank = bankById.get(bankId) || transaction?.bank_id || {};
    let setup = findChequeSetupByBank(bankId, bank);
    if (!setup) {
      setup = await loadChequeSetupForBank(bankId);
    }
    if (!setup) {
      showToast("Cheque print setup not found for selected bank", "error");
      return;
    }

    const { jsPDF } = await import("jspdf");
    const chequeWidth = Number(setup.cheque_width) || 760;
    const chequeHeight = Number(setup.cheque_height) || 250;
    const fields =
      Array.isArray(setup.fields) && setup.fields.length ? setup.fields : [];
    const values = getChequePrintValues(transaction, bank);
    const pdf = new jsPDF({
      orientation: chequeWidth >= chequeHeight ? "landscape" : "portrait",
      unit: "px",
      format: [chequeWidth, chequeHeight],
    });

    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, chequeWidth, chequeHeight, "F");

    fields
      .filter((field) => field?.enabled)
      .forEach((field) => {
        const text = String(values[field.key] ?? "");
        const style = getChequeFieldStyle(field.key);
        pdf.setFont(style.fontFamily, style.fontStyle);
        pdf.setFontSize(style.fontSize);
        pdf.setTextColor(0, 0, 0);

        if (field.key === "amount_word") {
          pdf.text(text, Number(field.left) || 0, Number(field.top) || 0, {
            maxWidth: Math.max(
              120,
              chequeWidth - (Number(field.left) || 0) - 20,
            ),
          });
          return;
        }

        if (field.key === "signature") {
          const left = Number(field.left) || 0;
          const top = Number(field.top) || 0;
          pdf.line(left, top - 4, left + 110, top - 4);
          if (text) pdf.text(text, left, top);
          return;
        }

        pdf.text(text, Number(field.left) || 0, Number(field.top) || 0);
      });

    const fileBankName = (bank?.bank_name || "bank").replace(/[^\w-]+/g, "-");
    pdf.save(`${fileBankName}-${transaction?.transaction_no || "cheque"}.pdf`);
  };

  const handleReceiptPrint = (transaction, action = "print") => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a5",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const contentWidth = pageWidth - margin * 2;

    const firmMeta = getResolvedFirmMeta();
    const firmName = firmMeta?.firmName || "";
    const firmAddress = firmMeta?.address || "";
    const firmPhone = firmMeta?.phone || "";
    const firmGstin = firmMeta?.gstin || "";

    const txnType = transaction.type || "";
    const isReceived = txnType.includes("received");
    const title = isReceived ? "RECEIPT SLIP" : "PAYMENT SLIP";

    doc.setDrawColor(30, 41, 59);
    doc.setLineWidth(0.3);
    doc.rect(margin, margin, contentWidth, pageHeight - margin * 2);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(15, 23, 42);
    doc.text(firmName.toUpperCase(), pageWidth / 2, margin + 8, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    let currentY = margin + 12;
    if (firmAddress) {
      const splitAddress = doc.splitTextToSize(firmAddress, contentWidth - 10);
      splitAddress.forEach((line) => {
        doc.text(line, pageWidth / 2, currentY, { align: "center" });
        currentY += 3.5;
      });
    }

    const contactInfo = [
      firmPhone ? `Ph: ${firmPhone}` : "",
      firmGstin ? `GSTIN: ${firmGstin}` : "",
    ].filter(Boolean).join(" | ");

    if (contactInfo) {
      doc.text(contactInfo, pageWidth / 2, currentY, { align: "center" });
      currentY += 4.5;
    }

    doc.setDrawColor(226, 232, 240);
    doc.line(margin + 2, currentY, margin + contentWidth - 2, currentY);
    currentY += 6;

    const bannerColor = isReceived ? [21, 128, 61] : [153, 27, 27];
    doc.setFillColor(...bannerColor);
    doc.rect(pageWidth / 2 - 25, currentY - 4, 50, 6.5, "F");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(255, 255, 255);
    doc.text(title, pageWidth / 2, currentY + 0.5, { align: "center" });
    currentY += 8;

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(8.5);

    const leftX = margin + 6;
    const valueX = margin + 42;
    const rowHeight = 6.5;

    const details = [
      ["Receipt No / Voucher No", transaction.transaction_no || "-"],
      ["Date", formatDate(transaction.date) || "-"],
      ["Transaction Mode", txnType.includes("bank") ? "Bank" : "Cash"],
      [isReceived ? "Received From" : "Paid To", transaction.partyName || "-"],
      ["Remarks / Narration", transaction.remarks || "-"],
    ];

    details.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${label} :`, leftX, currentY);
      doc.setFont("helvetica", "normal");

      const maxWidth = contentWidth - 46;
      const splitVal = doc.splitTextToSize(String(value), maxWidth);

      splitVal.forEach((valLine, valIdx) => {
        doc.text(valLine, valueX, currentY + (valIdx * 4));
      });

      currentY += rowHeight + (Math.max(0, splitVal.length - 1) * 4);
    });

    currentY += 2;

    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin + 6, currentY, contentWidth - 12, 11, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text("Amount Received :", margin + 10, currentY + 7);

    doc.setFontSize(12);
    doc.setTextColor(...bannerColor);
    doc.text(`Rs. ${Number(transaction.amount || 0).toLocaleString("en-IN")}/-`, margin + contentWidth - 10, currentY + 7.2, { align: "right" });

    currentY += 16;

    const words = numberToWords(Number(transaction.amount || 0)) + " Only";
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const splitWords = doc.splitTextToSize(`In Words: Rs. ${words}`, contentWidth - 12);
    splitWords.forEach((wordLine) => {
      doc.text(wordLine, margin + 6, currentY);
      currentY += 4;
    });

    currentY += 8;

    const sigY = pageHeight - margin - 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text("Prepared By", margin + 12, sigY);
    doc.text("Authorized Signatory", margin + contentWidth - 12, sigY, { align: "right" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.line(margin + 6, sigY - 4, margin + 38, sigY - 4);
    doc.line(margin + contentWidth - 38, sigY - 4, margin + contentWidth - 6, sigY - 4);

    if (action === "print") {
      doc.autoPrint();
      window.open(doc.output("bloburl"), "_blank");
    } else {
      doc.save(`receipt-${transaction.transaction_no || "slip"}.pdf`);
    }
  };

  const actions = [
    {
      label: <FaEye size={12} />,
      onClick: (t) => {
        setSelectedTransaction(t);
        setIsViewModalOpen(true);
      },
      className: "bg-green-600 text-white hover:bg-green-700 p-2",
    },
    {
      label: <FaEdit size={12} />,
      onClick: (t) => {
        setSelectedTransaction(t);
        const txnType = t.type || "";
        let contactType = "";
        if (
          txnType === TRANSACTION_TYPES.BANK_RECEIVED ||
          txnType === TRANSACTION_TYPES.CASH_RECEIVED
        ) {
          contactType = "party";
        } else if (
          txnType === TRANSACTION_TYPES.BANK_PAYMENT ||
          txnType === TRANSACTION_TYPES.CASH_PAYMENT
        ) {
          contactType = "supplier";
        }
        const contactId = t.contact_id?._id || t.contact_id || "";
        const bankId = t.bank_id?._id || t.bank_id || "";
        setFormData({
          transaction_no: t.transaction_no || "",
          contact_type: contactType,
          type: txnType,
          contact_id: String(contactId),
          amount: t.amount || "",
          bank_id: String(bankId),
          date: convertDateFromISO(t.date),
          reference: t.reference || "",
          remarks: t.remarks || "",
        });
        setIsEditModalOpen(true);
      },
      className: "bg-blue-600 text-white hover:bg-blue-700 p-2",
    },
    {
      label: <FaPrint size={12} />,
      onClick: handleChequePrint,
      show: isSupplierBankPaymentTransaction,
      className: "bg-purple-600 text-white hover:bg-purple-700 p-2",
      title: "Print Cheque",
    },
    {
      label: <FaPrint size={12} className="text-white" />,
      onClick: (t) => handleReceiptPrint(t, "print"),
      className: "bg-indigo-600 text-white hover:bg-indigo-700 p-2",
      title: "Print Slip",
    },
    {
      label: <FaDownload size={12} className="text-white" />,
      onClick: (t) => handleReceiptPrint(t, "download"),
      className: "bg-teal-600 text-white hover:bg-teal-700 p-2",
      title: "Download Slip",
    },
    {
      label: <FaTrash size={12} />,
      onClick: (t) => setDeleteDialog({ isOpen: true, transaction: t }),
      className: "bg-red-600 text-white hover:bg-red-700 p-2",
      title: "Delete",
    },
  ];

  const handleInputChange = (field, value) => {
    if (field && typeof field === "object" && field.target) {
      setFormData((prev) => ({
        ...prev,
        [field.target.name]: field.target.value,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [field]: value }));
    }
  };

  const handleNativeInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const buildPayload = () => {
    const payload = {
      type: formData.type,
      amount: Number(formData.amount),
      date: convertDateToISO(formData.date),
      reference: formData.reference,
      remarks: formData.remarks,
    };

    if (formData.transaction_no)
      payload.transaction_no = formData.transaction_no;
    if (formData.contact_id) payload.contact_id = formData.contact_id;
    if (formData.bank_id) payload.bank_id = formData.bank_id;
    return payload;
  };

  const submitTransaction = async ({
    contactType,
    settleAfterCreate = false,
  } = {}) => {
    // Validation
    if (!formData.type || !formData.amount) {
      showToast("Please fill all required fields", "error");
      return;
    }

    if (showContactDropdown && !formData.contact_id) {
      showToast("Please select a contact", "error");
      return;
    }

    const payload = buildPayload();
    try {
      let savedTransaction = null;
      if (isEditModalOpen) {
        const res = await api.put(
          `/transactions/${selectedTransaction._id}`,
          payload,
        );
        savedTransaction = res?.data?.data || null;
        showToast("Transaction updated successfully", "success");
      } else {
        const res = await api.post("/transactions", payload);
        savedTransaction = res?.data?.data || null;
        showToast("Transaction created successfully", "success");
      }
      await fetchTransactions();
      if (isEditModalOpen) {
        setIsEditModalOpen(false);
      } else if (settleAfterCreate) {
        setIsAddModalOpen(false);
      }
      setFormData(INITIAL_FORM);
      setSelectedTransaction(null);
      if (settleAfterCreate && savedTransaction) {
        const settleTransaction = {
          transaction_id: getEntityId(savedTransaction),
          contact_type: contactType,
          contact_id:
            getEntityId(savedTransaction.contact_id) || formData.contact_id,
          type: savedTransaction.type || formData.type,
          payment_type: PAYMENT_TYPE_BY_TRANSACTION_TYPE[formData.type],
          amount: Number(savedTransaction.amount ?? formData.amount) || 0,
          bank_id:
            getEntityId(savedTransaction.bank_id) || formData.bank_id || "",
          reference_no: savedTransaction.reference || formData.reference || "",
          date: convertDateFromISO(savedTransaction.date) || formData.date,
        };
        const params = new URLSearchParams({
          settle: "1",
          contact_type: settleTransaction.contact_type,
          contact_id: String(settleTransaction.contact_id || ""),
          transaction_id: String(settleTransaction.transaction_id || ""),
          type: String(settleTransaction.type || ""),
          payment_type: String(settleTransaction.payment_type || ""),
          amount: String(settleTransaction.amount || 0),
          bank_id: String(settleTransaction.bank_id || ""),
          reference_no: String(settleTransaction.reference_no || ""),
          date: String(settleTransaction.date || ""),
        });
        navigate(`/transactions/outstandings?${params.toString()}`, {
          state: {
            settleTransaction,
          },
        });
      } else if (!isEditModalOpen) {
        focusFirstField();
      }
    } catch (error) {
      console.error("Transaction error:", error.response?.data);
      showToast(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Operation failed",
        "error",
      );
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitTransaction();
  };

  const handleSettleTransaction = async () => {
    await submitTransaction({
      contactType: formData.contact_type,
      settleAfterCreate: true,
    });
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/transactions/${deleteDialog.transaction._id}`);
      showToast("Transaction deleted successfully", "success");
      fetchTransactions();
    } catch (error) {
      showToast("Failed to delete transaction", "error");
    }
    setDeleteDialog({ isOpen: false, transaction: null });
  };

  // Get contacts based on transaction type
  const getContactsForType = (type) => {
    if (
      type === TRANSACTION_TYPES.CASH_RECEIVED ||
      type === TRANSACTION_TYPES.BANK_RECEIVED
    ) {
      return parties; // Show parties for receive transactions
    }
    if (
      type === TRANSACTION_TYPES.CASH_PAYMENT ||
      type === TRANSACTION_TYPES.BANK_PAYMENT
    ) {
      return suppliers; // Show suppliers for payment transactions
    }
    return [];
  };

  const isBankTransaction =
    formData.type === TRANSACTION_TYPES.BANK_RECEIVED ||
    formData.type === TRANSACTION_TYPES.BANK_PAYMENT;
  const showContactDropdown = formData.type;
  const contactsToShow = getContactsForType(formData.type);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Transaction Master
          </h1>
          <p className="text-gray-600 text-sm">
            Manage all financial transactions
          </p>
        </div>
        <Button
          onClick={() => {
            setFormData(INITIAL_FORM);
            setIsAddModalOpen(true);
          }}
          className="flex items-center gap-2"
        >
          <FaPlus />
          Add Transaction
        </Button>
      </div>

      <div className="flex gap-2 border-b">
        {[
          { key: "all", label: "All" },
          { key: BOOKS.CASH, label: "Cash Book" },
          { key: BOOKS.AC, label: "A/C Book" },
          { key: BOOKS.CREDITOR, label: "Creditor" },
          { key: BOOKS.DEBITOR, label: "Debitor" },
        ].map((book) => (
          <button
            key={book.key}
            onClick={() => setActiveBook(book.key)}
            className={`px-4 py-2 font-medium transition-colors ${
              activeBook === book.key ?
                "border-b-2 border-blue-600 text-blue-600"
              : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {book.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {[
            { key: "all", label: "All History" },
            { key: "supplier", label: "Supplier History Transaction" },
            { key: "party", label: "Party History Transaction" },
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setHistoryFilter(item.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                historyFilter === item.key ?
                  "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              From Date
            </label>
            <Input
              type="date"
              value={fromDate}
              onChange={(val) => {
                const display = toDisplayDate(val);
                setFromDate(display || val || "");
              }}
              placeholder="dd/mm/yyyy"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              To Date
            </label>
            <Input
              type="date"
              value={toDate}
              onChange={(val) => {
                const display = toDisplayDate(val);
                setToDate(display || val || "");
              }}
              placeholder="dd/mm/yyyy"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => {
              const today = new Date();
              const year =
                today.getMonth() >= 3 ?
                  today.getFullYear()
                : today.getFullYear() - 1;
              setFromDate(`01/04/${year}`);
              setToDate(getToday());
            }}
          >
            Clear Dates
          </Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredTransactions}
        actions={actions}
        searchable={true}
        sortable={true}
        pagination={true}
        loading={loading}
      />

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, transaction: null })}
        onConfirm={handleDelete}
        itemName={`Transaction #${deleteDialog.transaction?.transaction_no}`}
      />

      <Modal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedTransaction(null);
        }}
        title="Transaction Details"
        size="md"
      >
        {selectedTransaction && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="font-medium">Transaction No:</label>
                <p>{selectedTransaction.transaction_no}</p>
              </div>
              <div>
                <label className="font-medium">Type:</label>
                <p>
                  {selectedTransaction.type ?
                    selectedTransaction.type.replace(/_/g, " ").toUpperCase()
                  : "N/A"}
                </p>
              </div>
              <div>
                <label className="font-medium">Date:</label>
                <p>{formatDate(selectedTransaction.date)}</p>
              </div>
              <div>
                <label className="font-medium">Party:</label>
                <p>
                  {selectedTransaction.partyName ||
                    selectedTransaction.contact_id?.name ||
                    "N/A"}
                </p>
              </div>
              <div>
                <label className="font-medium">Amount:</label>
                <p>₹{(Number(selectedTransaction.amount) || 0).toFixed(2)}</p>
              </div>
              <div>
                <label className="font-medium">Bank:</label>
                <p>
                  {selectedTransaction.bank_id?.bank_name ||
                    (selectedTransaction.bank_id ?
                      bankNameById.get(
                        String(getEntityId(selectedTransaction.bank_id)),
                      )
                    : null) ||
                    "N/A"}
                </p>
              </div>
              <div>
                <label className="font-medium">Reference:</label>
                <p>{selectedTransaction.reference || "N/A"}</p>
              </div>
              <div>
                <label className="font-medium">Type:</label>
                <p>{selectedTransaction.is_gst === 1 ? "1" : "0"}</p>
              </div>
              <div className="col-span-2">
                <label className="font-medium">Remarks:</label>
                <p>{selectedTransaction.remarks || "N/A"}</p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={() => {
                setIsViewModalOpen(false);
                setSelectedTransaction(null);
              }}
            >
              Close
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setFormData(INITIAL_FORM);
        }}
        title={isEditModalOpen ? "Edit Transaction" : "Add Transaction"}
        size="md"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                Transaction No
              </label>
              <input
                ref={firstFieldRef}
                name="transaction_no"
                value={formData.transaction_no}
                onChange={handleNativeInputChange}
                placeholder="Auto-generated if empty"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Contact Type *
              </label>
              <select
                name="contact_type"
                value={formData.contact_type}
                onChange={(e) => {
                  setFormData({
                    ...formData,
                    contact_type: e.target.value,
                    type: "",
                    contact_id: "",
                  });
                }}
                required
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="" disabled>
                  Select Contact Type
                </option>
                <option value="party">Party</option>
                <option value="supplier">Supplier</option>
                <option value="book">Book</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Transaction Type *
              </label>
              <select
                name="type"
                value={formData.type}
                onChange={handleNativeInputChange}
                required
                disabled={!formData.contact_type}
                className="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100"
              >
                <option value="">Select Type</option>
                {formData.contact_type === "party" && (
                  <>
                    <option value={TRANSACTION_TYPES.BANK_RECEIVED}>
                      Bank Receive
                    </option>
                    <option value={TRANSACTION_TYPES.CASH_RECEIVED}>
                      Cash Receive
                    </option>
                  </>
                )}
                {formData.contact_type === "supplier" && (
                  <>
                    <option value={TRANSACTION_TYPES.BANK_PAYMENT}>
                      Bank Payment
                    </option>
                    <option value={TRANSACTION_TYPES.CASH_PAYMENT}>
                      Cash Payment
                    </option>
                  </>
                )}
                {formData.contact_type === "book" && (
                  <>
                    <option value={TRANSACTION_TYPES.CASH_RECEIVED}>
                      Cash Receive
                    </option>
                    <option value={TRANSACTION_TYPES.BANK_RECEIVED}>
                      Bank Receive
                    </option>
                    <option value={TRANSACTION_TYPES.CASH_PAYMENT}>
                      Cash Payment
                    </option>
                    <option value={TRANSACTION_TYPES.BANK_PAYMENT}>
                      Bank Payment
                    </option>
                  </>
                )}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Date *</label>
              <Input
                type="date"
                name="date"
                placeholder="dd/mm/yyyy"
                value={formData.date}
                onChange={(val) => {
                  const display = toDisplayDate(val);
                  setFormData((prev) => ({ ...prev, date: display || val || "" }));
                }}
                required
              />
            </div>
            {showContactDropdown && formData.contact_type !== "book" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  {formData.contact_type === "party" ? "Party *" : "Supplier *"}
                </label>
                <SearchableSelect
                  key={`contact-${formData.contact_type}`}
                  value={formData.contact_id}
                  onChange={(value) => handleInputChange("contact_id", value)}
                  placeholder={`Select ${formData.contact_type === "party" ? "Party" : "Supplier"}`}
                  searchPlaceholder={`Search ${formData.contact_type === "party" ? "party" : "supplier"}...`}
                  options={sortContactsWithBooksOnTop(
                    formData.contact_type === "party" ? parties : suppliers
                  ).map((contact) => ({
                    value: String(getEntityId(contact)),
                    label: contact.name || "",
                  }))}
                  buttonClassName="rounded-lg"
                />
              </div>
            )}
            {formData.contact_type === "book" && (
              <div>
                <label className="block text-sm font-medium mb-1">Book *</label>
                <SearchableSelect
                  value={formData.contact_id}
                  onChange={(value) => handleInputChange("contact_id", value)}
                  placeholder="Select Book (CashBook/BankBook)"
                  searchPlaceholder="Search book..."
                  options={sortContactsWithBooksOnTop(books).map((book) => ({
                    value: String(getEntityId(book)),
                    label: book.name || "",
                  }))}
                  buttonClassName="rounded-lg"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Amount *</label>
              <input
                type="number"
                name="amount"
                value={formData.amount}
                onChange={handleNativeInputChange}
                onWheel={(e) => e.target.blur()}
                required
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="0.00"
              />
            </div>
            {isBankTransaction && (
              <div>
                <label className="block text-sm font-medium mb-1">Bank *</label>
                <SearchableSelect
                  value={formData.bank_id}
                  onChange={(value) => handleInputChange("bank_id", value)}
                  placeholder={banks.length === 0 ? "No banks found" : "Select Bank"}
                  searchPlaceholder="Search bank..."
                  options={banks.map((b) => ({
                    value: String(getEntityId(b)),
                    label: `${b.bank_name || ""}${b.account_number ? ` - ${b.account_number}` : ""}`,
                    searchText: `${b.bank_name || ""} ${b.account_number || ""}`,
                  }))}
                  buttonClassName="rounded-lg"
                />
                {banks.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No bank accounts found. Please add a bank in Bank Master first.
                  </p>
                )}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">
                Reference
              </label>
              <input
                name="reference"
                value={formData.reference}
                onChange={handleNativeInputChange}
                placeholder="Ref/Cheque No"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium mb-1">Remarks</label>
              <textarea
                name="remarks"
                value={formData.remarks}
                onChange={handleNativeInputChange}
                rows="2"
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="Additional notes"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
                setFormData(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleSettleTransaction}
            >
              Settle Transaction
            </Button>
            <Button type="submit">
              {isEditModalOpen ? "Update" : "Add"} Transaction
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default TransactionMaster;
