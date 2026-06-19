import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FaFileInvoiceDollar,
  FaCheck,
  FaPlus,
  FaEdit,
  FaTrash,
  FaDownload,
} from "react-icons/fa";
import { DataTable, Modal, DeleteConfirmDialog } from "../../components/common";
import { Button } from "../../components/ui";
import useStore from "../../store";
import useFirmBranding from "../../hooks/useFirmBranding";
import api from "../../services/axiosInstance";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts";
import {
  getResponseData,
  getResponseList,
  getResponseMeta,
  normalizeChallan,
} from "../../services/apiUtils";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  getFinancialYearStartDate,
  getFinancialYearStartDisplayDate,
  getTodayDisplayDate,
  normalizeDisplayDateInput,
} from "../../utils/dateHelpers";
import { CHALLAN_UPDATE_EVENT } from "../../services/stockSocket";

const formatDateToDDMMYYYY = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
};

const parseDDMMYYYYtoISO = (dateStr) => {
  if (!dateStr) return "";
  const normalized = String(dateStr).trim();
  const match = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";
  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);
  if (month < 1 || month > 12 || day < 1 || day > 31) return "";
  const dateISO = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const d = new Date(dateISO);
  if (Number.isNaN(d.getTime())) return "";
  // ensure valid date parts
  if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return "";
  return dateISO;
};

const getDefaultDateRange = () => {
  const fromDate = getFinancialYearStartDisplayDate();
  const toDate = getTodayDisplayDate();
  return { fromDate, toDate };
};

