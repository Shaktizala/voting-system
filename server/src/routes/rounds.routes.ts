import { Router } from "express";
import { roundService } from "../services/round.service";
import { voteService } from "../services/vote.service";
import { progressService } from "../services/progress.service";
import { roomService, getSettings } from "../services/room.service";
import { roomRepo } from "../repositories/room.repo";
import { requireAuth, requirePermission } from "../middleware/auth";
import { writeLimiter } from "../middleware/rateLimit";
import { selectTeamSchema, voteSubmitSchema } from "@voting/shared";
import { wrap, parseBody } from "./helpers";
import { notFound } from "../utils/errors";
import { prisma } from "../db";
import type { VotingRound } from "@prisma/client";
import type { Request } from "express";

const r = Router();

r.use(requireAuth);

/* ----------------------------- access guards ------------------------------ */

export async function moderatorGuard(req: Request, roomId: string) {
  if (!req.user) throw notFound("Not found");
  if (req.user.role === "ADMIN") return;
  if (req.user.role === "MODERATOR") {
    const m = await roomRepo.findMember(roomId, req.user.id);
    if (m?.role === "MODERATOR") return;
  }
  throw notFound("Not found"); // hide room existence from unauthorized users
}

export async function memberGuard(req: Request, roomId: string) {
  if (!req.user) throw notFound("Not found");
  if (req.user.role === "ADMIN") return;
  const m = await roomRepo.findMember(roomId, req.user.id);
  if (!m) throw notFound("Not found");
}

async function fetchRound(roundId: string): Promise<VotingRound> {
  const round = await prisma.votingRound.findUnique({ where: { id: roundId } });
  if (!round) throw notFound("Round not found");
  return round;
}

async function canSeeIdentity(roomId: string) {
  const room = await roomRepo.findById(roomId);
  return room ? getSettings(room).adminCanSeeVoterIdentity : false;
}

/* --------------------------------- rounds -------------------------------- */

r.get("/rooms/:roomId/rounds", wrap(async (req, res) => {
  await moderatorGuard(req, req.params.roomId);
  res.json({ rounds: await roundService.list(req.params.roomId) });
}));

r.post("/rooms/:roomId/rounds/select", wrap(async (req, res) => {
  await moderatorGuard(req, req.params.roomId);
  const { teamId, force } = parseBody(selectTeamSchema, req.body);
  res.status(201).json({
    round: await roundService.selectTeam(req.params.roomId, teamId, force, req.user!.id, req.user!.role, req.ip),
  });
}));

r.post("/rounds/:id/open", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await moderatorGuard(req, round.roomId);
  res.json({ round: await roundService.open(round.roomId, round.id, req.user!.id, req.ip) });
}));

r.post("/rounds/:id/pause", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await moderatorGuard(req, round.roomId);
  res.json({ round: await roundService.pause(round.roomId, round.id, req.user!.id, req.ip) });
}));

r.post("/rounds/:id/resume", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await moderatorGuard(req, round.roomId);
  res.json({ round: await roundService.resume(round.roomId, round.id, req.user!.id, req.ip) });
}));

r.post("/rounds/:id/close", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await moderatorGuard(req, round.roomId);
  res.json({ round: await roundService.close(round.roomId, round.id, req.user!.id, req.ip) });
}));

/** Admin-only, audited re-open of a closed round. */
r.post("/rounds/:id/reopen", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  if (req.user!.role !== "ADMIN") throw notFound("Not found");
  await roomService.getById(round.roomId); // must exist
  res.json({ round: await roundService.reopen(round.roomId, round.id, req.user!.id, req.ip) });
}));

/* --------------------------------- votes --------------------------------- */

r.post("/rounds/:id/votes", writeLimiter, wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await memberGuard(req, round.roomId);
  const { scores } = parseBody(voteSubmitSchema, req.body);
  const result = await voteService.submit(round.roomId, round.id, req.user!.id, scores, req.ip);
  res.status(201).json(result);
}));

r.get("/rounds/:id/my-vote", wrap(async (req, res) => {
  const round = await fetchRound(req.params.id);
  await memberGuard(req, round.roomId);
  res.json({ vote: await voteService.myVote(round.roomId, round.id, req.user!.id) });
}));

/* -------------------------------- progress ------------------------------- */

r.get("/rooms/:roomId/rounds/:roundId/progress", wrap(async (req, res) => {
  await moderatorGuard(req, req.params.roomId);
  await fetchRound(req.params.roundId);
  res.json(await progressService.forRound(req.params.roomId, req.params.roundId, await canSeeIdentity(req.params.roomId)));
}));

export default r;
