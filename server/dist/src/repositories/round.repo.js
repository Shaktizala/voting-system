"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roundRepo = void 0;
const db_1 = require("../db");
exports.roundRepo = {
    findById(id) {
        return db_1.prisma.votingRound.findUnique({ where: { id }, include: { roomTeam: { include: { team: true } } } });
    },
    listForRoom(roomId) {
        return db_1.prisma.votingRound.findMany({
            where: { roomId },
            orderBy: { createdAt: "desc" },
            include: { roomTeam: { include: { team: true } }, _count: { select: { votes: true } } },
        });
    },
    currentForRoom(roomId) {
        return db_1.prisma.votingRound.findFirst({
            where: { roomId, status: { in: ["PENDING", "OPEN", "PAUSED"] } },
            orderBy: { createdAt: "desc" },
            include: { roomTeam: { include: { team: true } } },
        });
    },
    /** any OPEN round in the room */
    openRoundForRoom(roomId) {
        return db_1.prisma.votingRound.findFirst({ where: { roomId, status: "OPEN" } });
    },
    create(data) {
        return db_1.prisma.votingRound.create({ data, include: { roomTeam: { include: { team: true } } } });
    },
    update(id, data) {
        return db_1.prisma.votingRound.update({ where: { id }, data, include: { roomTeam: { include: { team: true } } } });
    },
    countByTeam(roomId, teamId) {
        return db_1.prisma.votingRound.count({ where: { roomId, teamId } });
    },
    /** rounds for a team that are done */
    closedRoundsForTeam(roomId, teamId) {
        return db_1.prisma.votingRound.findMany({ where: { roomId, teamId, status: "CLOSED" } });
    },
    /* --- votes --- */
    findVote(roundId, voterId) {
        return db_1.prisma.vote.findUnique({
            where: { roundId_voterId: { roundId, voterId } },
            include: { scores: true },
        });
    },
    listVotesForRoom(roomId, roundId) {
        return db_1.prisma.vote.findMany({
            where: { roomId, ...(roundId ? { roundId } : {}) },
            include: { scores: { include: { category: true } }, voter: true },
            orderBy: { submittedAt: "asc" },
        });
    },
};
