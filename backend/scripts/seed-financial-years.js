import "dotenv/config";
import bcrypt from "bcryptjs";
import { connectDB, disconnectDB } from "../src/config/database.js";
import { getNextId } from "../src/helpers/counter.js";

import User from "../src/models/auth/user.model.js";
import FinancialYear from "../src/models/common/financial_year.model.js";
import Brand from "../src/models/master/brand.model.js";
import Contact from "../src/models/master/contact.model.js";
import Department from "../src/models/master/department.model.js";
import Hsn from "../src/models/master/hsn.model.js";
import Item from "../src/models/master/item.model.js";
import Label from "../src/models/master/label.model.js";
import Bill from "../src/models/transaction/bill.model.js";
import Challan from "../src/models/transaction/challan.model.js";
import Transaction from "../src/models/transaction/transaction.model.js";

import dns from "node:dns";
dns.setServers(["1.1.1.1"]);

const MARKER = "FY_SEED";

const round = (value) => Math.round((Number(value) || 0) * 100) / 100;

const utcDate = (year, month, day) =>
  new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));

const yearDates = (startYear) => ({
  start_date: utcDate(startYear, 4, 1),
  end_date: new Date(Date.UTC(startYear + 1, 2, 31, 23, 59, 59, 999)),
});

const makeLine = ({ item, quantity, rate, discount = 0, special = 0 }) => {
  const gross = round(quantity * rate);
  const discountAmount = round(
    gross * (discount / 100) + gross * (special / 100),
  );
  const taxable = round(gross - discountAmount);
  const gstAmount = round(taxable * ((item.gst_percent || 0) / 100));
  return {
    item_id: item._id,
    quantity,
    rate,
    discount,
    special_discount: special,
    item_discount: 0,
    dis3: 0,
    gross_amount: gross,
    discount_amount: discountAmount,
    total_discount: discountAmount,
    taxable_amount: taxable,
    gst_percent: item.gst_percent || 0,
    gst_amount: gstAmount,
    amount: round(taxable + gstAmount),
    is_gst: item.is_gst,
  };
};

const sumLines = (lines) => ({
  gross_total: round(lines.reduce((sum, line) => sum + line.gross_amount, 0)),
  sub_total: round(lines.reduce((sum, line) => sum + line.taxable_amount, 0)),
  amount: round(lines.reduce((sum, line) => sum + line.amount, 0)),
});

const upsertYear = (userId, startYear, status) =>
  FinancialYear.findOneAndUpdate(
    { user_id: userId, start_year: startYear },
    {
      $set: {
        user_id: userId,
        label: `${startYear}-${startYear + 1}`,
        start_year: startYear,
        end_year: startYear + 1,
        ...yearDates(startYear),
        status,
        ...(status === "open" ?
          { closed_at: null, close_backup_id: "" }
        : { closed_at: new Date() }),
      },
    },
    { new: true, upsert: true },
  );

const findOrCreateSeedUser = async () => {
  if (process.env.SEED_FY_USER_ID) {
    const user = await User.findById(process.env.SEED_FY_USER_ID);
    if (!user) throw new Error("SEED_FY_USER_ID not found");
    return user;
  }

  const existing =
    (process.env.SEED_FY_USER_EMAIL &&
      (await User.findOne({ email: process.env.SEED_FY_USER_EMAIL }))) ||
    (await User.findOne({ type: "main" }).sort({ createdAt: 1 }));

  if (existing) return existing;

  const password = await bcrypt.hash("Seed@123", 10);
  return User.create({
    type: "main",
    name: "FY Seed User",
    email: "fy-seed@example.com",
    phone: "9999999999",
    admin: { username: "fy_seed_admin", password },
    gst_firm: {
      username: "fy_seed_gst",
      password,
      role: "admin",
      name: "FY Seed GST Firm",
      phone: "9999999999",
      city: "Raipur",
      state: "Chhattisgarh",
      GSTIN: "22AAAAA0000A1Z5",
    },
    nongst_firm: {
      username: "fy_seed_nongst",
      password,
      role: "admin",
      name: "FY Seed Non GST Firm",
      phone: "9999999999",
      city: "Raipur",
      state: "Chhattisgarh",
    },
  });
};

