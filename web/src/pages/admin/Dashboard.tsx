import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { useAuth } from "../../contexts/Auth";
import {
  buttonClass,
  Card,
  EmptyState,
  PageTitle,
  SectionHeading,
  Skeleton,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { ConnectionDot } from "../../components/Shell";
import {
  IconActivity,
  IconArrowUpRight,
  IconAudit,
  IconChart,
  IconChevronRight,
  IconPlus,
  IconRooms,
  IconSparkles,
  IconTeams,
  IconUsers,
} from "../../components/icons";

const QUICK_ACTIONS = [
  {
    to: "/admin/participants",
    label: "Add participants",
    description: "Create accounts or bulk import",
    icon: <IconUsers size={17} />,
  },
  {
    to: "/admin/teams",
    label: "Manage teams",
    description: "Projects, members, and details",
    icon: <IconTeams size={17} />,
  },
  {
    to: "/admin/rooms",
    label: "Room setup",
    description: "Categories, teams, and members",
    icon: <IconRooms size={17} />,
  },
  {
    to: "/admin/audit",
    label: "Review the audit log",
    description: "Every important action, recorded",
    icon: <IconAudit size={17} />,
  },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: () => api<{ rooms: any[] }>("/rooms") });
  const usersQ = useQuery({ queryKey: ["participants"], queryFn: () => api<{ participants: any[] }>("/participants") });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });

  const rooms = roomsQ.data?.rooms ?? [];
  const activeRooms = rooms.filter((room) => room.status === "ACTIVE").length;
  const membershipCount = rooms.reduce((sum: number, room: any) => sum + (room._count?.members ?? 0), 0);
  const firstName = user?.name?.split(" ")[0];

  return (
    <>
      <PageTitle
        eyebrow="Overview"
        title="Admin dashboard"
        subtitle={`${
          firstName ? `Welcome back, ${firstName}. ` : ""
        }Rooms, participants, and teams at a glance.`}
        actions={
          <Link to="/admin/rooms" className={buttonClass("primary")}>
            <IconPlus size={16} />
            New room
          </Link>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Rooms"
          value={roomsQ.isLoading ? <Skeleton className="h-8 w-12" /> : rooms.length}
          hint={`${activeRooms} active right now`}
          icon={<IconRooms size={20} />}
          tone="brand"
        />
        <StatCard
          label="Participants"
          value={
            usersQ.isLoading ? (
              <Skeleton className="h-8 w-12" />
            ) : (
              usersQ.data?.participants.length ?? 0
            )
          }
          hint="Across the organization"
          icon={<IconUsers size={20} />}
          tone="ocean"
        />
        <StatCard
          label="Teams"
          value={teamsQ.isLoading ? <Skeleton className="h-8 w-12" /> : teamsQ.data?.teams.length ?? 0}
          hint="Ready for evaluation"
          icon={<IconTeams size={20} />}
          tone="jade"
        />
        <StatCard
          label="Room memberships"
          value={roomsQ.isLoading ? <Skeleton className="h-8 w-12" /> : membershipCount}
          hint="Assignments in active rooms"
          icon={<IconActivity size={20} />}
          tone="gold"
        />
      </div>

      <div className="mt-7 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <section>
          <SectionHeading
            title="Evaluation rooms"
            description="Jump into a room to run the live round."
            count={rooms.length}
            action={
              <Link
                to="/admin/rooms"
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
              >
                View all
                <IconChevronRight size={15} />
              </Link>
            }
          />

          {roomsQ.isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[10.5rem] rounded-2xl" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              hint="Create a room to group your teams, categories, and voting rounds."
              icon={<IconRooms size={22} />}
              action={
                <Link to="/admin/rooms" className={buttonClass("primary")}>
                  <IconPlus size={16} />
                  Create your first room
                </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {rooms.map((room) => (
                <Link
                  key={room.id}
                  to={`/admin/rooms/${room.id}`}
                  className="group relative flex min-h-[10.5rem] flex-col overflow-hidden rounded-2xl border border-line bg-white p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-lift"
                >
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
                  <div className="flex items-start justify-between gap-2">
                    <StatusBadge status={room.status} />
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-50 text-ink-400 transition group-hover:bg-brand-50 group-hover:text-brand-600">
                      <IconArrowUpRight size={14} />
                    </span>
                  </div>
                  <h3 className="mt-3 font-display text-[17px] font-semibold leading-snug text-ink-900 transition-colors group-hover:text-brand-700">
                    {room.name}
                  </h3>
                  {room.description ? (
                    <p className="mt-1 line-clamp-1 text-[13px] text-ink-500">{room.description}</p>
                  ) : (
                    <p className="mt-1 text-[13px] italic text-ink-400">No description</p>
                  )}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-4 text-[11px] font-medium text-ink-500">
                    <span className="inline-flex items-center gap-1.5">
                      <IconUsers size={13} className="text-ink-400" />
                      {room._count.members} participants
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <IconTeams size={13} className="text-ink-400" />
                      {room._count.roomTeams} teams
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <Card className="p-0">
            <div className="flex items-center justify-between gap-2 px-5 pb-1 pt-5">
              <h2 className="font-display text-base font-semibold text-ink-900">Quick actions</h2>
              <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-500">
                Shortcuts
              </span>
            </div>
            <div className="mt-3 border-t border-line">
              {QUICK_ACTIONS.map((action) => (
                <Link
                  key={action.to}
                  to={action.to}
                  className="group flex items-center gap-3.5 border-b border-line/70 px-5 py-3.5 transition-colors last:border-b-0 hover:bg-brand-50/50"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-ink-50 text-ink-500 ring-1 ring-inset ring-line transition group-hover:bg-white group-hover:text-brand-600 group-hover:ring-brand-100">
                    {action.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink-800">{action.label}</span>
                    <span className="block truncate text-[11px] text-ink-400">{action.description}</span>
                  </span>
                  <IconChevronRight
                    size={15}
                    className="shrink-0 text-ink-300 transition group-hover:translate-x-0.5 group-hover:text-brand-500"
                  />
                </Link>
              ))}
            </div>
          </Card>

          <div className="relative overflow-hidden rounded-2xl bg-ink-950 p-5 text-white shadow-card">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-500/30 blur-3xl" />
              <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-jade-500/15 blur-3xl" />
            </div>
            <div className="relative">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  System status
                </span>
                <IconActivity size={15} className="text-jade-300" />
              </div>
              <p className="mt-3 font-display text-lg font-semibold">
                {activeRooms > 0
                  ? `${activeRooms} room${activeRooms === 1 ? "" : "s"} live`
                  : "Everything is quiet"}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-white/45">
                {activeRooms > 0
                  ? "Participants can score open rounds right now."
                  : "Activate a room when you're ready to start evaluating."}
              </p>
              <div className="mt-4 flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5">
                <ConnectionDot dark />
                <Link
                  to="/admin/rooms"
                  className="text-[11px] font-semibold text-brand-200 transition hover:text-white"
                >
                  Room management
                </Link>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-brand-100 bg-brand-50/60 p-4">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-600">
              <IconSparkles size={13} />
              Good to know
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-ink-600">
              Results stay hidden from participants until you publish them. Use the live dashboard
              to monitor turnout before closing a round.
            </p>
            <Link
              to="/admin/rooms"
              className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-700 hover:text-brand-800"
            >
              Open live dashboards
              <IconChart size={13} />
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
