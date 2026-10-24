import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import {
  Button,
  buttonClass,
  Card,
  ConfirmDialog,
  EmptyState,
  ErrorBox,
  LabelledInput,
  LabelledSelect,
  PageTitle,
  SectionHeading,
  Skeleton,
  StatCard,
  StatusBadge,
} from "../../components/ui";
import { useToast } from "../../contexts/Toast";
import {
  IconArrowRight,
  IconChart,
  IconPlus,
  IconRooms,
  IconSettings,
  IconTeams,
  IconTrophy,
  IconUsers,
} from "../../components/icons";

export default function Rooms() {
  const qc = useQueryClient();
  const toast = useToast();
  const listQ = useQuery({ queryKey: ["rooms"], queryFn: () => api<{ rooms: any[] }>("/rooms") });
  const [form, setForm] = useState({ name: "", description: "", accessMode: "RESTRICTED" });
  const [error, setError] = useState<string | null>(null);
  const [confirmDup, setConfirmDup] = useState<any | null>(null);

  const create = useMutation({
    mutationFn: () => api("/rooms", { body: form }),
    onSuccess: () => {
      setForm({ name: "", description: "", accessMode: "RESTRICTED" });
      setError(null);
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast("Room created with a fresh join code", "success");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed"),
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api(`/rooms/${id}/status`, { body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rooms"] }),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Status change failed", "error"),
  });

  const dup = useMutation({
    mutationFn: (id: string) => api(`/rooms/${id}/duplicate`, { body: {} }),
    onSuccess: () => {
      setConfirmDup(null);
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast("Room duplicated (categories, teams, members — no votes)", "success");
    },
  });

  const rooms = listQ.data?.rooms ?? [];
  const activeRooms = rooms.filter((room) => room.status === "ACTIVE").length;
  const draftRooms = rooms.filter((room) => room.status === "DRAFT").length;
  const publishedRooms = rooms.filter((room) => room.publishedAt).length;

  return (
    <>
      <PageTitle
        eyebrow="Sessions"
        title="Rooms"
        subtitle="Evaluation rooms with their own join codes, categories, and state."
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total rooms" value={listQ.isLoading ? <Skeleton className="h-8 w-10" /> : rooms.length} icon={<IconRooms size={19} />} tone="brand" />
        <StatCard label="Active now" value={listQ.isLoading ? <Skeleton className="h-8 w-10" /> : activeRooms} hint={draftRooms > 0 ? `${draftRooms} draft${draftRooms === 1 ? "" : "s"} waiting` : "Ready for voting"} icon={<IconChart size={19} />} tone="jade" />
        <StatCard label="Published results" value={listQ.isLoading ? <Skeleton className="h-8 w-10" /> : publishedRooms} icon={<IconTrophy size={19} />} tone="ocean" />
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.55fr)]">
        <Card className="xl:sticky xl:top-6" >
          <div id="new-room" className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
              <IconPlus size={19} />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">New room</h2>
              <p className="mt-0.5 text-xs text-ink-500">A join code is generated automatically.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <LabelledInput label="Room name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Spring Demo Day" />
            <LabelledInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional context for participants" />
            <LabelledSelect label="Access mode" value={form.accessMode} onChange={(e) => setForm({ ...form, accessMode: e.target.value })}>
              <option value="RESTRICTED">Restricted — assigned participants only</option>
              <option value="OPEN_WITH_CODE">Open with code — any active participant</option>
            </LabelledSelect>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button
              className="w-full"
              onClick={() => (!form.name.trim() ? setError("Room name is required") : create.mutate())}
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create room"}
            </Button>
          </div>
          <div className="mt-5 rounded-xl border border-line bg-ink-50/50 px-3.5 py-3">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500">
              <IconSettings size={12} />
              Next steps
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-500">
              Configure categories, link teams, and assign members. Activate the room when you're
              ready to open voting.
            </p>
          </div>
        </Card>

        <section>
          <SectionHeading
            title="All rooms"
            count={rooms.length}
            description="Open a room to configure it, or jump straight to the live dashboard."
          />
          {listQ.isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-40 rounded-2xl" />
              ))}
            </div>
          ) : rooms.length === 0 ? (
            <EmptyState
              title="No rooms yet"
              hint="Create one to start an evaluation session. You can duplicate it later for the next event."
              icon={<IconRooms size={22} />}
              action={
                <Button variant="secondary" onClick={() => document.getElementById("new-room")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
                  Start with a new room
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {rooms.map((room) => (
                <Card key={room.id} className="group overflow-hidden p-0 transition-all duration-300 hover:border-brand-200 hover:shadow-lift">
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
                  <div className="p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/admin/rooms/${room.id}`}
                            className="font-display text-[17px] font-semibold text-ink-900 transition-colors hover:text-brand-700"
                          >
                            {room.name}
                          </Link>
                          <StatusBadge status={room.status} />
                          {room.publishedAt && (
                            <span className="rounded-full bg-ocean-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-ocean-700 ring-1 ring-inset ring-ocean-200">
                              Results published
                            </span>
                          )}
                        </div>
                        {room.description ? (
                          <p className="mt-1 line-clamp-1 text-sm text-ink-500">{room.description}</p>
                        ) : (
                          <p className="mt-1 text-sm italic text-ink-400">No description</p>
                        )}
                      </div>
                      {room.joinCode && (
                        <span className="rounded-lg border border-line bg-ink-50/70 px-2.5 py-1.5 font-mono text-[11px] font-semibold tracking-[0.14em] text-ink-600" title="Join code">
                          {room.joinCode}
                        </span>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-medium text-ink-500">
                      <span className="inline-flex items-center gap-1.5">
                        <IconUsers size={13} className="text-ink-400" />
                        {room._count.members} participants
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <IconTeams size={13} className="text-ink-400" />
                        {room._count.roomTeams} teams
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <IconSettings size={13} className="text-ink-400" />
                        {room._count.categories} categories
                      </span>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
                      <Link to={`/admin/rooms/${room.id}`} className={buttonClass("secondary", "px-3 py-2 text-xs")}>
                        Configure
                      </Link>
                      <Link to={`/room/${room.id}`} className={buttonClass("ghost", "px-3 py-2 text-xs")}>
                        Live dashboard
                        <IconArrowRight size={13} />
                      </Link>
                      <span className="mx-1 hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
                      {room.status === "DRAFT" && (
                        <Button className="px-3 py-2 text-xs" onClick={() => setStatus.mutate({ id: room.id, status: "ACTIVE" })}>
                          Activate
                        </Button>
                      )}
                      {room.status === "ACTIVE" && (
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setStatus.mutate({ id: room.id, status: "CLOSED" })}>
                          Close
                        </Button>
                      )}
                      {room.status === "CLOSED" && (
                        <Button variant="secondary" className="px-3 py-2 text-xs" onClick={() => setStatus.mutate({ id: room.id, status: "ARCHIVED" })}>
                          Archive
                        </Button>
                      )}
                      <Button variant="ghost" className="ml-auto px-3 py-2 text-xs" onClick={() => setConfirmDup(room)}>
                        Duplicate
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!confirmDup}
        title="Duplicate room?"
        body={`Copies categories, linked teams, and member assignments of "${confirmDup?.name}". Votes are not copied.`}
        confirmLabel="Duplicate"
        onCancel={() => setConfirmDup(null)}
        onConfirm={() => confirmDup && dup.mutate(confirmDup.id)}
      />
    </>
  );
}
