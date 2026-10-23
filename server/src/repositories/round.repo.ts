import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export const roundRepo = {
  findById(id: string) {
    return prisma.votingRound.findUnique({ where: { id }, include: { roomTeam: { include: { team: true } } } });
  },
  listForRoom(roomId: string) {
    return prisma.votingRound.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      include: { roomTeam: { include: { team: true } }, _count: { select: { votes: true } } },
    });
  },
  currentForRoom(roomId: string) {
    return prisma.votingRound.findFirst({
      where: { roomId, status: { in: ["PENDING", "OPEN", "PAUSED"] } },
      orderBy: { createdAt: "desc" },
      include: { roomTeam: { include: { team: true } } },
    });
  },
  /** any OPEN round in the room */
  openRoundForRoom(roomId: string) {
    return prisma.votingRound.findFirst({ where: { roomId, status: "OPEN" } });
  },
  create(data: Prisma.VotingRoundUncheckedCreateInput) {
    return prisma.votingRound.create({ data, include: { roomTeam: { include: { team: true } } } });
  },
  update(id: string, data: Prisma.VotingRoundUncheckedUpdateInput) {
    return prisma.votingRound.update({ where: { id }, data, include: { roomTeam: { include: { team: true } } } });
  },
  countByTeam(roomId: string, teamId: string) {
    return prisma.votingRound.count({ where: { roomId, teamId } });
  },
  /** rounds for a team that are done */
  closedRoundsForTeam(roomId: string, teamId: string) {
    return prisma.votingRound.findMany({ where: { roomId, teamId, status: "CLOSED" } });
  },

  /* --- votes --- */
  findVote(roundId: string, voterId: string) {
    return prisma.vote.findUnique({
      where: { roundId_voterId: { roundId, voterId } },
      include: { scores: true },
    });
  },
  listVotesForRoom(roomId: string, roundId?: string) {
    return prisma.vote.findMany({
      where: { roomId, ...(roundId ? { roundId } : {}) },
      include: { scores: { include: { category: true } }, voter: true },
      orderBy: { submittedAt: "asc" },
    });
  },
};
