import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { useRealtime } from "../contexts/Realtime";
import { useToast } from "../contexts/Toast";
import {
  Button,
  buttonClass,
  Card,
  ConfirmDialog,
  ErrorBox,
  LabelledSelect,
  ProgressBar,
  Skeleton,
  StatusBadge,
} from "../components/ui";
import {
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconLock,
  IconPause,
  IconPlay,
  IconStop,
  IconTeams,
  IconTrophy,
  IconUsers,
} from "../components/icons";

interface Snapshot {
  room: { id: string; name: string; status: string; settings: any; publishedAt: string | null; memberCount: number };
  teams: { teamId: string; name: string; presentationOrder: number }[];
  categories: { id: string; name: string; description: string | null; minScore: number; maxScore: number; step: number; weight: string; isRequired: boolean }[];
  rounds: { id: string; teamId: string; status: string; openedAt: string | null; closedAt: string | null; createdAt?: string }[];
  membership: { role: string; teamId: string | null } | null;
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function RoomLive() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { join, connected, socketRef } = useRealtime();
  const qc = useQueryClient();

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
    const events = ["room:state_changed", "team:presenting_changed", "voting:opened", "voting:paused", "voting:resumed", "voting:closed", "vote:submitted", "results:published"];
    events.forEach((ev) => socket.on(ev, () => qc.invalidateQueries({ queryKey: ["snapshot", roomId] })));
    return () => events.forEach((ev) => socket.off(ev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, snapshotQ.data, join, socketRef, qc]);

