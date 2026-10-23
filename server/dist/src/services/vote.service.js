"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.voteService = void 0;
exports.eligibleCounts = eligibleCounts;
const db_1 = require("../db");
const round_repo_1 = require("../repositories/round.repo");
const room_service_1 = require("./room.service");
const audit_repo_1 = require("../repositories/audit.repo");
const errors_1 = require("../utils/errors");
const emit_1 = require("../realtime/emit");
const plainify_1 = require("../utils/plainify");
exports.voteService = {
    /**
     * Idempotent submission (audited edit when a previous vote exists).
     * All rules re-checked inside the transaction against authoritative state.
     */
    async submit(roomId, roundId, voterId, inputs, ip) {
        return db_1.prisma.$transaction(async (tx) => {
            const round = await tx.votingRound.findUnique({ where: { id: roundId } });
            if (!round || round.roomId !== roomId)
                throw (0, errors_1.notFound)("Round not found");
            const room = await tx.room.findFirst({ where: { id: roomId, deletedAt: null } });
            if (!room)
                throw (0, errors_1.notFound)("Room not found");
            if (room.status !== "ACTIVE")
                throw (0, errors_1.conflict)("This room is closed");
            if (round.status !== "OPEN")
                throw (0, errors_1.conflict)("Voting is not open for this round");
            const settings = (0, room_service_1.getSettings)(room);
            const membership = await tx.roomMember.findUnique({
                where: { roomId_userId: { roomId, userId: voterId } },
                include: { user: true },
            });
            if (!membership)
                throw (0, errors_1.forbidden)("You are not a member of this room");
            if (membership.user.status !== "ACTIVE" || membership.user.deletedAt) {
                throw (0, errors_1.forbidden)("Your account is not active");
            }
            // self-vote prevention (race-free: membership row locked)
            await tx.$queryRaw `SELECT "teamId" FROM "RoomMember" WHERE "roomId" = ${roomId} AND "userId" = ${voterId} FOR UPDATE`;
            if (membership.teamId && membership.teamId === round.teamId) {
                throw (0, errors_1.forbidden)("You cannot vote for your own team");
            }
            // category configuration snapshot for this round
            const categories = await tx.category.findMany({
                where: { roomId, configVersionId: round.configVersionId, active: true },
            });
            const categoryMap = new Map(categories.map((c) => [c.id, c]));
            // unknown / extra / other-room categories rejected
            const unknown = inputs.filter((s) => !categoryMap.has(s.categoryId));
            if (unknown.length > 0)
                throw (0, errors_1.conflict)("Unknown category in submission");
            const seen = new Set();
            for (const s of inputs) {
                if (seen.has(s.categoryId))
                    throw (0, errors_1.conflict)("Duplicate category in submission");
                seen.add(s.categoryId);
            }
            const missingRequired = categories.filter((c) => c.isRequired && !seen.has(c.id));
            if (missingRequired.length > 0) {
                throw (0, errors_1.conflict)(`Missing required category: ${missingRequired[0].name}`);
            }
            // score validation against the stored snapshot
            for (const s of inputs) {
                const c = categoryMap.get(s.categoryId);
                if (s.score < c.minScore || s.score > c.maxScore) {
                    throw (0, errors_1.conflict)(`Score for "${c.name}" must be between ${c.minScore} and ${c.maxScore}`);
                }
                if (((s.score - c.minScore) / c.step) % 1 !== 0) {
                    throw (0, errors_1.conflict)(`Score for "${c.name}" must be a valid step of ${c.step}`);
                }
            }
            const data = {
                roundId,
                roomId,
                teamId: round.teamId,
                voterId,
            };
            // serialize concurrent submissions on the round row
            await tx.$queryRaw `SELECT id FROM "VotingRound" WHERE id = ${roundId} FOR UPDATE`;
            const prevVote = await tx.vote.findUnique({
                where: { roundId_voterId: { roundId, voterId } },
                include: { scores: true },
            });
            let vote;
            if (!prevVote) {
                vote = await tx.vote.create({ data });
            }
            else {
                if (!settings.allowVoteEdit) {
                    throw (0, errors_1.conflict)("Votes are final in this room and cannot be edited");
                }
                vote = await tx.vote.update({
                    where: { id: prevVote.id },
                    data: { revision: { increment: 1 } },
                });
            }
            await tx.voteScore.deleteMany({ where: { voteId: vote.id, roomId } });
            await tx.voteScore.createMany({
                data: inputs.map((s) => ({
                    voteId: vote.id,
                    categoryId: s.categoryId,
                    roomId,
                    score: s.score,
                })),
            });
            // real-time progress counts (privileged channel)
            const [votedCount, eligibleCount] = await eligibleCounts(roomId, roundId, tx);
            emit_1.rtEvents.voteSubmitted(roomId, { roundId, votedCount, eligibleCount });
            (0, audit_repo_1.audit)({
                actorId: voterId,
                action: prevVote ? "vote.edit" : "vote.submit",
                entityType: "vote",
                entityId: vote.id,
                before: prevVote ? { revision: prevVote.revision, scores: prevVote.scores.map((s) => ({ categoryId: s.categoryId, score: String(s.score) })) } : undefined,
                after: (0, plainify_1.plainify)({ roundId, roomId, teamId: round.teamId, revision: vote.revision, scores: inputs }),
                ip,
            });
            return {
                voteId: vote.id,
                revision: vote.revision,
                edited: Boolean(prevVote),
                eligibleCount,
                votedCount,
            };
        });
    },
    async myVote(roomId, roundId, voterId) {
        const round = await round_repo_1.roundRepo.findById(roundId);
        if (!round || round.roomId !== roomId)
            throw (0, errors_1.notFound)("Round not found");
        const vote = await round_repo_1.roundRepo.findVote(roundId, voterId);
        return vote ? { vote, teamId: round.teamId, submittedAt: vote.submittedAt } : null;
    },
};
/** Eligible voters in a round = room members whose membership team is not the
 *  presenting team. Participants without a team can vote for any team. */
async function eligibleCounts(roomId, roundId, tx) {
    const round = await tx.votingRound.findUnique({ where: { id: roundId } });
    if (!round)
        return [0, 0];
    const members = await tx.roomMember.findMany({ where: { roomId, user: { status: "ACTIVE", deletedAt: null } } });
    const eligible = members.filter((m) => !m.teamId || m.teamId !== round.teamId);
    const voted = await tx.vote.count({ where: { roundId } });
    return [voted, eligible.length];
}
