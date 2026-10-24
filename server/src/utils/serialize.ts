/**
 * API serializers. These strip secrets (password hashes) from records before
 * they are sent to a client. Repositories may still load full rows internally
 * for authentication; only responses pass through here.
 */

/** Removes `passwordHash` from a user record. */
export function publicUser<T extends { passwordHash?: unknown }>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...safe } = user;
  void _passwordHash;
  return safe;
}

/** Applies {@link publicUser} across a list of records. */
export function publicUsers<T extends { passwordHash?: unknown }>(users: T[]): Omit<T, "passwordHash">[] {
  return users.map((user) => publicUser(user));
}
