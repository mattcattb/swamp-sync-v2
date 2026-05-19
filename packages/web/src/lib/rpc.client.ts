import {hc} from "hono/client";
import type {AppType} from "@swamp-sync-v2/server/rpc";

const rawBaseUrl = import.meta.env.VITE_API_URL?.trim() ?? "";

export const API_BASE_URL =
  rawBaseUrl && !rawBaseUrl.startsWith("http")
    ? `http://${rawBaseUrl}`
    : rawBaseUrl;

export const rpcClient = hc<AppType>(API_BASE_URL, {
  init: {
    credentials: "include",
  },
});
