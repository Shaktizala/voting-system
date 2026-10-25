import argon2 from "argon2";

/**
 * argon2id at OWASP's recommended baseline (19 MiB, t=2, p=1).
 * The library default (64 MiB, t=3, p=4) costs ~4× the CPU/RAM per login,
 * which queues a room full of people signing in at once for tens of seconds.
 * Hashes made with other parameters keep verifying and are upgraded on login.
 */
export const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string) {
  return argon2.hash(password, HASH_OPTIONS);
}

export function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password).catch(() => false);
}

export function needsRehash(hash: string) {
  try {
    return argon2.needsRehash(hash, HASH_OPTIONS);
  } catch {
    return false;
  }
}
