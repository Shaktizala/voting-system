"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditRepo = void 0;
exports.audit = audit;
const db_1 = require("../db");
exports.auditRepo = {
    create(data) {
        return db_1.prisma.auditLog.create({ data });
    },
    list({ take = 200, cursor }) {
        return db_1.prisma.auditLog.findMany({
            take,
            orderBy: { createdAt: "desc" },
            ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            include: { actor: { select: { name: true, username: true, role: true } } },
        });
    },
};
/** Fire-and-forget audit logging — never blocks or fails the main flow. */
function audit(entry) {
    exports.auditRepo.create(entry).catch((e) => console.error("audit failed", e));
}
