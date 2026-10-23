import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Button, Card, ConfirmDialog, DataTable, EmptyState, ErrorBox, LabelledInput, PageTitle, Skeleton } from "../../components/ui";
import { useToast } from "../../contexts/Toast";

export default function Teams() {
  const qc = useQueryClient();
  const toast = useToast();
  const listQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });
  const [form, setForm] = useState({ name: "", description: "", projectTitle: "" });
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const create = useMutation({
    mutationFn: () => api("/teams", { body: { ...form, links: [] } }),
    onSuccess: () => {
      setForm({ name: "", description: "", projectTitle: "" });
      setError(null);
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast("Team created", "success");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/teams/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["teams"] });
      toast("Team deleted", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Delete failed", "error"),
  });

  const teams = listQ.data?.teams ?? [];

  return (
    <>
      <PageTitle title="Teams" subtitle="Organization-level teams, linked to rooms one event at a time" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-3 font-semibold">New team</h2>
          <div className="space-y-2">
            <LabelledInput label="Team name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <LabelledInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <LabelledInput label="Project title (optional)" value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button
              onClick={() => {
                if (!form.name.trim()) return setError("Team name is required");
                create.mutate();
              }}
              disabled={create.isPending}
            >
              Create team
            </Button>
          </div>
        </Card>

        <div className="lg:col-span-2">
          {listQ.isLoading ? (
            <Skeleton className="h-48" />
          ) : teams.length === 0 ? (
            <EmptyState title="No teams yet" hint="Create your first team on the left." />
          ) : (
            <DataTable head={["Team", "Project", "Members", "Actions"]}>
              {teams.map((t) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">{t.name}</td>
                  <td className="px-3 py-2 text-gray-600">{t.projectTitle ?? "—"}</td>
                  <td className="px-3 py-2">{t._count?.members ?? 0}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" className="text-xs text-red-700" onClick={() => setConfirmDelete(t)}>Delete</Button>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete team?"
        body={`"${confirmDelete?.name}" will be soft-deleted. Results that reference it are kept.`}
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && del.mutate(confirmDelete.id)}
      />
    </>
  );
}
