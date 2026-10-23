import { Router } from "express";
import { auditRepo } from "../repositories/audit.repo";
import { requireAuth, requirePermission } from "../middleware/auth";
import { wrap } from "./helpers";

const r = Router();

r.use(requireAuth);
r.use(requirePermission("audit:read"));

r.get("/", wrap(async (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const logs = await auditRepo.list({ cursor });
  res.json({ logs, nextCursor: logs.length ? logs[logs.length - 1].id : null });
}));

export default r;
