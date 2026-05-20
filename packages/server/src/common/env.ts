import {z} from "zod";

const DEFAULT_REDIS_URL = "redis://localhost:6379";
const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:5432/swamp_sync_v2";
const DEFAULT_BETTER_AUTH_SECRET = "dev-secret-change-me-32-characters";
const DEFAULT_BETTER_AUTH_URL = "http://localhost:5173";

const optionalStringWithDefault = (defaultValue: string) =>
  z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    return defaultValue;
  }, z.string());

const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: optionalStringWithDefault(DEFAULT_BETTER_AUTH_SECRET),
  BETTER_AUTH_URL: optionalStringWithDefault(DEFAULT_BETTER_AUTH_URL),
});

const googleEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
});

const githubEnvSchema = z.object({
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const appEnvSchema = z.object({
  ...betterAuthSchema.shape,
  ...googleEnvSchema.shape,
  ...githubEnvSchema.shape,
  DATABASE_URL: optionalStringWithDefault(DEFAULT_DATABASE_URL),
  REDIS_URL: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }
    return DEFAULT_REDIS_URL;
  }, z.string().url()),

  LOG_LEVEL: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),

  NODE_ENV: z.string().optional(),

  PORT: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }, z.number().int().positive().default(3000)),
});
export const appEnv = appEnvSchema.parse(process.env);
