import cron from "node-cron";
import AutoBill from "../models/transaction/auto_bill.model.js";
import Challan from "../models/transaction/challan.model.js";
import Bill from "../models/transaction/bill.model.js";
import Contact from "../models/master/contact.model.js";
import Item from "../models/master/item.model.js";
import stockService from "../services/inventory/stock.service.js";
import financialYearService from "../services/common/financialYear.service.js";
import { getNextId } from "../helpers/counter.js";
import { emitChallanUpdate } from "../services/realtime/socket.service.js";
import billService from "../services/transaction/bill.service.js";

const isRuleEnabled = (rule) => {
  if (rule?.enabled !== undefined) return !!rule.enabled;
  if (rule?.is_active !== undefined) return !!rule.is_active;
  return true;
};

const MAX_DP_TARGET_PAISE = 2000000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((Number(value || 0) + Number.EPSILON) * factor) / factor;
};

const normalizeIsGst = (value) => {
  const num = Number(value);
  if (num === 1) return 1;
  if (num === 0) return 0;
  return null;
};

const resolvePreferredRuleFirmType = (rule, contact, availableItems = []) => {
  const ruleIsGst = normalizeIsGst(
    rule?.is_gst ?? rule?.gst_type ?? rule?.firm_type,
  );
  if (ruleIsGst !== null) return ruleIsGst;

  const contactIsGst = normalizeIsGst(contact?.is_gst);
  if (contactIsGst !== null) return contactIsGst;

  let gstCount = 0;
  let nonGstCount = 0;
  for (const item of availableItems) {
    const itemType = normalizeIsGst(item?.is_gst);
    if (itemType === 1) gstCount++;
    if (itemType === 0) nonGstCount++;
  }

  if (gstCount === 0 && nonGstCount === 0) return 1;
  if (gstCount === nonGstCount) return 1;
  return gstCount > nonGstCount ? 1 : 0;
};

const toPaise = (value) => Math.max(0, Math.round(Number(value || 0) * 100));

