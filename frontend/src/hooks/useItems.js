import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../services/axiosInstance";
import {
  getResponseList,
  getResponseMeta,
  normalizeItem,
  getEntityId,
  toNumber,
} from "../services/apiUtils";

const ITEMS_KEY = "items";
const LOW_STOCK_KEY = "items-low-stock";

async function fetchAllItemPages(params = {}) {
  let allItems = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const response = await api.get("/items", {
      params: { page, limit: 100, ...params },
    });

    const pageItems = getResponseList(response);
    const meta = getResponseMeta(response);

    allItems = [...allItems, ...pageItems];

    if (meta?.hasNextPage) {
      page = toNumber(meta.page, page) + 1;
    } else {
      hasMore = false;
    }

    if (!meta && pageItems.length === 0) hasMore = false;
    if (page > 100) hasMore = false;
  }

  return allItems;
}

export function useAllItems(options = {}) {
  return useQuery({
    queryKey: [ITEMS_KEY, "all"],
    queryFn: () => fetchAllItemPages(),
    ...options,
  });
}

export function useItems(params = {}, options = {}) {
  return useQuery({
    queryKey: [ITEMS_KEY, params],
    queryFn: async () => {
      const response = await api.get("/items", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    ...options,
  });
}

export function useLowStockItems(params = {}, options = {}) {
  return useQuery({
    queryKey: [LOW_STOCK_KEY, params],
    queryFn: async () => {
      const response = await api.get("/items/low-stock", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    ...options,
  });
}

export function useBatchUpdateItems() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (updates) => {
      const response = await api.put("/items/batch-update", { updates });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEMS_KEY] });
      queryClient.invalidateQueries({ queryKey: [LOW_STOCK_KEY] });
    },
  });
}

export function useUpdateItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, formData, hasFile }) => {
      const response = await api.put(`/items/${itemId}`, formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [ITEMS_KEY] });
      queryClient.invalidateQueries({ queryKey: [LOW_STOCK_KEY] });
    },
  });
}

export function useInvalidateItems() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: [ITEMS_KEY] });
    queryClient.invalidateQueries({ queryKey: [LOW_STOCK_KEY] });
  };
}
