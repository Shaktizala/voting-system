import rateLimit from "express-rate-limit";
import { tooMany } from "../utils/errors";
import { audit } from "../repositories/audit.repo";
import { isTest } from "../config";

const testAware = (limit: number) => (isTest ? 100_000 : limit);

/** Generic API limiter */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: testAware(300),
  standardHeaders: "draft-7",
  legacyHeaders: false,
});

/** Strict limiter for /auth/login */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: testAware(20), // per IP; per-account lockout below
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => next(tooMany()),
});

/** Vote + join endpoints: burst protection. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: testAware(60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => next(tooMany("Too many requests, slow down")),
});

/**
 * Per-account lockout: 5 consecutive failures per identifier (case-insensitive)
 * per IP within 15 minutes → locked for 15 minutes. Audited.
 * In-memory by design for single instance; the Redis-rate-limiter adapter
 * (socket.io-redis / rate-limit-redis) can be plugged in without API changes.
 */
const failures = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
const WINDOW = 15 * 60_000;
const MAX_FAILURES = 5;

function key(identifier: string, ip: string) {
  return `${ip}|${identifier.toLowerCase()}`;
}

export function checkAccountLockout(identifier: string, ip: string) {
  const entry = failures.get(key(identifier, ip));
  if (entry && entry.lockedUntil > Date.now()) {
    throw tooMany("Account temporarily locked due to failed login attempts");
  }
}

export function recordLoginFailure(identifier: string, ip: string) {
  const k = key(identifier, ip);
  const now = Date.now();
  const entry = failures.get(k);
  if (!entry || now - entry.firstAt > WINDOW) {
    failures.set(k, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES) {
    entry.lockedUntil = now + WINDOW;
    audit({
      action: "auth.lockout",
      entityType: "user",
      entityId: identifier,
      ip,
    });
  }
}

export function recordLoginSuccess(identifier: string, ip: string) {
  failures.delete(key(identifier, ip));
}

/** Room join codes: 10 attempts / 5 minutes per IP */
export const joinLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: testAware(10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, _res, next) => next(tooMany("Too many join attempts")),
});