const ChallanList = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { showToast, selectedFirm } = useStore();
  const firmBranding = useFirmBranding();
  const [challans, setChallans] = useState([]);
  const [isConvertModalOpen, setIsConvertModalOpen] = useState(false);
  const [selectedChallans, setSelectedChallans] = useState([]);
  const [deleteDialog, setDeleteDialog] = useState({
    isOpen: false,
    challan: null,
  });
  const [validationError, setValidationError] = useState("");
  const [tableLoading, setTableLoading] = useState(true);

  const defaultDates = getDefaultDateRange();

	  const [inputFilters, setInputFilters] = useState({
	    type: "sale",
    search: "",
    contactId: "",
    fromDate: defaultDates.fromDate,
    toDate: defaultDates.toDate,
  });

	  const [filters, setFilters] = useState({
	    type: "sale",
    search: "",
    contactId: "",
    fromDate: defaultDates.fromDate,
    toDate: defaultDates.toDate,
  });

  const updateFilters = useCallback((updates) => {
    setFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  const updateInputFilters = useCallback((updates) => {
    setInputFilters((prev) => ({ ...prev, ...updates }));
  }, []);

  // Debounce filter updates for text inputs
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        search: inputFilters.search,
        contactId: inputFilters.contactId,
	        type: "sale",
	      }));
	    }, 500);

    return () => clearTimeout(timeoutId);
  }, [inputFilters.search, inputFilters.contactId]);

	  const resolveEndpoint = useCallback(() => {
	    return "/challans/sale";
	  }, []);

  const buildParams = useCallback((page, filters) => {
	    const limit = 20;
    const fromDateIso = filters.fromDate ? parseDDMMYYYYtoISO(filters.fromDate) : undefined;
    const toDateIso = filters.toDate ? parseDDMMYYYYtoISO(filters.toDate) : undefined;

    const params = {
      page,
      limit,
      search: filters.search?.trim() || undefined,
      contact_id: filters.contactId?.trim() || undefined,
      from_date: fromDateIso,
      to_date: toDateIso,
    };

    return Object.fromEntries(
      Object.entries(params).filter(([, value]) => value !== undefined),
    );
  }, []);

  const fetchAllPages = useCallback(async () => {
    const endpoint = resolveEndpoint();
    const firstResponse = await api.get(endpoint, {
      params: buildParams(1, filters),
    });

    const firstPageRows = getResponseList(firstResponse).map((challan) => {
      const normalized = normalizeChallan(challan);
      return {
        ...normalized,
        challanType: challan?.challan_type || normalized.challanType || "",
      };
    });
    const meta = getResponseMeta(firstResponse);
    const totalPages = meta?.totalPages || 1;

    if (totalPages <= 1) {
      return firstPageRows;
    }

    const requests = [];
    for (let page = 2; page <= totalPages; page += 1) {
      requests.push(
        api.get(endpoint, {
          params: buildParams(page, filters),
        }),
      );
    }

    const responses = await Promise.all(requests);
    const remainingRows = responses.flatMap((response) =>
      getResponseList(response).map((challan) => {
        const normalized = normalizeChallan(challan);
        return {
          ...normalized,
          challanType: challan?.challan_type || normalized.challanType || "",
        };
      }),
    );

    return [...firstPageRows, ...remainingRows];
  }, [filters, buildParams, resolveEndpoint]);

  const loadAllChallans = useCallback(async () => {
    const allChallans = await fetchAllPages();
    return [...allChallans].sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      const cutoffDate = new Date(getFinancialYearStartDate());
      
      const aIsNew = dateA >= cutoffDate;
      const bIsNew = dateB >= cutoffDate;
      
      // If one is new and other is old, new comes first
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;
      
      // If both are new or both are old, sort by date descending (newest first)
      if (dateA !== dateB) {
        return dateB.getTime() - dateA.getTime();
      }
      
      // If dates are same, sort by ID
      const idA = a.id || "";
      const idB = b.id || "";
      return idB.localeCompare(idA);
    });
  }, [fetchAllPages]);

  useEffect(() => {
    const fetchData = async () => {
      setTableLoading(true);
      try {
        setChallans(await loadAllChallans());
      } catch (err) {
        console.error("Failed to fetch challans:", err);
        console.error("Error response:", err.response?.data);
        showToast(
          err.response?.data?.message || "Failed to load challans",
          "error",
        );
      } finally {
        setTableLoading(false);
      }
    };
    fetchData();
  }, [selectedFirm?.id, showToast, loadAllChallans]);

  // Refresh data when navigating back to this page
  useEffect(() => {
    const fetchData = async () => {
      try {
        setChallans(await loadAllChallans());
      } catch (err) {
        console.error("Failed to refresh challans:", err);
      }
    };
    
    // Check if we're coming from challan creation/edit
    if (location.state?.refreshChallanList) {
      fetchData();
      // Clear the state to prevent unnecessary refreshes
      window.history.replaceState({}, document.title);
    }
  }, [location.state, loadAllChallans]);

  // Auto-refresh when page becomes visible (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        try {
          setChallans(await loadAllChallans());
        } catch (err) {
          console.error("Failed to refresh challans on visibility change:", err);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [loadAllChallans]);

  useEffect(() => {
    let isMounted = true;

    const handleChallanUpdate = async () => {
      try {
        const refreshedChallans = await loadAllChallans();
        if (isMounted) setChallans(refreshedChallans);
      } catch (err) {
        console.error("Failed to sync challans:", err);
      }
    };

    window.addEventListener(CHALLAN_UPDATE_EVENT, handleChallanUpdate);
    return () => {
      isMounted = false;
      window.removeEventListener(CHALLAN_UPDATE_EVENT, handleChallanUpdate);
    };
  }, [loadAllChallans]);

  const convertibleChallans = useMemo(
    () =>
      challans.filter(
        (challan) =>
          challan.challanType === "sale" && !challan.converted_to_bill,
      ),
    [challans],
  );

  // Ctrl+Z = Select All, second Ctrl+Z = Deselect All (when modal open)
  useEffect(() => {
    if (!isConvertModalOpen) return;
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        setSelectedChallans((prev) =>
          prev.length === convertibleChallans.length ? [] : [...convertibleChallans]
        );
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isConvertModalOpen, convertibleChallans]);

  // hide challans that have already been converted to a bill
  const displayedChallans = useMemo(
    () => challans.filter((c) => !c.converted_to_bill),
    [challans],
  );

  const _generateChallanPDFLegacy = (challan) => {
    const doc = new jsPDF();

    const firmName = firmBranding.name;
    const firmAddress = firmBranding.address;
    const firmCity = firmBranding.city;
    const firmGst = firmBranding.gstin;
    const firmContact = firmBranding.phone;
    const firmEmail = firmBranding.email;

    // Safely get items array
    const items = Array.isArray(challan.items) ? challan.items : [];

    // Calculate total amount from items with safe property access
    const totalAmount = items.reduce((sum, item) => {
      const quantity = item.quantity || item.qty || 0;
      const rate = item.rate || item.price || 0;
      const discount = item.discount || item.disc || item.disc_percent || 0;
      const specialDiscount =
        item.specialDiscount ||
        item.sp_disc ||
        item.spDisc ||
        item.special_discount ||
        0;

      const itemTotal = quantity * rate;
      const discountAmount = (itemTotal * discount) / 100;
      const specialDiscountAmount =
        ((itemTotal - discountAmount) * specialDiscount) / 100;
      return sum + (itemTotal - discountAmount - specialDiscountAmount);
    }, 0);

    // Add header with firm name (larger and bold)
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text(firmName.toUpperCase(), 105, 20, { align: "center" });

    // Add firm address
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(firmAddress, 105, 28, { align: "center" });

    // Add contact details if available
    let yOffset = 34;
    if (firmContact || firmEmail) {
      const contactText = `${firmContact}${firmContact && firmEmail ? " | " : ""}${firmEmail}`;
      doc.setFontSize(8);
      doc.text(contactText, 105, yOffset, { align: "center" });
      yOffset += 6;
    }

    // Add GST if available
    if (firmGst) {
      doc.setFontSize(8);
      doc.text(`GST: ${firmGst}`, 105, yOffset, { align: "center" });
      yOffset += 8;
    } else {
      yOffset += 2;
    }

    // Add challan title and details
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("CASH BOOK", 105, yOffset + 5, { align: "center" });

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Challan No.: ${challan.challanNo || challan.challan_number || "00022"}`,
      20,
      yOffset + 15,
    );
    doc.text(
      `Date: ${challan.date ? new Date(challan.date).toLocaleDateString("en-IN") : "22-02-2026"}`,
      160,
      yOffset + 15,
    );

    doc.text(`City: ${firmCity}`, 20, yOffset + 23);

    // Get party details if available
    const partyName = challan.party || challan.party_name || "";
    const partyGst = challan.partyGst || challan.party_gst || "";

    if (partyName) {
      doc.text(`Party: ${partyName}`, 20, yOffset + 31);
      if (partyGst) {
        doc.text(`Party GST: ${partyGst}`, 20, yOffset + 39);
      }
    }

    // If there are no items, use sample data from the image
    const tableData =
      items.length > 0 ?
        items.map((item, index) => {
          const quantity = item.quantity || item.qty || 1;
          const rate = item.rate || item.price || 0;
          const discount = item.discount || item.disc || item.disc_percent || 0;
          const specialDiscount =
            item.specialDiscount ||
            item.sp_disc ||
            item.spDisc ||
            item.special_discount ||
            0;
          const description =
            item.description || item.name || item.item_name || "Item";

          const itemTotal = quantity * rate;
          const discountAmount = (itemTotal * discount) / 100;
          const specialDiscountAmount =
            ((itemTotal - discountAmount) * specialDiscount) / 100;
          const amount = itemTotal - discountAmount - specialDiscountAmount;

          return [
            (index + 1).toString(),
            description,
            quantity.toString(),
            `₹${rate.toFixed(2)}`,
            `${discount}%`,
            `${specialDiscount}%`,
            `₹${amount.toFixed(2)}`,
          ];
        })
      : [
          [
            "1",
            "OIL FILTER SANT RO HICITY 3",
            "1",
            "₹150.00",
            "0%",
            "0%",
            "₹150.00",
          ],
          [
            "2",
            "AIR FILTER AMAZE LUMAX",
            "1",
            "₹250.00",
            "0%",
            "0%",
            "₹250.00",
          ],
          [
            "3",
            "CABIN FILTER VERNA FLUDIC",
            "1",
            "₹330.00",
            "0%",
            "0%",
            "₹330.00",
          ],
        ];

    // Create items table
    const tableHeaders = [
      [
        "Sr.",
        "Description of Goods",
        "Qty.",
        "Rate",
        "Disc (%)",
        "Sp.Disc (%)",
        "Amount",
      ],
    ];

    // Add total row
    const displayTotal = totalAmount > 0 ? totalAmount : 730; // 150 + 250 + 330 = 730
    const totalRow = [
      "",
      "",
      "",
      "",
      "",
      "Total:",
      `₹${Math.round(displayTotal)}`,
    ];

    // Calculate startY based on content
    const startY =
      partyName && partyGst ? yOffset + 45
      : partyName ? yOffset + 38
      : yOffset + 30;

    autoTable(doc, {
      head: tableHeaders,
      body: [...tableData, totalRow],
      startY: startY,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [60, 60, 60], textColor: [255, 255, 255] },
      columnStyles: {
        0: { cellWidth: 15 },
        1: { cellWidth: 65 },
        2: { cellWidth: 15 },
        3: { cellWidth: 20 },
        4: { cellWidth: 15 },
        5: { cellWidth: 15 },
        6: { cellWidth: 25 },
      },
      didParseCell: function (data) {
        // Make the total row bold
        if (data.row.index === tableData.length) {
          if (data.column.index === 5 || data.column.index === 6) {
            data.cell.styles.fontStyle = "bold";
          }
        }
      },
    });

    // Add total amount
    const finalY = doc.lastAutoTable.finalY + 10;
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(`Total Amount: ₹${Math.round(displayTotal)}`, 20, finalY);

    // Add amount in words (optional)
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    const amountInWords = numberToWords(displayTotal);
    if (amountInWords) {
      doc.text(`(Rupees ${amountInWords} Only)`, 20, finalY + 8);
    }

    // Add footer with firm name
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      `This is a computer generated challan from ${firmName}`,
      105,
      280,
      { align: "center" },
    );

    // Save the PDF
    doc.save(
      `${firmName.replace(/\s+/g, "_")}_Challan_${challan.challanNo || challan.challan_number || "00022"}_${new Date().toISOString().split("T")[0]}.pdf`,
    );
  };

  const generateChallanPDF = async (challan) => {
    if (!challan?.id) {
      showToast("Invalid challan selected", "error");
      return;
    }

    let challanData = challan?.raw || {};
    try {
      const challanRes = await api.get(`/challans/${challan.id}`);
      challanData = getResponseData(challanRes) || challanData;
    } catch (err) {
      console.error("Failed to fetch challan details for PDF:", err);
      showToast("Failed to load challan details for PDF", "error");
      return;
    }

    const doc = new jsPDF({
      orientation: "landscape",
      unit: "mm",
      format: "a4",
    });

    const firmName = firmBranding.name;
    const firmAddress = firmBranding.address;
    const contactData = challanData?.contact_id || challanData?.party_id || {};
    const partyName =
      contactData?.name ||
      challanData?.party_name ||
      challan?.party ||
      "CASH BOOK";
    const partyArea = String(
      contactData?.area || contactData?.area_name || challanData?.area || "",
    ).trim();
    const partyCity = String(contactData?.city || challanData?.city || "").trim();
    const partyContact = String(
      contactData?.phone ||
        contactData?.mobile ||
        contactData?.contact_no ||
        contactData?.contact ||
        challanData?.phone ||
        "",
    ).trim();
    const printOption =
      Number(challanData?.print_option ?? challan?.printOption ?? 2) || 2;

    const formatDateDDMMYYYY = (value) => {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return "";
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = String(date.getFullYear());
      return `${dd}-${mm}-${yyyy}`;
    };

    const challanNoRaw =
      challanData?.challan_no ||
      challanData?.challanNo ||
      challan?.challanNo ||
      "";
    const challanNo = String(challanNoRaw || "");
    const challanDate =
      formatDateDDMMYYYY(challanData?.date || challan?.date) ||
      formatDateDDMMYYYY(new Date());

    const items = Array.isArray(challanData?.items) ? challanData.items : [];

    // build a lookup of item details; if the server only returns an ObjectId we fetch the info
    const itemDetailsMap = {};
    const missingIds = new Set();
    items.forEach((item) => {
      if (item?.item_id) {
        if (typeof item.item_id === "object" && item.item_id !== null) {
          const idVal = item.item_id._id || item.item_id.id || "";
          if (idVal) itemDetailsMap[idVal] = item.item_id;
        } else {
          missingIds.add(item.item_id);
        }
      }
    });
    if (missingIds.size > 0) {
      try {
        const responses = await Promise.all(
          Array.from(missingIds).map((id) => api.get(`/items/${id}`)),
        );
        responses.forEach((r) => {
          const d = getResponseData(r);
          const idVal = d?._id || d?.id || "";
          if (idVal) itemDetailsMap[idVal] = d;
        });
      } catch (err) {
        console.warn("Failed to fetch some item details for PDF:", err);
      }
    }

    const parsedItems =
      items.length > 0 ?
        items.map((item, index) => {
          const rawRef = item?.item_id || item || {};
          let itemRef;
          if (
            rawRef &&
            typeof rawRef === "object" &&
            (rawRef.item_name || rawRef.name || rawRef.barcode)
          ) {
            itemRef = rawRef;
          } else {
            itemRef = itemDetailsMap[rawRef] || {};
          }
          const itemName =
            itemRef?.item_name ||
            itemRef?.name ||
            item?.item_name ||
            item?.name ||
            item?.description ||
            "";
          const barcode =
            itemRef?.barcode ||
            itemRef?.barcode_no ||
            itemRef?.barcodeNumber ||
            itemRef?.barcode_value ||
            item?.barcode ||
            "";
          const description =
            String(itemName).trim() || String(barcode).trim() || "-";



          const quantity =
            Number(item?.quantity ?? item?.pcs ?? item?.qty ?? 0) || 0;
          const rate =
            Number(item?.rate ?? itemRef?.sale_rate ?? itemRef?.amount ?? 0) ||
            0;
          const discount = Number(item?.discount ?? item?.disPercent ?? 0) || 0;
          const specialDiscount =
            Number(
              item?.special_discount ??
                item?.spDis ??
                item?.specialDiscount ??
                0,
            ) || 0;
          const itemDis2 = Number(item?.item_dis2 ?? item?.itemDis2 ?? 0) || 0;
          const lineAmount = Number(item?.amount ?? 0) || 0;

          return {
            row: [
              String(index + 1),
              description,
              quantity ? String(quantity) : "-",
              rate.toFixed(2),
              discount.toFixed(2),
              specialDiscount.toFixed(2),
              itemDis2.toFixed(2),
            ],
            lineAmount,
            quantity,
          };
        })
      : [];

    const rowsFromItems = parsedItems.map((entry) => entry.row);
    const totalFromItems = parsedItems.reduce(
      (sum, entry) => sum + entry.lineAmount,
      0,
    );
    const totalQuantity = parsedItems.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    );
    const formattedTotalQuantity =
      Number.isInteger(totalQuantity) ?
        String(totalQuantity)
      : totalQuantity.toFixed(2);

    const blue = [0, 0, 255];

    const totalAmount = Number(challanData?.amount ?? 0) || totalFromItems;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 8;
    const hGap = 5;
    const cols = 2;
    const challanWidth = (pageWidth - margin * 2 - hGap) / cols;
    const challanHeight = pageHeight - margin * 2;

    const drawChallanCopy = (originX, originY) => {
      const pad = 0.5;
      const headerHeight = 28;
      const detailsHeight = 57;
      const innerX = originX + pad;
      const innerWidth = challanWidth - pad * 2;
      const headerY = originY + pad;
      const detailsY = headerY + headerHeight;
      const tableY = detailsY + detailsHeight + 1.5;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(originX, originY, challanWidth, challanHeight);

      doc.rect(innerX, headerY, innerWidth, headerHeight);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13.5);
      doc.setTextColor(...blue);
      doc.text(
        `* ${firmName.toUpperCase()} *`,
        innerX + innerWidth / 2,
        headerY + 8,
        { align: "center" },
      );
      doc.setFontSize(6);
      doc.text(firmAddress, innerX + innerWidth / 2, headerY + 14.5, {
        align: "center",
      });

      doc.setTextColor(0, 0, 0);
      doc.rect(innerX, detailsY, innerWidth, detailsHeight);
      const leftBoxWidth = Math.round(innerWidth * 0.60 * 10) / 10;
      doc.line(
        innerX + leftBoxWidth,
        detailsY,
        innerX + leftBoxWidth,
        detailsY + detailsHeight,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...blue);
      const partyDisplay = String(partyName).toUpperCase().substring(0, 22);
      doc.text(`M/s. : ${partyDisplay}`, innerX + 2.5, detailsY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(0, 0, 0);
      const contactLine = [
        partyCity ? `City ${partyCity}.` : "",
        `Contact No.,${partyContact ? ` ${partyContact}` : ""}`,
      ].filter(Boolean).join(" ");
      doc.text(contactLine, innerX + 2.5, detailsY + 17);
      doc.text(`AREA${partyArea ? `-${partyArea}` : "--"}`, innerX + 2.5, detailsY + 29);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.text(
        `Challan No.  :  ${challanNo}`,
        innerX + leftBoxWidth + 2,
        detailsY + 5,
      );
      doc.text(
        `Date          :  ${challanDate}`,
        innerX + leftBoxWidth + 2,
        detailsY + 17,
      );

      const head = [[
        "Sr.",
        printOption === 2 ? "Item Name" : "Barcode",
        "Qty.",
        "Rate",
        "Disc (%)",
        "Sp.Dis (%)",
        "Dis2",
      ]];
      const body = rowsFromItems.length ? rowsFromItems : [["", "", "", "", "", "", ""]];

      const srW = 5;
      const qtyW = 8;
      const rateW = 13;
      const discW = 9;
      const spDiscW = 9;
      const dis2W = 9;
      const descW = innerWidth - (srW + qtyW + rateW + discW + spDiscW + dis2W);

      autoTable(doc, {
        head,
        body,
        startY: tableY,
        margin: { left: innerX },
        tableWidth: innerWidth,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 6.5,
          textColor: [0, 0, 0],
          cellPadding: { top: 0.6, right: 0.6, bottom: 0.6, left: 0.6 },
          lineColor: [0, 0, 0],
          lineWidth: 0.25,
          overflow: "linebreak",
          valign: "top",
        },
        headStyles: {
          fillColor: [230, 230, 230],
          textColor: blue,
          fontStyle: "bold",
          fontSize: 6,
          halign: "center",
          valign: "middle",
        },
        columnStyles: {
          0: { cellWidth: srW, halign: "left" },
          1: { cellWidth: descW, halign: "left", fontSize: 6.5, overflow: "linebreak" },
          2: { cellWidth: qtyW, halign: "right" },
          3: { cellWidth: rateW, halign: "right" },
          4: { cellWidth: discW, halign: "right" },
          5: { cellWidth: spDiscW, halign: "right" },
          6: { cellWidth: dis2W, halign: "right" },
        },
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `Qty: ${formattedTotalQuantity}  |  Total Amount: Rs. ${Math.round(totalAmount)}`,
        innerX + innerWidth - 1.5,
        originY + challanHeight - 5,
        { align: "right" },
      );

      // Add footer branding as a clickable link
      const brandingText = "thekbclick.com / ThekbCart";
      const brandingFontSize = 6.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(brandingFontSize);
      doc.setTextColor(0, 102, 204);
      
      const textWidth = (doc.getStringUnitWidth(brandingText) * brandingFontSize) / doc.internal.scaleFactor;
      const xOffset = originX + (challanWidth - textWidth) / 2;
      const yPos = originY + challanHeight + 3.5;
      
      doc.textWithLink(brandingText, xOffset, yPos, { url: "https://thekbclick.com" });
      
      // Add underline
      doc.setDrawColor(0, 102, 204);
      doc.setLineWidth(0.1);
      doc.line(xOffset, yPos + 0.5, xOffset + textWidth, yPos + 0.5);
    };

    for (let c = 0; c < cols; c++) {
      const originX = margin + c * (challanWidth + hGap);
      const originY = margin;
      drawChallanCopy(originX, originY);
    }

    const previewUrl = doc.output("bloburl");
    const previewWindow = window.open(previewUrl, "_blank");
    if (!previewWindow) {
      showToast(
        "Popup blocked. Please allow popups for print preview.",
        "error",
      );
    }
  };

  // Helper function to convert number to words (optional)
  const numberToWords = (_num) => {
    // You can implement this function or use a library
    // For now, returning empty string
    void _num;
    return "";
  };

  const columns = [
    {
      key: "challanNo",
      label: "Challan No",
      render: (value) => (
        <span className="text-xs sm:text-sm font-medium">{value}</span>
      ),
    },
    {
      key: "date",
      label: "Date",
      render: (value) => {
        const parsed = new Date(value);
        if (Number.isNaN(parsed.getTime())) {
          return <span className="text-xs sm:text-sm">-</span>;
        }
        const dd = String(parsed.getDate()).padStart(2, "0");
        const mm = String(parsed.getMonth() + 1).padStart(2, "0");
        const yyyy = parsed.getFullYear();
        return <span className="text-xs sm:text-sm">{`${dd}/${mm}/${yyyy}`}</span>;
      },
    },
    {
      key: "party",
      label: "Party",
      render: (value) => (
        <span className="text-xs sm:text-sm truncate">{value}</span>
      ),
    },
    {
      key: "items",
      label: "Items",
      render: (value) => (
        <span className="text-xs sm:text-sm">{`${value.length} item(s)`}</span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      render: (value) => (
        <span className="text-xs sm:text-sm">₹{Math.round(Number(value)||0).toLocaleString()}</span>
      ),
    },
    {
      key: "challanType",
      label: "Challan Type",
      render: (value) => (
        <span className="text-xs sm:text-sm capitalize">{value}</span>
      ),
    },
    {
      key: "gstType",
      label: "Type",
      render: (value) => (
        <span
          className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[10px] sm:text-xs rounded-full ${
            value === 1 ?
              "bg-green-100 text-green-800"
            : "bg-blue-100 text-blue-800"
          }`}
        >
          {value}
        </span>
      ),
    },
  ];

  const actions = [
    {
      label: <FaEdit size={10} className="sm:size-3 md:size-4" />,
      onClick: (challan) =>
        navigate(`/transactions/challans/edit/${challan.id}`),
      className:
        "bg-blue-600 text-white hover:bg-blue-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaTrash size={10} className="sm:size-3 md:size-4" />,
      onClick: (challan) => setDeleteDialog({ isOpen: true, challan }),
      className:
        "bg-red-600 text-white hover:bg-red-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
    {
      label: <FaDownload size={10} className="sm:size-3 md:size-4" />,
      onClick: (challan) => generateChallanPDF(challan),
      className:
        "bg-green-600 text-white hover:bg-green-700 p-1 sm:p-1.5 md:p-2 text-xs",
    },
  ];

  const handleConvertToBill = async () => {
    if (selectedChallans.length === 0) {
      alert("Please select challans to convert");
      return;
    }

    try {
      const payload = {
        contact_id: selectedChallans[0].partyId,
        challan_ids: selectedChallans.map((c) => c.id),
      };

      await api.post("/bills", payload);
      showToast("Bill created successfully", "success");

      // refresh challan list and remove converted items from view
      setChallans(await loadAllChallans());

      setIsConvertModalOpen(false);
      setSelectedChallans([]);

      // take user to the bill list so they can see the newly created bill
      navigate("/transactions/bill-list");
    } catch (error) {
      console.error(error);
      const msg =
        error?.response?.data?.message || "Failed to convert challans";
      showToast(msg, "error");
    }
  };

	  const resetFilters = () => {
	    const empty = { type: "sale", search: "", contactId: "", fromDate: "", toDate: "" };
    setFilters(empty);
    setInputFilters(empty);
  };

  useKeyboardShortcuts({
    onAdd: () => navigate("/transactions/challans/create"),
    onConvertToBill: () => setIsConvertModalOpen(true),
    onRefresh: async () => {
      try {
        setChallans(await loadAllChallans());
        showToast("Challan list refreshed", "success");
      } catch { showToast("Failed to refresh", "error"); }
    },
    onResetFilters: resetFilters,
  });



  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
            Challan List
          </h1>
          <p className="text-gray-600 text-xs sm:text-sm">
            Manage delivery challans
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
          <Button
            onClick={() => navigate("/transactions/challans/create")}
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start"
          >
            <FaPlus className="text-sm sm:text-base" />
            Create Challan
          </Button>
          <Button
            onClick={() => setIsConvertModalOpen(true)}
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start"
          >
            <FaFileInvoiceDollar className="text-sm sm:text-base" />
            Convert to Bill
          </Button>
          <Button
            variant="outline"
            onClick={async () => {
              try {
                const refreshedChallans = await loadAllChallans();
                setChallans(refreshedChallans);
                showToast("Challan list refreshed", "success");
              } catch {
                showToast("Failed to refresh challans", "error");
              }
            }}
            className="flex items-center gap-2 text-xs sm:text-sm w-full sm:w-auto justify-center sm:justify-start"
          >
            🔄 Refresh
          </Button>
        </div>
      </div>

      <div className="border rounded-lg bg-white p-3 sm:p-4">
	        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              From Date
            </label>
            <input
              type="text"
              value={inputFilters.fromDate}
              onChange={(e) => {
                updateInputFilters({ fromDate: normalizeDisplayDateInput(e.target.value) });
              }}
              placeholder="dd/mm/yyyy"
              className="w-full px-2 py-2 border rounded-md text-xs sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              To Date
            </label>
            <input
              type="text"
              value={inputFilters.toDate}
              onChange={(e) => {
                updateInputFilters({ toDate: normalizeDisplayDateInput(e.target.value) });
              }}
              placeholder="dd/mm/yyyy"
              className="w-full px-2 py-2 border rounded-md text-xs sm:text-sm"
            />
          </div>
          <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search challan..."
              value={inputFilters.search}
              onChange={(e) => updateInputFilters({ search: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-xs sm:text-sm"
            />
          </div>
          {/* <div className="lg:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Contact ID
            </label>
            <input
              type="text"
              placeholder="Contact ID"
              value={inputFilters.contactId}
              onChange={(e) => updateInputFilters({ contactId: e.target.value })}
              className="w-full px-3 py-2 border rounded-md text-xs sm:text-sm"
            />
          </div> */}
          <div className="flex flex-row gap-2 mt-3">
          <Button
            onClick={() => {
              const fromDate = inputFilters.fromDate || getFinancialYearStartDisplayDate();
              const toDate = inputFilters.toDate;
              
              // Update input filters to show the default date
              if (!inputFilters.fromDate) {
                setInputFilters(prev => ({ ...prev, fromDate: getFinancialYearStartDisplayDate() }));
              }
              
              updateFilters({ 
                fromDate: fromDate, 
                toDate: toDate 
              });
            }}
            className="text-xs sm:text-sm bg-blue-600 hover:bg-blue-700 text-white"
          >
            Apply
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const resetFilters = {
	                type: "sale",
                search: "",
                contactId: "",
                fromDate: "",
                toDate: "",
              };
              setFilters(resetFilters);
              setInputFilters(resetFilters);
            }}
            className="text-xs sm:text-sm"
          >
            Reset
          </Button>
        </div>
        </div>
        
      </div>

      <div className="overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0">
        <DataTable
          loading={tableLoading}
          columns={columns}
          data={displayedChallans}
          actions={actions}
          searchable={false}
          sortable={true}
          pagination={true}
          selectable={false}
          className="text-xs sm:text-sm"
          minWidth="700px"
        />
      </div>

      <Modal
        isOpen={isConvertModalOpen}
        onClose={() => setIsConvertModalOpen(false)}
        title="Convert Challans to Bill"
        size="lg"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Select challans to convert into a single bill:
          </p>

          <div className="max-h-64 overflow-y-auto border rounded-lg">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    <input
                      type="checkbox"
                      checked={
                        selectedChallans.length ===
                          convertibleChallans.length &&
                        convertibleChallans.length > 0
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedChallans([...convertibleChallans]);
                        } else {
                          setSelectedChallans([]);
                        }
                      }}
                      className="rounded"
                    />
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Challan No
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Party
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {convertibleChallans.map((challan) => (
                  <tr key={challan.id} className="border-t">
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        checked={selectedChallans.some(
                          (s) => s.id === challan.id,
                        )}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedChallans((prev) => [...prev, challan]);
                          } else {
                            setSelectedChallans((prev) =>
                              prev.filter((s) => s.id !== challan.id),
                            );
                          }
                        }}
                        className="rounded"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm">{challan.challanNo}</td>
                    <td className="px-4 py-2 text-sm">{challan.party}</td>
                    <td className="px-4 py-2 text-sm">
                      ₹{Math.round(Number(challan.amount)||0).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedChallans.length > 0 && (
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-800">
                Selected: {selectedChallans.length} challans | Total Amount: ₹
                {selectedChallans
                  .reduce((sum,c)=>sum+(Number(c.amount)||0),0).toLocaleString()}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              onClick={handleConvertToBill}
              disabled={selectedChallans.length === 0}
              className="flex items-center gap-2"
            >
              <FaCheck />
              Convert to Bill
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsConvertModalOpen(false);
                setSelectedChallans([]);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      <DeleteConfirmDialog
        isOpen={deleteDialog.isOpen}
        onClose={() => setDeleteDialog({ isOpen: false, challan: null })}
        onConfirm={async () => {
          try {
            await api.delete(`/challans/${deleteDialog.challan.id}`);
            showToast("Challan deleted successfully", "success");
            setChallans((prev) =>
              prev.filter((c) => c.id !== deleteDialog.challan.id),
            );
            setDeleteDialog({ isOpen: false, challan: null });
          } catch (error) {
            showToast(
              error?.response?.data?.message || "Failed to delete challan",
              "error",
            );
          }
        }}
        itemName={deleteDialog.challan?.challanNo}
      />

      <Modal
        isOpen={!!validationError}
        onClose={() => setValidationError("")}
        title="Error"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-700">{validationError}</p>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setValidationError("")}
              className="w-full"
            >
              OK
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ChallanList;
