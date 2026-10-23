"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomRepo = void 0;
const db_1 = require("../db");
exports.roomRepo = {
    list() {
        return db_1.prisma.room.findMany({
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            include: {
                _count: {
                    select: {
                        members: true,
                        roomTeams: true,
                        categories: { where: { active: true } },
                    },
                },
            },
        });
    },
    findById(id) {
        return db_1.prisma.room.findFirst({ where: { id, deletedAt: null } });
    },
    findByCode(code) {
        return db_1.prisma.room.findFirst({ where: { joinCode: code, deletedAt: null } });
    },
    create(data) {
        return db_1.prisma.room.create({ data });
    },
    update(id, data) {
        return db_1.prisma.room.update({ where: { id }, data });
    },
    softDelete(id) {
        return db_1.prisma.room.update({ where: { id }, data: { deletedAt: new Date() } });
    },
    /* --- members --- */
    listMembers(roomId) {
        return db_1.prisma.roomMember.findMany({
            where: { roomId },
            include: {
                user: { select: { id: true, name: true, username: true, email: true, role: true, status: true, teamId: true } },
                team: { select: { id: true, name: true } },
            },
        });
    },
    findMember(roomId, userId) {
        return db_1.prisma.roomMember.findUnique({
            where: { roomId_userId: { roomId, userId } },
            include: { user: true, team: true },
        });
    },
    upsertMember(roomId, userId, data) {
        return db_1.prisma.roomMember.upsert({
            where: { roomId_userId: { roomId, userId } },
            create: data,
            update: { role: data.role, teamId: data.teamId },
        });
    },
    removeMember(roomId, userId) {
        return db_1.prisma.roomMember.deleteMany({ where: { roomId, userId } });
    },
    /* --- room teams --- */
    listRoomTeams(roomId) {
        return db_1.prisma.roomTeam.findMany({
            where: { roomId },
            orderBy: { presentationOrder: "asc" },
            include: { team: true },
        });
    },
    findRoomTeam(roomId, teamId) {
        return db_1.prisma.roomTeam.findUnique({
            where: { teamId_roomId: { teamId, roomId } },
            include: { team: true },
        });
    },
    upsertRoomTeam(roomId, teamId, data) {
        return db_1.prisma.roomTeam.upsert({
            where: { roomId_teamId: { roomId, teamId } },
            create: data,
            update: { presentationOrder: data.presentationOrder, details: data.details },
        });
    },
    removeRoomTeam(roomId, teamId) {
        return db_1.prisma.roomTeam.deleteMany({ where: { roomId, teamId } });
    },
    /* --- full snapshot for live view --- */
    fullSnapshot(roomId) {
        return db_1.prisma.room.findUnique({
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
