"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.joinLimiter = exports.writeLimiter = exports.loginLimiter = exports.apiLimiter = void 0;
exports.checkAccountLockout = checkAccountLockout;
exports.recordLoginFailure = recordLoginFailure;
exports.recordLoginSuccess = recordLoginSuccess;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const errors_1 = require("../utils/errors");
const audit_repo_1 = require("../repositories/audit.repo");
const config_1 = require("../config");
const testAware = (limit) => (config_1.isTest ? 100_000 : limit);
/** Generic API limiter */
exports.apiLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60_000,
    limit: testAware(300),
    standardHeaders: "draft-7",
    legacyHeaders: false,
});
/** Strict limiter for /auth/login */
exports.loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60_000,
    limit: testAware(20), // per IP; per-account lockout below
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next((0, errors_1.tooMany)()),
});
/** Vote + join endpoints: burst protection. */
exports.writeLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60_000,
    limit: testAware(60),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next((0, errors_1.tooMany)("Too many requests, slow down")),
});
/**
 * Per-account lockout: 5 consecutive failures per identifier (case-insensitive)
 * per IP within 15 minutes → locked for 15 minutes. Audited.
 * In-memory by design for single instance; the Redis-rate-limiter adapter
 * (socket.io-redis / rate-limit-redis) can be plugged in without API changes.
 */
const failures = new Map();
const WINDOW = 15 * 60_000;
const MAX_FAILURES = 5;
function key(identifier, ip) {
    return `${ip}|${identifier.toLowerCase()}`;
}
function checkAccountLockout(identifier, ip) {
    const entry = failures.get(key(identifier, ip));
    if (entry && entry.lockedUntil > Date.now()) {
        throw (0, errors_1.tooMany)("Account temporarily locked due to failed login attempts");
    }
}
function recordLoginFailure(identifier, ip) {
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
        (0, audit_repo_1.audit)({
            action: "auth.lockout",
            entityType: "user",
            entityId: identifier,
            ip,
        });
    }
}
function recordLoginSuccess(identifier, ip) {
    failures.delete(key(identifier, ip));
}
/** Room join codes: 10 attempts / 5 minutes per IP */
exports.joinLimiter = (0, express_rate_limit_1.default)({
    windowMs: 5 * 60_000,
    limit: testAware(10),
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => next((0, errors_1.tooMany)("Too many join attempts")),
});
