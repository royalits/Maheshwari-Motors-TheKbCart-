import { useState, useEffect, useRef, Fragment, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FaChevronDown,
  FaChevronUp,
  FaTimes,
  FaSave,
  FaPrint,
  FaCalendarAlt,
} from "react-icons/fa";
import { Button, SearchableSelect } from "../../components/ui";
import useStore from "../../store";
import useFirmBranding from "../../hooks/useFirmBranding";
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
  normalizeChallan,
} from "../../services/apiUtils";
import useSaveShortcut from "../../hooks/useSaveShortcut";
import {
  getTodayDate,
  normalizeDisplayDateInput,
  toDisplayDate,
  toISODate,
} from "../../utils/dateHelpers";

const ChallanForm = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const { showToast, user, selectedFirm } = useStore();
  const firmBranding = useFirmBranding();
  const isEditMode = !!id;

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
    if (!challan.party || loadedParties.length === 0) return null;
    const selectedParty = loadedParties.find((p) => p.id === challan.party);
    if (!selectedParty) return null;
    return Number(selectedParty?.is_gst ?? 0) === 1 ? 1 : 0;
  };

  const resolveEffectiveItemType = (details, masterIsGst, partyGstType) => {
    if (Number(masterIsGst ?? 1) === 0) return 0;
    if (partyGstType === 0) return 0;
    if (
      details?.type !== undefined &&
      details?.type !== null &&
      details?.type !== ""
    ) {
      return Number(details.type) === 1 ? 1 : 0;
    }
    return Number(masterIsGst ?? 1) === 1 ? 1 : 0;
  };

  const mapApiItemToLoadedItem = (item) => {
    const normalized = normalizeItem(item);
    const physicalStock = resolvePhysicalStock({ ...item, ...normalized });
    return {
      ...item,
      id: normalized.id,
      name: normalized.itemName,
      amount: normalized.amount,
      sale_rate: normalized.amount,
      mrp_rate: normalized.mrp_rate,
      qty: physicalStock,
      stockCount: physicalStock,
      physicalStock,
      logicalStock: resolveLogicalStock({ ...item, ...normalized }),
      barcode: normalized.barcode,
      is_gst: normalized.type,
    };
  };

  const formatItemMetric = (label, value, { currency = false } = {}) => {
    const numeric = Number(value);
    const safeValue = Number.isFinite(numeric) ? numeric : 0;
    const formattedValue =
      currency ? safeValue.toFixed(2) : safeValue.toLocaleString("en-IN");
    return `${label}: ${currency ? `Rs ${formattedValue}` : formattedValue}`;
  };

  const toStockNumber = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const resolvePhysicalStock = (item = {}) => {
    const hasSplitStock =
      item?.opening_physical_stock !== undefined ||
      item?.physical_stock !== undefined;
    if (hasSplitStock) {
      return (
        toStockNumber(item.opening_physical_stock) +
        toStockNumber(item.physical_stock)
      );
    }
    return toStockNumber(
      item?.physicalStock ?? item?.stockCount ?? item?.qty ?? item?.stock,
    );
  };

  const resolveLogicalStock = (item = {}) => {
    const hasSplitStock =
      item?.opening_logical_stock !== undefined ||
      item?.logical_stock !== undefined;
    if (hasSplitStock) {
      return (
        toStockNumber(item.opening_logical_stock) +
        toStockNumber(item.logical_stock)
      );
    }
    return toStockNumber(item?.logicalStock);
  };

  const getItemStock = (item) => {
    const physical = resolvePhysicalStock(item);
    const logical = resolveLogicalStock(item);
    const value = showAllCombinedStock ? logical : physical;
    return Number.isFinite(value) ? value : 0;
  };

  const getStockColumnValue = (details = {}) => {
    const physical = resolvePhysicalStock(details);
    const logical = resolveLogicalStock(details);
    const value = showAllCombinedStock ? logical : physical;
    const safeValue = Number.isFinite(value) ? value : 0;
    return Number.isInteger(safeValue) ?
        String(safeValue)
      : safeValue.toFixed(1);
  };

  const toggleStockColumnMode = () => {
    setShowAllCombinedStock((prev) => !prev);
    setChallan((prev) => {
      const itemDetails = { ...prev.itemDetails };
      prev.items.forEach((rowId) => {
        const current = itemDetails[rowId] || {};
        const item = getLoadedItemByRowId(rowId, itemDetails);
        const physicalStock = resolvePhysicalStock({ ...current, ...item });
        const logicalStock = resolveLogicalStock({ ...current, ...item });
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
      const physicalStock = resolvePhysicalStock(stock);
      const logicalStock = resolveLogicalStock(stock);

      setLoadedItems((prev) =>
        prev.map((item) => {
          if (String(item.id) !== updatedId) return item;
          return {
            ...item,
            stock: physicalStock,
            physicalStock,
            physical_stock: stock.physical_stock,
            logicalStock,
            logical_stock: stock.logical_stock,
            opening_physical_stock: stock.opening_physical_stock,
            opening_logical_stock: stock.opening_logical_stock,
          };
        }),
      );

      setChallan((prev) => {
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
            stock: physicalStock,
            physicalStock,
            logicalStock,
          };
        });

        return changed ? { ...prev, itemDetails } : prev;
      });
    };

    window.addEventListener(STOCK_UPDATE_EVENT, handleStockUpdate);
    return () =>
      window.removeEventListener(STOCK_UPDATE_EVENT, handleStockUpdate);
  }, []);

  const [loadedParties, setLoadedParties] = useState([]);
  const [loadedSuppliers, setLoadedSuppliers] = useState([]);
  const [loadedLabels, setLoadedLabels] = useState([]);
  const [filteredLabels, setFilteredLabels] = useState([]);
  const [loadedItems, setLoadedItems] = useState([]);
  const [loadedBanks, setLoadedBanks] = useState([]);
  const [loadedTransports, setLoadedTransports] = useState([]);
  const [loadedAreas, setLoadedAreas] = useState([]);
  const [loadedDiscounts, setLoadedDiscounts] = useState({});
  const [loadedLabelDiscounts, setLoadedLabelDiscounts] = useState({});
  const [itemSearchTerm, setItemSearchTerm] = useState("");
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [itemsPage, setItemsPage] = useState(1);
  const [totalItemsPages, setTotalItemsPages] = useState(1);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [highlightedItemIndex, setHighlightedItemIndex] = useState(0);
  const [pendingFocus, setPendingFocus] = useState(null);
  const [expandedItemId, setExpandedItemId] = useState(null);
  const [itemHistoryMap, setItemHistoryMap] = useState({});
  const [showAllCombinedStock, setShowAllCombinedStock] = useState(false);
  const [showAllFields, setShowAllFields] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const itemDropdownRef = useRef(null);
  const itemSearchInputRef = useRef(null);
  const itemDropdownListRef = useRef(null);
  const firstFieldRef = useRef(null);
  const challanFormRef = useRef(null);
  const challanDatePickerRef = useRef(null);
  const itemHistoryInFlightRef = useRef(new Set());

  const openChallanDatePicker = () => {
    const picker = challanDatePickerRef.current;
    if (!picker) return;
    if (typeof picker.showPicker === "function") picker.showPicker();
    else picker.click();
  };

  const getNativeDateValue = (value) => {
    const isoValue = toISODate(toDisplayDate(value) || value);
    return /^\d{4}-\d{2}-\d{2}$/.test(isoValue) ? isoValue : "";
  };

  const [challan, setChallan] = useState({
    party: "",
    label_id: "",
    challanNo: "",
    items: [],
    gstType: null,
    deductFromStock: true,
    date: getTodayDate(),
    itemDetails: {},
    discount: 0,
    printOption: 2,
    from_bank: "",
    area_id: "",
    transport_id: "",
  });

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

  const getRowBaseItemId = (rowId, detailsMap = challan.itemDetails) => {
    if (!rowId) return "";
    const detailItemId = detailsMap?.[rowId]?.itemId;
    if (detailItemId) return String(detailItemId);
    return String(rowId).split("__")[0];
  };

  const getLoadedItemByRowId = (rowId, detailsMap = challan.itemDetails) => {
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

  useEffect(() => {
    const timer = setTimeout(() => {
      firstFieldRef.current?.focus();
      firstFieldRef.current?.select?.();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const focusNextFocusable = (current, direction = 1) => {
    const root = challanFormRef.current || document;
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

  const handleChallanFormKeyDown = (event) => {
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [
          pRes,
          sRes,
          iRes,
          brandRes,
          bankRes,
          labelRes,
          transportRes,
          areaRes,
        ] = await Promise.all([
          api.get("/contacts/parties", { params: { page: 1, limit: 2000 } }),
          api.get("/contacts/suppliers", { params: { page: 1, limit: 2000 } }),
          api.get("/items", { params: { page: 1, limit: 50, search: "" } }),
          api.get("/brands", { params: { page: 1, limit: 200 } }),
          api.get("/banks", { params: { page: 1, limit: 200 } }),
          api.get("/labels", { params: { page: 1, limit: 500 } }),
          api.get("/transports", { params: { page: 1, limit: 200 } }),
          api.get("/areas", { params: { page: 1, limit: 200 } }),
        ]);

        const partiesData = getResponseList(pRes).map((party) => {
          const normalized = normalizeContact(party);
          return {
            id: normalized.id,
            name: normalized.name,
            is_gst: normalized.is_gst,
            party_code:
              party?.party_code || party?.contact_code || party?.code || "",
            transport: party?.transport || party?.transport_name || "",
            area: party?.area || party?.location || "",
            discount_label: party?.discount_label || party?.label || "",
            transport_charge: party?.transport_charge || "",
            transport_id: getEntityId(party?.transport_id) || "",
            area_id: getEntityId(party?.area_id) || "",
            bank_id: getEntityId(party?.bank_id) || "",
            label_id:
              normalized.label_id ||
              getEntityId(party?.label_id) ||
              getEntityId(party?.label_ids?.[0]) ||
              "",
            category_id: normalized.category_id,
          };
        });
        const suppliersData = getResponseList(sRes).map((supplier) => {
          const normalized = normalizeContact(supplier);
          return {
            id: normalized.id,
            name: normalized.name,
            is_gst: normalized.is_gst,
            gstin: supplier.gstin || "",
          };
        });
        const itemsData = getResponseList(iRes).map(mapApiItemToLoadedItem);

        setLoadedParties(partiesData);
        setLoadedSuppliers(suppliersData);
        setLoadedItems(itemsData);
        setLoadedLabels(
          getResponseList(labelRes).map((label) => ({
            id: getEntityId(label),
            name: label?.name || label?.label_name || "",
            category_id: getEntityId(label?.category_id),
          })),
        );

        const bankList = getResponseList(bankRes);
        const banks = bankList.map((b) => ({
          id: getEntityId(b),
          name: b.bank_name || b.name,
        }));
        setLoadedBanks(banks);

        // Load transports
        const transportList = getResponseList(transportRes);
        const transports = transportList.map((t) => ({
          id: getEntityId(t),
          name: t.name || t.transport_name || "",
        }));
        setLoadedTransports(transports);

        // Load areas from API only
        const areaList = getResponseList(areaRes);
        const areas = areaList
          .map((a) => ({
            id: getEntityId(a),
            name: a.city || a.name || a.area_name || "",
          }))
          .filter((a) => a.name.trim() !== "");
        setLoadedAreas(areas);

        const brandList = getResponseList(brandRes);
        const discountMap = {};
        brandList.forEach((b) => {
          const brandId = getEntityId(b);
          if (brandId) {
            discountMap[brandId] = {
              discount1: b.discount1 || { normal: 0, special: 0 },
              discount2: b.discount2 || { normal: 0, special: 0 },
              discount3: b.discount3 || { normal: 0, special: 0 },
            };
          }
        });
        setLoadedDiscounts(discountMap);

        const itemsMeta = getResponseMeta(iRes);
        setTotalItemsPages(itemsMeta?.totalPages || 1);

        if (isEditMode) {
          const challanRes = await api.get(`/challans/${id}`);
          const challanData = getResponseData(challanRes) || {};
          const normalizedChallan = normalizeChallan(challanData);

          // Fetch stock for all challan items in parallel
          const uniqueItemIds = [
            ...new Set(
              (challanData?.items || [])
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
	                    stock: resolvePhysicalStock({ ...itemData, ...normalized }),
	                    physicalStock: resolvePhysicalStock({
	                      ...itemData,
	                      ...normalized,
	                    }),
	                    logicalStock: resolveLogicalStock({
	                      ...itemData,
	                      ...normalized,
	                    }),
	                  };
                }
              } catch {}
            }),
          );

          const itemDetails = {};
          const itemRows = [];
          (challanData?.items || []).forEach((item) => {
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
            itemDetails[rowId] = {
              itemId,
              pcs: item?.quantity || 1,
              rate: item?.rate || 0,
              disPercent: item?.discount || 0,
              spDis: item?.special_discount || 0,
              itemDiscount: item?.item_discount || 0,
              itemDis2: item?.item_dis2 || 0,
              dis3: item?.dis3 || 0,
              gstPercent: item?.gst_percent || 0,
              grossAmount: item?.gross_amount || 0,
              discountAmount: item?.discount_amount || 0,
              totalDiscount: item?.total_discount || 0,
              taxableAmount: item?.taxable_amount || 0,
              gstAmount: item?.gst_amount || 0,
              amount: item?.amount || 0,
              type:
                (
                  Number(
                    item?.is_gst ??
                      itemRef?.is_gst ??
                      normalizedChallan.gstType ??
                      0,
                  ) === 1
                ) ?
                  1
                : 0,
              itemName: itemRef?.item_name || itemRef?.name || "",
              barcode:
                itemRef?.barcode ||
                itemRef?.barcode_no ||
                itemRef?.barcodeNumber ||
                itemRef?.barcode_value ||
                itemRef?.part_no ||
                "",
              ...stockData,
            };
          });

          const dateValue =
            challanData?.date ?
              new Date(challanData.date).toISOString().split("T")[0]
            : getTodayDate();

          setChallan({
            party: normalizedChallan.partyId,
            label_id:
              getEntityId(challanData?.label_id) ||
              partiesData.find(
                (party) => party.id === normalizedChallan.partyId,
              )?.label_id ||
              "",
            challanNo: normalizedChallan.challanNo || "",
            items: itemRows,
            gstType:
              (
                Number(
                  partiesData.find(
                    (party) => party.id === normalizedChallan.partyId,
                  )?.is_gst ??
                    normalizedChallan.gstType ??
                    0,
                ) === 1
              ) ?
                1
              : 0,
            deductFromStock: true,
            date: dateValue,
            itemDetails,
            discount: challanData?.discount ?? 0,
            printOption: challanData?.print_option || 2,
            from_bank: challanData?.from_bank || "",
            to_bank: challanData?.to_bank || "",
            area_id:
              getEntityId(challanData?.area_id) ||
              partiesData.find((p) => p.id === normalizedChallan.partyId)
                ?.area_id ||
              "",
            transport_id:
              getEntityId(challanData?.transport_id) ||
              partiesData.find((p) => p.id === normalizedChallan.partyId)
                ?.transport_id ||
              "",
          });
        }
      } catch (err) {
        console.error("Failed to fetch data", err);
        showToast("Failed to load data", "error");
      }
    };
    fetchData();
  }, [selectedFirm?.id, id, isEditMode, showToast]);

  // Function to fetch party details from backend
  const fetchPartyDetails = useCallback(
    async (partyId) => {
      try {
        const response = await api.get(`/contacts/parties/${partyId}`);
        const partyData = getResponseData(response);
        if (partyData) {
          console.log("🔍 Fetched party data:", partyData); // Debug log

          // Extract transport info
          let transportId = getEntityId(partyData.transport_id) || "";
          let transportName = "";
          if (
            partyData.transport_id &&
            typeof partyData.transport_id === "object"
          ) {
            transportName =
              partyData.transport_id.name ||
              partyData.transport_id.transport_name ||
              "";
          } else if (transportId) {
            // Find transport name from loaded transports if we have the ID
            const transport = loadedTransports.find(
              (t) => t.id === transportId,
            );
            transportName = transport?.name || "";
          }
          // Fallback to direct transport field
          if (!transportName) {
            transportName =
              partyData.transport || partyData.transport_name || "";
          }

          // Extract area info (similar to transport)
          let areaId = getEntityId(partyData.area_id) || "";
          let areaName = "";
          if (partyData.area_id && typeof partyData.area_id === "object") {
            areaName =
              partyData.area_id.name || partyData.area_id.area_name || "";
          } else if (areaId) {
            const area = loadedAreas.find((a) => a.id === areaId);
            areaName = area?.name || "";
          }
          if (!areaName) {
            areaName = partyData.area || partyData.location || "";
          }

          // Extract bank info (similar to transport and area)
          let bankId = getEntityId(partyData.bank_id) || "";
          let bankName = "";
          if (partyData.bank_id && typeof partyData.bank_id === "object") {
            bankName =
              partyData.bank_id.bank_name || partyData.bank_id.name || "";
          } else if (bankId) {
            const bank = loadedBanks.find((b) => b.id === bankId);
            bankName = bank?.name || "";
          }

          console.log("🏷️ Extracted values:", {
            transportId,
            transportName,
            areaId,
            areaName,
            bankId,
            bankName,
            transport_charge: partyData.transport_charge,
          });

          // Add the fetched area to loadedAreas if it doesn't exist
          if (areaName && areaName.trim() !== "") {
            setLoadedAreas((prev) => {
              const exists = prev.some(
                (area) => area.name.toUpperCase() === areaName.toUpperCase(),
              );
              if (!exists) {
                const newArea = { id: areaName, name: areaName };
                return [...prev, newArea].sort((a, b) =>
                  a.name.localeCompare(b.name),
                );
              }
              return prev;
            });
          }

          // Update the party in loadedParties with fetched details
          setLoadedParties((prev) =>
            prev.map((p) =>
              p.id === partyId ?
                {
                  ...p,
                  transport: transportName,
                  transport_id: transportId,
                  area: areaName,
                  area_id: areaId,
                  bank_id: bankId,
                  discount_label:
                    partyData.discount_label ||
                    partyData.label ||
                    p.discount_label ||
                    "",
                  transport_charge: Number(partyData.transport_charge) || 0,
                }
              : p,
            ),
          );

          // Sync area_id, transport_id, and from_bank into challan state
          setChallan((prev) =>
            prev.party === partyId ?
              {
                ...prev,
                area_id: areaId || areaName || prev.area_id,
                transport_id: transportId || prev.transport_id,
                from_bank: bankId || prev.from_bank,
              }
            : prev,
          );
        }
      } catch (error) {
        console.error("❌ Failed to fetch party details:", error);
      }
    },
    [loadedTransports, loadedAreas, loadedBanks],
  );

  // Function to fetch labels for selected party
  const fetchLabelsForParty = async (selectedParty) => {
    try {
      if (!selectedParty) {
        setFilteredLabels([]);
        return;
      }

      // If party has a category_id, fetch labels for that category
      if (selectedParty.category_id) {
        const response = await api.get("/labels", {
          params: {
            category_id: selectedParty.category_id,
            page: 1,
            limit: 500,
          },
        });

        const labelData = getResponseList(response).map((label) => ({
          id: getEntityId(label),
          name: label?.name || label?.label_name || "",
          category_id: getEntityId(label?.category_id),
        }));

        setFilteredLabels(labelData);

        // Auto-select the party's label if it exists in the filtered list
        if (selectedParty.label_id) {
          const partyLabel = labelData.find(
            (label) => label.id === selectedParty.label_id,
          );
          if (partyLabel) {
            setChallan((prev) => ({
              ...prev,
              label_id: selectedParty.label_id,
            }));
          }
        }
      } else {
        // If no category_id, show all labels
        setFilteredLabels(loadedLabels);
        if (selectedParty.label_id) {
          setChallan((prev) => ({ ...prev, label_id: selectedParty.label_id }));
        }
      }
    } catch (error) {
      console.error("Failed to fetch labels for party:", error);
      // Fallback to showing all labels
      setFilteredLabels(loadedLabels);
      showToast("Failed to load labels for selected party", "warning");
    }
  };

  // Initialize filtered labels when component loads
  useEffect(() => {
    if (challan.party && loadedParties.length > 0) {
      const selectedParty = loadedParties.find((p) => p.id === challan.party);
      if (selectedParty) {
        fetchLabelsForParty(selectedParty);
      }
    } else {
      setFilteredLabels(loadedLabels);
    }
  }, [challan.party, loadedParties, loadedLabels]);

  const getResolvedContact = () => {
    if (!challan.party) return null;
    return (
      loadedParties.find((p) => p.id === challan.party) ||
      loadedSuppliers.find((s) => s.id === challan.party) ||
      null
    );
  };

  const isBookOrCashOrBank = (contact) => {
    if (!contact) return false;
    const type = String(contact.type || contact.contact_type || "").toLowerCase();
    const name = String(contact.name || "").trim().toUpperCase();
    return type === "book" || name === "CASHBOOK" || name === "BANKBOOK";
  };

  const resolvedContact = getResolvedContact();
  const isBookSelected = isBookOrCashOrBank(resolvedContact);

  useEffect(() => {
    if (isBookSelected) {
      setExpandedItemId(null);
    }
  }, [isBookSelected]);

  const formatHistoryDate = (value) => {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-IN");
  };

  const fetchItemHistory = async (itemId) => {
    if (isBookSelected) return;
    if (!challan.party) {
      const errorMsg = "Please select party before loading history";
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
      const response = await api.get(`/challans/item/${itemId}/last-sold`, {
        params: {
          contact_id: challan.party,
        },
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

    if (!challan.party) {
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

  const loadItemsPage = async (page) => {
    setIsLoadingItems(true);
    try {
      const response = await api.get("/items", {
        params: { page, limit: 50, search: itemSearchTerm },
      });
      const items = getResponseList(response).map(mapApiItemToLoadedItem);

      setLoadedItems(items);
      setItemsPage(page);

      const meta = getResponseMeta(response);
      setTotalItemsPages(meta?.totalPages || 1);
    } catch (err) {
      console.error("Failed to load items page:", err);
    } finally {
      setIsLoadingItems(false);
    }
  };

  useEffect(() => {
    const searchItems = async () => {
      setIsLoadingItems(true);
      try {
        const response = await api.get("/items", {
          params: { page: 1, limit: 50, search: itemSearchTerm },
        });
        const searchResults = getResponseList(response).map(
          mapApiItemToLoadedItem,
        );

        setLoadedItems(searchResults);
        setItemsPage(1);

        const meta = getResponseMeta(response);
        setTotalItemsPages(meta?.totalPages || 1);
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
    const partyGstType = getPartyGstType();
    if (partyGstType === null) return;

    setChallan((prev) => {
      let changed =
        prev.gstType !== partyGstType || prev.deductFromStock !== true;
      const nextItemDetails = { ...prev.itemDetails };

      prev.items.forEach((rowId) => {
        const item = getLoadedItemByRowId(rowId, prev.itemDetails);
        const currentDetails = prev.itemDetails[rowId] || {};
        const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
        const nextType = resolveEffectiveItemType(
          currentDetails,
          masterIsGst,
          partyGstType,
        );

        if (currentDetails.type !== nextType) {
          nextItemDetails[rowId] = {
            ...currentDetails,
            type: nextType,
          };
          changed = true;
        }
      });

      if (!changed) return prev;

      return {
        ...prev,
        gstType: partyGstType,
        deductFromStock: true,
        itemDetails: nextItemDetails,
      };
    });
  }, [challan.party, loadedParties, loadedItems]);

  useEffect(() => {
    const labelId = challan.label_id;
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

        setLoadedLabelDiscounts((prev) => {
          const updated = {
            ...prev,
            [labelId]: {
              brandDiscounts: discountMap,
              itemDiscounts: itemDiscountMap,
            },
          };
          console.log("🏷️ Label discounts loaded:", {
            labelId,
            brandDiscounts: discountMap,
            itemDiscounts: itemDiscountMap,
            totalBrands: Object.keys(discountMap).length,
            totalItemDiscounts: Object.keys(itemDiscountMap).reduce(
              (sum, brandId) =>
                sum + Object.keys(itemDiscountMap[brandId]).length,
              0,
            ),
          });
          return updated;
        });
      } catch (error) {
        if (error?.name !== "CanceledError") {
          console.error("Failed to load label discounts", error);
        }
      }
    };

    fetchLabelDiscounts();
    return () => controller.abort();
  }, [challan.label_id, loadedLabelDiscounts]);

  useEffect(() => {
    if (!challan.party) {
      setChallan((prev) => ({ ...prev, label_id: "" }));
      return;
    }
    const party = loadedParties.find((p) => p.id === challan.party);
    const partyLabelId = party?.label_id || "";
    setChallan((prev) => {
      if (prev.label_id === partyLabelId) return prev;
      return { ...prev, label_id: partyLabelId };
    });
  }, [challan.party, loadedParties]);

  useEffect(() => {
    const activeLabelId = challan.label_id;
    if (activeLabelId && !loadedLabelDiscounts[activeLabelId]) return;

    setChallan((prev) => {
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
        const discForBrand =
          (labelDiscounts && labelDiscounts[brandId]) ||
          (!activeLabelId ? loadedDiscounts[brandId] : {}) ||
          {};
        const useDisc =
          (prev.gstType === 1 ?
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
  }, [challan.label_id, loadedLabelDiscounts, loadedItems, loadedDiscounts]);

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
    rate: { label: "Rate", min: 0, required: true },
    disPercent: { label: "Discount %", min: 0, max: 100 },
    spDis: { label: "SP Discount %", min: 0, max: 100 },
    itemDiscount: { label: "Item Disc (%)", min: 0, max: 100 },
    itemDis2: { label: "Item Disc2 (%)", min: 0, max: 100 },
    dis3: { label: "Dis Amount", min: 0 },
    gstPercent: { label: "GST %", min: 0, max: 100 },
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

  const validateChallanNumbers = () => {
    for (const itemId of challan.items) {
      const item = getLoadedItemByRowId(itemId);
      const details = challan.itemDetails[itemId] || {};
      const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
      const itemType = resolveEffectiveItemType(
        details,
        masterIsGst,
        challan.gstType,
      );
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
    return validateNegativeItemRows(challan.items, challan.itemDetails);
  };

  const getItemFieldOrder = (itemType, masterIsGst) => {
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

  const handleItemFieldKeyDown = (
    event,
    rowIndex,
    fieldKey,
    itemType,
    masterIsGst,
  ) => {
    if (event.key !== "Enter" && event.key !== "Tab") return;
    event.preventDefault();

    const order = getItemFieldOrder(itemType, masterIsGst);
    const currentIndex = order.indexOf(fieldKey);
    if (currentIndex === -1) return;

    const isBackward = event.key === "Tab" && event.shiftKey;
    if (isBackward) {
      if (currentIndex > 0) {
        focusItemField(rowIndex, order[currentIndex - 1]);
        return;
      }

      if (rowIndex > 0) {
        const prevItemId = challan.items[rowIndex - 1];
        const prevItem = getLoadedItemByRowId(prevItemId);
        const prevDetails = challan.itemDetails[prevItemId] || {};
        const prevMasterIsGst = prevItem?.is_gst ?? 1;
        const prevType =
          prevMasterIsGst === 0 ? 0
          : prevDetails.type !== undefined ? prevDetails.type
          : challan.gstType;
        const prevOrder = getItemFieldOrder(prevType, prevMasterIsGst);
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

    if (rowIndex < challan.items.length - 1) {
      const nextItemId = challan.items[rowIndex + 1];
      const nextItem = getLoadedItemByRowId(nextItemId);
      const nextDetails = challan.itemDetails[nextItemId] || {};
      const nextMasterIsGst = nextItem?.is_gst ?? 1;
      const nextType =
        nextMasterIsGst === 0 ? 0
        : nextDetails.type !== undefined ? nextDetails.type
        : challan.gstType;
      const nextOrder = getItemFieldOrder(nextType, nextMasterIsGst);
      focusItemField(rowIndex + 1, nextOrder[0]);
      return;
    }

    setShowItemDropdown(true);
    focusSearchInput();
  };

  const handleSelectItem = (item) => {
    if (!item) return;
    const nextIndex = challan.items.length;
    const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
    const initialType = masterIsGst;
    setPendingFocus({
      rowIndex: nextIndex,
      fieldKey: getItemFieldOrder(initialType, masterIsGst)[0],
    });
    toggleItemSelection(item.id, "add");
    setItemSearchTerm("");
    setShowItemDropdown(false);
  };

  const handleItemSearchKeyDown = (event) => {
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
      const selected = filteredItems[highlightedItemIndex] || filteredItems[0];
      if (selected) handleSelectItem(selected);
    }
    if (event.key === "Escape") {
      setShowItemDropdown(false);
    }
    if (event.key === "Tab" && !event.shiftKey) {
      if (challan.items.length === 0) return;
      event.preventDefault();
      const firstItemId = challan.items[0];
      const firstItem = getLoadedItemByRowId(firstItemId);
      const firstDetails = challan.itemDetails[firstItemId] || {};
      const firstMasterIsGst = firstItem?.is_gst ?? 1;
      const firstType =
        firstMasterIsGst === 0 ? 0
        : firstDetails.type !== undefined ? firstDetails.type
        : challan.gstType;
      const firstOrder = getItemFieldOrder(firstType, firstMasterIsGst);
      focusItemField(0, firstOrder[0]);
      setShowItemDropdown(false);
    }
    if (event.key === "Tab" && event.shiftKey) {
      if (challan.items.length === 0) return;
      event.preventDefault();
      const lastIndex = challan.items.length - 1;
      const lastItemId = challan.items[lastIndex];
      const lastItem = getLoadedItemByRowId(lastItemId);
      const lastDetails = challan.itemDetails[lastItemId] || {};
      const lastMasterIsGst = lastItem?.is_gst ?? 1;
      const lastType =
        lastMasterIsGst === 0 ? 0
        : lastDetails.type !== undefined ? lastDetails.type
        : challan.gstType;
      const lastOrder = getItemFieldOrder(lastType, lastMasterIsGst);
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
  }, [challan.items, challan.itemDetails, pendingFocus]);

  const toggleItemSelection = async (itemIdOrRowId, mode = "toggle") => {
    if (mode === "toggle" && expandedItemId === itemIdOrRowId) {
      setExpandedItemId(null);
    }

    const activeLabelId = challan.label_id;
    const labelDiscountData =
      activeLabelId ? loadedLabelDiscounts[activeLabelId] : null;
    const labelDiscounts = labelDiscountData?.brandDiscounts || null;
    const labelItemDiscounts = labelDiscountData?.itemDiscounts || {};
    let addedRowId = null;
    let addedBaseItemId = null;

    setChallan((prev) => {
      if (mode === "add") {
        const baseItemId = String(itemIdOrRowId || "");
        const rowId = createItemRowId(baseItemId, prev.items);
        const item = loadedItems.find(
          (i) => String(i.id) === String(baseItemId),
        );
        if (!item) return prev;

        const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
        const partyGstType = Number(prev.gstType ?? 0) === 1 ? 1 : 0;
        const brandId = getEntityId(
          item?.brand_id || item?.brand || item?.brandId,
        );
        const discForBrand =
          (labelDiscounts && labelDiscounts[brandId]) ||
          loadedDiscounts[brandId] ||
          {};
        const useDisc =
          (prev.gstType === 1 ?
            discForBrand.discount1 || {}
          : discForBrand.discount2 || {}) || {};
        const useDisc3 = discForBrand.discount3 || { normal: 0, special: 0 };
        const itemSpecificDiscount =
          getLabelItemDiscount(activeLabelId, item, baseItemId) ||
          labelItemDiscounts[brandId]?.[baseItemId] ||
          0;
        const defaultGstPercent =
          Number(
            item?.gst_percent ??
              item?.gstPercent ??
              item?.hsn_id?.gst_rate ??
              item?.hsn_id?.gst_percent ??
              0,
          ) || 0;

        const itemDetails = {
          itemId: baseItemId,
          pcs: 1,
          rate: item?.amount || 0,
          disPercent: useDisc.normal || 0,
          spDis: useDisc.special || 0,
          gstPercent: defaultGstPercent,
          itemDiscount: Number(item?.discount || 0),
          itemDis2: 0,
          dis3: itemSpecificDiscount || useDisc3.normal || 0,
          stock: resolvePhysicalStock(item),
          logicalStock: resolveLogicalStock(item),
          physicalStock: resolvePhysicalStock(item),
          type: resolveEffectiveItemType({}, masterIsGst, partyGstType),
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
    const details = challan.itemDetails[itemId] || {};
    const parsedPcs = parseFloat(details.pcs);
    const pcs = Number.isFinite(parsedPcs) ? parsedPcs : 1;
    const rate = parseFloat(details.rate || 0);
    const disPercent = parseFloat(details.disPercent || 0);
    const spDis = parseFloat(details.spDis || 0);
    const itemDiscount = parseFloat(details.itemDiscount || 0);
    const itemDis2 = parseFloat(details.itemDis2 || 0);
    const gstPercent = parseFloat(details.gstPercent || 0);
    const item = getLoadedItemByRowId(itemId);
    const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
    const itemType = resolveEffectiveItemType(
      details,
      masterIsGst,
      challan.gstType,
    );

    const dis3 = parseFloat(details.dis3 || 0);
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
      discountAmount,
      totalDiscount,
      taxableAmount,
      gstAmount,
      amount,
      baseAmount: grossAmount,
      afterDiscount: taxableAmount,
      finalAmount: amount,
    };
  };

  const calculateSubtotal = () => {
    return challan.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.grossAmount;
    }, 0);
  };

  const calculateTotalDiscount = () => {
    return challan.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.totalDiscount;
    }, 0);
  };

  const calculateTotalGst = () => {
    return challan.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.gstAmount;
    }, 0);
  };

  const calculateNetAmount = () => {
    const extraDiscount = parseFloat(challan.discount || 0);
    return round2(calculateTotalAmount() - extraDiscount);
  };

  const updateItemDetail = (itemId, field, value) => {
    setChallan((prev) => ({
      ...prev,
      itemDetails: {
        ...prev.itemDetails,
        [itemId]: {
          ...prev.itemDetails[itemId],
          [field]: value,
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

  const calculateTotalAmount = () => {
    return challan.items.reduce((total, itemId) => {
      const calc = calculateItemAmount(itemId);
      return total + calc.amount;
    }, 0);
  };

  const handleSave = async () => {
    if (isSaving) return;

    try {
      if (!challan.party) {
        showToast("Please select party", "error");
        return;
      }
      if (challan.items.length === 0) {
        showToast("Please add at least one item", "error");
        return;
      }
      const numberValidationError = validateChallanNumbers();
      if (numberValidationError) {
        showToast(numberValidationError, "error");
        return;
      }

      setIsSaving(true);
      const challanType = "sale";
      const challanIsGst = challan.gstType !== null ? challan.gstType : 0;
      const grossTotal = round2(calculateSubtotal());
      const challanLevelDiscount = round2(parseFloat(challan.discount || 0));
      const netAmount = roundNetAmount(
        calculateTotalAmount() - challanLevelDiscount,
      );

      const payload = {
        challan_type: challanType,
        date: challan.date,
        contact_id: challan.party,
        label_id: challan.label_id || undefined,
        is_gst: challanIsGst,
        deduct_from_stock: 1,
        print_option: challan.printOption,
        gross_total: grossTotal,
        sub_total: round2(
          challan.items.reduce(
            (sum, itemId) => sum + calculateItemAmount(itemId).amount,
            0,
          ),
        ),
        discount: challanLevelDiscount,
        amount: netAmount,
        from_bank: challan.from_bank || null,
        to_bank: challan.to_bank || null,
        items: challan.items.map((itemId) => {
          const item = getLoadedItemByRowId(itemId);
          const baseItemId = getRowBaseItemId(itemId);
          const details = challan.itemDetails[itemId] || {};
          const calc = calculateItemAmount(itemId);
          const fallbackDis3 = getLabelItemDiscount(
            challan.label_id,
            item,
            baseItemId,
          );
          const parsedDis3 = parseFloat(details.dis3 ?? 0);
          const resolvedDis3 =
            Number.isFinite(parsedDis3) && parsedDis3 > 0 ?
              parsedDis3
            : fallbackDis3;
          const itemType = resolveEffectiveItemType(
            details,
            Number(item?.is_gst ?? 1) === 1 ? 1 : 0,
            challanIsGst,
          );
          return {
            item_id: baseItemId,
            quantity: parseFloat(details.pcs || 1),
            rate: parseFloat(details.rate || item?.amount || 0),
            discount: parseFloat(details.disPercent || 0),
            special_discount: parseFloat(details.spDis || 0),
            item_discount: parseFloat(details.itemDiscount || 0),
            item_dis2: parseFloat(details.itemDis2 || 0),
            dis3: round2(resolvedDis3),
            gst_percent: parseFloat(details.gstPercent || 0),
            gross_amount: round2(calc.grossAmount),
            discount_amount: round2(calc.discountAmount),
            total_discount: round2(calc.totalDiscount),
            taxable_amount: round2(calc.taxableAmount),
            gst_amount: round2(calc.gstAmount),
            amount: round2(calc.amount),
            is_gst: itemType,
          };
        }),
      };

      if (isEditMode) {
        const response = await api.put(`/challans/${id}`, payload);

        showToast("Challan updated successfully", "success");
      } else {
        const response = await api.post("/challans", payload);

        showToast("Challan created successfully", "success");
      }

      navigate("/transactions/challan-list", {
        state: { refreshChallanList: true },
        replace: true,
      });
    } catch (error) {
      console.error(error);
      const message =
        error?.response?.data?.message ||
        error?.message ||
        `Failed to ${isEditMode ? "update" : "create"} challan`;
      showToast(message, "error");
    } finally {
      setIsSaving(false);
    }
  };

  const LEGACY_handlePrint = () => {
    if (challan.party === "" || challan.items.length === 0) {
      showToast("Please select a party and add items before printing", "error");
      return;
    }

    const party = loadedParties.find((c) => c.id === challan.party);

    const printContent = `
      <html>
        <head>
          <title>Challan</title>
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
            <h1>CHALLAN</h1>
            <p>${selectedFirm?.name || "Company Name"}</p>
          </div>

          <div class="info-section">
            <div class="info-row">
              <div class="info-label">Date:</div>
              <div class="info-value">${new Date(challan.date).toLocaleDateString("en-IN")}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Party:</div>
              <div class="info-value">${party?.name || ""}</div>
            </div>
            <div class="info-row">
              <div class="info-label">Type:</div>
              <div class="info-value">${challan.gstType === 1 ? "GST" : "Non-GST"}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>S.No</th>
                ${challan.printOption === 2 ? "<th>Item Name</th>" : "<th>Barcode</th>"}
                <th>Qty</th>
                <th>Rate</th>
                <th>Discount %</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${challan.items
                .map((itemId, index) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = challan.itemDetails[itemId] || {};
                  const calc = calculateItemAmount(itemId);

                  return `
                  <tr>
                    <td>${index + 1}</td>
                    ${
                      challan.printOption === 2 ?
                        `<td>${item?.name || "Unknown"}</td>`
                      : `<td>${item?.barcode || "-"}</td>`
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
                <span>Subtotal:</span>
                <span>₹${calculateSubtotal().toFixed(2)}</span>
              </div>
              <div class="amount-row">
                <span>Discount:</span>
                <span>₹${round0(calculateTotalDiscount())}</span>
              </div>
              <div class="amount-total">
                <span>Total Amount:</span>
                <span>₹${roundNetAmount(calculateNetAmount())}</span>
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

  const handlePrint = () => {
    if (challan.party === "" || challan.items.length === 0) {
      showToast("Please select a party and add items before printing", "error");
      return;
    }

    const party = loadedParties.find((contact) => contact.id === challan.party);
    const firmName = firmBranding.name;
    const firmAddress = firmBranding.address;

    const formatDateDDMMYYYY = (value) => {
      const date = value ? new Date(value) : new Date();
      if (Number.isNaN(date.getTime())) return "";
      const dd = String(date.getDate()).padStart(2, "0");
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const yyyy = String(date.getFullYear());
      return `${dd}-${mm}-${yyyy}`;
    };

    const challanNo = String(challan.challanNo || "").trim() || "---";
    const challanDate =
      formatDateDDMMYYYY(challan.date) || formatDateDDMMYYYY(new Date());
    const printOption = Number(challan.printOption ?? 2) || 2;
    const partyName = String(party?.name || "CASH BOOK");
    const partyArea = String(party?.area || party?.area_name || "").trim();
    const partyCity = String(party?.city || "").trim();
    const partyContact = String(
      party?.phone ||
        party?.mobile ||
        party?.contact_no ||
        party?.contact ||
        "",
    ).trim();

    const parsedItems = challan.items.map((itemId, index) => {
      const item = getLoadedItemByRowId(itemId) || {};
      const details = challan.itemDetails[itemId] || {};
      const calc = calculateItemAmount(itemId);

      const itemName =
        details.itemName || item?.name || item?.item_name || "Item";
      const barcode =
        details.barcode ||
        item?.barcode ||
        item?.barcode_no ||
        item?.barcodeNumber ||
        item?.barcode_value ||
        item?.part_no ||
        "";
      const description =
        printOption === 2 ?
          String(itemName).trim().substring(0, 22) || "Item"
        : String(barcode).trim() || "-";

      const quantity = Number(details.pcs || 1) || 0;
      const rate = Number(details.rate ?? item.amount ?? 0) || 0;
      const discount = Number(details.disPercent || 0) || 0;
      const specialDiscount = Number(details.spDis || 0) || 0;
      const itemDis2 = Number(details.itemDis2 || 0) || 0;
      const lineAmount = Number(calc.finalAmount || 0) || 0;

      return {
        row: [
          String(index + 1),
          description,
          quantity ? String(quantity) : "",
          rate.toFixed(2),
          discount.toFixed(2),
          specialDiscount.toFixed(2),
          itemDis2.toFixed(2),
        ],
        lineAmount,
        quantity,
      };
    });

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
    const totalAmount = Number(calculateNetAmount() || 0) || totalFromItems;

    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });
    const blue = [0, 0, 255];
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 4;
    const hGap = 0;
    const vGap = 0;
    const cols = 2;
    const rows = 2;
    const challanWidth = (pageWidth - margin * 2 - hGap) / cols;
    const challanHeight = (pageHeight - margin * 2 - vGap) / rows;

    const drawChallanCopy = (originX, originY, label, isEmpty = false) => {
      const pad = 0.5;
      const headerHeight = 22;
      const detailsHeight = 35;
      const innerX = originX + pad;
      const innerWidth = challanWidth - pad * 2;
      const headerY = originY + pad;
      const detailsY = headerY + headerHeight;
      const tableY = detailsY + detailsHeight + 1.5;

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.rect(originX, originY, challanWidth, challanHeight);

      if (isEmpty) return;

      doc.rect(innerX, headerY, innerWidth, headerHeight);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...blue);
      doc.text(
        `* ${firmName.toUpperCase()} *`,
        innerX + innerWidth / 2,
        headerY + 6,
        { align: "center" },
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(0, 0, 0);
      doc.text(firmAddress, innerX + innerWidth / 2, headerY + 11, {
        align: "center",
      });



      doc.setTextColor(0, 0, 0);
      doc.rect(innerX, detailsY, innerWidth, detailsHeight);
      const leftBoxWidth = Math.round(innerWidth * 0.6 * 10) / 10;
      doc.line(
        innerX + leftBoxWidth,
        detailsY,
        innerX + leftBoxWidth,
        detailsY + detailsHeight,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...blue);
      const partyDisplay = String(partyName).toUpperCase().substring(0, 22);
      doc.text(`M/s. : ${partyDisplay}`, innerX + 2.5, detailsY + 5);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.5);
      doc.setTextColor(0, 0, 0);
      const contactLine = [
        partyCity ? `City ${partyCity}.` : "",
        `Contact No.,${partyContact ? ` ${partyContact}` : ""}`,
      ]
        .filter(Boolean)
        .join(" ");
      doc.text(contactLine, innerX + 2.5, detailsY + 15);
      doc.text(
        `AREA${partyArea ? `-${partyArea}` : "--"}`,
        innerX + 2.5,
        detailsY + 25,
      );

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(
        `Challan No.  :  ${challanNo}`,
        innerX + leftBoxWidth + 2,
        detailsY + 5,
      );
      doc.text(
        `Date          :  ${challanDate}`,
        innerX + leftBoxWidth + 2,
        detailsY + 15,
      );

      const head = [
        [
          "Sr.",
          printOption === 2 ? "Item Name" : "Barcode",
          "Qty.",
          "Rate",
          "Disc (%)",
          "Sp.Dis (%)",
          "Dis2",
        ],
      ];
      const body =
        rowsFromItems.length ? rowsFromItems : [["", "", "", "", "", "", ""]];

      const bottomPadding = 12;
      const availableHeight = challanHeight - bottomPadding - 59;
      const estimatedRowHeight = 4.8;
      const estimatedHeadHeight = 6;
      const estimatedBodyHeight = rowsFromItems.length * estimatedRowHeight;
      const fillerHeight = Math.max(
        4,
        availableHeight - estimatedHeadHeight - estimatedBodyHeight,
      );

      const srW = 6;
      const qtyW = 8;
      const rateW = 12;
      const discW = 8;
      const spDiscW = 8;
      const dis2W = 8;
      const descW = innerWidth - (srW + qtyW + rateW + discW + spDiscW + dis2W);

      autoTable(doc, {
        head,
        body,
        startY: tableY,
        margin: { left: innerX, top: 2, bottom: 2 },
        tableWidth: innerWidth,
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 6,
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
          1: {
            cellWidth: descW,
            halign: "left",
            fontSize: 6,
            overflow: "linebreak",
          },
          2: { cellWidth: qtyW, halign: "right" },
          3: { cellWidth: rateW, halign: "right" },
          4: { cellWidth: discW, halign: "right" },
          5: { cellWidth: spDiscW, halign: "right" },
          6: { cellWidth: dis2W, halign: "right" },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const fillerIndex = rowsFromItems.length ? rowsFromItems.length - 1 : 0;
          if (data.row.index === fillerIndex) {
            data.cell.styles.minCellHeight = fillerHeight;
          }
        },
      });

      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);
      doc.text(
        `Qty: ${formattedTotalQuantity}  |  Total Amount: Rs. ${roundNetAmount(totalAmount)}`,
        innerX + innerWidth - 1.5,
        originY + challanHeight - 5,
        { align: "right" },
      );

      // Add footer branding as clickable links
      const link1 = "thekbclick.com";
      const sep = " / ";
      const link2 = "thekbcart.com";
      const brandingFontSize = 6.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(brandingFontSize);

      const w1 = doc.getTextWidth(link1);
      const wSep = doc.getTextWidth(sep);
      const w2 = doc.getTextWidth(link2);
      const totalW = w1 + wSep + w2;

      const xOffset = originX + (challanWidth - totalW) / 2;
      const yPos = originY + challanHeight - 2;

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

    const copyLabels = ["Client Copy", "Office Copy", "", ""];
    let labelIdx = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const originX = margin + c * (challanWidth + hGap);
        const originY = margin + r * (challanHeight + vGap);
        const label = copyLabels[labelIdx++];
        const isEmpty = r === 1;
        drawChallanCopy(originX, originY, label, isEmpty);
      }
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

  useSaveShortcut(handleSave);

  return (
    <div
      className="space-y-4"
      ref={challanFormRef}
      onKeyDown={handleChallanFormKeyDown}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? "Edit Challan" : "Create Challan"}
        </h1>
        <Button
          variant="outline"
          onClick={() => navigate("/transactions/challan-list")}
        >
          Back to List
        </Button>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-blue-50 rounded-lg">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party *
            </label>
            <SearchableSelect
              ref={firstFieldRef}
              value={challan.party}
              onChange={(selectedId) => {
                const selected = loadedParties.find((c) => c.id === selectedId);

                // Auto-fetch labels for the selected party
                if (selected) {
                  fetchLabelsForParty(selected);
                  // Fetch party details from backend

                  fetchPartyDetails(selectedId);
                }

                setChallan((prev) => {
                  const updatedItemDetails = { ...prev.itemDetails };
                  for (const itemId of prev.items) {
                    if (updatedItemDetails[itemId]) {
                      updatedItemDetails[itemId] = {
                        ...updatedItemDetails[itemId],
                        type: undefined,
                      };
                    }
                  }

                  return {
                    ...prev,
                    party: selectedId,
                    label_id: selected?.label_id || "",
                    gstType: Number(selected?.is_gst ?? 0) === 1 ? 1 : 0,
                    deductFromStock: true,
                    area_id: selected?.area_id || selected?.area || "",
                    transport_id: selected?.transport_id || "",
                    from_bank: selected?.bank_id || "",
                    itemDetails: updatedItemDetails,
                  };
                });

                // Immediately update party data with available info
                if (selected) {
                  console.log("📊 Initial party data:", {
                    transport_id: selected.transport_id,
                    area_id: selected.area_id,
                    bank_id: selected.bank_id,
                    transport_charge: selected.transport_charge,
                    transport: selected.transport,
                    area: selected.area,
                  });

                  setLoadedParties((prevParties) =>
                    prevParties.map((p) =>
                      p.id === selectedId ?
                        {
                          ...p,
                          // Ensure we have the latest data
                          transport_id: p.transport_id || "",
                          area_id: p.area_id || "",
                          bank_id: p.bank_id || "",
                          transport_charge: p.transport_charge || 0,
                        }
                      : p,
                    ),
                  );
                }

                setExpandedItemId(null);
                setItemHistoryMap({});
              }}
              placeholder="Select Party"
              searchPlaceholder="Search party..."
              options={loadedParties.map((contact) => ({
                value: contact.id,
                label: contact.name,
              }))}
              buttonClassName="text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label
              {challan.label_id && loadedLabelDiscounts[challan.label_id] && (
                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
                  Discounts Active
                </span>
              )}
            </label>
            <SearchableSelect
              value={challan.label_id}
              onChange={(newLabelId) => {
                setChallan((prev) => {
                  // When label changes, re-apply discounts to existing items
                  const updatedItemDetails = { ...prev.itemDetails };

                  if (newLabelId && prev.items.length > 0) {
                    console.log(
                      "🔄 Label changed, re-applying discounts to existing items",
                    );
                    // Re-apply discounts to existing items will happen in the next render cycle
                  }

                  return {
                    ...prev,
                    label_id: newLabelId,
                  };
                });
              }}
              disabled={!challan.party}
              placeholder={
                !challan.party ? "Select Party First" : "Select Label"
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
              Date
            </label>
            <div className="relative">
              <input
                type="text"
                value={toDisplayDate(challan.date) || challan.date}
                onChange={(e) => {
                  const value = normalizeDisplayDateInput(e.target.value);
                  setChallan((prev) => ({
                    ...prev,
                    date: toISODate(value) || value,
                  }));
                }}
                placeholder="dd/mm/yyyy"
                className="w-full px-3 py-2 pr-10 border rounded-md text-sm"
              />
              <button
                type="button"
                onClick={openChallanDatePicker}
                className="absolute inset-y-0 right-2 flex items-center text-gray-500 hover:text-gray-800"
                aria-label="Pick challan date"
              >
                <FaCalendarAlt />
              </button>
              <input
                ref={challanDatePickerRef}
                type="date"
                value={getNativeDateValue(challan.date)}
                onChange={(e) =>
                  setChallan((prev) => ({
                    ...prev,
                    date: e.target.value,
                  }))
                }
                className="sr-only"
                tabIndex={-1}
              />
            </div>
          </div>
          {/* Show All Fields Toggle */}
          {challan.party && (
            <div
              className="flex items-center gap-2 cursor-pointer p-2 h-10 mt-6 bg-gray-50 rounded-lg border"
              role="button"
              tabIndex={0}
              onClick={() => setShowAllFields(!showAllFields)}
              onKeyPress={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setShowAllFields(!showAllFields);
                }
              }}
            >
              <span className="text-sm font-medium text-gray-700 hover:text-gray-900">
                {showAllFields ?
                  <FaChevronUp />
                : <FaChevronDown />}
              </span>
              <span className="text-sm font-medium text-gray-700">
                Show All Fields
              </span>
            </div>
          )}
        </div>

        {/* Party Details Display */}
        {challan.party &&
          showAllFields &&
          (() => {
            const selectedParty = loadedParties.find(
              (p) => p.id === challan.party,
            );
            if (!selectedParty) return null;

            return (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg border">
                <div className="flex flex-col items-start">
                  <label className="block text-sm font-medium text-gray-700 mb-1"></label>
                  <button
                    type="button"
                    disabled
                    className={`w-14 h-7 flex items-center rounded-full p-1 transition-all duration-300 ${
                      challan.gstType === 1 ?
                        "bg-green-500 cursor-not-allowed opacity-90"
                      : "bg-gray-300 cursor-not-allowed opacity-90"
                    }`}
                    title="GST type is controlled by selected party"
                  >
                    <div
                      className={`bg-white w-5 h-5 rounded-full shadow-md transform transition-all duration-300 ${
                        challan.gstType === 1 ?
                          "translate-x-7"
                        : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Transport
                  </label>
                  <SearchableSelect
                    value={challan.transport_id || ""}
                    onChange={(transportId) => {
                      const selectedTransport = loadedTransports.find(
                        (t) => t.id === transportId,
                      );
                      setChallan((prev) => ({
                        ...prev,
                        transport_id: transportId,
                      }));
                      setLoadedParties((prev) =>
                        prev.map((p) =>
                          p.id === selectedParty.id ?
                            {
                              ...p,
                              transport_id: transportId,
                              transport: selectedTransport?.name || "",
                            }
                          : p,
                        ),
                      );
                    }}
                    placeholder="Select Transport"
                    searchPlaceholder="Search transport..."
                    options={[
                      ...loadedTransports.map((transport) => ({
                        value: transport.id,
                        label: transport.name,
                      })),
                      ...((
                        selectedParty.transport &&
                        selectedParty.transport.trim() !== "" &&
                        !loadedTransports.some(
                          (transport) =>
                            transport.name.toUpperCase() ===
                            selectedParty.transport.toUpperCase(),
                        )
                      ) ?
                        [
                          {
                            value: selectedParty.transport,
                            label: selectedParty.transport,
                          },
                        ]
                      : []),
                    ]}
                    buttonClassName="text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Area
                  </label>
                  <SearchableSelect
                    value={challan.area_id || ""}
                    onChange={(areaId) => {
                      const selectedArea = loadedAreas.find(
                        (a) => a.id === areaId,
                      );
                      setChallan((prev) => ({ ...prev, area_id: areaId }));
                      setLoadedParties((prev) =>
                        prev.map((p) =>
                          p.id === selectedParty.id ?
                            {
                              ...p,
                              area_id: areaId,
                              area: selectedArea?.name || areaId,
                            }
                          : p,
                        ),
                      );
                    }}
                    placeholder="Select Area"
                    searchPlaceholder="Search area..."
                    options={[
                      ...loadedAreas.map((area) => ({
                        value: area.id,
                        label: area.name,
                      })),
                      ...((
                        selectedParty.area &&
                        selectedParty.area.trim() !== "" &&
                        !loadedAreas.some(
                          (area) =>
                            area.name.toUpperCase() ===
                            selectedParty.area.toUpperCase(),
                        )
                      ) ?
                        [
                          {
                            value: selectedParty.area,
                            label: selectedParty.area,
                          },
                        ]
                      : []),
                    ]}
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
                    value={selectedParty.transport_charge || ""}
                    onChange={(e) => {
                      if (!isValidNumberDraft(e.target.value)) return;
                      const updatedParties = loadedParties.map((p) =>
                        p.id === selectedParty.id ?
                          { ...p, transport_charge: e.target.value }
                        : p,
                      );
                      setLoadedParties(updatedParties);
                    }}
                    onBlur={(e) => {
                      const error = validateNumberInput(e.target.value, {
                        label: "Transport Charge",
                        min: 0,
                      });
                      if (error) showToast(error, "error");
                    }}
                    className="w-full px-3 py-2 border rounded-md text-sm"
                    placeholder="Enter transport charge"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    From Bank
                  </label>
                  <SearchableSelect
                    value={challan.from_bank}
                    onChange={(from_bank) =>
                      setChallan((prev) => ({
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
              </div>
            );
          })()}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
          {/* <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              To Bank
            </label>
            <select
              value={challan.to_bank}
              onChange={(e) =>
                setChallan((prev) => ({ ...prev, to_bank: e.target.value }))
              }
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">Select Bank</option>
              {loadedBanks.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {bank.name}
                </option>
              ))}
            </select>
          </div> */}
        </div>

        <div className="border rounded-lg flex flex-col">
          <div className="bg-gray-100 px-4 py-2">
            <h3 className="font-medium text-gray-900">
              Rate Information - Add / Less
              {challan.label_id && (
                <span className="ml-2 text-xs text-green-600">
                  (Label:{" "}
                  {filteredLabels.find((l) => l.id === challan.label_id)
                    ?.name || "Unknown"}
                  )
                </span>
              )}
            </h3>
          </div>

          {/* Debug Panel - Remove this in production */}

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
                {showItemDropdown && (
                  <div className="absolute z-50 w-full mt-1 bg-white border rounded-md shadow-lg">
                    <div
                      className="max-h-64 overflow-y-auto"
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
                            loadItemsPage(itemsPage + 1);
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
                          onClick={() => handleSelectItem(item)}
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
                                  {formatItemMetric("Sale", item.sale_rate, {
                                    currency: true,
                                  })}
                                </span>
                                <span>
                                  {formatItemMetric("MRP", item.mrp_rate, {
                                    currency: true,
                                  })}
                                </span>
                                <span>
                                  {formatItemMetric("Qty", getItemStock(item))}
                                </span>
                              </span>
                            </span>
                            <span className="shrink-0 text-[11px] font-medium text-blue-700">
                              {formatItemMetric("Sale", item.sale_rate, {
                                currency: true,
                              })}
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
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-2 py-2 text-left border-r">SNo</th>
                  <th className="px-2 py-2 text-left border-r">ItemName</th>
                  <th className="px-2 py-2 text-left border-r">Remark</th>
                  <th className="px-2 py-2 text-left border-r">Type</th>
                  <th
                    className="px-2 py-2 text-left border-r hover:bg-gray-100 cursor-pointer select-none"
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
                  <th className="px-2 py-2 text-left border-r">PCS</th>
                  <th className="px-2 py-2 text-left border-r">Rate (₹)</th>
                  <th className="px-2 py-2 text-left border-r">Dis (%)</th>
                  <th className="px-2 py-2 text-left border-r">SP Dis (%)</th>
                  <th className="px-2 py-2 text-left border-r bg-yellow-100">
                    Disc Amt (₹)
                  </th>
                  <th className="px-2 py-2 text-left border-r bg-yellow-100">
                    Item Disc (%)
                    {challan.label_id && (
                      <span
                        className="text-green-600 ml-1"
                        title="Label discounts active"
                      >
                        ✓
                      </span>
                    )}
                  </th>
                  <th className="px-2 py-2 text-left border-r bg-blue-100">
                    Item Disc2 (%)
                  </th>
                  <th className="px-2 py-2 text-left border-r">GST %</th>
                  <th className="px-2 py-2 text-left border-r">GST Amt</th>
                  <th className="px-2 py-2 text-left border-r">Amount</th>
                  <th className="px-2 py-2 text-left">Action</th>
                </tr>
              </thead>
              <tbody>
                {challan.items.map((itemId, index) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = challan.itemDetails[itemId] || {};
                  const calc = calculateItemAmount(itemId);
                  const masterIsGst = Number(item?.is_gst ?? 1) === 1 ? 1 : 0;
                  const itemType = resolveEffectiveItemType(
                    details,
                    masterIsGst,
                    challan.gstType,
                  );
                  const displayItemName =
                    details.itemName || item?.name || "Unknown Item";
                  const historyOpen = expandedItemId === itemId;

                  const rowColorClass =
                    itemType === 0 ? "text-red-600" : "text-black";

                  return (
                    <Fragment key={itemId}>
                      <tr className={`border-t ${rowColorClass}`}>
                        <td className="px-2 py-2 border-r">
                          <div className="flex items-center gap-1">
                            <span>{index + 1}</span>
                            {!isBookSelected && (
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
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-2 border-r">
                          <span className="text-xs">{displayItemName}</span>
                        </td>
                        <td className="px-2 py-2 border-r">
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
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="remark"
                            className="w-32 px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
                          <input
                            type="text"
                            value={itemType}
                            readOnly
                            tabIndex={-1}
                            className="w-12 px-1 py-1 border rounded text-xs bg-gray-100 cursor-not-allowed"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={getStockColumnValue(details)}
                            className="w-16 px-1 py-1 border rounded text-xs"
                            readOnly
                            tabIndex={-1}
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "pcs",
                                itemType,
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="pcs"
                            className="w-10 px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "rate",
                                itemType,
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="rate"
                            className="w-20 px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="disPercent"
                            className="w-16 px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="spDis"
                            className="w-16 px-1 py-1 border rounded text-xs"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                              handleItemFieldKeyDown(
                                e,
                                index,
                                "dis3",
                                itemType,
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="dis3"
                            className="w-16 px-1 py-1 border rounded text-xs"
                            placeholder="0"
                            title="Discount amount"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="itemDiscount"
                            className="w-16 px-1 py-1 border rounded text-xs bg-yellow-50"
                            placeholder="0"
                            title="Manual item discount"
                          />
                        </td>
                        <td className="px-2 py-2 border-r">
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
                                masterIsGst,
                              )
                            }
                            data-item-row={index}
                            data-item-field="itemDis2"
                            className="w-16 px-1 py-1 border rounded text-xs bg-blue-50"
                            placeholder="0"
                            title="Manual item discount 2"
                          />
                        </td>
                        {itemType === 1 ?
                          <>
                            <td className="px-2 py-2 border-r">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={details.gstPercent ?? ""}
                                data-item-row={index}
                                data-item-field="gstPercent"
                                readOnly
                                tabIndex={-1}
                                className="w-16 px-1 py-1 border rounded text-xs bg-gray-100 cursor-not-allowed"
                              />
                            </td>
                            <td className="px-2 py-2 border-r">
                              <span className="text-xs font-medium text-green-600">
                                ₹{round2(calc.gstAmount)}
                              </span>
                            </td>
                          </>
                        : <>
                            <td className="px-2 py-2 border-r">
                              <span className="text-xs text-gray-400">0</span>
                            </td>
                            <td className="px-2 py-2 border-r">
                              <span className="text-xs text-gray-400">
                                ₹0.00
                              </span>
                            </td>
                          </>
                        }
                        <td className="px-2 py-2 border-r">
                          <span className="text-xs font-medium text-blue-600">
                            ₹{round2(calc.amount)}
                          </span>
                        </td>
                        <td className="px-2 py-2">
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
	                                  const currentItem = getLoadedItemByRowId(itemId);
	                                  const currentDetails =
	                                    challan.itemDetails[itemId] || {};
	                                  const currentMasterIsGst =
	                                    currentItem?.is_gst ?? 1;
	                                  const currentType =
	                                    currentMasterIsGst === 0 ? 0
	                                    : currentDetails.type !== undefined ?
	                                      currentDetails.type
	                                    : challan.gstType;
	                                  const order = getItemFieldOrder(
	                                    currentType,
	                                    currentMasterIsGst,
	                                  );
	                                  focusItemField(index, order[order.length - 1]);
	                                  return;
	                                }
	                                if (index < challan.items.length - 1) {
                                  const nextItemId = challan.items[index + 1];
                                  const nextItem =
                                    getLoadedItemByRowId(nextItemId);
                                  const nextDetails =
                                    challan.itemDetails[nextItemId] || {};
                                  const nextMasterIsGst = nextItem?.is_gst ?? 1;
                                  const nextType =
                                    nextMasterIsGst === 0 ? 0
                                    : nextDetails.type !== undefined ?
                                      nextDetails.type
                                    : challan.gstType;
                                  focusItemField(
                                    index + 1,
                                    getItemFieldOrder(
                                      nextType,
                                      nextMasterIsGst,
                                    )[0],
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
                      {/* {historyOpen && (
                        <tr className="border-t bg-gray-50">
                          <td colSpan={14} className="px-3 py-3">
                            <div className="text-xs font-medium text-gray-700 mb-2">
                              Last 4 Entries
                            </div>
                            {historyState.loading ? (
                              <div className="text-xs text-gray-500">Loading history...</div>
                            ) : historyState.error ? (
                              <div className="text-xs text-red-600">{historyState.error}</div>
                            ) : historyRows.length === 0 ? (
                              <div className="text-xs text-gray-500">No history found.</div>
                            ) : (
                              <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-white">
                                      <th className="px-2 py-1 text-left border">Date</th>
                                      <th className="px-2 py-1 text-left border">Bill No</th>
                                      <th className="px-2 py-1 text-left border">Rate</th>
                                      <th className="px-2 py-1 text-left border">Qty</th>
                                      <th className="px-2 py-1 text-left border">Amount</th>
                                      <th className="px-2 py-1 text-left border">Days</th>
                                      <th className="px-2 py-1 text-left border">Disc%</th>
                                      <th className="px-2 py-1 text-left border">Sp Disc</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {historyRows.map((row, rowIndex) => (
                                      <tr key={`${itemId}-history-${rowIndex}`} className="bg-white">
                                        <td className="px-2 py-1 border">
                                          {formatHistoryDate(row?.challan_date)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {row?.challan_no || '-'}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {Number(row?.rate || 0).toFixed(2)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {Number(row?.quantity || 0)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {Number(row?.amount || 0).toFixed(2)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {getDaysSince(row?.challan_date)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {Number(row?.discount || 0).toFixed(2)}
                                        </td>
                                        <td className="px-2 py-1 border">
                                          {Number(row?.special_discount || 0).toFixed(2)}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </td>
                        </tr>
                      )} */}
                    </Fragment>
                  );
                })}
                {challan.items.length === 0 && (
                  <tr>
                    <td
                      colSpan={14}
                      className="px-4 py-8 text-center text-gray-500"
                    >
                      No items selected. Use the search below to add items.
                    </td>
                  </tr>
                )}
                {challan.items.length > 0 && (
                  <tr className="bg-blue-50 border-t-2 border-blue-200 font-medium">
                    <td className="px-2 py-2 border-r text-xs">Total</td>
                    <td className="px-2 py-2 border-r text-xs">
                      {challan.items.length} items
                    </td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">
                      {challan.items.reduce((sum, itemId) => {
                        const details = challan.itemDetails[itemId] || {};
                        return sum + (parseFloat(details.pcs) || 1);
                      }, 0)}
                    </td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs">-</td>
                    <td className="px-2 py-2 border-r text-xs text-green-600 font-medium">
                      ₹{round2(calculateTotalGst())}
                    </td>
                    <td className="px-2 py-2 border-r text-xs text-blue-600 font-medium">
                      ₹{round2(calculateTotalAmount())}
                    </td>
                    <td className="px-2 py-2 text-xs">-</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {challan.items.length > 0 && (
          <div className="border rounded-lg bg-gray-50">
            <div className="bg-gray-100  border-b">
              {/* <span className="text-sm font-medium text-gray-700">
                Selected Items ({challan.items.length})
              </span> */}
            </div>
            <div className="">
              {/* <div className="flex flex-wrap gap-2 mb-4">
                {challan.items.map((itemId) => {
                  const item = getLoadedItemByRowId(itemId);
                  const details = challan.itemDetails[itemId] || {};
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
                        onClick={() => toggleItemSelection(itemId)}
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
                  const details = challan.itemDetails[expandedItemId] || {};
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
                                  Challan No
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
                                  Net Rate
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Disc%
                                </th>
                                <th className="px-2 py-2 text-left border">
                                  Sp Disc%
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
                                  }}
                                >
                                  <td className="px-2 py-2 border">
                                    {formatHistoryDate(row?.challan_date)}
                                  </td>
                                  <td className="px-2 py-2 border">
                                    {row?.challan_no || "-"}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Total GST:</span>
              <input
                type="text"
                inputMode="decimal"
                value={round2(calculateTotalGst())}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-green-50 cursor-not-allowed text-green-700 font-medium"
              />
            </div>
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
                value={roundNetAmount(calculateNetAmount())}
                readOnly
                className="flex-1 px-3 py-2 border rounded-md text-sm bg-gray-100 cursor-not-allowed text-gray-600"
              />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium w-32">Print Format:</span>
              <select
                value={challan.printOption}
                onChange={(e) =>
                  setChallan((prev) => ({
                    ...prev,
                    printOption: parseInt(e.target.value),
                  }))
                }
                className="flex-1 px-3 py-2 border rounded-md text-sm"
              >
                <option value={1}>Print 1 - Show Barcode</option>
                <option value={2}>Print 2 - Show Item Name</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={!challan.party || challan.items.length === 0 || isSaving}
            aria-busy={isSaving}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSaving ?
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
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
                <span>{isEditMode ? "Updating" : "Saving"} Challan...</span>
              </>
            : <>
                <FaSave />
                <span>{isEditMode ? "Update" : "Save"} Challan</span>
              </>
            }
          </Button>
          <Button
            onClick={handlePrint}
            disabled={!challan.party || challan.items.length === 0}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700"
          >
            <FaPrint />
            Print Preview
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate("/transactions/challan-list")}
          >
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ChallanForm;
