"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.participantService = void 0;
const user_repo_1 = require("../repositories/user.repo");
const team_repo_1 = require("../repositories/team.repo");
const session_repo_1 = require("../repositories/session.repo");
const audit_repo_1 = require("../repositories/audit.repo");
const auth_service_1 = require("./auth.service");
const errors_1 = require("../utils/errors");
const sanitize_1 = require("../utils/sanitize");
const config_1 = require("../config");
const papaparse_1 = require("papaparse");
const exceljs_1 = __importDefault(require("exceljs"));
const plainify_1 = require("../utils/plainify");
exports.participantService = {
    list() {
        return user_repo_1.userRepo.list();
    },
    async create(input, actorId, ip) {
        const username = (0, sanitize_1.sanitizeText)(input.username).toLowerCase();
        const email = (0, sanitize_1.sanitizeText)(input.email).toLowerCase();
        await assertUnique(username, email);
        const tempPassword = auth_service_1.authService.generateTemporaryPassword();
        const passwordHash = await auth_service_1.authService.hashPassword(tempPassword);
        const user = await user_repo_1.userRepo.create({
            name: (0, sanitize_1.sanitizeText)(input.name),
            username,
            email,
            role: input.role,
            teamId: input.teamId ?? null,
            passwordHash,
            mustChangePassword: true,
        });
        (0, audit_repo_1.audit)({
            actorId,
            action: "participant.create",
            entityType: "user",
            entityId: user.id,
            after: { username, email, role: input.role, teamId: input.teamId ?? null },
            ip,
        });
        return { user, tempPassword };
    },
    async patch(id, patch, actorId, ip) {
        const user = await user_repo_1.userRepo.findById(id);
        if (!user)
            throw (0, errors_1.notFound)("Participant not found");
        if (patch.softDelete === true) {
            await user_repo_1.userRepo.softDelete(id);
            await session_repo_1.sessionRepo.deleteAllForUser(id);
            (0, audit_repo_1.audit)({ actorId, action: "participant.soft_delete", entityType: "user", entityId: id, before: snapshot(user), ip });
            return { deleted: true };
        }
        const data = {};
        if (typeof patch.name === "string")
            data.name = (0, sanitize_1.sanitizeText)(patch.name);
        if (typeof patch.username === "string") {
            const username = (0, sanitize_1.sanitizeText)(patch.username).toLowerCase();
            if (username !== user.username) {
                const existing = await user_repo_1.userRepo.findByUsername(username);
                if (existing)
                    throw (0, errors_1.conflict)("Username already taken");
                data.username = username;
            }
        }
        if (typeof patch.email === "string") {
            const email = (0, sanitize_1.sanitizeText)(patch.email).toLowerCase();
            if (email !== user.email) {
                const existing = await user_repo_1.userRepo.findByEmail(email);
                if (existing)
                    throw (0, errors_1.conflict)("Email already in use");
                data.email = email;
            }
        }
        if (typeof patch.role === "string")
            data.role = patch.role;
        if (typeof patch.status === "string") {
            data.status = patch.status;
            if (patch.status === "INACTIVE") {
                // revoke access immediately
                await session_repo_1.sessionRepo.deleteAllForUser(id);
            }
        }
        if (patch.teamId !== undefined)
            data.teamId = patch.teamId;
        const updated = await user_repo_1.userRepo.update(id, data);
        (0, audit_repo_1.audit)({
            actorId,
            action: "participant.update",
            entityType: "user",
            entityId: id,
            before: snapshot(user),
            after: (0, plainify_1.plainify)(data),
            ip,
        });
        return updated;
    },
    /** Admin password reset → new one-time temporary password, forces change at next login. */
    async resetPassword(id, actorId, ip) {
        const user = await user_repo_1.userRepo.findById(id);
        if (!user)
            throw (0, errors_1.notFound)("Participant not found");
        const tempPassword = auth_service_1.authService.generateTemporaryPassword();
        const passwordHash = await auth_service_1.authService.hashPassword(tempPassword);
        await user_repo_1.userRepo.update(id, { passwordHash, mustChangePassword: true });
        await session_repo_1.sessionRepo.deleteAllForUser(id);
        (0, audit_repo_1.audit)({ actorId, action: "participant.reset_password", entityType: "user", entityId: id, ip });
        return { username: user.username, email: user.email, name: user.name, temporaryPassword: tempPassword };
    },
    /* --------------------------- bulk import ---------------------------- */
    async buildTemplate(kind) {
        const header = ["name", "email", "username", "team_name", "role"];
        const rows = [
            ["Ada Lovelace", "ada@example.org", "ada", "Team Alpha", "PARTICIPANT"],
            ["Grace Hopper", "grace@example.org", "grace_h", "Team Beta", "MODERATOR"],
        ];
        if (kind === "csv") {
            return { header, rows, contentType: "text/csv", filename: "participants_template.csv", asWorkbook: null };
        }
        const wb = new exceljs_1.default.Workbook();
        const ws = wb.addWorksheet("Participants");
        ws.addRow(header);
        rows.forEach((r) => ws.addRow(r));
        return { header, rows, contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", filename: "participants_template.xlsx", asWorkbook: wb };
    },
    /** Dry-run: parse, validate every row, return errors + a commit token. */
    async previewImport(buffer, filename) {
        const rows = await parseFile(buffer, filename);
        if (rows.length > config_1.env.IMPORT_MAX_ROWS) {
            throw (0, errors_1.badRequest)(`File exceeds the row limit (${config_1.env.IMPORT_MAX_ROWS} rows)`);
        }
        const teams = await team_repo_1.teamRepo.list();
        const teamByName = new Map(teams.map((t) => [t.name.toLowerCase(), t]));
        const seen = new Set();
        const report = [];
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const name = (0, sanitize_1.sanitizeText)(row.name);
            const email = (0, sanitize_1.sanitizeText)(row.email).toLowerCase();
            const username = (0, sanitize_1.sanitizeText)(row.username).toLowerCase();
            const teamName = (0, sanitize_1.sanitizeText)(row.team_name);
            const roleRaw = (0, sanitize_1.sanitizeText)(row.role || "PARTICIPANT").toUpperCase();
            const errors = [];
            if (!name)
                errors.push("Missing name");
            if (!email)
                errors.push("Missing email");
            else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                errors.push("Invalid email");
            if (!username)
                errors.push("Missing username");
            else if (!/^[a-z0-9._-]{3,60}$/.test(username))
                errors.push("Invalid username (a-z 0-9 . _ -, 3-60 chars)");
            if (roleRaw && !["ADMIN", "MODERATOR", "PARTICIPANT"].includes(roleRaw))
                errors.push(`Invalid role: ${roleRaw}`);
            let teamId = null;
            if (teamName) {
                const t = teamByName.get(teamName.toLowerCase());
                if (!t)
                    errors.push(`Unknown team: ${teamName}`);
                else
                    teamId = t.id;
            }
            const dupKey = username || email;
            if (dupKey && seen.has(dupKey))
                errors.push("Duplicate within file");
            if (dupKey)
                seen.add(dupKey);
            if (username) {
                const existing = await user_repo_1.userRepo.findByUsername(username);
                if (existing)
                    errors.push("Duplicate in database (username)");
            }
            if (email && !errors.some((e) => e.startsWith("Duplicate in database"))) {
                const existingEmail = await user_repo_1.userRepo.findByEmail(email);
                if (existingEmail)
                    errors.push("Duplicate in database (email)");
            }
            report.push({
                row: i + 2, // header is row 1
                name: name || undefined,
                valid: errors.length === 0,
                errors,
                ...(errors.length === 0
                    ? { resolved: { name, email, username, role: roleRaw || "PARTICIPANT", teamId } }
                    : {}),
            });
        }
        const validCount = report.filter((r) => r.valid).length;
        // For real multi-request commit support this stores the parsed file in a job
        // store; for a single-instance deployment we re-parse at commit time.
        return {
            rowCount: rows.length,
            validCount,
            errorCount: report.filter((r) => !r.valid).length,
            rows: report,
            note: "Commit re-validates; keep the same file to commit these exact rows.",
        };
    },
    async commitImport(buffer, filename, allOrNothing, actorId, ip) {
        const preview = await this.previewImport(buffer, filename);
        const validRows = preview.rows.filter((r) => r.valid).map((r) => r.resolved);
        if (preview.errorCount > 0 && allOrNothing) {
            throw (0, errors_1.badRequest)(`All-or-nothing: file has ${preview.errorCount} invalid rows`, preview.rows);
        }
        const created = [];
        for (const row of validRows) {
            // re-check uniqueness (concurrent writes since preview)
            const existing = await user_repo_1.userRepo.findByUsername(row.username);
            const existingEmail = await user_repo_1.userRepo.findByEmail(row.email);
            if (existing || existingEmail)
                continue;
            const tempPassword = auth_service_1.authService.generateTemporaryPassword();
            const passwordHash = await auth_service_1.authService.hashPassword(tempPassword);
            await user_repo_1.userRepo.create({
                name: row.name,
                username: row.username,
                email: row.email,
                role: row.role,
                teamId: row.teamId,
                passwordHash,
                mustChangePassword: true,
            });
            created.push({ username: row.username, email: row.email, name: row.name, temporaryPassword: tempPassword });
        }
        (0, audit_repo_1.audit)({
            actorId,
            action: "participant.bulk_import",
            entityType: "import",
            entityId: filename,
            after: { committed: created.length, skipped: preview.errorCount, mode: allOrNothing ? "all_or_nothing" : "valid_only" },
            ip,
        });
        return { committed: created.length, skipped: preview.errorCount, credentials: created };
    },
    /** Credentials sheet: one-time download of generated temp passwords. */
    async buildCredentialsSheet(credentials, kind) {
        const header = ["name", "username", "email", "temporary_password"];
        if (kind === "csv") {
            const lines = [header.join(",")].concat(credentials.map((c) => [c.name, c.username, c.email, c.temporaryPassword]
                .map((v) => `"${v.replace(/"/g, '""')}"`)
                .join(",")));
            return { contentType: "text/csv", filename: "credentials.csv", buffer: Buffer.from(lines.join("\n")) };
        }
        const wb = new exceljs_1.default.Workbook();
        const ws = wb.addWorksheet("Credentials");
        ws.addRow(header);
        credentials.forEach((c) => ws.addRow([c.name, c.username, c.email, c.temporaryPassword]));
        const out = await wb.xlsx.writeBuffer();
        return {
            contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            filename: "credentials.xlsx",
            buffer: Buffer.from(out),
        };
    },
};
function snapshot(user) {
    return { name: user.name, username: user.username, email: user.email, role: user.role, status: user.status, teamId: user.teamId };
}
async function assertUnique(username, email) {
    if (await user_repo_1.userRepo.findByUsername(username))
        throw (0, errors_1.conflict)("Username already taken");
    if (await user_repo_1.userRepo.findByEmail(email))
        throw (0, errors_1.conflict)("Email already in use");
}
async function parseFile(buffer, filename) {
    const isXlsx = filename.toLowerCase().endsWith(".xlsx") || filename.toLowerCase().endsWith(".xls");
    if (!isXlsx) {
        const csv = (0, papaparse_1.parse)(buffer.toString("utf8"), {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toLowerCase(),
        });
        if (csv.errors.length)
            throw (0, errors_1.badRequest)(`CSV parse error: ${csv.errors[0].message}`);
        return csv.data;
    }
    const wb = new exceljs_1.default.Workbook();
    const parsed = await wb.xlsx.load(buffer);
    const ws = parsed.worksheets[0];
    if (!ws)
        throw (0, errors_1.badRequest)("Empty spreadsheet");
    const rows = [];
    const headers = [];
    ws.getRow(1).eachCell((cell, col) => {
        headers[col] = (0, sanitize_1.sanitizeText)(cell.value).toLowerCase();
    });
    for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const obj = {};
        let hasContent = false;
        headers.forEach((h, col) => {
            if (!h)
                return;
            const v = row.getCell(col);
            const text = (0, sanitize_1.sanitizeText)(v.text);
            if (text)
                hasContent = true;
            obj[h] = text;
        });
        if (hasContent)
            rows.push(obj);
    }
    return rows;
}
