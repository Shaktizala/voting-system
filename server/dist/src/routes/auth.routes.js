"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_service_1 = require("../services/auth.service");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const auth_2 = require("../middleware/auth");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const config_1 = require("../config");
const r = (0, express_1.Router)();
r.get("/csrf", auth_1.ensureCsrfCookie, (_req, res) => {
    res.json({ csrfCookie: auth_1.CSRF_COOKIE, ok: true });
});
r.post("/login", rateLimit_1.loginLimiter, auth_1.ensureCsrfCookie, (0, helpers_1.wrap)(async (req, res) => {
    const { identifier, password } = (0, helpers_1.parseBody)(shared_1.loginSchema, req.body);
    const user = await auth_service_1.authService.login(identifier, password, req.ip ?? "", req.headers["user-agent"] ?? "", res);
    res.json({ user });
}));
r.post("/logout", (0, helpers_1.wrap)(async (req, res) => {
    await auth_service_1.authService.logout(req.cookies?.[auth_1.SESSION_COOKIE]);
    res.clearCookie(auth_1.SESSION_COOKIE);
    res.json({ ok: true });
}));
r.post("/logout-all", auth_2.requireAuth, (0, helpers_1.wrap)(async (req, res) => {
    await auth_service_1.authService.logoutAll(req.user.id, req.cookies?.[auth_1.SESSION_COOKIE]);
    res.clearCookie(auth_1.SESSION_COOKIE);
    res.json({ ok: true });
}));
r.post("/change-password", auth_2.requireAuth, (0, helpers_1.wrap)(async (req, res) => {
    const { currentPassword, newPassword } = (0, helpers_1.parseBody)(shared_1.changePasswordSchema, req.body);
    if (req.user.mustChangePassword === false && config_1.env.NODE_ENV !== "test") {
        // ordinary change flow still allowed
    }
    await auth_service_1.authService.changePassword(req.user.id, currentPassword, newPassword, req.cookies?.[auth_1.SESSION_COOKIE]);
    res.json({ ok: true });
}));
r.get("/me", auth_2.requireAuth, (req, res) => {
    res.json({ user: req.user });
});
exports.default = r;
