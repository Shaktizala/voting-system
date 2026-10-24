import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, isRetryable, retryDelay } from "../lib/api";
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
  IconPause,
  IconPlay,
  IconStop,
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

/** Events that change the room snapshot (vote:submitted only changes progress). */
const STATE_EVENTS = ["room:state_changed", "team:presenting_changed", "voting:opened", "voting:paused", "voting:resumed", "voting:closed", "results:published"] as const;

export default function RoomLive() {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const { join, connected, socketRef } = useRealtime();
  const qc = useQueryClient();

  const snapshotQ = useQuery({
    queryKey: ["snapshot", roomId],
    queryFn: () => api<Snapshot>(`/rooms/${roomId}/full`),
    // socket events drive updates; polling is only a safety net (fast when the socket is down)
    refetchInterval: () => (connected ? 30_000 : 5_000) + Math.random() * 2_000,
    refetchIntervalInBackground: true, // projector/participant tabs are often unfocused
    retry: 3,
    retryDelay,
  });
  const ready = snapshotQ.data !== undefined;

  // socket wiring: join the room channel once data is loaded, re-sync on events
  useEffect(() => {
    if (!roomId || !ready) return;
    join(roomId);
    const socket = socketRef.current;
    if (!socket) return;
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    let progressTimer: ReturnType<typeof setTimeout> | undefined;
    // coalesce bursts (one action can emit two events) and spread the refetch so
    // a full room of clients doesn't hit the API in the same millisecond
    const refreshSnapshot = () => {
      if (snapshotTimer) return;
      snapshotTimer = setTimeout(() => {
        snapshotTimer = undefined;
        qc.invalidateQueries({ queryKey: ["snapshot", roomId] });
      }, 50 + Math.random() * 400);
    };
    // moderators: show the new count instantly, refresh the voter list at most once a second
    const onVote = (p: { roundId: string; votedCount: number; eligibleCount: number }) => {
      qc.setQueryData(["progress", roomId, p.roundId], (old: any) =>
        old ? { ...old, votedCount: p.votedCount, eligibleCount: p.eligibleCount, percentage: p.eligibleCount ? Math.round((p.votedCount / p.eligibleCount) * 100) : 0 } : old
      );
      if (progressTimer) return;
      progressTimer = setTimeout(() => {
        progressTimer = undefined;
        qc.invalidateQueries({ queryKey: ["progress", roomId] });
      }, 1000);
    };
    STATE_EVENTS.forEach((ev) => socket.on(ev, refreshSnapshot));
    socket.on("vote:submitted", onVote);
    return () => {
      // remove only our handlers — other components may listen to the same events
      STATE_EVENTS.forEach((ev) => socket.off(ev, refreshSnapshot));
      socket.off("vote:submitted", onVote);
      clearTimeout(snapshotTimer);
      clearTimeout(progressTimer);
    };
  }, [roomId, ready, join, socketRef, qc]);

  if (snapshotQ.isLoading || !snapshotQ.data) return <Skeleton className="h-96 rounded-2xl" />;
  const snap = snapshotQ.data;
  // mirrors the server's moderatorGuard: global MODERATOR role *and* room moderator
  const isModerator = user!.role === "ADMIN" || (user!.role === "MODERATOR" && snap.membership?.role === "MODERATOR");
  // live/pending round wins; otherwise the most recent round so voters see closures
  const activeRound = snap.rounds.find((r) => ["PENDING", "OPEN", "PAUSED"].includes(r.status));
  const lastRound = snap.rounds.length
    ? [...snap.rounds].sort((a, b) => ((a.createdAt ?? "") < (b.createdAt ?? "") ? 1 : -1))[0]
    : undefined;
  const currentRound = activeRound ?? lastRound;
  const presentingTeam = snap.teams.find((t) => t.teamId === currentRound?.teamId);
  const canVote = ["PARTICIPANT", "MODERATOR"].includes(snap.membership?.role ?? user!.role) && snap.room.status === "ACTIVE";

  const teamName = presentingTeam?.name;
  const finding = !currentRound
    ? isModerator
      ? "No team is presenting. Pick the first team to start."
      : "Waiting for the first team to present."
    : currentRound.status === "PENDING"
      ? `${teamName} is up next. Voting hasn't opened.`
      : currentRound.status === "OPEN"
        ? `${teamName} is presenting. Voting is open.`
        : currentRound.status === "PAUSED"
          ? `${teamName} is presenting. Voting is paused.`
          : `${teamName}'s round is closed.`;
  const order = presentingTeam ? snap.teams.findIndex((t) => t.teamId === presentingTeam.teamId) + 1 : 0;
  const refresh = () => qc.invalidateQueries({ queryKey: ["snapshot", roomId] });

  return (
    <>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold leading-tight text-ink-950">{snap.room.name}</h1>
          <p className="mt-1 text-sm text-ink-500">
            {snap.room.status === "ACTIVE" ? finding : "This room is closed."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {snap.room.status !== "ACTIVE" && <StatusBadge status={snap.room.status} />}
          <Link to={`/room/${roomId}/results`} className={buttonClass("secondary")}>
            Results
          </Link>
        </div>
      </div>

      {/* presenting strip: the object of the screen, with the round's controls beside it */}
      <section
        aria-label="Presenting now"
        className="mb-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-[10px] border border-line px-5 py-4"
      >
        <div className="min-w-0">
          <p className="text-[13px] text-ink-500">
            {presentingTeam && order > 0 ? `Presenting, team ${order} of ${snap.teams.length}` : "Presenting"}
          </p>
          <p data-testid="presenting-team" className="mt-0.5 truncate text-2xl font-semibold leading-tight text-ink-950">
            {presentingTeam ? presentingTeam.name : "No team selected"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {currentRound && <StatusBadge status={currentRound.status} />}
          {isModerator && currentRound && <RoundActions round={currentRound} onDone={refresh} />}
        </div>
      </section>

      {isModerator ? (
        <>
          <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <section aria-labelledby="turnout-heading" className="min-w-0">
              {currentRound && currentRound.status !== "PENDING" ? (
                <Turnout roomId={roomId!} roundId={currentRound.id} teamName={teamName ?? ""} connected={connected} />
              ) : (
                <>
                  <h2 id="turnout-heading" className="mb-2 text-base font-semibold text-ink-950">Turnout</h2>
                  <p className="rounded-[10px] border border-dashed border-ink-300 px-4 py-3 text-sm text-ink-700">
                    {currentRound ? `Open voting for ${teamName} to see who has voted.` : "Turnout appears once a team is presenting."}
                  </p>
                </>
              )}
            </section>
            <PresenterControls snap={snap} currentRound={currentRound} onRefresh={refresh} />
          </div>
          {canVote && (
            <section aria-label="Your score" className="mt-8">
              <VotingPanel roomId={roomId!} snap={snap} round={currentRound} myTeamId={snap.membership?.teamId ?? null} isModerator />
            </section>
          )}
        </>
      ) : (
        canVote && (
          <VotingPanel roomId={roomId!} snap={snap} round={currentRound} myTeamId={snap.membership?.teamId ?? null} isModerator={false} />
        )
      )}
    </>
  );
}

/* ============================ presenter controls ============================ */

/** Open / pause / resume / close: next to the team they act on. */
function RoundActions({ round, onDone }: { round: Snapshot["rounds"][number]; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const act = useMutation({
    mutationFn: (path: string) => api(path, { body: {} }),
    onSuccess: () => {
      onDone();
      qc.invalidateQueries({ queryKey: ["progress"] });
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Action failed", "error"),
  });
  const go = (verb: string) => act.mutate(`/rounds/${round.id}/${verb}`);
  const busy = act.isPending;
  if (round.status === "PENDING")
    return (
      <Button data-testid="open-voting" disabled={busy} onClick={() => go("open")}>
        <IconPlay size={14} />
        Open voting
      </Button>
    );
  if (round.status === "OPEN")
    return (
      <>
        <Button variant="secondary" data-testid="pause-voting" disabled={busy} onClick={() => go("pause")}>
          <IconPause size={14} />
          Pause
        </Button>
        <Button variant="danger" data-testid="close-voting" disabled={busy} onClick={() => go("close")}>
          <IconStop size={14} />
          Close round
        </Button>
      </>
    );
  if (round.status === "PAUSED")
    return (
      <>
        <Button data-testid="resume-voting" disabled={busy} onClick={() => go("resume")}>
          <IconPlay size={14} />
          Resume
        </Button>
        <Button variant="danger" disabled={busy} onClick={() => go("close")}>
          <IconStop size={14} />
          Close round
        </Button>
      </>
    );
  return null;
}

/** Who presents next, and the run order so far. */
function PresenterControls({ snap, currentRound, onRefresh }: { snap: Snapshot; currentRound: Snapshot["rounds"][number] | undefined; onRefresh: () => void }) {
  const toast = useToast();
  const [teamId, setTeamId] = useState("");
  const [forceOpen, setForceOpen] = useState(false);
  const [confirmForce, setConfirmForce] = useState<string | null>(null);

  const act = useMutation({
    mutationFn: ({ id, force }: { id: string; force: boolean }) =>
      api(`/rooms/${snap.room.id}/rounds/select`, { body: { teamId: id, force } }),
    onSuccess: () => {
      onRefresh();
      setTeamId("");
      setForceOpen(false);
    },
    onError: (e) => toast(e instanceof ApiError ? e.message : "Action failed", "error"),
  });
  const select = (id: string, force = false) => act.mutate({ id, force });

  // a team counts as presented once its round actually opened
  const presented = new Set(snap.rounds.filter((r) => r.status === "CLOSED" && r.openedAt).map((r) => r.teamId));
  const locked = currentRound?.status === "OPEN";

  return (
    <aside aria-labelledby="next-heading" className="space-y-6">
      <section>
        <h2 id="next-heading" className="mb-2 text-base font-semibold text-ink-950">
          Next team
        </h2>
        <div className="space-y-3 rounded-[10px] border border-line p-4">
          <LabelledSelect label="Select presenting team" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={locked}>
            <option value="">Choose a team</option>
            {snap.teams.map((team, index) => (
              <option key={team.teamId} value={team.teamId}>
                {index + 1}. {team.name}{presented.has(team.teamId) ? " (presented)" : ""}
              </option>
            ))}
          </LabelledSelect>
          <CheckForce onChecked={(v) => setForceOpen(v)} label="Let a presented team go again (audited)" checked={forceOpen} />
          <Button
            className="w-full"
            variant="secondary"
            disabled={!teamId || locked || act.isPending}
            onClick={() => {
              if (presented.has(teamId) && !forceOpen) return setConfirmForce(teamId);
              select(teamId, forceOpen);
            }}
          >
            Present this team
          </Button>
          {locked && <p className="text-xs text-ink-500">Close or pause the open round before switching teams.</p>}
        </div>
      </section>

      <section aria-labelledby="order-heading">
        <h2 id="order-heading" className="mb-2 text-base font-semibold text-ink-950">
          Run order
        </h2>
        <ol className="rounded-[10px] border border-line">
          {snap.teams.map((team, index) => {
            const now = currentRound?.teamId === team.teamId && currentRound.status !== "CLOSED";
            return (
              <li key={team.teamId} className="flex h-11 items-center justify-between gap-3 border-b border-rule px-4 text-sm last:border-0">
                <span className="flex min-w-0 items-center gap-3">
                  <span className="num w-4 shrink-0 text-right text-ink-500">{index + 1}</span>
                  <span className={`truncate ${now ? "font-medium text-ink-950" : "text-ink-800"}`}>{team.name}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-500">
                  {now ? "Now" : presented.has(team.teamId) ? "Presented" : "Waiting"}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <ConfirmDialog
        open={!!confirmForce}
        title="Let this team present again?"
        body="This team's round already closed. Presenting it again starts a new voting round, recorded in the audit log."
        confirmLabel="Present again"
        onCancel={() => setConfirmForce(null)}
        onConfirm={() => {
          if (confirmForce) select(confirmForce, true);
          setConfirmForce(null);
        }}
      />
    </aside>
  );
}

function CheckForce({ label, checked, onChecked }: { label: string; checked: boolean; onChecked: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChecked(e.target.checked)}
        className="h-4 w-4 rounded border-ink-400 accent-ink-950"
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
  const draftKey = round ? `vote-draft:${round.id}` : null;
  // a half-filled ballot survives refreshes, flaky Wi-Fi and re-login
  const [scores, setScores] = useState<Record<string, number>>(() => readDraft(draftKey));
  const [review, setReview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const myVoteQ = useQuery({
    queryKey: ["myVote", roomId, round?.id],
    queryFn: () => api<{ vote: MyVote | null }>(`/rounds/${round!.id}/my-vote`),
    enabled: !!round,
  });
  const savedVote = myVoteQ.data?.vote?.vote ?? null;

  useEffect(() => {
    setScores(readDraft(draftKey));
  }, [draftKey]);

  useEffect(() => {
    if (!savedVote) return;
    const next: Record<string, number> = {};
    for (const score of savedVote.scores) next[score.categoryId] = Number(score.score);
    setScores(next);
  }, [savedVote]);

  const updateScores = (next: Record<string, number>) => {
    setScores(next);
    writeDraft(draftKey, next);
  };

  const submit = useMutation({
    mutationFn: (finalScores: Record<string, number>) =>
      api<{ edited: boolean }>(`/rounds/${round!.id}/votes`, {
        body: { scores: snap.categories.map((category) => ({ categoryId: category.id, score: finalScores[category.id] })) },
      }),
    // submissions are idempotent server-side, so transient failures retry on their own
    retry: (count, e) => count < 4 && isRetryable(e),
    retryDelay,
    onSuccess: (res) => {
      setReview(false);
      setError(null);
      writeDraft(draftKey, null);
      qc.invalidateQueries({ queryKey: ["myVote", roomId, round?.id] });
      toast(res.edited ? "Vote updated" : `Vote submitted — thank you!`, "success");
    },
    onError: (e) =>
      setError(
        e instanceof ApiError
          ? isRetryable(e)
            ? `${e.message}. Your scores are kept: select Confirm & submit to send them again.`
            : e.message
          : "Submission failed"
      ),
  });
  // offline: TanStack pauses the mutation and sends it on reconnect; failures retry with backoff
  const queuedOffline = submit.isPending && submit.isPaused;
  const retrying = submit.isPending && !submit.isPaused && submit.failureCount > 0;

  if (!round || round.status === "PENDING") {
    return (
      <Card>
        <div data-testid="waiting-presenting">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Waiting for the moderator</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              {round
                ? "A team has been selected. Voting opens when the moderator starts the round."
                : "No team is presenting yet. Voting opens once the moderator picks the first team."}
              {" "}This screen updates on its own.
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
          <div>
            <div>
              <h2 className="text-base font-semibold text-ink-950">Voting is closed</h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                This round is complete. Wait for the results to be published.
              </p>
            </div>
          </div>
          <Link to={`/room/${roomId}/results`} className={buttonClass("secondary")}>
            View results
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
        <div data-testid="self-team">
          <div>
            <h2 className="text-base font-semibold text-ink-950">Your team is presenting</h2>
            <p className="mt-1 text-sm leading-relaxed text-ink-500">
              <strong className="font-medium text-ink-900">{myTeamName}</strong> is presenting now. You vote in
              the other teams' rounds.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (round.status === "PAUSED") {
    return (
      <Card className="border-[#fde68a] bg-[#fffbeb]">
        <div data-testid="voting-paused">
          <div>
            <h2 className="text-base font-semibold text-[#92400e]">Voting is paused</h2>
            <p className="mt-1 text-sm text-[#92400e]">The moderator paused this round. Your scores so far are kept.</p>
          </div>
        </div>
      </Card>
    );
  }

  const allAnswered = snap.categories.every((category) => !category.isRequired || scores[category.id] !== undefined);
  const submitted = savedVote != null;
  const teamName = snap.teams.find((team) => team.teamId === round.teamId)?.name;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-rule pb-4">
        <div>
          <h2 className="text-base font-semibold text-ink-950">Score {teamName}</h2>
          <p className="mt-0.5 text-sm text-ink-500">Tap a score, or drag the slider, for each category.</p>
        </div>
        {submitted && (
          <span className="inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-full bg-[#dcfae5] px-2.5 text-xs font-medium text-[#04250e]">
            <IconCheck size={11} strokeWidth={3} />
            Vote saved{savedVote && savedVote.revision > 1 ? ` · edited ${savedVote.revision - 1}×` : ""}
          </span>
        )}
      </div>

      {review ? (
        <div className="animate-fade-in pt-4">
          <h3 className="text-base font-semibold text-ink-950">Review your scores</h3>
          <p className="mt-1 text-sm text-ink-500">
            Editing later is {snap.room.settings.allowVoteEdit ? "possible while voting stays open" : "not possible"}.
          </p>
          <ul className="mt-4 overflow-hidden rounded-[10px] border border-line">
            {snap.categories.map((category) => (
              <li key={category.id} className="flex h-12 items-center justify-between gap-3 border-b border-rule px-4 text-sm last:border-b-0">
                <span className="text-ink-800">{category.name}</span>
                <span className="num inline-flex items-baseline gap-1">
                  <strong className="text-lg font-medium text-ink-950">{scores[category.id]}</strong>
                  <span className="text-xs text-ink-500">/{category.maxScore}</span>
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
              {queuedOffline ? "Waiting for connection…" : retrying ? "Reconnecting…" : submit.isPending ? "Submitting…" : "Confirm & submit"}
            </Button>
            {(queuedOffline || retrying) && (
              <span role="status" className="self-center text-[13px] text-[#92400e]">
                {queuedOffline
                  ? "You're offline. Your vote is queued and sends as soon as you reconnect. Keep this screen open."
                  : `Connection lost. Retrying automatically, attempt ${submit.failureCount} of 4. Keep this screen open.`}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-4">
          <div className="grid gap-3 lg:grid-cols-2">
            {snap.categories.map((category) => (
              <div key={category.id} className="rounded-[10px] border border-line p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium text-ink-950">
                    {category.name}
                    {!category.isRequired && <span className="ml-1.5 text-xs font-normal text-ink-500">optional</span>}
                  </p>
                  <span className="num text-xs text-ink-500">
                    {category.minScore} to {category.maxScore}
                  </span>
                </div>
                {category.description && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-500">{category.description}</p>}
                <div className="mt-3">
                  <SliderInput
                    min={category.minScore}
                    max={category.maxScore}
                    step={category.step}
                    value={scores[category.id]}
                    onChange={(value) => updateScores({ ...scores, [category.id]: value })}
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
            {!allAnswered && <span className="text-[13px] text-ink-500">Score every required category to continue.</span>}
          </div>
          {isModerator && <p className="mt-3 text-[13px] text-ink-500">Moderators without a team vote too.</p>}
        </div>
      )}
    </Card>
  );
}

interface MyVote {
  vote: { revision: number; scores: { categoryId: string; score: string | number }[] };
  submittedAt: string;
}

function readDraft(key: string | null): Record<string, number> {
  if (!key) return {};
  try {
    return JSON.parse(sessionStorage.getItem(key) ?? "{}");
  } catch {
    return {};
  }
}

function writeDraft(key: string | null, scores: Record<string, number> | null) {
  if (!key) return;
  try {
    if (scores) sessionStorage.setItem(key, JSON.stringify(scores));
    else sessionStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode / quota): the in-memory ballot still works
  }
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
          className="num grid h-11 w-14 shrink-0 place-items-center rounded-lg border border-line text-lg font-medium text-ink-950"
          aria-live="polite"
        >
          {value ?? "—"}
        </output>
      </div>
      {values.length <= 12 && (
        <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label={`Quick scores for ${label}`}>
          {values.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`num h-11 min-w-11 rounded-lg border px-2 text-sm font-medium transition-colors sm:h-9 sm:min-w-9 ${
                value === option
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-control bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50"
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

/* ================================= turnout ================================= */

/**
 * The room as dots: one mark per eligible voter, filled in the brand hue once
 * they've voted. Answers the moderator's question ("who has voted, can I
 * close?") with the room's own people, and lists who is still scoring.
 */
function Turnout({ roomId, roundId, teamName, connected }: { roomId: string; roundId: string; teamName: string; connected: boolean }) {
  const progressQ = useQuery({
    queryKey: ["progress", roomId, roundId],
    queryFn: () => api<any>(`/rooms/${roomId}/rounds/${roundId}/progress`),
    refetchInterval: connected ? 30_000 : 5_000, // vote:submitted drives updates; poll is the fallback
    refetchIntervalInBackground: true,
  });

  const heading = (
    <h2 id="turnout-heading" className="text-base font-semibold text-ink-950">
      Turnout
    </h2>
  );
  if (progressQ.isLoading)
    return (
      <div>
        <div className="mb-2">{heading}</div>
        <div className="rounded-[10px] border border-line p-5">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-4 h-2 w-full" />
          <Skeleton className="mt-5 h-24 w-full" />
        </div>
      </div>
    );
  if (progressQ.isError || !progressQ.data)
    return (
      <div>
        <div className="mb-2">{heading}</div>
        <p className="rounded-[10px] border border-line px-4 py-3 text-sm text-ink-700">
          Couldn't load turnout.{" "}
          <button type="button" className="font-medium underline underline-offset-4" onClick={() => progressQ.refetch()}>
            Try again
          </button>
        </p>
      </div>
    );

  const p = progressQ.data;
  const voters: { userId: string; name: string; username?: string; teamName: string | null; status: string }[] = p.voters;
  const pending = voters.filter((v) => v.status === "pending");
  const named = voters.some((v) => v.username);
  // initials fit up to ~80 people; a bigger room becomes a field of plain dots
  const size = voters.length <= 40 ? "h-10 w-10 text-xs" : voters.length <= 80 ? "h-8 w-8 text-[11px]" : "h-3.5 w-3.5";
  const big = voters.length <= 80;
  const excluded = p.excludedMembers?.length ?? 0;

  return (
    <div data-testid="progress-panel">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        {heading}
        {excluded > 0 && (
          <span className="text-xs text-ink-500">
            {excluded} on {teamName} can't vote this round
          </span>
        )}
      </div>
      <div className="rounded-[10px] border border-line p-5">
        <p className="flex flex-wrap items-baseline gap-x-2">
          <span data-testid="progress-count" className="num text-4xl leading-none text-ink-950">
            {p.votedCount}
          </span>
          <span className="num text-base text-ink-600">
            of {p.eligibleCount} voted, {p.percentage}%
          </span>
        </p>
        <ProgressBar value={p.percentage} className="mt-4" />

        <ul aria-label="Voters" className={`mt-5 flex flex-wrap ${big ? "gap-1.5" : "gap-1"}`}>
          {voters.map((v) => {
            const done = v.status === "voted";
            const label = named ? `${v.name}${v.teamName ? `, ${v.teamName}` : ""}: ${done ? "voted" : "waiting"}` : done ? "Voted" : "Waiting";
            return (
              <li
                key={v.userId}
                title={label}
                aria-label={label}
                className={`grid shrink-0 place-items-center rounded-full font-medium ${size} ${
                  done ? "bg-brand-500 text-white" : "border border-control bg-white text-ink-600"
                }`}
              >
                {big && named ? initials(v.name) : null}
              </li>
            );
          })}
        </ul>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-brand-500" /> Voted
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full border border-control" /> Waiting
          </span>
        </p>

        <div className="mt-5 border-t border-rule pt-4">
          {pending.length === 0 ? (
            <p className="text-sm text-ink-900">Everyone eligible has voted. You can close the round.</p>
          ) : named ? (
            <>
              <h3 className="text-sm font-medium text-ink-950">
                Still scoring <span className="num font-normal text-ink-500">{pending.length}</span>
              </h3>
              <ul className="mt-1">
                {pending.slice(0, 6).map((v) => (
                  <li key={v.userId} className="flex h-10 items-center justify-between gap-3 border-b border-rule text-sm last:border-0">
                    <span className="truncate text-ink-900">{v.name}</span>
                    <span className="shrink-0 text-[13px] text-ink-500">{v.teamName ?? "No team"}</span>
                  </li>
                ))}
              </ul>
              {pending.length > 6 && <p className="mt-2 text-[13px] text-ink-500">and {pending.length - 6} more</p>}
            </>
          ) : (
            <p className="text-sm text-ink-700">{pending.length} still scoring. Names are hidden in this room.</p>
          )}
        </div>
      </div>
    </div>
  );
}
