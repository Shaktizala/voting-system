import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export const userRepo = {
  findById(id: string) {
    return prisma.user.findFirst({ where: { id, deletedAt: null } });
  },
  findByIdentifier(identifier: string) {
    const ident = identifier.trim().toLowerCase();
    return prisma.user.findFirst({
      where: { deletedAt: null, OR: [{ email: ident }, { username: ident }] },
    });
  },
  findByUsername(username: string) {
    return prisma.user.findFirst({ where: { username, deletedAt: null } });
  },
  findByEmail(email: string) {
    return prisma.user.findFirst({ where: { email, deletedAt: null } });
  },
  list() {
    return prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      include: { team: { select: { id: true, name: true } } },
    });
  },
  create(data: Prisma.UserUncheckedCreateInput) {
    return prisma.user.create({
      data,
      include: { team: { select: { id: true, name: true } } },
    });
  },
  createMany(users: Prisma.UserUncheckedCreateInput[]) {
    return prisma.user.createMany({ data: users });
  },
  update(id: string, data: Prisma.UserUncheckedUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
      include: { team: { select: { id: true, name: true } } },
    });
  },
  softDelete(id: string) {
    return prisma.user.update({ where: { id }, data: { deletedAt: new Date(), status: "INACTIVE" } });
  },
  countByTeam(teamId: string) {
    return prisma.user.count({ where: { teamId, deletedAt: null, status: "ACTIVE" } });
  },
};
