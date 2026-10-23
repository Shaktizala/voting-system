"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authService = void 0;
const argon2_1 = __importDefault(require("argon2"));
const config_1 = require("../config");
const session_repo_1 = require("../repositories/session.repo");
const user_repo_1 = require("../repositories/user.repo");
const audit_repo_1 = require("../repositories/audit.repo");
const codes_1 = require("../utils/codes");
const errors_1 = require("../utils/errors");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const TTL_MS = () => config_1.env.SESSION_TTL_HOURS * 3600_000;
exports.authService = {
    buildCookieOptions: auth_1.sessionCookieOptions,
    async login(identifier, password, ip, userAgent, res) {
        (0, rateLimit_1.checkAccountLockout)(identifier, ip);
        let user = await user_repo_1.userRepo.findByIdentifier(identifier);
        if (user) {
            const ok = await argon2_1.default.verify(user.passwordHash, password).catch(() => false);
            if (!ok)
                user = null;
        }
        if (!user) {
            (0, rateLimit_1.recordLoginFailure)(identifier, ip);
            (0, audit_repo_1.audit)({ action: "auth.login_failed", entityType: "user", entityId: identifier, ip });
            throw (0, errors_1.unauthorized)("Invalid credentials");
        }
        if (user.status !== "ACTIVE") {
            throw (0, errors_1.unauthorized)("Invalid credentials"); // generic: don't reveal deactivated state
        }
        (0, rateLimit_1.recordLoginSuccess)(identifier, ip);
        const token = (0, codes_1.randomToken)();
        const expiresAt = new Date(Date.now() + TTL_MS());
        await session_repo_1.sessionRepo.create(user.id, (0, codes_1.sha256)(token), expiresAt, ip, userAgent);
        res.cookie(auth_1.SESSION_COOKIE, token, (0, auth_1.sessionCookieOptions)(TTL_MS()));
        (0, audit_repo_1.audit)({
            actorId: user.id,
            action: "auth.login",
            entityType: "user",
            entityId: user.id,
            ip,
        });
        return {
            id: user.id,
            name: user.name,
            username: user.username,
            email: user.email,
            role: user.role,
            mustChangePassword: user.mustChangePassword,
        };
    },
    async logout(token) {
        if (token)
            await session_repo_1.sessionRepo.delete((0, codes_1.sha256)(token));
    },
    async logoutAll(userId, exceptToken) {
        await session_repo_1.sessionRepo.deleteAllForUser(userId, exceptToken ? (0, codes_1.sha256)(exceptToken) : undefined);
    },
    async changePassword(userId, currentPassword, newPassword, token) {
        const user = await user_repo_1.userRepo.findById(userId);
        if (!user)
            throw (0, errors_1.unauthorized)();
        const ok = await argon2_1.default.verify(user.passwordHash, currentPassword).catch(() => false);
        if (!ok)
            throw new errors_1.HttpError(400, "Current password is incorrect");
        const passwordHash = await argon2_1.default.hash(newPassword, { type: argon2_1.default.argon2id });
        await user_repo_1.userRepo.update(user.id, { passwordHash, mustChangePassword: false });
        // invalidate other sessions; keep the current one
        if (token)
            await session_repo_1.sessionRepo.deleteAllForUser(userId, (0, codes_1.sha256)(token));
        (0, audit_repo_1.audit)({ actorId: userId, action: "auth.password_changed", entityType: "user", entityId: userId });
    },
    /** Hash for temporary credentials (import/reset). */
    hashPassword(password) {
        return argon2_1.default.hash(password, { type: argon2_1.default.argon2id });
    },
    generateTemporaryPassword: codes_1.generateTemporaryPassword,
};
