import mongoose from "mongoose";
import env from "./src/config/env.js";

async function checkValidator() {
  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;
    const collection = db.collection("autobills");

    // Get current validator
    const info = await collection.options();
    console.log("Current validator:", JSON.stringify(info.validator, null, 2));
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await mongoose.disconnect();
  }
}

checkValidator();
