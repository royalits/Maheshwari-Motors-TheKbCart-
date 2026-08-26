/**
 * Get the selected financial year start date.
 * @returns {string} Date in YYYY-MM-DD format
 */
export const getFinancialYearStartDate = () => {
  const selectedStart = localStorage.getItem("financial_year_start");
  if (selectedStart) {
    return selectedStart.slice(0, 10);
  }

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth(); // 0-based (0 = January, 3 = April)

  // If current date is before April (months 0-2), use previous year
  // If current date is April or after (months 3-11), use current year
  const financialYear = currentMonth < 3 ? currentYear - 1 : currentYear;

  // Return in YYYY-MM-DD format for HTML date input
  return `${financialYear}-04-01`;
};

/**
 * Get today's date in YYYY-MM-DD format
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getTodayDate = () => {
  const selectedEnd = localStorage.getItem("financial_year_end");
  const today = new Date();
  if (selectedEnd) {
    const endDate = new Date(selectedEnd);
    if (!Number.isNaN(endDate.getTime()) && endDate < today) {
      return selectedEnd.slice(0, 10);
    }
  }

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export const toDisplayDate = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${day}/${month}/${year}`;
  }

  const str = String(value).trim();
  if (!str) return "";

  // Already DD/MM/YYYY
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;

  // DD-MM-YYYY -> DD/MM/YYYY
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [d, m, y] = str.split("-");
    return `${d}/${m}/${y}`;
  }

  // YYYY-MM-DD or ISO timestamp
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.slice(0, 10).split("-");
    if (y && m && d) return `${d}/${m}/${y}`;
  }

  return "";
};

export const toISODate = (value) => {
  if (!value) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const year = value.getFullYear();
    return `${year}-${month}-${day}`;
  }

  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw.slice(0, 10);

  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (!match) return "";

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year =
    yyyy.length === 2 ?
      Number(yyyy) >= 70 ?
        1900 + Number(yyyy)
      : 2000 + Number(yyyy)
    : Number(yyyy);

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return "";
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

export const normalizeDisplayDateInput = (value) => {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
};

export const getFinancialYearStartDisplayDate = () =>
  toDisplayDate(getFinancialYearStartDate());

export const getTodayDisplayDate = () => toDisplayDate(getTodayDate());
