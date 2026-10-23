import crypto from "crypto";

/** Unguessable join code: 6-8 uppercase alphanumerics without ambiguous chars. */
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I,O,0,1
export function generateJoinCode(length = 7): string {
  let code = "";
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return code;
}

export function generateTemporaryPassword(length = 16): string {
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "!@#$%^&*-";
  const all = lower + upper + digits + symbols;
  const bytes = crypto.randomBytes(length);
  const chars = Array.from(bytes, (b) => all[b % all.length]);
  // guarantee one of each class
  chars[0] = upper[bytes[0] % upper.length];
  chars[1] = lower[bytes[1] % lower.length];
  chars[2] = digits[bytes[2] % digits.length];
  chars[3] = symbols[bytes[3] % symbols.length];
  return chars.join("");
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}
