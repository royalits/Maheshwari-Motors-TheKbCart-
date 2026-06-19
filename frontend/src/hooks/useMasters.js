import { useQuery } from "@tanstack/react-query";
import api from "../services/axiosInstance";
import {
  getResponseList,
  getResponseMeta,
  normalizeBrand,
  getEntityId,
  toNumber,
} from "../services/apiUtils";

async function fetchAllBrandPages() {
  let allBrands = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await api.get("/brands", {
        params: { page, limit: 100 },
      });
      const pageBrands = getResponseList(response);
      allBrands = [...allBrands, ...pageBrands];

      const meta = getResponseMeta(response);
      if (meta?.hasNextPage) {
        page++;
      } else {
        hasMore = false;
      }
      if (pageBrands.length === 0) hasMore = false;
      if (page > 50) hasMore = false;
    } catch {
      hasMore = false;
    }
  }

  return allBrands.map((brand) => {
    const normalized = normalizeBrand(brand);
    return { id: normalized.id, name: normalized.name, raw: brand };
  });
}

export function useAllBrands(options = {}) {
  return useQuery({
    queryKey: ["brands", "all"],
    queryFn: fetchAllBrandPages,
    staleTime: Infinity,
    ...options,
  });
}

export function useBrands(params = {}, options = {}) {
  return useQuery({
    queryKey: ["brands", params],
    queryFn: async () => {
      const response = await api.get("/brands", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useHsns(params = { page: 1, limit: 200 }, options = {}) {
  return useQuery({
    queryKey: ["hsns", params],
    queryFn: async () => {
      const response = await api.get("/hsn", { params });
      return getResponseList(response)
        .filter((hsn) => hsn?.is_active !== false)
        .map((hsn) => ({
          _id: getEntityId(hsn),
          hsn_number: hsn?.hsn_code || "",
          gst_percentage: toNumber(hsn?.gst_rate, 0),
        }));
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useDepartments(options = {}) {
  return useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const response = await api.get("/departments");
      return getResponseList(response).map((dept) => ({
        id: getEntityId(dept),
        name: dept?.department_name || dept?.name,
      }));
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useAgents(params = {}, options = {}) {
  return useQuery({
    queryKey: ["agents", params],
    queryFn: async () => {
      const response = await api.get("/agents", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useTransports(params = {}, options = {}) {
  return useQuery({
    queryKey: ["transports", params],
    queryFn: async () => {
      const response = await api.get("/transports", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useAreas(params = {}, options = {}) {
  return useQuery({
    queryKey: ["areas", params],
    queryFn: async () => {
      const response = await api.get("/areas", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useBanks(params = {}, options = {}) {
  return useQuery({
    queryKey: ["banks", params],
    queryFn: async () => {
      const response = await api.get("/banks", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useContacts(params = {}, options = {}) {
  return useQuery({
    queryKey: ["contacts", params],
    queryFn: async () => {
      const response = await api.get("/contacts", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useLabels(params = {}, options = {}) {
  return useQuery({
    queryKey: ["labels", params],
    queryFn: async () => {
      const response = await api.get("/labels", { params });
      return {
        data: getResponseList(response),
        meta: getResponseMeta(response),
      };
    },
    staleTime: Infinity,
    ...options,
  });
}
