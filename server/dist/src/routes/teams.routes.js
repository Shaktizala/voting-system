"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const team_service_1 = require("../services/team.service");
const auth_1 = require("../middleware/auth");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
r.use((0, auth_1.requirePermission)("teams:read"));
r.get("/", (0, helpers_1.wrap)(async (_req, res) => {
    const teams = await team_service_1.teamService.list();
    res.json({ teams });
}));
r.post("/", (0, auth_1.requirePermission)("teams:write"), (0, helpers_1.wrap)(async (req, res) => {
    const input = (0, helpers_1.parseBody)(shared_1.teamCreateSchema, req.body);
    const team = await team_service_1.teamService.create(input, req.user.id, req.ip ?? "");
    res.status(201).json({ team });
}));
r.patch("/:id", (0, auth_1.requirePermission)("teams:write"), (0, helpers_1.wrap)(async (req, res) => {
    const patch = (0, helpers_1.parseBody)(shared_1.teamCreateSchema.partial(), req.body);
    const team = await team_service_1.teamService.update(req.params.id, patch, req.user.id, req.ip ?? "");
    res.json({ team });
}));
r.delete("/:id", (0, auth_1.requirePermission)("teams:write"), (0, helpers_1.wrap)(async (req, res) => {
    res.json(await team_service_1.teamService.softDelete(req.params.id, req.user.id, req.ip ?? ""));
}));
exports.default = r;
