"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const results_service_1 = require("../services/results.service");
const room_repo_1 = require("../repositories/room.repo");
const auth_1 = require("../middleware/auth");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const errors_1 = require("../utils/errors");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
async function memberGuard(req, roomId) {
    if (!req.user)
        throw (0, errors_1.notFound)("Not found");
    if (req.user.role === "ADMIN")
        return;
    if (req.user.role === "MODERATOR") {
        const m = await room_repo_1.roomRepo.findMember(roomId, req.user.id);
        if (m?.role === "MODERATOR")
            return;
    }
    const m2 = await room_repo_1.roomRepo.findMember(roomId, req.user.id);
    if (!m2)
        throw (0, errors_1.notFound)("Not found");
}
/* ------------------------------ admin results ----------------------------- */
r.get("/rooms/:roomId/results", (0, helpers_1.wrap)(async (req, res) => {
    await memberGuard(req, req.params.roomId);
    res.json(await results_service_1.resultsService.forRoom(req.params.roomId, req.query.roundId));
}));
r.post("/rooms/:roomId/results/publish", (0, auth_1.requirePermission)("results:publish"), (0, helpers_1.wrap)(async (req, res) => {
    const publish = req.body?.publish !== false;
    res.json({ room: await results_service_1.resultsService.publish(req.params.roomId, publish, req.user.id, req.ip) });
}));
r.get("/rooms/:roomId/results/export", (0, auth_1.requirePermission)("results:export"), (0, helpers_1.wrap)(async (req, res) => {
    const q = (0, helpers_1.parseQuery)(shared_1.resultsQuerySchema, req.query);
    const file = await results_service_1.resultsService.exportResults(req.params.roomId, q.kind, q.format);
    res.attachment(file.filename).type(file.contentType).send(file.buffer);
}));
/* -------------------------- participant results --------------------------- */
r.get("/rooms/:roomId/my-results", (0, helpers_1.wrap)(async (req, res) => {
    const room = await room_repo_1.roomRepo.findById(req.params.roomId);
    if (!room)
        throw (0, errors_1.notFound)("Room not found");
    const m = await room_repo_1.roomRepo.findMember(room.id, req.user.id);
    if (!m)
        throw (0, errors_1.notFound)("Room not found");
    res.json(await results_service_1.resultsService.forParticipant(req.params.roomId, req.user.id));
}));
exports.default = r;
