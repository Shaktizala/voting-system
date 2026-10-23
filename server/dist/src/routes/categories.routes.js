"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const category_service_1 = require("../services/category.service");
const auth_1 = require("../middleware/auth");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
/** PATCH /api/categories/:id — cosmetic or structural (pre-vote) edits. */
r.patch("/categories/:id", (0, auth_1.requirePermission)("categories:write"), (0, helpers_1.wrap)(async (req, res) => {
    const patch = (0, helpers_1.parseBody)(shared_1.categoryPatchSchema, req.body);
    res.json({ category: await category_service_1.categoryService.update(req.params.id, patch, req.user.id, req.ip) });
}));
/** DELETE /api/categories/:id — removes unused categories; voted ones deactivate. */
r.delete("/categories/:id", (0, auth_1.requirePermission)("categories:write"), (0, helpers_1.wrap)(async (req, res) => {
    res.json(await category_service_1.categoryService.remove(req.params.id, req.user.id, req.ip));
}));
exports.default = r;
