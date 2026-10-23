import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ConfirmDialog, EmptyState, ErrorBox, LabelledInput, LabelledSelect, PageTitle, Skeleton, StatusBadge } from "../../components/ui";
import { useToast } from "../../contexts/Toast";

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

  return (
    <>
      <PageTitle title="Rooms" subtitle="Evaluation rooms with their own join codes, categories, and state" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold"><span id="new-room">New room</span></h2>
          <div className="space-y-2">
            <LabelledInput label="Room name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <LabelledInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <LabelledSelect label="Access mode" value={form.accessMode} onChange={(e) => setForm({ ...form, accessMode: e.target.value })}>
              <option value="RESTRICTED">Restricted — assigned participants only</option>
              <option value="OPEN_WITH_CODE">Open with code — any active participant</option>
            </LabelledSelect>
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button onClick={() => (!form.name.trim() ? setError("Room name is required") : create.mutate())} disabled={create.isPending}>
              Create room
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-2 space-y-3">
          {listQ.isLoading ? (
            <Skeleton className="h-64" />
          ) : rooms.length === 0 ? (
            <EmptyState title="No rooms yet" hint="Create one to start an evaluation session." />
          ) : (
            rooms.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Link to={`/admin/rooms/${r.id}`} className="font-semibold hover:underline">{r.name}</Link>
                      <StatusBadge status={r.status} />
                    </div>
                    <p className="mt-1 text-sm text-gray-500">
                      {r._count.members} participants · {r._count.roomTeams} teams · {r._count.categories} categories
                      {r.publishedAt ? " · results published" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <Link to={`/admin/rooms/${r.id}`} className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-800 hover:bg-gray-100">Configure</Link>
                    {r.status === "DRAFT" && (
                      <Button className="text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "ACTIVE" })}>Activate</Button>
                    )}
                    {r.status === "ACTIVE" && (
                      <Button variant="secondary" className="text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "CLOSED" })}>Close</Button>
                    )}
                    {r.status === "CLOSED" && (
                      <Button variant="secondary" className="text-xs" onClick={() => setStatus.mutate({ id: r.id, status: "ARCHIVED" })}>Archive</Button>
                    )}
                    <Button variant="ghost" className="text-xs" onClick={() => setConfirmDup(r)}>Duplicate</Button>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
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
