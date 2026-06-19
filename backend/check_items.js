import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
await mongoose.connect(process.env.MONGODB_URI);
const Item = (await import("./src/models/master/item.model.js")).default;
const itemIds = [
  "69cd02a7bd5be2fdf8ff77c4",
  "69cd02adbd5be2fdf8ff7830",
  "69cd02c8bd5be2fdf8ff7a31",
];
const items = await Item.find({ _id: { $in: itemIds } })
  .select("_id brand_id name")
  .lean();
console.log("Item brands:");
items.forEach((item) => {
  console.log(
    "Item " +
      item._id +
      ": brand=" +
      item.brand_id +
      ", name=" +
      (item.name || "unknown"),
  );
});
process.exit(0);
