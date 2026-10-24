import { Router } from "express";
import { z } from "zod";
import { roomService, getSettings } from "../services/room.service";
import { categoryService } from "../services/category.service";
import { roomRepo } from "../repositories/room.repo";
import { requireAuth, requirePermission } from "../middleware/auth";
import { joinLimiter } from "../middleware/rateLimit";
import {
  roomCreateSchema, roomMembersPutSchema, roomTeamsPutSchema, joinRoomSchema,
  categoryCreateSchema, categoryReorderSchema, newConfigVersionSchema,
} from "@voting/shared";
import { wrap, parseBody } from "./helpers";
import { notFound } from "../utils/errors";
import { memberGuard, moderatorGuard, isRoomModerator } from "./guards";
import { prisma } from "../db";

const r = Router();

r.use(requireAuth);

/** Join codes are operational secrets: only admins and room moderators see them. */
function redactJoinCode<T extends { joinCode?: string | null }>(room: T, canManage: boolean): T {
  if (canManage) return room;
  const { joinCode: _joinCode, ...safe } = room;
  void _joinCode;
  return safe as T;
}

/* ------------------------------ room CRUD ------------------------------- */

/**
 * Admins receive every room; everyone else receives only rooms they belong to.
 * A caller may never see another room's join code.
 */
r.get("/", wrap(async (req, res) => {
  const rooms = await roomService.listForViewer(req.user!.id, req.user!.role);
  const canManage = req.user!.role === "ADMIN";
  res.json({ rooms: rooms.map((room) => redactJoinCode(room, canManage)) });
}));

/** Explicitly membership-scoped list used by the participant home page. */
r.get("/mine", wrap(async (req, res) => {
  const rooms = await roomService.listForViewer(req.user!.id, req.user!.role);
  const canManage = req.user!.role === "ADMIN";
  res.json({ rooms: rooms.map((room) => redactJoinCode(room, canManage)) });
}));

r.post("/", requirePermission("rooms:write"), wrap(async (req, res) => {
  const input = parseBody(roomCreateSchema, req.body);
  const room = await roomService.create(
    { name: input.name, description: input.description, accessMode: input.accessMode, settings: input.settings, createdById: req.user!.id },
    req.user!.id,
    req.ip
  );
  res.status(201).json({ room });
}));

r.get("/:id", wrap(async (req, res) => {
  await memberGuard(req, req.params.id);
  const room = await roomService.getById(req.params.id);
  const canManage = await isRoomModerator(req, req.params.id);
  res.json({
    room: redactJoinCode({ ...room, settings: getSettings(room) }, canManage),
    joinUrl: canManage ? `${req.protocol}://${req.get("host")}/join/${room.joinCode}` : undefined,
  });
}));

r.patch("/:id", requirePermission("rooms:write"), wrap(async (req, res) => {
  const patch = parseBody(roomCreateSchema.partial(), req.body);
  res.json({ room: await roomService.update(req.params.id, patch, req.user!.id, req.ip) });
}));

r.post("/:id/status", requirePermission("rooms:control"), wrap(async (req, res) => {
  const status = z.enum(["DRAFT", "ACTIVE", "CLOSED", "ARCHIVED"]).parse(req.body?.status);
  const room = await roomService.setStatus(req.params.id, status, req.user!.id, req.ip);
  res.json({ room });
}));

r.post("/:id/duplicate", requirePermission("rooms:write"), wrap(async (req, res) => {
  res.status(201).json({ room: await roomService.duplicate(req.params.id, req.user!.id, req.ip) });
}));

/* ---------------------------- join code / join --------------------------- */

r.post("/:id/join-code/regenerate", requirePermission("rooms:write"), wrap(async (req, res) => {
  res.json({ room: await roomService.regenerateJoinCode(req.params.id, req.user!.id, req.ip) });
}));

r.post("/:id/join-code/disable", requirePermission("rooms:write"), wrap(async (req, res) => {
  res.json({ room: await roomService.setJoinCodeState(req.params.id, false, undefined, req.user!.id, req.ip) });
}));

