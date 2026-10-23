"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
exports.notFoundHandler = notFoundHandler;
const zod_1 = require("zod");
const errors_1 = require("../utils/errors");
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        return res.status(400).json({
            error: "Validation failed",
            details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
    }
    if (err instanceof errors_1.HttpError) {
        const body = { error: err.message, code: err.code };
        if (err.details)
            body.details = err.details;
        return res.status(err.status).json(body);
    }
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
}
function notFoundHandler(req, res) {
    res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}
