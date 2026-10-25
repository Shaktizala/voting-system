import { Router } from "express";
import multer from "multer";
import { participantService } from "../services/participant.service";
import { requireAuth, requirePermission } from "../middleware/auth";
import { participantCreateSchema, participantPatchSchema } from "@voting/shared";
import { z } from "zod";
import { wrap, parseBody } from "./helpers";
import { badRequest } from "../utils/errors";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ok = /\.(csv|xlsx|xls)$/i.test(file.originalname);
    if (!ok) return cb(badRequest("Only CSV or XLSX files are accepted"));
    cb(null, true);
  },
});

const r = Router();

const credentialsSheetSchema = z.object({
  format: z.enum(["csv", "xlsx"]).default("csv"),
  credentials: z
    .array(z.object({ name: z.string(), username: z.string(), email: z.string(), temporaryPassword: z.string() }))
    .min(1)
    .max(10_000),
});

r.use(requireAuth);
r.use(requirePermission("participants:read"));

r.get("/", wrap(async (_req, res) => {
  res.json({ participants: await participantService.list() });
}));

r.post("/", requirePermission("participants:write"), wrap(async (req, res) => {
  const input = parseBody(participantCreateSchema, req.body);
  const { user, tempPassword } = await participantService.create(input, req.user!.id, req.ip ?? "");
  res.status(201).json({ participant: user, temporaryPassword: tempPassword });
}));

r.patch("/:id", requirePermission("participants:write"), wrap(async (req, res) => {
  const patch = parseBody(participantPatchSchema.partial(), req.body);
  const result = await participantService.patch(req.params.id, patch, req.user!.id, req.ip ?? "");
  res.json({ result });
}));

r.post("/:id/reset-password", requirePermission("participants:credentials"), wrap(async (req, res) => {
  res.json(await participantService.resetPassword(req.params.id, req.user!.id, req.ip ?? ""));
}));

/* ------------------------------ bulk import ------------------------------ */

r.post("/import/preview", requirePermission("participants:write"), upload.single("file"), wrap(async (req, res) => {
  if (!req.file) throw badRequest("No file uploaded");
  res.json(await participantService.previewImport(req.file.buffer, req.file.originalname));
}));

r.post("/import/commit", requirePermission("participants:write"), upload.single("file"), wrap(async (req, res) => {
  if (!req.file) throw badRequest("No file uploaded");
  const allOrNothing = req.body?.allOrNothing === "true" || req.body?.allOrNothing === true;
  res.json(await participantService.commitImport(req.file.buffer, req.file.originalname, allOrNothing, req.user!.id, req.ip ?? ""));
}));

r.get("/import/template", requirePermission("participants:write"), wrap(async (req, res) => {
  const kind = (req.query.format === "xlsx" ? "xlsx" : "csv") as "csv" | "xlsx";
  const t = await participantService.buildTemplate(kind);
  if (kind === "csv") {
    const lines = [t.header.join(",")].concat(t.rows.map((row) => row.map((v) => `"${v}"`).join(",")));
    return res.attachment(t.filename).type("text/csv").send(lines.join("\n"));
  }
  const buf = await t.asWorkbook!.xlsx.writeBuffer();
  return res.attachment(t.filename).type(t.contentType).send(Buffer.from(buf as ArrayBuffer));
}));

/** POST, not GET: temporary passwords must never travel in a URL (logs, history, proxies). */
r.post("/credentials-sheet", requirePermission("participants:credentials"), wrap(async (req, res) => {
  const { credentials, format } = parseBody(credentialsSheetSchema, req.body);
  const kind = format;
  const sheet = await participantService.buildCredentialsSheet(credentials, kind);
  res.attachment(sheet.filename).type(sheet.contentType).send(sheet.buffer);
}));

export default r;
