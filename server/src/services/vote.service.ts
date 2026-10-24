import { prisma, TX_OPTIONS, withDbRetry } from "../db";
import { roundRepo } from "../repositories/round.repo";
import { getSettings } from "./room.service";
import { audit } from "../repositories/audit.repo";
import { conflict, forbidden, notFound } from "../utils/errors";
import { rtEvents } from "../realtime/emit";
import { plainify } from "../utils/plainify";
import type { Category, Room } from "@prisma/client";

export interface ScoreInput {
  categoryId: string;
  score: number;
}

export const voteService = {
  /**
   * Idempotent submission (audited edit when a previous vote exists).
   * All rules re-checked inside the transaction against authoritative state.
   *
   * Concurrency: the round row is held with FOR SHARE, so any number of voters
   * proceed in parallel while a close/pause (UPDATE on the same row) waits for
   * in-flight votes and every later vote sees the new status. The voter's own
   * membership row is locked FOR UPDATE, serializing double-submits.
   */
  async submit(roundId: string, voter: { id: string; role: string }, inputs: ScoreInput[], ip?: string) {
    const voterId = voter.id;
    const result = await withDbRetry(() =>
      prisma.$transaction(async (tx) => {
        // one round-trip: lock the round (shared) and read its room
        const [round] = await tx.$queryRaw<LockedRound[]>`
          SELECT r."roomId", r."teamId", r."configVersionId", r.status::text AS status,
                 rm.status::text AS "roomStatus", rm.settings, rm."deletedAt" AS "roomDeletedAt"
          FROM "VotingRound" r JOIN "Room" rm ON rm.id = r."roomId"
          WHERE r.id = ${roundId}
          FOR SHARE OF r`;
        if (!round || round.roomDeletedAt) throw notFound("Round not found");
        const roomId = round.roomId;

        const [membership] = await tx.$queryRaw<{ teamId: string | null }[]>`
          SELECT "teamId" FROM "RoomMember" WHERE "roomId" = ${roomId} AND "userId" = ${voterId} FOR UPDATE`;
        // non-members must not learn the room exists; admins get the real reason
        if (!membership) throw voter.role === "ADMIN" ? forbidden("You are not a member of this room") : notFound("Not found");
        // (the voter's account status was verified by attachUser for this request)

        if (round.roomStatus !== "ACTIVE") throw conflict("This room is closed");
        if (round.status !== "OPEN") throw conflict("Voting is not open for this round");
        if (membership.teamId && membership.teamId === round.teamId) {
          throw forbidden("You cannot vote for your own team");
        }

        // category configuration snapshot for this round
        const categories = await tx.category.findMany({
          where: { roomId, configVersionId: round.configVersionId, active: true },
        });
        validateScores(inputs, categories);

        const prevVote = await tx.vote.findUnique({ where: { roundId_voterId: { roundId, voterId } } });

        let vote;
        let prevScores: { categoryId: string; score: unknown }[] = [];
        if (!prevVote) {
          vote = await tx.vote.create({ data: { roundId, roomId, teamId: round.teamId, voterId } });
        } else {
          prevScores = await tx.voteScore.findMany({ where: { voteId: prevVote.id }, select: { categoryId: true, score: true } });
          // the same ballot again (a client retry after a lost response) is a no-op success,
          // even where edits are disabled: nothing changes, no revision, no audit entry
          if (sameScores(prevScores, inputs)) {
            return { vote: prevVote, prevVote, prevScores, roomId, teamId: round.teamId, unchanged: true };
          }
          if (!getSettings({ settings: round.settings } as Room).allowVoteEdit) {
            throw conflict("Votes are final in this room and cannot be edited");
          }
          vote = await tx.vote.update({
            where: { id: prevVote.id },
            data: { revision: { increment: 1 } },
          });
          await tx.voteScore.deleteMany({ where: { voteId: vote.id, roomId } });
        }

        await tx.voteScore.createMany({
          data: inputs.map((s) => ({
            voteId: vote.id,
            categoryId: s.categoryId,
            roomId,
            score: s.score,
          })),
        });
        return { vote, prevVote, prevScores, roomId, teamId: round.teamId, unchanged: false };
      }, TX_OPTIONS)
    );

    // after commit: nothing below holds a lock or a second pool connection mid-transaction
    const { vote, prevVote, prevScores, roomId, teamId, unchanged } = result;
    const { votedCount, eligibleCount } = await eligibleCounts(roomId, roundId, teamId);
    if (unchanged) {
      return { voteId: vote.id, revision: vote.revision, edited: false, unchanged: true, eligibleCount, votedCount };
    }
    rtEvents.voteSubmitted(roomId, { roundId, votedCount, eligibleCount });

    audit({
      actorId: voterId,
      action: prevVote ? "vote.edit" : "vote.submit",
      entityType: "vote",
      entityId: vote.id,
      before: prevVote ? { revision: prevVote.revision, scores: prevScores.map((s) => ({ categoryId: s.categoryId, score: String(s.score) })) } : undefined,
      after: plainify({ roundId, roomId, teamId, revision: vote.revision, scores: inputs }),
      ip,
    });

    return {
      voteId: vote.id,
      revision: vote.revision,
      edited: Boolean(prevVote),
      eligibleCount,
      votedCount,
    };
  },

  async myVote(roomId: string, roundId: string, voterId: string) {
    const round = await roundRepo.findById(roundId);
    if (!round || round.roomId !== roomId) throw notFound("Round not found");
    const vote = await roundRepo.findVote(roundId, voterId);
    return vote ? { vote, teamId: round.teamId, submittedAt: vote.submittedAt } : null;
  },
};

