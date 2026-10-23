import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string(),
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  REDIS_URL: z.string().optional(),
  IMPORT_MAX_FILE_MB: z.coerce.number().default(5),
  IMPORT_MAX_ROWS: z.coerce.number().default(5000),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
export const isTest = env.NODE_ENV === "test";
