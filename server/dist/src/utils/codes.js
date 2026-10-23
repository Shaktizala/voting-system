"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateJoinCode = generateJoinCode;
exports.generateTemporaryPassword = generateTemporaryPassword;
exports.sha256 = sha256;
exports.randomToken = randomToken;
const crypto_1 = __importDefault(require("crypto"));
/** Unguessable join code: 6-8 uppercase alphanumerics without ambiguous chars. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
function generateJoinCode(length = 7) {
    let code = "";
    const bytes = crypto_1.default.randomBytes(length);
    for (let i = 0; i < length; i++)
        code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
    return code;
}
function generateTemporaryPassword(length = 16) {
    const lower = "abcdefghijkmnopqrstuvwxyz";
    const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const digits = "23456789";
    const symbols = "!@#$%^&*-";
    const all = lower + upper + digits + symbols;
    const bytes = crypto_1.default.randomBytes(length);
    const chars = Array.from(bytes, (b) => all[b % all.length]);
    // guarantee one of each class
    chars[0] = upper[bytes[0] % upper.length];
    chars[1] = lower[bytes[1] % lower.length];
    chars[2] = digits[bytes[2] % digits.length];
    chars[3] = symbols[bytes[3] % symbols.length];
    return chars.join("");
}
function sha256(value) {
    return crypto_1.default.createHash("sha256").update(value).digest("hex");
}
function randomToken() {
    return crypto_1.default.randomBytes(32).toString("base64url");
}
