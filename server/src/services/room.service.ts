import { prisma } from "../db";
import { roomRepo } from "../repositories/room.repo";
import { categoryRepo } from "../repositories/category.repo";
import { roomSettingsSchema, type RoomSettings, type Role } from "@voting/shared";
import { badRequest, conflict, notFound, HttpError } from "../utils/errors";
import { generateJoinCode } from "../utils/codes";
import { sanitizeText } from "../utils/sanitize";
import { audit } from "../repositories/audit.repo";
import { rtEvents } from "../realtime/emit";
import { plainify } from "../utils/plainify";
import { Prisma } from "@prisma/client";
import type { Room } from "@prisma/client";

export function getSettings(room: Room): RoomSettings {
  const parsed = roomSettingsSchema.safeParse(room.settings);
  return parsed.success
    ? roomSettingsSchema.parse(parsed.data)
    : roomSettingsSchema.parse({});
}

export const roomService = {
  list() {
    return roomRepo.list();
  },

  /**
   * Rooms visible to a viewer: admins see every room; everyone else sees only
   * rooms they belong to, with their own membership attached. In both cases the
   * shape is `{ ...room, membership: { role, teamId } | null }`.
   */
  async listForViewer(userId: string, role: Role) {
    if (role === "ADMIN") {
      const rooms = await roomRepo.list();
      return rooms.map((room) => ({ ...room, membership: { role: "ADMIN" as const, teamId: null } }));
    }
    const rooms = await roomRepo.listForUser(userId);
    return rooms.map(({ members, ...room }) => ({ ...room, membership: members[0] ?? null }));
  },

  async create(
    input: Omit<Prisma.RoomUncheckedCreateInput, "joinCode" | "createdById"> & { createdById?: string },
    actorId: string,
    ip?: string
  ) {
    const settings = roomSettingsSchema.parse({...(input as any).settings ?? {}});
    const room = await roomRepo.create({
      ...input,
      name: sanitizeText(input.name),
      settings,
      joinCode: await uniqueJoinCode(),
      createdById: input.createdById ?? actorId,
    });
    // bootstrap config version v1
    await categoryRepo.createVersion({ roomId: room.id, version: 1, isCurrent: true });
    audit({ actorId, action: "room.create", entityType: "room", entityId: room.id, after: { name: room.name }, ip });
    return withSettings(room);
  },

  async getById(id: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    return room;
  },

  async update(id: string, patch: Prisma.RoomUncheckedUpdateInput, actorId: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    if (room.status === "ARCHIVED") throw conflict("Archived rooms cannot be edited");
    const name = patch.name ? sanitizeText(patch.name as string) : undefined;
    // settings PATCH is partial: merge onto the stored settings instead of replacing them
    const settings = patch.settings
      ? roomSettingsSchema.parse({ ...getSettings(room), ...(patch.settings as object) })
      : undefined;
    const updated = await roomRepo.update(id, {
      ...patch,
      ...(name ? { name } : {}),
      ...(settings ? { settings } : {}),
    });
    audit({
      actorId,
      action: "room.update",
      entityType: "room",
      entityId: id,
      before: { name: room.name, accessMode: room.accessMode, settings: room.settings },
      after: plainify(patch),
      ip,
    });
    rtEvents.stateChanged(id, { roomId: id, roomStatus: updated.status, votingState: deriveVotingState(updated) });
    return withSettings(updated);
  },

  async setStatus(id: string, status: "DRAFT" | "ACTIVE" | "CLOSED" | "ARCHIVED", actorId: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    const allowed: Partial<Record<Room["status"], string[]>> = {
      DRAFT: ["ACTIVE"],
      ACTIVE: ["CLOSED"],
      CLOSED: ["ARCHIVED"],
      ARCHIVED: [],
    };
    if (!allowed[room.status]?.includes(status)) {
      throw conflict(`Cannot move a ${room.status} room to ${status}`);
    }
    const updated = await roomRepo.update(id, { status });
    if (status === "CLOSED" || status === "ARCHIVED") {
      // close any open round
      await prisma.votingRound.updateMany({
        where: { roomId: id, status: { in: ["OPEN", "PAUSED", "PENDING"] } },
        data: { status: "CLOSED", closedAt: new Date() },
      });
    }
    audit({ actorId, action: "room.status", entityType: "room", entityId: id, after: { from: room.status, to: status }, ip });
    rtEvents.stateChanged(id, { roomId: id, roomStatus: status, votingState: deriveVotingState(updated) });
    return withSettings(updated);
  },

  async duplicate(id: string, actorId: string, ip?: string) {
    const room = (await roomRepo.fullSnapshot(id)) as (Room & {
      roomTeams: { teamId: string; presentationOrder: number; details: string | null }[];
      categories: { name: string; description: string | null; minScore: number; maxScore: number; step: number; weight: unknown; isRequired: boolean; displayOrder: number }[];
      configVersions: unknown[];
    }) | null;
    if (!room) throw notFound("Room not found");
    const settings = roomSettingsSchema.parse(room.settings);
    const copy = await roomRepo.create({
      name: `${room.name} (Copy)`,
      description: room.description,
      accessMode: room.accessMode,
      settings,
      joinCode: await uniqueJoinCode(),
      createdById: actorId,
    });
    const version = await categoryRepo.createVersion({ roomId: copy.id, version: 1, isCurrent: true });
    await prisma.category.createMany({
      data: room.categories.map((c) => ({
        roomId: copy.id,
        configVersionId: version.id,
        name: c.name,
        description: c.description,
        minScore: c.minScore,
        maxScore: c.maxScore,
        step: c.step,
        weight: new Prisma.Decimal(String(c.weight)),
        isRequired: c.isRequired,
        displayOrder: c.displayOrder,
      })),
    });
    await prisma.roomTeam.createMany({
      data: room.roomTeams.map((t) => ({ roomId: copy.id, teamId: t.teamId, presentationOrder: t.presentationOrder, details: t.details })),
    });
    // members are copied too (assignments), votes are not
    const members = await roomRepo.listMembers(id);
    await prisma.roomMember.createMany({
      data: members.map((m) => ({ roomId: copy.id, userId: m.userId, role: m.role, teamId: m.teamId })),
      skipDuplicates: true,
    });
    audit({ actorId, action: "room.duplicate", entityType: "room", entityId: id, after: { newRoomId: copy.id }, ip });
    await categoryRepo.setCurrentVersion(copy.id, version.id);
    return roomRepo.findById(copy.id);
  },

  async regenerateJoinCode(id: string, actorId: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    const updated = await roomRepo.update(id, {
      joinCode: await uniqueJoinCode(),
      joinCodeEnabled: true,
      joinCodeExpiresAt: null,
    });
    audit({ actorId, action: "room.join_code_regenerated", entityType: "room", entityId: id, ip });
    return updated;
  },

  async setJoinCodeState(id: string, enabled: boolean, expiresAt?: Date | null, actorId?: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    const updated = await roomRepo.update(id, { joinCodeEnabled: enabled, ...(expiresAt !== undefined ? { joinCodeExpiresAt: expiresAt } : {}) });
    if (actorId) audit({ actorId, action: enabled ? "room.join_code_enabled" : "room.join_code_disabled", entityType: "room", entityId: id, ip });
    return updated;
  },

  /** Validate code + eligibility; registers the participant. */
  async joinByCode(code: string, userId: string, actorRole: string, ip?: string) {
    const room = await roomRepo.findByCode(code.trim().toUpperCase());
    if (!room) throw notFound("Invalid or unknown room code");
    if (room.status !== "ACTIVE" && room.status !== "CLOSED") throw conflict("This room is not accepting participants right now");
    if (!room.joinCodeEnabled) throw forbiddenCode("The join code has been disabled");
    if (room.joinCodeExpiresAt && room.joinCodeExpiresAt < new Date()) throw forbiddenCode("The join code has expired");

    const user = await prisma.user.findFirst({ where: { id: userId, status: "ACTIVE", deletedAt: null } });
    if (!user) throw conflict("Account is not active");

    const existing = await roomRepo.findMember(room.id, userId);
    if (!existing) {
      if (room.accessMode === "RESTRICTED") {
        throw forbiddenCode("You have not been assigned to this room");
      }
      await prisma.roomMember.create({
        data: { roomId: room.id, userId, role: "PARTICIPANT", teamId: user.teamId },
      });
      audit({ actorId: userId, action: "room.join", entityType: "room", entityId: room.id, ip });
    }
    return room;
  },

  /* ------------------------- members / room teams ------------------------ */

  listMembers(id: string) {
    return roomRepo.listMembers(id);
  },

  async setMembers(id: string, members: { userId: string; role: string; teamId?: string | null }[], actorId: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    const users = await prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, deletedAt: null } });
    if (users.length !== new Set(members.map((m) => m.userId)).size) throw badRequest("Unknown user in member list");

    for (const m of members) {
      const user = users.find((u) => u.id === m.userId)!;
      const teamId =
        m.teamId === undefined
          ? user.teamId // inherit org team
          : m.teamId;
      if (teamId) {
        const roomHasTeam = await roomRepo.findRoomTeam(id, teamId);
        if (!roomHasTeam) throw badRequest(`Team ${teamId} is not linked to this room`);
      }
      if (user.role === "ADMIN") continue; // admins implicitly present
      await roomRepo.upsertMember(id, m.userId, { roomId: id, userId: m.userId, role: m.role as never, teamId });
    }
    audit({ actorId, action: "room.members_set", entityType: "room", entityId: id, after: { count: members.length }, ip });
    return roomRepo.listMembers(id);
  },

  async removeMember(roomId: string, userId: string, actorId: string, ip?: string) {
    await roomRepo.removeMember(roomId, userId);
    // disconnect any sockets through session revocation of room membership is event-driven; user keeps session
    audit({ actorId, action: "room.member_removed", entityType: "room", entityId: roomId, after: { userId }, ip });
    return { ok: true };
  },

  listRoomTeams(id: string) {
    return roomRepo.listRoomTeams(id);
  },

  async setRoomTeams(id: string, teams: { teamId: string; presentationOrder?: number; details?: string }[], actorId: string, ip?: string) {
    const room = await roomRepo.findById(id);
    if (!room) throw notFound("Room not found");
    const teamsExist = await prisma.team.findMany({ where: { id: { in: teams.map((t) => t.teamId) }, deletedAt: null } });
    if (teamsExist.length !== new Set(teams.map((t) => t.teamId)).size) throw badRequest("Unknown team in list");
    const hasVotes = (await categoryRepo.countVotesInRoom(id)) > 0;
    const current = await roomRepo.listRoomTeams(id);
    for (const t of teams) {
      await roomRepo.upsertRoomTeam(id, t.teamId, {
        roomId: id,
        teamId: t.teamId,
        presentationOrder: t.presentationOrder ?? 0,
        details: t.details ?? null,
      });
    }
    for (const existing of current) {
      if (!teams.some((t) => t.teamId === existing.teamId)) {
        // removing a team that already received votes during a round would break history
        const rounds = await prisma.votingRound.count({ where: { roomId: id, teamId: existing.teamId } });
        if (rounds > 0) throw conflict(`Team "${existing.team.name}" already has voting history and cannot be removed`);
        await roomRepo.removeRoomTeam(id, existing.teamId);
      }
    }
    if (!hasVotes) {
      // free reordering while unvoted
      const withOrder = teams.slice().sort((a, b) => (a.presentationOrder ?? 0) - (b.presentationOrder ?? 0));
      for (const [i, t] of withOrder.entries()) {
        await roomRepo.upsertRoomTeam(id, t.teamId, { roomId: id, teamId: t.teamId, presentationOrder: i + 1, details: t.details ?? null });
      }
    }
    audit({ actorId, action: "room.teams_set", entityType: "room", entityId: id, after: { count: teams.length }, ip });
    return roomRepo.listRoomTeams(id);
  },
};

function forbiddenCode(msg: string) {
  return new HttpError(403, msg, "FORBIDDEN");
}

export function deriveVotingState(room: Room): "not_started" | "open" | "paused" | "closed" {
  return statuses[room.status] ?? "not_started";
}
const statuses = { DRAFT: "not_started", ACTIVE: "not_started", CLOSED: "closed", ARCHIVED: "closed" } as const;

async function uniqueJoinCode() {
  for (let i = 0; i < 10; i++) {
    const code = generateJoinCode();
    const exists = await prisma.room.findUnique({ where: { joinCode: code } });
    if (!exists) return code;
  }
  throw conflict("Could not allocate a unique join code");
}

function withSettings(room: Room) {
  return { ...room, settings: getSettings(room) };
}
