import { useQueries, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { buttonClass, PageTitle, Skeleton, StatCard, StatStrip, StatusBadge } from "../../components/ui";
import { IconPlus } from "../../components/icons";

/*
 * Overview. The screen's question: "Which room is live, and what needs me?"
 * The rooms table answers it and is the largest block; turnout on the live
 * round is the one data element in the brand hue. The rail lists real admin
 * jobs, then recent activity.
 * Grid: 1fr + 384px rail, 24px gap (dealt overview pattern).
 */

interface Room {
  id: string;
  name: string;
  status: string;
  publishedAt: string | null;
  _count: { members: number; roomTeams: number; categories: number };
}
interface Round {
  id: string;
  teamId: string;
  status: string;
  createdAt?: string;
}
interface Snapshot {
  teams: { teamId: string; name: string }[];
  rounds: Round[];
}
interface Progress {
  votedCount: number;
  eligibleCount: number;
}

const LIVE = ["PENDING", "OPEN", "PAUSED"];

export default function AdminDashboard() {
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: () => api<{ rooms: Room[] }>("/rooms") });
  const usersQ = useQuery({ queryKey: ["participants"], queryFn: () => api<{ participants: any[] }>("/participants") });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });
  const auditQ = useQuery({ queryKey: ["audit"], queryFn: () => api<{ logs: any[] }>("/audit") });

  const rooms = roomsQ.data?.rooms ?? [];
  // active rooms first, then drafts, then the rest; archived rooms stay on the Rooms screen
  const order = { ACTIVE: 0, DRAFT: 1, CLOSED: 2 } as Record<string, number>;
  const shown = rooms.filter((r) => r.status !== "ARCHIVED").sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3));
  const active = shown.filter((r) => r.status === "ACTIVE");

  const snapshots = useQueries({
    queries: active.map((room) => ({
      queryKey: ["snapshot", room.id],
      queryFn: () => api<Snapshot>(`/rooms/${room.id}/full`),
      refetchInterval: 15_000,
    })),
  });
  const liveRound = (roomId: string) => {
    const i = active.findIndex((r) => r.id === roomId);
    const snap = i >= 0 ? snapshots[i]?.data : undefined;
    const round = snap?.rounds.find((r) => LIVE.includes(r.status));
    return round ? { round, team: snap!.teams.find((t) => t.teamId === round.teamId)?.name ?? "—" } : null;
  };
  const progress = useQueries({
    queries: active.map((room) => {
      const live = liveRound(room.id);
      return {
        queryKey: ["progress", room.id, live?.round.id],
        queryFn: () => api<Progress>(`/rooms/${room.id}/rounds/${live!.round.id}/progress`),
        enabled: !!live && live.round.status !== "PENDING",
        refetchInterval: 15_000,
      };
    }),
  });

  const people = usersQ.data?.participants ?? [];
  const activePeople = people.filter((p) => p.status === "ACTIVE").length;
  const tempPasswords = people.filter((p) => p.status === "ACTIVE" && p.mustChangePassword).length;
  const drafts = shown.filter((r) => r.status === "DRAFT");
  const unpublished = active.filter((r) => !r.publishedAt);

  const votingNow = active
    .map((r) => ({ room: r, live: liveRound(r.id) }))
    .filter((x) => x.live?.round.status === "OPEN");
  const finding = roomsQ.isLoading
    ? "Loading rooms…"
    : votingNow.length
      ? `Voting is open in ${votingNow.map((x) => `${x.room.name} (${x.live!.team})`).join(", ")}.`
      : active.length
        ? `${active.length} ${active.length === 1 ? "room is" : "rooms are"} active. No round is open right now.`
        : "No room is active. Activate a room to start a round.";

  const jobs = [
    drafts.length > 0 && { to: "/admin/rooms", text: `${drafts.length} draft ${drafts.length === 1 ? "room" : "rooms"} to activate` },
    unpublished.length > 0 && { to: `/room/${unpublished[0].id}/results`, text: `Results not yet published in ${unpublished.map((r) => r.name).join(", ")}` },
    tempPasswords > 0 && { to: "/admin/participants", text: `${tempPasswords} ${tempPasswords === 1 ? "person hasn't" : "people haven't"} replaced a temporary password` },
  ].filter(Boolean) as { to: string; text: string }[];

  return (
    <>
      <PageTitle
        title="Overview"
        subtitle={finding}
        actions={
          <Link to="/admin/rooms" className={buttonClass("primary")}>
            <IconPlus size={16} />
            New room
          </Link>
        }
      />

      <div className="mb-6">
        <StatStrip columns={3}>
          <StatCard
            label="Active rooms"
            value={roomsQ.isLoading ? <Skeleton className="h-7 w-10" /> : active.length}
            hint={roomsQ.isLoading ? undefined : `of ${shown.length} ${shown.length === 1 ? "room" : "rooms"}`}
          />
          <StatCard
            label="People"
            value={usersQ.isLoading ? <Skeleton className="h-7 w-10" /> : activePeople}
            hint={usersQ.isLoading ? undefined : activePeople === people.length ? "all accounts active" : `active, of ${people.length} accounts`}
          />
          <StatCard
            label="Teams"
            value={teamsQ.isLoading ? <Skeleton className="h-7 w-10" /> : (teamsQ.data?.teams.length ?? 0)}
            hint="in the organisation"
          />
        </StatStrip>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <section aria-labelledby="rooms-heading" className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h2 id="rooms-heading" className="text-base font-semibold text-ink-950">
              Rooms
            </h2>
            <Link to="/admin/rooms" className="text-sm text-ink-700 underline-offset-4 hover:underline">
              All rooms
            </Link>
          </div>

          <div className="overflow-hidden rounded-[10px] border border-line">
            {roomsQ.isLoading ? (
              <div className="space-y-px">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex h-[72px] items-center gap-4 px-4">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="ml-auto h-2 w-40" />
                  </div>
                ))}
              </div>
            ) : roomsQ.isError ? (
              <p className="px-4 py-6 text-sm text-ink-700">
                Couldn't load rooms.{" "}
                <button type="button" className="font-medium underline underline-offset-4" onClick={() => roomsQ.refetch()}>
                  Try again
                </button>
              </p>
            ) : shown.length === 0 ? (
              <p className="px-4 py-6 text-sm text-ink-700">
                No rooms yet.{" "}
                <Link to="/admin/rooms" className="font-medium underline underline-offset-4">
                  Create the first room
                </Link>
              </p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="max-md:sr-only">
                  <tr className="border-b border-line">
                    <th scope="col" className="h-10 px-4 text-xs font-normal text-ink-500">Room</th>
                    <th scope="col" className="h-10 px-4 text-xs font-normal text-ink-500">Presenting now</th>
                    <th scope="col" className="h-10 w-[190px] px-4 text-xs font-normal text-ink-500">Turnout</th>
                    <th scope="col" className="h-10 px-4 text-right text-xs font-normal text-ink-500">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shown.slice(0, 6).map((room) => {
                    const i = active.findIndex((r) => r.id === room.id);
                    const live = room.status === "ACTIVE" ? liveRound(room.id) : null;
                    const p = i >= 0 ? progress[i]?.data : undefined;
                    return (
                      <tr key={room.id} className="border-b border-rule last:border-0 max-md:flex max-md:flex-wrap max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3">
                        <td className="px-4 py-3.5 max-md:w-full max-md:p-0">
                          <Link to={`/admin/rooms/${room.id}`} className="font-medium text-ink-950 hover:underline underline-offset-4">
                            {room.name}
                          </Link>
                          <p className="num mt-0.5 whitespace-nowrap text-[13px] text-ink-500">
                            {plural(room._count.members, "member")}, {plural(room._count.roomTeams, "team")}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 max-md:p-0">
                          {room.status !== "ACTIVE" ? (
                            <StatusBadge status={room.status} />
                          ) : live ? (
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="whitespace-nowrap text-ink-900">{live.team}</span>
                              <StatusBadge status={live.round.status} />
                            </span>
                          ) : (
                            <span className="text-ink-500">Between rounds</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 max-md:min-w-[180px] max-md:flex-1 max-md:p-0">
                          {p ? (
                            <Turnout voted={p.votedCount} eligible={p.eligibleCount} />
                          ) : (
                            <span className="text-ink-500" aria-label="No turnout">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-right max-md:p-0">
                          {room.status === "ACTIVE" && (
                            <Link to={`/room/${room.id}`} className={buttonClass("secondary", "h-8 whitespace-nowrap px-3 text-[13px]")}>
                              Open live room
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {shown.length > 6 && (
            <p className="mt-2 text-sm text-ink-500">
              Showing 6 of {shown.length}.{" "}
              <Link to="/admin/rooms" className="text-ink-800 underline underline-offset-4">View all rooms</Link>
            </p>
          )}
        </section>

        <aside className="space-y-6">
          <section aria-labelledby="jobs-heading">
            <h2 id="jobs-heading" className="mb-2 text-base font-semibold text-ink-950">
              Needs attention
            </h2>
            <div className="rounded-[10px] border border-line">
              {jobs.length === 0 ? (
                <p className="px-4 py-3.5 text-sm text-ink-700">Nothing waiting on you.</p>
              ) : (
                <ul>
                  {jobs.map((job) => (
                    <li key={job.text} className="border-b border-rule last:border-0">
                      <Link to={job.to} className="block px-4 py-3 text-sm text-ink-900 transition-colors hover:bg-ink-50">
                        {job.text}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section aria-labelledby="activity-heading">
            <div className="mb-2 flex items-baseline justify-between gap-3">
              <h2 id="activity-heading" className="text-base font-semibold text-ink-950">
                Recent activity
              </h2>
              <Link to="/admin/audit" className="text-sm text-ink-700 underline-offset-4 hover:underline">
                Audit log
              </Link>
            </div>
            <div className="rounded-[10px] border border-line">
              {auditQ.isLoading ? (
                <div className="space-y-3 p-4">
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              ) : auditQ.isError ? (
                <p className="px-4 py-3.5 text-sm text-ink-700">Couldn't load activity.</p>
              ) : (
                <ul>
                  {(auditQ.data?.logs ?? []).slice(0, 5).map((log) => (
                    <li key={log.id} className="flex items-baseline justify-between gap-3 border-b border-rule px-4 py-3 last:border-0">
                      <span className="min-w-0 truncate text-sm text-ink-900">
                        <span className="font-medium">{log.actor?.username ?? "system"}</span>{" "}
                        <span className="text-ink-600">{describe(log.action)}</span>
                      </span>
                      <time className="num shrink-0 text-xs text-ink-500" dateTime={log.createdAt}>
                        {timeAgo(log.createdAt)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </aside>
      </div>
    </>
  );
}

/** Turnout as a true-ratio bar in the brand hue, with the figures beside it. */
function Turnout({ voted, eligible }: { voted: number; eligible: number }) {
  const pct = eligible ? Math.round((voted / eligible) * 100) : 0;
  return (
    <span className="flex items-center gap-3">
      <span
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={eligible}
        aria-valuenow={voted}
        aria-label={`${voted} of ${eligible} voted`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100"
      >
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
      </span>
      <span className="num shrink-0 whitespace-nowrap text-right text-sm text-ink-900">
        {voted}
        <span className="text-ink-500"> of {eligible}</span>
      </span>
    </span>
  );
}

const ACTIONS: Record<string, string> = {
  "auth.login": "signed in",
  "auth.login_failed": "failed to sign in",
  "auth.lockout": "was locked out",
  "auth.password_changed": "changed their password",
  "vote.submit": "voted",
  "vote.edit": "edited a vote",
  "round.open": "opened voting",
  "round.pause": "paused voting",
  "round.resume": "resumed voting",
  "round.close": "closed a round",
  "round.reopen": "re-opened a round",
  "round.team_selected": "picked the presenting team",
  "round.team_reselected": "re-presented a team",
  "results.publish": "published results",
  "results.unpublish": "unpublished results",
  "room.create": "created a room",
  "room.update": "edited a room",
  "room.status": "changed a room's status",
};
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? "" : "s"}`;
const describe = (action: string) => ACTIONS[action] ?? action.replace(/[._]/g, " ");

function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
