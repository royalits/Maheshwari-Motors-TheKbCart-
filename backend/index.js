import initializeApp from "./src/app.js";
console.log("Starting application from:", process.cwd());

import { connectDB } from "./src/config/database.js";
import dns from "node:dns";
dns.setServers(["1.1.1.1"]);

class Server {
  async start() {
    try {
      console.log("Starting server...");
      await connectDB();
      console.log("Database connected, initializing app...");
      initializeApp();
    } catch (error) {
      console.error("Error during startup:", error);
    }
  }
}

new Server().start();
