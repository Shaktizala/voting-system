import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

/** Public user fields for membership responses — never includes passwordHash. */
const memberUserSelect = {
  id: true,
  name: true,
  username: true,
  email: true,
  role: true,
  status: true,
  teamId: true,
} as const;

const roomCounts = {
  _count: {
    select: {
      members: true,
      roomTeams: true,
      categories: { where: { active: true } },
    },
  },
} as const;

export const roomRepo = {
  list() {
    return prisma.room.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: roomCounts,
    });
  },
  /** Rooms the user belongs to, with their own membership attached. */
  listForUser(userId: string) {
    return prisma.room.findMany({
      where: { deletedAt: null, members: { some: { userId } } },
      orderBy: { createdAt: "desc" },
      include: {
        ...roomCounts,
        members: { where: { userId }, select: { role: true, teamId: true } },
      },
    });
  },
  findById(id: string) {
    return prisma.room.findFirst({ where: { id, deletedAt: null } });
  },
  findByCode(code: string) {
    return prisma.room.findFirst({ where: { joinCode: code, deletedAt: null } });
  },
  create(data: Prisma.RoomUncheckedCreateInput) {
    return prisma.room.create({ data });
  },
  update(id: string, data: Prisma.RoomUncheckedUpdateInput) {
    return prisma.room.update({ where: { id }, data });
  },
  softDelete(id: string) {
    return prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  /* --- members --- */
  listMembers(roomId: string) {
    return prisma.roomMember.findMany({
      where: { roomId },
      include: {
        user: { select: { id: true, name: true, username: true, email: true, role: true, status: true, teamId: true } },
        team: { select: { id: true, name: true } },
      },
    });
  },
  findMember(roomId: string, userId: string) {
    return prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
      include: { user: { select: memberUserSelect }, team: true },
    });
  },
  upsertMember(roomId: string, userId: string, data: Prisma.RoomMemberUncheckedCreateInput) {
    return prisma.roomMember.upsert({
      where: { roomId_userId: { roomId, userId } },
      create: data,
      update: { role: data.role, teamId: data.teamId },
    });
  },
  removeMember(roomId: string, userId: string) {
    return prisma.roomMember.deleteMany({ where: { roomId, userId } });
  },

  /* --- room teams --- */
  listRoomTeams(roomId: string) {
    return prisma.roomTeam.findMany({
      where: { roomId },
      orderBy: { presentationOrder: "asc" },
      include: { team: true },
    });
  },
  findRoomTeam(roomId: string, teamId: string) {
    return prisma.roomTeam.findUnique({
      where: { teamId_roomId: { teamId, roomId } },
      include: { team: true },
    });
  },
  upsertRoomTeam(roomId: string, teamId: string, data: Prisma.RoomTeamUncheckedCreateInput) {
    return prisma.roomTeam.upsert({
      where: { roomId_teamId: { roomId, teamId } },
      create: data,
      update: { presentationOrder: data.presentationOrder, details: data.details },
    });
  },
  removeRoomTeam(roomId: string, teamId: string) {
    return prisma.roomTeam.deleteMany({ where: { roomId, teamId } });
  },

  /* --- full snapshot for live view --- */
  fullSnapshot(roomId: string) {
    return prisma.room.findUnique({
      where: { id: roomId },
      include: {
        roomTeams: { orderBy: { presentationOrder: "asc" }, include: { team: true } },
        categories: { where: { active: true }, orderBy: { displayOrder: "asc" } },
        rounds: { orderBy: { createdAt: "desc" } },
        _count: { select: { members: true } },
      },
    });
  },
};
