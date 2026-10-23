"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wrap = void 0;
exports.parseBody = parseBody;
exports.parseQuery = parseQuery;
exports.router = router;
const express_1 = require("express");
const errors_1 = require("../utils/errors");
/** Wraps async handlers so rejections reach the error middleware. */
const wrap = (fn) => (req, res, next) => {
    fn(req, res, next).catch(next);
};
exports.wrap = wrap;
/** Parse & validate a request field with a zod schema. */
function parseBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new errors_1.HttpError(400, "Validation failed", "VALIDATION", result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    return result.data;
}
function parseQuery(schema, query) {
    const result = schema.safeParse(query);
    if (!result.success) {
        throw new errors_1.HttpError(400, "Invalid query", "VALIDATION", result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    return result.data;
}
function router() {
    return (0, express_1.Router)({ mergeParams: true });
}
