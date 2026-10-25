import { prisma, TX_OPTIONS } from "../db";
import { roundRepo } from "../repositories/round.repo";
import { roomRepo } from "../repositories/room.repo";
import { audit } from "../repositories/audit.repo";
import { conflict, notFound } from "../utils/errors";
import { rtEvents } from "../realtime/emit";
import { Prisma, type Room, type RoundStat, type VotingRound } from "@prisma/client";

type RoundWithTeam = VotingRound & { roomTeam: { team: { id: string; name: string } } };

export const roundService = {
  list(roomId: string) {
    return roundRepo.listForRoom(roomId);
  },

  /**
   * Admin/moderator selects the presenting team (creates a PENDING round).
   * Serialized per room (room row lock) and backed by a partial unique index,
   * so double-clicks or two moderators can never create two active rounds.
   */
  async selectTeam(roomId: string, teamId: string, force: boolean, actorId: string, actorRole: string, ip?: string) {
    const { round, roomTeam, reused } = await prisma
      .$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Room" WHERE id = ${roomId} FOR UPDATE`;
        const room = await tx.room.findFirst({ where: { id: roomId, deletedAt: null } });
        if (!room) throw notFound("Room not found");
        if (room.status !== "ACTIVE") throw conflict(`Room is ${room.status}; controls are only available on an active room`);
        const roomTeam = await tx.roomTeam.findUnique({ where: { roomId_teamId: { roomId, teamId } }, include: { team: true } });
        if (!roomTeam) throw conflict("Team is not linked to this room");

        const existing = await tx.votingRound.findFirst({
          where: { roomId, status: { in: ACTIVE_STATUSES } },
          include: { roomTeam: { include: { team: true } } },
        });
        if (existing && existing.status === "OPEN") {
          throw conflict("A voting round is open. Close or pause it before switching teams.");
        }
        // same team already queued (double-click / two moderators): idempotent
        if (existing && existing.status === "PENDING" && existing.teamId === teamId) {
          return { round: existing, roomTeam, reused: true };
        }

        // completed team re-presentation requires explicit force (audited);
        // only rounds that actually opened count as "presented"
        const prevClosed = await tx.votingRound.count({ where: { roomId, teamId, status: "CLOSED", openedAt: { not: null } } });
        if (prevClosed > 0 && !force) {
          throw conflict("This team already has completed rounds. Pass force to explicitly re-open its evaluation (audited).");
        }

        const version = await tx.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
        if (!version) throw notFound("Room configuration missing");
        const categories = await tx.category.count({ where: { roomId, configVersionId: version.id, active: true } });
        if (categories === 0) throw conflict("This room has no categories configured yet");

        if (existing && !existing.openedAt) {
          // queued but never opened (wrong team picked): discard, it holds no votes
          await tx.votingRound.delete({ where: { id: existing.id } });
        } else if (existing) {
          // PAUSED round for another team — finalize first
          await tx.votingRound.update({
            where: { id: existing.id },
            data: { status: "CLOSED", closedAt: existing.closedAt ?? new Date() },
          });
        }
        const round = await tx.votingRound.create({
          data: { roomId, teamId, status: "PENDING", configVersionId: version.id },
          include: { roomTeam: { include: { team: true } } },
        });
        return { round, roomTeam, reused: false };
      }, TX_OPTIONS)
      .catch(mapActiveRoundConflict);
    if (reused) return round;

    audit({
      actorId,
      action: force ? "round.team_reselected" : "round.team_selected",
      entityType: "round",
      entityId: round.id,
      after: { roomId, teamId, forced: force, actorRole },
      ip,
    });
    rtEvents.presentingChanged(roomId, {
      roundId: round.id,
      teamId,
      teamName: roomTeam.team.name,
      status: "PENDING",
    });
    return round;
  },

  async open(roomId: string, roundId: string, actorId: string, ip?: string) {
    await assertActiveRoom(roomId);
    const round = await transition(roomId, roundId, ["PENDING"], () => ({ status: "OPEN", openedAt: new Date() }), "only PENDING rounds can be opened");
    audit({ actorId, action: "round.open", entityType: "round", entityId: roundId, ip });
    rtEvents.votingOpened(roomId, roundId);
    rtEvents.presentingChanged(roomId, {
      roundId,
      teamId: round.teamId,
      teamName: round.roomTeam.team.name,
      status: "OPEN",
    });
    return round;
  },

  async pause(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await transition(roomId, roundId, ["OPEN"], () => ({ status: "PAUSED" }), "only an open round can be paused");
    audit({ actorId, action: "round.pause", entityType: "round", entityId: roundId, ip });
    rtEvents.votingPaused(roomId, roundId);
    return round;
  },

  async resume(roomId: string, roundId: string, actorId: string, ip?: string) {
    await assertActiveRoom(roomId);
    const round = await transition(roomId, roundId, ["PAUSED"], () => ({ status: "OPEN" }), "only a paused round can be resumed");
    audit({ actorId, action: "round.resume", entityType: "round", entityId: roundId, ip });
    rtEvents.votingResumed(roomId, roundId);
    return round;
  },

  /** Waits for in-flight votes (they hold the round row FOR SHARE); later votes see CLOSED. */
  async close(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await transition(roomId, roundId, ["PENDING", "OPEN", "PAUSED"], () => ({ status: "CLOSED", closedAt: new Date() }), "round already closed");
    audit({ actorId, action: "round.close", entityType: "round", entityId: roundId, ip });
    rtEvents.votingClosed(roomId, roundId);
    return round;
  },

  /** Admin-only re-open of a closed round (audited). */
  async reopen(roomId: string, roundId: string, actorId: string, ip?: string) {
    await assertActiveRoom(roomId);
    const round = await transition(
      roomId,
      roundId,
      ["CLOSED"],
      () => ({
        status: "PAUSED", // re-enters PAUSED; moderator resumes intentionally
        reopenedCount: { increment: 1 },
        closedAt: null,
      }),
      "only closed rounds can be re-opened"
    ).catch(mapActiveRoundConflict);
    audit({ actorId, action: "round.reopen", entityType: "round", entityId: roundId, after: { reopened: true }, ip });
    rtEvents.votingPaused(roomId, roundId);
    return round;
  },
};

