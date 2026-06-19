import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

async function checkData() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✓ Connected to MongoDB\n");

    // Check Challans
    const challan = await mongoose.connection.db
      .collection("challans")
      .findOne({ challan_type: "sale" });

    if (challan) {
      console.log("=== CHALLAN SAMPLE ===");
      console.log(`Challan No: ${challan.challan_no}`);
      console.log(`Date: ${challan.date}`);
      console.log(`\nFirst Item Details:`);
      const item = challan.items[0];
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  Rate: ${item.rate}`);
      console.log(`  Discount %: ${item.discount}`);
      console.log(`  Special Discount: ${item.special_discount}`);
      console.log(`  Gross Amount: ${item.gross_amount}`);
      console.log(`  Discount Amount (Dis3): ${item.discount_amount || 'NOT PRESENT'}`);
      console.log(`  Total Discount: ${item.total_discount}`);
      console.log(`  Taxable Amount: ${item.taxable_amount}`);
    }

    // Check Returns
    console.log("\n\n=== RETURN SAMPLE ===");
    const returnDoc = await mongoose.connection.db
      .collection("returns")
      .findOne({});

    if (returnDoc) {
      console.log(`Return No: ${returnDoc.return_no}`);
      console.log(`Date: ${returnDoc.date}`);
      console.log(`\nFirst Item Details:`);
      const item = returnDoc.items[0];
      console.log(`  Quantity: ${item.quantity}`);
      console.log(`  Rate: ${item.rate}`);
      console.log(`  Discount %: ${item.discount}`);
      console.log(`  Special Discount: ${item.special_discount}`);
      console.log(`  Discount Amount (Dis3): ${item.discount_amount || 'NOT PRESENT (will be calculated)'}`);
      console.log(`  Taxable Amount: ${item.taxable_amount}`);
    }

    console.log("\n✓ Check complete!");
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkData();
