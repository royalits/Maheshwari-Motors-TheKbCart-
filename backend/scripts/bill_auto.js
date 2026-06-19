import mongoose from "mongoose";
import env from "../src/config/env.js";
import { runAutoBillNow } from "../src/jobs/autoBill.cron.js";
import AutoBill from "../src/models/transaction/auto_bill.model.js";

// Default single-rule test target (override with --rule-id=...)
const DEFAULT_RULE_ID = "69cd0450bd5be2fdf8ff9f66";

const parseDateArg = () => {
  const raw = process.argv.find((arg) => arg.startsWith("--date="));
  if (!raw) return new Date();

  const value = raw.split("=")[1];
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(
      `Invalid --date value '${value}'. Use ISO format like 2026-04-02T00:00:00Z`,
    );
  }

  return parsed;
};

const parseRuleIdArg = () => {
  const raw = process.argv.find((arg) => arg.startsWith("--rule-id="));
  return raw ? raw.split("=")[1] : null; // Return null to process all rules
};

const createTestRule = async () => {
  // Create a test auto-bill rule object using provided data
  const testRule = {
    party_id: new mongoose.Types.ObjectId("69ce3f14b94ec269f6f5a294"),
    brand_ids: [new mongoose.Types.ObjectId("69ce3f13b94ec269f6f5a262")],
    label_id: new mongoose.Types.ObjectId("69ce3f14b94ec269f6f5a269"),
    from_date: new Date("2026-02-01T10:04:05.197Z"),
    to_date: new Date("2026-05-02T10:04:05.197Z"),
    amount: 2268,
    per_day_bill: 3,
    enabled: true,
    user_id: new mongoose.Types.ObjectId("69cd023abd5be2fdf8ff7115"),
  };

  const createdRule = await AutoBill.create(testRule);
  console.log(`Created test rule with ID: ${createdRule._id}`);
  return createdRule._id;
};

const run = async () => {
  const effectiveDate = parseDateArg();
  const ruleId = parseRuleIdArg();

  await mongoose.connect(env.MONGODB_URI);
  try {
    // Manually add a test rule object
    const testRuleId = await createTestRule();

    const result = await runAutoBillNow(effectiveDate, ruleId ? { ruleId } : {});
    console.log(
      JSON.stringify(
        {
          effective_date: effectiveDate.toISOString(),
          rule_id: ruleId || "all",
          test_rule_id: testRuleId,
          ...result,
        },
        null,
        2,
      ),
    );
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((error) => {
  console.error("Auto bill test script failed:", error?.message || error);
  process.exit(1);
});
