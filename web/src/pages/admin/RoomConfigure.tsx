import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import { Button, Card, DataTable, ErrorBox, LabelledInput, LabelledSelect, PageTitle, StatusBadge, ConfirmDialog, Skeleton, EmptyState } from "../../components/ui";
import { useToast } from "../../contexts/Toast";

export default function RoomConfigure() {
  const { roomId } = useParams<{ roomId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<"categories" | "teams" | "members" | "settings">("categories");

  const roomQ = useQuery({ queryKey: ["room", roomId], queryFn: () => api<{ room: any; joinUrl: string }>(`/rooms/${roomId}`) });
  const catsQ = useQuery({ queryKey: ["categories", roomId], queryFn: () => api<{ categories: any[] }>(`/rooms/${roomId}/categories`) });
  const roomTeamsQ = useQuery({ queryKey: ["roomTeams", roomId], queryFn: () => api<{ roomTeams: any[] }>(`/rooms/${roomId}/teams`) });
  const membersQ = useQuery({ queryKey: ["members", roomId], queryFn: () => api<{ members: any[] }>(`/rooms/${roomId}/members`) });
  const participantsQ = useQuery({ queryKey: ["participants"], queryFn: () => api<{ participants: any[] }>("/participants") });
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => api<{ teams: any[] }>("/teams") });

  const [cat, setCat] = useState({ name: "", description: "", minScore: 1, maxScore: 10, step: 1, weight: 1, isRequired: true });
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<any | null>(null);
  const [confirmNewVersion, setConfirmNewVersion] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState("");

  const room = roomQ.data?.room;
  const categories = catsQ.data?.categories ?? [];
  const roomTeams = roomTeamsQ.data?.roomTeams ?? [];
  const members = membersQ.data?.members ?? [];
  const rounds = useQuery({ queryKey: ["rounds", roomId], queryFn: () => api<{ rounds: any[] }>(`/rooms/${roomId}/rounds`) });
  const hasVotes = (rounds.data?.rounds ?? []).some((r) => (r._count?.votes ?? 0) > 0);
  const configLocked = hasVotes || room?.status === "CLOSED";

  /* --------------------------- category options --------------------------- */
  const addCat = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/categories`, { body: cat }),
    onSuccess: () => {
      setCat({ name: "", description: "", minScore: 1, maxScore: 10, step: 1, weight: 1, isRequired: true });
      setError(null);
      qc.invalidateQueries({ queryKey: ["categories", roomId] });
      toast("Category added", "success");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Failed"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // categories with votes are deactivated; fresh ones are hard-deleted
      try {
        return await api(`/categories/${id}`, { method: "PATCH", body: { active: false } });
      } catch {
        return undefined;
      }
    },
    onSuccess: () => {
      setConfirmRemove(null);
      qc.invalidateQueries({ queryKey: ["categories", roomId] });
      toast("Category removed (archived if it already had votes)", "success");
    },
  });

  const updateCat = useMutation({
    mutationFn: ({ id, body }: { id: string; body: any }) => api(`/categories/${id}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["categories", roomId] });
      toast("Category updated", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Update failed", "error"),
  });

  const newVersion = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/config/new-version`, { body: { reason: "Adjusted scoring config after votes" } }),
    onSuccess: () => {
      setConfirmNewVersion(false);
      qc.invalidateQueries({ queryKey: ["categories", roomId] });
      toast("New configuration version started (applies to future rounds)", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  /* ------------------------------ room teams ------------------------------ */
  const addRoomTeam = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/teams`, { method: "PUT", body: { teams: [...roomTeams.map((rt) => ({ teamId: rt.teamId, presentationOrder: rt.presentationOrder })), { teamId: selectedTeam, presentationOrder: roomTeams.length + 1 }] } }),
    onSuccess: () => {
      setSelectedTeam("");
      qc.invalidateQueries({ queryKey: ["roomTeams", roomId] });
      toast("Team linked", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  const removeRoomTeam = useMutation({
    mutationFn: (teamId: string) => api(`/rooms/${roomId}/teams`, { method: "PUT", body: { teams: roomTeams.filter((rt) => rt.teamId !== teamId).map((rt) => ({ teamId: rt.teamId, presentationOrder: rt.presentationOrder })) } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["roomTeams", roomId] });
      toast("Team unlinked", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  /* ------------------------------- members -------------------------------- */
  const setMembers = useMutation({
    mutationFn: (body: any) => api(`/rooms/${roomId}/members`, { method: "PUT", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members", roomId] });
      toast("Room members updated", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  const addMember = (userId: string, role: string, teamId?: string) =>
    setMembers.mutate({ members: [...members.map((m) => ({ userId: m.userId, role: m.role, teamId: m.teamId === undefined ? null : m.teamId })), { userId, role, ...(teamId ? { teamId } : {}) }] });

  const setMemberTeam = (userId: string, teamId: string | null) =>
    setMembers.mutate({ members: members.map((m) => (m.userId === userId ? { userId: m.userId, role: m.role, teamId } : { userId: m.userId, role: m.role, teamId: m.teamId === undefined ? null : m.teamId })) });

  /* ------------------------------- settings ------------------------------- */
  const saveRoom = useMutation({
    mutationFn: (body: any) => api(`/rooms/${roomId}`, { method: "PATCH", body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      toast("Room settings saved", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  const regenerateCode = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/join-code/regenerate`, { body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      toast("Join code regenerated", "success");
    },
  });

  const disableCode = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/join-code/disable`, { body: {} }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      toast("Join code disabled", "success");
    },
  });

  const setStatus = useMutation({
    mutationFn: (status: string) => api(`/rooms/${roomId}/status`, { body: { status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["room", roomId] });
      qc.invalidateQueries({ queryKey: ["rooms"] });
      toast(`Room ${room?.status === "DRAFT" ? "activated" : "updated"}`, "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  if (roomQ.isLoading || !room) return <Skeleton className="h-96" />;

  const joinUrl = `${window.location.origin}/join/${room.joinCode}`;

  return (
    <>
      <PageTitle
        title={room.name}
        subtitle={room.description ?? undefined}
        actions={
          <>
            <StatusBadge status={room.status} />
            <Link to="/admin/rooms" className="text-sm text-blue-700 hover:underline">All rooms</Link>
          </>
        }
      />

      {/* join code + key actions */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <p className="text-sm text-gray-500">Join code</p>
            <p data-testid="join-code" className="font-mono text-xl font-bold tracking-widest">{room.joinCode}</p>
          </div>
          <div className="min-w-0">
            <p className="text-sm text-gray-500">Invite link</p>
            <p className="max-w-xs truncate font-mono text-xs">{joinUrl}</p>
          </div>
          <Button variant="secondary" className="text-xs" onClick={() => navigator.clipboard?.writeText(joinUrl)}>Copy link</Button>
          <Button variant="secondary" className="text-xs" onClick={() => regenerateCode.mutate()}>Regenerate code</Button>
          <Button variant="secondary" className="text-xs" onClick={() => disableCode.mutate()}>Disable code</Button>
          {room.status === "DRAFT" && (
            <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate("ACTIVE")}>Activate room</Button>
          )}
          <Link to={`/room/${roomId}`} className="text-sm font-medium text-blue-700 hover:underline">Open live dashboard →</Link>
        </div>
      </Card>

      {/* tabs */}
      <div className="mb-3 flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1" role="tablist">
        {(["categories", "teams", "members", "settings"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium capitalize ${tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "categories" && (
        <TwoCols>
          <Card>
            <h2 className="mb-3 font-semibold">Add category</h2>
            <div className="space-y-2">
              <LabelledInput label="Category name" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} />
              <LabelledInput label="Description (shown to voters)" value={cat.description} onChange={(e) => setCat({ ...cat, description: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <LabelledInput label="Min score" type="number" value={cat.minScore} onChange={(e) => setCat({ ...cat, minScore: Number(e.target.value) })} />
                <LabelledInput label="Max score" type="number" value={cat.maxScore} onChange={(e) => setCat({ ...cat, maxScore: Number(e.target.value) })} />
                <LabelledInput label="Step" type="number" value={cat.step} onChange={(e) => setCat({ ...cat, step: Number(e.target.value) })} />
                <LabelledInput label="Weight" type="number" step="0.1" value={cat.weight} onChange={(e) => setCat({ ...cat, weight: Number(e.target.value) })} />
              </div>
              <LabelledSelect label="Required" value={cat.isRequired ? "yes" : "no"} onChange={(e) => setCat({ ...cat, isRequired: e.target.value === "yes" })}>
                <option value="yes">Required</option>
                <option value="no">Optional</option>
              </LabelledSelect>
              {error && <ErrorBox>{error}</ErrorBox>}
              {hasVotes && <ErrorBox>Categories are locked — votes already exist. Start a new configuration version below to change scoring.</ErrorBox>}
              <Button onClick={() => (!cat.name.trim() ? setError("Name is required") : addCat.mutate())} disabled={addCat.isPending}>
                Add category
              </Button>
            </div>
          </Card>

          <div>
            <Card className="mb-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Categories ({categories.length})</h2>
                {hasVotes && <Button variant="secondary" className="text-xs" onClick={() => setConfirmNewVersion(true)}>Start new config version</Button>}
              </div>
            </Card>
            {categories.length === 0 ? (
              <EmptyState title="No categories" hint="Voters need at least one category." />
            ) : (
              <DataTable head={["Order", "Name", "Range", "Step", "Weight", "Required", ""]}>
                {categories.map((c, i) => (
                  <CategoryRow key={c.id} c={c} index={i} locked={hasVotes} onSave={(body) => updateCat.mutate({ id: c.id, body })} onRemove={() => setConfirmRemove(c)} roomId={roomId!} />
                ))}
              </DataTable>
            )}
          </div>
        </TwoCols>
      )}

      {tab === "teams" && (
        <TwoCols>
          <Card>
            <h2 className="mb-3 font-semibold">Link a team to this room</h2>
            <LabelledSelect label="Team" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
              <option value="">Select team…</option>
              {teamsQ.data?.teams.filter((t) => !roomTeams.some((rt) => rt.teamId === t.id)).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </LabelledSelect>
            <Button className="mt-2" disabled={!selectedTeam} onClick={() => addRoomTeam.mutate()}>Add to room</Button>
          </Card>
          <div>
            <Card className="mb-3"><h2 className="font-semibold">Linked teams &amp; presentation order</h2></Card>
            {roomTeams.length === 0 ? (
              <EmptyState title="No teams linked" />
            ) : (
              <DataTable head={["#", "Team", "Project", ""]}>
                {roomTeams.map((rt, i) => (
                  <tr key={rt.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2 font-medium">{rt.team.name}</td>
                    <td className="px-3 py-2 text-gray-600">{rt.team.projectTitle ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Button variant="ghost" className="text-xs text-red-700" onClick={() => removeRoomTeam.mutate(rt.teamId)}>Unlink</Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </TwoCols>
      )}

      {tab === "members" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <h2 className="mb-3 font-semibold">Assign participants</h2>
            <p className="mb-2 text-sm text-gray-500">Participants inherit their organization team unless overridden here. Self-votes are blocked automatically.</p>
            <div className="max-h-80 space-y-1 overflow-auto">
              {participantsQ.data?.participants
                .filter((p: any) => p.role !== "ADMIN" && !members.some((m: any) => m.userId === p.id))
                .map((p: any) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 p-2 text-sm">
                    <span>{p.name}</span>
                    <div className="flex gap-1">
                      <Button variant="ghost" className="text-xs" onClick={() => addMember(p.id, "PARTICIPANT", p.team?.id)}>Add</Button>
                      <Button variant="ghost" className="text-xs" onClick={() => addMember(p.id, "MODERATOR", undefined)}>As moderator</Button>
                    </div>
                  </div>
                ))}
            </div>
          </Card>
          <div className="lg:col-span-2">
            <Card className="mb-3"><h2 className="font-semibold">Room members ({members.length})</h2></Card>
            {members.length === 0 ? (
              <EmptyState title="No members yet" hint="Assign participants from the panel on the left." />
            ) : (
              <DataTable head={["Participant", "Room role", "Team in this room", "Status"]}>
              {members.map((m: any) => (
                <tr key={m.userId} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-medium">
                    {m.user.name}
                    <span className="ml-1 text-xs text-gray-500">@{m.user.username}</span>
                  </td>
                  <td className="px-3 py-2">{m.role.toLowerCase()}</td>
                  <td className="px-3 py-2">
                    <LabelledSelect
                      label=""
                      value={m.team?.id ?? ""}
                      onChange={(e) => {
                        const v = (e.target as HTMLSelectElement).value;
                        setMemberTeam(m.userId, v || null);
                      }}
                    >
                      <option value="">— no team (votes for any team) —</option>
                      {roomTeams.map((rt) => <option key={rt.teamId} value={rt.teamId}>{rt.team.name}</option>)}
                    </LabelledSelect>
                  </td>
                  <td className="px-3 py-2">
                    <span className={m.user.status === "ACTIVE" ? "text-green-700" : "text-red-700"}>{m.user.status.toLowerCase()}</span>
                  </td>
                </tr>
              ))}
              </DataTable>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && room && (
        <div className="grid max-w-2xl grid-cols-1 gap-4">
          <Card>
            <h2 className="mb-3 font-semibold">Room settings</h2>
            <div className="space-y-3">
              <CheckSetting label="Participants may edit their vote while voting is open" value={room.settings.allowVoteEdit} onToggle={(v) => saveRoom.mutate({ settings: { allowVoteEdit: v } })} />
              <CheckSetting label="Admins can see who voted (voter identity)" value={room.settings.adminCanSeeVoterIdentity} onToggle={(v) => saveRoom.mutate({ settings: { adminCanSeeVoterIdentity: v } })} />
              <CheckSetting label="Show live results before publishing" value={room.settings.liveResults} onToggle={(v) => saveRoom.mutate({ settings: { liveResults: v } })} />
              <NumberSetting
                label="Minimum votes for a team's score to count (0 = no threshold)"
                value={room.settings.minVotesThreshold}
                onChange={(v) => saveRoom.mutate({ settings: { minVotesThreshold: v } })}
              />
              <LabelledSelect
                label="Aggregation method"
                value={room.settings.aggregationMethod}
                onChange={(e) => saveRoom.mutate({ settings: { aggregationMethod: e.target.value } })}
              >
                <option value="weighted_mean">Weighted mean (explicit tie-break by votes)</option>
                <option value="trimmed_mean">Trimmed mean (drops best &amp; worst per category)</option>
              </LabelledSelect>
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmNewVersion}
        title="Start a new configuration version?"
        body="An unchangeable copy of the current categories becomes the configuration for all future rounds. Existing votes keep their historical snapshots."
        confirmLabel="Start new version"
        onCancel={() => setConfirmNewVersion(false)}
        onConfirm={() => newVersion.mutate()}
      />

      <ConfirmDialog
        open={!!confirmRemove}
        title="Remove category?"
        body="Recent votes that already scored this category keep their data under the old configuration."
        danger
        confirmLabel="Remove"
        onCancel={() => setConfirmRemove(null)}
        onConfirm={() => confirmRemove && remove.mutate(confirmRemove.id)}
      />
    </>
  );
}

/* -------------------------------- helpers -------------------------------- */
function TwoCols({ children }: { children: React.ReactNode }) {
  /* left column (form card) = 1 track, right column (list) takes the rest.
     On small screens it collapses to one stacked column. */
  return <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">{children}</div>;
}

function CategoryRow({ c, index, locked, onSave, onRemove, roomId }: { c: any; index: number; locked: boolean; onSave: (body: any) => void; onRemove: () => void; roomId: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(c.name);
  const [desc, setDesc] = useState(c.description ?? "");
  const [orderSaving, setOrderSaving] = useState(false);

  const move = async (dir: -1 | 1) => {
    setOrderSaving(true);
    try {
      const res = await api<{ categories: any[] }>(`/rooms/${roomId}/categories`);
      const ids = res.categories.map((x) => x.id);
      const i = ids.indexOf(c.id);
      const j = i + dir;
      if (j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      await api(`/rooms/${roomId}/categories/reorder`, { body: { order: ids } });
      window.location.reload(); // keep list order simple
    } finally {
      setOrderSaving(false);
    }
  };

  if (!editing) {
    return (
      <tr className="border-t border-gray-100">
        <td className="px-3 py-2">
          <span className="mr-2">{index + 1}</span>
          <Button variant="ghost" className="px-1 text-xs" disabled={orderSaving} onClick={() => move(-1)} aria-label={`Move ${c.name} up`}>↑</Button>
          <Button variant="ghost" className="px-1 text-xs" disabled={orderSaving} onClick={() => move(1)} aria-label={`Move ${c.name} down`}>↓</Button>
        </td>
        <td className="px-3 py-2 font-medium">
          {c.name}
          {c.description && <p className="text-xs text-gray-500">{c.description}</p>}
        </td>
        <td className="px-3 py-2">{c.minScore}–{c.maxScore}</td>
        <td className="px-3 py-2">{c.step}</td>
        <td className="px-3 py-2">{Number(c.weight)}</td>
        <td className="px-3 py-2">{c.isRequired ? "yes" : "optional"}</td>
        <td className="px-3 py-2">
          <div className="flex gap-1">
            <Button variant="ghost" className="text-xs" onClick={() => setEditing(true)} disabled={locked}>Edit</Button>
            <Button variant="ghost" className="text-xs text-red-700" onClick={onRemove}>Remove</Button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-gray-100 bg-blue-50">
      <td className="px-3 py-2">{index + 1}</td>
      <td className="px-3 py-2">
        <input className="mb-1 w-full rounded border px-2 py-1 text-sm" value={name} onChange={(e) => setName(e.target.value)} aria-label="Category name" />
        <input className="w-full rounded border px-2 py-1 text-sm" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" aria-label="Category description" />
      </td>
      <td className="px-3 py-2">{c.minScore}–{c.maxScore}{locked && <span className="block text-xs text-gray-500">locked</span>}</td>
      <td className="px-3 py-2">{c.step}</td>
      <td className="px-3 py-2">{Number(c.weight)}</td>
      <td className="px-3 py-2">{c.isRequired ? "yes" : "optional"}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <Button className="text-xs" onClick={() => { onSave({ name, description: desc }); setEditing(false); }}>Save</Button>
          <Button variant="secondary" className="text-xs" onClick={() => { setName(c.name); setDesc(c.description ?? ""); setEditing(false); }}>Cancel</Button>
        </div>
      </td>
    </tr>
  );
}

export function CheckSetting({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-3 rounded-lg border border-gray-200 p-3">
      <span className="text-sm">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onToggle(e.target.checked)} className="mt-1 h-4 w-4" aria-label={label} />
    </label>
  );
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="rounded-lg border border-gray-200 p-3 block">
      <span className="text-sm">{label}</span>
      <input type="number" className="mt-1 w-24 rounded border px-2 py-1 text-sm" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}
