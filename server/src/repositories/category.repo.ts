import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export const categoryRepo = {
  listForRoom(roomId: string, includeInactive = false) {
    return prisma.category.findMany({
      where: { roomId, ...(includeInactive ? {} : { active: true }) },
      orderBy: { displayOrder: "asc" },
    });
  },
  findById(id: string) {
    return prisma.category.findUnique({ where: { id } });
  },
  findCurrentVersion(roomId: string) {
    return prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
  },
  createVersion(data: Prisma.RoomConfigVersionUncheckedCreateInput) {
    return prisma.roomConfigVersion.create({ data });
  },
  setCurrentVersion(roomId: string, versionId: string) {
    return prisma.$transaction([
      prisma.roomConfigVersion.updateMany({ where: { roomId }, data: { isCurrent: false } }),
      prisma.roomConfigVersion.update({ where: { id: versionId }, data: { isCurrent: true } }),
    ]);
  },
  countVersions(roomId: string) {
    return prisma.roomConfigVersion.count({ where: { roomId } });
  },
  create(data: Prisma.CategoryUncheckedCreateInput) {
    return prisma.category.create({ data });
  },
  update(id: string, data: Prisma.CategoryUncheckedUpdateInput) {
    return prisma.category.update({ where: { id }, data });
  },
  /** Soft-deactivate (structural removal) or hard delete if never voted */
  deactivate(id: string) {
    return prisma.category.update({ where: { id }, data: { active: false } });
  },
  deleteIfUnused(id: string) {
    return prisma.category.delete({ where: { id } });
  },
  countScoresByCategory(categoryId: string) {
    return prisma.voteScore.count({ where: { categoryId } });
  },
  countVotesInRoom(roomId: string) {
    return prisma.vote.count({ where: { roomId } });
  },
  reorder(ids: string[], roomId: string) {
    return prisma.$transaction(
      ids.map((id, i) =>
        prisma.category.updateMany({ where: { id, roomId }, data: { displayOrder: i } })
      )
    );
  },
  /** Deep-copy every active category into a new config version. */
  cloneForVersion(roomId: string, fromVersionId: string, toVersionId: string) {
    return prisma.$transaction(async (tx) => {
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
  cloneToRoom(fromRoomId: string) {
    return prisma.category.findMany({ where: { roomId: fromRoomId, active: true } });
  },
};
