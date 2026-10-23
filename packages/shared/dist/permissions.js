export const ROLES = ["ADMIN", "MODERATOR", "PARTICIPANT"];
/** Every capability in the system. Roles map to these — adding a role or
 *  changing capabilities never requires touching route code. */
export const PERMISSIONS = [
    "participants:read",
    "participants:write",
    "participants:credentials",
    "teams:read",
    "teams:write",
    "rooms:read",
    "rooms:write",
    "rooms:control", // lifecycle & presenting controls
    "rooms:moderate", // assigned-room moderation (subset of rooms:control)
    "rounds:control",
    "votes:submit",
    "progress:read",
    "results:read",
    "results:publish",
    "results:export",
    "audit:read",
    "categories:write",
    "config:write",
];
export const ROLE_PERMISSIONS = {
    ADMIN: [
        "participants:read", "participants:write", "participants:credentials",
        "teams:read", "teams:write",
        "rooms:read", "rooms:write", "rooms:control", "rooms:moderate",
        "rounds:control", "progress:read", "results:read", "results:publish",
        "results:export", "audit:read", "categories:write", "config:write",
    ],
    MODERATOR: [
        "rooms:read", "rooms:moderate", "rounds:control", "progress:read",
        "results:read",
    ],
    PARTICIPANT: ["rooms:read", "votes:submit", "results:read"],
};
export function roleHas(role, permission) {
    return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
/** Capabilities that are additionally gated by room assignment (moderator). */
export function canModerateRoom(role, isRoomModerator) {
    if (role === "ADMIN")
        return true;
    return role === "MODERATOR" && isRoomModerator;
}
