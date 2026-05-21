import { defineConfig } from "drizzle-kit";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/swamp_sync_v2";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      typeof process.env.DATABASE_URL === "string" &&
      process.env.DATABASE_URL.trim() !== ""
        ? process.env.DATABASE_URL
        : DEFAULT_DATABASE_URL,
  },
});
