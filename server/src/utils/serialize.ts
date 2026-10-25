/**
 * API serializers. These strip secrets (password hashes) from records before
 * they are sent to a client. Repositories may still load full rows internally
 * for authentication; only responses pass through here.
 */

/**
 * Removes `passwordHash` from a user record. The Prisma client already omits it
 * from every query (db.ts); this stays as a second guard on response paths, so
 * it accepts records with or without the field.
 */
export function publicUser<T extends object>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user as T & { passwordHash?: unknown };
  void _passwordHash;
  return safe;
}

/** Applies {@link publicUser} across a list of records. */
export function publicUsers<T extends object>(users: T[]): Omit<T, "passwordHash">[] {
  return users.map((user) => publicUser(user));
}
