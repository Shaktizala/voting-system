import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import {
  Button,
  buttonClass,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorBox,
  fieldClass,
  InfoBox,
  LabelledInput,
  LabelledSelect,
  PageTitle,
  SectionHeading,
  Skeleton,
  StatusBadge,
  Toggle,
} from "../../components/ui";
import { useToast } from "../../contexts/Toast";
import {
  IconCopy,
  IconChart,
  IconKey,
  IconLayers,
  IconLink,
  IconLock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconSettings,
  IconTeams,
  IconUsers,
} from "../../components/icons";

type Tab = "categories" | "teams" | "members" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "categories", label: "Categories", icon: <IconLayers size={16} /> },
  { id: "teams", label: "Teams", icon: <IconTeams size={16} /> },
  { id: "members", label: "Members", icon: <IconUsers size={16} /> },
  { id: "settings", label: "Settings", icon: <IconSettings size={16} /> },
];

export default function RoomConfigure() {
  const { roomId } = useParams<{ roomId: string }>();
  const qc = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("categories");

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
  const [memberSearch, setMemberSearch] = useState("");

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
  /**
   * The API validates `presentationOrder` as an integer >= 1, but older room
   * teams may be stored with the fallback order 0. Rebuild the payload from the
   * current (already ordered) list so we always send valid, sequential values
   * without changing the order teams are shown in.
   */
  const teamListPayload = (list: any[], extraTeamId?: string) => ({
    teams: [
      ...list.map((rt, index) => ({ teamId: rt.teamId, presentationOrder: index + 1 })),
      ...(extraTeamId ? [{ teamId: extraTeamId, presentationOrder: list.length + 1 }] : []),
    ],
  });

  const addRoomTeam = useMutation({
    mutationFn: () => api(`/rooms/${roomId}/teams`, { method: "PUT", body: teamListPayload(roomTeams, selectedTeam) }),
    onSuccess: () => {
      setSelectedTeam("");
      qc.invalidateQueries({ queryKey: ["roomTeams", roomId] });
      toast("Team linked", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Failed", "error"),
  });

  const removeRoomTeam = useMutation({
    mutationFn: (teamId: string) => api(`/rooms/${roomId}/teams`, { method: "PUT", body: teamListPayload(roomTeams.filter((rt) => rt.teamId !== teamId)) }),
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

  if (roomQ.isLoading || !room) return <Skeleton className="h-96 rounded-2xl" />;

  const joinUrl = `${window.location.origin}/join/${room.joinCode}`;

  const copyToClipboard = async (value: string, message: string) => {
    try {
      await navigator.clipboard?.writeText(value);
      toast(message, "success");
    } catch {
      toast("Could not copy to clipboard", "error");
    }
  };

  const availableParticipants = (participantsQ.data?.participants ?? []).filter(
    (p: any) => p.role !== "ADMIN" && !members.some((m: any) => m.userId === p.id)
  );
  const filteredAvailable = availableParticipants.filter((p: any) => {
    const query = memberSearch.trim().toLowerCase();
    if (!query) return true;
    return [p.name, p.username, p.email].some((value: string) => value.toLowerCase().includes(query));
  });

  return (
    <>
      <PageTitle
        eyebrow="Room configuration"
        title={room.name}
        subtitle={room.description ?? undefined}
        actions={
          <>
            <StatusBadge status={room.status} />
            <Link to="/admin/rooms" className={buttonClass("secondary", "py-2 text-xs")}>
              All rooms
            </Link>
          </>
        }
      />

      {/* share / actions */}
      <Card className="mb-4 overflow-hidden">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
              <IconKey size={12} />
              Join code
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <div className="rounded-2xl border border-dashed border-brand-200 bg-brand-50/60 px-5 py-3">
                <p data-testid="join-code" className="font-mono text-xl font-bold tracking-[0.2em] text-ink-950 sm:text-2xl">
                  {room.joinCode}
                </p>
              </div>
              <Button variant="secondary" className="py-2 text-xs" onClick={() => copyToClipboard(room.joinCode, "Join code copied")}>
                <IconCopy size={14} />
                Copy code
              </Button>
              <Button variant="secondary" className="py-2 text-xs" onClick={() => regenerateCode.mutate()}>
                <IconRefresh size={14} />
                Regenerate code
              </Button>
              <Button variant="ghost" className="py-2 text-xs" onClick={() => disableCode.mutate()}>
                Disable code
              </Button>
            </div>

            <p className="mt-5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">
              <IconLink size={12} />
              Invite link
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="min-w-0 max-w-full flex-1 truncate rounded-xl border border-line bg-ink-50/60 px-3.5 py-2.5 font-mono text-[11px] text-ink-600">
                {joinUrl}
              </p>
              <Button variant="secondary" className="py-2 text-xs" onClick={() => copyToClipboard(joinUrl, "Invite link copied")}>
                <IconCopy size={14} />
                Copy link
              </Button>
            </div>
          </div>

          <div className="rounded-2xl border border-line bg-ink-50/50 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Room actions</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {room.status === "DRAFT" && (
                <Button disabled={setStatus.isPending} onClick={() => setStatus.mutate("ACTIVE")}>
                  Activate room
                </Button>
              )}
              <Link to={`/room/${roomId}`} className={buttonClass("primary", "py-2.5 text-xs")}>
                Open live dashboard →
              </Link>
              <Link to={`/room/${roomId}/results`} className={buttonClass("secondary", "py-2.5 text-xs")}>
                <IconChart size={14} />
                View results
              </Link>
            </div>
            <div className="mt-4 flex items-start gap-2 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-500">
              <IconLock size={14} className="mt-0.5 shrink-0 text-ink-400" />
              <span>
                The code controls who can join. Activating the room allows voting to open on the
                live dashboard.
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* tabs */}
      <div
        role="tablist"
        aria-label="Room configuration sections"
        className="mb-5 flex gap-1 overflow-x-auto rounded-2xl border border-line bg-white p-1.5 shadow-card scrollbar-slim"
      >
        {TABS.map((item) => {
          const counts: Partial<Record<Tab, number>> = {
            categories: categories.length,
            teams: roomTeams.length,
            members: members.length,
          };
          return (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-[13px] font-semibold transition-all duration-200 ${
                tab === item.id
                  ? "bg-ink-950 text-white shadow-sm"
                  : "text-ink-500 hover:bg-ink-50 hover:text-ink-800"
              }`}
            >
              <span className={tab === item.id ? "text-brand-300" : "text-ink-400"}>{item.icon}</span>
              {item.label}
              {counts[item.id] !== undefined && item.id !== "settings" && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    tab === item.id ? "bg-white/15 text-white" : "bg-ink-100 text-ink-500"
                  }`}
                >
                  {counts[item.id]}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab === "categories" && (
        <TwoCols>
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
                <IconPlus size={19} />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-ink-900">Add category</h2>
                <p className="mt-0.5 text-xs text-ink-500">Each category becomes one score on the ballot.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <LabelledInput label="Category name" value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="e.g. Innovation" />
              <LabelledInput label="Description (shown to voters)" value={cat.description} onChange={(e) => setCat({ ...cat, description: e.target.value })} placeholder="What should voters consider?" />
              <div className="grid grid-cols-2 gap-3">
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
              {hasVotes && (
                <ErrorBox>
                  Categories are locked — votes already exist. Start a new configuration version
                  below to change scoring.
                </ErrorBox>
              )}
              <Button
                className="w-full"
                onClick={() => (!cat.name.trim() ? setError("Name is required") : addCat.mutate())}
                disabled={addCat.isPending}
              >
                {addCat.isPending ? "Adding…" : "Add category"}
              </Button>
            </div>
          </Card>

          <div>
            <SectionHeading
              title="Categories"
              count={categories.length}
              description="Voters score each category on this range."
              action={
                hasVotes ? (
                  <Button variant="secondary" className="py-2 text-xs" onClick={() => setConfirmNewVersion(true)}>
                    Start new config version
                  </Button>
                ) : undefined
              }
            />
            {categories.length === 0 ? (
              <EmptyState title="No categories" hint="Voters need at least one category." icon={<IconLayers size={22} />} />
            ) : (
              <DataTable head={["Order", "Name", "Range", "Step", "Weight", "Required", ""]}>
                {categories.map((category, index) => (
                  <CategoryRow
                    key={category.id}
                    c={category}
                    index={index}
                    locked={hasVotes}
                    onSave={(body) => updateCat.mutate({ id: category.id, body })}
                    onRemove={() => setConfirmRemove(category)}
                    roomId={roomId!}
                  />
                ))}
              </DataTable>
            )}
          </div>
        </TwoCols>
      )}

      {tab === "teams" && (
        <TwoCols>
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-jade-50 text-jade-600 ring-1 ring-inset ring-jade-100">
                <IconTeams size={19} />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-ink-900">Link a team</h2>
                <p className="mt-0.5 text-xs text-ink-500">Link teams to this room in presentation order.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <LabelledSelect label="Team" value={selectedTeam} onChange={(e) => setSelectedTeam(e.target.value)}>
                <option value="">Select team…</option>
                {teamsQ.data?.teams.filter((team) => !roomTeams.some((roomTeam) => roomTeam.teamId === team.id)).map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </LabelledSelect>
              <Button className="w-full" disabled={!selectedTeam} onClick={() => addRoomTeam.mutate()}>
                Add to room
              </Button>
            </div>
            <div className="mt-4 rounded-xl border border-line bg-ink-50/50 px-3.5 py-3 text-[11px] leading-relaxed text-ink-500">
              Presentation order follows the order teams are added. You can unlink a team any time
              before its round starts.
            </div>
          </Card>
          <div>
            <SectionHeading title="Linked teams" count={roomTeams.length} description="Teams appear on the ballot in this order." />
            {roomTeams.length === 0 ? (
              <EmptyState title="No teams linked" hint="Choose a team on the left to add it to this room." icon={<IconTeams size={22} />} />
            ) : (
              <DataTable head={["#", "Team", "Project", ""]}>
                {roomTeams.map((roomTeam, index) => (
                  <tr key={roomTeam.id}>
                    <td className="px-4 py-3.5">
                      <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink-100 text-[11px] font-bold text-ink-600">
                        {index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-medium text-ink-900">{roomTeam.team.name}</td>
                    <td className="px-4 py-3.5 text-ink-600">{roomTeam.team.projectTitle ?? "—"}</td>
                    <td className="px-4 py-3.5">
                      <Button variant="dangerGhost" className="px-2 py-1.5 text-xs" onClick={() => removeRoomTeam.mutate(roomTeam.teamId)}>
                        Unlink
                      </Button>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </TwoCols>
      )}

      {tab === "members" && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ocean-50 text-ocean-600 ring-1 ring-inset ring-ocean-100">
                <IconUsers size={19} />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-ink-900">Assign participants</h2>
                <p className="mt-0.5 text-xs text-ink-500">Members inherit their org team unless overridden.</p>
              </div>
            </div>
            <div className="relative mt-4">
              <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search people…"
                aria-label="Search participants to assign"
                className={`${fieldClass} py-2 pl-9`}
              />
            </div>
            <div className="mt-3 max-h-80 space-y-1.5 overflow-auto pr-1 scrollbar-slim">
              {participantsQ.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-12" />)}
                </div>
              ) : filteredAvailable.length === 0 ? (
                <p className="rounded-xl border border-dashed border-ink-200 px-3 py-6 text-center text-xs text-ink-400">
                  {availableParticipants.length === 0 ? "Everyone available is already assigned." : "No matching participants."}
                </p>
              ) : (
                filteredAvailable.map((participant: any) => (
                  <div key={participant.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-white p-2.5 text-sm transition-colors hover:border-ink-200">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-ink-800">{participant.name}</p>
                      <p className="truncate font-mono text-[10px] text-ink-400">@{participant.username}</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button variant="soft" className="px-2 py-1.5 text-[11px]" onClick={() => addMember(participant.id, "PARTICIPANT", participant.team?.id)}>
                        Add
                      </Button>
                      <Button variant="ghost" className="px-2 py-1.5 text-[11px]" onClick={() => addMember(participant.id, "MODERATOR", undefined)}>
                        As moderator
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <p className="mt-3 flex items-start gap-1.5 rounded-xl bg-ink-50/60 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
              <IconLock size={13} className="mt-0.5 shrink-0 text-ink-400" />
              Self-votes are blocked automatically. Participants without a team can vote for any team.
            </p>
          </Card>

          <div>
            <SectionHeading title="Room members" count={members.length} description="Set a room-specific team override if needed." />
            {members.length === 0 ? (
              <EmptyState title="No members yet" hint="Assign participants from the panel on the left." icon={<IconUsers size={22} />} />
            ) : (
              <DataTable head={["Participant", "Room role", "Team in this room", "Status"]}>
                {members.map((member: any) => (
                  <tr key={member.userId}>
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-ink-900">{member.user.name}</p>
                      <p className="font-mono text-[10px] text-ink-400">@{member.user.username}</p>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${
                        member.role === "MODERATOR"
                          ? "bg-ocean-50 text-ocean-700 ring-ocean-200"
                          : "bg-ink-100 text-ink-600 ring-ink-200"
                      }`}>
                        {member.role.toLowerCase()}
                      </span>
                    </td>
                    <td className="min-w-[12rem] px-4 py-3.5">
                      <LabelledSelect
                        label=""
                        value={member.team?.id ?? ""}
                        onChange={(e) => setMemberTeam(member.userId, e.target.value || null)}
                      >
                        <option value="">No team (votes for any team)</option>
                        {roomTeams.map((roomTeam) => (
                          <option key={roomTeam.teamId} value={roomTeam.teamId}>{roomTeam.team.name}</option>
                        ))}
                      </LabelledSelect>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-600">
                        <span className={`h-1.5 w-1.5 rounded-full ${member.user.status === "ACTIVE" ? "bg-jade-500" : "bg-coral-500"}`} />
                        {member.user.status.toLowerCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && room && (
        <div className="grid max-w-3xl grid-cols-1 gap-4">
          <Card>
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-100 text-ink-600 ring-1 ring-inset ring-ink-200">
                <IconSettings size={19} />
              </span>
              <div>
                <h2 className="font-display text-base font-semibold text-ink-900">Room settings</h2>
                <p className="mt-0.5 text-xs text-ink-500">Changes save immediately and are audited.</p>
              </div>
            </div>
            <div className="mt-5 space-y-3">
              <Toggle
                label="Participants may edit their vote while voting is open"
                description="Voters can revise their scores until the round closes."
                checked={room.settings.allowVoteEdit}
                onChange={(value) => saveRoom.mutate({ settings: { allowVoteEdit: value } })}
              />
              <Toggle
                label="Admins can see who voted (voter identity)"
                description="Turn this off for anonymous monitoring in the progress panel."
                checked={room.settings.adminCanSeeVoterIdentity}
                onChange={(value) => saveRoom.mutate({ settings: { adminCanSeeVoterIdentity: value } })}
              />
              <Toggle
                label="Show live results before publishing"
                description="Participants can see results as rounds close, before formal publication."
                checked={room.settings.liveResults}
                onChange={(value) => saveRoom.mutate({ settings: { liveResults: value } })}
              />
            </div>
          </Card>

          <Card>
            <h2 className="font-display text-base font-semibold text-ink-900">Scoring</h2>
            <p className="mt-0.5 text-xs text-ink-500">How votes are aggregated into final scores.</p>
            <div className="mt-4 space-y-3">
              <NumberSetting
                label="Minimum votes for a team's score to count (0 = no threshold)"
                value={room.settings.minVotesThreshold}
                onChange={(value) => saveRoom.mutate({ settings: { minVotesThreshold: value } })}
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
            <div className="mt-4">
              <InfoBox>
                Structural scoring changes after votes exist require a new configuration version from
                the Categories tab. Existing votes keep their historical snapshots.
              </InfoBox>
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
  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.45fr)]">
      {children}
    </div>
  );
}

function CategoryRow({
  c,
  index,
  locked,
  onSave,
  onRemove,
  roomId,
}: {
  c: any;
  index: number;
  locked: boolean;
  onSave: (body: any) => void;
  onRemove: () => void;
  roomId: string;
}) {
  const qc = useQueryClient();
  const toast = useToast();
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
      await qc.invalidateQueries({ queryKey: ["categories", roomId] });
    } catch (e) {
      toast(e instanceof ApiError ? e.message : "Could not reorder", "error");
    } finally {
      setOrderSaving(false);
    }
  };

  if (!editing) {
    return (
      <tr>
        <td className="px-4 py-3.5">
          <div className="flex items-center gap-1">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-ink-100 text-[10px] font-bold text-ink-500">
              {index + 1}
            </span>
            <div className="ml-1 flex flex-col">
              <button
                type="button"
                disabled={orderSaving || index === 0}
                onClick={() => move(-1)}
                aria-label={`Move ${c.name} up`}
                className="rounded px-1 text-[9px] leading-3 text-ink-400 transition hover:text-ink-800 disabled:opacity-30"
              >
                ▲
              </button>
              <button
                type="button"
                disabled={orderSaving}
                onClick={() => move(1)}
                aria-label={`Move ${c.name} down`}
                className="rounded px-1 text-[9px] leading-3 text-ink-400 transition hover:text-ink-800 disabled:opacity-30"
              >
                ▼
              </button>
            </div>
          </div>
        </td>
        <td className="px-4 py-3.5">
          <p className="font-medium text-ink-900">{c.name}</p>
          {c.description && <p className="mt-0.5 line-clamp-1 text-xs text-ink-500">{c.description}</p>}
        </td>
        <td className="px-4 py-3.5">
          <span className="rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[11px] text-ink-600 ring-1 ring-inset ring-line">
            {c.minScore}–{c.maxScore}
          </span>
        </td>
        <td className="px-4 py-3.5 text-ink-600">{c.step}</td>
        <td className="px-4 py-3.5 text-ink-600">{Number(c.weight)}</td>
        <td className="px-4 py-3.5">
          <span className={`text-[11px] font-medium ${c.isRequired ? "text-ink-700" : "text-ink-400"}`}>
            {c.isRequired ? "Required" : "Optional"}
          </span>
        </td>
        <td className="px-4 py-3.5">
          <div className="flex gap-0.5">
            <Button variant="ghost" className="px-2 py-1.5 text-xs" onClick={() => setEditing(true)} disabled={locked}>
              Edit
            </Button>
            <Button variant="dangerGhost" className="px-2 py-1.5 text-xs" onClick={onRemove}>
              Remove
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="bg-brand-50/50">
      <td className="px-4 py-3.5 text-xs font-semibold text-ink-500">{index + 1}</td>
      <td className="px-4 py-3.5">
        <input
          className={`${fieldClass} mb-1.5 px-2.5 py-1.5 text-xs`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Category name"
        />
        <input
          className={`${fieldClass} px-2.5 py-1.5 text-xs`}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Description"
          aria-label="Category description"
        />
      </td>
      <td className="px-4 py-3.5">
        <span className="font-mono text-[11px] text-ink-600">{c.minScore}–{c.maxScore}</span>
        {locked && <span className="mt-0.5 block text-[10px] text-ink-400">locked</span>}
      </td>
      <td className="px-4 py-3.5 text-ink-600">{c.step}</td>
      <td className="px-4 py-3.5 text-ink-600">{Number(c.weight)}</td>
      <td className="px-4 py-3.5 text-[11px] text-ink-500">{c.isRequired ? "Required" : "Optional"}</td>
      <td className="px-4 py-3.5">
        <div className="flex gap-1">
          <Button
            className="px-2.5 py-1.5 text-xs"
            onClick={() => {
              onSave({ name, description: desc });
              setEditing(false);
            }}
          >
            Save
          </Button>
          <Button
            variant="secondary"
            className="px-2.5 py-1.5 text-xs"
            onClick={() => {
              setName(c.name);
              setDesc(c.description ?? "");
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function CheckSetting({ label, value, onToggle }: { label: string; value: boolean; onToggle: (v: boolean) => void }) {
  return <Toggle label={label} checked={value} onChange={onToggle} />;
}

function NumberSetting({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="block rounded-xl border border-line bg-white px-4 py-3.5">
      <span className="text-sm font-medium text-ink-800">{label}</span>
      <input
        type="number"
        className={`${fieldClass} mt-2 w-28 px-3 py-2`}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
