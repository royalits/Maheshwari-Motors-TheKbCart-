import { useQuery } from "@tanstack/react-query";
import api from "../services/axiosInstance";
import { getResponseData } from "../services/apiUtils";

export function useDashboard(options = {}) {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const response = await api.get("/dashboard");
      return getResponseData(response);
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useFirmDashboard(options = {}) {
  return useQuery({
    queryKey: ["dashboard", "firm"],
    queryFn: async () => {
      const response = await api.get("/dashboard/firm");
      return getResponseData(response);
    },
    staleTime: Infinity,
    ...options,
  });
}

export function useAuthMe(options = {}) {
  return useQuery({
    queryKey: ["auth", "me"],
    queryFn: async () => {
      const response = await api.get("/auth/me");
      return response.data?.data;
    },
    staleTime: Infinity,
    ...options,
  });
}