const cleanupSeedData = async (userId) => {
  await Promise.all([
    Transaction.deleteMany({
      user_id: userId,
      transaction_no: { $regex: `^${MARKER}` },
    }),
    Bill.deleteMany({
      user_id: userId,
      customer_name: { $regex: `^${MARKER}` },
    }),
    Challan.deleteMany({
      user_id: userId,
      challan_no: { $regex: `^${MARKER}` },
    }),
  ]);
  await Promise.all([
    Item.deleteMany({ user_id: userId, item_id: { $regex: `^${MARKER}` } }),
    Contact.deleteMany({ user_id: userId, alias: { $regex: `^${MARKER}` } }),
    Label.deleteMany({ user_id: userId, name: { $regex: `^${MARKER}` } }),
    Brand.deleteMany({ user_id: userId, name: { $regex: `^${MARKER}` } }),
    Department.deleteMany({ user_id: userId, name: { $regex: `^${MARKER}` } }),
    Hsn.deleteMany({ user_id: userId, hsn_code: { $regex: `^${MARKER}` } }),
  ]);
};

const createMasters = async (userId) => {
  const hsn = await Hsn.create({
    id: await getNextId("Hsn", userId),
    hsn_code: `${MARKER}-HSN-8708`,
    description: "Seed motor parts HSN",
    gst_rate: 18,
    user_id: userId,
  });
  const department = await Department.create({
    id: await getNextId("Department", userId),
    name: `${MARKER} Parts`,
    user_id: userId,
  });
  const brand = await Brand.create({
    id: await getNextId("Brand", userId),
    name: `${MARKER} Roadline`,
    hsn_id: hsn._id,
    user_id: userId,
  });
  const item = await Item.create({
    id: await getNextId("Item", userId),
    item_name: `${MARKER} Brake Shoe`,
    item_id: `${MARKER}-ITEM-001`,
    barcode: `${MARKER}-BAR-001`,
    alias: `${MARKER}-BRAKE`,
    sale_rate: 220,
    purchase_rate: 130,
    mrp_rate: 260,
    gst_percent: 18,
    physical_stock: 25,
    logical_stock: 9,
    opening_physical_stock: 0,
    opening_logical_stock: 0,
    stock: 25,
    threshold: 5,
    is_gst: 1,
    brand_id: brand._id,
    dept_id: department._id,
    hsn_id: hsn._id,
    user_id: userId,
  });
  const label = await Label.create({
    id: await getNextId("Label", userId),
    name: `${MARKER} Retail Label`,
    description: "Seed retail discounts",
    user_id: userId,
    brand_discounts: [
      {
        brand_id: brand._id,
        disc1: { normal: 0, special: 0 },
        disc2: { normal: 0, special: 0 },
        item_discounts: [],
      },
    ],
  });
  const party = await Contact.create({
    id: await getNextId("Contact", userId),
    name: `${MARKER} Party`,
    alias: `${MARKER}-PARTY`,
    type: "party",
    phone: "9000000001",
    city: "Raipur",
    state: "Chhattisgarh",
    is_gst: 1,
    label_id: label._id,
    label_ids: [label._id],
    balance: 798.2,
    user_id: userId,
  });
  const supplier = await Contact.create({
    id: await getNextId("Contact", userId),
    name: `${MARKER} Supplier`,
    alias: `${MARKER}-SUPPLIER`,
    type: "supplier",
    phone: "9000000002",
    city: "Nagpur",
    state: "Maharashtra",
    balance: 0,
    user_id: userId,
  });

  return { item, label, party, supplier };
};

const createBillWithChallan = async ({
  userId,
  financialYearId,
  billNo,
  challanNo,
  date,
  contact,
  contactType,
  challanType,
  isGst,
  line,
  paidAmount = 0,
  skipStockCalculation = false,
}) => {
  const totals = sumLines([line]);
  const challan = await Challan.create({
    id: await getNextId("Challan", userId),
    challan_no: challanNo,
    challan_type: challanType,
    date,
    label_id: contact.label_id || null,
    contact_id: contact._id,
    items: [line],
    ...totals,
    discount: 0,
    converted_to_bill: true,
    stock_context: "bill",
    deduct_from_stock: skipStockCalculation ? 0 : 1,
    payment_status: paidAmount >= totals.amount ? "paid" : "due",
    paid_amount: paidAmount,
    is_gst: isGst,
    financial_year_id: financialYearId,
    user_id: userId,
  });
  const bill = await Bill.create({
    id: await getNextId("Bill", userId),
    bill_no: billNo,
    date,
    contact_id: contact._id,
    contact_type: contactType,
    customer_name: `${MARKER} ${contact.name}`,
    amount: totals.amount,
    paid_amount: paidAmount,
    settlement_discount: 0,
    payment_status: paidAmount >= totals.amount ? "paid" : "due",
    challan_ids: [challan._id],
    skip_stock_calculation: skipStockCalculation,
    is_gst: isGst,
    financial_year_id: financialYearId,
    user_id: userId,
  });
  challan.bill_id = bill._id;
  await challan.save();
  return { bill, challan };
};

