"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.roomService = void 0;
exports.getSettings = getSettings;
exports.deriveVotingState = deriveVotingState;
const db_1 = require("../db");
const room_repo_1 = require("../repositories/room.repo");
const category_repo_1 = require("../repositories/category.repo");
const shared_1 = require("@voting/shared");
const errors_1 = require("../utils/errors");
const codes_1 = require("../utils/codes");
const sanitize_1 = require("../utils/sanitize");
const audit_repo_1 = require("../repositories/audit.repo");
const emit_1 = require("../realtime/emit");
const plainify_1 = require("../utils/plainify");
const client_1 = require("@prisma/client");
function getSettings(room) {
    const parsed = shared_1.roomSettingsSchema.safeParse(room.settings);
    return parsed.success
        ? shared_1.roomSettingsSchema.parse(parsed.data)
        : shared_1.roomSettingsSchema.parse({});
}
exports.roomService = {
    list() {
        return room_repo_1.roomRepo.list();
    },
    async create(input, actorId, ip) {
        const settings = shared_1.roomSettingsSchema.parse({ ...input.settings ?? {} });
        const room = await room_repo_1.roomRepo.create({
            ...input,
            name: (0, sanitize_1.sanitizeText)(input.name),
            settings,
            joinCode: await uniqueJoinCode(),
            createdById: input.createdById ?? actorId,
        });
        // bootstrap config version v1
        await category_repo_1.categoryRepo.createVersion({ roomId: room.id, version: 1, isCurrent: true });
        (0, audit_repo_1.audit)({ actorId, action: "room.create", entityType: "room", entityId: room.id, after: { name: room.name }, ip });
        return withSettings(room);
    },
    async getById(id) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        return room;
    },
    async update(id, patch, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        if (room.status === "ARCHIVED")
            throw (0, errors_1.conflict)("Archived rooms cannot be edited");
        const name = patch.name ? (0, sanitize_1.sanitizeText)(patch.name) : undefined;
        const updated = await room_repo_1.roomRepo.update(id, {
            ...patch,
            ...(name ? { name } : {}),
        });
        (0, audit_repo_1.audit)({
            actorId,
            action: "room.update",
            entityType: "room",
            entityId: id,
            before: { name: room.name, accessMode: room.accessMode, settings: room.settings },
            after: (0, plainify_1.plainify)(patch),
            ip,
        });
        emit_1.rtEvents.stateChanged(id, { roomId: id, roomStatus: updated.status, votingState: deriveVotingState(updated) });
        return withSettings(updated);
    },
    async setStatus(id, status, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const allowed = {
            DRAFT: ["ACTIVE"],
            ACTIVE: ["CLOSED"],
            CLOSED: ["ARCHIVED"],
            ARCHIVED: [],
        };
        if (!allowed[room.status]?.includes(status)) {
            throw (0, errors_1.conflict)(`Cannot move a ${room.status} room to ${status}`);
        }
        const updated = await room_repo_1.roomRepo.update(id, { status });
        if (status === "CLOSED" || status === "ARCHIVED") {
            // close any open round
            await db_1.prisma.votingRound.updateMany({
                where: { roomId: id, status: { in: ["OPEN", "PAUSED", "PENDING"] } },
                data: { status: "CLOSED", closedAt: new Date() },
            });
        }
        (0, audit_repo_1.audit)({ actorId, action: "room.status", entityType: "room", entityId: id, after: { from: room.status, to: status }, ip });
        emit_1.rtEvents.stateChanged(id, { roomId: id, roomStatus: status, votingState: deriveVotingState(updated) });
        return withSettings(updated);
    },
    async duplicate(id, actorId, ip) {
        const room = (await room_repo_1.roomRepo.fullSnapshot(id));
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const settings = shared_1.roomSettingsSchema.parse(room.settings);
        const copy = await room_repo_1.roomRepo.create({
            name: `${room.name} (Copy)`,
            description: room.description,
            accessMode: room.accessMode,
            settings,
            joinCode: await uniqueJoinCode(),
            createdById: actorId,
        });
        const version = await category_repo_1.categoryRepo.createVersion({ roomId: copy.id, version: 1, isCurrent: true });
        await db_1.prisma.category.createMany({
            data: room.categories.map((c) => ({
                roomId: copy.id,
                configVersionId: version.id,
                name: c.name,
                description: c.description,
                minScore: c.minScore,
                maxScore: c.maxScore,
                step: c.step,
                weight: new client_1.Prisma.Decimal(String(c.weight)),
                isRequired: c.isRequired,
                displayOrder: c.displayOrder,
            })),
        });
        await db_1.prisma.roomTeam.createMany({
            data: room.roomTeams.map((t) => ({ roomId: copy.id, teamId: t.teamId, presentationOrder: t.presentationOrder, details: t.details })),
        });
        // members are copied too (assignments), votes are not
        const members = await room_repo_1.roomRepo.listMembers(id);
        await db_1.prisma.roomMember.createMany({
            data: members.map((m) => ({ roomId: copy.id, userId: m.userId, role: m.role, teamId: m.teamId })),
            skipDuplicates: true,
        });
        (0, audit_repo_1.audit)({ actorId, action: "room.duplicate", entityType: "room", entityId: id, after: { newRoomId: copy.id }, ip });
        await category_repo_1.categoryRepo.setCurrentVersion(copy.id, version.id);
        return room_repo_1.roomRepo.findById(copy.id);
    },
    async regenerateJoinCode(id, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const updated = await room_repo_1.roomRepo.update(id, {
            joinCode: await uniqueJoinCode(),
            joinCodeEnabled: true,
            joinCodeExpiresAt: null,
        });
        (0, audit_repo_1.audit)({ actorId, action: "room.join_code_regenerated", entityType: "room", entityId: id, ip });
        return updated;
    },
    async setJoinCodeState(id, enabled, expiresAt, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const updated = await room_repo_1.roomRepo.update(id, { joinCodeEnabled: enabled, ...(expiresAt !== undefined ? { joinCodeExpiresAt: expiresAt } : {}) });
        if (actorId)
            (0, audit_repo_1.audit)({ actorId, action: enabled ? "room.join_code_enabled" : "room.join_code_disabled", entityType: "room", entityId: id, ip });
        return updated;
    },
    /** Validate code + eligibility; registers the participant. */
    async joinByCode(code, userId, actorRole, ip) {
        const room = await room_repo_1.roomRepo.findByCode(code.trim().toUpperCase());
        if (!room)
            throw (0, errors_1.notFound)("Invalid or unknown room code");
        if (room.status !== "ACTIVE" && room.status !== "CLOSED")
            throw (0, errors_1.conflict)("This room is not accepting participants right now");
        if (!room.joinCodeEnabled)
            throw forbiddenCode("The join code has been disabled");
        if (room.joinCodeExpiresAt && room.joinCodeExpiresAt < new Date())
            throw forbiddenCode("The join code has expired");
        const user = await db_1.prisma.user.findFirst({ where: { id: userId, status: "ACTIVE", deletedAt: null } });
        if (!user)
            throw (0, errors_1.conflict)("Account is not active");
        const existing = await room_repo_1.roomRepo.findMember(room.id, userId);
        if (!existing) {
            if (room.accessMode === "RESTRICTED") {
                throw forbiddenCode("You have not been assigned to this room");
            }
            await db_1.prisma.roomMember.create({
                data: { roomId: room.id, userId, role: "PARTICIPANT", teamId: user.teamId },
            });
            (0, audit_repo_1.audit)({ actorId: userId, action: "room.join", entityType: "room", entityId: room.id, ip });
        }
        return room;
    },
    /* ------------------------- members / room teams ------------------------ */
    listMembers(id) {
        return room_repo_1.roomRepo.listMembers(id);
    },
    async setMembers(id, members, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const users = await db_1.prisma.user.findMany({ where: { id: { in: members.map((m) => m.userId) }, deletedAt: null } });
        if (users.length !== new Set(members.map((m) => m.userId)).size)
            throw (0, errors_1.badRequest)("Unknown user in member list");
        for (const m of members) {
            const user = users.find((u) => u.id === m.userId);
            const teamId = m.teamId === undefined
                ? user.teamId // inherit org team
                : m.teamId;
            if (teamId) {
                const roomHasTeam = await room_repo_1.roomRepo.findRoomTeam(id, teamId);
                if (!roomHasTeam)
                    throw (0, errors_1.badRequest)(`Team ${teamId} is not linked to this room`);
            }
            if (user.role === "ADMIN")
                continue; // admins implicitly present
            await room_repo_1.roomRepo.upsertMember(id, m.userId, { roomId: id, userId: m.userId, role: m.role, teamId });
        }
        (0, audit_repo_1.audit)({ actorId, action: "room.members_set", entityType: "room", entityId: id, after: { count: members.length }, ip });
        return room_repo_1.roomRepo.listMembers(id);
    },
    async removeMember(roomId, userId, actorId, ip) {
        await room_repo_1.roomRepo.removeMember(roomId, userId);
        // disconnect any sockets through session revocation of room membership is event-driven; user keeps session
        (0, audit_repo_1.audit)({ actorId, action: "room.member_removed", entityType: "room", entityId: roomId, after: { userId }, ip });
        return { ok: true };
    },
    listRoomTeams(id) {
        return room_repo_1.roomRepo.listRoomTeams(id);
    },
    async setRoomTeams(id, teams, actorId, ip) {
        const room = await room_repo_1.roomRepo.findById(id);
        if (!room)
            throw (0, errors_1.notFound)("Room not found");
        const teamsExist = await db_1.prisma.team.findMany({ where: { id: { in: teams.map((t) => t.teamId) }, deletedAt: null } });
        if (teamsExist.length !== new Set(teams.map((t) => t.teamId)).size)
            throw (0, errors_1.badRequest)("Unknown team in list");
        const hasVotes = (await category_repo_1.categoryRepo.countVotesInRoom(id)) > 0;
        const current = await room_repo_1.roomRepo.listRoomTeams(id);
        for (const t of teams) {
            await room_repo_1.roomRepo.upsertRoomTeam(id, t.teamId, {
                roomId: id,
                teamId: t.teamId,
                presentationOrder: t.presentationOrder ?? 0,
                details: t.details ?? null,
            });
        }
        for (const existing of current) {
            if (!teams.some((t) => t.teamId === existing.teamId)) {
                // removing a team that already received votes during a round would break history
                const rounds = await db_1.prisma.votingRound.count({ where: { roomId: id, teamId: existing.teamId } });
                if (rounds > 0)
                    throw (0, errors_1.conflict)(`Team "${existing.team.name}" already has voting history and cannot be removed`);
                await room_repo_1.roomRepo.removeRoomTeam(id, existing.teamId);
            }
        }
        if (!hasVotes) {
            // free reordering while unvoted
            const withOrder = teams.slice().sort((a, b) => (a.presentationOrder ?? 0) - (b.presentationOrder ?? 0));
            for (const [i, t] of withOrder.entries()) {
                await room_repo_1.roomRepo.upsertRoomTeam(id, t.teamId, { roomId: id, teamId: t.teamId, presentationOrder: i + 1, details: t.details ?? null });
            }
        }
        (0, audit_repo_1.audit)({ actorId, action: "room.teams_set", entityType: "room", entityId: id, after: { count: teams.length }, ip });
        return room_repo_1.roomRepo.listRoomTeams(id);
    },
};
function forbiddenCode(msg) {
    return new errors_1.HttpError(403, msg, "FORBIDDEN");
}
function deriveVotingState(room) {
    return statuses[room.status] ?? "not_started";
}
const statuses = { DRAFT: "not_started", ACTIVE: "not_started", CLOSED: "closed", ARCHIVED: "closed" };
async function uniqueJoinCode() {
    for (let i = 0; i < 10; i++) {
        const code = (0, codes_1.generateJoinCode)();
        const exists = await db_1.prisma.room.findUnique({ where: { joinCode: code } });
        if (!exists)
            return code;
    }
    throw (0, errors_1.conflict)("Could not allocate a unique join code");
}
function withSettings(room) {
    return { ...room, settings: getSettings(room) };
}
