import { prisma } from "../db";
import { roundRepo } from "../repositories/round.repo";
import { roomRepo } from "../repositories/room.repo";
import { categoryRepo } from "../repositories/category.repo";
import { audit } from "../repositories/audit.repo";
import { conflict, forbidden, notFound } from "../utils/errors";
import { rtEvents } from "../realtime/emit";
import type { Room, VotingRound } from "@prisma/client";

type RoundWithTeam = VotingRound & { roomTeam: { team: { id: string; name: string } } };

export const roundService = {
  list(roomId: string) {
    return roundRepo.listForRoom(roomId);
  },

  /** Admin/moderator selects the presenting team (creates a PENDING round). */
  async selectTeam(roomId: string, teamId: string, force: boolean, actorId: string, actorRole: string, ip?: string) {
    const room = await assertActiveRoom(roomId);
    const roomTeam = await roomRepo.findRoomTeam(roomId, teamId);
    if (!roomTeam) throw conflict("Team is not linked to this room");

    const existing = await roundRepo.currentForRoom(roomId);
    if (existing && existing.status === "OPEN") {
      throw conflict("A voting round is open. Close or pause it before switching teams.");
    }
    if (existing) {
      // PENDING/PAUSED round for another team — finalize first
      await prisma.votingRound.update({
        where: { id: existing.id },
        data: { status: "CLOSED", closedAt: existing.closedAt ?? new Date() },
      });
    }

    // completed team re-presentation requires explicit force (audited)
    const prevClosed = await roundRepo.closedRoundsForTeam(roomId, teamId);
    if (prevClosed.length > 0 && !force) {
      throw conflict("This team already has completed rounds. Pass force to explicitly re-open its evaluation (audited).");
    }

    const version = await categoryRepo.findCurrentVersion(roomId);
    if (!version) throw notFound("Room configuration missing");
    const categories = await categoryRepo.listForRoom(roomId);
    if (categories.length === 0) throw conflict("This room has no categories configured yet");

    const round = await roundRepo.create({
      roomId,
      teamId,
      status: "PENDING",
      configVersionId: version.id,
    });
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
    const round = await assertRoundInRoom(roomId, roundId);
    if (round.status !== "PENDING") throw conflict(`Round is ${round.status}; only PENDING rounds can be opened`);
    const updated = await roundRepo.update(roundId, { status: "OPEN", openedAt: new Date() });
    audit({ actorId, action: "round.open", entityType: "round", entityId: roundId, ip });
    rtEvents.votingOpened(roomId, roundId);
    rtEvents.presentingChanged(roomId, {
      roundId,
      teamId: round.teamId,
      teamName: round.roomTeam.team.name,
      status: "OPEN",
    });
    return updated as RoundWithTeam;
  },

  async pause(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await assertRoundInRoom(roomId, roundId);
    if (round.status !== "OPEN") throw conflict("Only an open round can be paused");
    const updated = await roundRepo.update(roundId, { status: "PAUSED" });
    audit({ actorId, action: "round.pause", entityType: "round", entityId: roundId, ip });
    rtEvents.votingPaused(roomId, roundId);
    return updated as RoundWithTeam;
  },

  async resume(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await assertRoundInRoom(roomId, roundId);
    if (round.status !== "PAUSED") throw conflict("Only a paused round can be resumed");
    const updated = await roundRepo.update(roundId, { status: "OPEN" });
    audit({ actorId, action: "round.resume", entityType: "round", entityId: roundId, ip });
    rtEvents.votingResumed(roomId, roundId);
    return updated as RoundWithTeam;
  },

  async close(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await assertRoundInRoom(roomId, roundId);
    if (round.status === "CLOSED") throw conflict("Round already closed");
    const updated = await roundRepo.update(roundId, { status: "CLOSED", closedAt: new Date() });
    audit({ actorId, action: "round.close", entityType: "round", entityId: roundId, ip });
    rtEvents.votingClosed(roomId, roundId);
    return updated as RoundWithTeam;
  },

  /** Admin-only re-open of a closed round (audited). */
  async reopen(roomId: string, roundId: string, actorId: string, ip?: string) {
    const round = await assertRoundInRoom(roomId, roundId);
    if (round.status !== "CLOSED") throw conflict("Only closed rounds can be re-opened");
    const room = await assertActiveRoom(roomId);
    void room;
    const updated = await roundRepo.update(roundId, {
      status: "PAUSED", // re-enters PAUSED; moderator resumes intentionally
      reopenedCount: { increment: 1 },
      closedAt: null,
    });
    audit({ actorId, action: "round.reopen", entityType: "round", entityId: roundId, after: { reopened: true }, ip });
    rtEvents.votingResumed(roomId, roundId);
    return updated as RoundWithTeam;
  },
};

async function assertActiveRoom(roomId: string): Promise<Room> {
  const room = await roomRepo.findById(roomId);
  if (!room) throw notFound("Room not found");
  if (room.status !== "ACTIVE") throw conflict(`Room is ${room.status}; controls are only available on an active room`);
  return room;
}

async function assertRoundInRoom(roomId: string, roundId: string) {
  const round = await roundRepo.findById(roundId);
  if (!round || round.roomId !== roomId) throw notFound("Round not found in this room");
  return round;
}
