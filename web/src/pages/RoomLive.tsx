import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { useRealtime } from "../contexts/Realtime";
import { useToast } from "../contexts/Toast";
import { Button, Card, ConfirmDialog, DataTable, ErrorBox, LabelledSelect, Skeleton, StatusBadge } from "../components/ui";

interface Snapshot {
  room: { id: string; name: string; status: string; settings: any; publishedAt: string | null; memberCount: number };
  teams: { teamId: string; name: string; presentationOrder: number }[];
  categories: { id: string; name: string; description: string | null; minScore: number; maxScore: number; step: number; weight: string; isRequired: boolean }[];
  rounds: { id: string; teamId: string; status: string; openedAt: string | null; closedAt: string | null; createdAt?: string }[];
  membership: { role: string; teamId: string | null } | null;
}

export default function RoomLive() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { join, connected, socketRef } = useRealtime();
  const qc = useQueryClient();
  const toast = useToast();

  const snapshotQ = useQuery({
    queryKey: ["snapshot", roomId],
    queryFn: () => api<Snapshot>(`/rooms/${roomId}/full`),
    refetchInterval: 8000, // polling fallback when the realtime socket drops
    refetchIntervalInBackground: true, // projector/participant tabs are often unfocused
  });

  // socket wiring: join room channel and re-sync on every relevant event
  useEffect(() => {
    if (!roomId || !snapshotQ.data) return;
    join(roomId);
    const socket = socketRef.current;
    if (!socket) return;
    const events = ["room:state_changed", "team:presenting_changed", "voting:opened", "voting:paused", "voting:resumed", "voting:closed", "voting:resumed", "vote:submitted", "results:published"];
    events.forEach((ev) => socket.on(ev, () => qc.invalidateQueries({ queryKey: ["snapshot", roomId] })));
    return () => events.forEach((ev) => socket.off(ev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, snapshotQ.data, join, socketRef, qc]);

  if (snapshotQ.isLoading || !snapshotQ.data) return <Skeleton className="h-96" />;
  const snap = snapshotQ.data;
  const isModerator = user!.role === "ADMIN" || snap.membership?.role === "MODERATOR";
  // live/pending round wins; otherwise the most recent round so voters see closures
  const activeRound = snap.rounds.find((r) => ["PENDING", "OPEN", "PAUSED"].includes(r.status));
  const lastRound = snap.rounds.length
    ? [...snap.rounds].sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))[0]
    : undefined;
  const currentRound = activeRound ?? lastRound;
  const presentingTeam = snap.teams.find((t) => t.teamId === currentRound?.teamId);
  const canVote = ['PARTICIPANT', 'MODERATOR'].includes(snap.membership?.role ?? user!.role) && snap.room.status === "ACTIVE";

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">{snap.room.name}</h1>
          <p className="text-sm text-gray-500">
            {snap.room.memberCount} member{snap.room.memberCount === 1 ? "" : "s"} · <span className="inline-flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${connected ? "bg-green-600" : "bg-red-600"}`} />{connected ? "realtime connected" : "reconnecting…"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={snap.room.status} />
          <Link to={`/room/${roomId}/results`} className="text-sm text-blue-700 hover:underline">Results →</Link>
        </div>
      </div>

      {/* Currently presenting banner */}
      <Card className={`mb-4 ${currentRound && currentRound.status === "OPEN" ? "border-green-400 bg-green-50" : currentRound?.status === "PAUSED" ? "border-amber-400 bg-amber-50" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Currently presenting</p>
            <p data-testid="presenting-team" className="text-lg font-bold">
              {presentingTeam ? presentingTeam.name : "— none selected —"}
            </p>
          </div>
          {currentRound ? <StatusBadge status={currentRound.status} /> : <StatusBadge status={snap.room.status === "ACTIVE" ? "PENDING" : "CLOSED"} />}
        </div>
      </Card>

      {isModerator && <PresenterControls snap={snap} currentRound={currentRound} onRefresh={() => qc.invalidateQueries({ queryKey: ["snapshot", roomId] })} />}

      {canVote && (
        <VotingPanel
          roomId={roomId!}
          snap={snap}
          round={currentRound}
          myTeamId={snap.membership?.teamId ?? null}
          isModerator={isModerator}
        />
      )}

      {isModerator && (
        <div className="mt-4">
          <h2 className="mb-2 font-semibold">Voting progress — {presentingTeam?.name ?? currentRound ? presentingTeam?.name : ""}</h2>
          {currentRound && <Progress roomId={roomId!} roundId={currentRound.id} />}
        </div>
      )}
    </>
  );
}

/* ============================ presenter controls ============================ */

function PresenterControls({ snap, currentRound, onRefresh }: { snap: Snapshot; currentRound: Snapshot["rounds"][number] | undefined; onRefresh: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [teamId, setTeamId] = useState("");
  const [forceOpen, setForceOpen] = useState(false);
  const [confirmForce, setConfirmForce] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) => api(path, { body: body ?? {} }),
    onSuccess: (_r, v) => {
      onRefresh();
      qc.invalidateQueries({ queryKey: ["progress"] });
      if (v.path.includes("rounds/")) toast("Round updated", "success");
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Action failed", "error"),
  });

  const closedTeams = new Set(snap.rounds.filter((r) => r.status === "CLOSED").map((r) => r.teamId));

  const select = (id: string, force = false) =>
    act.mutate({ path: `/rooms/${snap.room.id}/rounds/select`, body: { teamId: id, force } }, {
      onSuccess: () => {
        setTeamId("");
        setForceOpen(false);
      },
    });

  return (
    <Card className="mb-4">
      <h2 className="mb-3 font-semibold">Presenter controls</h2>
      <div className="flex flex-wrap items-end gap-2">
        <LabelledSelect label="Select presenting team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
        <option value="">Select team…</option>
          {snap.teams.map((t, i) => (
            <option key={t.teamId} value={t.teamId}>
              {i + 1}. {t.name}{closedTeams.has(t.teamId) ? " (evaluated)" : ""}
            </option>
          ))}
        </LabelledSelect>
        <CheckForce onChecked={(v) => setForceOpen(v)} label="Re-open completed team (audited)" checked={forceOpen} />
        <Button
          disabled={!teamId}
          onClick={() => {
            if (closedTeams.has(teamId) && !forceOpen) return setConfirmForce(teamId);
            select(teamId, forceOpen);
          }}
        >
          Present this team
        </Button>
        {currentRound && (
          <>
            {currentRound.status === "PENDING" && (
              <Button className="bg-green-700 hover:bg-green-800" data-testid="open-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/open` })}>Open voting</Button>
            )}
            {currentRound.status === "OPEN" && (
              <>
                <Button variant="secondary" data-testid="pause-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/pause` })}>Pause</Button>
                <Button variant="danger" data-testid="close-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/close` })}>Close round</Button>
              </>
            )}
            {currentRound.status === "PAUSED" && (
              <>
                <Button data-testid="resume-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/resume` })}>Resume</Button>
                <Button variant="danger" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/close` })}>Close round</Button>
              </>
            )}
          </>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmForce}
        title="Re-open evaluated team?"
        body="This team already completed its voting round. Re-opening it starts a new presentation round (recorded in the audit log)."
        confirmLabel="Re-open"
        onCancel={() => setConfirmForce(null)}
        onConfirm={() => {
          if (confirmForce) select(confirmForce, true);
          setConfirmForce(null);
        }}
      />
    </Card>
  );
}

function CheckForce({ label, checked, onChecked }: { label: string; checked: boolean; onChecked: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 pb-1 text-xs">
      <input type="checkbox" checked={checked} onChange={(e) => onChecked(e.target.checked)} className="h-4 w-4" aria-label={label} />
      {label}
    </label>
  );
}

/* ================================ voting panel ============================== */

function VotingPanel({ roomId, snap, round, myTeamId, isModerator }: { roomId: string; snap: Snapshot; round: Snapshot["rounds"][number] | undefined; myTeamId: string | null; isModerator: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [scores, setScores] = useState<Record<string, number>>({});
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myVoteQ = useQuery({
    queryKey: ["myVote", roomId, round?.id],
    queryFn: () => api<{ vote: any }>(`/rounds/${round!.id}/my-vote`),
    enabled: !!round,
  });

  useEffect(() => {
    if (myVoteQ.data?.vote?.scores) {
      const next: Record<string, number> = {};
      for (const s of myVoteQ.data.vote.scores) next[s.categoryId] = Number(s.score);
      setScores(next);
    }
  }, [myVoteQ.data]);

  const submit = useMutation({
    mutationFn: (finalScores: Record<string, number>) =>
      api(`/rounds/${round!.id}/votes`, {
        body: { scores: snap.categories.map((c) => ({ categoryId: c.id, score: finalScores[c.id] })) },
      }),
    onSuccess: (res: any) => {
      setReview(false);
      setError(null);
      qc.invalidateQueries({ queryKey: ["myVote", roomId, round?.id] });
      toast(res.edited ? "Vote updated" : `Vote submitted — thank you!`, "success");
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : "Submission failed"),
  });

  if (!round || round.status === "PENDING") {
    return (
      <Card>
        <p data-testid="waiting-presenting" className="text-sm text-gray-600">
          A team has been selected. Voting will open when the moderator starts the round — this screen updates automatically.
        </p>
      </Card>
    );
  }

  if (round.status === "CLOSED") {
    return (
      <Card>
        <p data-testid="voting-closed" className="text-sm text-gray-600">
          Voting is closed for this round. Wait for the results to be published.
        </p>
        <Link className="mt-2 inline-block text-sm text-blue-700 hover:underline" to={`/room/${roomId}/results`}>View results →</Link>
      </Card>
    );
  }

  const myTeamName = snap.teams.find((t) => t.teamId === myTeamId)?.name;
  const isSelfTeam = myTeamId && myTeamId === round.teamId;

  if (isSelfTeam) {
    return (
      <Card>
        <p data-testid="self-team" className="text-sm text-gray-700">Your team <strong>{myTeamName}</strong> is currently presenting — you will be a voter in the next rounds.</p>
      </Card>
    );
  }

  if (round.status === "PAUSED") {
    return (
      <Card className="border-amber-300 bg-amber-50">
        <p data-testid="voting-paused" className="text-sm font-medium text-amber-900">Voting is paused by the moderator. It will resume shortly.</p>
      </Card>
    );
  }

  const allAnswered = snap.categories.every((c) => !c.isRequired || scores[c.id] !== undefined);
  const submitted = myVoteQ.data?.vote != null;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold">Score {snap.teams.find((t) => t.teamId === round.teamId)?.name}</h2>
        {submitted && (
          <span className="text-xs text-gray-600">
            You voted {myVoteQ.data?.vote ? `(revision ${myVoteQ.data.vote.revision})` : ""} — editing {snap.room.settings.allowVoteEdit ? "allowed while open" : "is off"}
          </span>
        )}
      </div>

      {review ? (
        <div>
          <h3 className="mb-2 font-medium">Review your scores</h3>
          <ul className="mb-4 divide-y divide-gray-200 rounded-lg border border-gray-200">
            {snap.categories.map((c) => (
              <li key={c.id} className="flex justify-between px-3 py-2 text-sm">
                <span>{c.name}</span>
                <strong>{scores[c.id]}</strong>
              </li>
            ))}
          </ul>
          <p className="mb-3 text-sm text-gray-600">You can still edit before submitting. Editing later is {snap.room.settings.allowVoteEdit ? "possible while voting stays open" : "not possible"}.</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setReview(false)}>Back</Button>
            <button data-testid="confirm-vote" className="inline-flex items-center rounded-lg bg-green-700 px-3 py-2 text-sm font-medium text-white hover:bg-green-800" onClick={() => submit.mutate(scores)} disabled={submit.isPending}>
              {submit.isPending ? "Submitting…" : "Confirm & submit"}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {snap.categories.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{c.name}{!c.isRequired && <span className="ml-1 text-xs text-gray-500">(optional)</span>}</p>
                <p className="text-xs text-gray-500">range {c.minScore}–{c.maxScore}</p>
              </div>
              {c.description && <p className="mb-2 text-sm text-gray-500">{c.description}</p>}
              <SliderInput min={c.minScore} max={c.maxScore} step={c.step} value={scores[c.id] ?? undefined} onChange={(v) => setScores({ ...scores, [c.id]: v })} label={c.name} />
            </div>
          ))}
          {error && <ErrorBox>{error}</ErrorBox>}
          <Button data-testid="review-vote" disabled={!allAnswered} onClick={() => setReview(true)} className="w-full sm:w-auto">
            {allAnswered ? "Review & submit" : "Score all required categories"}
          </Button>
        </div>
      )}
      {isModerator && <p className="mt-2 text-xs text-gray-500">As a moderator you can also vote if you have no team.</p>}
    </Card>
  );
}

/** Thumb-friendly score input: slider + honouring exact steps. */
function SliderInput({ min, max, step, value, onChange, label }: { min: number; max: number; step: number; value: number | undefined; onChange: (v: number) => void; label: string }) {
  const values: number[] = [];
  for (let v = min; v <= max; v += step) values.push(v);
  if (value !== undefined && !values.includes(value)) onChange(value);
  return (
    <div>
      <div className="flex items-center gap-3">
        <input
          type="range"
          aria-label={`Score for ${label}`}
          min={min}
          max={max}
          step={step}
          value={value ?? min}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-6 w-full max-w-md accent-blue-700"
          data-testid={`slider-${label}`}
        />
        <output className="w-14 rounded-lg border border-gray-300 py-1 text-center text-sm font-semibold" aria-live="polite">
          {value ?? "—"}
        </output>
      </div>
      {values.length <= 12 && (
        <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={`Quick scores for ${label}`}>
          {values.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onChange(v)}
              className={`h-9 w-9 rounded-lg border text-sm font-semibold ${value === v ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white hover:bg-gray-100"}`}
              aria-pressed={value === v}
            >
              {v}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================== progress panel ============================= */

function Progress({ roomId, roundId }: { roomId: string; roundId: string }) {
  const progressQ = useQuery({
    queryKey: ["progress", roomId, roundId],
    queryFn: () => api<any>(`/rooms/${roomId}/rounds/${roundId}/progress`),
    refetchInterval: 10000, // event-driven updates + poll fallback
    refetchIntervalInBackground: true,
  });
  if (progressQ.isLoading) return <Skeleton className="h-32" />;
  const p = progressQ.data;
  return (
    <Card data-testid="progress-panel">
      <div className="mb-3 flex items-center justify-between">
        <p>
          <span data-testid="progress-count" className="text-2xl font-bold">{p.votedCount}</span>
          <span className="text-gray-500"> / {p.eligibleCount} eligible voted ({p.percentage}%)</span>
        </p>
      </div>
      <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="h-full bg-green-600" style={{ width: `${p.percentage}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-sm font-semibold">Voted ({p.votedCount})</p>
          <ul className="text-sm text-gray-600">
            {p.voters.filter((v: any) => v.status === "voted").map((v: any) => (
              <li key={v.userId}>{v.name}{v.teamName ? <span className="text-gray-400"> · {v.teamName}</span> : ""}</li>
            ))}
          </ul>
        </div>
        <div>
          <p className="mb-1 text-sm font-semibold">Pending ({p.pendingCount})</p>
          <ul className="text-sm text-gray-600">
            {p.voters.filter((v: any) => v.status === "pending").map((v: any) => (
              <li key={v.userId}>{v.name}{v.teamName ? <span className="text-gray-400"> · {v.teamName}</span> : ""}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-500">Excluded (members of presenting team): {p.excludedMembers.length}</p>
        </div>
      </div>
    </Card>
  );
}
