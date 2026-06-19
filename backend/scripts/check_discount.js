import mongoose from "mongoose";
import Challan from "../src/models/transaction/challan.model.js";
import dotenv from "dotenv";

dotenv.config();

async function checkDiscountAmount() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const challans = await Challan.find({ challan_type: "sale" }).limit(5).lean();
    console.log(`\nChecking ${challans.length} sample sale challans:\n`);

    for (const challan of challans) {
      console.log(`Challan: ${challan.challan_no}`);
      console.log(`Items count: ${challan.items?.length || 0}`);
      
      if (challan.items && challan.items.length > 0) {
        const item = challan.items[0];
        console.log(`  First item:`);
        console.log(`    - quantity: ${item.quantity}`);
        console.log(`    - rate: ${item.rate}`);
        console.log(`    - discount: ${item.discount}%`);
        console.log(`    - special_discount: ${item.special_discount}`);
        console.log(`    - gross_amount: ${item.gross_amount}`);
        console.log(`    - discount_amount: ${item.discount_amount}`);
        console.log(`    - total_discount: ${item.total_discount}`);
        console.log(`    - taxable_amount: ${item.taxable_amount}`);
      }
      console.log("");
    }

    process.exit(0);
  } catch (error) {
    console.error("Check failed:", error);
    process.exit(1);
  }
}

checkDiscountAmount();
