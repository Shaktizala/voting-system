import rateLimit from "express-rate-limit";
import type { Request } from "express";
import { tooMany } from "../utils/errors";
import { audit } from "../repositories/audit.repo";
import { isTest } from "../config";

const testAware = (limit: number) => (isTest ? 100_000 : limit);

/** One normalisation for every identifier key, matching the login lookup (trim + lowercase). */
const normalise = (identifier: string) => identifier.trim().toLowerCase();

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
  const identifier = typeof req.body?.identifier === "string" ? normalise(req.body.identifier) : "";
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

/**
 * /auth/login — per account (shared IP no longer blocks). Only *failed*
 * attempts count: otherwise anyone could lock a participant out for the whole
 * window by sending requests with their username. An admin password reset
 * clears it (see clearLockout).
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: testAware(20),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: loginKey,
  skipSuccessfulRequests: true,
  handler: (_req, _res, next) => next(tooMany("Too many failed sign-in attempts. Try again later, or ask an admin to reset your password.")),
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

/** Room join codes: 10 attempts / 5 minutes per user (shared Wi-Fi must not block). */
export const joinLimiter = rateLimit({
  windowMs: 5 * 60_000,
  limit: testAware(10),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: userKey,
  handler: (_req, _res, next) => next(tooMany("Too many join attempts")),
});

/**
 * Fast lockout for one guesser: 10 failures for one identifier from one IP
 * within 15 minutes locks that pair for 5 minutes (audited). Other people on
 * the same venue IP are unaffected; guessing spread across IPs is capped
 * account-wide by loginLimiter. An admin password reset clears both.
 */
const failures = new Map<string, { count: number; firstAt: number; lockedUntil: number }>();
const WINDOW = 15 * 60_000;
const LOCK_MS = 5 * 60_000;
const MAX_FAILURES = 10;

const lockKey = (identifier: string, ip: string) => `${ip}|${normalise(identifier)}`;

export function checkAccountLockout(identifier: string, ip: string) {
  const entry = failures.get(lockKey(identifier, ip));
  if (entry && entry.lockedUntil > Date.now()) {
    throw tooMany("Account temporarily locked due to failed login attempts. Try again in a few minutes.");
  }
}

export function recordLoginFailure(identifier: string, ip: string) {
  const k = lockKey(identifier, ip);
  const now = Date.now();
  const entry = failures.get(k);
  if (!entry || now - entry.firstAt > WINDOW) {
    failures.set(k, { count: 1, firstAt: now, lockedUntil: 0 });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_FAILURES && entry.lockedUntil <= now) {
    entry.lockedUntil = now + LOCK_MS;
    audit({
      action: "auth.lockout",
      entityType: "user",
      entityId: identifier,
      ip,
    });
  }
}

export function recordLoginSuccess(identifier: string, ip: string) {
  failures.delete(lockKey(identifier, ip));
}

/** Lifts every lockout for these identifiers (username/email): all IPs, and the per-account limiter. */
export function clearLockout(...identifiers: string[]) {
  const ids = new Set(identifiers.map(normalise));
  for (const k of failures.keys()) {
    if (ids.has(k.slice(k.indexOf("|") + 1))) failures.delete(k);
  }
  for (const id of ids) void loginLimiter.resetKey(`login:${id}`);
}

// keep the map bounded: forget windows that have fully expired
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of failures) {
    if (now - e.firstAt > WINDOW && e.lockedUntil < now) failures.delete(k);
  }
}, 60_000).unref?.();
