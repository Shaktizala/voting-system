import { Router } from "express";
import { authService } from "../services/auth.service";
import { attachUser, CSRF_COOKIE, SESSION_COOKIE, ensureCsrfCookie } from "../middleware/auth";
import { loginLimiter } from "../middleware/rateLimit";
import { requireAuth, requirePermission } from "../middleware/auth";
import { loginSchema, changePasswordSchema } from "@voting/shared";
import { wrap, parseBody } from "./helpers";
import { env } from "../config";

const r = Router();

r.get("/csrf", ensureCsrfCookie, (_req, res) => {
  res.json({ csrfCookie: CSRF_COOKIE, ok: true });
});

r.post("/login", loginLimiter, ensureCsrfCookie, wrap(async (req, res) => {
  const { identifier, password } = parseBody(loginSchema, req.body);
  const user = await authService.login(identifier, password, req.ip ?? "", req.headers["user-agent"] ?? "", res);
  res.json({ user });
}));

r.post("/logout", wrap(async (req, res) => {
  await authService.logout(req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
}));

r.post("/logout-all", requireAuth, wrap(async (req, res) => {
  await authService.logoutAll(req.user!.id, req.cookies?.[SESSION_COOKIE]);
  res.clearCookie(SESSION_COOKIE);
  res.json({ ok: true });
}));

r.post("/change-password", requireAuth, wrap(async (req, res) => {
  const { currentPassword, newPassword } = parseBody(changePasswordSchema, req.body);
  if (req.user!.mustChangePassword === false && env.NODE_ENV !== "test") {
    // ordinary change flow still allowed
  }
  await authService.changePassword(req.user!.id, currentPassword, newPassword, req.cookies?.[SESSION_COOKIE]);
  res.json({ ok: true });
}));

r.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default r;
