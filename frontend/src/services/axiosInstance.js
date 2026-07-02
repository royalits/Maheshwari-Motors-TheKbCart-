import axios from "axios";
import { queryClient } from "./queryClient";
import useStore from "../store";

const API_BASE_URL = import.meta.env.VITE_API_URL;
let isHandlingUnauthorized = false;
let activeFinancialYearSwitchRequests = 0;
let financialYearSwitchIdleTimer = null;
const AUTH_OPTIONAL_PATHS = ["/auth/login", "/auth/admin/register", "/health"];
const GET_CACHE_TTL = 30 * 60 * 1000;
const cacheStore = new Map();
const pendingGetRequests = new Map();
const MUTATION_METHODS = new Set(["post", "put", "patch", "delete"]);

function scheduleFinancialYearSwitchCompletion() {
  if (activeFinancialYearSwitchRequests > 0) return;

  if (financialYearSwitchIdleTimer) {
    window.clearTimeout(financialYearSwitchIdleTimer);
  }

  financialYearSwitchIdleTimer = window.setTimeout(() => {
    if (activeFinancialYearSwitchRequests === 0) {
      useStore.getState().setFinancialYearSwitching(false);
    }
  }, 150);
}

function startFinancialYearSwitchRequest(config) {
  if (!useStore.getState().financialYearSwitching) return config;

  activeFinancialYearSwitchRequests += 1;
  if (financialYearSwitchIdleTimer) {
    window.clearTimeout(financialYearSwitchIdleTimer);
    financialYearSwitchIdleTimer = null;
  }

  config.metadata = {
    ...(config.metadata || {}),
    trackFinancialYearSwitch: true,
  };

  return config;
}

function finishFinancialYearSwitchRequest(config) {
  if (!config?.metadata?.trackFinancialYearSwitch) return;

  activeFinancialYearSwitchRequests = Math.max(0, activeFinancialYearSwitchRequests - 1);
  scheduleFinancialYearSwitchCompletion();
}

const api = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  withCredentials: false,
});

const defaultAdapter = axios.getAdapter(api.defaults.adapter);

function stableSerialize(value) {
  if (value === null || value === undefined) {
    return "";
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${key}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }

  return String(value);
}

function buildRequestUrl(config) {
  const baseURL = config.baseURL || "";
  const url = config.url || "";

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (!baseURL) {
    return url;
  }

  return `${baseURL.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

function buildCacheKey(config) {
  const financialYearId =
    config.headers?.["X-Financial-Year-Id"] ||
    config.headers?.["x-financial-year-id"] ||
    "";
  return `${buildRequestUrl(config)}::${stableSerialize(config.params)}::fy:${financialYearId}`;
}

function cloneData(data) {
  if (typeof globalThis.structuredClone === "function") {
    return globalThis.structuredClone(data);
  }

  try {
    return JSON.parse(JSON.stringify(data));
  } catch {
    return data;
  }
}

function cloneResponse(response, configOverride = response.config) {
  return {
    ...response,
    config: configOverride,
    data: cloneData(response.data),
    headers: { ...response.headers },
    request: response.request,
  };
}

function isCacheableGet(config) {
  const method = (config.method || "get").toLowerCase();
  const shouldSkipCache =
    config.skipCache === true ||
    config.responseType && config.responseType !== "json";

  return method === "get" && !shouldSkipCache;
}

function getCachedResponse(cacheKey) {
  const cachedEntry = cacheStore.get(cacheKey);

  if (!cachedEntry) {
    return null;
  }

  if (Date.now() - cachedEntry.timestamp > GET_CACHE_TTL) {
    cacheStore.delete(cacheKey);
    return null;
  }

  return cachedEntry.response;
}

function waitForPendingRequest(config, pendingPromise) {
  if (!config.signal) {
    return pendingPromise.then((response) => cloneResponse(response, config));
  }

  if (config.signal.aborted) {
    return Promise.reject(new axios.CanceledError("Request aborted"));
  }

  return new Promise((resolve, reject) => {
    const handleAbort = () => {
      reject(new axios.CanceledError("Request aborted"));
    };

    config.signal.addEventListener("abort", handleAbort, { once: true });

    pendingPromise
      .then((response) => {
        config.signal?.removeEventListener("abort", handleAbort);
        resolve(cloneResponse(response, config));
      })
      .catch((error) => {
        config.signal?.removeEventListener("abort", handleAbort);
        reject(error);
      });
  });
}

export function invalidateClientCache() {
  cacheStore.clear();
  pendingGetRequests.clear();
  queryClient.invalidateQueries();
}

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  const requestUrl = config.url || "";
  const needsAuth = !AUTH_OPTIONAL_PATHS.some((path) =>
    requestUrl.includes(path),
  );

  if (needsAuth && !token) {
    const error = new Error("Missing authentication token");
    error.code = "MISSING_TOKEN";
    return Promise.reject(error);
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const financialYearId = localStorage.getItem("financial_year_id");
  if (needsAuth && financialYearId) {
    config.headers["X-Financial-Year-Id"] = financialYearId;
  }

  if (needsAuth) {
    startFinancialYearSwitchRequest(config);
  }

  // Handle FormData - remove Content-Type header to let browser set it with boundary
  if (config.data instanceof FormData) {
    delete config.headers["Content-Type"];
  }

  if (isCacheableGet(config)) {
    const cacheKey = buildCacheKey(config);
    config.metadata = {
      ...(config.metadata || {}),
      cacheKey,
    };

    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      config.adapter = async () => cloneResponse(cachedResponse, config);
      return config;
    }

    const pendingPromise = pendingGetRequests.get(cacheKey);
    if (pendingPromise) {
      config.adapter = () => waitForPendingRequest(config, pendingPromise);
      return config;
    }

    config.adapter = async (adapterConfig) => {
      const requestPromise = defaultAdapter(adapterConfig);
      pendingGetRequests.set(cacheKey, requestPromise);

      try {
        return await requestPromise;
      } finally {
        pendingGetRequests.delete(cacheKey);
      }
    };
  }

  return config;
});

api.interceptors.response.use(
  (response) => {
    finishFinancialYearSwitchRequest(response.config);

    const method = (response.config?.method || "get").toLowerCase();
    const cacheKey = response.config?.metadata?.cacheKey;

    if (method === "get" && cacheKey && response.status >= 200 && response.status < 300) {
      cacheStore.set(cacheKey, {
        timestamp: Date.now(),
        response: cloneResponse(response),
      });
    }

    if (MUTATION_METHODS.has(method) && response.status >= 200 && response.status < 300) {
      invalidateClientCache();
    }

    return response;
  },
  (error) => {
    finishFinancialYearSwitchRequest(error.config);

    const method = (error.config?.method || "").toLowerCase();
    const cacheKey = error.config?.metadata?.cacheKey;

    if (method === "get" && cacheKey) {
      pendingGetRequests.delete(cacheKey);
    }

    if (
      (error.response?.status === 401 || error.response?.status === 402) &&
      !isHandlingUnauthorized
    ) {
      isHandlingUnauthorized = true;
      invalidateClientCache();
      localStorage.removeItem("token");

      if (!window.location.pathname.includes("/login")) {
        window.location.href = "/login";
      }

      setTimeout(() => {
        isHandlingUnauthorized = false;
      }, 300);
    }

    return Promise.reject(error);
  },
);

export default api;
