import React, { useEffect, useMemo, useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FaPrint } from "react-icons/fa";
import { FaTrash } from "react-icons/fa6";
import { Button, Input, Select } from "../../components/ui";
import useStore from "../../store";
import api from "../../services/axiosInstance";
import {
  getEntityId,
  getResponseList,
  getResponseData,
  getResponseMeta,
  normalizeContact,
  toNumber,
} from "../../services/apiUtils";
import {
  addBrandedReportFooters,
  drawBrandedReportHeader,
  getResolvedFirmMeta,
} from "../../utils/reportPdf";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";

const PAYMENT_LABELS = {
  bank_transaction_received_amount: "Bank Received",
  cash_payment_received_amount: "Cash Received",
  bank_transfer_payment_given: "Bank Payment Given",
  cash_payment_given: "Cash Payment Given",
};

const OutstandingList = () => {
  const { showToast } = useStore();
  const [contactType, setContactType] = useState("party");
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState("");

  useKeyboardShortcuts({
    onRefresh: () => {
      setSearch("");
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
    onResetFilters: () => {
      setSearch("");
      setContactType("party");
      setSelectedContact("");
      setPagination((prev) => ({ ...prev, page: 1 }));
    },
  });
  const [selectedContact, setSelectedContact] = useState("");
  const [selectedContacts, setSelectedContacts] = useState(new Set());
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingBills, setLoadingBills] = useState(false);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [discountingBillId, setDiscountingBillId] = useState("");
  const [deletingBillIds, setDeletingBillIds] = useState(new Set());
  const [selectedBillIds, setSelectedBillIds] = useState(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [bills, setBills] = useState([]);
  const [multiPartyData, setMultiPartyData] = useState([]);
  const [loadingMultiParty, setLoadingMultiParty] = useState(false);
  const [summary, setSummary] = useState(null);
  const [paymentHistory, setPaymentHistory] = useState([]);
  const [activeTab, setActiveTab] = useState("due");
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    totalPages: 1,
  });
  const [billsPagination, setBillsPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
  });
  const [historyPagination, setHistoryPagination] = useState({
    page: 1,
    limit: 20,
    totalPages: 1,
  });

  // Load outstanding contacts using new API
  useEffect(() => {
    const loadContacts = async () => {
      setLoadingContacts(true);
      try {
        const params = {
          type: contactType,
          page: pagination.page,
          limit: pagination.limit,
        };
        if (search.trim()) {
          params.search = search.trim();
        }

        const response = await api.get("/outstanding", { params });
        const contactsList = getResponseList(response) || [];
        const meta = getResponseMeta(response) || {};

        const mappedContacts = contactsList.map((contact) => ({
          id: getEntityId(contact) || contact._id,
          name: contact.name || contact.contact_name || "-",
          type: contactType,
          balance: toNumber(contact.balance || contact.balance_amount || 0, 0),
          city: contact.city || "",
          phone: contact.phone || "",
          address: contact.address || "",
          state: contact.state || "",
          agentName: contact.agent_id?.name || "",
        }));

        setContacts(mappedContacts);
        setPagination((prev) => ({
          ...prev,
          totalPages: meta.totalPages || 1,
        }));
      } catch (error) {
        console.error("Failed to load outstanding contacts:", error);
        showToast(
          error?.response?.data?.message || "Failed to load contacts",
          "error",
        );
        setContacts([]);
      } finally {
        setLoadingContacts(false);
      }
    };

    loadContacts();
  }, [contactType, search, pagination.page, refreshKey, showToast]);

  // Load contact summary and bills using new API
  useEffect(() => {
    if (!selectedContact) {
      setBills([]);
      setSummary(null);
      setPaymentHistory([]);
      setSelectedBillIds(new Set());
      return;
    }

    const fetchContactData = async () => {
      try {
        // Fetch summary
        setLoadingSummary(true);
        const summaryRes = await api.get(
          `/outstanding/${selectedContact}/summary`,
        );
        const summaryData = getResponseData(summaryRes) || {};
        setSummary({
          totalDue: toNumber(summaryData.total_due || 0, 0),
          totalPaid: toNumber(summaryData.total_paid || 0, 0),
          totalDiscount: toNumber(summaryData.total_discount || 0, 0),
          totalAmount: toNumber(summaryData.total_amount || 0, 0),
          dueCount: summaryData.due_count || 0,
          settledCount: summaryData.settled_count || 0,
        });
      } catch (error) {
        console.error("Failed to load contact summary:", error);
        showToast("Failed to load contact summary", "error");
        setSummary(null);
      } finally {
        setLoadingSummary(false);
      }
    };

    fetchContactData();
  }, [selectedContact, refreshKey, showToast]);

  // Load bills for selected contact
  useEffect(() => {
    if (!selectedContact) return;

    const fetchBills = async () => {
      setLoadingBills(true);
      try {
        const params = {
          status: activeTab, // 'due' or 'settled'
          page: billsPagination.page,
          limit: billsPagination.limit,
        };

        const res = await api.get(`/outstanding/${selectedContact}/bills`, {
          params,
        });
        const billsList = getResponseList(res) || [];
        const meta = getResponseMeta(res) || {};

        const mappedBills = billsList.map((bill) => {
          const amount = toNumber(bill.amount || bill.total_amount || 0, 0);
          const paidAmount = toNumber(
            bill.paid_amount || bill.paidAmount || 0,
            0,
          );
          const returnAmount = toNumber(bill.return_amount || 0, 0);
          const settlementDiscount = toNumber(
            bill.settlement_discount || bill.settlementDiscount || 0,
            0,
          );
          const due = amount - paidAmount - returnAmount - settlementDiscount;
          // Use createdAt, created_at, or fall back to date for due days calculation
          const creationDate = bill.createdAt || bill.created_at || bill.date;
          const daysSince = calculateDaysSince(bill.date, creationDate);

          return {
            id: getEntityId(bill) || bill._id,
            billNo: bill.bill_no || bill.billNo || "-",
            date: bill.date,
            createdAt: creationDate,
            amount,
            paidAmount,
            returnAmount,
            settlementDiscount,
            due: Number(due.toFixed(2)),
            daysSince,
            status: bill.payment_status || (due <= 0.009 ? "settled" : "due"),
            paymentEntries:
              Array.isArray(bill.payment_entries) ? bill.payment_entries : [],
            raw: bill,
          };
        });

        setBills(mappedBills);
        setSelectedBillIds(new Set());
        setBillsPagination((prev) => ({
          ...prev,
          totalPages: meta.totalPages || 1,
        }));
      } catch (error) {
        console.error("Failed to load bills:", error);
        showToast("Failed to load bills", "error");
        setBills([]);
      } finally {
        setLoadingBills(false);
      }
    };

    fetchBills();
  }, [selectedContact, activeTab, billsPagination.page, refreshKey, showToast]);

  // Load payment history for selected contact
  useEffect(() => {
    if (!selectedContact || activeTab !== "history") {
      setPaymentHistory([]);
      return;
    }

    const fetchHistory = async () => {
      try {
        const params = {
          page: historyPagination.page,
          limit: historyPagination.limit,
        };

        const res = await api.get(`/outstanding/${selectedContact}/history`, {
          params,
        });
        const historyList = getResponseList(res) || [];
        const meta = getResponseMeta(res) || {};

        const mappedHistory = historyList.map((entry, index) => ({
          id: `${selectedContact}-${index}`,
          billNo: entry.bill_no || "-",
          date: entry.date,
          amount: toNumber(entry.amount || 0, 0),
          paymentType: entry.payment_type || "-",
          referenceNo: entry.reference_no || "",
          note: entry.note || "",
          settledTo: entry.settled_to || "bill",
        }));

        setPaymentHistory(mappedHistory);
        setHistoryPagination((prev) => ({
          ...prev,
          totalPages: meta.totalPages || 1,
        }));
      } catch (error) {
        console.error("Failed to load payment history:", error);
        showToast("Failed to load payment history", "error");
        setPaymentHistory([]);
      }
    };

    fetchHistory();
  }, [selectedContact, activeTab, historyPagination.page, showToast]);

  // Load due bills for multiple selected contacts
  useEffect(() => {
    if (selectedContacts.size === 0) {
      setMultiPartyData([]);
      return;
    }

    const fetchMultiPartyData = async () => {
      setLoadingMultiParty(true);
      try {
        const promises = Array.from(selectedContacts).map(async (contactId) => {
          let contact = contacts.find((c) => c.id === contactId);
          if (!contact) {
            try {
              const resContact = await api.get(`/contacts/${contactId}`);
              const cData = getResponseData(resContact) || {};
              contact = {
                id: cData._id || cData.id,
                name: cData.name || "-",
                type: contactType,
                balance: toNumber(cData.balance || 0, 0),
                city: cData.city || "",
                phone: cData.phone || "",
                address: cData.address || "",
                state: cData.state || "",
                agentName: cData.agent_id?.name || "",
              };
            } catch (err) {
              console.error(
                `Failed to fetch contact details for ${contactId}`,
                err,
              );
            }
          }
          const res = await api.get(`/outstanding/${contactId}/bills`, {
            params: { status: "due", page: 1, limit: 1000 },
          });
          const billsList = getResponseList(res) || [];
          const mappedBills = billsList.map((bill) => {
            const amount = toNumber(bill.amount || bill.total_amount || 0, 0);
            const paidAmount = toNumber(
              bill.paid_amount || bill.paidAmount || 0,
              0,
            );
            const returnAmount = toNumber(bill.return_amount || 0, 0);
            const settlementDiscount = toNumber(
              bill.settlement_discount || bill.settlementDiscount || 0,
              0,
            );
            const due = amount - paidAmount - returnAmount - settlementDiscount;
            const creationDate = bill.createdAt || bill.created_at || bill.date;
            const daysSince = calculateDaysSince(bill.date, creationDate);

            return {
              id: getEntityId(bill) || bill._id,
              billNo: bill.bill_no || bill.billNo || "-",
              date: bill.date,
              createdAt: creationDate,
              amount,
              paidAmount,
              returnAmount,
              settlementDiscount,
              due: Number(due.toFixed(2)),
              daysSince,
              status: bill.payment_status || (due <= 0.009 ? "settled" : "due"),
            };
          });

          mappedBills.sort((a, b) => new Date(a.date) - new Date(b.date));

          return {
            contact: contact || { id: contactId, name: "Unknown" },
            bills: mappedBills,
          };
        });

        const results = await Promise.all(promises);
        setMultiPartyData(results.filter((r) => r.contact));
      } catch (error) {
        console.error("Failed to load multi party outstanding data:", error);
        showToast(
          "Failed to load outstanding data for selected contacts",
          "error",
        );
      } finally {
        setLoadingMultiParty(false);
      }
    };

    fetchMultiPartyData();
  }, [selectedContacts, refreshKey, contacts, contactType, showToast]);

  const visibleContacts = useMemo(() => {
    // Since we're now using server-side search and filtering,
    // we just return the contacts as they come from the API
    return contacts;
  }, [contacts]);

  const toggleAllVisibleContacts = () => {
    if (visibleContacts.length === 0) {
      showToast(`No ${contactType} contacts available to select`, "warning");
      return;
    }

    const visibleIds = visibleContacts
      .map((contact) => contact?.id)
      .filter(Boolean);
    const allVisibleSelected =
      visibleIds.length > 0 &&
      visibleIds.every((contactId) => selectedContacts.has(contactId));

    setSelectedContacts((prev) => {
      const next = new Set(prev);
      visibleIds.forEach((contactId) => {
        if (allVisibleSelected) next.delete(contactId);
        else next.add(contactId);
      });
      return next;
    });

    showToast(
      allVisibleSelected ?
        `Deselected visible ${contactType === "party" ? "parties" : "suppliers"}`
      : `Selected all visible ${contactType === "party" ? "parties" : "suppliers"}`,
      "success",
    );
  };

  useEffect(() => {
    const handleSelectAllShortcut = (event) => {
      if (!(event.ctrlKey && event.key.toLowerCase() === "z")) return;

      const target = event.target;
      const isEditable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target?.isContentEditable;

      if (isEditable) return;

      event.preventDefault();
      toggleAllVisibleContacts();
    };

    window.addEventListener("keydown", handleSelectAllShortcut);
    return () => {
      window.removeEventListener("keydown", handleSelectAllShortcut);
    };
  }, [visibleContacts, contactType, selectedContacts, showToast]);

  const selectedContactDetails = contacts.find((c) => c.id === selectedContact);

  const dueBills = useMemo(
    () => bills.filter((b) => b.status === "due"),
    [bills],
  );
  const settledBills = useMemo(
    () => bills.filter((b) => b.status === "settled"),
    [bills],
  );

  const totals = useMemo(() => {
    if (summary) {
      return {
        totalDue: summary.totalDue,
        totalPaid: summary.totalPaid,
        totalDiscount: summary.totalDiscount || 0,
        totalAmount: summary.totalAmount,
      };
    }
    // Fallback calculation if summary is not available
    const totalDue = bills.reduce((sum, b) => sum + toNumber(b.due, 0), 0);
    const totalPaid = bills.reduce(
      (sum, b) => sum + toNumber(b.paidAmount, 0),
      0,
    );
    const totalDiscount = bills.reduce(
      (sum, b) => sum + toNumber(b.settlementDiscount, 0),
      0,
    );
    const totalAmount = bills.reduce(
      (sum, b) => sum + toNumber(b.amount, 0),
      0,
    );
    return { totalDue, totalPaid, totalDiscount, totalAmount };
  }, [bills, summary]);

  const multiPartyTotals = useMemo(() => {
    let totalDue = 0;
    let totalPaid = 0;
    let totalDiscount = 0;
    let totalAmount = 0;
    multiPartyData.forEach(({ bills }) => {
      bills.forEach((b) => {
        totalDue += b.due;
        totalPaid += b.paidAmount;
        totalDiscount += b.settlementDiscount;
        totalAmount += b.amount;
      });
    });
    return { totalDue, totalPaid, totalDiscount, totalAmount };
  }, [multiPartyData]);

  const historyEntries = useMemo(() => {
    return paymentHistory;
  }, [paymentHistory]);

  // Handle search with debouncing
  const handleSearchChange = (value) => {
    setSearch(value);
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page on search
  };

  // Handle contact type change
  const handleContactTypeChange = (type) => {
    setContactType(type);
    setSelectedContact(""); // Clear selection when changing type
    setPagination((prev) => ({ ...prev, page: 1 })); // Reset to first page
  };

  // Handle tab change
  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSelectedBillIds(new Set());
    setBillsPagination((prev) => ({ ...prev, page: 1 })); // Reset bills pagination
    setHistoryPagination((prev) => ({ ...prev, page: 1 })); // Reset history pagination
  };

  // Calculate days since bill creation date
  const calculateDaysSince = (billDate, createdDate) => {
    if (!billDate && !createdDate) return 0;

    // Use createdDate if available, otherwise fall back to billDate
    const dateToUse = createdDate || billDate;
    if (!dateToUse) return 0;

    const today = new Date();
    const created = new Date(dateToUse);
    const diffTime = today - created;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays); // Ensure non-negative days
  };

  const formatRs = (value) => `Rs ${toNumber(value, 0).toLocaleString()}`;

  const formatDateDDMMYYYY = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${date.getFullYear()}`;
  };

  const formatReceiptDate = formatDateDDMMYYYY;

  const generateSettlementReceiptPDF = (settlement) => {
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
    ]
      .filter(Boolean)
      .join(" | ");
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
        ["Payment Date", formatReceiptDate(settlement.paymentDate)],
        ["Payment Type", settlement.paymentType || "-"],
        ...(settlement.referenceNo ?
          [["Reference", settlement.referenceNo]]
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
        ["Settlement Discount", formatRs(settlement.settlementDiscountAmount)],
        ["Unsettled", formatRs(settlement.unsettledAmount)],
      ],
      theme: "striped",
      styles: { fontSize: 7.5, cellPadding: 1.7 },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: marginX, right: marginX },
      columnStyles: { 1: { halign: "right" } },
    });

    cursorY = doc.lastAutoTable.finalY + 4;
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
      body: settlement.applied.map((row) => [
        row.bill_no,
        formatRs(row.due_before),
        formatRs(row.settled_amount),
        formatRs(row.settlement_discount),
        formatRs(row.due_after),
        row.payment_status,
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

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX, pageHeight - 16, rightX, pageHeight - 16);
    doc.setFontSize(7.5);
    doc.setTextColor(107, 114, 128);
    doc.text("System-generated receipt.", marginX, pageHeight - 10);
    doc.text(firmMeta.firmName || "Firm", rightX, pageHeight - 10, {
      align: "right",
    });

    const safeName = String(settlement.contactName || "contact")
      .replace(/[^\w-]+/g, "_")
      .slice(0, 40);
    const safeDate = formatReceiptDate(settlement.paymentDate).replaceAll(
      "/",
      "-",
    );
    doc.save(`Settlement_${safeName}_${safeDate}.pdf`);
  };

  const downloadBillSettlementReceipt = (bill) => {
    const latestEntry = [...(bill.paymentEntries || [])].sort(
      (a, b) => new Date(b.date || 0) - new Date(a.date || 0),
    )[0];
    const allocatedAmount = toNumber(latestEntry?.amount || bill.paidAmount, 0);
    const discountAmount = toNumber(bill.settlementDiscount, 0);

    generateSettlementReceiptPDF({
      contactName: selectedContactDetails?.name || "-",
      contactType,
      paymentDate: latestEntry?.date || bill.date,
      paymentType:
        PAYMENT_LABELS[latestEntry?.payment_type] ||
        latestEntry?.payment_type ||
        "Settlement",
      referenceNo: latestEntry?.reference_no || latestEntry?.reference || "",
      note: latestEntry?.note || "",
      totalAmount: allocatedAmount,
      allocatedAmount,
      settlementDiscountAmount: discountAmount,
      unsettledAmount: 0,
      applied: [
        {
          bill_no: bill.billNo,
          due_before: bill.amount,
          settled_amount: allocatedAmount,
          settlement_discount: discountAmount,
          due_after: bill.due,
          payment_status: bill.status,
        },
      ],
    });
  };

  const getBillId = (billOrId) =>
    typeof billOrId === "object" ?
      String(billOrId?.id || "")
    : String(billOrId || "");

  const isBillSelectable = (bill) => Boolean(getBillId(bill));

  const isBillDeletable = (bill) =>
    Boolean(getBillId(bill)) &&
    toNumber(bill?.paidAmount, 0) <= 0.009 &&
    toNumber(bill?.returnAmount, 0) <= 0.009 &&
    toNumber(bill?.settlementDiscount, 0) <= 0.009;

  const isBillSettlementUndoable = (bill) =>
    Boolean(getBillId(bill)) &&
    (toNumber(bill?.paidAmount, 0) > 0.009 ||
      toNumber(bill?.settlementDiscount, 0) > 0.009 ||
      ["paid", "overpaid"].includes(String(bill?.status || "").toLowerCase()));

  const applyDiscountToBill = async (bill) => {
    const discountAmount = toNumber(bill?.due, 0);
    if (!bill?.id || discountAmount <= 0.009) {
      showToast("No due amount available for discount", "warning");
      return;
    }

    const confirmed = window.confirm(
      `Apply ${formatRs(discountAmount)} discount to bill ${bill.billNo}?`,
    );
    if (!confirmed) return;

    try {
      setDiscountingBillId(bill.id);
      await api.post("/bills/settlements", {
        contact_id: selectedContact,
        total_amount: 0,
        allocations: [
          {
            bill_id: bill.id,
            amount: 0,
            settlement_discount: discountAmount,
          },
        ],
        apply_remaining_to_balance: false,
      });

      setBills((prev) =>
        activeTab === "due" ?
          prev.filter((row) => row.id !== bill.id)
        : prev.map((row) =>
            row.id === bill.id ?
              {
                ...row,
                settlementDiscount:
                  toNumber(row.settlementDiscount, 0) + discountAmount,
                due: 0,
                status: "paid",
              }
            : row,
          ),
      );
      setSummary((prev) =>
        prev ?
          {
            ...prev,
            totalDue: Math.max(0, toNumber(prev.totalDue, 0) - discountAmount),
            totalDiscount: toNumber(prev.totalDiscount, 0) + discountAmount,
            dueCount: Math.max(0, toNumber(prev.dueCount, 0) - 1),
            settledCount: toNumber(prev.settledCount, 0) + 1,
          }
        : prev,
      );
      showToast("Settlement discount applied", "success");
    } catch (error) {
      console.error("Failed to apply settlement discount:", error);
      showToast(
        error?.response?.data?.message || "Failed to apply discount",
        "error",
      );
    } finally {
      setDiscountingBillId("");
    }
  };

  const toggleBillSelection = (billId) => {
    const normalizedBillId = getBillId(billId);
    const bill = bills.find((row) => getBillId(row) === normalizedBillId);
    if (!isBillSelectable(bill)) return;

    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      if (next.has(normalizedBillId)) next.delete(normalizedBillId);
      else next.add(normalizedBillId);
      return next;
    });
  };

  const toggleAllVisibleBills = () => {
    const billIds = bills.filter(isBillSelectable).map(getBillId);
    const allSelected =
      billIds.length > 0 &&
      billIds.every((billId) => selectedBillIds.has(billId));

    setSelectedBillIds((prev) => {
      const next = new Set();
      const activeIds = new Set(billIds);
      prev.forEach((billId) => {
        if (!activeIds.has(billId)) next.add(billId);
      });
      billIds.forEach((billId) => {
        if (allSelected) next.delete(billId);
        else next.add(billId);
      });
      return next;
    });
  };

  const deleteBillsByIds = async (billIds) => {
    const billMap = new Map(bills.map((bill) => [getBillId(bill), bill]));
    const ids = [...new Set(billIds.map(getBillId))].filter((billId) =>
      billMap.has(billId),
    );
    if (!ids.length) return;

    const undoCount = ids.filter((billId) =>
      isBillSettlementUndoable(billMap.get(billId)),
    ).length;
    const deleteCount = ids.length - undoCount;

    const confirmed = window.confirm(
      undoCount && deleteCount ?
        `Delete ${deleteCount} due bill(s) and undo ${undoCount} settled bill(s)?`
      : undoCount ?
        ids.length === 1 ?
          "Undo settlement for selected bill?"
        : `Undo settlement for ${ids.length} selected bills?`
      : ids.length === 1 ? "Delete selected bill?"
      : `Delete ${ids.length} selected bills?`,
    );
    if (!confirmed) return;

    setDeletingBillIds((prev) => new Set([...prev, ...ids]));
    const results = await Promise.allSettled(
      ids.map((billId) => {
        const bill = billMap.get(billId);
        if (isBillSettlementUndoable(bill)) {
          return api.post(`/bills/${billId}/undo-settlement`);
        }
        return api.delete(`/bills/${billId}`);
      }),
    );
    const deletedIds = ids.filter(
      (_, index) => results[index].status === "fulfilled",
    );
    const failed = results.length - deletedIds.length;

    setDeletingBillIds((prev) => {
      const next = new Set(prev);
      ids.forEach((billId) => next.delete(billId));
      return next;
    });
    setSelectedBillIds((prev) => {
      const next = new Set(prev);
      deletedIds.map(getBillId).forEach((billId) => next.delete(billId));
      return next;
    });

    if (deletedIds.length) {
      setBills((prev) =>
        prev.filter((bill) => !deletedIds.includes(getBillId(bill))),
      );
      setRefreshKey((prev) => prev + 1);
      showToast(
        undoCount ?
          deletedIds.length === 1 ?
            "Settlement undone"
          : `${deletedIds.length} bill actions completed`
        : deletedIds.length === 1 ? "Bill deleted"
        : `${deletedIds.length} bills deleted`,
        "success",
      );
    }

    if (failed) {
      const firstRejected = results.find(
        (result) => result.status === "rejected",
      );
      showToast(
        firstRejected?.reason?.response?.data?.message ||
          `${failed} bill(s) could not be deleted`,
        "error",
      );
    }
  };

  const generateOutstandingPDF = (data, fileNamePrefix = "Outstanding", action = "download") => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const marginX = 10;
    const contentWidth = 190;
    const maxY = 270;

    const { selectedFinancialYear } = useStore.getState();
    const fyLabel =
      selectedFinancialYear?.label ? `(${selectedFinancialYear.label})` : "";

    let page1StartY = drawBrandedReportHeader(doc, {
      title: "Receivable Party wise outstanding",
      subtitle: `As On Date: ${formatDateDDMMYYYY(new Date())} ${fyLabel}`,
      marginLeft: marginX,
      marginRight: marginX,
    });

    let currentY = page1StartY;

    data.forEach((group) => {
      let runningAmount = 0;
      let runningReturn = 0;
      let runningDiscount = 0;
      let runningPaid = 0;
      let runningDue = 0;
      let runningCumm = 0;

      const tableBody = [];

      // Group Header Row
      const headerText = `Party Name : ${group.contact.name}`;
      tableBody.push({
        isHeader: true,
        text: headerText,
      });

      // Group Sub-Header Row
      const addressLine = [
        group.contact.address,
        group.contact.city,
        group.contact.state,
      ]
        .filter(Boolean)
        .join(", ");
      const agentLine =
        group.contact.agentName ?
          ` -- Agent : ${group.contact.agentName}`
        : " -- Agent : --";
      tableBody.push({
        isSubHeader: true,
        text: `${addressLine || "No Address"}${agentLine}`,
      });

      // Bill Rows
      group.bills.forEach((bill) => {
        runningAmount += bill.amount;
        runningReturn += bill.returnAmount;
        runningDiscount += bill.settlementDiscount || 0;
        runningPaid += bill.paidAmount || 0;
        runningDue += bill.due;
        runningCumm += bill.due;

        tableBody.push([
          formatDateDDMMYYYY(bill.date),
          bill.billNo,
          contactType === "supplier" ? "Purchase" : "Sale",
          bill.amount.toFixed(2),
          bill.returnAmount > 0 ? bill.returnAmount.toFixed(2) : "--",
          bill.settlementDiscount > 0 ? bill.settlementDiscount.toFixed(2) : "--",
          bill.paidAmount > 0 ? bill.paidAmount.toFixed(2) : "--",
          runningCumm.toFixed(2),
          String(bill.daysSince),
        ]);
      });

      // Total Row
      tableBody.push({
        isTotal: true,
        data: [
          "Total",
          "",
          "",
          runningAmount.toFixed(2),
          runningReturn > 0 ? runningReturn.toFixed(2) : "--",
          runningDiscount > 0 ? runningDiscount.toFixed(2) : "--",
          runningPaid > 0 ? runningPaid.toFixed(2) : "--",
          runningDue.toFixed(2),
          "",
        ],
      });

      // Estimate height of this group's table
      const rowCount = tableBody.length;
      const estimatedHeight = 8 + rowCount * 5.2;

      if (currentY + estimatedHeight > maxY) {
        doc.addPage();
        currentY = 15;
      }

      autoTable(doc, {
        startY: currentY,
        head: [
          [
            "Date",
            "Bill No",
            "Type",
            "Bill Amount",
            "Adj Amount",
            "Injv Amount",
            "On Ac. Amount",
            "Cumm. Balance",
            "Days",
          ],
        ],
        body: tableBody.map((row) =>
          Array.isArray(row) ? row : (
            row.data || ["", "", "", "", "", "", "", "", ""]
          ),
        ),
        tableWidth: contentWidth,
        margin: { left: marginX, right: marginX },
        styles: {
          fontSize: 7.2,
          cellPadding: { top: 1.2, right: 1.5, bottom: 1.2, left: 1.5 },
          textColor: [31, 41, 55],
          lineColor: [203, 213, 225],
          lineWidth: 0.15,
          valign: "middle",
        },
        headStyles: {
          fillColor: [51, 65, 85],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          halign: "center",
        },
        columnStyles: {
          0: { cellWidth: 20, halign: "center" }, // Date
          1: { cellWidth: 18, halign: "center" }, // Bill No
          2: { cellWidth: 14, halign: "center" }, // Type
          3: { cellWidth: 24, halign: "right" }, // Bill Amount
          4: { cellWidth: 22, halign: "right" }, // Adj Amount
          5: { cellWidth: 22, halign: "right" }, // Injv Amount
          6: { cellWidth: 22, halign: "right" }, // On Ac. Amount
          7: { cellWidth: 34, halign: "right" }, // Cumm. Balance
          8: { cellWidth: 14, halign: "center" }, // Days
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const rIndex = data.row.index;
          const rRaw = tableBody[rIndex];

          if (rRaw && rRaw.isHeader) {
            if (data.column.index === 0) {
              data.cell.colSpan = 9;
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [219, 234, 254];
              data.cell.styles.textColor = [30, 58, 138];
              data.cell.text = [rRaw.text];
            }
          } else if (rRaw && rRaw.isSubHeader) {
            if (data.column.index === 0) {
              data.cell.colSpan = 9;
              data.cell.styles.fontStyle = "bold";
              data.cell.styles.fillColor = [243, 244, 246];
              data.cell.styles.textColor = [75, 85, 99];
              data.cell.styles.fontSize = 7;
              data.cell.text = [rRaw.text];
            }
          } else if (rRaw && rRaw.isTotal) {
            if (data.column.index === 0) {
              data.cell.colSpan = 3;
              data.cell.text = ["Total"];
            }
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.fillColor = [243, 244, 246];
            data.cell.styles.textColor = [17, 24, 39];
          }
        },
      });

      currentY = doc.lastAutoTable.finalY + 4;
    });

    addBrandedReportFooters(doc, { marginLeft: marginX, marginRight: marginX });
    if (action === "print") {
      doc.autoPrint();
      const previewUrl = doc.output("bloburl");
      const previewWindow = window.open(previewUrl, "_blank");
      if (!previewWindow) {
        showToast(
          "Popup blocked. Please allow popups for print preview.",
          "error",
        );
      }
    } else {
      doc.save(`${fileNamePrefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("PDF downloaded", "success");
    }
  };

  const downloadMultiPartyPDF = (action = "download") => {
    if (multiPartyData.length === 0) {
      showToast(
        `No data available to ${action === "print" ? "print" : "download"}. Please select contacts with outstanding balance.`,
        "warning",
      );
      return;
    }
    generateOutstandingPDF(multiPartyData, "Outstanding_Multiple", action);
  };

  const toggleContactSelection = (id) => {
    setSelectedContacts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadHistoryPDF = (action = "download") => {
    if (!selectedContactDetails) {
      showToast("Select a party/supplier first", "warning");
      return;
    }

    if (activeTab === "history") {
      const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      const marginX = 14;
      let cursorY = drawBrandedReportHeader(doc, {
        title: "Payment History",
        subtitle: `${selectedContactDetails.name} (${selectedContactDetails.type})`,
        marginLeft: marginX,
        marginRight: marginX,
      });

      doc.setFontSize(10);
      doc.text(
        `Contact: ${selectedContactDetails.name} (${selectedContactDetails.type})`,
        marginX,
        cursorY,
      );
      cursorY += 5;
      doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, cursorY);
      cursorY += 6;

      const tableBody = paymentHistory.map((row) => [
        formatDateDDMMYYYY(row.date),
        row.billNo || "-",
        formatRs(row.amount || 0),
        row.paymentType || "-",
        row.referenceNo || "-",
        row.note || "-",
      ]);

      autoTable(doc, {
        startY: cursorY,
        head: [
          ["Date", "Bill No", "Amount", "Payment Type", "Reference", "Note"],
        ],
        body: tableBody,
        styles: {
          fontSize: 8.6,
          cellPadding: { top: 2.5, right: 2.2, bottom: 2.5, left: 2.2 },
          textColor: [31, 41, 55],
          lineColor: [203, 213, 225],
          lineWidth: 0.2,
          valign: "middle",
        },
        headStyles: {
          fillColor: [226, 232, 240],
          textColor: [15, 23, 42],
          fontStyle: "bold",
          halign: "center",
          valign: "middle",
          lineColor: [148, 163, 184],
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: marginX, right: marginX },
        columnStyles: {
          2: { halign: "right" },
        },
      });

      addBrandedReportFooters(doc, {
        marginLeft: marginX,
        marginRight: marginX,
      });
      if (action === "print") {
        doc.autoPrint();
        const previewUrl = doc.output("bloburl");
        const previewWindow = window.open(previewUrl, "_blank");
        if (!previewWindow) {
          showToast(
            "Popup blocked. Please allow popups for print preview.",
            "error",
          );
        }
      } else {
        const safeName = selectedContactDetails.name
          .replace(/[^\w-]+/g, "_")
          .slice(0, 40);
        doc.save(`Payment_History_${safeName}.pdf`);
        showToast("Payment History PDF downloaded successfully", "success");
      }
    } else {
      const singleContactData = [
        {
          contact: selectedContactDetails,
          bills: bills,
        },
      ];
      const safeName = selectedContactDetails.name
        .replace(/[^\w-]+/g, "_")
        .slice(0, 40);
      generateOutstandingPDF(
        singleContactData,
        `Outstanding_Report_${safeName}`,
        action,
      );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Outstanding List</h1>
          <p className="text-gray-600">
            View due and settled bills with settlement history.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (selectedContacts.size > 0) {
                downloadMultiPartyPDF("print");
              } else {
                downloadHistoryPDF("print");
              }
            }}
            className="flex items-center gap-1.5"
          >
            <FaPrint className="w-3.5 h-3.5" />
            Print PDF
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (selectedContacts.size > 0) {
                downloadMultiPartyPDF("download");
              } else {
                downloadHistoryPDF("download");
              }
            }}
          >
            Download PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="bg-white border rounded-lg p-4 space-y-3 lg:col-span-1">
          <div className="flex items-center gap-2">
            <Select value={contactType} onChange={handleContactTypeChange}>
              <option value="party">Party</option>
              <option value="supplier">Supplier</option>
            </Select>
            <Input
              value={search}
              onChange={handleSearchChange}
              placeholder="Search contact..."
            />
          </div>
          <div className="text-xs text-gray-500">
            Shortcut: `Ctrl+Z` to select all visible{" "}
            {contactType === "party" ? "parties" : "suppliers"}.
          </div>
          <div className="max-h-[520px] overflow-y-auto border rounded-lg">
            {loadingContacts ?
              <div className="p-3 text-sm text-gray-500">
                Loading contacts...
              </div>
            : visibleContacts.length === 0 ?
              <div className="p-3 text-sm text-gray-500">
                No contacts found.
              </div>
            : <>
                <div className="sticky top-0 bg-gray-100 border-b px-3 py-2 flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={
                      selectedContacts.size === visibleContacts.length &&
                      visibleContacts.length > 0
                    }
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedContacts(
                          new Set(visibleContacts.map((c) => c.id)),
                        );
                      } else {
                        setSelectedContacts(new Set());
                      }
                    }}
                    className="w-3.5 h-3.5 accent-blue-600 shrink-0"
                  />
                  <span className="text-xs font-medium text-gray-700">
                    Select All
                  </span>
                </div>
                {visibleContacts.map((contact) => {
                  const isActive = contact.id === selectedContact;
                  return (
                    <button
                      key={contact.id}
                      onClick={() => setSelectedContact(contact.id)}
                      className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-gray-50 ${
                        isActive ? "bg-blue-50" : "bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedContacts.has(contact.id)}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleContactSelection(contact.id);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 accent-blue-600 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {contact.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            Balance: {formatRs(contact.balance)}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {pagination.totalPages > 1 && (
                  <div className="p-2 border-t bg-gray-50 flex justify-between items-center">
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: Math.max(1, prev.page - 1),
                        }))
                      }
                      disabled={pagination.page === 1}
                      className="px-2 py-1 text-xs bg-white border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-xs text-gray-600">
                      Page {pagination.page} of {pagination.totalPages}
                    </span>
                    <button
                      onClick={() =>
                        setPagination((prev) => ({
                          ...prev,
                          page: Math.min(prev.totalPages, prev.page + 1),
                        }))
                      }
                      disabled={pagination.page === pagination.totalPages}
                      className="px-2 py-1 text-xs bg-white border rounded disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            }
          </div>
        </div>

        <div className="lg:col-span-3 space-y-4">
          {selectedContacts.size > 0 ?
            <>
              {/* Multi Party Summary Card */}
              <div className="bg-white border rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-500">
                      Selected Contacts
                    </div>
                    <div
                      className="text-lg font-semibold text-gray-900 truncate max-w-md"
                      title={multiPartyData
                        .map((g) => g.contact.name)
                        .join(", ")}
                    >
                      {multiPartyData.length > 0 ?
                        multiPartyData.map((g) => g.contact.name).join(", ")
                      : `${selectedContacts.size} contacts selected`}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-amber-700">Total Due</div>
                      <div className="font-semibold text-amber-700">
                        {formatRs(multiPartyTotals.totalDue)}
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-emerald-700">Total Paid</div>
                      <div className="font-semibold text-emerald-700">
                        {formatRs(multiPartyTotals.totalPaid)}
                      </div>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-rose-700">
                        Settlement Discount
                      </div>
                      <div className="font-semibold text-rose-700">
                        {formatRs(multiPartyTotals.totalDiscount)}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-blue-700">Total Amount</div>
                      <div className="font-semibold text-blue-700">
                        {formatRs(multiPartyTotals.totalAmount)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Multi Party Unified Table */}
              <div className="bg-white border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <div className="text-md font-semibold text-gray-900">
                    Outstanding Bills (Combined)
                  </div>
                </div>

                {loadingMultiParty ?
                  <div className="text-sm text-gray-500 py-4">
                    Loading bills...
                  </div>
                : multiPartyData.length === 0 ?
                  <div className="text-sm text-gray-500 py-4 text-center">
                    No outstanding bills found for selected contacts.
                  </div>
                : <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200 border-collapse border border-gray-300">
                      <thead className="bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="border border-gray-300 px-3 py-2 text-center whitespace-nowrap">
                            Date
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left whitespace-nowrap">
                            Bill No
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-left whitespace-nowrap">
                            Type
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                            Bill Amount
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                            Adj Amount
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                            Injv Amount
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                            On Ac. Amount
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                            Cumm. Balance
                          </th>
                          <th className="border border-gray-300 px-3 py-2 text-center whitespace-nowrap">
                            Days
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200 text-sm">
                        {multiPartyData.map((group) => {
                          const addressLine = [
                            group.contact.address,
                            group.contact.city,
                            group.contact.state,
                          ]
                            .filter(Boolean)
                            .join(", ");
                          const agentLine =
                            group.contact.agentName ?
                              ` -- Agent : ${group.contact.agentName}`
                            : " -- Agent : --";

                          let cummBalance = 0;
                          let totalAmount = 0;
                          let totalReturn = 0;
                          let totalDiscount = 0;
                          let totalPaid = 0;
                          let totalDue = 0;

                          const billRows = group.bills.map((bill) => {
                            cummBalance += bill.due;
                            totalAmount += bill.amount;
                            totalReturn += bill.returnAmount;
                            totalDiscount += bill.settlementDiscount || 0;
                            totalPaid += bill.paidAmount || 0;
                            totalDue += bill.due;

                            return (
                              <tr key={bill.id} className="hover:bg-gray-50">
                                <td className="border border-gray-300 px-3 py-2 text-center whitespace-nowrap">
                                  {formatDateDDMMYYYY(bill.date)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 font-medium whitespace-nowrap">
                                  {bill.billNo}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 whitespace-nowrap">
                                  {contactType === "supplier" ?
                                    "Purchase"
                                  : "Sale"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                                  {formatRs(bill.amount)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                                  {bill.returnAmount > 0 ?
                                    formatRs(bill.returnAmount)
                                  : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                                  {bill.settlementDiscount > 0 ?
                                    formatRs(bill.settlementDiscount)
                                  : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                                  {bill.paidAmount > 0 ?
                                    formatRs(bill.paidAmount)
                                  : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right whitespace-nowrap">
                                  {formatRs(cummBalance)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-center whitespace-nowrap">
                                  {bill.daysSince}
                                </td>
                              </tr>
                            );
                          });

                          return (
                            <React.Fragment key={group.contact.id}>
                              {/* Group Header Row */}
                              <tr className="bg-blue-50 font-bold border-t border-b border-gray-300">
                                <td
                                  colSpan={9}
                                  className="border border-gray-300 px-3 py-2 text-left text-blue-900 border-collapse"
                                >
                                  Party Name :{" "}
                                  <span className="text-blue-700">
                                    {group.contact.name}
                                  </span>
                                </td>
                              </tr>
                              {/* Sub Header Row */}
                              <tr className="bg-gray-50 border-b border-gray-200">
                                <td
                                  colSpan={9}
                                  className="border border-gray-300 px-3 py-1.5 text-xs text-left text-gray-600"
                                >
                                  {addressLine || "No address"} {agentLine}
                                </td>
                              </tr>
                              {/* Bill Rows */}
                              {billRows.length === 0 ?
                                <tr>
                                  <td
                                    colSpan={9}
                                    className="border border-gray-300 px-3 py-4 text-center text-gray-500"
                                  >
                                    No outstanding bills.
                                  </td>
                                </tr>
                              : billRows}
                              {/* Total Row */}
                              <tr className="bg-gray-100 font-bold border-b border-gray-300 text-gray-900">
                                <td
                                  className="border border-gray-300 px-3 py-2"
                                  colSpan={3}
                                >
                                  Total
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                  {formatRs(totalAmount)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                  {totalReturn > 0 ?
                                    formatRs(totalReturn)
                                  : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                  {totalDiscount > 0 ?
                                    formatRs(totalDiscount)
                                  : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                  {totalPaid > 0 ? formatRs(totalPaid) : "---"}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-right">
                                  {formatRs(totalDue)}
                                </td>
                                <td className="border border-gray-300 px-3 py-2 text-center"></td>
                              </tr>
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            </>
          : <>
              <div className="bg-white border rounded-lg p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="text-sm text-gray-500">
                      Selected Contact
                    </div>
                    <div className="text-lg font-semibold text-gray-900">
                      {selectedContactDetails?.name || "Select a contact"}
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="bg-amber-50 border border-amber-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-amber-700">Total Due</div>
                      <div className="font-semibold text-amber-700">
                        {formatRs(totals.totalDue)}
                      </div>
                    </div>
                    <div className="bg-emerald-50 border border-emerald-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-emerald-700">Total Paid</div>
                      <div className="font-semibold text-emerald-700">
                        {formatRs(totals.totalPaid)}
                      </div>
                    </div>
                    <div className="bg-rose-50 border border-rose-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-rose-700">
                        Settlement Discount
                      </div>
                      <div className="font-semibold text-rose-700">
                        {formatRs(totals.totalDiscount)}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-100 rounded-md px-3 py-2 text-sm">
                      <div className="text-xs text-blue-700">Total Amount</div>
                      <div className="font-semibold text-blue-700">
                        {formatRs(totals.totalAmount || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white border rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b pb-3">
                  <div className="flex items-center gap-2">
                    {[
                      {
                        key: "due",
                        label: `Due Bills (${summary?.dueCount || 0})`,
                      },
                      {
                        key: "settled",
                        label: `Settled Bills (${summary?.settledCount || 0})`,
                      },
                    ].map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => handleTabChange(tab.key)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                          activeTab === tab.key ?
                            "bg-blue-600 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  {selectedBillIds.size > 0 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteBillsByIds([...selectedBillIds])}
                      loading={[...selectedBillIds].some((billId) =>
                        deletingBillIds.has(billId),
                      )}
                    >
                      <FaTrash className="mr-2 h-3.5 w-3.5" />
                      Delete ({selectedBillIds.size})
                    </Button>
                  )}
                </div>

                {loadingBills ?
                  <div className="text-sm text-gray-500">Loading bills...</div>
                : !selectedContact ?
                  <div className="text-sm text-gray-500">
                    Select a contact to view details.
                  </div>
                : activeTab === "history" ?
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Bill No</th>
                          <th className="text-right px-3 py-2">Amount</th>
                          <th className="text-left px-3 py-2">Payment Type</th>
                          <th className="text-left px-3 py-2">Reference</th>
                          <th className="text-left px-3 py-2">Note</th>
                        </tr>
                      </thead>
                      <tbody>
                        {historyEntries.length === 0 ?
                          <tr>
                            <td
                              colSpan={6}
                              className="px-3 py-4 text-sm text-gray-500"
                            >
                              No settlement history found.
                            </td>
                          </tr>
                        : historyEntries.slice(0, 50).map((entry) => (
                            <tr key={entry.id} className="border-t">
                              <td className="px-3 py-2">
                                {formatDateDDMMYYYY(entry.date)}
                              </td>
                              <td className="px-3 py-2">{entry.billNo}</td>
                              <td className="px-3 py-2 text-right">
                                {formatRs(entry.amount)}
                              </td>
                              <td className="px-3 py-2">{entry.paymentType}</td>
                              <td className="px-3 py-2">
                                {entry.referenceNo || "-"}
                              </td>
                              <td className="px-3 py-2">{entry.note || "-"}</td>
                            </tr>
                          ))
                        }
                      </tbody>
                    </table>
                  </div>
                : <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600">
                        <tr>
                          <th className="text-center px-3 py-2 w-10">
                            <input
                              type="checkbox"
                              checked={
                                bills.some(isBillSelectable) &&
                                bills
                                  .filter(isBillSelectable)
                                  .every((bill) =>
                                    selectedBillIds.has(getBillId(bill)),
                                  )
                              }
                              onChange={toggleAllVisibleBills}
                              className="w-3.5 h-3.5 accent-red-600"
                            />
                          </th>
                          <th className="text-center px-3 py-2 whitespace-nowrap">
                            Date
                          </th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">
                            Bill No
                          </th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">
                            Type
                          </th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">
                            Bill Amount
                          </th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">
                            Adj Amount
                          </th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">
                            Injv Amount
                          </th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">
                            On Ac. Amount
                          </th>
                          <th className="text-right px-3 py-2 whitespace-nowrap">
                            Cumm. Balance
                          </th>
                          <th className="text-left px-3 py-2 whitespace-nowrap">
                            Status
                          </th>
                          <th className="text-center px-3 py-2 whitespace-nowrap">
                            Days
                          </th>
                          <th className="text-center px-3 py-2 whitespace-nowrap">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {(activeTab === "due" ? bills : bills).length === 0 ?
                          <tr>
                            <td
                              colSpan={12}
                              className="px-3 py-4 text-sm text-gray-500"
                            >
                              No bills found.
                            </td>
                          </tr>
                        : (() => {
                            let runningCumm = 0;
                            return (activeTab === "due" ? bills : bills).map(
                              (bill) => {
                                runningCumm += bill.due;
                                const duePeriodClass =
                                  bill.status === "due" &&
                                  bill.daysSince > 30 ?
                                    "text-red-600 font-semibold"
                                  : bill.status === "due" &&
                                    bill.daysSince > 15 ?
                                    "text-orange-600 font-medium"
                                  : bill.status === "due" ? "text-yellow-600"
                                  : "text-gray-500";

                                return (
                                  <tr key={bill.id} className="border-t">
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={selectedBillIds.has(
                                          getBillId(bill),
                                        )}
                                        disabled={!isBillSelectable(bill)}
                                        onChange={() =>
                                          toggleBillSelection(bill.id)
                                        }
                                        className="w-3.5 h-3.5 accent-red-600 disabled:opacity-40"
                                        title={
                                          isBillSelectable(bill) ?
                                            "Select bill"
                                          : "Bill cannot be selected"
                                        }
                                      />
                                    </td>
                                    <td className="px-3 py-2 text-center whitespace-nowrap">
                                      {formatDateDDMMYYYY(bill.date)}
                                    </td>
                                    <td className="px-3 py-2 font-medium">
                                      {bill.billNo}
                                    </td>
                                    <td className="px-3 py-2 whitespace-nowrap">
                                      {contactType === "supplier" ?
                                        "Purchase"
                                      : "Sale"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {formatRs(bill.amount)}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {bill.returnAmount > 0 ?
                                        formatRs(bill.returnAmount)
                                      : "---"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {bill.settlementDiscount > 0 ?
                                        formatRs(bill.settlementDiscount)
                                      : "---"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {bill.paidAmount > 0 ?
                                        formatRs(bill.paidAmount)
                                      : "---"}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                      {formatRs(runningCumm)}
                                    </td>
                                    <td className="px-3 py-2 uppercase text-xs font-semibold text-gray-600">
                                      {bill.status}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-center whitespace-nowrap ${duePeriodClass}`}
                                    >
                                      {`${bill.daysSince} days`}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      <div className="flex items-center justify-center gap-2">
                                        {bill.status === "due" &&
                                          bill.due > 0.009 && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={
                                                discountingBillId === bill.id
                                              }
                                              onClick={() =>
                                                applyDiscountToBill(bill)
                                              }
                                            >
                                              {discountingBillId === bill.id ?
                                                "..."
                                              : "Disc"}
                                            </Button>
                                          )}
                                        {bill.status !== "due" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() =>
                                              downloadBillSettlementReceipt(
                                                bill,
                                              )
                                            }
                                            title="Download settlement receipt"
                                          >
                                            <FaPrint className="h-3.5 w-3.5" />
                                          </Button>
                                        )}
                                        <Button
                                          size="sm"
                                          variant="danger"
                                          disabled={
                                            !isBillSelectable(bill) ||
                                            deletingBillIds.has(bill.id)
                                          }
                                          onClick={() =>
                                            deleteBillsByIds([bill.id])
                                          }
                                          title={
                                            isBillSettlementUndoable(bill) ?
                                              "Undo settlement"
                                            : "Delete bill"
                                          }
                                        >
                                          <FaTrash className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              },
                            );
                          })()
                        }
                      </tbody>
                    </table>
                  </div>
                }
              </div>
            </>
          }
        </div>
      </div>
    </div>
  );
};

export default OutstandingList;