const createSaleChallan = async ({
  userId,
  financialYearId,
  challanNo,
  date,
  party,
  line,
}) => {
  const totals = sumLines([line]);
  return Challan.create({
    id: await getNextId("Challan", userId),
    challan_no: challanNo,
    challan_type: "sale",
    date,
    label_id: party.label_id,
    contact_id: party._id,
    items: [line],
    ...totals,
    discount: 0,
    converted_to_bill: false,
    stock_context: "challan",
    deduct_from_stock: 1,
    payment_status: "due",
    paid_amount: 0,
    is_gst: 1,
    financial_year_id: financialYearId,
    user_id: userId,
  });
};

const main = async () => {
  await connectDB();
  try {
    const user = await findOrCreateSeedUser();
    const userId = user._id;

    await cleanupSeedData(userId);

    const [fy2024, fy2025] = await Promise.all([
      upsertYear(userId, 2024, "closed"),
      upsertYear(userId, 2025, "closed"),
      upsertYear(userId, 2026, "open"),
    ]);

    const { item, party, supplier } = await createMasters(userId);

    await createBillWithChallan({
      userId,
      financialYearId: fy2024._id,
      billNo: `${MARKER}-240001`,
      challanNo: `${MARKER}-CH-240001`,
      date: utcDate(2024, 4, 10),
      contact: supplier,
      contactType: "supplier",
      challanType: "purchase",
      isGst: 1,
      line: makeLine({ item, quantity: 20, rate: 120 }),
    });

    await createBillWithChallan({
      userId,
      financialYearId: fy2024._id,
      billNo: `${MARKER}-240002`,
      challanNo: `${MARKER}-CH-240002`,
      date: utcDate(2024, 5, 15),
      contact: party,
      contactType: "party",
      challanType: "sale",
      isGst: 1,
      line: makeLine({ item, quantity: 6, rate: 200 }),
      paidAmount: 500,
    });

    await createSaleChallan({
      userId,
      financialYearId: fy2024._id,
      challanNo: `${MARKER}-CH-240003`,
      date: utcDate(2024, 7, 20),
      party,
      line: makeLine({ item, quantity: 4, rate: 200 }),
    });

    await createBillWithChallan({
      userId,
      financialYearId: fy2025._id,
      billNo: `${MARKER}-250001`,
      challanNo: `${MARKER}-CH-250001`,
      date: utcDate(2025, 4, 18),
      contact: supplier,
      contactType: "supplier",
      challanType: "purchase",
      isGst: 0,
      line: makeLine({
        item: { ...item.toObject(), gst_percent: 0, is_gst: 0, _id: item._id },
        quantity: 15,
        rate: 130,
      }),
    });

    await createBillWithChallan({
      userId,
      financialYearId: fy2025._id,
      billNo: `${MARKER}-250002`,
      challanNo: `${MARKER}-CH-250002`,
      date: utcDate(2025, 6, 12),
      contact: party,
      contactType: "party",
      challanType: "sale",
      isGst: 1,
      line: makeLine({ item, quantity: 5, rate: 220 }),
      paidAmount: 500,
      skipStockCalculation: true,
    });

    await Transaction.create({
      id: await getNextId("Transaction", userId),
      transaction_no: `${MARKER}-TR-250001`,
      type: "cash_received",
      date: utcDate(2025, 6, 13),
      contact_id: party._id,
      contact_type: "party",
      amount: 500,
      reference: "Seed receipt",
      remarks: "Historical seed payment for FY 2025-2026",
      is_gst: 1,
      financial_year_id: fy2025._id,
      user_id: userId,
    });

    console.log("Financial-year seed completed");
    console.log(`User: ${user.name} (${user._id})`);
    console.log("Created years: 2024-2025, 2025-2026, 2026-2027");
    console.log("Seed item final stock: PS=25, LS=9");
  } finally {
    await disconnectDB();
  }
};

main().catch(async (error) => {
  console.error("Financial-year seed failed:", error);
  await disconnectDB();
  process.exit(1);
});
