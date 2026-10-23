import { prisma } from "../db";
import { roundRepo } from "../repositories/round.repo";
import { notFound } from "../utils/errors";

export const progressService = {
  /** Who has voted / who is pending for a single round. */
  async forRound(roomId: string, roundId: string, includeIdentity: boolean) {
    const round = await roundRepo.findById(roundId);
    if (!round || round.roomId !== roomId) throw notFound("Round not found");

    const members = await prisma.roomMember.findMany({
      where: { roomId, user: { status: "ACTIVE", deletedAt: null } },
      include: { user: { select: { id: true, name: true, username: true } }, team: { select: { id: true, name: true } } },
    });
    const votes = await prisma.vote.findMany({ where: { roundId } });

    const votedBy = new Map(votes.map((v) => [v.voterId, v]));
    const eligible = members.filter((m) => !m.teamId || m.teamId !== round.teamId);
    const ineligible = members.filter((m) => m.teamId && m.teamId === round.teamId);

    const voters = eligible.map((m) => {
      const vote = votedBy.get(m.userId);
      return {
        userId: m.userId,
        name: includeIdentity ? m.user.name : "participant",
        username: includeIdentity ? m.user.username : undefined,
        teamName: m.team?.name ?? null,
        status: vote ? "voted" : "pending",
        revision: vote?.revision,
        submittedAt: vote?.submittedAt,
        updatedAt: vote?.updatedAt,
      };
    });

    return {
      roundId,
      teamId: round.teamId,
      teamName: round.roomTeam.team.name,
      roundStatus: round.status,
      eligibleCount: eligible.length,
      votedCount: voters.filter((v) => v.status === "voted").length,
      pendingCount: voters.filter((v) => v.status === "pending").length,
      percentage: eligible.length ? Math.round((voters.filter((v) => v.status === "voted").length / eligible.length) * 100) : 0,
      excludedMembers: ineligible.map((m) => ({
        userId: m.userId,
        name: includeIdentity ? m.user.name : "participant",
        teamName: m.team?.name ?? null,
        reason: "member of the presenting team",
      })),
      voters,
    };
  },
};
