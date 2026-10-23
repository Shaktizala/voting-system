"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeCell = sanitizeCell;
exports.sanitizeText = sanitizeText;
/**
 * Neutralizes CSV/formula injection: values starting with = + - @ tab or CR
 * are prefixed with a single quote so spreadsheets treat them as text.
 */
const DANGEROUS_PREFIX = /^[=+\-@\t\r]/;
function sanitizeCell(value) {
    if (value === null || value === undefined)
        return "";
    let s = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "").trim();
    if (DANGEROUS_PREFIX.test(s))
        s = `'${s}`;
    return s;
}
/** Strip control characters from free-text inputs. */
function sanitizeText(value) {
    return String(value ?? "")
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\u200B-\u200D\uFEFF]/g, "")
        .trim();
}
