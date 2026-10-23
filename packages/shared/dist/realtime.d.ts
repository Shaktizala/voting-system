/** Realtime contract. Server emits; clients render. Server is source of truth. */
export declare const ROOM_CHANNEL: (roomId: string) => string;
export declare const socketServerEvents: readonly ["room:state_changed", "team:presenting_changed", "voting:opened", "voting:paused", "voting:resumed", "voting:closed", "vote:submitted", "results:published"];
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
export declare const snapshotRoute = "/api/rooms/:id/full";
