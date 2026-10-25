import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import {
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorBox,
  LabelledInput,
  PageTitle,
  SectionHeading,
  Skeleton,
  StatCard,
  StatStrip,
} from "../../components/ui";
import { useToast } from "../../contexts/Toast";
import { IconTeams, IconUsers, } from "../../components/icons";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

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
  const totalMembers = teams.reduce((sum: number, team: any) => sum + (team._count?.members ?? 0), 0);
  const projects = teams.filter((team: any) => team.projectTitle).length;

  return (
    <>
      <PageTitle

        title="Teams"
        subtitle="Organization-level teams, linked to rooms one event at a time."
      />

      <div className="mb-6">
          <StatStrip columns={3}>
        <StatCard label="Teams" value={listQ.isLoading ? <Skeleton className="h-7 w-10" /> : teams.length} />
        <StatCard label="Members" value={listQ.isLoading ? <Skeleton className="h-7 w-10" /> : totalMembers} />
        <StatCard label="Projects showcased" value={listQ.isLoading ? <Skeleton className="h-7 w-10" /> : projects} />
          </StatStrip>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.5fr)]">
        <Card className="xl:sticky xl:top-6">
          <div className="flex items-start gap-3">
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">New team</h2>
              <p className="mt-0.5 text-[13px] text-ink-500">Create the team once, link it to any room.</p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            <LabelledInput label="Team name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Team Aurora" />
            <LabelledInput label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What does this team work on?" />
            <LabelledInput label="Project title (optional)" value={form.projectTitle} onChange={(e) => setForm({ ...form, projectTitle: e.target.value })} placeholder="e.g. Atlas — smarter dispatch" />
            {error && <ErrorBox>{error}</ErrorBox>}
            <Button
              className="w-full"
              onClick={() => {
                if (!form.name.trim()) return setError("Team name is required");
                create.mutate();
              }}
              disabled={create.isPending}
            >
              {create.isPending ? "Creating…" : "Create team"}
            </Button>
          </div>
        </Card>

        <div>
          <SectionHeading
            title="All teams"
            count={teams.length}
            description="Teams can be linked to any number of rooms."
          />
          {listQ.isLoading ? (
            <Skeleton className="h-56 rounded-2xl" />
          ) : teams.length === 0 ? (
            <EmptyState
              title="No teams yet"
              hint="Create your first team on the left, then link it to a room."
              icon={<IconTeams size={22} />}
            />
          ) : (
            <DataTable head={["Team", "Project", "Members", "Actions"]}>
              {teams.map((team) => (
                <tr key={team.id}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink-100 text-[13px] font-medium text-ink-800">
                        {initials(team.name)}
                      </span>
                      <span className="font-medium text-ink-900">{team.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-ink-600">
                    {team.projectTitle ? (
                      <span className="line-clamp-1">{team.projectTitle}</span>
                    ) : (
                      <span className="text-[13px] text-ink-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-ink-50 px-2 py-1 text-[13px] font-medium text-ink-600 ring-1 ring-inset ring-line">
                      <IconUsers size={12} className="text-ink-400" />
                      {team._count?.members ?? 0}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <Button
                      variant="dangerGhost"
                      className="px-2 py-1.5 text-[13px]"
                      onClick={() => setConfirmDelete(team)}
                    >
                      Delete
                    </Button>
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
