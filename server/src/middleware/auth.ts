import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import { env } from "../config";
import { sessionRepo } from "../repositories/session.repo";
import { roleHas, type Permission, type Role } from "@voting/shared";
import { forbidden, unauthorized } from "../utils/errors";
import { sha256 as sha } from "../utils/codes";
import { prisma } from "../db";

export const SESSION_COOKIE = "session";
export const CSRF_COOKIE = "csrf";

export function sessionCookieOptions(maxAgeMs: number) {  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict" as const,
    path: "/",
    maxAge: maxAgeMs,
  };
}

/** Resolves the session cookie to req.user (or 401 for API-bound guards). */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (!token) return next();
  const session = await sessionRepo.findValid(sha(token));
  if (!session || session.expiresAt < new Date()) return next();
  if (session.user.status !== "ACTIVE" || session.user.deletedAt) return next();
  req.user = {
    id: session.user.id,
    name: session.user.name,
    username: session.user.username,
    email: session.user.email,
    role: session.user.role as Role,
    status: session.user.status,
    mustChangePassword: session.user.mustChangePassword,
    teamId: session.user.teamId,
  };
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  next();
}

export function requirePermission(permission: Permission) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roleHas(req.user.role, permission)) return next(forbidden(`Missing permission: ${permission}`));
    next();
  };
}

/* --------------------------------- CSRF -------------------------------- */

export function ensureCsrfCookie(req: Request, res: Response, next: NextFunction) {
  if (!req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, crypto.randomBytes(24).toString("base64url"), {
      httpOnly: false,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });
  }
  next();
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get("x-csrf-token");
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(forbidden("CSRF token missing or invalid"));
  }
  next();
}
