"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepo = void 0;
const db_1 = require("../db");
exports.userRepo = {
    findById(id) {
        return db_1.prisma.user.findFirst({ where: { id, deletedAt: null } });
    },
    findByIdentifier(identifier) {
        const ident = identifier.trim().toLowerCase();
        return db_1.prisma.user.findFirst({
            where: { deletedAt: null, OR: [{ email: ident }, { username: ident }] },
        });
    },
    findByUsername(username) {
        return db_1.prisma.user.findFirst({ where: { username, deletedAt: null } });
    },
    findByEmail(email) {
        return db_1.prisma.user.findFirst({ where: { email, deletedAt: null } });
    },
    list() {
        return db_1.prisma.user.findMany({
            where: { deletedAt: null },
            orderBy: [{ role: "asc" }, { name: "asc" }],
            include: { team: { select: { id: true, name: true } } },
        });
    },
    create(data) {
        return db_1.prisma.user.create({
            data,
            include: { team: { select: { id: true, name: true } } },
        });
    },
    createMany(users) {
        return db_1.prisma.user.createMany({ data: users });
    },
    update(id, data) {
        return db_1.prisma.user.update({
            where: { id },
            data,
            include: { team: { select: { id: true, name: true } } },
        });
    },
    softDelete(id) {
        return db_1.prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
    },
    countByTeam(teamId) {
        return db_1.prisma.user.count({ where: { teamId, deletedAt: null, status: "ACTIVE" } });
    },
};
