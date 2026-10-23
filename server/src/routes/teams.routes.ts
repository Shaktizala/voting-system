import { Router } from "express";
import { teamService } from "../services/team.service";
import { requireAuth, requirePermission } from "../middleware/auth";
import { teamCreateSchema } from "@voting/shared";
import { wrap, parseBody } from "./helpers";

const r = Router();

r.use(requireAuth);
r.use(requirePermission("teams:read"));

r.get("/", wrap(async (_req, res) => {
  const teams = await teamService.list();
  res.json({ teams });
}));

r.post("/", requirePermission("teams:write"), wrap(async (req, res) => {
  const input = parseBody(teamCreateSchema, req.body);
  const team = await teamService.create(input, req.user!.id, req.ip ?? "");
  res.status(201).json({ team });
}));

r.patch("/:id", requirePermission("teams:write"), wrap(async (req, res) => {
  const patch = parseBody(teamCreateSchema.partial(), req.body);
  const team = await teamService.update(req.params.id, patch, req.user!.id, req.ip ?? "");
  res.json({ team });
}));

r.delete("/:id", requirePermission("teams:write"), wrap(async (req, res) => {
  res.json(await teamService.softDelete(req.params.id, req.user!.id, req.ip ?? ""));
}));

export default r;
