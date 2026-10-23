import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, download, upload, ApiError } from "../../lib/api";
import { Button, Card, CheckRow, ConfirmDialog, DataTable, EmptyState, ErrorBox, LabelledInput, LabelledSelect, PageTitle, Skeleton } from "../../components/ui";
import { useToast } from "../../contexts/Toast";

interface Row {
  id: string;
  name: string;
  username: string;
  email: string;
  role: string;
  status: string;
  team?: { id: string; name: string } | null;
}

export default function Participants() {
  const qc = useQueryClient();
  const toast = useToast();
  const listQ = useQuery({ queryKey: ["participants"], queryFn: () => api<{ participants: Row[] }>("/participants") });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });

  const [form, setForm] = useState({ name: "", username: "", email: "", role: "PARTICIPANT", teamId: "" });
  const [formError, setFormError] = useState<string | null>(null);
  const [temp, setTemp] = useState<{ name: string; username: string; email: string; temporaryPassword: string } | null>(null);
  const [credentials, setCredentials] = useState<any[] | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [importing, setImporting] = useState<File | null>(null);
  const [allOrNothing, setAllOrNothing] = useState(false);
  const [preview, setPreview] = useState<any | null>(null);

  const create = useMutation({
    mutationFn: () => api("/participants", { body: { ...form, teamId: form.teamId || null } }),
    onSuccess: (res: any) => {
      setTemp({ name: res.participant.name, username: res.participant.username, email: res.participant.email, temporaryPassword: res.temporaryPassword });
      toast("Participant created", "success");
      setForm({ name: "", username: "", email: "", role: "PARTICIPANT", teamId: "" });
      qc.invalidateQueries({ queryKey: ["participants"] });
    },
    onError: (e) => setFormError(e instanceof ApiError ? e.message : "Failed to create"),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/participants/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["participants"] });
      toast("Participant updated", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Update failed", "error"),
  });

  const resetPw = useMutation({
    mutationFn: (id: string) => api<{ name: string; username: string; email: string; temporaryPassword: string }>(`/participants/${id}/reset-password`, { body: {} }),
    onSuccess: (res) => setTemp(res),
    onError: (e) => toast(e instanceof ApiError ? e.message : "Reset failed", "error"),
  });

  const del = useMutation({
    mutationFn: (id: string) => api(`/participants/${id}`, { method: "PATCH", body: { softDelete: true } }),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["participants"] });
      toast("Participant removed", "success");
    },
  });

  const runPreview = async (file: File) => {
    try {
      setPreview(await upload("/participants/import/preview", file));
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Import failed", "error");
    }
  };

  const runCommit = async () => {
    if (!importing) return;
    try {
      const res = await upload("/participants/import/commit", importing, { allOrNothing: String(allOrNothing) });
      setCredentials(res.credentials);
      setPreview(null);
      setImporting(null);
      toast(`Imported ${res.committed} participants (${res.skipped} skipped)`, "success");
      qc.invalidateQueries({ queryKey: ["participants"] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Commit failed", "error");
    }
  };

  const rows = listQ.data?.participants ?? [];

  return (
    <>
      <PageTitle
        title="Participants"
        subtitle="Add participants, bulk import from CSV/XLSX, and manage credentials"
        actions={
          <>
            <Button variant="secondary" onClick={async () => downloadBlob("/participants/import/template?format=csv")}>Download template</Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* add single */}
        <Card>
          <h2 className="mb-3 font-semibold">Add participant</h2>
          <div className="space-y-2">
            <LabelledInput label="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <LabelledInput label="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
            <LabelledInput label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <LabelledSelect label="Role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="PARTICIPANT">Participant</option>
              <option value="MODERATOR">Moderator</option>
              <option value="ADMIN">Admin</option>
            </LabelledSelect>
            <LabelledSelect label="Team (optional)" value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">No team (can vote for any team)</option>
              {teamsQ.data?.teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </LabelledSelect>
            {formError && <ErrorBox>{formError}</ErrorBox>}
            <Button onClick={() => { setFormError(null); if (!form.name || !form.username || !form.email) return setFormError("Name, username, and email are required"); create.mutate(); }} disabled={create.isPending}>
              Create & issue password
            </Button>
          </div>
        </Card>

        {/* bulk import */}
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Bulk import (CSV / XLSX)</h2>
          <label className="block text-sm">
            <span className="sr-only">Import file</span>
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              aria-label="Import file"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setImporting(f);
                setPreview(null);
                if (f) runPreview(f);
              }}
              className="block w-full text-sm"
            />
          </label>
          <div className="mt-2"><CheckRow label="All-or-nothing (only commit if every row is valid)" checked={allOrNothing} onChange={setAllOrNothing} /></div>
          {preview && (
            <div className="mt-3">
              <p className="text-sm">
                {preview.rowCount} rows · <span className="font-medium text-green-700">{preview.validCount} valid</span> ·{" "}
                <span className="font-medium text-red-700">{preview.errorCount} with errors</span>
              </p>
              <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50"><th className="px-2 py-1 text-left">Row</th><th className="px-2 py-1 text-left">Name</th><th className="px-2 py-1 text-left">Status</th></tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r: any) => (
                      <tr key={r.row} className="border-t border-gray-100">
                        <td className="px-2 py-1">{r.row}</td>
                        <td className="px-2 py-1">{r.name ?? "—"}</td>
                        <td className={`px-2 py-1 ${r.valid ? "text-green-700" : "text-red-700"}`}>
                          {r.valid ? "ok" : r.errors.join("; ")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Button className="mt-2" onClick={runCommit} disabled={preview.errorCount > 0 && allOrNothing}>
                Commit {preview.validCount} valid row{preview.validCount === 1 ? "" : "s"}
              </Button>
            </div>
          )}
          {(temp || credentials) && (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <p className="font-semibold text-amber-900">Temporary password — shown only once</p>
              {temp && <p className="mt-1">{temp.name} ({temp.username}): <code className="font-mono">{temp.temporaryPassword}</code></p>}
              {credentials && credentials.length > 0 && (
                <>
                  <ul className="mt-1 space-y-0.5">
                    {credentials.slice(0, 5).map((c: any) => (
                      <li key={c.username}>{c.username}: <code className="font-mono">{c.temporaryPassword}</code></li>
                    ))}
                  </ul>
                  <Button
                    variant="secondary"
                    className="mt-2"
                    onClick={async () => {
                      const b = await download(`/participants/credentials-sheet?format=csv&data=${btoa(JSON.stringify(credentials))}`);
                      saveBlob(b.blob, b.filename);
                    }}
                  >
                    Download credentials sheet
                  </Button>
                </>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* list */}
      <h2 className="mb-2 mt-6 font-semibold">All participants</h2>
      {listQ.isLoading ? (
        <Skeleton className="h-48" />
      ) : rows.length === 0 ? (
        <EmptyState title="No participants" hint="Add one above or import a file." />
      ) : (
        <DataTable head={["Name", "Username", "Email", "Role", "Team", "Status", "Actions"]}>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-gray-100">
              <td className="px-3 py-2 font-medium">{p.name}</td>
              <td className="px-3 py-2">{p.username}</td>
              <td className="px-3 py-2">{p.email}</td>
              <td className="px-3 py-2">{p.role.toLowerCase()}</td>
              <td className="px-3 py-2">{p.team?.name ?? "—"}</td>
              <td className="px-3 py-2">
                <span className={p.status === "ACTIVE" ? "text-green-700" : "text-red-700"}>{p.status.toLowerCase()}</span>
              </td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-1">
                  <Button variant="ghost" className="text-xs" onClick={() => patch.mutate({ id: p.id, body: { status: p.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" } })}>
                    {p.status === "ACTIVE" ? "Deactivate" : "Activate"}
                  </Button>
                  <Button variant="ghost" className="text-xs" onClick={() => resetPw.mutate(p.id)}>Reset password</Button>
                  <Button variant="ghost" className="text-xs text-red-700" onClick={() => setConfirmDelete(p)}>Delete</Button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete participant?"
        body={`${confirmDelete?.name} will be deactivated and removed from lists. Historical results are preserved.`}
        confirmLabel="Delete"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => confirmDelete && del.mutate(confirmDelete.id)}
      />
    </>
  );
}

async function downloadBlob(path: string) {
  const b = await download(path);
  saveBlob(b.blob, b.filename);
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
