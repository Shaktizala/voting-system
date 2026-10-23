import { Router } from "express";
import { resultsService } from "../services/results.service";
import { roomRepo } from "../repositories/room.repo";
import { requireAuth, requirePermission } from "../middleware/auth";
import { resultsQuerySchema } from "@voting/shared";
import { wrap, parseQuery } from "./helpers";
import { notFound } from "../utils/errors";
import type { Request } from "express";

const r = Router();

r.use(requireAuth);

async function memberGuard(req: Request, roomId: string) {
  if (!req.user) throw notFound("Not found");
  if (req.user.role === "ADMIN") return;
  if (req.user.role === "MODERATOR") {
    const m = await roomRepo.findMember(roomId, req.user.id);
    if (m?.role === "MODERATOR") return;
  }
  const m2 = await roomRepo.findMember(roomId, req.user.id);
  if (!m2) throw notFound("Not found");
}

/* ------------------------------ admin results ----------------------------- */

r.get("/rooms/:roomId/results", wrap(async (req, res) => {
  await memberGuard(req, req.params.roomId);
  res.json(await resultsService.forRoom(req.params.roomId, req.query.roundId as string | undefined));
}));

r.post("/rooms/:roomId/results/publish", requirePermission("results:publish"), wrap(async (req, res) => {
  const publish = req.body?.publish !== false;
  res.json({ room: await resultsService.publish(req.params.roomId, publish, req.user!.id, req.ip) });
}));

r.get("/rooms/:roomId/results/export", requirePermission("results:export"), wrap(async (req, res) => {
  const q = parseQuery(resultsQuerySchema, req.query);
  const file = await resultsService.exportResults(req.params.roomId, q.kind, q.format);
  res.attachment(file.filename).type(file.contentType).send(file.buffer);
}));

/* -------------------------- participant results --------------------------- */

r.get("/rooms/:roomId/my-results", wrap(async (req, res) => {
  const room = await roomRepo.findById(req.params.roomId);
  if (!room) throw notFound("Room not found");
  const m = await roomRepo.findMember(room.id, req.user!.id);
  if (!m) throw notFound("Room not found");
  res.json(await resultsService.forParticipant(req.params.roomId, req.user!.id));
}));

export default r;
