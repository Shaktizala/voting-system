"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sessionRepo = void 0;
const db_1 = require("../db");
exports.sessionRepo = {
    create(userId, tokenHash, expiresAt, ip, userAgent) {
        return db_1.prisma.session.create({ data: { userId, tokenHash, expiresAt, ip, userAgent } });
    },
    findValid(tokenHash) {
        return db_1.prisma.session.findUnique({
            where: { tokenHash },
            include: { user: true },
        });
    },
    delete(tokenHash) {
        return db_1.prisma.session.deleteMany({ where: { tokenHash } });
    },
    deleteAllForUser(userId, exceptTokenHash) {
        return db_1.prisma.session.deleteMany({
            where: { userId, ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}) },
        });
    },
    deleteExpired() {
        return db_1.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    },
};
