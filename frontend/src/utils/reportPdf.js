import useStore from "../store";

const toText = (value, fallback = "") => {
  if (value === null || value === undefined) return fallback;
  const text = String(value).trim();
  return text || fallback;
};

const isDefaultFirmName = (value) =>
  String(value || "").trim().toLowerCase() === "the kbcart";

const normalizeFirmType = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[-\s]/g, "_");

const getStoredFirmType = () => {
  try {
    return localStorage.getItem("firm_type");
  } catch {
    return "";
  }
};

const getActiveProfileFirm = (user, selectedFirm) => {
  const rawType =
    selectedFirm?.firm_type ||
    selectedFirm?.type ||
    user?.current_firm_type ||
    user?.firm_data?.firm_type ||
    getStoredFirmType();
  const activeType = normalizeFirmType(rawType);
  const numericType = Number(rawType);

  if (activeType === "GST" || activeType === "1" || numericType === 1) {
    return user?.gst_firm || {};
  }
  if (
    activeType === "NON_GST" ||
    activeType === "NONGST" ||
    activeType === "0" ||
    numericType === 0
  ) {
    return user?.nongst_firm || {};
  }

  return user?.gst_firm || user?.nongst_firm || {};
};

export const getResolvedFirmMeta = () => {
  const { selectedFirm, user } = useStore.getState();
  const profileFirm = getActiveProfileFirm(user, selectedFirm);
  const firmData = user?.firm_data || {};

  const pickFirstFilled = (...values) => {
    for (const value of values) {
      if (value === null || value === undefined) continue;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (isDefaultFirmName(trimmed)) continue;
        if (trimmed) return trimmed;
        continue;
      }
      return value;
    }
    return "";
  };

  const mergedFirm = {
    ...selectedFirm,
    ...firmData,
    ...profileFirm,  // profileFirm (from /auth/me) has highest priority
  };

  const firmName = toText(
    pickFirstFilled(
      mergedFirm?.name,
      mergedFirm?.firm_name,
      firmData?.username,
      firmData?.credential_key,
      user?.username,
      user?.name,
      user?.email,
    ),
    "Firm",
  );
  const address = toText(
    pickFirstFilled(mergedFirm?.address, mergedFirm?.godown_address),
    "",
  );
  const city = toText(pickFirstFilled(mergedFirm?.city), "");
  const state = toText(pickFirstFilled(mergedFirm?.state), "");
  const phone = toText(
    pickFirstFilled(
      mergedFirm?.phone,
      mergedFirm?.mobile,
      mergedFirm?.contact,
      mergedFirm?.phone_number,
      mergedFirm?.mobile_number,
    ),
    "",
  );
  const email = toText(pickFirstFilled(mergedFirm?.email), "");
  const gstin = toText(
    pickFirstFilled(mergedFirm?.GSTIN, mergedFirm?.gstin, mergedFirm?.gst),
    "",
  );

  return {
    firmName,
    address,
    city,
    state,
    phone,
    email,
    gstin,
    raw: mergedFirm,
  };
};

export const getFirmReportMeta = () => {
  const resolvedFirm = getResolvedFirmMeta();
  const generatedAt = new Date().toLocaleString("en-IN");

  return {
    ...resolvedFirm,
    generatedAt,
  };
};

export const drawBrandedReportHeader = (doc, options = {}) => {
  const meta = options.meta || getFirmReportMeta();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = options.marginLeft ?? 14;
  const marginRight = options.marginRight ?? 14;
  const usableWidth = pageWidth - marginLeft - marginRight;
  const title = toText(options.title, "REPORT");
  const subtitle = toText(options.subtitle, "");
  const topY = options.topY ?? 10;
  const borderGray = [107, 114, 128];
  const lightBorderGray = [209, 213, 219];
  const fillGray = [249, 250, 251];
  const addressLines = meta.address
    ? doc.splitTextToSize(meta.address, usableWidth - 12)
    : [];
  const contactBits = [
    meta.phone ? `Ph: ${meta.phone}` : "",
    meta.email ? `Email: ${meta.email}` : "",
    meta.gstin ? `GSTIN: ${meta.gstin}` : "",
  ].filter(Boolean);
  const contactLineCount = contactBits.length ? 1 : 0;
  const infoHeight = Math.max(24, 13 + addressLines.length * 4 + contactLineCount * 4.5);
  const titleTopY = topY + infoHeight + 4;

  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.rect(marginLeft, topY, usableWidth, infoHeight + 18);
  doc.setFillColor(...fillGray);
  doc.rect(marginLeft, topY, usableWidth, infoHeight, "F");
  doc.setDrawColor(...lightBorderGray);
  doc.line(marginLeft, topY + infoHeight, pageWidth - marginRight, topY + infoHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text(meta.firmName.toUpperCase(), pageWidth / 2, topY + 6.5, {
    align: "center",
  });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  if (addressLines.length) {
    doc.text(addressLines, pageWidth / 2, topY + 11.8, {
      align: "center",
    });
  }
  if (contactBits.length) {
    doc.setFontSize(8);
    doc.text(contactBits.join("  |  "), pageWidth / 2, topY + 11.8 + addressLines.length * 4.2, {
      align: "center",
    });
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(0, 0, 0);
  doc.text(title, pageWidth / 2, titleTopY + 5.5, { align: "center" });

  if (subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text(doc.splitTextToSize(subtitle, usableWidth - 8), pageWidth / 2, titleTopY + 10.5, {
      align: "center",
    });
  }

  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.35);
  doc.line(marginLeft + 1.5, topY + infoHeight + 17, pageWidth - marginRight - 1.5, topY + infoHeight + 17);

  return topY + infoHeight + 23;
};

export const addBrandedReportFooters = (doc, options = {}) => {
  const meta = options.meta || getFirmReportMeta();
  const marginLeft = options.marginLeft ?? 14;
  const marginRight = options.marginRight ?? 14;
  const pageCount = doc.internal.getNumberOfPages();

  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    doc.setDrawColor(229, 231, 235);
    doc.line(marginLeft, pageHeight - 12, pageWidth - marginRight, pageHeight - 12);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`${meta.firmName} | Generated: ${meta.generatedAt}`, marginLeft, pageHeight - 7);
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - marginRight, pageHeight - 7, {
      align: "right",
    });
  }
};

export const inferReportTitleFromFileName = (fileName = "report.pdf") =>
  toText(fileName.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim(), "Report");
