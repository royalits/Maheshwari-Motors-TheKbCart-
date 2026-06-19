import ApiError from "./ApiError.js";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
const CIN_REGEX = /^[UL][0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/;
const AADHAAR_REGEX = /^[2-9][0-9]{11}$/;
const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_REGEX = /^[6-9][0-9]{9}$/;
const ACCOUNT_NUMBER_REGEX = /^[0-9]{9,18}$/;

const FORMAT_VALIDATORS = {
  email: { regex: EMAIL_REGEX, message: "must be a valid email address" },
  gstin: {
    regex: GSTIN_REGEX,
    message: "must be a valid 15-character GSTIN (e.g. 22AAAAA0000A1Z5)",
  },
  pan: {
    regex: PAN_REGEX,
    message: "must be a valid 10-character PAN (e.g. ABCDE1234F)",
  },
  cin: {
    regex: CIN_REGEX,
    message: "must be a valid 21-character CIN (e.g. U12345MH2000PTC123456)",
  },
  aadhaar: {
    regex: AADHAAR_REGEX,
    message: "must be a valid 12-digit Aadhaar number",
  },
  ifsc: {
    regex: IFSC_REGEX,
    message: "must be a valid IFSC code (e.g. SBIN0001234)",
  },
  phone: {
    regex: PHONE_REGEX,
    message: "must be a valid 10-digit Indian phone number",
  },
  account_number: {
    regex: ACCOUNT_NUMBER_REGEX,
    message: "must be a valid bank account number (9-18 digits)",
  },
};

function validateField(fieldName, value, rule) {
  const errors = [];
  const label = rule.label || fieldName;

  if (
    rule.required &&
    (value === undefined || value === null || value === "")
  ) {
    errors.push(`${label} is required`);
    return errors;
  }

  if (value === undefined || value === null || value === "") {
    return errors;
  }

  if (rule.type) {
    switch (rule.type) {
      case "string":
        if (typeof value !== "string") {
          errors.push(`${label} must be a string`);
          return errors;
        }
        break;

      case "number":
        if (typeof value !== "number" || isNaN(value)) {
          const parsed = Number(value);
          if (isNaN(parsed)) {
            errors.push(`${label} must be a valid number`);
            return errors;
          }
        }
        break;

      case "boolean":
        if (
          typeof value !== "boolean" &&
          value !== "true" &&
          value !== "false"
        ) {
          errors.push(`${label} must be a boolean`);
          return errors;
        }
        break;

      case "array":
        if (!Array.isArray(value)) {
          errors.push(`${label} must be an array`);
          return errors;
        }
        break;

      case "object":
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          errors.push(`${label} must be an object`);
          return errors;
        }
        break;

      case "objectId":
        if (typeof value !== "string" || !OBJECT_ID_REGEX.test(value)) {
          errors.push(`${label} must be a valid ID`);
          return errors;
        }
        break;

      case "date":
        if (isNaN(Date.parse(value))) {
          errors.push(`${label} must be a valid date`);
          return errors;
        }
        break;
    }
  }

  if (
    rule.type === "object" &&
    typeof value === "object" &&
    value !== null &&
    rule.fields
  ) {
    for (const [subField, subRule] of Object.entries(rule.fields)) {
      const subErrors = validateField(
        `${fieldName}.${subField}`,
        value[subField],
        { ...subRule, label: subRule.label || `${label} → ${subField}` },
      );
      errors.push(...subErrors);
    }
  }

  if (rule.type === "string" && typeof value === "string") {
    const trimmed = value.trim();

    if (rule.required && trimmed.length === 0) {
      errors.push(`${label} cannot be empty`);
      return errors;
    }

    if (rule.min !== undefined && trimmed.length < rule.min) {
      errors.push(`${label} must be at least ${rule.min} characters`);
    }

    if (rule.max !== undefined && trimmed.length > rule.max) {
      errors.push(`${label} must not exceed ${rule.max} characters`);
    }

    if (rule.format) {
      const validator = FORMAT_VALIDATORS[rule.format];
      if (validator && !validator.regex.test(trimmed)) {
        errors.push(`${label} ${validator.message}`);
      }
    }
  }

  if (rule.type === "number") {
    const numValue = typeof value === "number" ? value : Number(value);

    if (rule.min !== undefined && numValue < rule.min) {
      errors.push(`${label} must be at least ${rule.min}`);
    }

    if (rule.max !== undefined && numValue > rule.max) {
      errors.push(`${label} must not exceed ${rule.max}`);
    }
  }

  if (rule.enum) {
    let checkValue = value;
    if (rule.type === "number" && typeof value === "string") {
      const parsed = Number(value);
      if (!isNaN(parsed)) checkValue = parsed;
    }
    if (rule.type === "boolean" && typeof value === "string") {
      checkValue = value === "true";
    }
    if (!rule.enum.includes(checkValue)) {
      errors.push(`${label} must be one of: ${rule.enum.join(", ")}`);
    }
  }

  if (rule.type === "array" && Array.isArray(value) && rule.items) {
    if (rule.min !== undefined && value.length < rule.min) {
      errors.push(`${label} must have at least ${rule.min} item(s)`);
    }

    value.forEach((item, index) => {
      if (typeof item === "object" && item !== null) {
        const itemErrors = validateObject(item, rule.items);
        itemErrors.forEach((err) => {
          errors.push(`${label}[${index}].${err}`);
        });
      }
    });
  }

  if (
    rule.type === "array" &&
    Array.isArray(value) &&
    rule.arrayType === "objectId"
  ) {
    value.forEach((item, index) => {
      if (typeof item !== "string" || !OBJECT_ID_REGEX.test(item)) {
        errors.push(`${label}[${index}] must be a valid ID`);
      }
    });
  }

  return errors;
}

