import type { Request } from "express";
import { roomRepo } from "../repositories/room.repo";
import { notFound } from "../utils/errors";

/**
 * Any room member (admins implicitly included). Non-members get a 404 so room
 * existence is never revealed to unauthorized users.
 */
export async function memberGuard(req: Request, roomId: string) {
  if (!req.user) throw notFound("Not found");
  if (req.user.role === "ADMIN") return;
  const membership = await roomRepo.findMember(roomId, req.user.id);
  if (!membership) throw notFound("Not found");
}

/**
 * Admin or the room's assigned moderator. Non-moderators (including plain
 * participants) get a 404 so moderation-only surfaces stay hidden.
 */
export async function moderatorGuard(req: Request, roomId: string) {
  if (!req.user) throw notFound("Not found");
  if (req.user.role === "ADMIN") return;
  if (req.user.role === "MODERATOR") {
    const membership = await roomRepo.findMember(roomId, req.user.id);
    if (membership?.role === "MODERATOR") return;
  }
  throw notFound("Not found");
}

/** True when the caller is an admin or the assigned moderator of the room. */
export async function isRoomModerator(req: Request, roomId: string): Promise<boolean> {
  if (!req.user) return false;
  if (req.user.role === "ADMIN") return true;
  if (req.user.role !== "MODERATOR") return false;
  const membership = await roomRepo.findMember(roomId, req.user.id);
  return membership?.role === "MODERATOR";
}
