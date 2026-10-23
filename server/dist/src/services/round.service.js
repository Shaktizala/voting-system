"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundService = void 0;
const db_1 = require("../db");
const round_repo_1 = require("../repositories/round.repo");
const room_repo_1 = require("../repositories/room.repo");
const category_repo_1 = require("../repositories/category.repo");
const audit_repo_1 = require("../repositories/audit.repo");
const errors_1 = require("../utils/errors");
const emit_1 = require("../realtime/emit");
exports.roundService = {
    list(roomId) {
        return round_repo_1.roundRepo.listForRoom(roomId);
    },
    /** Admin/moderator selects the presenting team (creates a PENDING round). */
    async selectTeam(roomId, teamId, force, actorId, actorRole, ip) {
        const room = await assertActiveRoom(roomId);
        const roomTeam = await room_repo_1.roomRepo.findRoomTeam(roomId, teamId);
        if (!roomTeam)
            throw (0, errors_1.conflict)("Team is not linked to this room");
        const existing = await round_repo_1.roundRepo.currentForRoom(roomId);
        if (existing && existing.status === "OPEN") {
            throw (0, errors_1.conflict)("A voting round is open. Close or pause it before switching teams.");
        }
        if (existing) {
            // PENDING/PAUSED round for another team — finalize first
            await db_1.prisma.votingRound.update({
                where: { id: existing.id },
                data: { status: "CLOSED", closedAt: existing.closedAt ?? new Date() },
            });
        }
        // completed team re-presentation requires explicit force (audited)
        const prevClosed = await round_repo_1.roundRepo.closedRoundsForTeam(roomId, teamId);
        if (prevClosed.length > 0 && !force) {
            throw (0, errors_1.conflict)("This team already has completed rounds. Pass force to explicitly re-open its evaluation (audited).");
        }
        const version = await category_repo_1.categoryRepo.findCurrentVersion(roomId);
        if (!version)
            throw (0, errors_1.notFound)("Room configuration missing");
        const categories = await category_repo_1.categoryRepo.listForRoom(roomId);
        if (categories.length === 0)
            throw (0, errors_1.conflict)("This room has no categories configured yet");
        const round = await round_repo_1.roundRepo.create({
            roomId,
            teamId,
            status: "PENDING",
            configVersionId: version.id,
        });
        (0, audit_repo_1.audit)({
            actorId,
            action: force ? "round.team_reselected" : "round.team_selected",
            entityType: "round",
            entityId: round.id,
            after: { roomId, teamId, forced: force, actorRole },
            ip,
        });
        emit_1.rtEvents.presentingChanged(roomId, {
            roundId: round.id,
            teamId,
            teamName: roomTeam.team.name,
            status: "PENDING",
        });
        return round;
    },
    async open(roomId, roundId, actorId, ip) {
        const round = await assertRoundInRoom(roomId, roundId);
        if (round.status !== "PENDING")
            throw (0, errors_1.conflict)(`Round is ${round.status}; only PENDING rounds can be opened`);
        const updated = await round_repo_1.roundRepo.update(roundId, { status: "OPEN", openedAt: new Date() });
        (0, audit_repo_1.audit)({ actorId, action: "round.open", entityType: "round", entityId: roundId, ip });
        emit_1.rtEvents.votingOpened(roomId, roundId);
        emit_1.rtEvents.presentingChanged(roomId, {
            roundId,
            teamId: round.teamId,
            teamName: round.roomTeam.team.name,
            status: "OPEN",
        });
        return updated;
    },
    async pause(roomId, roundId, actorId, ip) {
        const round = await assertRoundInRoom(roomId, roundId);
        if (round.status !== "OPEN")
            throw (0, errors_1.conflict)("Only an open round can be paused");
        const updated = await round_repo_1.roundRepo.update(roundId, { status: "PAUSED" });
        (0, audit_repo_1.audit)({ actorId, action: "round.pause", entityType: "round", entityId: roundId, ip });
        emit_1.rtEvents.votingPaused(roomId, roundId);
        return updated;
    },
    async resume(roomId, roundId, actorId, ip) {
        const round = await assertRoundInRoom(roomId, roundId);
        if (round.status !== "PAUSED")
            throw (0, errors_1.conflict)("Only a paused round can be resumed");
        const updated = await round_repo_1.roundRepo.update(roundId, { status: "OPEN" });
        (0, audit_repo_1.audit)({ actorId, action: "round.resume", entityType: "round", entityId: roundId, ip });
        emit_1.rtEvents.votingResumed(roomId, roundId);
        return updated;
    },
    async close(roomId, roundId, actorId, ip) {
        const round = await assertRoundInRoom(roomId, roundId);
        if (round.status === "CLOSED")
            throw (0, errors_1.conflict)("Round already closed");
        const updated = await round_repo_1.roundRepo.update(roundId, { status: "CLOSED", closedAt: new Date() });
        (0, audit_repo_1.audit)({ actorId, action: "round.close", entityType: "round", entityId: roundId, ip });
        emit_1.rtEvents.votingClosed(roomId, roundId);
        return updated;
    },
    /** Admin-only re-open of a closed round (audited). */
    async reopen(roomId, roundId, actorId, ip) {
        const round = await assertRoundInRoom(roomId, roundId);
        if (round.status !== "CLOSED")
            throw (0, errors_1.conflict)("Only closed rounds can be re-opened");
        const room = await assertActiveRoom(roomId);
        void room;
        const updated = await round_repo_1.roundRepo.update(roundId, {
            status: "PAUSED", // re-enters PAUSED; moderator resumes intentionally
            reopenedCount: { increment: 1 },
            closedAt: null,
        });
        (0, audit_repo_1.audit)({ actorId, action: "round.reopen", entityType: "round", entityId: roundId, after: { reopened: true }, ip });
        emit_1.rtEvents.votingResumed(roomId, roundId);
        return updated;
    },
};
async function assertActiveRoom(roomId) {
    const room = await room_repo_1.roomRepo.findById(roomId);
    if (!room)
        throw (0, errors_1.notFound)("Room not found");
    if (room.status !== "ACTIVE")
        throw (0, errors_1.conflict)(`Room is ${room.status}; controls are only available on an active room`);
    return room;
}
async function assertRoundInRoom(roomId, roundId) {
    const round = await round_repo_1.roundRepo.findById(roundId);
    if (!round || round.roomId !== roomId)
        throw (0, errors_1.notFound)("Round not found in this room");
    return round;
}
