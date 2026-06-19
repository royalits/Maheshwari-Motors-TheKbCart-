import cron from "node-cron";
import Item from "../models/master/item.model.js";
import FinancialYearClose from "../models/common/financial_year_close.model.js";
import Bill from "../models/transaction/bill.model.js";
import Challan from "../models/transaction/challan.model.js";

const OLD_DATA_SUFFIX = " (O)";

const markAsOldLabel = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return text;
  if (text.endsWith(OLD_DATA_SUFFIX)) return text;
  return `${text}${OLD_DATA_SUFFIX}`;
};

const hasDueBalance = (bill = {}) => {
  const amount = Number(bill.amount || 0);
  const paid = Number(bill.paid_amount || 0);
  const balance = amount - paid;
  return bill.payment_status === "due" || balance > 0;
};

async function cleanupNonGstFinancialDataForClose() {
  const nonGstBills = await Bill.find({ is_gst: 0 })
    .select("_id bill_no payment_status amount paid_amount challan_ids")
    .lean();

  if (!nonGstBills.length) {
    return {
      preserved_due_bills: 0,
      marked_old_due_bills: 0,
      marked_old_due_challans: 0,
      deleted_settled_bills: 0,
    };
  }

  const dueBills = [];
  const settledBillIds = [];
  for (const bill of nonGstBills) {
    if (hasDueBalance(bill)) dueBills.push(bill);
    else settledBillIds.push(bill._id);
  }

  let markedOldDueBills = 0;
  if (dueBills.length) {
    const billOps = dueBills
      .filter((bill) => !String(bill.bill_no || "").endsWith(OLD_DATA_SUFFIX))
      .map((bill) => ({
        updateOne: {
          filter: { _id: bill._id, is_gst: 0 },
          update: { $set: { bill_no: markAsOldLabel(bill.bill_no) } },
        },
      }));

    if (billOps.length) {
      const writeRes = await Bill.bulkWrite(billOps, { ordered: false });
      markedOldDueBills = Number(writeRes?.modifiedCount || 0);
    }
  }

  let markedOldDueChallans = 0;
  const dueBillIds = dueBills.map((bill) => bill._id).filter(Boolean);
  const dueChallanIdsFromBills = dueBills
    .flatMap((bill) => bill.challan_ids || [])
    .filter(Boolean);

  const dueChallanOrFilters = [];
  if (dueChallanIdsFromBills.length) {
    dueChallanOrFilters.push({ _id: { $in: dueChallanIdsFromBills } });
  }
  if (dueBillIds.length) {
    dueChallanOrFilters.push({ bill_id: { $in: dueBillIds } });
  }

  if (dueChallanOrFilters.length) {
    const dueChallans = await Challan.find({
      is_gst: 0,
      $or: dueChallanOrFilters,
    })
      .select("_id challan_no")
      .lean();

    const challanOps = dueChallans
      .filter(
        (challan) =>
          !String(challan.challan_no || "").endsWith(OLD_DATA_SUFFIX),
      )
      .map((challan) => ({
        updateOne: {
          filter: { _id: challan._id, is_gst: 0 },
          update: { $set: { challan_no: markAsOldLabel(challan.challan_no) } },
        },
      }));

    if (challanOps.length) {
      const writeRes = await Challan.bulkWrite(challanOps, { ordered: false });
      markedOldDueChallans = Number(writeRes?.modifiedCount || 0);
    }
  }

  let deletedSettledBills = 0;
  if (settledBillIds.length) {
    const deleteRes = await Bill.deleteMany({
      _id: { $in: settledBillIds },
      is_gst: 0,
    });
    deletedSettledBills = Number(deleteRes?.deletedCount || 0);
  }

  return {
    preserved_due_bills: dueBills.length,
    marked_old_due_bills: markedOldDueBills,
    marked_old_due_challans: markedOldDueChallans,
    deleted_settled_bills: deletedSettledBills,
  };
}

const getTargetFinancialYearStart = (date, { force = false } = {}) => {
  const now = new Date(date);
  if (Number.isNaN(now.getTime())) return null;
  if (now.getMonth() < 3 && !force) return null;
  return now.getFullYear();
};

