import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export const teamRepo = {
  list() {
    return prisma.team.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { _count: { select: { members: { where: { deletedAt: null, status: "ACTIVE" } } } } },
    });
  },
  /** Lightweight lookup used by bulk import duplicate detection. */
  listNames() {
    return prisma.team.findMany({
      select: { id: true, name: true, deletedAt: true },
      orderBy: { name: "asc" },
    });
  },
  findById(id: string) {
    return prisma.team.findFirst({ where: { id, deletedAt: null } });
  },
  findByName(name: string) {
    return prisma.team.findFirst({ where: { name, deletedAt: null } });
  },
  create(data: Prisma.TeamUncheckedCreateInput) {
    return prisma.team.create({ data });
  },
  update(id: string, data: Prisma.TeamUncheckedUpdateInput) {
    return prisma.team.update({ where: { id }, data });
  },
  softDelete(id: string) {
    return prisma.team.update({ where: { id }, data: { deletedAt: new Date() } });
  },
  countMembers(id: string) {
    return prisma.user.count({ where: { teamId: id, deletedAt: null, status: "ACTIVE" } });
  },
};
