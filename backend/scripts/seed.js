import "dotenv/config";
import bcrypt from "bcryptjs";

import { connectDB, disconnectDB } from "../src/config/database.js";
import { getNextId } from "../src/helpers/counter.js";

import User from "../src/models/auth/user.model.js";
import Session from "../src/models/auth/session.model.js";
import Counter from "../src/models/common/counter.model.js";
import Subscription from "../src/models/common/subscription.model.js";
import FinancialYearClose from "../src/models/common/financial_year_close.model.js";
import Report from "../src/models/common/report.model.js";
import Agent from "../src/models/master/agent.model.js";
import Area from "../src/models/master/area.model.js";
import Bank from "../src/models/master/bank.model.js";
import Brand from "../src/models/master/brand.model.js";
import Contact from "../src/models/master/contact.model.js";
import Department from "../src/models/master/department.model.js";
import Hsn from "../src/models/master/hsn.model.js";
import Item from "../src/models/master/item.model.js";
import Label from "../src/models/master/label.model.js";
import Transport from "../src/models/master/transport.model.js";
import AutoBill from "../src/models/transaction/auto_bill.model.js";
import Bill from "../src/models/transaction/bill.model.js";
import Challan from "../src/models/transaction/challan.model.js";
import Return from "../src/models/transaction/return.model.js";
import Transaction from "../src/models/transaction/transaction.model.js";

import challanService from "../src/services/transaction/challan.service.js";
import billService from "../src/services/transaction/bill.service.js";
import returnService from "../src/services/transaction/return.service.js";
import transactionService from "../src/services/transaction/transaction.service.js";
import autoBillService from "../src/services/transaction/autoBill.service.js";

import dns from "node:dns";
dns.setServers(["1.1.1.1"]);

const SEED_RANDOM = Number.parseInt(process.env.SEED_RANDOM || "20260401", 10);
const SEED_SCALE = Math.max(
  1,
  Number.parseInt(process.env.SEED_SCALE || "1", 10) || 1,
);

const BASE_COUNTS = {
  secondaryUsers: 0,
  hsn: 500,
  departments: 200,
  brands: 500,
  labels: 100,
  agents: 200,
  transports: 20,
  areas: 30,
  parties: 200,
  suppliers: 200,
  items: 10000,
  purchaseChallans: 5000,
  saleChallans: 5000,
  bills: 10000,
  transactions: 5000,
  saleReturns: 500,
  purchaseReturns: 500,
  autoRules: 50,
  reports: 100,
};

const COUNTS = Object.fromEntries(
  Object.entries(BASE_COUNTS).map(([key, value]) => [
    key,
    Math.max(1, Math.round(value * SEED_SCALE)),
  ]),
);

