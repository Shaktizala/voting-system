import { prisma } from "../db";

export const sessionRepo = {
  create(userId: string, tokenHash: string, expiresAt: Date, ip?: string, userAgent?: string) {
    return prisma.session.create({ data: { userId, tokenHash, expiresAt, ip, userAgent } });
  },
  findValid(tokenHash: string) {
    return prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
  },
  extend(id: string, expiresAt: Date) {
    return prisma.session.update({ where: { id }, data: { expiresAt } });
  },
  delete(tokenHash: string) {
    return prisma.session.deleteMany({ where: { tokenHash } });
  },
  deleteAllForUser(userId: string, exceptTokenHash?: string) {
    return prisma.session.deleteMany({
      where: { userId, ...(exceptTokenHash ? { tokenHash: { not: exceptTokenHash } } : {}) },
    });
  },
  deleteExpired() {
    return prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  },
};
