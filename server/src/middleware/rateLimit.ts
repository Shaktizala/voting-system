import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { tooMany } from "../utils/errors";
import { audit } from "../repositories/audit.repo";
import { isTest } from "../config";

const testAware = (limit: number) => (isTest ? 100_000 : limit);

/**
 * Participants at a live event usually share one venue/NAT IP, so per-IP limits
 * would throttle everybody at once. Authenticated traffic is therefore keyed by
 * user id; only anonymous pre-login traffic is keyed by IP (with a high ceiling).
 */
export function userKey(req: Request): string {
  return req.user?.id ? `u:${req.user.id}` : `ip:${req.ip ?? "unknown"}`;
}

/** Anonymous fallback key (IP) for unauthenticated traffic. */
function ipKey(req: Request): string {
  return `ip:${req.ip ?? "unknown"}`;
}

/** Login is keyed by the attempted account so a shared NAT can't lock out others. */
export function loginKey(req: Request): string {
  const identifier =
    typeof req.body?.identifier === "string" ? req.body.identifier.trim().toLowerCase() : "";
  return identifier ? `login:${identifier}` : ipKey(req);
}

/** Generic API limiter — authenticated requests, keyed per user. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: testAware(300),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userKey,
  skip: (req) => !req.user, // unauthenticated traffic is handled by anonLimiter
});

/**
 * Unauthenticated (pre-login) traffic. Keyed by IP but with a much higher
 * ceiling than the old per-IP 300/min, so a room full of people logging in from
 * one venue IP is not blocked by each other.
 *
 * `/auth/login` is exempt from this per-minute limit: login is governed solely
 * by {@link loginLimiter} (per account) + the account lockout, so an event-wide
 * sign-in burst is never throttled by the minute window.
 */
export const anonLimiter = rateLimit({
  windowMs: 60_000,
  limit: testAware(1000),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: ipKey,
  skip: (req) => !!req.user || req.path === "/auth/login",
});

/** Strict limiter for /auth/login — per account (shared IP no longer blocks). */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: testAware(20), // per account identifier; per-account lockout below
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: loginKey,
  handler: (_req, _res, next) => next(tooMany()),
});

/** Vote + join endpoints: burst protection, per user. */
export const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: testAware(60),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userKey,
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

/** Room join codes: 10 attempts / 5 minutes per user (shared Wi-Fi must not block). */
export const joinLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: testAware(10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userKey,
  handler: (_req, _res, next) => next(tooMany("Too many join attempts")),
});
