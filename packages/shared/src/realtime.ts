/** Realtime contract. Server emits; clients render. Server is source of truth. */
export const ROOM_CHANNEL = (roomId: string) => `room:${roomId}`;
/** Privileged channel: admins + the room's moderators (live vote counts). */
export const MOD_CHANNEL = (roomId: string) => `mod:${roomId}`;

export const socketServerEvents = [
  "room:state_changed",
  "team:presenting_changed",
  "voting:opened",
  "voting:paused",
  "voting:resumed",
  "voting:closed",
  "vote:submitted",
  "results:published",
] as const;
export type SocketServerEvent = (typeof socketServerEvents)[number];

export interface RTStatePayload {
  roomId: string;
  roomStatus: string;
  votingState: "not_started" | "open" | "paused" | "closed";
}
export interface RTPresentingPayload {
  roundId: string | null;
  teamId: string | null;
  teamName: string | null;
  status: "PENDING" | "OPEN" | "PAUSED" | "CLOSED";
}
export interface RTVoteCountPayload {
  roundId: string;
  votedCount: number;
  eligibleCount: number;
}
export interface RTResultsPublished {
  roomId: string;
  publishedAt: string;
}

export const snapshotRoute = "/api/rooms/:id/full";
