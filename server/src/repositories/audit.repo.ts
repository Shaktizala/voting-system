import { prisma } from "../db";
import type { Prisma } from "@prisma/client";

export const auditRepo = {
  create(data: Prisma.AuditLogUncheckedCreateInput) {
    return prisma.auditLog.create({ data });
  },
  list({ take = 200, cursor }: { take?: number; cursor?: string }) {
    return prisma.auditLog.findMany({
      take,
      orderBy: { createdAt: "desc" },
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { actor: { select: { name: true, username: true, role: true } } },
    });
  },
};

/** Fire-and-forget audit logging — never blocks or fails the main flow. */
export function audit(
  entry: Prisma.AuditLogUncheckedCreateInput
): void {
  auditRepo.create(entry).catch((e) => console.error("audit failed", e));
}
