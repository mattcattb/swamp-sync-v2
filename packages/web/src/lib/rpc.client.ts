import {hc} from "hono/client";
import type {AppType} from "@swamp-sync-v2/server/rpc";

const rawBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? "";

export const API_BASE_URL =
  rawBaseUrl && !rawBaseUrl.startsWith("http")
    ? `http://${rawBaseUrl}`
    : rawBaseUrl || "http://localhost:3000";

export const rpcClient = hc<AppType>(API_BASE_URL, {
  init: {
    credentials: "include",
  },
});

export const getRpcErrorMessage = (
  error: unknown,
  fallback = "Something went wrong",
) => {
  const detail = (error as {detail?: {data?: unknown}} | null)?.detail?.data;

  if (
    typeof detail === "object" &&
    detail !== null &&
    "error" in detail &&
    typeof detail.error === "object" &&
    detail.error !== null &&
    "message" in detail.error &&
    typeof detail.error.message === "string"
  ) {
    return detail.error.message;
  }

  if (
    typeof detail === "object" &&
    detail !== null &&
    "error" in detail &&
    typeof detail.error === "string"
  ) {
    return detail.error;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};
