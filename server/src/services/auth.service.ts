import argon2 from "argon2";
import { env } from "../config";
import { sessionRepo } from "../repositories/session.repo";
import { userRepo } from "../repositories/user.repo";
import { audit } from "../repositories/audit.repo";
import { generateTemporaryPassword, randomToken, sha256 } from "../utils/codes";
import { HttpError, unauthorized } from "../utils/errors";
import { SESSION_COOKIE, sessionCookieOptions } from "../middleware/auth";
import { checkAccountLockout, recordLoginFailure, recordLoginSuccess } from "../middleware/rateLimit";
import type { Response } from "express";

const TTL_MS = () => env.SESSION_TTL_HOURS * 3600_000;

export const authService = {
  buildCookieOptions: sessionCookieOptions,

  async login(identifier: string, password: string, ip: string, userAgent: string, res: Response) {
    checkAccountLockout(identifier, ip);
    let user = await userRepo.findByIdentifier(identifier);
    if (user) {
      const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
      if (!ok) user = null as never;
    }
    if (!user) {
      recordLoginFailure(identifier, ip);
      audit({ action: "auth.login_failed", entityType: "user", entityId: identifier, ip });
      throw unauthorized("Invalid credentials");
    }
    if (user.status !== "ACTIVE") {
      throw unauthorized("Invalid credentials"); // generic: don't reveal deactivated state
    }
    recordLoginSuccess(identifier, ip);

    const token = randomToken();
    const expiresAt = new Date(Date.now() + TTL_MS());
    await sessionRepo.create(user.id, sha256(token), expiresAt, ip, userAgent);
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(TTL_MS()));
    audit({
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

  async logout(token: string | undefined) {
    if (token) await sessionRepo.delete(sha256(token));
  },

  async logoutAll(userId: string, exceptToken?: string) {
    await sessionRepo.deleteAllForUser(userId, exceptToken ? sha256(exceptToken) : undefined);
  },

  async changePassword(userId: string, currentPassword: string, newPassword: string, token?: string) {
    const user = await userRepo.findById(userId);
    if (!user) throw unauthorized();
    const ok = await argon2.verify(user.passwordHash, currentPassword).catch(() => false);
    if (!ok) throw new HttpError(400, "Current password is incorrect");
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await userRepo.update(user.id, { passwordHash, mustChangePassword: false });
    // invalidate other sessions; keep the current one
    if (token) await sessionRepo.deleteAllForUser(userId, sha256(token));
    audit({ actorId: userId, action: "auth.password_changed", entityType: "user", entityId: userId });
  },

  /** Hash for temporary credentials (import/reset). */
  hashPassword(password: string) {
    return argon2.hash(password, { type: argon2.argon2id });
  },
  generateTemporaryPassword,
};