interface LockedRound {
  roomId: string;
  teamId: string;
  configVersionId: string;
  status: string;
  roomStatus: string;
  settings: unknown;
  roomDeletedAt: Date | null;
}

/** True when a resubmission carries exactly the stored scores. */
function sameScores(stored: { categoryId: string; score: unknown }[], inputs: ScoreInput[]) {
  if (stored.length !== inputs.length) return false;
  const byCategory = new Map(stored.map((s) => [s.categoryId, Number(s.score)]));
  return inputs.every((s) => byCategory.get(s.categoryId) === s.score);
}

/** Unknown/duplicate/missing categories and out-of-range or off-step scores are rejected. */
function validateScores(inputs: ScoreInput[], categories: Category[]) {
  const categoryMap = new Map(categories.map((c) => [c.id, c]));
  const unknown = inputs.filter((s) => !categoryMap.has(s.categoryId));
  if (unknown.length > 0) throw conflict("Unknown category in submission");
  const seen = new Set<string>();
  for (const s of inputs) {
    if (seen.has(s.categoryId)) throw conflict("Duplicate category in submission");
    seen.add(s.categoryId);
  }
  const missingRequired = categories.filter((c) => c.isRequired && !seen.has(c.id));
  if (missingRequired.length > 0) {
    throw conflict(`Missing required category: ${missingRequired[0].name}`);
  }
  for (const s of inputs) {
    const c = categoryMap.get(s.categoryId)!;
    if (s.score < c.minScore || s.score > c.maxScore) {
      throw conflict(`Score for "${c.name}" must be between ${c.minScore} and ${c.maxScore}`);
    }
    if (((s.score - c.minScore) / c.step) % 1 !== 0) {
      throw conflict(`Score for "${c.name}" must be a valid step of ${c.step}`);
    }
  }
}

/** Eligible voters in a round = active room members whose membership team is not
 *  the presenting team. Participants without a team can vote for any team.
 *  Two indexed counts in SQL — never loads member rows. */
export async function eligibleCounts(roomId: string, roundId: string, presentingTeamId: string) {
  const [row] = await prisma.$queryRaw<{ voted: number; eligible: number }[]>`
    SELECT
      (SELECT count(*)::int FROM "Vote" WHERE "roundId" = ${roundId}) AS voted,
      (SELECT count(*)::int FROM "RoomMember" m JOIN "User" u ON u.id = m."userId"
        WHERE m."roomId" = ${roomId} AND u.status = 'ACTIVE' AND u."deletedAt" IS NULL
          AND (m."teamId" IS NULL OR m."teamId" <> ${presentingTeamId})) AS eligible`;
  return { votedCount: row?.voted ?? 0, eligibleCount: row?.eligible ?? 0 };
}
