import "dotenv/config";
import { connectDB, disconnectDB } from "../src/config/database.js";
import { getNextId } from "../src/helpers/counter.js";

import User from "../src/models/auth/user.model.js";
import Contact from "../src/models/master/contact.model.js";
import Brand from "../src/models/master/brand.model.js";
import Item from "../src/models/master/item.model.js";
import Label from "../src/models/master/label.model.js";
import AutoBill from "../src/models/transaction/auto_bill.model.js";
import Challan from "../src/models/transaction/challan.model.js";

import challanService from "../src/services/transaction/challan.service.js";
import autoBillService from "../src/services/transaction/autoBill.service.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const getIstDateKey = (rawDate) => {
  const date = new Date(rawDate);
  if (Number.isNaN(date.getTime())) return null;

  const istMs = date.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  return `${istDate.getUTCFullYear()}-${String(istDate.getUTCMonth() + 1).padStart(2, "0")}-${String(istDate.getUTCDate()).padStart(2, "0")}`;
};

const dateDaysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

async function createTestDataForBillAutomation() {
  try {
    console.log("Connecting to database...");
    await connectDB();

    // Get the first user
    const user = await User.findOne().lean();
    if (!user) {
      throw new Error("No user found. Please run the main seed first.");
    }
    console.log(`Using user: ${user._id}`);

    // Create test brands
    console.log("Creating test brands...");
    const testBrands = await Brand.insertMany([
      {
        name: "TestBrand Alpha",
        user_id: user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "TestBrand Beta",
        user_id: user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log(`Created ${testBrands.length} test brands`);

    // Create test labels
    console.log("Creating test labels...");
    const testLabels = await Label.insertMany([
      {
        name: "Test Label A",
        user_id: user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        name: "Test Label B",
        user_id: user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log(`Created ${testLabels.length} test labels`);

    // Create test items with brands
    console.log("Creating test items...");
    const testItems = [];
    const itemNames = [
      "Engine Oil Filter", "Brake Pad Set", "Spark Plug", "Air Filter",
      "Fuel Filter", "Oil Seal", "Bearing Kit", "Clutch Plate", "Gear Box Oil", "Coolant"
    ];

    for (let i = 0; i < itemNames.length; i++) {
      const brand = testBrands[i % testBrands.length];
      testItems.push({
        id: await getNextId("item", user._id),
        item_name: `${itemNames[i]} - ${brand.name}`,
        name: `${itemNames[i]} - ${brand.name}`, // Some models might use 'name' instead of 'item_name'
        brand_id: brand._id,
        user_id: user._id,
        hsn_code: "87089900",
        gst_percent: 18,
        unit: "PCS",
        rate: Math.floor(Math.random() * 500) + 100,
        sale_rate: Math.floor(Math.random() * 500) + 100,
        purchase_rate: Math.floor(Math.random() * 400) + 50,
        stock: Math.floor(Math.random() * 50) + 20, // Add stock: 20-70 units
        physical_stock: Math.floor(Math.random() * 50) + 20,
        logical_stock: Math.floor(Math.random() * 50) + 20,
        is_gst: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const createdItems = await Item.insertMany(testItems);
    console.log(`Created ${createdItems.length} test items`);

    // Create test parties
    console.log("Creating test parties...");
    const testParties = await Contact.insertMany([
      {
        id: await getNextId("contact", user._id),
        name: "Test Party Alpha",
        type: "party",
        gstin: "22AAAAA0000A1Z5",
        user_id: user._id,
        label_ids: [testLabels[0]._id],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: await getNextId("contact", user._id),
        name: "Test Party Beta",
        type: "party",
        gstin: "22BBBBB0000B1Z5",
        user_id: user._id,
        label_ids: [testLabels[1]._id],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: await getNextId("contact", user._id),
        name: "Test Party Gamma",
        type: "party",
        gstin: "22CCCCC0000C1Z5",
        user_id: user._id,
        label_ids: [testLabels[0]._id],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    console.log(`Created ${testParties.length} test parties`);

    // Create test challans for each party
    console.log("Creating test challans...");
    const challansData = [];

    for (const party of testParties) {
      // Create 2-3 challans per party
      const numChallans = Math.floor(Math.random() * 2) + 2;

      for (let i = 0; i < numChallans; i++) {
        const challanItems = [];
        const numItems = Math.floor(Math.random() * 3) + 2; // 2-4 items per challan

        for (let j = 0; j < numItems; j++) {
          const randomItem = createdItems[Math.floor(Math.random() * createdItems.length)];
          const quantity = Math.floor(Math.random() * 5) + 1;
          const rate = randomItem.sale_rate;
          const discount = 0;
          const specialDiscount = 0;
          const gstPercent = randomItem.gst_percent;

          const grossAmount = quantity * rate;
          const discountAmount = (grossAmount * discount) / 100;
          const specialDiscountAmount = (grossAmount * specialDiscount) / 100;
          const totalDiscount = discountAmount + specialDiscountAmount;
          const taxableAmount = grossAmount - totalDiscount;
          const gstAmount = (taxableAmount * gstPercent) / 100;
          const totalAmount = taxableAmount + gstAmount;

          challanItems.push({
            item_id: randomItem._id,
            quantity: quantity,
            rate: rate,
            discount: discount,
            special_discount: specialDiscount,
            gross_amount: grossAmount,
            discount_amount: discountAmount,
            total_discount: totalDiscount,
            taxable_amount: taxableAmount,
            gst_percent: gstPercent,
            gst_amount: gstAmount,
            amount: totalAmount,
            is_gst: Math.random() > 0.5 ? 1 : 0,
          });
        }

        const totalAmount = challanItems.reduce((sum, item) => sum + item.amount, 0);

        challansData.push({
          id: await getNextId("challan", user._id),
          challan_no: `TEST-CH-${party.id}-${i + 1}`,
          date: dateDaysAgo(Math.floor(Math.random() * 30)), // Random date within last 30 days
          contact_id: party._id,
          user_id: user._id,
          challan_type: "sale",
          items: challanItems,
          label_id: party.label_ids[0],
          is_gst: Math.random() > 0.5 ? 1 : 0, // Random GST status
          gross_total: totalAmount,
          sub_total: totalAmount,
          amount: totalAmount,
          converted_to_bill: false,
          bill_id: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    const createdChallans = await Challan.insertMany(challansData);
    console.log(`Created ${createdChallans.length} test challans`);

    // Create auto-bill rules that match the test data
    console.log("Creating auto-bill rules...");
    const autoBillRules = [];

    for (const party of testParties) {
      // Create one rule per party
      const partyChallans = createdChallans.filter(c => String(c.contact_id) === String(party._id));
      if (partyChallans.length === 0) continue;

      // Get brand from first challan's first item
      const firstChallan = partyChallans[0];
      const firstItem = firstChallan.items[0];
      const item = createdItems.find(i => String(i._id) === String(firstItem.item_id));
      const brandId = item?.brand_id;

      autoBillRules.push({
        party_id: party._id,
        brand_id: brandId,
        label_id: party.label_ids[0],
        from_date: dateDaysAgo(60), // From 60 days ago
        to_date: dateDaysAgo(-30), // To 30 days in future
        amount: Math.floor(Math.random() * 2000) + 500, // Random amount 500-2500
        enabled: true,
        user_id: user._id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    const createdRules = await AutoBill.insertMany(autoBillRules);
    console.log(`Created ${createdRules.length} auto-bill rules`);

    console.log("\n=== TEST DATA SUMMARY ===");
    console.log(`User ID: ${user._id}`);
    console.log(`Brands: ${testBrands.length}`);
    console.log(`Labels: ${testLabels.length}`);
    console.log(`Items: ${createdItems.length}`);
    console.log(`Parties: ${testParties.length}`);
    console.log(`Challans: ${createdChallans.length}`);
    console.log(`Auto-bill Rules: ${createdRules.length}`);

    console.log("\n=== PARTY DETAILS ===");
    for (const party of testParties) {
      const partyChallans = createdChallans.filter(c => String(c.contact_id) === String(party._id));
      console.log(`${party.name} (${party._id}): ${partyChallans.length} challans`);
    }

    console.log("\n=== AUTO-BILL RULES ===");
    for (const rule of createdRules) {
      const party = testParties.find(p => String(p._id) === String(rule.party_id));
      console.log(`Rule for ${party?.name}: amount=${rule.amount}, enabled=${rule.enabled}`);
    }

    console.log("\n=== TESTING INSTRUCTIONS ===");
    console.log("1. Run: node scripts/bill_auto.js");
    console.log("2. This should create separate bills for each challan");
    console.log("3. Check the database for new bills and updated challans");

  } catch (error) {
    console.error("Error creating test data:", error);
  } finally {
    await disconnectDB();
    console.log("Database connection closed");
  }
}

// Run the seed
createTestDataForBillAutomation();