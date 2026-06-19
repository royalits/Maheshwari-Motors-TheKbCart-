import mongoose from "mongoose";

/**
 * Converts query parameters that end with _id to valid MongoDB ObjectIds
 * This prevents CastError when filtering by ObjectId fields with string parameters
 * 
 * @param {Object} query - Query object to convert
 * @returns {Object} - Query object with converted ObjectId fields
 */
export const convertQueryParamIds = (query) => {
  if (!query || typeof query !== "object") {
    return query;
  }

  const converted = { ...query };

  for (const [key, value] of Object.entries(converted)) {
    // Skip null, undefined, empty strings
    if (value === null || value === undefined || value === "") {
      continue;
    }

    // Convert fields ending with _id
    if (key.endsWith("_id")) {
      const stringValue = String(value).trim();

      // Check if it's a valid 24-char hex ObjectId
      if (/^[a-f0-9]{24}$/i.test(stringValue)) {
        try {
          converted[key] = new mongoose.Types.ObjectId(stringValue);
        } catch (err) {
          // If conversion fails, keep original value
          console.warn(`Failed to convert ${key}: ${stringValue}`, err.message);
        }
      }
      // If not a valid ObjectId format, leave as-is (will cause CastError which is expected)
    }
  }

  return converted;
};

/**
 * Converts an array of _id-like fields to ObjectIds
 * @param {Object} obj - Object containing fields to convert
 * @param {Array<string>} fieldNames - Names of fields to convert
 * @returns {Object} - Object with converted fields
 */
export const convertSpecificFieldIds = (obj, fieldNames = []) => {
  if (!obj || typeof obj !== "object" || !Array.isArray(fieldNames)) {
    return obj;
  }

  const converted = { ...obj };

  for (const fieldName of fieldNames) {
    const value = converted[fieldName];

    if (value === null || value === undefined || value === "") {
      continue;
    }

    const stringValue = String(value).trim();

    if (/^[a-f0-9]{24}$/i.test(stringValue)) {
      try {
        converted[fieldName] = new mongoose.Types.ObjectId(stringValue);
      } catch (err) {
        console.warn(`Failed to convert ${fieldName}: ${stringValue}`, err.message);
      }
    }
  }

  return converted;
};

export default convertQueryParamIds;
