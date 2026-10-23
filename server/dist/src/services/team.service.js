"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.teamService = void 0;
const team_repo_1 = require("../repositories/team.repo");
const audit_repo_1 = require("../repositories/audit.repo");
const errors_1 = require("../utils/errors");
const sanitize_1 = require("../utils/sanitize");
const plainify_1 = require("../utils/plainify");
exports.teamService = {
    list() {
        return team_repo_1.teamRepo.list();
    },
    async create(input, actorId, ip) {
        const name = (0, sanitize_1.sanitizeText)(input.name);
        if (await team_repo_1.teamRepo.findByName(name))
            throw (0, errors_1.conflict)("A team with this name already exists");
        const team = await team_repo_1.teamRepo.create({ ...input, name });
        (0, audit_repo_1.audit)({ actorId, action: "team.create", entityType: "team", entityId: team.id, after: { name }, ip });
        return team;
    },
    async update(id, patch, actorId, ip) {
        const team = await team_repo_1.teamRepo.findById(id);
        if (!team)
            throw (0, errors_1.notFound)("Team not found");
        if (patch.name && typeof patch.name === "string") {
            const name = (0, sanitize_1.sanitizeText)(patch.name);
            const existing = await team_repo_1.teamRepo.findByName(name);
            if (existing && existing.id !== id)
                throw (0, errors_1.conflict)("A team with this name already exists");
            patch.name = name;
        }
        const updated = await team_repo_1.teamRepo.update(id, patch);
        (0, audit_repo_1.audit)({
            actorId,
            action: "team.update",
            entityType: "team",
            entityId: id,
            before: { name: team.name },
            after: (0, plainify_1.plainify)(patch),
            ip,
        });
        return updated;
    },
    async softDelete(id, actorId, ip) {
        const team = await team_repo_1.teamRepo.findById(id);
        if (!team)
            throw (0, errors_1.notFound)("Team not found");
        await team_repo_1.teamRepo.softDelete(id);
        (0, audit_repo_1.audit)({ actorId, action: "team.soft_delete", entityType: "team", entityId: id, before: { name: team.name }, ip });
        return { deleted: true };
    },
};
