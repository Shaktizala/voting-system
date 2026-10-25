import { prisma } from "../db";
import { categoryRepo } from "../repositories/category.repo";
import { roomRepo } from "../repositories/room.repo";
import { audit } from "../repositories/audit.repo";
import { conflict, notFound, badRequest } from "../utils/errors";
import { sanitizeText } from "../utils/sanitize";
import { plainify } from "../utils/plainify";
import type { Prisma } from "@prisma/client";

interface CategoryInput {
  name: string;
  description?: string;
  minScore: number;
  maxScore: number;
  step: number;
  weight: number;
  isRequired: boolean;
}

type CategoryUpdateInput = Partial<CategoryInput> & { active?: boolean };

export const categoryService = {
  async listForRoom(roomId: string, includeInactive = false) {
    await assertRoom(roomId);
    return categoryRepo.listForRoom(roomId, includeInactive);
  },

  /** Structural changes are allowed while no vote exists in the room. */
  async create(roomId: string, input: CategoryInput, actorId: string, ip?: string) {
    await assertRoom(roomId);
    await assertUnlocked(roomId);
    if ((await categoryRepo.countVotesInRoom(roomId)) > 0) {
      throw conflict("Categories are locked once voting has started. Start a new configuration version to add categories.");
    }
    const version = await categoryRepo.findCurrentVersion(roomId);
    if (!version) throw notFound("Room config version missing");
    validateRange(input);
    const count = await prisma.category.count({ where: { roomId, active: true } });
    const category = await categoryRepo.create({ ...input, name: sanitizeText(input.name), roomId, configVersionId: version.id, displayOrder: count });
    audit({ actorId, action: "category.create", entityType: "room", entityId: roomId, after: { name: category.name }, ip });
    return category;
  },

  async update(categoryId: string, patch: CategoryUpdateInput, actorId: string, ip?: string) {
    const category = (await categoryRepo.findById(categoryId)) ?? null;
    if (!category || !category.active) throw notFound("Category not found");

    const isStructural =
      patch.minScore !== undefined ||
      patch.maxScore !== undefined ||
      patch.step !== undefined ||
      patch.weight !== undefined ||
      patch.isRequired !== undefined ||
      patch.active === false; // removing a category from the ballot changes every later vote

    if (isStructural) {
      const hasVotes = (await categoryRepo.countVotesInRoom(category.roomId)) > 0;
      if (hasVotes) throw conflict("Categories are locked once voting has started. Start a new configuration version instead.");
      await assertUnlocked(category.roomId);
      validateRange({
        minScore: (patch.minScore as number | undefined) ?? category.minScore,
        maxScore: (patch.maxScore as number | undefined) ?? category.maxScore,
        step: (patch.step as number | undefined) ?? category.step,
        weight: Number((patch.weight as number | undefined) ?? category.weight),
        isRequired: (patch.isRequired as boolean | undefined) ?? category.isRequired,
      });
    }
    if (typeof patch.name === "string") patch.name = sanitizeText(patch.name);
    const updated = await categoryRepo.update(categoryId, patch as Prisma.CategoryUncheckedUpdateInput);
    audit({
      actorId,
      action: "category.update",
      entityType: "room",
      entityId: category.roomId,
      before: { name: category.name },
      after: plainify(patch),
      ip,
    });
    return updated;
  },

  async remove(categoryId: string, actorId: string, ip?: string) {
    const category = await categoryRepo.findById(categoryId);
    if (!category || !category.active) throw notFound("Category not found");
    await assertUnlocked(category.roomId);
    const used = (await categoryRepo.countScoresByCategory(categoryId)) > 0;
    if (used) throw conflict("This category has votes and cannot be removed in the current configuration version.");
    await categoryRepo.deleteIfUnused(categoryId);
    audit({ actorId, action: "category.remove", entityType: "room", entityId: category.roomId, before: { name: category.name }, ip });
    return { ok: true };
  },

  async reorder(roomId: string, order: string[], actorId: string, ip?: string) {
    await assertRoom(roomId);
    await assertUnlocked(roomId);
    await categoryRepo.reorder(order, roomId);
    audit({ actorId, action: "category.reorder", entityType: "room", entityId: roomId, ip });
    return categoryRepo.listForRoom(roomId);
  },

  /** Start a new configuration version: deep-copies current active categories. */
  async newVersion(roomId: string, reason: string | undefined, actorId: string, ip?: string) {
    const room = await assertRoom(roomId);
    const hasVotes = (await categoryRepo.countVotesInRoom(roomId)) > 0;
    if (!hasVotes) throw conflict("Configuration is not locked yet — edit categories directly.");
    const current = await categoryRepo.findCurrentVersion(roomId);
    if (!current) throw notFound("Room config version missing");
    const count = await categoryRepo.countVersions(roomId);
    const version = await categoryRepo.createVersion({ roomId, version: count + 1, isCurrent: false, reason: reason ?? null });
    await categoryRepo.cloneForVersion(roomId, current.id, version.id);
    await categoryRepo.setCurrentVersion(roomId, version.id);
    audit({
      actorId,
      action: "room.config_new_version",
      entityType: "room",
      entityId: roomId,
      after: { version: count + 1, reason, room: room.name },
      ip,
    });
    return { version: count + 1, versionId: version.id, categories: await categoryRepo.listForRoom(roomId) };
  },
};

function validateRange(c: { minScore: number; maxScore: number; step: number; weight?: number; isRequired?: boolean }) {
  if (c.maxScore <= c.minScore) throw badRequest("maxScore must be greater than minScore");
  const span = c.maxScore - c.minScore;
  if (span % c.step !== 0) throw badRequest("Score range must be divisible by step");
  if (c.weight !== undefined && (c.weight < 0 || c.weight > 1000)) throw badRequest("Weight must be between 0 and 1000");
}

async function assertRoom(roomId: string) {
  const room = await roomRepo.findById(roomId);
  if (!room) throw notFound("Room not found");
  return room;
}

async function assertUnlocked(roomId: string) {
  const room = await assertRoom(roomId);
  if (room.status === "ARCHIVED" || room.status === "CLOSED") throw conflict("This room is closed and can no longer be configured");
}
