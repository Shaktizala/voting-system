"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moderatorGuard = moderatorGuard;
exports.memberGuard = memberGuard;
const express_1 = require("express");
const round_service_1 = require("../services/round.service");
const vote_service_1 = require("../services/vote.service");
const progress_service_1 = require("../services/progress.service");
const room_service_1 = require("../services/room.service");
const room_repo_1 = require("../repositories/room.repo");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const errors_1 = require("../utils/errors");
const db_1 = require("../db");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
/* ----------------------------- access guards ------------------------------ */
async function moderatorGuard(req, roomId) {
    if (!req.user)
        throw (0, errors_1.notFound)("Not found");
    if (req.user.role === "ADMIN")
        return;
    if (req.user.role === "MODERATOR") {
        const m = await room_repo_1.roomRepo.findMember(roomId, req.user.id);
        if (m?.role === "MODERATOR")
            return;
    }
    throw (0, errors_1.notFound)("Not found"); // hide room existence from unauthorized users
}
async function memberGuard(req, roomId) {
    if (!req.user)
        throw (0, errors_1.notFound)("Not found");
    if (req.user.role === "ADMIN")
        return;
    const m = await room_repo_1.roomRepo.findMember(roomId, req.user.id);
    if (!m)
        throw (0, errors_1.notFound)("Not found");
}
async function fetchRound(roundId) {
    const round = await db_1.prisma.votingRound.findUnique({ where: { id: roundId } });
    if (!round)
        throw (0, errors_1.notFound)("Round not found");
    return round;
}
async function canSeeIdentity(roomId) {
    const room = await room_repo_1.roomRepo.findById(roomId);
    return room ? (0, room_service_1.getSettings)(room).adminCanSeeVoterIdentity : false;
}
/* --------------------------------- rounds -------------------------------- */
r.get("/rooms/:roomId/rounds", (0, helpers_1.wrap)(async (req, res) => {
    await moderatorGuard(req, req.params.roomId);
    res.json({ rounds: await round_service_1.roundService.list(req.params.roomId) });
}));
r.post("/rooms/:roomId/rounds/select", (0, helpers_1.wrap)(async (req, res) => {
    await moderatorGuard(req, req.params.roomId);
    const { teamId, force } = (0, helpers_1.parseBody)(shared_1.selectTeamSchema, req.body);
    res.status(201).json({
        round: await round_service_1.roundService.selectTeam(req.params.roomId, teamId, force, req.user.id, req.user.role, req.ip),
    });
}));
r.post("/rounds/:id/open", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await moderatorGuard(req, round.roomId);
    res.json({ round: await round_service_1.roundService.open(round.roomId, round.id, req.user.id, req.ip) });
}));
r.post("/rounds/:id/pause", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await moderatorGuard(req, round.roomId);
    res.json({ round: await round_service_1.roundService.pause(round.roomId, round.id, req.user.id, req.ip) });
}));
r.post("/rounds/:id/resume", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await moderatorGuard(req, round.roomId);
    res.json({ round: await round_service_1.roundService.resume(round.roomId, round.id, req.user.id, req.ip) });
}));
r.post("/rounds/:id/close", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await moderatorGuard(req, round.roomId);
    res.json({ round: await round_service_1.roundService.close(round.roomId, round.id, req.user.id, req.ip) });
}));
/** Admin-only, audited re-open of a closed round. */
r.post("/rounds/:id/reopen", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    if (req.user.role !== "ADMIN")
        throw (0, errors_1.notFound)("Not found");
    await room_service_1.roomService.getById(round.roomId); // must exist
    res.json({ round: await round_service_1.roundService.reopen(round.roomId, round.id, req.user.id, req.ip) });
}));
/* --------------------------------- votes --------------------------------- */
r.post("/rounds/:id/votes", rateLimit_1.writeLimiter, (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await memberGuard(req, round.roomId);
    const { scores } = (0, helpers_1.parseBody)(shared_1.voteSubmitSchema, req.body);
    const result = await vote_service_1.voteService.submit(round.roomId, round.id, req.user.id, scores, req.ip);
    res.status(201).json(result);
}));
r.get("/rounds/:id/my-vote", (0, helpers_1.wrap)(async (req, res) => {
    const round = await fetchRound(req.params.id);
    await memberGuard(req, round.roomId);
    res.json({ vote: await vote_service_1.voteService.myVote(round.roomId, round.id, req.user.id) });
}));
/* -------------------------------- progress ------------------------------- */
r.get("/rooms/:roomId/rounds/:roundId/progress", (0, helpers_1.wrap)(async (req, res) => {
    await moderatorGuard(req, req.params.roomId);
    await fetchRound(req.params.roundId);
    res.json(await progress_service_1.progressService.forRound(req.params.roomId, req.params.roundId, await canSeeIdentity(req.params.roomId)));
}));
exports.default = r;
