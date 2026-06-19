import mongoose from "mongoose";
import Challan from "../src/models/transaction/challan.model.js";
import dotenv from "dotenv";

dotenv.config();

const round = (n) => Math.round(n * 100) / 100;

async function migrateDiscountAmount() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const challans = await Challan.find({}).lean();
    console.log(`Found ${challans.length} challans to process`);

    let updated = 0;
    let skipped = 0;

    for (const challan of challans) {
      let needsUpdate = false;
      const updatedItems = challan.items.map((item) => {
        // Check if discount_amount is missing or 0
        if (!item.discount_amount || item.discount_amount === 0) {
          const grossAmount = item.gross_amount || item.quantity * item.rate;
          const discountPercent = item.discount || 0;
          const percentDiscountAmount = round((grossAmount * discountPercent) / 100);
          const itemDiscount = 0; // Old records don't have item_discount
          const discountAmount = round(percentDiscountAmount + itemDiscount);

          if (discountAmount > 0) {
            needsUpdate = true;
            return { ...item, discount_amount: discountAmount };
          }
        }
        return item;
      });

      if (needsUpdate) {
        await Challan.updateOne(
          { _id: challan._id },
          { $set: { items: updatedItems } }
        );
        updated++;
        console.log(`Updated challan ${challan.challan_no}`);
      } else {
        skipped++;
      }
    }

    console.log(`\nMigration complete!`);
    console.log(`Updated: ${updated} challans`);
    console.log(`Skipped: ${skipped} challans`);

    process.exit(0);
  } catch (error) {
    console.error("Migration failed:", error);
    process.exit(1);
  }
}

migrateDiscountAmount();