r.post("/join", joinLimiter, wrap(async (req, res) => {
  const { code } = parseBody(joinRoomSchema, req.body);
  const room = await roomService.joinByCode(code, req.user!.id, req.user!.role, req.ip);
  res.json({ room: { id: room.id, name: room.name, joinCode: room.joinCode } });
}));

/* ------------------------------- members -------------------------------- */

r.get("/:id/members", wrap(async (req, res) => {
  await requireViewer(req, req.params.id);
  res.json({ members: await roomService.listMembers(req.params.id) });
}));

r.put("/:id/members", requirePermission("rooms:write"), wrap(async (req, res) => {
  const { members } = parseBody(roomMembersPutSchema, req.body);
  res.json({ members: await roomService.setMembers(req.params.id, members, req.user!.id, req.ip) });
}));

r.delete("/:id/members/:userId", requirePermission("rooms:write"), wrap(async (req, res) => {
  await memberGuard(req, req.params.id);
  res.json(await roomService.removeMember(req.params.id, req.params.userId, req.user!.id, req.ip));
}));

/* ----------------------------- room teams ------------------------------- */

r.get("/:id/teams", wrap(async (req, res) => {
  await memberGuard(req, req.params.id);
  res.json({ roomTeams: await roomService.listRoomTeams(req.params.id) });
}));

r.put("/:id/teams", requirePermission("rooms:write"), wrap(async (req, res) => {
  const { teams } = parseBody(roomTeamsPutSchema, req.body);
  res.json({ roomTeams: await roomService.setRoomTeams(req.params.id, teams, req.user!.id, req.ip) });
}));

/* ------------------------------ categories ------------------------------ */

r.get("/:id/categories", wrap(async (req, res) => {
  await memberGuard(req, req.params.id);
  res.json({ categories: await categoryService.listForRoom(req.params.id) });
}));

r.post("/:id/categories", requirePermission("categories:write"), wrap(async (req, res) => {
  const input = parseBody(categoryCreateSchema, req.body);
  res.status(201).json({ category: await categoryService.create(req.params.id, input, req.user!.id, req.ip) });
}));

r.post("/:id/categories/reorder", requirePermission("categories:write"), wrap(async (req, res) => {
  const { order } = parseBody(categoryReorderSchema, req.body);
  res.json({ categories: await categoryService.reorder(req.params.id, order, req.user!.id, req.ip) });
}));

r.post("/:id/config/new-version", requirePermission("config:write"), wrap(async (req, res) => {
  const { reason } = parseBody(newConfigVersionSchema, req.body);
  res.json(await categoryService.newVersion(req.params.id, reason, req.user!.id, req.ip));
}));

/* ------------------------------ my membership --------------------------- */

r.get("/:id/my-membership", wrap(async (req, res) => {
  const room = await roomService.getById(req.params.id);
  const membership = await roomRepo.findMember(room.id, req.user!.id);
  if (!membership && req.user!.role !== "ADMIN") throw notFound("Room not found");
  res.json({ membership });
}));

/* --------------------------- full state snapshot ------------------------- */

r.get("/:id/full", wrap(async (req, res) => {
  await memberGuard(req, req.params.id);
  const snap = await roomRepo.fullSnapshot(req.params.id);
  if (!snap) throw notFound("Room not found");
  const settings = getSettings(snap);
  const membership = await roomRepo.findMember(req.params.id, req.user!.id);
  res.json({
    room: {
      id: snap.id,
      name: snap.name,
      description: snap.description,
      status: snap.status,
      accessMode: snap.accessMode,
      settings,
      publishedAt: snap.publishedAt,
      joinCode: req.user!.role === "ADMIN" ? snap.joinCode : undefined,
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
      : req.user!.role === "ADMIN"
        ? { role: "ADMIN", teamId: null }
        : null,
  });
}));

export default r;
