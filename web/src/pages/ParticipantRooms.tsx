import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { Button, ErrorBox, LabelledInput, PageTitle, Skeleton, StatusBadge } from "../components/ui";

/** Participant home: list of joined rooms + join-by-code card. */
export default function ParticipantRooms() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const myRooms = useQuery({
    queryKey: ["my-rooms", user?.id],
    queryFn: async () => {
      // Single scoped request: the API returns only rooms this user belongs to,
      // each with its own membership — no per-room fan-out.
      const { rooms } = await api<{ rooms: any[] }>("/rooms/mine");
      return rooms
        .filter((room) => room.status !== "ARCHIVED")
        .map((room) => ({ room, membership: room.membership ?? { role: null, teamId: null } }));
    },
    refetchInterval: 30_000,
  });

  const join = async () => {
    setError(null);
    try {
      const { room } = await api<{ room: { id: string } }>("/rooms/join", { body: { code: code.trim().toUpperCase() } });
      navigate(`/room/${room.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not join");
    }
  };

  const rooms = myRooms.data ?? [];
  const live = rooms.filter(({ room }) => room.status === "ACTIVE");
  // what's happening in each active room right now (server caches the snapshot per room)
  const snaps = useQueries({
    queries: live.map(({ room }) => ({
      queryKey: ["snapshot", room.id],
      queryFn: () => api<{ teams: { teamId: string; name: string }[]; rounds: { teamId: string; status: string }[] }>(`/rooms/${room.id}/full`),
      refetchInterval: 20_000,
    })),
  });
  const nowIn = (roomId: string) => {
    const i = live.findIndex(({ room }) => room.id === roomId);
    const snap = i >= 0 ? snaps[i]?.data : undefined;
    const round = snap?.rounds.find((r) => ["PENDING", "OPEN", "PAUSED"].includes(r.status));
    if (!snap) return null;
    if (!round) return "Between rounds";
    const team = snap.teams.find((t) => t.teamId === round.teamId)?.name ?? "A team";
    return round.status === "OPEN" ? `${team} is presenting. Voting is open.` : round.status === "PAUSED" ? `${team} is presenting. Voting is paused.` : `${team} is up next.`;
  };
  const subtitle = myRooms.isLoading
    ? "Loading your rooms…"
    : rooms.length === 0
      ? "You're not in a room yet. Join one with the code from your organiser."
      : live.length === 0
        ? "None of your rooms is open for voting right now."
        : live.length === rooms.length
          ? rooms.length === 1
            ? "Your room is open for voting."
            : `All ${rooms.length} of your rooms are open for voting.`
          : `${live.length} of your ${rooms.length} rooms are open for voting.`;

  return (
    <>
      <PageTitle title="My rooms" subtitle={subtitle} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-label="Rooms" className={`min-w-0 ${rooms.length === 0 && !myRooms.isLoading ? "lg:order-2" : ""}`}>
          {myRooms.isLoading ? (
            <div className="overflow-hidden rounded-[10px] border border-line">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex h-[72px] items-center gap-4 border-b border-rule px-4 last:border-0">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="ml-auto h-9 w-24" />
                </div>
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <p className="rounded-[10px] border border-dashed border-ink-300 px-4 py-4 text-sm text-ink-700">
              Rooms you join, or are assigned to, show up here.
            </p>
          ) : (
            <ul className="overflow-hidden rounded-[10px] border border-line">
              {rooms.map(({ room, membership }) => {
                const enterable = room.status === "ACTIVE" || room.status === "CLOSED";
                return (
                  <li key={room.id} className="flex items-center gap-4 border-b border-rule px-4 py-3.5 last:border-0">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-950">{room.name}</p>
                      {nowIn(room.id) && <p className="mt-0.5 text-sm text-ink-900">{nowIn(room.id)}</p>}
                      <p className="num mt-0.5 text-[13px] text-ink-500">
                        {membership.role === "MODERATOR" ? "Moderator" : "Participant"}, {room._count?.roomTeams ?? 0} teams,{" "}
                        {room._count?.members ?? 0} members
                      </p>
                    </div>
                    {room.status !== "ACTIVE" && <StatusBadge status={room.status} />}
                    {enterable ? (
                      <Button
                        variant={nowIn(room.id)?.endsWith("Voting is open.") ? "primary" : "secondary"}
                        onClick={() => navigate(`/room/${room.id}`)}
                        data-testid="enter-room"
                      >
                        {room.status === "ACTIVE" ? "Enter" : "View"}
                      </Button>
                    ) : (
                      <span className="text-[13px] text-ink-500">Not open yet</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="join-heading">
          <h2 id="join-heading" className="mb-2 text-base font-semibold text-ink-950">
            Join a room
          </h2>
          <form
            className="space-y-3 rounded-[10px] border border-line p-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!code.trim()) return setError("Enter a join code to continue");
              join();
            }}
          >
            <LabelledInput
              label="Join code (6–8 characters)"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="7KQPW2M"
              maxLength={8}
              autoComplete="off"
              className="h-12 text-center font-mono text-xl tracking-[0.2em]" /* taste-skill-ignore: a join code is a key; Plex Mono's one job */
            />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" variant="secondary" className="w-full">
              Join room
            </Button>
            <p className="text-[13px] leading-relaxed text-ink-500">
              No code? Your organiser can add you to a room, and it appears in this list.
            </p>
          </form>
        </section>
      </div>
    </>
  );
}
