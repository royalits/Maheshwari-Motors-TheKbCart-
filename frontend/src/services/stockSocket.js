import { io } from "socket.io-client";
import { queryClient } from "./queryClient";
import { invalidateClientCache } from "./axiosInstance";

let socket = null;

const API_BASE_URL = import.meta.env.VITE_API_URL;

export const STOCK_UPDATE_EVENT = "stock:update";
export const CHALLAN_UPDATE_EVENT = "challan:update";

const patchItemStock = (item, stock) => {
  const updatedId = String(stock.item_id || stock.id || "");
  const itemId = String(item?.id || item?._id || "");
  if (!updatedId || itemId !== updatedId) return item;

  return {
    ...item,
    stock: stock.physical_stock,
    stockCount: stock.physical_stock,
    physicalStock: stock.physical_stock,
    physical_stock: stock.physical_stock,
    logicalStock: stock.logical_stock,
    logical_stock: stock.logical_stock,
    opening_physical_stock: stock.opening_physical_stock,
    opening_logical_stock: stock.opening_logical_stock,
  };
};

const patchCachedStock = (cached, stock) => {
  if (Array.isArray(cached)) {
    return cached.map((item) => patchItemStock(item, stock));
  }

  if (cached?.data && Array.isArray(cached.data)) {
    return {
      ...cached,
      data: cached.data.map((item) => patchItemStock(item, stock)),
    };
  }

  return patchItemStock(cached, stock);
};

export const connectStockSocket = () => {
  const token = localStorage.getItem("token");
  if (!token || !API_BASE_URL) return null;

  if (socket?.connected) return socket;

  if (socket) socket.disconnect();

  socket = io(API_BASE_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  });

  socket.on("stock:update", (payload) => {
    queryClient.setQueriesData({ queryKey: ["items"] }, (cached) =>
      patchCachedStock(cached, payload),
    );
    queryClient.setQueriesData({ queryKey: ["items-low-stock"] }, (cached) =>
      patchCachedStock(cached, payload),
    );
    invalidateClientCache();
    window.dispatchEvent(new CustomEvent(STOCK_UPDATE_EVENT, { detail: payload }));
  });

  socket.on("challan:update", (payload) => {
    queryClient.invalidateQueries({ queryKey: ["challans"] });
    invalidateClientCache();
    window.dispatchEvent(new CustomEvent(CHALLAN_UPDATE_EVENT, { detail: payload }));
  });

  socket.on("connect_error", (error) => {
    if (/token|auth|session/i.test(error?.message || "")) {
      socket?.disconnect();
    }
  });

  return socket;
};

export const disconnectStockSocket = () => {
  if (!socket) return;
  socket.disconnect();
  socket = null;
};