  if (snapshotQ.isLoading || !snapshotQ.data) return <Skeleton className="h-96 rounded-2xl" />;
  const snap = snapshotQ.data;
  const isModerator = user!.role === "ADMIN" || snap.membership?.role === "MODERATOR";
  // live/pending round wins; otherwise the most recent round so voters see closures
  const activeRound = snap.rounds.find((r) => ["PENDING", "OPEN", "PAUSED"].includes(r.status));
  const lastRound = snap.rounds.length
    ? [...snap.rounds].sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))[0]
    : undefined;
  const currentRound = activeRound ?? lastRound;
  const presentingTeam = snap.teams.find((t) => t.teamId === currentRound?.teamId);
  const canVote = ["PARTICIPANT", "MODERATOR"].includes(snap.membership?.role ?? user!.role) && snap.room.status === "ACTIVE";
  const roundStatus = currentRound?.status ?? (snap.room.status === "ACTIVE" ? "PENDING" : "CLOSED");

  const roundHint = (() => {
    if (!currentRound) return "Pick a team in the presenter controls to begin.";
    if (currentRound.status === "PENDING") return "Voting will open when the moderator starts the round.";
    if (currentRound.status === "OPEN") return "Voting is open — participants are scoring right now.";
    if (currentRound.status === "PAUSED") return "Voting is paused. Resume when everyone is ready.";
    return "Voting is closed for this round.";
  })();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 sm:mb-6">
        <div className="min-w-0">
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
            <span className="h-1 w-6 rounded-full bg-gradient-to-r from-brand-500 to-jade-400" aria-hidden="true" />
            Live room
          </p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-[2rem]">
            {snap.room.name}
          </h1>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <IconUsers size={14} className="text-ink-400" />
              {snap.room.memberCount} member{snap.room.memberCount === 1 ? "" : "s"}
            </span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-ink-300" />
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${connected ? "animate-pulse-soft bg-jade-500" : "bg-gold-500"}`} />
              {connected ? "Realtime connected" : "Reconnecting…"}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={snap.room.status} />
          <Link to={`/room/${roomId}/results`} className={buttonClass("secondary", "py-2 text-xs")}>
            Results →
          </Link>
        </div>
      </div>

      {/* currently presenting */}
      <section className="relative mb-4 overflow-hidden rounded-3xl bg-ink-950 p-6 text-white shadow-lift sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className={`absolute -right-16 -top-24 h-72 w-72 rounded-full blur-3xl ${
            roundStatus === "OPEN" ? "bg-jade-500/30" : roundStatus === "PAUSED" ? "bg-gold-500/25" : "bg-brand-600/30"
          }`} />
          <div className="absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-brand-600/20 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>
        <div className="relative flex flex-wrap items-end justify-between gap-5">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">
              <span className="relative flex h-1.5 w-1.5">
                {roundStatus === "OPEN" && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jade-400 opacity-70" />}
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  roundStatus === "OPEN" ? "bg-jade-400" : roundStatus === "PAUSED" ? "bg-gold-400" : "bg-white/40"
                }`} />
              </span>
              Currently presenting
            </p>
            <p data-testid="presenting-team" className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {presentingTeam ? presentingTeam.name : "— none selected —"}
            </p>
            <p className="mt-2.5 max-w-lg text-[13px] leading-relaxed text-white/45">{roundHint}</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <StatusBadge status={roundStatus} />
            {presentingTeam && (
              <span className="text-[11px] text-white/35">
                Presentation #{presentingTeam.presentationOrder}
              </span>
            )}
          </div>
        </div>
      </section>

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
        <div className="mt-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">Voting progress</h2>
            <span className="text-xs text-ink-500">{presentingTeam?.name ?? "No team presenting"}</span>
          </div>
          {currentRound ? (
            <Progress roomId={roomId!} roundId={currentRound.id} />
          ) : (
            <Card>
              <p className="text-sm text-ink-500">Progress appears once a team starts presenting.</p>
            </Card>
          )}
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <IconPlay size={18} />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Presenter controls</h2>
            <p className="mt-0.5 text-xs text-ink-500">Choose who presents next, then run the round.</p>
          </div>
        </div>
        {currentRound && <StatusBadge status={currentRound.status} />}
      </div>

      <div className="mt-4 grid gap-3 rounded-2xl border border-line bg-ink-50/40 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <LabelledSelect label="Select presenting team" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Select team…</option>
          {snap.teams.map((team, index) => (
            <option key={team.teamId} value={team.teamId}>
              {index + 1}. {team.name}{closedTeams.has(team.teamId) ? " (evaluated)" : ""}
            </option>
          ))}
        </LabelledSelect>
        <div className="flex flex-wrap items-center gap-2">
          <CheckForce onChecked={(v) => setForceOpen(v)} label="Re-open completed team (audited)" checked={forceOpen} />
          <Button
            className="py-2 text-xs"
            disabled={!teamId}
            onClick={() => {
              if (closedTeams.has(teamId) && !forceOpen) return setConfirmForce(teamId);
              select(teamId, forceOpen);
            }}
          >
            Present this team
          </Button>
        </div>
      </div>

      {currentRound && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
          <span className="mr-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Round</span>
          {currentRound.status === "PENDING" && (
            <Button variant="success" className="py-2 text-xs" data-testid="open-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/open` })}>
              <IconPlay size={13} />
              Open voting
            </Button>
          )}
          {currentRound.status === "OPEN" && (
            <>
              <Button variant="secondary" className="py-2 text-xs" data-testid="pause-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/pause` })}>
                <IconPause size={13} />
                Pause
              </Button>
              <Button variant="danger" className="py-2 text-xs" data-testid="close-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/close` })}>
                <IconStop size={13} />
                Close round
              </Button>
            </>
          )}
          {currentRound.status === "PAUSED" && (
            <>
              <Button variant="success" className="py-2 text-xs" data-testid="resume-voting" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/resume` })}>
                <IconPlay size={13} />
                Resume
              </Button>
              <Button variant="danger" className="py-2 text-xs" onClick={() => act.mutate({ path: `/rounds/${currentRound.id}/close` })}>
                <IconStop size={13} />
                Close round
              </Button>
            </>
          )}
          {currentRound.status === "CLOSED" && (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-500">
              <IconCheckCircle size={14} className="text-jade-500" />
              This round is complete.
            </span>
          )}
        </div>
      )}

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
    <label className="flex cursor-pointer items-center gap-2 text-[11px] text-ink-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChecked(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-ink-300 accent-brand-600"
        aria-label={label}
      />
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
      for (const score of myVoteQ.data.vote.scores) next[score.categoryId] = Number(score.score);
      setScores(next);
    }
  }, [myVoteQ.data]);

  const submit = useMutation({
    mutationFn: (finalScores: Record<string, number>) =>
      api(`/rounds/${round!.id}/votes`, {
        body: { scores: snap.categories.map((category) => ({ categoryId: category.id, score: finalScores[category.id] })) },
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
        <div data-testid="waiting-presenting" className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ocean-50 text-ocean-600 ring-1 ring-inset ring-ocean-100">
            <IconClock size={20} />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Waiting for the moderator</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              A team has been selected. Voting will open when the moderator starts the round — this
              screen updates automatically.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (round.status === "CLOSED") {
    return (
      <Card>
        <div data-testid="voting-closed" className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200">
              <IconLock size={20} />
            </span>
            <div>
              <h2 className="font-display text-base font-semibold text-ink-900">Voting is closed</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                This round is complete. Wait for the results to be published.
              </p>
            </div>
          </div>
          <Link to={`/room/${roomId}/results`} className={buttonClass("secondary", "py-2 text-xs")}>
            View results →
          </Link>
        </div>
      </Card>
    );
  }

  const myTeamName = snap.teams.find((team) => team.teamId === myTeamId)?.name;
  const isSelfTeam = myTeamId && myTeamId === round.teamId;

  if (isSelfTeam) {
    return (
      <Card>
        <div data-testid="self-team" className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <IconUsers size={20} />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Your team is presenting</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              <strong className="text-ink-800">{myTeamName}</strong> is currently presenting — you
              will be a voter in the next rounds.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (round.status === "PAUSED") {
    return (
      <Card className="border-gold-200 bg-gold-50/60">
        <div data-testid="voting-paused" className="flex items-start gap-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gold-100 text-gold-700 ring-1 ring-inset ring-gold-200">
            <IconPause size={20} />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-gold-900">Voting is paused</h2>
            <p className="mt-1 text-sm text-gold-800">The moderator paused this round. It will resume shortly.</p>
          </div>
        </div>
      </Card>
    );
  }

  const allAnswered = snap.categories.every((category) => !category.isRequired || scores[category.id] !== undefined);
  const submitted = myVoteQ.data?.vote != null;
  const teamName = snap.teams.find((team) => team.teamId === round.teamId)?.name;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-100">
            <IconTrophy size={19} />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-ink-900">Score {teamName}</h2>
            <p className="mt-0.5 text-xs text-ink-500">
              Move the slider or tap a score for each category.
            </p>
          </div>
        </div>
        {submitted && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-50 px-2.5 py-1 text-[10px] font-semibold text-jade-700 ring-1 ring-inset ring-jade-200">
            <IconCheck size={11} strokeWidth={3} />
            Vote saved{myVoteQ.data?.vote ? ` · revision ${myVoteQ.data.vote.revision}` : ""}
          </span>
        )}
      </div>

      {review ? (
        <div className="animate-fade-in pt-4">
          <h3 className="font-display text-base font-semibold text-ink-900">Review your scores</h3>
          <p className="mt-1 text-xs text-ink-500">
            Editing later is {snap.room.settings.allowVoteEdit ? "possible while voting stays open" : "not possible"}.
          </p>
          <ul className="mt-4 overflow-hidden rounded-2xl border border-line">
            {snap.categories.map((category) => (
              <li key={category.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
                <span className="text-ink-600">{category.name}</span>
                <span className="inline-flex items-baseline gap-1">
                  <strong className="font-display text-lg text-ink-950">{scores[category.id]}</strong>
                  <span className="text-[10px] text-ink-400">/ {category.maxScore}</span>
                </span>
              </li>
            ))}
          </ul>
          {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setReview(false)}>
              Back
            </Button>
            <Button
              variant="success"
              data-testid="confirm-vote"
              onClick={() => submit.mutate(scores)}
              disabled={submit.isPending}
            >
              {submit.isPending ? "Submitting…" : "Confirm & submit"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {snap.categories.map((category) => (
              <div key={category.id} className="rounded-2xl border border-line bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-ink-800">
                      {category.name}
                      {!category.isRequired && <span className="ml-1.5 text-[10px] font-medium text-ink-400">(optional)</span>}
                    </p>
                    {category.description && <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{category.description}</p>}
                  </div>
                  <span className="rounded-md bg-ink-50 px-1.5 py-0.5 font-mono text-[10px] text-ink-500 ring-1 ring-inset ring-line">
                    {category.minScore}–{category.maxScore}
                  </span>
                </div>
                <div className="mt-3">
                  <SliderInput
                    min={category.minScore}
                    max={category.maxScore}
                    step={category.step}
                    value={scores[category.id]}
                    onChange={(value) => setScores({ ...scores, [category.id]: value })}
                    label={category.name}
                  />
                </div>
              </div>
            ))}
          </div>
          {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button data-testid="review-vote" disabled={!allAnswered} onClick={() => setReview(true)} className="w-full sm:w-auto">
              {allAnswered ? "Review & submit" : "Score all required categories"}
            </Button>
            {!allAnswered && <span className="text-[11px] text-ink-400">Fill every required category to continue.</span>}
          </div>
          {isModerator && <p className="mt-3 text-[11px] text-ink-400">As a moderator you can also vote if you have no team.</p>}
        </div>
      )}
    </Card>
  );
}

/** Thumb-friendly score input: slider + honouring exact steps. */
function SliderInput({ min, max, step, value, onChange, label }: { min: number; max: number; step: number; value: number | undefined; onChange: (v: number) => void; label: string }) {
  const values: number[] = [];
  for (let current = min; current <= max; current += step) values.push(current);
  const fill = max > min ? (((value ?? min) - min) / (max - min)) * 100 : 0;
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
          className="range-brand w-full"
          style={{ "--range-fill": `${fill}%` } as CSSProperties}
          data-testid={`slider-${label}`}
        />
        <output
          className="grid h-11 w-14 shrink-0 place-items-center rounded-xl border border-line bg-ink-50/70 font-display text-lg font-semibold text-ink-900"
          aria-live="polite"
        >
          {value ?? "—"}
        </output>
      </div>
      {values.length <= 12 && (
        <div className="mt-2.5 flex flex-wrap gap-1" role="group" aria-label={`Quick scores for ${label}`}>
          {values.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`h-8 min-w-8 rounded-lg border px-1.5 text-xs font-semibold transition-all ${
                value === option
                  ? "border-brand-600 bg-brand-600 text-white shadow-glow"
                  : "border-line bg-white text-ink-600 hover:border-brand-300 hover:bg-brand-50"
              }`}
              aria-pressed={value === option}
            >
              {option}
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
  if (progressQ.isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  const p = progressQ.data;

  return (
    <Card data-testid="progress-panel">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Turnout</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span data-testid="progress-count" className="font-display text-4xl font-semibold text-ink-950">
              {p.votedCount}
            </span>
            <span className="text-sm text-ink-500">/ {p.eligibleCount} eligible voted</span>
          </p>
        </div>
        <span className="rounded-full bg-brand-50 px-3 py-1.5 font-display text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
          {p.percentage}%
        </span>
      </div>
      <ProgressBar value={p.percentage} className="mt-4 h-2.5" tone="jade" />
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-jade-100 bg-jade-50/50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-jade-800">
            <IconCheckCircle size={14} />
            Voted ({p.votedCount})
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {p.voters.filter((voter: any) => voter.status === "voted").map((voter: any) => (
              <li key={voter.userId} className="flex items-center gap-2 text-xs text-ink-600">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[9px] font-bold text-jade-700 ring-1 ring-jade-200">
                  {initials(voter.name)}
                </span>
                <span className="truncate">{voter.name}</span>
                {voter.teamName && <span className="truncate text-[10px] text-ink-400">· {voter.teamName}</span>}
              </li>
            ))}
            {p.votedCount === 0 && <li className="text-xs text-ink-400">No votes yet.</li>}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-ink-50/50 p-4">
          <p className="flex items-center gap-2 text-xs font-semibold text-ink-700">
            <IconClock size={14} className="text-ink-400" />
            Pending ({p.pendingCount})
          </p>
          <ul className="mt-2.5 space-y-1.5">
            {p.voters.filter((voter: any) => voter.status === "pending").map((voter: any) => (
              <li key={voter.userId} className="flex items-center gap-2 text-xs text-ink-600">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white text-[9px] font-bold text-ink-500 ring-1 ring-line">
                  {initials(voter.name)}
                </span>
                <span className="truncate">{voter.name}</span>
                {voter.teamName && <span className="truncate text-[10px] text-ink-400">· {voter.teamName}</span>}
              </li>
            ))}
            {p.pendingCount === 0 && <li className="text-xs text-ink-400">Everyone has voted.</li>}
          </ul>
          <p className="mt-3 flex items-center gap-1.5 border-t border-line pt-2.5 text-[10px] text-ink-400">
            <IconTeams size={12} />
            Excluded (presenting team): {p.excludedMembers.length}
          </p>
        </div>
      </div>
    </Card>
  );
}
