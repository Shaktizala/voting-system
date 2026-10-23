/** Realtime contract. Server emits; clients render. Server is source of truth. */
export const ROOM_CHANNEL = (roomId) => `room:${roomId}`;
export const socketServerEvents = [
    "room:state_changed",
    "team:presenting_changed",
    "voting:opened",
    "voting:paused",
    "voting:resumed",
    "voting:closed",
    "vote:submitted",
    "results:published",
];
export const snapshotRoute = "/api/rooms/:id/full";
