"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tooMany = exports.conflict = exports.notFound = exports.forbidden = exports.unauthorized = exports.badRequest = exports.HttpError = void 0;
class HttpError extends Error {
    status;
    code;
    details;
    constructor(status, message, code, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
exports.HttpError = HttpError;
const badRequest = (msg, details) => new HttpError(400, msg, "BAD_REQUEST", details);
exports.badRequest = badRequest;
const unauthorized = (msg = "Authentication required") => new HttpError(401, msg, "UNAUTHORIZED");
exports.unauthorized = unauthorized;
const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, msg, "FORBIDDEN");
exports.forbidden = forbidden;
const notFound = (msg = "Not found") => new HttpError(404, msg, "NOT_FOUND");
exports.notFound = notFound;
const conflict = (msg, details) => new HttpError(409, msg, "CONFLICT");
exports.conflict = conflict;
const tooMany = (msg = "Too many attempts, try again later") => new HttpError(429, msg, "RATE_LIMITED");
exports.tooMany = tooMany;
