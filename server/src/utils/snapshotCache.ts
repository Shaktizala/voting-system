import { roomRepo } from "../repositories/room.repo";

type Snapshot = NonNullable<Awaited<ReturnType<typeof roomRepo.fullSnapshot>>>;

/**
 * Short-lived, per-room cache of the live-room snapshot.
 *
 * Every open room tab polls `/rooms/:id/full`, and every realtime event makes
 * all of them refetch at once. The snapshot is identical for all viewers of a
 * room, so concurrent requests share one in-flight load and reuse it for up to
 * TTL_MS. Any realtime emit for the room invalidates it immediately, so state
 * changes are never served stale. Per-instance by design (TTL keeps instances
 * consistent within a second).
 */
const TTL_MS = 1000;
const entries = new Map<string, { at: number; value: Promise<Snapshot | null> }>();

export const snapshotCache = {
  get(roomId: string): Promise<Snapshot | null> {
    const hit = entries.get(roomId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
    const value = roomRepo.fullSnapshot(roomId);
    entries.set(roomId, { at: Date.now(), value });
    value.catch(() => entries.delete(roomId));
    return value;
  },
  invalidate(roomId: string) {
    entries.delete(roomId);
  },
};
