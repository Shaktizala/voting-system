import type { Server } from "socket.io";
import { snapshotCache } from "../utils/snapshotCache";
import { MOD_CHANNEL, ROOM_CHANNEL, type RTResultsPublished, type RTPresentingPayload, type RTStatePayload, type RTVoteCountPayload } from "@voting/shared";

let io: Server | null = null;

export function setIo(server: Server) {
  io = server;
}

export function getIo(): Server | null {
  return io;
}

export function emitToRoom<T>(roomId: string, event: string, payload: T) {
  snapshotCache.invalidate(roomId);
  if (!io) return;
  io.to(ROOM_CHANNEL(roomId)).emit(event, payload);
}

export const rtEvents = {
  stateChanged(roomId: string, payload: RTStatePayload) {
    emitToRoom(roomId, "room:state_changed", payload);
  },
  presentingChanged(roomId: string, payload: RTPresentingPayload) {
    emitToRoom(roomId, "team:presenting_changed", payload);
    emitToRoom(roomId, "room:state_changed", { roomId } as RTStatePayload);
  },
  votingOpened(roomId: string, roundId: string) {
    emitToRoom(roomId, "voting:opened", { roundId });
  },
  votingPaused(roomId: string, roundId: string) {
    emitToRoom(roomId, "voting:paused", { roundId });
  },
  votingResumed(roomId: string, roundId: string) {
    emitToRoom(roomId, "voting:resumed", { roundId });
  },
  votingClosed(roomId: string, roundId: string) {
    emitToRoom(roomId, "voting:closed", { roundId });
  },
  voteSubmitted(roomId: string, payload: RTVoteCountPayload) {
    // privileged channel: admins + this room's moderators (see realtime/index.ts)
    io?.to(MOD_CHANNEL(roomId)).emit("vote:submitted", payload);
  },
  resultsPublished(roomId: string, payload: RTResultsPublished) {
    emitToRoom(roomId, "results:published", payload);
  },
};
