import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import {
  Button,
  Card,
  ErrorBox,
  LabelledInput,
  SectionHeading,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import {
  IconArrowRight,
  IconKey,
  IconRooms,
  IconSparkles,
  IconTeams,
  IconUsers,
} from "../components/icons";

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
  const activeRooms = rooms.filter(({ room }) => room.status === "ACTIVE").length;
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      {/* welcome */}
      <section className="relative mb-6 overflow-hidden rounded-3xl bg-ink-950 p-6 text-white shadow-lift sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-brand-600/35 blur-3xl" />
          <div className="absolute -bottom-28 left-1/4 h-64 w-64 rounded-full bg-jade-500/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              <IconSparkles size={11} className="text-jade-300" />
              Your evaluation hub
            </span>
            <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-[2rem]">
              Welcome, {user?.name}
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-white/45">
              Join a room with your code, follow the live presentation, and score each category when
              voting opens.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-center">
              <span className="block font-display text-xl font-semibold">{rooms.length}</span>
              <span className="block text-[9px] uppercase tracking-[0.14em] text-white/40">Rooms joined</span>
            </span>
            <span className="rounded-xl border border-white/10 bg-white/[0.06] px-3.5 py-2.5 text-center">
              <span className="block font-display text-xl font-semibold">{activeRooms}</span>
              <span className="block text-[9px] uppercase tracking-[0.14em] text-white/40">Active now</span>
            </span>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.5fr)]">
        {/* join card */}
        <Card className="xl:sticky xl:top-6">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
              <IconKey size={19} />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">Join a room</h2>
              <p className="mt-0.5 text-xs text-ink-500">Enter the code your organizer gave you.</p>
            </div>
          </div>
          <form
            className="mt-5 space-y-3"
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
              className="text-center font-mono text-xl font-semibold tracking-[0.2em] sm:text-2xl"
            />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button type="submit" className="w-full py-3">
              <IconArrowRight size={15} />
              Join room
            </Button>
          </form>
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-ink-50/50 px-3.5 py-3">
            <IconUsers size={14} className="mt-0.5 shrink-0 text-ink-400" />
            <p className="text-[11px] leading-relaxed text-ink-500">
              No code? Ask your organizer to assign you to a room — it will appear here automatically.
            </p>
          </div>
        </Card>

        {/* my rooms */}
        <section>
          <SectionHeading
            title="My rooms"
            count={rooms.length}
            description={activeRooms > 0 ? `${activeRooms} room${activeRooms === 1 ? "" : "s"} open for evaluation.` : "Rooms you belong to appear here."}
            action={
              firstName ? (
                <span className="hidden items-center gap-2 rounded-full bg-white px-3 py-1.5 text-[11px] font-medium text-ink-500 ring-1 ring-line sm:inline-flex">
                  Signed in as {firstName}
                </span>
              ) : undefined
            }
          />
          {myRooms.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-44 rounded-2xl" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-14 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
                <IconRooms size={22} />
              </span>
              <p className="mt-4 font-display text-[15px] font-semibold text-ink-800">No rooms yet</p>
              <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">
                You haven't joined any rooms yet. Ask your organizer for a join code, or wait to be
                assigned.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rooms.map(({ room, membership }) => (
                <Card key={room.id} className="group flex flex-col overflow-hidden p-0 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift">
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 top-0 h-0.5 ${
                      room.status === "ACTIVE"
                        ? "bg-gradient-to-r from-jade-400 to-jade-200"
                        : room.status === "CLOSED"
                          ? "bg-gradient-to-r from-coral-400 to-coral-200"
                          : "bg-gradient-to-r from-brand-400 to-brand-200"
                    }`}
                  />
                  <div className="flex flex-1 flex-col p-5">
                    <div className="flex items-start justify-between gap-2">
                      <StatusBadge status={room.status} />
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${
                        membership.role === "MODERATOR"
                          ? "bg-ocean-50 text-ocean-700 ring-ocean-200"
                          : "bg-ink-100 text-ink-600 ring-ink-200"
                      }`}>
                        {membership.role === "MODERATOR" ? "Moderator" : "Participant"}
                      </span>
                    </div>
                    <h3 className="mt-3 font-display text-[17px] font-semibold leading-snug text-ink-900">
                      {room.name}
                    </h3>
                    {room.description ? (
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-ink-500">{room.description}</p>
                    ) : (
                      <p className="mt-1 text-[12px] text-ink-400">
                        {membership.role === "MODERATOR" ? "You are a moderator here." : "You are a participant here."}
                      </p>
                    )}
                    <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-4 text-[11px] text-ink-500">
                      <span className="inline-flex items-center gap-1">
                        <IconUsers size={12} className="text-ink-400" />
                        {room._count?.members ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <IconTeams size={12} className="text-ink-400" />
                        {room._count?.roomTeams ?? 0}
                      </span>
                    </div>
                    <div className="mt-4 border-t border-line pt-3.5">
                      {room.status === "ACTIVE" || room.status === "CLOSED" ? (
                        <Button
                          className="w-full py-2 text-xs"
                          onClick={() => navigate(`/room/${room.id}`)}
                          data-testid="enter-room"
                        >
                          Enter
                          <IconArrowRight size={13} />
                        </Button>
                      ) : (
                        <span className="flex items-center justify-center rounded-xl bg-ink-50 px-3 py-2 text-[11px] font-medium text-ink-400">
                          {room.status === "DRAFT" ? "Not open yet" : room.status.toLowerCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