const CITIES_BY_STATE = {
  Chhattisgarh: ["Raipur", "Bilaspur", "Durg", "Rajnandgaon", "Korba"],
  "Madhya Pradesh": ["Bhopal", "Indore", "Jabalpur", "Gwalior", "Ujjain"],
  Maharashtra: ["Nagpur", "Mumbai", "Pune", "Nashik", "Aurangabad"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar"],
  Rajasthan: ["Jaipur", "Udaipur", "Kota", "Ajmer", "Jodhpur"],
};

const FIRST_NAMES = [
  "Aarav",
  "Vivaan",
  "Aditya",
  "Rohan",
  "Karan",
  "Yash",
  "Saanvi",
  "Ishita",
  "Anaya",
  "Diya",
  "Meera",
  "Ritika",
  "Dev",
  "Arjun",
  "Laksh",
  "Kabir",
  "Riddhi",
  "Aditi",
  "Parth",
  "Neha",
];

const LAST_NAMES = [
  "Sharma",
  "Verma",
  "Agarwal",
  "Gupta",
  "Soni",
  "Patel",
  "Jain",
  "Singh",
  "Mishra",
  "Tiwari",
  "Khandelwal",
  "Sahu",
];

const BRAND_NAMES = [
  "Alpha Motion",
  "RoadKing",
  "UrbanTorque",
  "SpeedNest",
  "PrecisionX",
  "DriveCore",
  "NitroLine",
  "PeakWheel",
  "AxlePro",
  "SureFit",
  "PowerMark",
  "AutoForge",
  "TorqueMatic",
  "MotoShield",
  "UrbanAxle",
  "TrackEdge",
  "StreetBolt",
  "DynoParts",
  "RideFlow",
  "VeloFix",
];

const DEPARTMENT_NAMES = [
  "Engine Parts",
  "Electricals",
  "Lubricants",
  "Filters",
  "Suspension",
  "Body Parts",
  "Tyres",
  "Brakes",
  "Accessories",
  "Fasteners",
  "Transmission",
  "Cooling",
];

const LABEL_NAMES = [
  "Retail Gold",
  "Retail Silver",
  "Workshop Plus",
  "Distributor Prime",
  "Fleet Partner",
  "Dealer Smart",
  "Counter Standard",
  "Contract Elite",
];

const TRANSPORT_PREFIXES = [
  "Express",
  "Prime",
  "Safe",
  "Rapid",
  "Apex",
  "Metro",
  "United",
  "Cargo",
  "Swift",
  "Trusted",
];

const HSN_RATES = [0, 5, 12, 18, 28];
const BANK_NAMES = [
  "State Bank of India",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Punjab National Bank",
  "Bank of Baroda",
];

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(SEED_RANDOM);

const round2 = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const randomInt = (min, max) => Math.floor(random() * (max - min + 1)) + min;

const randomFloat = (min, max, precision = 2) => {
  const factor = 10 ** precision;
  return (
    Math.round((min + random() * (max - min)) * factor + Number.EPSILON) /
    factor
  );
};

const pickOne = (arr) => arr[randomInt(0, arr.length - 1)];

const shuffle = (arr) => {
  const list = [...arr];
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(0, i);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
};

const sample = (arr, count) => {
  if (count >= arr.length) return shuffle(arr);
  return shuffle(arr).slice(0, count);
};

const dateDaysAgo = (days) => new Date(Date.now() - days * DAY_MS);

const randomDateBetween = (fromDate, toDate) => {
  const start = fromDate.getTime();
  const end = toDate.getTime();
  const ts = randomInt(start, end);
  return new Date(ts);
};

const formatDateKeyIst = (dateValue) => {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;
  const istDate = new Date(date.getTime() + IST_OFFSET_MS);
  const yyyy = istDate.getUTCFullYear();
  const mm = String(istDate.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(istDate.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

const randomPhone = (seed) => `9${String(100000000 + seed).slice(-9)}`;

const randomPincode = () => String(randomInt(400000, 999999));

const slugify = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const randomLocation = () => {
  const state = pickOne(Object.keys(CITIES_BY_STATE));
  const city = pickOne(CITIES_BY_STATE[state]);
  return { state, city, pincode: randomPincode() };
};

const createGstin = (serial) => {
  const stateCode = String(randomInt(10, 37)).padStart(2, "0");
  const pan = `AA${String(serial).padStart(3, "0")}B${String(
    randomInt(10, 99),
  )}C${String(randomInt(0, 9))}`;
  return `${stateCode}${pan}1Z${String(randomInt(0, 9))}`;
};

const createRegNo = (prefix, serial) =>
  `${prefix}-${String(serial).padStart(5, "0")}`;

const createEmail = (prefix, serial) =>
  `${slugify(prefix)}.${serial}@seed-mm.local`;

const usedBarcodeSet = new Set();
let globalItemCodeCounter = 1;

const barcodeChars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const generateBarcode = () => {
  while (true) {
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += barcodeChars[randomInt(0, barcodeChars.length - 1)];
    }
    if (!usedBarcodeSet.has(code)) {
      usedBarcodeSet.add(code);
      return code;
    }
  }
};

const generateItemCode = () =>
  `ITM${String(globalItemCodeCounter++).padStart(6, "0")}`;

function buildLineAmounts({
  quantity,
  rate,
  discount,
  special_discount,
  gst_percent,
}) {
  const qty = Number(quantity || 0);
  const rt = Number(rate || 0);
  const discPercent = Number(discount || 0);
  const specialDisc = Number(special_discount || 0);
  const gstPercent = Number(gst_percent || 0);

  const grossAmount = round2(qty * rt);
  const discountAmount = round2((grossAmount * discPercent) / 100);
  const totalDiscount = round2(discountAmount + specialDisc);
  const taxableAmount = round2(Math.max(0, grossAmount - totalDiscount));
  const gstAmount = round2((taxableAmount * gstPercent) / 100);
  const amount = round2(taxableAmount + gstAmount);

  return {
    gross_amount: grossAmount,
    discount_amount: discountAmount,
    total_discount: totalDiscount,
    taxable_amount: taxableAmount,
    gst_amount: gstAmount,
    amount,
  };
}

async function clearCollections() {
  const models = [
    Session,
    Subscription,
    FinancialYearClose,
    Report,
    AutoBill,
    Return,
    Bill,
    Challan,
    Transaction,
    Item,
    Brand,
    Hsn,
    Label,
    Department,
    Contact,
    Agent,
    Area,
    Transport,
    Bank,
    User,
    Counter,
  ];

  for (const model of models) {
    await model.deleteMany({});
  }
}

async function createBookContactsForUser(userId, serialBase = 0) {
  const cashBook = await Contact.create({
    id: await getNextId("Contact", userId),
    name: "CASHBOOK",
    alias: `CASH-BOOK-${serialBase}`,
    type: "book",
    phone: randomPhone(50000 + serialBase),
    whatsapp_number: randomPhone(60000 + serialBase),
    email: createEmail("cashbook", serialBase),
    address: `Cash Ledger Desk ${serialBase}`,
    city: "Raipur",
    state: "Chhattisgarh",
    gstin: createGstin(90000 + serialBase),
    cin: `CIN-CASH-${serialBase}`,
    reg_number: `BOOK-CASH-${serialBase}`,
    label_ids: [],
    transport_charge: 0,
    area: "Cash Zone",
    is_gst: 1,
    balance: 0,
    user_id: userId,
  });

  const bankBook = await Contact.create({
    id: await getNextId("Contact", userId),
    name: "BANKBOOK",
    alias: `BANK-BOOK-${serialBase}`,
    type: "book",
    phone: randomPhone(70000 + serialBase),
    whatsapp_number: randomPhone(80000 + serialBase),
    email: createEmail("bankbook", serialBase),
    address: `Bank Ledger Desk ${serialBase}`,
    city: "Raipur",
    state: "Chhattisgarh",
    gstin: createGstin(91000 + serialBase),
    cin: `CIN-BANK-${serialBase}`,
    reg_number: `BOOK-BANK-${serialBase}`,
    label_ids: [],
    transport_charge: 0,
    area: "Bank Zone",
    is_gst: 1,
    balance: 0,
    user_id: userId,
  });

  return { cashBook, bankBook };
}

async function createUsersAndSubscriptions() {
  const hashes = {
    admin: await bcrypt.hash("Admin@1234", 10),
    gstFirm: await bcrypt.hash("Firm@1234", 10),
    nongstFirm: await bcrypt.hash("NonGst@123", 10),
    staff: await bcrypt.hash("Staff@123", 10),
    sales: await bcrypt.hash("Sale@1234", 10),
    account: await bcrypt.hash("Account@1234", 10),
    client: await bcrypt.hash("Client@1234", 10),
  };

  const mainUser = await User.create({
    type: "main",
    name: "Maheshwari Motors",
    email: "owner@maheshwari.local",
    phone: "9876543210",
    sale_user: { username: "sale_user", password: hashes.sales },
    account_user: { username: "account_user", password: hashes.account },
    client_user: {
      username: "client_user",
      password: hashes.client,
      contact_id: null,
    },
    gst_firm: {
      username: "gst_user",
      password: hashes.gstFirm,
      role: "admin",
      name: "Maheshwari Motors GST",
      phone: "9876543211",
      email: "gst@maheshwari.local",
      address: "42-A Pandri Industrial Estate",
      godown_address: "Plot 7 Industrial Zone",
      city: "Raipur",
      state: "Chhattisgarh",
      GSTIN: createGstin(1),
      CIN: "U12345CG2020PTC123456",
      reg_number: "REG-GST-00001",
      bank_ids: [],
    },
    nongst_firm: {
      username: "nongst_user",
      password: hashes.nongstFirm,
      role: "admin",
      name: "Maheshwari Motors Non GST",
      phone: "9876543212",
      email: "nongst@maheshwari.local",
      address: "42-A Pandri Industrial Estate",
      godown_address: "Plot 7 Industrial Zone",
      city: "Raipur",
      state: "Chhattisgarh",
      GSTIN: createGstin(2),
      CIN: "U12345CG2020PTC654321",
      reg_number: "REG-NG-00001",
      bank_ids: [],
    },
    admin: {
      username: "admin_user",
      password: hashes.admin,
    },
    signature: "https://seed-mm.local/signatures/main-owner.png",
    is_active: true,
  });

  const roles = ["admin", "account", "sales", "client"];
  const secondaryUsers = [];

  for (let i = 1; i <= COUNTS.secondaryUsers; i++) {
    const role = roles[i % roles.length];
    const gstUser = `staff${String(i).padStart(2, "0")}_gst`;
    const nongstUser = `staff${String(i).padStart(2, "0")}_nongst`;
    const displayName = `${pickOne(FIRST_NAMES)} ${pickOne(LAST_NAMES)}`;
    const location = randomLocation();

    const user = await User.create({
      type: "secondary",
      name: displayName,
      email: createEmail("staff", i),
      phone: randomPhone(1000 + i),
      sale_user: {
        username: `staff${String(i).padStart(2, "0")}_sale`,
        password: hashes.sales,
      },
      account_user: {
        username: `staff${String(i).padStart(2, "0")}_account`,
        password: hashes.account,
      },
      client_user: {
        username: `staff${String(i).padStart(2, "0")}_client`,
        password: hashes.client,
        contact_id: null,
      },
      gst_firm: {
        username: gstUser,
        password: hashes.staff,
        role,
        name: `${displayName} GST Firm`,
        phone: randomPhone(2000 + i),
        email: createEmail("gst-staff", i),
        address: `${randomInt(11, 99)} Business Avenue`,
        godown_address: `${randomInt(1, 15)} Warehouse Lane`,
        city: location.city,
        state: location.state,
        GSTIN: createGstin(100 + i),
        CIN: `U12345CG20${String(10 + (i % 15)).padStart(2, "0")}PTC${String(
          200000 + i,
        )}`,
        reg_number: createRegNo("GST-STAFF", i),
        bank_ids: [],
      },
      nongst_firm: {
        username: nongstUser,
        password: hashes.staff,
        role,
        name: `${displayName} Non GST Firm`,
        phone: randomPhone(3000 + i),
        email: createEmail("nongst-staff", i),
        address: `${randomInt(11, 99)} Commerce Road`,
        godown_address: `${randomInt(1, 15)} Storage Hub`,
        city: location.city,
        state: location.state,
        GSTIN: createGstin(200 + i),
        CIN: `U54321CG20${String(10 + (i % 15)).padStart(2, "0")}PTC${String(
          300000 + i,
        )}`,
        reg_number: createRegNo("NG-STAFF", i),
        bank_ids: [],
      },
      signature: `https://seed-mm.local/signatures/staff-${i}.png`,
      is_active: i % 8 !== 0,
    });

    secondaryUsers.push(user);
  }

  const users = [mainUser, ...secondaryUsers];

  for (let i = 0; i < users.length; i++) {
    await createBookContactsForUser(users[i]._id, i + 1);
  }

  const subscriptions = [];
  for (let i = 0; i < users.length; i++) {
    const user = users[i];
    const bucket = i % 6;
    const status =
      bucket < 3 ? "active"
      : bucket < 4 ? "expired"
      : "cancelled";
    const planType = bucket % 2 === 0 ? "paid" : "demo";
    const timeline =
      planType === "paid" ?
        { years: 1, months: 0, days: 0 }
      : { years: 0, months: 0, days: 30 };
    const startDate = dateDaysAgo(240 - i * 3);
    const expiryDate =
      status === "active" ? dateDaysAgo(-randomInt(7, 80))
      : status === "expired" ? dateDaysAgo(randomInt(1, 120))
      : dateDaysAgo(randomInt(1, 30));

    subscriptions.push({
      user_id: user._id,
      plan_type: planType,
      status,
      timeline,
      amount: planType === "paid" ? randomInt(12000, 45000) : 0,
      start_date: startDate,
      expiry_date: expiryDate,
      activated_by: mainUser._id,
      activated_at: new Date(startDate.getTime() + DAY_MS),
      last_extended_at: new Date(startDate.getTime() + DAY_MS * 7),
      notes: `Seeded ${planType} subscription for ${user.name}`,
      history: [
        {
          plan_type: planType,
          timeline,
          amount: planType === "paid" ? randomInt(12000, 45000) : 0,
          start_date: startDate,
          expiry_date: expiryDate,
          activated_by: mainUser._id,
          activated_at: new Date(startDate.getTime() + DAY_MS),
          notes: "Initial seeded subscription history entry",
        },
      ],
    });
  }
  await Subscription.insertMany(subscriptions, { ordered: false });

  const sessionDocs = [];
  let sessionCounter = 1;
  for (const user of users) {
    sessionDocs.push({
      user_id: user._id,
      role: user.type === "main" ? "admin" : "firm",
      firm_type: user.type === "main" ? undefined : "GST",
      firm_role: user.type === "main" ? undefined : "admin",
      credential_key: user.type === "main" ? undefined : "gst_firm",
      token: `seed-token-${sessionCounter++}-${Date.now()}-${randomInt(100, 999)}`,
      device_name: "Seeded Web Session",
      device_type: "web",
      ip_address: `10.0.0.${randomInt(2, 250)}`,
      last_active: dateDaysAgo(randomInt(0, 12)),
    });

    if (user.type !== "main") {
      sessionDocs.push({
        user_id: user._id,
        role: "firm",
        firm_type: "NON_GST",
        firm_role: "admin",
        credential_key: "nongst_firm",
        token: `seed-token-${sessionCounter++}-${Date.now()}-${randomInt(100, 999)}`,
        device_name: "Seeded Mobile Session",
        device_type: "android",
        ip_address: `10.0.1.${randomInt(2, 250)}`,
        last_active: dateDaysAgo(randomInt(0, 18)),
      });
    }
  }
  await Session.insertMany(sessionDocs, { ordered: false });

  return { mainUser, secondaryUsers, users };
}

async function createFirmBanks(user) {
  const gstBanks = [];
  const nongstBanks = [];

  for (let i = 1; i <= 4; i++) {
    const bank = await Bank.create({
      id: await getNextId("Bank", user._id),
      bank_name: pickOne(BANK_NAMES),
      bank_branch: `GST Branch ${i}`,
      ifsc_code: `SEED0GST${String(i).padStart(3, "0")}`,
      account_number: `GSTAC${String(user._id).slice(-5)}${String(i).padStart(4, "0")}`,
      account_holder: `${user.gst_firm.name} Holder ${i}`,
      upi_id: `gst${i}.${slugify(user.gst_firm.name)}@upi`,
      assignment_type: "firm",
      assigned_to: user._id,
      is_default: i === 1,
      user_id: user._id,
    });
    gstBanks.push(bank);
  }

  for (let i = 1; i <= 4; i++) {
    const bank = await Bank.create({
      id: await getNextId("Bank", user._id),
      bank_name: pickOne(BANK_NAMES),
      bank_branch: `NON GST Branch ${i}`,
      ifsc_code: `SEED0NGT${String(i).padStart(3, "0")}`,
      account_number: `NGAC${String(user._id).slice(-5)}${String(i).padStart(4, "0")}`,
      account_holder: `${user.nongst_firm.name} Holder ${i}`,
      upi_id: `nongst${i}.${slugify(user.nongst_firm.name)}@upi`,
      assignment_type: "firm",
      assigned_to: user._id,
      is_default: false,
      user_id: user._id,
    });
    nongstBanks.push(bank);
  }

  user.gst_firm.bank_ids = gstBanks.map((bank) => bank._id);
  user.nongst_firm.bank_ids = nongstBanks.map((bank) => bank._id);
  await user.save();

  return { gstBanks, nongstBanks };
}

async function createMasterDataForUser(user) {
  const { gstBanks, nongstBanks } = await createFirmBanks(user);

  const hsns = [];
  for (let i = 1; i <= COUNTS.hsn; i++) {
    hsns.push(
      await Hsn.create({
        id: await getNextId("Hsn", user._id),
        hsn_code: `HSN${String(1000 + i).padStart(4, "0")}`,
        description: `Seed HSN Description ${i}`,
        gst_rate: HSN_RATES[i % HSN_RATES.length],
        is_active: i % 7 !== 0,
        user_id: user._id,
      }),
    );
  }

  const departments = [];
  for (let i = 0; i < COUNTS.departments; i++) {
    departments.push(
      await Department.create({
        id: await getNextId("Department", user._id),
        name: `${DEPARTMENT_NAMES[i % DEPARTMENT_NAMES.length]} ${i + 1}`,
        user_id: user._id,
      }),
    );
  }

  const brands = [];
  for (let i = 0; i < COUNTS.brands; i++) {
    brands.push(
      await Brand.create({
        id: await getNextId("Brand", user._id),
        name: `${BRAND_NAMES[i % BRAND_NAMES.length]} ${i + 1}`,
        discount1: {
          normal: randomInt(1, 10),
          special: randomInt(0, 8),
        },
        discount2: {
          normal: randomInt(1, 6),
          special: randomInt(0, 5),
        },
        item_ids: [],
        hsn_id: pickOne(hsns)._id,
        user_id: user._id,
      }),
    );
  }

  const labels = [];
  for (let i = 0; i < COUNTS.labels; i++) {
    const brandSubset = sample(
      brands,
      Math.max(2, Math.min(6, randomInt(2, 6))),
    );

    labels.push(
      await Label.create({
        id: await getNextId("Label", user._id),
        name: `${LABEL_NAMES[i % LABEL_NAMES.length]} ${i + 1}`,
        description: `Seeded label profile ${i + 1} with mapped brand discounts`,
        is_active: i % 9 !== 0,
        brand_discounts: brandSubset.map((brand) => ({
          brand_id: brand._id,
          disc1: {
            normal: randomInt(1, 9),
            special: randomInt(0, 7),
          },
          disc2: {
            normal: randomInt(0, 6),
            special: randomInt(0, 4),
          },
          item_discounts: [],
        })),
        user_id: user._id,
      }),
    );
  }

  const agents = [];
  for (let i = 1; i <= COUNTS.agents; i++) {
    const location = randomLocation();
    agents.push(
      await Agent.create({
        id: await getNextId("Agent", user._id),
        name: `Agent ${pickOne(FIRST_NAMES)} ${i}`,
        address: `${randomInt(1, 180)} Service Street`,
        city: location.city,
        pincode: location.pincode,
        phone: randomPhone(9000 + i),
        whatsapp: randomPhone(12000 + i),
        user_id: user._id,
      }),
    );
  }

  const transports = [];
  for (let i = 1; i <= COUNTS.transports; i++) {
    const location = randomLocation();
    transports.push(
      await Transport.create({
        id: await getNextId("Transport", user._id),
        name: `${pickOne(TRANSPORT_PREFIXES)} Logistics ${i}`,
        address: `${randomInt(11, 199)} Transport Nagar`,
        city: location.city,
        pincode: location.pincode,
        phone: randomPhone(15000 + i),
        whatsapp: randomPhone(16000 + i),
        gstin: createGstin(400 + i),
        user_id: user._id,
      }),
    );
  }

  const areas = [];
  for (let i = 1; i <= COUNTS.areas; i++) {
    const location = randomLocation();
    areas.push(
      await Area.create({
        id: await getNextId("Area", user._id),
        city: `${location.city} Area ${i}`,
        state: location.state,
        pincode: location.pincode,
        phone: randomPhone(17000 + i),
        whatsapp: randomPhone(18000 + i),
        agent_id: pickOne(agents)._id,
        transport_id: pickOne(transports)._id,
        user_id: user._id,
      }),
    );
  }

  const parties = [];
  const suppliers = [];

  const createContactWithBank = async ({
    name,
    alias,
    type,
    is_gst,
    label_ids,
    serial,
  }) => {
    const location = randomLocation();
    const transport = pickOne(transports);
    const agent = pickOne(agents);
    const area = pickOne(areas);

    const contact = await Contact.create({
      id: await getNextId("Contact", user._id),
      name,
      alias,
      type,
      phone: randomPhone(20000 + serial),
      whatsapp_number: randomPhone(23000 + serial),
      email: createEmail(type, serial),
      address: `${randomInt(10, 250)} Market Road`,
      city: location.city,
      state: location.state,
      gstin:
        is_gst === 1 ? createGstin(5000 + serial) : `UNREG${5000 + serial}`,
      cin: `CIN-${type.toUpperCase()}-${String(serial).padStart(5, "0")}`,
      reg_number: createRegNo(type.toUpperCase(), serial),
      label_ids,
      transport_charge: randomInt(15, 240),
      area: `${location.city} Trade Zone`,
      is_gst,
      transport_id: type === "party" ? transport._id : null,
      agent_id: type === "party" ? agent._id : null,
      area_id: type === "party" ? area._id : null,
      balance: randomInt(1, 5000),
      user_id: user._id,
    });

    const bank = await Bank.create({
      id: await getNextId("Bank", user._id),
      bank_name: pickOne(BANK_NAMES),
      bank_branch: `${location.city} ${type} Branch`,
      ifsc_code: `SEED${String(serial).padStart(7, "0")}`,
      account_number: `${type.toUpperCase()}${String(serial).padStart(10, "0")}`,
      account_holder: `${name} Holder`,
      upi_id: `${slugify(name)}.${serial}@upi`,
      assignment_type: type,
      assigned_to: contact._id,
      is_default: false,
      user_id: user._id,
    });

    contact.bank_id = bank._id;
    await contact.save();

    return contact;
  };

  for (let i = 1; i <= COUNTS.parties; i++) {
    const isGst = i % 2 === 0 ? 1 : 0;
    const name = `Party ${pickOne(FIRST_NAMES)} ${pickOne(LAST_NAMES)} ${i}`;
    const labelCount = randomInt(1, Math.min(2, labels.length));
    const party = await createContactWithBank({
      name,
      alias: `PTY-${String(i).padStart(4, "0")}`,
      type: "party",
      is_gst: isGst,
      label_ids: sample(labels, labelCount).map((label) => label._id),
      serial: 3000 + i,
    });
    parties.push(party);
  }

  for (let i = 1; i <= COUNTS.suppliers; i++) {
    const isGst = i % 2 === 0 ? 1 : 0;
    const supplier = await createContactWithBank({
      name: `Supplier ${pickOne(FIRST_NAMES)} ${pickOne(LAST_NAMES)} ${i}`,
      alias: `SUP-${String(i).padStart(4, "0")}`,
      type: "supplier",
      is_gst: isGst,
      label_ids: [],
      serial: 6000 + i,
    });
    suppliers.push(supplier);
  }

  const items = [];
  for (let i = 1; i <= COUNTS.items; i++) {
    const brand = pickOne(brands);
    const department = pickOne(departments);
    const hsn = pickOne(hsns);
    const isGst = random() < 0.66 ? 1 : 0;
    const physicalStock = randomInt(25, 220);
    const logicalStock = isGst === 0 ? randomInt(40, 260) : 0;
    const purchaseRate = randomInt(80, 2200);
    const saleRate = round2(purchaseRate * randomFloat(1.08, 1.34));
    const mrpRate = round2(saleRate * randomFloat(1.02, 1.2));
    const gstPercent = isGst === 1 ? Number(hsn.gst_rate || 0) : 0;
    const itemDiscount = randomInt(0, 12);

    items.push(
      await Item.create({
        id: await getNextId("Item", user._id),
        item_name: `Item ${brand.name} ${i}`,
        barcode: generateBarcode(),
        item_id: generateItemCode(),
        alias: `ALIAS-${String(i).padStart(5, "0")}`,
        description: `Seeded inventory item ${i} from ${brand.name} under ${department.name}`,
        sale_rate: saleRate,
        purchase_rate: purchaseRate,
        mrp_rate: mrpRate,
        gst_percent: gstPercent,
        discount: itemDiscount,
        stock: physicalStock,
        physical_stock: physicalStock,
        logical_stock: logicalStock,
        opening_physical_stock: 0,
        opening_logical_stock: 0,
        threshold: randomInt(5, 35),
        image: `https://seed-mm.local/items/item-${String(i).padStart(4, "0")}.png`,
        is_gst: isGst,
        user_id: user._id,
        brand_id: brand._id,
        dept_id: department._id,
        hsn_id: hsn._id,
      }),
    );
  }

  const itemIdsByBrand = new Map(
    brands.map((brand) => [String(brand._id), []]),
  );
  for (const item of items) {
    const key = String(item.brand_id);
    itemIdsByBrand.get(key)?.push(item._id);
  }

  for (const brand of brands) {
    const itemIds = itemIdsByBrand.get(String(brand._id)) || [];
    brand.item_ids = itemIds;
    if (!brand.hsn_id && itemIds.length > 0) {
      const first = items.find(
        (item) => String(item._id) === String(itemIds[0]),
      );
      if (first?.hsn_id) brand.hsn_id = first.hsn_id;
    }
    await brand.save();
  }

  const itemByBrand = new Map();
  for (const item of items) {
    const key = String(item.brand_id);
    if (!itemByBrand.has(key)) itemByBrand.set(key, []);
    itemByBrand.get(key).push(item);
  }

  for (const label of labels) {
    const nextBrandDiscounts = [];
    for (const entry of label.brand_discounts || []) {
      const bucket = itemByBrand.get(String(entry.brand_id)) || [];
      const discountedItems = sample(
        bucket,
        Math.min(bucket.length, randomInt(2, 5)),
      );
      nextBrandDiscounts.push({
        brand_id: entry.brand_id,
        disc1: entry.disc1,
        disc2: entry.disc2,
        item_discounts: discountedItems.map((item) => ({
          item_id: item._id,
          discount: randomInt(1, 9),
        })),
      });
    }
    label.brand_discounts = nextBrandDiscounts;
    await label.save();
  }

  const clientParty = pickOne(parties);
  user.client_user = {
    username: user.client_user?.username || "client_user",
    password:
      user.client_user?.password || (await bcrypt.hash("Client@1234", 10)),
    contact_id: clientParty._id,
  };
  await user.save();

  return {
    user,
    gstBanks,
    nongstBanks,
    hsns,
    departments,
    brands,
    labels,
    agents,
    transports,
    areas,
    parties,
    suppliers,
    items,
    clientParty,
  };
}

function buildStockTracker(items) {
  const map = new Map();
  for (const item of items) {
    map.set(String(item._id), {
      is_gst: Number(item.is_gst) === 1 ? 1 : 0,
      gst_available: Math.max(0, Math.trunc(Number(item.physical_stock || 0))),
      nongst_available: Math.max(
        0,
        Math.trunc(Number(item.logical_stock || 0)),
      ),
    });
  }
  return map;
}

function increaseStockTracker(stockMap, lines = [], isGst) {
  const normalizedIsGst = Number(isGst) === 1 ? 1 : 0;
  for (const line of lines) {
    const key = String(line.item_id);
    if (!stockMap.has(key)) continue;
    const current = stockMap.get(key);
    const qty = Math.max(0, Math.trunc(Number(line.quantity || 0)));
    if (normalizedIsGst === 1) current.gst_available += qty;
    else current.nongst_available += qty;
  }
}

function decreaseStockTracker(stockMap, lines = [], isGst) {
  const normalizedIsGst = Number(isGst) === 1 ? 1 : 0;
  for (const line of lines) {
    const key = String(line.item_id);
    if (!stockMap.has(key)) continue;
    const current = stockMap.get(key);
    const qty = Math.max(0, Math.trunc(Number(line.quantity || 0)));
    if (normalizedIsGst === 1) {
      current.gst_available = Math.max(0, current.gst_available - qty);
    } else {
      current.nongst_available = Math.max(0, current.nongst_available - qty);
    }
  }
}

function buildChallanLine(item, isGst, qtyMin = 1, qtyMax = 8) {
  const quantity = randomInt(qtyMin, qtyMax);
  const discount = randomInt(0, 12);
  const special_discount = randomInt(0, 7);

  const baseRate =
    Number(isGst) === 1 ?
      Number(item.sale_rate || 0)
    : Number(item.purchase_rate || item.sale_rate || 0);
  const rate = round2(baseRate * randomFloat(0.92, 1.18));
  const gst_percent = Number(isGst) === 1 ? Number(item.gst_percent || 0) : 0;

  return {
    item_id: item._id,
    quantity,
    rate,
    discount,
    special_discount,
    gst_percent,
    is_gst: Number(isGst) === 1 ? 1 : 0,
  };
}

function pickAvailableItems({
  pool,
  stockMap,
  isGst,
  count,
  maxQtyPerLine = 8,
}) {
  const normalizedIsGst = Number(isGst) === 1 ? 1 : 0;
  const shuffled = shuffle(pool);
  const selected = [];

  for (const item of shuffled) {
    if (selected.length >= count) break;
    const stock = stockMap.get(String(item._id));
    if (!stock) continue;
    const available =
      normalizedIsGst === 1 ? stock.gst_available : stock.nongst_available;
    if (available <= 0) continue;

    const qtyCap = Math.max(1, Math.min(maxQtyPerLine, available));
    const line = buildChallanLine(item, normalizedIsGst, 1, qtyCap);
    if (line.quantity <= 0) continue;
    selected.push(line);
  }

  return selected;
}

async function createPurchaseChallans(context, stockMap) {
  const { user, suppliers, gstBanks, nongstBanks, items } = context;

  const itemsGst = items.filter((item) => Number(item.is_gst) === 1);
  const itemsNongst = items.filter((item) => Number(item.is_gst) === 0);

  const created = [];
  let attempts = 0;

  while (
    created.length < COUNTS.purchaseChallans &&
    attempts < COUNTS.purchaseChallans * 12
  ) {
    attempts += 1;
    const supplier = pickOne(suppliers);
    if (!supplier) break;

    const isGst = Number(supplier.is_gst) === 1 ? 1 : 0;
    const itemPool = isGst === 1 ? itemsGst : itemsNongst;
    if (!itemPool.length) continue;

    const lineCount = randomInt(1, Math.min(4, itemPool.length));
    const selectedItems = sample(
      itemPool,
      Math.min(lineCount, itemPool.length),
    );
    const lines = selectedItems.map((item) => ({
      ...buildChallanLine(item, isGst, 1, randomInt(3, 12)),
      rate: round2(
        Number(item.purchase_rate || item.sale_rate || 0) *
          randomFloat(0.9, 1.12),
      ),
      discount: randomInt(0, 6),
      special_discount: randomInt(0, 4),
    }));

    try {
      const challan = await challanService.createChallan(
        {
          contact_id: supplier._id,
          date: randomDateBetween(dateDaysAgo(240), dateDaysAgo(18)),
          print_option: random() < 0.3 ? 1 : 2,
          is_gst: isGst,
          from_bank: {
            bank_id: (isGst === 1 ? gstBanks[0] : nongstBanks[0])._id,
          },
          to_bank: {
            bank_id: supplier.bank_id,
          },
          items: lines,
        },
        user._id,
        isGst,
        "purchase",
      );

      increaseStockTracker(stockMap, lines, isGst);
      created.push(challan);
    } catch (error) {
      // keep the seed resilient; skip invalid combinations
    }
  }

  return created;
}

async function createSaleChallans(context, stockMap) {
  const { user, parties, gstBanks, nongstBanks, items } = context;

  const itemsGst = items.filter((item) => Number(item.is_gst) === 1);
  const itemsNongst = items.filter((item) => Number(item.is_gst) === 0);

  const created = [];
  let attempts = 0;

  while (
    created.length < COUNTS.saleChallans &&
    attempts < COUNTS.saleChallans * 20
  ) {
    attempts += 1;
    const party = pickOne(parties);
    if (!party) break;

    const isGst = Number(party.is_gst) === 1 ? 1 : 0;
    const itemPool = isGst === 1 ? itemsGst : itemsNongst;
    if (!itemPool.length) continue;

    const lineCount = randomInt(1, Math.min(5, itemPool.length));
    const lines = pickAvailableItems({
      pool: itemPool,
      stockMap,
      isGst,
      count: lineCount,
      maxQtyPerLine: 8,
    });

    if (!lines.length) continue;

    try {
      const challan = await challanService.createChallan(
        {
          contact_id: party._id,
          date: randomDateBetween(dateDaysAgo(150), dateDaysAgo(2)),
          print_option: random() < 0.25 ? 1 : 2,
          label_id: party.label_ids?.[0] || null,
          from_bank: {
            bank_id: party.bank_id,
          },
          to_bank: {
            bank_id: (isGst === 1 ? gstBanks[0] : nongstBanks[0])._id,
          },
          items: lines,
        },
        user._id,
        isGst,
        "sale",
      );

      decreaseStockTracker(stockMap, lines, isGst);
      created.push(challan);
    } catch (error) {
      // skip if stock moved since line selection
    }
  }

  return created;
}

async function createBillsFromSaleChallans(context) {
  const { user, parties } = context;
  const targetBills = Math.max(
    1,
    Number(COUNTS.bills || COUNTS.saleChallans || 1),
  );

  const unconverted = await Challan.find({
    user_id: user._id,
    challan_type: "sale",
    converted_to_bill: false,
    bill_id: null,
  })
    .sort({ date: 1, createdAt: 1 })
    .lean();

  const byGroup = new Map();
  for (const challan of unconverted) {
    const key = `${challan.is_gst}_${String(challan.contact_id)}`;
    if (!byGroup.has(key)) byGroup.set(key, []);
    byGroup.get(key).push(challan);
  }

  const partyMap = new Map(parties.map((party) => [String(party._id), party]));
  const createdBills = [];

  for (const [, group] of byGroup) {
    if (createdBills.length >= targetBills) break;
    if (!group.length) continue;
    const remaining = targetBills - createdBills.length;
    const billsPerParty = Math.max(1, Math.min(remaining, randomInt(1, 2)));
    const toConvertCount = Math.min(group.length, billsPerParty * 3);
    if (toConvertCount === 0) continue;

    const convertable = group.slice(0, toConvertCount);
    let billsCreated = 0;
    let index = 0;

    while (
      index < convertable.length &&
      billsCreated < billsPerParty &&
      createdBills.length < targetBills
    ) {
      const chunkSize = randomInt(1, 3);
      const chunk = convertable.slice(index, index + chunkSize);
      index += chunkSize;
      if (!chunk.length) continue;

      const first = chunk[0];
      const contactId = String(first.contact_id);
      const isGst = Number(first.is_gst) === 1 ? 1 : 0;
      const party = partyMap.get(contactId);
      if (!party) continue;

      try {
        const result = await billService.createBill(
          {
            contact_id: contactId,
            challan_ids: chunk.map((entry) => entry._id),
            customer_name: party.name,
            vehicle_number: `CG04${String(randomInt(1000, 9999))}`,
            transport_charge: Number(party.transport_charge || 0),
            deduct_from_stock: 1,
          },
          user._id,
          isGst,
        );

        if (result?.bill?._id) {
          createdBills.push(result.bill);
          billsCreated++;
        }
      } catch (error) {
        // skip invalid group chunk
      }
    }
  }

  return Bill.find({
    _id: { $in: createdBills.map((bill) => bill._id) },
  }).lean();
}

async function addBillPayments(context, bills) {
  const { user, gstBanks, nongstBanks } = context;
  const updated = [];

  for (const bill of bills) {
    const pick = random();
    if (pick < 0.25) continue;

    const isGst = Number(bill.is_gst) === 1 ? 1 : 0;
    const defaultBank = (isGst === 1 ? gstBanks[0] : nongstBanks[0])._id;

    let amount = 0;
    if (pick < 0.55) {
      amount = round2(Number(bill.amount || 0));
    } else if (pick < 0.9) {
      amount = round2(Number(bill.amount || 0) * randomFloat(0.25, 0.8));
    } else {
      amount = round2(Number(bill.amount || 0) + randomFloat(25, 180));
    }

    if (amount <= 0) continue;

    const paymentType =
      random() < 0.5 ?
        "cash_payment_received_amount"
      : "bank_transaction_received_amount";

    try {
      const updatedBill = await billService.recordPayment(
        bill._id,
        user._id,
        isGst,
        {
          amount,
          payment_type: paymentType,
          bank_id:
            paymentType === "bank_transaction_received_amount" ? defaultBank : (
              null
            ),
          reference_no: `PAY-${String(bill.id).padStart(5, "0")}`,
          note: "Seeded payment entry",
        },
      );
      updated.push(updatedBill);
    } catch (error) {
      // keep seeding robust
    }
  }

  return updated;
}

async function createSaleReturns(context, stockMap) {
  const { user } = context;

  const bills = await Bill.find({
    user_id: user._id,
  })
    .populate({
      path: "challan_ids",
      select: "_id items",
    })
    .sort({ date: -1 })
    .lean();

  const selectedBills = sample(
    bills.filter(
      (bill) => Array.isArray(bill.challan_ids) && bill.challan_ids.length > 0,
    ),
    Math.min(COUNTS.saleReturns, bills.length),
  );

  const created = [];
  for (const bill of selectedBills) {
    const challans = bill.challan_ids || [];
    if (!challans.length) continue;

    const challan = pickOne(challans);
    const itemLine = pickOne(
      (challan.items || []).filter((line) => Number(line.quantity || 0) > 0),
    );
    if (!itemLine) continue;

    const quantity = Math.max(
      1,
      Math.min(2, Math.trunc(Number(itemLine.quantity || 1))),
    );
    const lineAmounts = buildLineAmounts({
      quantity,
      rate: Number(itemLine.rate || 0),
      discount: Number(itemLine.discount || 0),
      special_discount: Number(itemLine.special_discount || 0),
      gst_percent: Number(itemLine.gst_percent || 0),
    });

    try {
      const saleReturn = await returnService.createSaleReturn(
        {
          bill_id: bill._id,
          items: [
            {
              item_id: itemLine.item_id,
              quantity,
              rate: Number(itemLine.rate || 0),
              discount: Number(itemLine.discount || 0),
              special_discount: Number(itemLine.special_discount || 0),
              gst_percent: Number(itemLine.gst_percent || 0),
              gst_amount: lineAmounts.gst_amount,
              taxable_amount: lineAmounts.taxable_amount,
              amount: lineAmounts.amount,
              is_damaged: random() < 0.35,
              is_gst: Number(itemLine.is_gst) === 1 ? 1 : 0,
            },
          ],
          note: "Seeded sale return entry",
          date: randomDateBetween(dateDaysAgo(25), new Date()),
        },
        user._id,
        Number(bill.is_gst) === 1 ? 1 : 0,
      );

      if (saleReturn?.items?.length) {
        const nonDamaged = saleReturn.items.filter((line) => !line.is_damaged);
        increaseStockTracker(
          stockMap,
          nonDamaged.map((line) => ({
            item_id: line.item_id,
            quantity: line.quantity,
          })),
          Number(bill.is_gst) === 1 ? 1 : 0,
        );
      }

      created.push(saleReturn);
    } catch (error) {
      // skip invalid return candidates
    }
  }

  return created;
}

async function createPurchaseReturns(context, stockMap) {
  const { user } = context;
  const purchases = await Challan.find({
    user_id: user._id,
    challan_type: "purchase",
    is_gst: 1,
  })
    .sort({ date: -1 })
    .lean();

  const selected = sample(
    purchases.filter(
      (challan) => Array.isArray(challan.items) && challan.items.length > 0,
    ),
    Math.min(COUNTS.purchaseReturns, purchases.length),
  );

  const created = [];
  for (const challan of selected) {
    const line = pickOne(
      (challan.items || []).filter((entry) => Number(entry.quantity || 0) > 0),
    );
    if (!line) continue;

    const quantity = 1;
    const lineAmounts = buildLineAmounts({
      quantity,
      rate: Number(line.rate || 0),
      discount: Number(line.discount || 0),
      special_discount: Number(line.special_discount || 0),
      gst_percent: Number(line.gst_percent || 0),
    });

    try {
      const purchaseReturn = await returnService.createPurchaseReturn(
        {
          challan_id: challan._id,
          items: [
            {
              item_id: line.item_id,
              quantity,
              rate: Number(line.rate || 0),
              discount: Number(line.discount || 0),
              special_discount: Number(line.special_discount || 0),
              gst_percent: Number(line.gst_percent || 0),
              gst_amount: lineAmounts.gst_amount,
              taxable_amount: lineAmounts.taxable_amount,
              amount: lineAmounts.amount,
              is_damaged: false,
              is_gst: 1,
            },
          ],
          note: "Seeded purchase return entry",
          date: randomDateBetween(dateDaysAgo(40), new Date()),
        },
        user._id,
        1,
      );

      decreaseStockTracker(stockMap, [{ item_id: line.item_id, quantity }], 1);
      created.push(purchaseReturn);
    } catch (error) {
      // skip if not returnable
    }
  }

  return created;
}

async function createTransactions(context) {
  const { user, parties, suppliers, gstBanks, nongstBanks } = context;
  const created = [];
  let attempts = 0;

  while (
    created.length < COUNTS.transactions &&
    attempts < COUNTS.transactions * 4
  ) {
    attempts += 1;
    const isParty = random() < 0.55;
    const contact = isParty ? pickOne(parties) : pickOne(suppliers);
    if (!contact) continue;

    const isGst = Number(contact.is_gst) === 1 ? 1 : 0;
    const typePool =
      isParty ?
        ["bank_received", "cash_received"]
      : ["bank_payment", "cash_payment"];
    const type = pickOne(typePool);
    const contactType = contact.type;
    const bankId =
      type.startsWith("bank") ?
        (isGst === 1 ? pickOne(gstBanks) : pickOne(nongstBanks))._id
      : null;

    try {
      const txn = await transactionService.createTransaction(
        {
          type,
          date: randomDateBetween(dateDaysAgo(180), new Date()),
          contact_id: contact._id,
          contact_type: contactType,
          amount: randomInt(250, 18000),
          bank_id: bankId,
          reference: `REF-${String(created.length + 1).padStart(6, "0")}`,
          remarks: `Seeded ${type} transaction for ${contact.name}`,
        },
        user._id,
        isGst,
      );
      created.push(txn);
    } catch (error) {
      // skip invalid transactions
    }
  }

  return created;
}

async function createAutomationRules(context) {
  const { user, parties, items } = context;
  const pendingSaleChallans = await Challan.find({
    user_id: user._id,
    challan_type: "sale",
    converted_to_bill: false,
    bill_id: null,
  })
    .select("_id contact_id items label_id is_gst")
    .lean();

  const byParty = new Map();
  for (const challan of pendingSaleChallans) {
    const key = String(challan.contact_id);
    if (!byParty.has(key)) byParty.set(key, []);
    byParty.get(key).push(challan);
  }

  const partyMap = new Map(parties.map((party) => [String(party._id), party]));
  const itemMap = new Map(items.map((item) => [String(item._id), item]));
  const candidates = shuffle(Array.from(byParty.keys())).slice(
    0,
    Math.min(COUNTS.autoRules, byParty.size),
  );

  const created = [];
  for (let i = 0; i < candidates.length; i++) {
    const partyId = candidates[i];
    const party = partyMap.get(partyId);
    const challans = byParty.get(partyId) || [];
    if (!party || !challans.length) continue;

    const partyIsGst = Number(party.is_gst) === 1 ? 1 : 0;
    const candidateItemIds = challans.flatMap((challan) =>
      (challan.items || []).map((line) => String(line?.item_id || "")),
    );
    const candidateItems = candidateItemIds
      .map((itemId) => itemMap.get(itemId))
      .filter(Boolean);

    const preferredItem =
      candidateItems.find((item) => Number(item?.is_gst) === partyIsGst) ||
      candidateItems[0] ||
      null;

    const brandId = preferredItem?.brand_id || null;
    if (!brandId) continue;
    const labelId = party.label_ids?.[0] || challans[0]?.label_id || null;

    try {
      const rule = await autoBillService.createRule(
        {
          party_id: party._id,
          brand_ids: brandId ? [brandId] : [],
          label_id: labelId,
          from_date: dateDaysAgo(randomInt(10, 35)),
          to_date: dateDaysAgo(-randomInt(20, 90)),
          amount: randomInt(500, 5000),
          per_day_bill: i % 3 === 0 ? randomInt(2, 5) : 0,
          enabled: i % 5 !== 0,
        },
        user._id,
      );

      const updateFields = { is_gst: partyIsGst };
      if (i % 4 === 0) {
        const priorDate = dateDaysAgo(randomInt(1, 3));
        updateFields.last_billed_on = priorDate;
        updateFields.last_billed_date_key = formatDateKeyIst(priorDate);
      }
      await AutoBill.findByIdAndUpdate(rule._id, { $set: updateFields });

      created.push(rule);
    } catch (error) {
      // skip invalid combinations
    }
  }

  return created;
}

async function createReportsAndFinancialClose(user) {
  const reportTypes = ["challan", "bill", "inventory", "transaction", "other"];
  const reportDocs = [];
  for (let i = 1; i <= COUNTS.reports; i++) {
    reportDocs.push({
      pdf_link: `https://seed-mm.local/reports/${String(i).padStart(4, "0")}.pdf`,
      date_created: randomDateBetween(dateDaysAgo(300), new Date()),
      user_id: user._id,
      is_gst: i % 2 === 0 ? 1 : 0,
      report_type: reportTypes[i % reportTypes.length],
      createdAt: randomDateBetween(dateDaysAgo(300), new Date()),
      updatedAt: randomDateBetween(dateDaysAgo(100), new Date()),
    });
  }
  await Report.insertMany(reportDocs, { ordered: false });

  await FinancialYearClose.insertMany([
    {
      financial_year_start: 2024,
      financial_year_end: 2025,
      closed_at: dateDaysAgo(365),
      matched_items: COUNTS.items,
      modified_items: COUNTS.items,
    },
    {
      financial_year_start: 2025,
      financial_year_end: 2026,
      closed_at: dateDaysAgo(1),
      matched_items: COUNTS.items,
      modified_items: COUNTS.items,
    },
  ]);
}

async function attachClientContactsToSecondaryUsers(secondaryUsers, parties) {
  const clientCandidates = secondaryUsers.filter(
    (user) =>
      user.gst_firm?.role === "client" || user.nongst_firm?.role === "client",
  );
  const partyPool = shuffle(parties).slice(0, clientCandidates.length);

  for (let i = 0; i < clientCandidates.length; i++) {
    const user = clientCandidates[i];
    const party = partyPool[i];
    if (!party) continue;

    user.gst_firm.contact_id = party._id;
    user.nongst_firm.contact_id = party._id;
    user.client_user = {
      ...(user.client_user || {}),
      contact_id: party._id,
    };
    await user.save();
  }
}

async function countAll() {
  return {
    users: await User.countDocuments(),
    sessions: await Session.countDocuments(),
    subscriptions: await Subscription.countDocuments(),
    banks: await Bank.countDocuments(),
    contacts: await Contact.countDocuments(),
    hsns: await Hsn.countDocuments(),
    brands: await Brand.countDocuments(),
    labels: await Label.countDocuments(),
    departments: await Department.countDocuments(),
    items: await Item.countDocuments(),
    agents: await Agent.countDocuments(),
    transports: await Transport.countDocuments(),
    areas: await Area.countDocuments(),
    purchase_challans: await Challan.countDocuments({
      challan_type: "purchase",
    }),
    sale_challans: await Challan.countDocuments({ challan_type: "sale" }),
    bills: await Bill.countDocuments(),
    returns: await Return.countDocuments(),
    transactions: await Transaction.countDocuments(),
    automation_rules: await AutoBill.countDocuments(),
    reports: await Report.countDocuments(),
    financial_year_closes: await FinancialYearClose.countDocuments(),
  };
}

async function run() {
  console.log(
    `Starting seed with SEED_RANDOM=${SEED_RANDOM}, SEED_SCALE=${SEED_SCALE}`,
  );
  await connectDB();
  console.log("Connected. Clearing all collections...");
  await clearCollections();
  console.log("Collections cleared.");

  const { mainUser, secondaryUsers, users } =
    await createUsersAndSubscriptions();
  console.log(
    `Users created: ${users.length} (main: 1, secondary: ${secondaryUsers.length})`,
  );

  const context = await createMasterDataForUser(mainUser);
  console.log("Master data created for main user.");

  await attachClientContactsToSecondaryUsers(secondaryUsers, context.parties);

  const stockMap = buildStockTracker(context.items);
  const purchaseChallans = await createPurchaseChallans(context, stockMap);
  console.log(`Purchase challans created: ${purchaseChallans.length}`);

  const saleChallans = await createSaleChallans(context, stockMap);
  console.log(`Sale challans created: ${saleChallans.length}`);

  const bills = await createBillsFromSaleChallans(context);
  console.log(`Bills created from sale challans: ${bills.length}`);

  const paidBills = await addBillPayments(context, bills);
  console.log(`Bills updated with payments: ${paidBills.length}`);

  const saleReturns = await createSaleReturns(context, stockMap);
  console.log(`Sale returns created: ${saleReturns.length}`);

  const purchaseReturns = await createPurchaseReturns(context, stockMap);
  console.log(`Purchase returns created: ${purchaseReturns.length}`);

  const transactions = await createTransactions(context);
  console.log(`Transactions created: ${transactions.length}`);

  const autoRules = await createAutomationRules(context);
  console.log(`Automation rules created: ${autoRules.length}`);

  await createReportsAndFinancialClose(mainUser);
  console.log("Reports and financial year close logs created.");

  const stats = await countAll();
  console.log(
    JSON.stringify(
      { seed_random: SEED_RANDOM, seed_scale: SEED_SCALE, stats },
      null,
      2,
    ),
  );

  console.log("");
  console.log("Seed credentials:");
  console.log(
    "Super Admin     -> username: admin_user   | password: Admin@1234",
  );
  console.log(
    "GST Admin       -> username: mm_gst       | password: GstFirm@123",
  );
  console.log(
    "NON_GST Admin   -> username: mm_nongst    | password: NonGst@123",
  );
  console.log(
    "Sales           -> username: sale_user    | password: Sale@1234",
  );
  console.log(
    "Account         -> username: account_user | password: Account@1234",
  );
  console.log(
    "Client          -> username: client_user  | password: Client@1234",
  );
  console.log(
    "Note            -> firm_type is now determined by credential key. No frontend firm_type toggle needed.",
  );
}

run()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
  });
