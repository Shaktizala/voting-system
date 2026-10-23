"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTest = exports.isProd = exports.env = void 0;
require("dotenv/config");
const zod_1 = require("zod");
const envSchema = zod_1.z.object({
    DATABASE_URL: zod_1.z.string(),
    PORT: zod_1.z.coerce.number().default(4000),
    NODE_ENV: zod_1.z.enum(["development", "test", "production"]).default("development"),
    WEB_ORIGIN: zod_1.z.string().default("http://localhost:5173"),
    SESSION_TTL_HOURS: zod_1.z.coerce.number().default(12),
    REDIS_URL: zod_1.z.string().optional(),
    IMPORT_MAX_FILE_MB: zod_1.z.coerce.number().default(5),
    IMPORT_MAX_ROWS: zod_1.z.coerce.number().default(5000),
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}
exports.env = parsed.data;
exports.isProd = exports.env.NODE_ENV === "production";
exports.isTest = exports.env.NODE_ENV === "test";