const getIstDateKey = (rawDate) => {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;

  const istMs = date.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, "0")}-${String(istDate.getUTCDate()).padStart(2, "0")}`;
};

const getIstDayBounds = (rawDate) => {
  const key = getIstDateKey(rawDate);
  if (!key) return null;

  const [year, month, day] = key.split("-").map((value) => Number(value));
  const startUtc = new Date(
    Date.UTC(year, month - 1, day, 0, 0, 0, 0) - IST_OFFSET_MS,
  );
  const endUtcExclusive = new Date(startUtc.getTime() + DAY_MS);

  return { key, startUtc, endUtcExclusive };
};

const hasOwn = (obj, key) =>
  Object.prototype.hasOwnProperty.call(obj || {}, key);

const captureBillingSnapshot = (ruleDoc) => ({
  hasLastBilledOn: hasOwn(ruleDoc, "last_billed_on"),
  hasLastBillGeneratedOn: hasOwn(ruleDoc, "last_bill_generated_on"),
  hasLastBilledDateKey: hasOwn(ruleDoc, "last_billed_date_key"),
  last_billed_on: ruleDoc?.last_billed_on ?? null,
  last_bill_generated_on: ruleDoc?.last_bill_generated_on ?? null,
  last_billed_date_key: ruleDoc?.last_billed_date_key ?? null,
});

const buildBillingSnapshotRestoreUpdate = (snapshot) => {
  if (!snapshot) return null;

  const $set = {};
  const $unset = {};

  if (snapshot.hasLastBilledOn) $set.last_billed_on = snapshot.last_billed_on;
  else $unset.last_billed_on = "";

  if (snapshot.hasLastBillGeneratedOn) {
    $set.last_bill_generated_on = snapshot.last_bill_generated_on;
  } else {
    $unset.last_bill_generated_on = "";
  }

  if (snapshot.hasLastBilledDateKey) {
    $set.last_billed_date_key = snapshot.last_billed_date_key;
  } else {
    $unset.last_billed_date_key = "";
  }

  const update = {};
  if (Object.keys($set).length) update.$set = $set;
  if (Object.keys($unset).length) update.$unset = $unset;
  return update;
};

const normalizeLine = (line) => ({
  item_id: line.item_id,
  quantity: round(line.quantity, 3),
  rate: round(line.rate),
  discount: round(line.discount),
  special_discount: round(line.special_discount),
  gross_amount: round(line.gross_amount),
  discount_amount: round(line.discount_amount),
  total_discount: round(line.total_discount),
  taxable_amount: round(line.taxable_amount),
  gst_percent: round(line.gst_percent),
  gst_amount: round(line.gst_amount),
  amount: round(line.amount),
  is_gst: Number(line.is_gst) === 1 ? 1 : 0,
});

const sumLineField = (items, field) =>
  round(items.reduce((sum, line) => sum + Number(line?.[field] || 0), 0));

const buildChallanTotals = (items) => {
  const normalizedItems = (items || [])
    .map((line) => normalizeLine(line))
    .filter((line) => Number(line.amount) > 0);

  const grossTotal = sumLineField(normalizedItems, "gross_amount");
  const subTotal = sumLineField(normalizedItems, "amount");

  return {
    items: normalizedItems,
    gross_total: grossTotal,
    sub_total: subTotal,
    discount: 0,
    amount: subTotal,
  };
};

const getBrandEligibleItemIds = async (challans, brandIds) => {
  if (!brandIds || !brandIds.length || !challans.length) return new Set();

  const itemIds = new Set();
  for (const challan of challans) {
    for (const item of challan.items || []) {
      if (item?.item_id) itemIds.add(String(item.item_id));
    }
  }

  if (!itemIds.size) return new Set();

  return new Set(
    (
      await Item.find({
        _id: { $in: Array.from(itemIds) },
        brand_id: { $in: brandIds },
      })
        .select("_id")
        .lean()
    ).map((item) => String(item._id)),
  );
};

const initializeSourceMap = (challans = []) =>
  new Map(
    challans.map((challan) => [
      String(challan._id),
      {
        ...challan,
        items: (challan.items || [])
          .map((line) => normalizeLine(line))
          .filter((line) => Number(line.amount || 0) > 0),
      },
    ]),
  );

const listAvailableLines = (sourceMap, options = {}) => {
  const allowedItemIds =
    options?.allowedItemIds instanceof Set ? options.allowedItemIds : null;

  const lines = [];
  for (const [, challan] of sourceMap) {
    for (
      let lineIndex = 0;
      lineIndex < (challan.items || []).length;
      lineIndex++
    ) {
      const line = challan.items[lineIndex];
      const amount = Number(line?.amount || 0);
      if (amount <= 0) continue;
      if (
        allowedItemIds &&
        allowedItemIds.size > 0 &&
        !allowedItemIds.has(String(line?.item_id || ""))
      ) {
        continue;
      }

      lines.push({
        challanId: String(challan._id),
        lineIndex,
        amount,
        paise: toPaise(amount),
        item: line,
      });
    }
  }
  return lines;
};

const findBestLineIndexesForTarget = (lines, targetAmount) => {
  const targetPaise = toPaise(targetAmount);
  if (targetPaise <= 0 || !lines.length) return [];

  const candidates = lines
    .map((line, idx) => ({ idx, paise: line.paise }))
    .filter((entry) => entry.paise > 0 && entry.paise <= targetPaise);

  if (!candidates.length) return [];

  if (targetPaise <= MAX_DP_TARGET_PAISE) {
    const reachable = new Uint8Array(targetPaise + 1);
    const prevSum = new Int32Array(targetPaise + 1);
    const prevCandidate = new Int32Array(targetPaise + 1);
    prevSum.fill(-1);
    prevCandidate.fill(-1);
    reachable[0] = 1;

    for (
      let candidateIndex = 0;
      candidateIndex < candidates.length;
      candidateIndex++
    ) {
      const value = candidates[candidateIndex].paise;
      for (let sum = targetPaise; sum >= value; sum--) {
        if (reachable[sum] || !reachable[sum - value]) continue;
        reachable[sum] = 1;
        prevSum[sum] = sum - value;
        prevCandidate[sum] = candidateIndex;
      }
    }

    let best = targetPaise;
    while (best > 0 && !reachable[best]) best--;
    if (best <= 0) return [];

    const selected = [];
    while (best > 0) {
      const candidateIndex = prevCandidate[best];
      if (candidateIndex < 0) break;
      selected.push(candidates[candidateIndex].idx);
      best = prevSum[best];
    }

    return selected.reverse();
  }

  const selected = [];
  let remaining = targetPaise;
  for (let idx = 0; idx < lines.length; idx++) {
    const value = lines[idx].paise;
    if (value <= 0 || value > remaining) continue;
    selected.push(idx);
    remaining -= value;
    if (remaining === 0) break;
  }

  return selected;
};

const consumeGroupAmount = (sourceMap, targetAmount, options = {}) => {
  const availableLines = listAvailableLines(sourceMap, options);
  if (!availableLines.length) {
    return {
      consumedItems: [],
      consumedTotal: 0,
      touchedChallans: new Set(),
    };
  }

  const totalAvailable = round(
    availableLines.reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );

  let selectedIndexes = [];
  if (totalAvailable <= targetAmount + 0.009) {
    selectedIndexes = availableLines.map((_, idx) => idx);
  } else {
    selectedIndexes = findBestLineIndexesForTarget(
      availableLines,
      targetAmount,
    );
    if (!selectedIndexes.length) {
      selectedIndexes = [0];
    }
  }

  const selectedSet = new Set(selectedIndexes);
  const consumedItems = selectedIndexes
    .map((idx) => {
      const selectedLine = availableLines[idx];
      if (!selectedLine?.item) return null;

      return {
        ...normalizeLine(selectedLine.item),
        source_challan_id: selectedLine.challanId,
      };
    })
    .filter(Boolean);

  const consumedTotal = round(
    consumedItems.reduce((sum, line) => sum + Number(line.amount || 0), 0),
  );

  const touchedChallans = new Set();
  for (let idx = 0; idx < availableLines.length; idx++) {
    if (!selectedSet.has(idx)) continue;
    const line = availableLines[idx];
    touchedChallans.add(String(line.challanId));
  }

  for (const challanId of touchedChallans) {
    const challan = sourceMap.get(challanId);
    if (!challan) continue;

    challan.items = (challan.items || []).filter((line, lineIndex) => {
      for (const selectedIdx of selectedSet) {
        const selectedLine = availableLines[selectedIdx];
        if (
          selectedLine &&
          selectedLine.challanId === challanId &&
          selectedLine.lineIndex === lineIndex
        ) {
          return false;
        }
      }
      return true;
    });
  }

  return {
    consumedItems,
    consumedTotal,
    touchedChallans,
  };
};

const updateSourceChallansAfterConsumption = async ({
  sourceMap,
  touchedChallans,
  billId,
}) => {
  if (!touchedChallans.size) return;

  const bulkOps = [];

  for (const challanId of touchedChallans) {
    const mutated = sourceMap.get(challanId);
    if (!mutated) continue;

    const totals = buildChallanTotals(mutated.items || []);
    if (!totals.items.length) {
      bulkOps.push({
        updateOne: {
          filter: { _id: mutated._id },
          update: {
            $set: {
              items: [],
              gross_total: 0,
              sub_total: 0,
              amount: 0,
              converted_to_bill: true,
              bill_id: billId,
            },
          },
        },
      });
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: mutated._id },
        update: {
          $set: {
            items: totals.items,
            gross_total: totals.gross_total,
            sub_total: totals.sub_total,
            amount: totals.amount,
            converted_to_bill: false,
            bill_id: null,
          },
        },
      },
    });
  }

  if (bulkOps.length) {
    await Challan.bulkWrite(bulkOps, { ordered: false });

    const changedByUser = new Map();
    for (const challanId of touchedChallans) {
      const mutated = sourceMap.get(challanId);
      if (!mutated?.user_id) continue;
      const userId = String(mutated.user_id);
      if (!changedByUser.has(userId)) changedByUser.set(userId, []);
      changedByUser.get(userId).push(mutated);
    }

    for (const [userId, challans] of changedByUser.entries()) {
      emitChallanUpdate(userId, "converted", challans);
    }
  }
};

export async function runAutoBillNow(currentDate = new Date(), options = {}) {
  const now = new Date(currentDate);
  const dayBounds = getIstDayBounds(now);
  const todayKey = dayBounds?.key || getIstDateKey(now);
  const activeRangeStart = dayBounds?.startUtc || now;
  const activeRangeEndExclusive = dayBounds?.endUtcExclusive || now;
  const ruleIdFilter =
    typeof options?.ruleId === "string" && options.ruleId.trim() ?
      options.ruleId.trim()
    : null;

  const rulesQuery = {
    from_date: { $lt: activeRangeEndExclusive },
    to_date: { $gte: activeRangeStart },
    $or: [{ enabled: true }, { enabled: { $exists: false } }],
  };

  if (ruleIdFilter) {
    rulesQuery._id = ruleIdFilter;
  }

  const rules = await AutoBill.find(rulesQuery).lean();

  let billsCreated = 0;
  let rulesSkipped = 0;
  let rulesChecked = rules.length;

  for (const rule of rules) {
    console.log(`Processing rule ${rule._id} for party ${rule.party_id}`);

    const perDayBillCount = Number(rule.per_day_bill) || 0;
    const lastBilledDateKey = rule.last_billed_date_key || null;
    const billsCreatedToday = Number(rule.bills_created_today) || 0;

    const isNewDay = !lastBilledDateKey || lastBilledDateKey !== todayKey;

    if (isNewDay && perDayBillCount > 0) {
      await AutoBill.findByIdAndUpdate(rule._id, {
        bills_created_today: 0,
        last_billed_date_key: todayKey,
      });
    }

    if (
      perDayBillCount > 0 &&
      !isNewDay &&
      billsCreatedToday >= perDayBillCount
    ) {
      console.log(
        `Skipping rule ${rule._id}: already created ${billsCreatedToday}/${perDayBillCount} bills today`,
      );
      rulesSkipped++;
      continue;
    }

    if (!isRuleEnabled(rule) || !rule?.party_id || !rule?.amount) {
      rulesSkipped++;
      continue;
    }

    const contact = await Contact.findById(rule.party_id)
      .select("_id user_id is_gst")
      .lean();
    if (!contact?.user_id) {
      rulesSkipped++;
      continue;
    }

    const targetAmount = Number(rule.amount);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      rulesSkipped++;
      continue;
    }

    const brandIds =
      Array.isArray(rule.brand_ids) && rule.brand_ids.length > 0 ?
        rule.brand_ids
      : null;
    const itemQuery = {
      user_id: contact.user_id,
      $expr: {
        $gt: [
          {
            $add: [
              { $ifNull: ["$opening_physical_stock", 0] },
              { $ifNull: ["$physical_stock", 0] },
            ],
          },
          0,
        ],
      },
    };

    if (brandIds) {
      itemQuery.brand_id = { $in: brandIds };
    }

    const allAvailableItems = await Item.find(itemQuery).lean();

    if (!allAvailableItems.length) {
      console.log(`Skipping rule ${rule._id}: no available items in stock`);
      if (perDayBillCount > 0) {
        await AutoBill.findByIdAndUpdate(rule._id, { enabled: false });
      }
      rulesSkipped++;
      continue;
    }

    const preferredIsGst = resolvePreferredRuleFirmType(
      rule,
      contact,
      allAvailableItems,
    );

    let resolvedBillIsGst = preferredIsGst;
    let availableItems = allAvailableItems.filter(
      (item) => normalizeIsGst(item?.is_gst) === preferredIsGst,
    );

    if (!availableItems.length) {
      const fallbackIsGst = preferredIsGst === 1 ? 0 : 1;
      const fallbackItems = allAvailableItems.filter(
        (item) => normalizeIsGst(item?.is_gst) === fallbackIsGst,
      );

      if (fallbackItems.length) {
        availableItems = fallbackItems;
        resolvedBillIsGst = fallbackIsGst;
      }
    }

    if (!availableItems.length) {
      console.log(
        `Skipping rule ${rule._id}: no eligible ${preferredIsGst === 1 ? "GST" : "NON_GST"} items available`,
      );
      if (perDayBillCount > 0) {
        await AutoBill.findByIdAndUpdate(rule._id, { enabled: false });
      }
      rulesSkipped++;
      continue;
    }

    const billsToCreate =
      perDayBillCount > 0 ?
        Math.min(perDayBillCount - billsCreatedToday, perDayBillCount)
      : 1;
    let billsCreatedForRule = 0;

    for (let billIndex = 0; billIndex < billsToCreate; billIndex++) {
      const selectedItems = [];
      let totalAmount = 0;
      const shuffledItems = [...availableItems].sort(() => Math.random() - 0.5);

      for (const item of shuffledItems) {
        const itemPrice = Number(item.sale_rate || 0);
        if (itemPrice <= 0) continue;

        const currentStock = await Item.findById(item._id)
          .select("opening_physical_stock physical_stock")
          .lean();
        const availablePhysicalStock =
          Number(currentStock?.opening_physical_stock || 0) +
          Number(currentStock?.physical_stock || 0);
        if (availablePhysicalStock <= 0) continue;

        const gstPercent =
          resolvedBillIsGst === 1 ? Number(item.gst_percent || 0) : 0;

        let rate = itemPrice;
        let gstAmount = 0;
        let lineAmount = itemPrice;

        if (resolvedBillIsGst === 1) {
          // Initial estimate
          let estRate = round(itemPrice / (1 + gstPercent / 100));
          let estGst = round((estRate * gstPercent) / 100);
          let estLine = round(estRate + estGst);

          let bestRate = estRate;
          let bestGst = estGst;
          let bestLine = estLine;
          let minDiff = Math.abs(itemPrice - estLine);

          for (const adj of [-0.01, 0.01]) {
            const testRate = round(estRate + adj);
            const testGst = round((testRate * gstPercent) / 100);
            const testLine = round(testRate + testGst);
            const testDiff = Math.abs(itemPrice - testLine);
            if (testDiff < minDiff) {
              minDiff = testDiff;
              bestRate = testRate;
              bestGst = testGst;
              bestLine = testLine;
            }
          }

          rate = bestRate;
          gstAmount = bestGst;
          lineAmount = bestLine;
        }

        if (totalAmount + lineAmount <= targetAmount) {
          selectedItems.push({
            item_id: item._id,
            quantity: 1,
            rate: rate,
            discount: 0,
            special_discount: 0,
            gross_amount: rate,
            discount_amount: 0,
            total_discount: 0,
            taxable_amount: rate,
            gst_percent: gstPercent,
            gst_amount: gstAmount,
            amount: lineAmount,
            is_gst: resolvedBillIsGst,
          });
          totalAmount += lineAmount;
        }

        if (totalAmount >= targetAmount) break;
      }

      if (selectedItems.length === 0 || totalAmount === 0) {
        console.log(
          `Skipping bill ${billIndex + 1} for rule ${rule._id}: could not select items`,
        );
        break;
      }

      const financialYear = await financialYearService.getDefaultYear(
        contact.user_id,
      );

      const bill = await billService.createAutoBill(
        {
          contact_id: rule.party_id,
          amount: totalAmount,
          auto_bill_rule_id: rule._id,
          auto_bill_items: selectedItems,
          is_gst: resolvedBillIsGst,
          financial_year_id: financialYear?._id || null,
          date: now,
        },
        contact.user_id,
      );

      try {
        await stockService.deductStockForBill(
          selectedItems,
          contact.user_id,
          resolvedBillIsGst,
          1,
        );
      } catch (error) {
        await Bill.findByIdAndDelete(bill._id);
        throw error;
      }

      billsCreated++;
      billsCreatedForRule++;
      console.log(
        `Created bill ${billsCreatedForRule}/${billsToCreate} - ${bill._id} with ${selectedItems.length} items, total ${totalAmount}, type ${resolvedBillIsGst === 1 ? "GST" : "NON_GST"}`,
      );
    }

    if (billsCreatedForRule > 0) {
      await AutoBill.findByIdAndUpdate(rule._id, {
        last_billed_on: now,
        last_bill_generated_on: now,
        last_billed_date_key: todayKey,
        $inc: { bills_created_today: billsCreatedForRule },
      });
    }

    const remainingStockQuery = {
      user_id: contact.user_id,
      $expr: {
        $gt: [
          {
            $add: [
              { $ifNull: ["$opening_physical_stock", 0] },
              { $ifNull: ["$physical_stock", 0] },
            ],
          },
          0,
        ],
      },
    };

    if (brandIds) {
      remainingStockQuery.brand_id = { $in: brandIds };
    }

    const remainingStock = await Item.countDocuments(remainingStockQuery);

    if (remainingStock === 0 && perDayBillCount > 0) {
      await AutoBill.findByIdAndUpdate(rule._id, { enabled: false });
      console.log(`Rule ${rule._id} disabled: no stock remaining`);
    }
  }

  return {
    rules_checked: rulesChecked,
    bills_created: billsCreated,
    rules_skipped: rulesSkipped,
  };
}

export function startAutoBillCron() {
  const tag = "[AutoBillCron]";

  const runCycle = async () => {
    try {
      const result = await runAutoBillNow(new Date());
      console.log(
        `${tag} Rules checked: ${result.rules_checked}, Bills created: ${result.bills_created}, Skipped: ${result.rules_skipped}`,
      );
    } catch (error) {
      console.error(`${tag} Failed:`, error.message || error);
    }
  };

  cron.schedule("0 0 * * *", runCycle, {
    timezone: "Asia/Kolkata",
  });

  runCycle().catch((error) => {
    console.error(`${tag} Startup run failed:`, error.message || error);
  });
}
