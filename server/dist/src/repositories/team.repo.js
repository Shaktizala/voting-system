"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamRepo = void 0;
const db_1 = require("../db");
exports.teamRepo = {
    list() {
        return db_1.prisma.team.findMany({
            where: { deletedAt: null },
            orderBy: { name: "asc" },
            include: { _count: { select: { members: { where: { deletedAt: null, status: "ACTIVE" } } } } },
        });
    },
    findById(id) {
        return db_1.prisma.team.findFirst({ where: { id, deletedAt: null } });
    },
    findByName(name) {
        return db_1.prisma.team.findFirst({ where: { name, deletedAt: null } });
    },
    create(data) {
        return db_1.prisma.team.create({ data });
    },
    update(id, data) {
        return db_1.prisma.team.update({ where: { id }, data });
    },
    softDelete(id) {
        return db_1.prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
    },
    countMembers(id) {
        return db_1.prisma.user.count({ where: { teamId: id, deletedAt: null, status: "ACTIVE" } });
    },
};
