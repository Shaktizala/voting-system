"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CSRF_COOKIE = exports.SESSION_COOKIE = void 0;
exports.sessionCookieOptions = sessionCookieOptions;
exports.attachUser = attachUser;
exports.requireAuth = requireAuth;
exports.requirePermission = requirePermission;
exports.ensureCsrfCookie = ensureCsrfCookie;
exports.verifyCsrf = verifyCsrf;
const crypto_1 = __importDefault(require("crypto"));
const config_1 = require("../config");
const session_repo_1 = require("../repositories/session.repo");
const shared_1 = require("@voting/shared");
const errors_1 = require("../utils/errors");
const codes_1 = require("../utils/codes");
exports.SESSION_COOKIE = "session";
exports.CSRF_COOKIE = "csrf";
function sessionCookieOptions(maxAgeMs) {
    return {
        httpOnly: true,
        secure: config_1.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: maxAgeMs,
    };
}
/** Resolves the session cookie to req.user (or 401 for API-bound guards). */
async function attachUser(req, _res, next) {
    const token = req.cookies?.[exports.SESSION_COOKIE];
    if (!token)
        return next();
    const session = await session_repo_1.sessionRepo.findValid((0, codes_1.sha256)(token));
    if (!session || session.expiresAt < new Date())
        return next();
    if (session.user.status !== "ACTIVE" || session.user.deletedAt)
        return next();
    req.user = {
        id: session.user.id,
        name: session.user.name,
        username: session.user.username,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        mustChangePassword: session.user.mustChangePassword,
        teamId: session.user.teamId,
    };
    next();
}
function requireAuth(req, _res, next) {
    if (!req.user)
        return next((0, errors_1.unauthorized)());
    next();
}
function requirePermission(permission) {
    return (req, _res, next) => {
        if (!req.user)
            return next((0, errors_1.unauthorized)());
        if (!(0, shared_1.roleHas)(req.user.role, permission))
            return next((0, errors_1.forbidden)(`Missing permission: ${permission}`));
        next();
    };
}
/* --------------------------------- CSRF -------------------------------- */
function ensureCsrfCookie(req, res, next) {
    if (!req.cookies?.[exports.CSRF_COOKIE]) {
        res.cookie(exports.CSRF_COOKIE, crypto_1.default.randomBytes(24).toString("base64url"), {
            httpOnly: false,
            secure: config_1.env.NODE_ENV === "production",
            sameSite: "strict",
            path: "/",
        });
    }
    next();
}
function verifyCsrf(req, _res, next) {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method))
        return next();
    const cookieToken = req.cookies?.[exports.CSRF_COOKIE];
    const headerToken = req.get("x-csrf-token");
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
        return next((0, errors_1.forbidden)("CSRF token missing or invalid"));
    }
    next();
}
