import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { Card, EmptyState, PageTitle, Skeleton, StatusBadge } from "../../components/ui";

export default function AdminDashboard() {
  const roomsQ = useQuery({ queryKey: ["rooms"], queryFn: () => api<{ rooms: any[] }>("/rooms") });
  const usersQ = useQuery({ queryKey: ["participants"], queryFn: () => api<{ participants: any[] }>("/participants") });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });

  const rooms = roomsQ.data?.rooms ?? [];
  const activeRooms = rooms.filter((r) => r.status === "ACTIVE").length;

  return (
    <>
      <PageTitle title="Admin dashboard" subtitle="Rooms, participants, and teams at a glance" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <Card>
          <p className="text-3xl font-bold">{roomsQ.isLoading ? <Skeleton className="h-8 w-10" /> : rooms.length}</p>
          <p className="text-sm text-gray-500">Rooms ({activeRooms} active)</p>
        </Card>
        <Card>
          <p className="text-3xl font-bold">{usersQ.isLoading ? <Skeleton className="h-8 w-10" /> : usersQ.data?.participants.length}</p>
          <p className="text-sm text-gray-500">Participants</p>
        </Card>
        <Card>
          <p className="text-3xl font-bold">{teamsQ.isLoading ? <Skeleton className="h-8 w-10" /> : teamsQ.data?.teams.length}</p>
          <p className="text-sm text-gray-500">Teams</p>
        </Card>
        <Card>
          <p className="text-3xl font-bold">{roomsQ.isLoading ? <Skeleton className="h-8 w-10" /> : rooms.reduce((s: number, r: any) => s + (r._count?.members ?? 0), 0)}</p>
          <p className="text-sm text-gray-500">Room memberships</p>
        </Card>
      </div>

      <h2 className="mb-3 mt-6 font-semibold">Rooms</h2>
      {roomsQ.isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
      ) : rooms.length === 0 ? (
        <EmptyState title="No rooms yet" hint="Create a room under Rooms to get started." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <Card key={r.id} className="flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold">{r.name}</p>
                  <StatusBadge status={r.status} />
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {r._count.members} participants · {r._count.roomTeams} teams · {r._count.categories} categories
                </p>
              </div>
              <Link className="mt-3 text-sm font-medium text-blue-700 hover:underline" to={`/admin/rooms/${r.id}`}>
                Open live dashboard →
              </Link>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
