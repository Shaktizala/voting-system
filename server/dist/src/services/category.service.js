"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryService = void 0;
const db_1 = require("../db");
const category_repo_1 = require("../repositories/category.repo");
const room_repo_1 = require("../repositories/room.repo");
const audit_repo_1 = require("../repositories/audit.repo");
const errors_1 = require("../utils/errors");
const sanitize_1 = require("../utils/sanitize");
const plainify_1 = require("../utils/plainify");
exports.categoryService = {
    async listForRoom(roomId, includeInactive = false) {
        await assertRoom(roomId);
        return category_repo_1.categoryRepo.listForRoom(roomId, includeInactive);
    },
    /** Structural changes are allowed while no vote exists in the room. */
    async create(roomId, input, actorId, ip) {
        await assertRoom(roomId);
        await assertUnlocked(roomId);
        if ((await category_repo_1.categoryRepo.countVotesInRoom(roomId)) > 0) {
            throw (0, errors_1.conflict)("Categories are locked once voting has started. Start a new configuration version to add categories.");
        }
        const version = await category_repo_1.categoryRepo.findCurrentVersion(roomId);
        if (!version)
            throw (0, errors_1.notFound)("Room config version missing");
        validateRange(input);
        const count = await db_1.prisma.category.count({ where: { roomId, active: true } });
        const category = await category_repo_1.categoryRepo.create({ ...input, name: (0, sanitize_1.sanitizeText)(input.name), roomId, configVersionId: version.id, displayOrder: count });
        (0, audit_repo_1.audit)({ actorId, action: "category.create", entityType: "room", entityId: roomId, after: { name: category.name }, ip });
        return category;
    },
    async update(categoryId, patch, actorId, ip) {
        const category = (await category_repo_1.categoryRepo.findById(categoryId)) ?? null;
        if (!category || !category.active)
            throw (0, errors_1.notFound)("Category not found");
        const isStructural = patch.minScore !== undefined ||
            patch.maxScore !== undefined ||
            patch.step !== undefined ||
            patch.weight !== undefined ||
            patch.isRequired !== undefined;
        if (isStructural) {
            const hasVotes = (await category_repo_1.categoryRepo.countVotesInRoom(category.roomId)) > 0;
            if (hasVotes)
                throw (0, errors_1.conflict)("Scoring ranges are locked once voting has started. Start a new configuration version instead.");
            validateRange({
                minScore: patch.minScore ?? category.minScore,
                maxScore: patch.maxScore ?? category.maxScore,
                step: patch.step ?? category.step,
                weight: Number(patch.weight ?? category.weight),
                isRequired: patch.isRequired ?? category.isRequired,
            });
        }
        if (typeof patch.name === "string")
            patch.name = (0, sanitize_1.sanitizeText)(patch.name);
        const updated = await category_repo_1.categoryRepo.update(categoryId, patch);
        (0, audit_repo_1.audit)({
            actorId,
            action: "category.update",
            entityType: "room",
            entityId: category.roomId,
            before: { name: category.name },
            after: (0, plainify_1.plainify)(patch),
            ip,
        });
        return updated;
    },
    async remove(categoryId, actorId, ip) {
        const category = await category_repo_1.categoryRepo.findById(categoryId);
        if (!category || !category.active)
            throw (0, errors_1.notFound)("Category not found");
        await assertUnlocked(category.roomId);
        const used = (await category_repo_1.categoryRepo.countScoresByCategory(categoryId)) > 0;
        if (used)
            throw (0, errors_1.conflict)("This category has votes and cannot be removed in the current configuration version.");
        await category_repo_1.categoryRepo.deleteIfUnused(categoryId);
        (0, audit_repo_1.audit)({ actorId, action: "category.remove", entityType: "room", entityId: category.roomId, before: { name: category.name }, ip });
        return { ok: true };
    },
    async reorder(roomId, order, actorId, ip) {
        await assertRoom(roomId);
        await assertUnlocked(roomId);
        await category_repo_1.categoryRepo.reorder(order, roomId);
        (0, audit_repo_1.audit)({ actorId, action: "category.reorder", entityType: "room", entityId: roomId, ip });
        return category_repo_1.categoryRepo.listForRoom(roomId);
    },
    /** Start a new configuration version: deep-copies current active categories. */
    async newVersion(roomId, reason, actorId, ip) {
        const room = await assertRoom(roomId);
        const hasVotes = (await category_repo_1.categoryRepo.countVotesInRoom(roomId)) > 0;
        if (!hasVotes)
            throw (0, errors_1.conflict)("Configuration is not locked yet — edit categories directly.");
        const current = await category_repo_1.categoryRepo.findCurrentVersion(roomId);
        if (!current)
            throw (0, errors_1.notFound)("Room config version missing");
        const count = await category_repo_1.categoryRepo.countVersions(roomId);
        const version = await category_repo_1.categoryRepo.createVersion({ roomId, version: count + 1, isCurrent: false, reason: reason ?? null });
        await category_repo_1.categoryRepo.cloneForVersion(roomId, current.id, version.id);
        await category_repo_1.categoryRepo.setCurrentVersion(roomId, version.id);
        (0, audit_repo_1.audit)({
            actorId,
            action: "room.config_new_version",
            entityType: "room",
            entityId: roomId,
            after: { version: count + 1, reason, room: room.name },
            ip,
        });
        return { version: count + 1, versionId: version.id, categories: await category_repo_1.categoryRepo.listForRoom(roomId) };
    },
};
function validateRange(c) {
    if (c.maxScore <= c.minScore)
        throw (0, errors_1.badRequest)("maxScore must be greater than minScore");
    const span = c.maxScore - c.minScore;
    if (span % c.step !== 0)
        throw (0, errors_1.badRequest)("Score range must be divisible by step");
    if (c.weight !== undefined && (c.weight < 0 || c.weight > 1000))
        throw (0, errors_1.badRequest)("Weight must be between 0 and 1000");
}
async function assertRoom(roomId) {
    const room = await room_repo_1.roomRepo.findById(roomId);
    if (!room)
        throw (0, errors_1.notFound)("Room not found");
    return room;
}
async function assertUnlocked(roomId) {
    const room = await assertRoom(roomId);
    if (room.status === "ARCHIVED" || room.status === "CLOSED")
        throw (0, errors_1.conflict)("This room is closed and can no longer be configured");
}
