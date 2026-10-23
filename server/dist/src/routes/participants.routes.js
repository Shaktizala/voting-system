"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const participant_service_1 = require("../services/participant.service");
const auth_1 = require("../middleware/auth");
const shared_1 = require("@voting/shared");
const helpers_1 = require("./helpers");
const errors_1 = require("../utils/errors");
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
        const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
        if (!ok)
            return cb((0, errors_1.badRequest)("Only CSV or XLSX files are accepted"));
        cb(null, true);
    },
});
const r = (0, express_1.Router)();
r.use(auth_1.requireAuth);
r.use((0, auth_1.requirePermission)("participants:read"));
r.get("/", (0, helpers_1.wrap)(async (_req, res) => {
    res.json({ participants: await participant_service_1.participantService.list() });
}));
r.post("/", (0, auth_1.requirePermission)("participants:write"), (0, helpers_1.wrap)(async (req, res) => {
    const input = (0, helpers_1.parseBody)(shared_1.participantCreateSchema, req.body);
    const { user, tempPassword } = await participant_service_1.participantService.create(input, req.user.id, req.ip ?? "");
    res.status(201).json({ participant: user, temporaryPassword: tempPassword });
}));
r.patch("/:id", (0, auth_1.requirePermission)("participants:write"), (0, helpers_1.wrap)(async (req, res) => {
    const patch = (0, helpers_1.parseBody)(shared_1.participantPatchSchema.partial(), req.body);
    const result = await participant_service_1.participantService.patch(req.params.id, patch, req.user.id, req.ip ?? "");
    res.json({ result });
}));
r.post("/:id/reset-password", (0, auth_1.requirePermission)("participants:credentials"), (0, helpers_1.wrap)(async (req, res) => {
    res.json(await participant_service_1.participantService.resetPassword(req.params.id, req.user.id, req.ip ?? ""));
}));
/* ------------------------------ bulk import ------------------------------ */
r.post("/import/preview", (0, auth_1.requirePermission)("participants:write"), upload.single("file"), (0, helpers_1.wrap)(async (req, res) => {
    if (!req.file)
        throw (0, errors_1.badRequest)("No file uploaded");
    res.json(await participant_service_1.participantService.previewImport(req.file.buffer, req.file.originalname));
}));
r.post("/import/commit", (0, auth_1.requirePermission)("participants:write"), upload.single("file"), (0, helpers_1.wrap)(async (req, res) => {
    if (!req.file)
        throw (0, errors_1.badRequest)("No file uploaded");
    const allOrNothing = req.body?.allOrNothing === "true" || req.body?.allOrNothing === true;
    res.json(await participant_service_1.participantService.commitImport(req.file.buffer, req.file.originalname, allOrNothing, req.user.id, req.ip ?? ""));
}));
r.get("/import/template", (0, auth_1.requirePermission)("participants:write"), (0, helpers_1.wrap)(async (req, res) => {
    const kind = (req.query.format === "xlsx" ? "xlsx" : "csv");
    const t = await participant_service_1.participantService.buildTemplate(kind);
    if (kind === "csv") {
        const lines = [t.header.join(",")].concat(t.rows.map((row) => row.map((v) => `"${v}"`).join(",")));
        return res.attachment(t.filename).type("text/csv").send(lines.join("\n"));
    }
    const buf = await t.asWorkbook.xlsx.writeBuffer();
    return res.attachment(t.filename).type(t.contentType).send(Buffer.from(buf));
}));
r.get("/credentials-sheet", (0, auth_1.requirePermission)("participants:credentials"), (0, helpers_1.wrap)(async (req, res) => {
    const raw = req.query.data;
    if (!raw)
        throw (0, errors_1.badRequest)("Missing credentials data");
    const credentials = JSON.parse(Buffer.from(raw, "base64").toString("utf8"));
    const kind = (req.query.format === "xlsx" ? "xlsx" : "csv");
    const sheet = await participant_service_1.participantService.buildCredentialsSheet(credentials, kind);
    res.attachment(sheet.filename).type(sheet.contentType).send(sheet.buffer);
}));
exports.default = r;