const ACTIVE_STATUSES: RoundStat[] = ["PENDING", "OPEN", "PAUSED"];

/**
 * Atomic state transition. The round row is locked FOR UPDATE first, which
 * waits for in-flight votes (they hold it FOR SHARE) — so a close takes effect
 * only after accepted votes commit, timestamps are taken at that moment, and
 * two moderators clicking at once can't both "win" from a stale read.
 */
async function transition(
  roomId: string,
  roundId: string,
  from: RoundStat[],
  data: () => Prisma.VotingRoundUncheckedUpdateInput,
  reason: string
): Promise<RoundWithTeam> {
  return prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ roomId: string; status: RoundStat }[]>`
      SELECT "roomId", status FROM "VotingRound" WHERE id = ${roundId} FOR UPDATE`;
    if (!row || row.roomId !== roomId) throw notFound("Round not found in this room");
    if (!from.includes(row.status)) throw conflict(`Round is ${row.status}; ${reason}`);
    return tx.votingRound.update({
      where: { id: roundId },
      data: data(),
      include: { roomTeam: { include: { team: true } } },
    });
  }, TX_OPTIONS);
}

/** The one-active-round-per-room index fired: another round is already live. */
function mapActiveRoundConflict(e: unknown): never {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    throw conflict("Another round is already active in this room. Close it first.");
  }
  throw e;
}

async function assertActiveRoom(roomId: string): Promise<Room> {
  const room = await roomRepo.findById(roomId);
  if (!room) throw notFound("Room not found");
  if (room.status !== "ACTIVE") throw conflict(`Room is ${room.status}; controls are only available on an active room`);
  return room;
}
