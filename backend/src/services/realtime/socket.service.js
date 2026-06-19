import jwt from "jsonwebtoken";
import { Server } from "socket.io";
import env from "../../config/env.js";
import Session from "../../models/auth/session.model.js";
import User from "../../models/auth/user.model.js";

let io = null;

const userRoom = (userId) => `user:${String(userId)}`;

export const initSocket = (server, corsOptions = {}) => {
  io = new Server(server, {
    cors: corsOptions,
    transports: ["websocket", "polling"],
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.query?.token ||
        "";

      if (!token || typeof token !== "string") {
        return next(new Error("Missing authentication token"));
      }

      const decoded = jwt.verify(token, env.JWT_SECRET);
      const session = await Session.findOne({ token }).lean();
      if (!session) return next(new Error("Session expired or revoked"));

      const user = await User.findById(decoded._id).select("_id is_active").lean();
      if (!user || !user.is_active) {
        return next(new Error("User not found or inactive"));
      }

      socket.data.userId = String(user._id);
      socket.join(userRoom(user._id));
      return next();
    } catch {
      return next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    socket.emit("socket:ready", { user_id: socket.data.userId });
  });

  return io;
};

export const emitStockUpdate = (userId, item) => {
  if (!io || !userId || !item?._id) return;

  io.to(userRoom(userId)).emit("stock:update", {
    id: String(item._id),
    item_id: String(item._id),
    item_code: item.item_id || "",
    physical_stock: Number(item.physical_stock || 0),
    logical_stock: Number(item.logical_stock || 0),
    opening_physical_stock: Number(item.opening_physical_stock || 0),
    opening_logical_stock: Number(item.opening_logical_stock || 0),
    stock:
      Number(item.opening_physical_stock || 0) +
      Number(item.physical_stock || 0),
    updated_at: new Date().toISOString(),
  });
};

export const emitChallanUpdate = (userId, action = "changed", challan = null) => {
  if (!io || !userId) return;

  const payload = {
    action,
    updated_at: new Date().toISOString(),
  };

  if (Array.isArray(challan)) {
    payload.challan_ids = challan
      .map((row) => row?._id || row?.id || row?.challan_id || row)
      .filter(Boolean)
      .map(String);
  } else if (challan && typeof challan === "object") {
    const challanId =
      challan._id ||
      challan.id ||
      challan.challan_id ||
      (Array.isArray(challan.challan_ids) ? null : undefined);

    if (challanId) {
      payload.id = String(challanId);
      payload.challan_id = String(challanId);
    }

    if (Array.isArray(challan.challan_ids)) {
      payload.challan_ids = challan.challan_ids.filter(Boolean).map(String);
    }

    if (challan.challan_no) payload.challan_no = challan.challan_no;
    if (challan.challan_type) payload.challan_type = challan.challan_type;
    if (challan.bill_id) payload.bill_id = String(challan.bill_id);
    if (challan.is_gst !== undefined) payload.is_gst = Number(challan.is_gst);
    if (challan.converted_to_bill !== undefined) {
      payload.converted_to_bill = Boolean(challan.converted_to_bill);
    }
  } else if (challan) {
    payload.challan_id = String(challan);
  }

  io.to(userRoom(userId)).emit("challan:update", payload);
};

export const getSocketServer = () => io;
