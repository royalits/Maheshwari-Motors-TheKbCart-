import ApiError from "./ApiError.js";

export function toNumber(
  value,
  fieldLabel,
  { allowNegative = false, min, max } = {},
) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    throw ApiError.badRequest(`${fieldLabel} must be a valid number`);
  }

  if (!allowNegative && numeric < 0) {
    throw ApiError.badRequest(`${fieldLabel} must be a non-negative number`);
  }

  if (min !== undefined && numeric < min) {
    throw ApiError.badRequest(`${fieldLabel} must be at least ${min}`);
  }

  if (max !== undefined && numeric > max) {
    throw ApiError.badRequest(`${fieldLabel} must be at most ${max}`);
  }

  return numeric;
}

export function toNumberIfDefined(value, fieldLabel, options = {}) {
  if (value === undefined || value === null) return undefined;
  return toNumber(value, fieldLabel, options);
}

export default toNumber;
