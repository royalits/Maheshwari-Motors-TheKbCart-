import mongoose from "mongoose";
import Return from "../src/models/transaction/return.model.js";
import dotenv from "dotenv";

dotenv.config();

async function checkReturns() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const returns = await Return.find({}).limit(3).lean();
    console.log(`\nChecking ${returns.length} sample returns:\n`);

    for (const ret of returns) {
      console.log(`Return: ${ret.return_no}`);
      console.log(`Items count: ${ret.items?.length || 0}`);
      
      if (ret.items && ret.items.length > 0) {
        const item = ret.items[0];
        console.log(`  First item:`);
        console.log(`    - quantity: ${item.quantity}`);
        console.log(`    - rate: ${item.rate}`);
        console.log(`    - discount: ${item.discount}%`);
        console.log(`    - special_discount: ${item.special_discount}`);
        console.log(`    - discount_amount: ${item.discount_amount || 'NOT PRESENT'}`);
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

checkReturns();
