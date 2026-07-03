import mongoose from "mongoose";
import env from "./env.js";

const BILL_UNIQUE_INDEX = {
  bill_no: 1,
  user_id: 1,
  is_gst: 1,
  contact_id: 1,
  financial_year_id: 1,
};
const BILL_UNIQUE_INDEX_NAME = "bill_no_contact_fy_unique";

const sameIndexKeys = (left = {}, right = {}) => {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
};

const ensureBillIndexes = async () => {
  const collection = mongoose.connection.collection("bills");
  let indexes = [];

  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error?.codeName !== "NamespaceNotFound") throw error;
  }

  for (const index of indexes) {
    const keys = index.key || {};
    const hasBillNo = Object.prototype.hasOwnProperty.call(keys, "bill_no");
    const isWrongUniqueBillIndex =
      index.unique === true &&
      hasBillNo &&
      (!sameIndexKeys(keys, BILL_UNIQUE_INDEX) ||
        index.name !== BILL_UNIQUE_INDEX_NAME);

    if (isWrongUniqueBillIndex) {
      console.log("[DB] Dropping stale bill unique index:", index.name);
      await collection.dropIndex(index.name);
    }
  }

  await collection.createIndex(BILL_UNIQUE_INDEX, {
    unique: true,
    name: BILL_UNIQUE_INDEX_NAME,
  });
};

const ensureSubscriptionIndexes = async () => {
  const collection = mongoose.connection.collection("subscriptions");
  let indexes = [];

  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (error?.codeName !== "NamespaceNotFound") return;
  }

  for (const index of indexes) {
    const keys = index.key || {};
    if (index.unique === true && Object.prototype.hasOwnProperty.call(keys, "user_id")) {
      console.log("[DB] Dropping unique index on subscriptions user_id:", index.name);
      await collection.dropIndex(index.name);
    }
  }

  // Create a non-unique index on user_id
  await collection.createIndex({ user_id: 1 });
};

class Database {
  constructor() {
    this.connection = null;
  }

  async connect() {
    try {
      if (this.connection) return this.connection;

      console.log("MONGODB_URI from env:", env.MONGODB_URI);
      const options = {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      };

      console.log("Attempting to connect to MongoDB with URI:", env.MONGODB_URI);
      console.log("About to connect with URI:", env.MONGODB_URI);
      this.connection = await mongoose.connect(env.MONGODB_URI, options);
      console.log("Database connected successfully!");
      await ensureBillIndexes();
      await ensureSubscriptionIndexes();

      mongoose.connection.on("error", (err) => {
        console.error("Database connection error:", err);
      });

      mongoose.connection.on("disconnected", () => {
        console.warn("Database disconnected. Attempting to reconnect...");
      });

      return this.connection;
    } catch (error) {
      console.error("Database connection failed:", error.message);
      process.exit(1);
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
    }
  }
}

const database = new Database();
export const connectDB = () => database.connect();
export const disconnectDB = () => database.disconnect();
export default database;
