"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const room_service_1 = require("../services/room.service");
const category_service_1 = require("../services/category.service");
const room_repo_1 = require("../repositories/room.repo");
const auth_1 = require("../middleware/auth");
const rateLimit_1 = require("../middleware/rateLimit");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const errors_1 = require("../utils/errors");
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
/** Non-admins must be room members (participants of open rooms may inspect by join). */
async function requireViewer(req, roomId) {
    if (!req.user)
        throw (0, errors_1.notFound)("Room not found");
    if (req.user.role === "ADMIN")
        return;
    if (req.user.role === "MODERATOR" && (await room_repo_1.roomRepo.findMember(roomId, req.user.id))?.role === "MODERATOR")
        return;
    const member = await room_repo_1.roomRepo.findMember(roomId, req.user.id);
    if (!member)
        throw (0, errors_1.notFound)("Room not found");
}
/* ------------------------------ room CRUD ------------------------------- */
r.get("/", (0, helpers_1.wrap)(async (_req, res) => {
    res.json({ rooms: await room_service_1.roomService.list() });
}));
r.post("/", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    const input = (0, helpers_1.parseBody)(shared_1.roomCreateSchema, req.body);
    const room = await room_service_1.roomService.create({ name: input.name, description: input.description, accessMode: input.accessMode, settings: input.settings, createdById: req.user.id }, req.user.id, req.ip);
    res.status(201).json({ room });
}));
r.get("/:id", (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    const room = await room_service_1.roomService.getById(req.params.id);
    res.json({
        room: { ...room, settings: (0, room_service_1.getSettings)(room) },
        joinUrl: `${req.protocol}://${req.get("host")}/join/${room.joinCode}`,
    });
}));
r.patch("/:id", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    const patch = (0, helpers_1.parseBody)(shared_1.roomCreateSchema.partial(), req.body);
    res.json({ room: await room_service_1.roomService.update(req.params.id, patch, req.user.id, req.ip) });
}));
r.post("/:id/status", (0, auth_1.requirePermission)("rooms:control"), (0, helpers_1.wrap)(async (req, res) => {
    const status = zod_1.z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]).parse(req.body?.status);
    const room = await room_service_1.roomService.setStatus(req.params.id, status, req.user.id, req.ip);
    res.json({ room });
}));
r.post("/:id/duplicate", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    res.status(201).json({ room: await room_service_1.roomService.duplicate(req.params.id, req.user.id, req.ip) });
}));
/* ---------------------------- join code / join --------------------------- */
r.post("/:id/join-code/regenerate", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    res.json({ room: await room_service_1.roomService.regenerateJoinCode(req.params.id, req.user.id, req.ip) });
}));
r.post("/:id/join-code/disable", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    res.json({ room: await room_service_1.roomService.setJoinCodeState(req.params.id, false, undefined, req.user.id, req.ip) });
}));
r.post("/join", rateLimit_1.joinLimiter, (0, helpers_1.wrap)(async (req, res) => {
    const { code } = (0, helpers_1.parseBody)(shared_1.joinRoomSchema, req.body);
    const room = await room_service_1.roomService.joinByCode(code, req.user.id, req.user.role, req.ip);
    res.json({ room: { id: room.id, name: room.name, joinCode: room.joinCode } });
}));
/* ------------------------------- members -------------------------------- */
r.get("/:id/members", (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    res.json({ members: await room_service_1.roomService.listMembers(req.params.id) });
}));
r.put("/:id/members", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    const { members } = (0, helpers_1.parseBody)(shared_1.roomMembersPutSchema, req.body);
    res.json({ members: await room_service_1.roomService.setMembers(req.params.id, members, req.user.id, req.ip) });
}));
r.delete("/:id/members/:userId", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    res.json(await room_service_1.roomService.removeMember(req.params.id, req.params.userId, req.user.id, req.ip));
}));
/* ----------------------------- room teams ------------------------------- */
r.get("/:id/teams", (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    res.json({ roomTeams: await room_service_1.roomService.listRoomTeams(req.params.id) });
}));
r.put("/:id/teams", (0, auth_1.requirePermission)("rooms:write"), (0, helpers_1.wrap)(async (req, res) => {
    const { teams } = (0, helpers_1.parseBody)(shared_1.roomTeamsPutSchema, req.body);
    res.json({ roomTeams: await room_service_1.roomService.setRoomTeams(req.params.id, teams, req.user.id, req.ip) });
}));
/* ------------------------------ categories ------------------------------ */
r.get("/:id/categories", (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    res.json({ categories: await category_service_1.categoryService.listForRoom(req.params.id) });
}));
r.post("/:id/categories", (0, auth_1.requirePermission)("categories:write"), (0, helpers_1.wrap)(async (req, res) => {
    const input = (0, helpers_1.parseBody)(shared_1.categoryCreateSchema, req.body);
    res.status(201).json({ category: await category_service_1.categoryService.create(req.params.id, input, req.user.id, req.ip) });
}));
r.post("/:id/categories/reorder", (0, auth_1.requirePermission)("categories:write"), (0, helpers_1.wrap)(async (req, res) => {
    const { order } = (0, helpers_1.parseBody)(shared_1.categoryReorderSchema, req.body);
    res.json({ categories: await category_service_1.categoryService.reorder(req.params.id, order, req.user.id, req.ip) });
}));
r.post("/:id/config/new-version", (0, auth_1.requirePermission)("config:write"), (0, helpers_1.wrap)(async (req, res) => {
    const { reason } = (0, helpers_1.parseBody)(shared_1.newConfigVersionSchema, req.body);
    res.json(await category_service_1.categoryService.newVersion(req.params.id, reason, req.user.id, req.ip));
}));
/* ------------------------------ my membership --------------------------- */
r.get("/:id/my-membership", (0, helpers_1.wrap)(async (req, res) => {
    const room = await room_service_1.roomService.getById(req.params.id);
    const membership = await room_repo_1.roomRepo.findMember(room.id, req.user.id);
    if (!membership && req.user.role !== "ADMIN")
        throw (0, errors_1.notFound)("Room not found");
    res.json({ membership });
}));
/* --------------------------- full state snapshot ------------------------- */
r.get("/:id/full", (0, helpers_1.wrap)(async (req, res) => {
    await requireViewer(req, req.params.id);
    const snap = await room_repo_1.roomRepo.fullSnapshot(req.params.id);
    if (!snap)
        throw (0, errors_1.notFound)("Room not found");
    const settings = (0, room_service_1.getSettings)(snap);
    const membership = await room_repo_1.roomRepo.findMember(req.params.id, req.user.id);
    res.json({
        room: {
            id: snap.id,
            name: snap.name,
            description: snap.description,
            status: snap.status,
            accessMode: snap.accessMode,
            settings,
            publishedAt: snap.publishedAt,
            joinCode: req.user.role === "ADMIN" ? snap.joinCode : undefined,
            memberCount: snap._count.members,
        },
        teams: snap.roomTeams.map((rt) => ({
            teamId: rt.teamId,
            name: rt.team.name,
            presentationOrder: rt.presentationOrder,
            details: rt.details,
        })),
        categories: snap.categories,
        rounds: snap.rounds,
        membership: membership
            ? { role: membership.role, teamId: membership.teamId }
            : req.user.role === "ADMIN"
                ? { role: "ADMIN", teamId: null }
                : null,
    });
}));
exports.default = r;