function validateObject(data, schema) {
  const errors = [];

  for (const [fieldName, rule] of Object.entries(schema)) {
    const fieldErrors = validateField(fieldName, data[fieldName], rule);
    errors.push(...fieldErrors);
  }

  return errors;
}

function extractFields(data, schema) {
  const sanitized = {};

  for (const [fieldName, rule] of Object.entries(schema)) {
    let value = data[fieldName];

    if (
      (value === undefined || value === null || value === "") &&
      rule.default !== undefined
    ) {
      sanitized[fieldName] = rule.default;
      continue;
    }

    if (value === undefined || value === null) {
      continue;
    }

    if (rule.type === "number" && typeof value === "string") {
      const parsed = Number(value);
      if (!isNaN(parsed)) value = parsed;
    }

    if (rule.type === "boolean" && typeof value === "string") {
      value = value === "true";
    }

    if (typeof value === "string") {
      value = value.trim();
      if (value === "" && !rule.required) continue;
    }

    if (
      rule.type === "object" &&
      typeof value === "object" &&
      value !== null &&
      rule.fields
    ) {
      value = extractFields(value, rule.fields);
    }

    sanitized[fieldName] = value;
  }

  return sanitized;
}

function makePartial(schema) {
  const partial = {};
  for (const [key, rule] of Object.entries(schema)) {
    const copy = { ...rule, required: false };
    if (copy.fields) {
      copy.fields = makePartial(copy.fields);
    }
    partial[key] = copy;
  }
  return partial;
}

export function validate(body, schema, options = {}) {
  if (!body || typeof body !== "object") {
    throw ApiError.badRequest("Request body is required");
  }

  let effectiveSchema = schema;
  if (options.allowPartial) {
    effectiveSchema = makePartial(schema);

    const hasAnyField = Object.keys(schema).some(
      (key) =>
        body[key] !== undefined && body[key] !== null && body[key] !== "",
    );
    if (!hasAnyField) {
      throw ApiError.badRequest(
        "At least one field must be provided for update",
      );
    }
  }

  const errors = validateObject(body, effectiveSchema);

  if (errors.length > 0) {
    throw ApiError.badRequest("Validation failed", errors);
  }

  return extractFields(body, effectiveSchema);
}

export default validate;
