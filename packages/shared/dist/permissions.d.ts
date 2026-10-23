export declare const ROLES: readonly ["ADMIN", "MODERATOR", "PARTICIPANT"];
export type Role = (typeof ROLES)[number];
/** Every capability in the system. Roles map to these — adding a role or
 *  changing capabilities never requires touching route code. */
export declare const PERMISSIONS: readonly ["participants:read", "participants:write", "participants:credentials", "teams:read", "teams:write", "rooms:read", "rooms:write", "rooms:control", "rooms:moderate", "rounds:control", "votes:submit", "progress:read", "results:read", "results:publish", "results:export", "audit:read", "categories:write", "config:write"];
export type Permission = (typeof PERMISSIONS)[number];
export declare const ROLE_PERMISSIONS: Record<Role, readonly Permission[]>;
export declare function roleHas(role: Role, permission: Permission): boolean;
/** Capabilities that are additionally gated by room assignment (moderator). */
export declare function canModerateRoom(role: Role, isRoomModerator: boolean): boolean;