export async function runFinancialYearCloseIfDue(
  currentDate = new Date(),
  { force = false } = {},
) {
  const fyStart = getTargetFinancialYearStart(currentDate, { force });
  if (!fyStart) {
    return { skipped: true, reason: "before_april_1_window", force };
  }

  const existingClose = await FinancialYearClose.findOne({
    financial_year_start: fyStart,
  })
    .select("_id")
    .lean();

  if (existingClose) {
    return {
      skipped: true,
      reason: "already_closed",
      financial_year_start: fyStart,
      force,
    };
  }

  const closeDate = new Date(currentDate);
  const fallbackToLegacyStockForGst = {
    $and: [
      { $eq: [{ $ifNull: ["$physical_stock", 0] }, 0] },
      { $eq: [{ $ifNull: ["$logical_stock", 0] }, 0] },
      { $ne: [{ $ifNull: ["$stock", 0] }, 0] },
      { $eq: [{ $ifNull: ["$is_gst", 1] }, 1] },
    ],
  };
  const fallbackToLegacyStockForNonGst = {
    $and: [
      { $eq: [{ $ifNull: ["$physical_stock", 0] }, 0] },
      { $eq: [{ $ifNull: ["$logical_stock", 0] }, 0] },
      { $ne: [{ $ifNull: ["$stock", 0] }, 0] },
      { $eq: [{ $ifNull: ["$is_gst", 1] }, 0] },
    ],
  };
  const sourceAvailability = await Item.aggregate([
    {
      $group: {
        _id: null,
        source_items: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $ne: [{ $ifNull: ["$physical_stock", 0] }, 0] },
                  { $ne: [{ $ifNull: ["$logical_stock", 0] }, 0] },
                  fallbackToLegacyStockForGst,
                  fallbackToLegacyStockForNonGst,
                ],
              },
              1,
              0,
            ],
          },
        },
        opening_items: {
          $sum: {
            $cond: [
              {
                $or: [
                  { $ne: [{ $ifNull: ["$opening_physical_stock", 0] }, 0] },
                  { $ne: [{ $ifNull: ["$opening_logical_stock", 0] }, 0] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const sourceItems = sourceAvailability?.[0]?.source_items || 0;
  const openingItems = sourceAvailability?.[0]?.opening_items || 0;
  if (sourceItems === 0 && openingItems > 0) {
    return {
      skipped: true,
      reason: "source_stock_empty_opening_present",
      financial_year_start: fyStart,
      force,
    };
  }

  if (sourceItems === 0) {
    return {
      skipped: true,
      reason: "source_stock_empty",
      financial_year_start: fyStart,
      force,
    };
  }

  const updateResult = await Item.updateMany(
    {},
    [
      {
        $set: {
          // Direct transfer only. Legacy fallback:
          // if old data only had `stock` populated, map it to the right opening bucket by item type.
          opening_physical_stock: {
            $cond: [
              fallbackToLegacyStockForGst,
              { $ifNull: ["$stock", 0] },
              { $ifNull: ["$physical_stock", 0] },
            ],
          },
          opening_logical_stock: {
            $cond: [
              fallbackToLegacyStockForNonGst,
              { $ifNull: ["$stock", 0] },
              { $ifNull: ["$logical_stock", 0] },
            ],
          },
        },
      },
      {
        $set: {
          physical_stock: 0,
          logical_stock: 0,
          stock: "$opening_physical_stock",
        },
      },
    ],
    { updatePipeline: true },
  );

  const nonGstCleanup = await cleanupNonGstFinancialDataForClose();

  await FinancialYearClose.create({
    financial_year_start: fyStart,
    financial_year_end: fyStart + 1,
    closed_at: closeDate,
    matched_items: updateResult?.matchedCount || 0,
    modified_items: updateResult?.modifiedCount || 0,
    non_gst_due_bills_preserved: nonGstCleanup.preserved_due_bills,
    non_gst_due_bills_marked_old: nonGstCleanup.marked_old_due_bills,
    non_gst_due_challans_marked_old: nonGstCleanup.marked_old_due_challans,
    non_gst_settled_bills_deleted: nonGstCleanup.deleted_settled_bills,
  });

  return {
    skipped: false,
    financial_year_start: fyStart,
    financial_year_end: fyStart + 1,
    matched_items: updateResult?.matchedCount || 0,
    modified_items: updateResult?.modifiedCount || 0,
    non_gst_cleanup: nonGstCleanup,
    force,
  };
}

export function startFinancialYearCloseCron() {
  cron.schedule(
    "5 0 * * *",
    async () => {
      const tag = "[FinancialYearCloseCron]";
      try {
        const result = await runFinancialYearCloseIfDue(new Date());

        if (result.skipped) {
          console.log(`${tag} Skipped: ${result.reason}`);
          return;
        }

        console.log(
          `${tag} Closed FY ${result.financial_year_start}-${String(
            result.financial_year_end,
          ).slice(-2)}. Matched items: ${result.matched_items}, Modified items: ${result.modified_items}`,
        );
      } catch (error) {
        console.error(`${tag} Failed:`, error.message || error);
      }
    },
    {
      timezone: "Asia/Kolkata",
    },
  );
}
