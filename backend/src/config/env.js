import dotenv from "dotenv";
import path from "path";

console.log("Current working directory:", process.cwd());
console.log(".env file path:", path.resolve(process.cwd(), ".env"));
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

console.log("dotenv loaded from:", path.resolve(process.cwd(), ".env"));
console.log("MONGODB_URI:", process.env.MONGODB_URI);

class ENV {
  env = {
    MODE: "",
    PORT: 0,
    API_VERSION: "",
    MONGODB_URI: "",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    AWS_SESSION_TOKEN: "",
    AWS_REGION: "",
    AWS_S3_BUCKET_NAME: "",
    JWT_SECRET: "",
    JWT_EXPIRES_IN: "",
    RATE_LIMIT_MS: 0,
    RATE_LIMIT_MAX_REQUESTS: 0,
    CORS_ORIGIN: "",
    DEFAULT_PAGE_SIZE: 5,
    MAX_PAGE_SIZE: 10,
  };

  constructor() {
    console.log("Loading environment variables...");
    this.env.MODE = process.env.MODE || "production";
    this.env.PORT = Number(process.env.PORT) || 3000;
    this.env.API_VERSION = process.env.API_VERSION || "v1";
    this.env.MONGODB_URI = process.env.MONGODB_URI || "";
    this.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "";
    this.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "";
    this.env.AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || "";
    this.env.AWS_REGION =
      process.env.AWS_REGION ||
      process.env.AWS_S3_REGION ||
      process.env.AWS_DEFAULT_REGION ||
      "";
    this.env.AWS_S3_BUCKET_NAME =
      process.env.AWS_S3_BUCKET_NAME ||
      process.env.AWS_BUCKET_NAME ||
      process.env.AWS_S3_BUCKET ||
      "";
    this.env.JWT_SECRET = process.env.JWT_SECRET || "";
    this.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "";
    this.env.RATE_LIMIT_MS = Number(process.env.RATE_LIMIT_WINDOW_MS) || 0;
    this.env.RATE_LIMIT_MAX_REQUESTS =
      Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 0;

    const FRONTEND_URL = "https://maheshwari-motors-efuh.vercel.app";

    if (!process.env.CORS_ORIGIN || process.env.CORS_ORIGIN.trim() === "*") {
      this.env.CORS_ORIGIN = "*";
    } else {
      const origins = process.env.CORS_ORIGIN.split(",").map((o) => o.trim());
      if (!origins.includes(FRONTEND_URL)) origins.push(FRONTEND_URL);
      this.env.CORS_ORIGIN = origins;
    }

    this.env.DEFAULT_PAGE_SIZE = Number(process.env.DEFAULT_PAGE_SIZE) || 5;
    this.env.MAX_PAGE_SIZE = Number(process.env.MAX_PAGE_SIZE) || 10;
    console.log("ENV constructor completed, MONGODB_URI:", this.env.MONGODB_URI);
  }
}

export default new ENV().env;
