import mongoose from "mongoose";
import env from "./src/config/env.js";

async function debugBills() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    
    // Find all bills
    const bills = await db.collection("bills").find({}).toArray();
    console.log("=== BILLS ===");
    for (const b of bills) {
      console.log(`ID: ${b._id}, BillNo: ${b.bill_no}, ContactId: ${b.contact_id}, Amount: ${b.amount}, isGst: ${b.is_gst}, Challans: ${JSON.stringify(b.challan_ids)}`);
    }

    // Find all challans
    const challans = await db.collection("challans").find({}).toArray();
    console.log("\n=== CHALLANS ===");
    for (const c of challans) {
      console.log(`ID: ${c._id}, ChallanNo: ${c.challan_no}, ContactId: ${c.contact_id}, Amount: ${c.amount}, isGst: ${c.is_gst}, Items: ${JSON.stringify(c.items)}`);
    }

  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

debugBills();
