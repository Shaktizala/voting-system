import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { Spinner } from "../components/Spinner";
import { Button, Card, ErrorBox, LabelledInput, StatusBadge } from "../components/ui";
import { useState } from "react";
import { useToast } from "../contexts/Toast";

/** Participant home: list of joined rooms + join-by-code card. */
export default function ParticipantRooms() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const myRooms = useQuery({
    queryKey: ["my-memberships", user?.id],
    queryFn: async () => {
      const rooms = (await api<{ rooms: any[] }>("/rooms")).rooms;
      const memberships = await Promise.all(
        rooms.map(async (r) => {
          try {
            const { membership } = await api<{ membership: any }>(`/rooms/${r.id}/my-membership`);
            return membership && r.status !== "ARCHIVED" ? { room: r, membership } : null;
          } catch {
            return null;
          }
        })
      );
      return memberships.filter(Boolean) as { room: any; membership: any }[];
    },
    refetchInterval: 15000,
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

  return (
    <>
      <h1 className="mb-4 text-xl font-bold sm:text-2xl">Welcome, {user?.name}</h1>
      <Card className="mb-6 max-w-xl">
        <h2 className="mb-2 font-semibold">Join a room</h2>
        <p className="mb-3 text-sm text-gray-500">Enter the code you were given by your organizer.</p>
        <div className="flex flex-wrap items-end gap-2">
          <LabelledInput
            label="Join code (6–8 characters)"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. 7KQPW2M"
            maxLength={8}
            className="w-40 font-mono"
          />
          <Button onClick={join}>Join room</Button>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </Card>

      <h2 className="mb-3 font-semibold">My rooms</h2>
      {myRooms.isLoading ? (
        <div className="space-y-2">{[...Array(2)].map((_, i) => <div key={i} className="h-16 animate-pulse rounded bg-gray-200" />)}</div>
      ) : (myRooms.data?.length ?? 0) === 0 ? (
        <Card>
          <p className="text-sm text-gray-500">You haven't joined any rooms yet. Ask your organizer for a join code, or wait to be assigned.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {myRooms.data!.map(({ room, membership }) => (
            <Card key={room.id}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{room.name}</p>
                <StatusBadge status={room.status} />
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {membership.role === "MODERATOR" ? "You are a moderator here" : "You are a participant"}
              </p>
              <div className="mt-3 flex gap-2">
                {room.status === "ACTIVE" || room.status === "CLOSED" ? (
                  <Button className="text-xs" onClick={() => navigate(`/room/${room.id}`)} data-testid="enter-room">Enter</Button>
                ) : (
                  <span className="text-xs text-gray-500">
                    {room.status === "DRAFT" ? "not open yet" : room.status.toLowerCase()}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      {void toast}
    </>
  );
}
