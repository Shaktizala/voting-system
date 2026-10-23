import { Router } from "express";
import { categoryService } from "../services/category.service";
import { requireAuth, requirePermission } from "../middleware/auth";
import { categoryPatchSchema } from "@voting/shared";
import { wrap, parseBody } from "./helpers";

const r = Router();

r.use(requireAuth);

/** PATCH /api/categories/:id — cosmetic or structural (pre-vote) edits. */
r.patch("/categories/:id", requirePermission("categories:write"), wrap(async (req, res) => {
  const patch = parseBody(categoryPatchSchema, req.body);
  res.json({ category: await categoryService.update(req.params.id, patch, req.user!.id, req.ip) });
}));

/** DELETE /api/categories/:id — removes unused categories; voted ones deactivate. */
r.delete("/categories/:id", requirePermission("categories:write"), wrap(async (req, res) => {
  res.json(await categoryService.remove(req.params.id, req.user!.id, req.ip));
}));

export default r;
