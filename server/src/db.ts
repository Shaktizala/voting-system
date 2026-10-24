import { Prisma, PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

/**
 * Pool sizing: Prisma defaults to (2 × CPUs + 1) connections. Live voting is a
 * burst workload, so allow overriding it (DB_POOL_SIZE) and give queued
 * requests a longer wait (DB_POOL_TIMEOUT_S) before failing.
 */
function datasourceUrl(): string | undefined {
  const raw = process.env.DATABASE_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  if (process.env.DB_POOL_SIZE && !url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", process.env.DB_POOL_SIZE);
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", process.env.DB_POOL_TIMEOUT_S ?? "20");
  }
  return url.toString();
}

export const prisma =
  global.prisma ??
  new PrismaClient({
    datasourceUrl: datasourceUrl(),
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") global.prisma = prisma;

/** Interactive-transaction limits for request paths (Prisma default maxWait is 2s). */
export const TX_OPTIONS = { maxWait: 10_000, timeout: 15_000 } as const;

/**
 * Errors that are safe to retry: pool/tx-start timeouts, write conflicts,
 * deadlocks and serialization failures.
 */
export function isTransientDbError(e: unknown): boolean {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2024", "P2028", "P2034"].includes(e.code)) return true;
    const pgCode = (e.meta as { code?: string } | undefined)?.code;
    return pgCode === "40001" || pgCode === "40P01";
  }
  const msg = e instanceof Error ? e.message : "";
  return /deadlock detected|could not serialize access/i.test(msg);
}

/** Retries an idempotent DB operation on transient failures with jittered backoff. */
export async function withDbRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts || !isTransientDbError(e)) throw e;
      await new Promise((r) => setTimeout(r, 50 * 2 ** i + Math.random() * 100));
    }
  }
}
