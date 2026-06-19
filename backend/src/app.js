import express from "express";
import { createServer } from "node:http";
import cors from "cors";
import routes from "./routers/index.js";
import { errorHandler, notFoundHandler } from "./middlewares/index.js";
import env from "./config/env.js";
import asyncHandler from "./utils/asyncHandler.js";
import { initSocket } from "./services/realtime/socket.service.js";
import { startSubscriptionCron } from "./jobs/subscriptionExpiry.cron.js";
import { startAutoBillCron } from "./jobs/autoBill.cron.js";

const health = (res) => {
  res.status(200).json({
    status: "ok",
    message: "Service is active! 🚀",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

const initializeApp = asyncHandler(() => {
  const app = express();
  app.set("trust proxy", 1);

  const corsOptions = {
    origin: env.CORS_ORIGIN || "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Financial-Year-Id",
      "x-financial-year-id",
      "X-Financial-Year",
      "x-financial-year",
    ],
  };

  app.use(cors(corsOptions));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.get("/", (_, res) => health(res));
  app.use("/api/v1", routes);
  app.use(notFoundHandler);
  app.use(errorHandler);

  const server = createServer(app);
  initSocket(server, corsOptions);

  server.listen(env.PORT, () => {
    startSubscriptionCron();
    startAutoBillCron();
  });
});

export default initializeApp;
