import "dotenv/config";
import { connectDB, disconnectDB } from "../src/config/database.js";
import { runFinancialYearCloseIfDue } from "../src/jobs/financialYearClose.cron.js";

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const exactIndex = process.argv.indexOf(name);
  if (exactIndex !== -1) {
    return process.argv[exactIndex + 1];
  }
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  if (!inline) return undefined;
  return inline.slice(prefix.length);
};

const hasFlag = (name) => process.argv.includes(name);

async function main() {
  const effectiveDateRaw = getArgValue("--effective-date");
  const force = hasFlag("--force");

  const effectiveDate =
    effectiveDateRaw ? new Date(effectiveDateRaw) : new Date();

  if (Number.isNaN(effectiveDate.getTime())) {
    console.error("Invalid --effective-date. Use ISO format like 2026-04-01");
    process.exit(1);
  }

  await connectDB();
  const result = await runFinancialYearCloseIfDue(effectiveDate, { force });
  console.log(JSON.stringify(result, null, 2));
  await disconnectDB();
}

main().catch(async (error) => {
  console.error("Financial year close script failed:", error.message || error);
  try {
    await disconnectDB();
  } catch (_) {}
  process.exit(1);
});
