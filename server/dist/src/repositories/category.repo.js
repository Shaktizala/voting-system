"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryRepo = void 0;
const db_1 = require("../db");
exports.categoryRepo = {
    listForRoom(roomId, includeInactive = false) {
        return db_1.prisma.category.findMany({
            where: { roomId, ...(includeInactive ? {} : { active: true }) },
            orderBy: { displayOrder: "asc" },
        });
    },
    findById(id) {
        return db_1.prisma.category.findUnique({ where: { id } });
    },
    findCurrentVersion(roomId) {
        return db_1.prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
    },
    createVersion(data) {
        return db_1.prisma.roomConfigVersion.create({ data });
    },
    setCurrentVersion(roomId, versionId) {
        return db_1.prisma.$transaction([
            db_1.prisma.roomConfigVersion.updateMany({ where: { roomId }, data: { isCurrent: false } }),
            db_1.prisma.roomConfigVersion.update({ where: { id: versionId }, data: { isCurrent: true } }),
        ]);
    },
    countVersions(roomId) {
        return db_1.prisma.roomConfigVersion.count({ where: { roomId } });
    },
    create(data) {
        return db_1.prisma.category.create({ data });
    },
    update(id, data) {
        return db_1.prisma.category.update({ where: { id }, data });
    },
    /** Soft-deactivate (structural removal) or hard delete if never voted */
    deactivate(id) {
        return db_1.prisma.category.update({ where: { id }, data: { active: false } });
    },
    deleteIfUnused(id) {
        return db_1.prisma.category.delete({ where: { id } });
    },
    countScoresByCategory(categoryId) {
        return db_1.prisma.voteScore.count({ where: { categoryId } });
    },
    countVotesInRoom(roomId) {
        return db_1.prisma.vote.count({ where: { roomId } });
    },
    reorder(ids, roomId) {
        return db_1.prisma.$transaction(ids.map((id, i) => db_1.prisma.category.updateMany({ where: { id, roomId }, data: { displayOrder: i } })));
    },
    /** Deep-copy every active category into a new config version. */
    cloneForVersion(roomId, fromVersionId, toVersionId) {
        return db_1.prisma.$transaction(async (tx) => {
            const cats = await tx.category.findMany({ where: { roomId, configVersionId: fromVersionId } });
            await tx.category.createMany({
                data: cats.map((c) => ({
                    roomId,
                    configVersionId: toVersionId,
                    name: c.name,
                    description: c.description,
                    minScore: c.minScore,
                    maxScore: c.maxScore,
                    step: c.step,
                    weight: c.weight,
                    isRequired: c.isRequired,
                    displayOrder: c.displayOrder,
                })),
            });
            // old version's categories become inactive going forward
            await tx.category.updateMany({ where: { configVersionId: fromVersionId }, data: { active: false } });
            return tx.category.count({ where: { configVersionId: toVersionId } });
        });
    },
    cloneToRoom(fromRoomId) {
        return db_1.prisma.category.findMany({ where: { roomId: fromRoomId, active: true } });
    },
};
