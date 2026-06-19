const getUsageMetadata = (scanResult) =>
  scanResult?.usageMetadata || scanResult?.usage_metadata || {};

const buildBillScanMetrics = (scanResult) => {
  const usageMetadata = getUsageMetadata(scanResult);
  const items = Array.isArray(scanResult?.items) ? scanResult.items : [];
  const warnings = Array.isArray(scanResult?.warnings)
    ? scanResult.warnings
    : [];

  return {
    model: scanResult?.model || null,
    pageCount: Number(scanResult?.page_count || 0),
    confidenceScore: Number(scanResult?.confidence || 0),
    extractedItemCount: items.length,
    matchedItemCount: Number(scanResult?.matched_item_count || 0),
    createdItemCount: Number(scanResult?.created_item_count || 0),
    warningCount: warnings.length,
    ...usageMetadata,
  };
};

export const logBillScanDiagnostics = (scanResult) => {
  console.log("Bill scan result", scanResult);
  console.log("Bill scan metrics", buildBillScanMetrics(scanResult));
  console.log("Bill scan confidence score", scanResult?.confidence ?? 0);
  console.log("Bill scan model usage", getUsageMetadata(scanResult));
};
