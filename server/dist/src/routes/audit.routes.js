"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const audit_repo_1 = require("../repositories/audit.repo");
const auth_1 = require("../middleware/auth");
const helpers_1 = require("./helpers");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
r.use((0, auth_1.requirePermission)("audit:read"));
r.get("/", (0, helpers_1.wrap)(async (req, res) => {
    const cursor = req.query.cursor;
    const logs = await audit_repo_1.auditRepo.list({ cursor });
    res.json({ logs, nextCursor: logs.length ? logs[logs.length - 1].id : null });
}));
exports.default = r;
