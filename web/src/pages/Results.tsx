import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api, download } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { useToast } from "../contexts/Toast";
import {
  Button,
  buttonClass,
  Card,
  DataTable,
  EmptyState,
  LabelledSelect,
  PageTitle,
  ProgressBar,
  SectionHeading,
  Skeleton,
  StatCard,
  StatusBadge,
} from "../components/ui";
import {
  IconArrowLeft,
  IconChart,
  IconDownload,
  IconMedal,
  IconTrophy,
  IconUsers,
  IconVote,
} from "../components/icons";

interface TeamResult {
  teamId: string;
  teamName: string;
  votesReceived: number;
  overall: number | null;
  rank: number | null;
  flagged: boolean;
  categories: { categoryId: string; name: string; average: number | null; normalized: number | null; weight: number; scores: number[] }[];
}

const CHART_COLORS = ["#6c5ce7", "#16b98a", "#ee9a12", "#2f9bff", "#f43f55", "#8d7cff"];

export default function Results({ self = false }: { self?: boolean }) {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [roundFilter, setRoundFilter] = useState("");

  // full results are admin + room-moderator only; a global MODERATOR who is a plain
  // participant in this room gets the publish-gated view like everyone else
  const membershipQ = useQuery({
    queryKey: ["my-membership", roomId],
    queryFn: () => api<{ membership: { role: string } | null }>(`/rooms/${roomId}/my-membership`),
    enabled: user!.role === "MODERATOR" && !self && !!roomId,
  });
  const accessKnown = user!.role !== "MODERATOR" || self || !membershipQ.isPending;
  const isParticipant =
    self || user!.role === "PARTICIPANT" || (user!.role === "MODERATOR" && membershipQ.data?.membership?.role !== "MODERATOR");
  const path = isParticipant ? `/rooms/${roomId}/my-results` : `/rooms/${roomId}/results`;
  const resultsQ = useQuery<any>({
    queryKey: [path, roundFilter],
    queryFn: () => api(path.replace("/results", `/results${""}`) + (isParticipant ? "" : `${roundFilter ? `?roundId=${roundFilter}` : ""}`)),
    enabled: accessKnown,
  });

  const roundsQ = useQuery({
    queryKey: ["rounds", roomId],
    queryFn: () => api<{ rounds: any[] }>(`/rooms/${roomId}/rounds`),
    enabled: accessKnown && !isParticipant,
  });

  const publish = useMutation({
    mutationFn: (value: boolean) => api(`/rooms/${roomId}/results/publish`, { body: { publish: value } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["snapshot", roomId] });
      toast("Results visibility updated", "success");
    },
  });

  const doExport = async (kind: string, format: string) => {
    try {
      const b = await download(`/rooms/${roomId}/results/export?kind=${kind}&format=${format}`);
      const url = URL.createObjectURL(b.blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = b.filename;
      a.click();
      URL.revokeObjectURL(url);
      toast("Export downloaded", "success");
    } catch {
      toast("Export failed — you may lack permission", "error");
    }
  };

  if (resultsQ.isPending) return <Skeleton className="h-96 rounded-2xl" />;
  const data = resultsQ.data;
  if (isParticipant && !data?.visible) {
    return <EmptyState title="Results not published yet" hint="The moderator will publish results when voting completes." icon={<IconChart size={22} />} />;
  }

  const teams: TeamResult[] = isParticipant ? data.results : data.teams;

  // one row per category, one series per team
  const categoryNames = [...new Set(teams.flatMap((team) => team.categories.map((category) => category.name)))];
  const rows = categoryNames.map((name) => {
    const row: Record<string, string | number> = { category: name };
    for (const team of teams) {
      const category = team.categories.find((entry) => entry.name === name);
      if (category && category.average !== null) row[team.teamName] = Math.round(category.average * 100) / 100;
    }
    return row;
  });

  const podium = [...teams]
    .filter((team) => team.rank !== null)
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .slice(0, 3);

  return (
    <>
      <PageTitle
        eyebrow="Analytics"
        title="Results and analytics"
        subtitle={data.tieBreakRule}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isParticipant &&
              (data.publishedAt ? <StatusBadge status="ACTIVE" /> : <StatusBadge status="not_published" />)}
            <Link to={isParticipant ? "/rooms" : `/room/${roomId}`} className={buttonClass("secondary", "py-2 text-xs")}>
              <IconArrowLeft size={14} />
              Back to room
            </Link>
          </div>
        }
      />

      {!isParticipant && (
        <Card className="mb-4 p-0">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            <div className="border-b border-line p-5 lg:border-b-0 lg:border-r">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Visibility</p>
              <p className="mt-1.5 text-[13px] text-ink-500">
                {data.publishedAt
                  ? "Results are visible to participants."
                  : "Results are private until you publish them."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button data-testid="publish-results" onClick={() => publish.mutate(true)} disabled={!!data.publishedAt} className="py-2 text-xs">
                  Publish results
                </Button>
                <Button variant="secondary" onClick={() => publish.mutate(false)} disabled={!data.publishedAt} className="py-2 text-xs">
                  Unpublish
                </Button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">Export &amp; filter</p>
                <div className="w-full sm:w-56">
                  <LabelledSelect label="" value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
                    <option value="">All rounds</option>
                    {roundsQ.data?.rounds.map((round) => (
                      <option key={round.id} value={round.id}>{round.roomTeam?.team?.name ?? round.teamId} · {round.status}</option>
                    ))}
                  </LabelledSelect>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Button variant="secondary" className="py-2 text-xs" onClick={() => doExport("summary", "csv")}>
                  <IconDownload size={13} />
                  Export summary (CSV)
                </Button>
                <Button variant="secondary" className="py-2 text-xs" onClick={() => doExport("summary", "xlsx")}>
                  <IconDownload size={13} />
                  Export summary (XLSX)
                </Button>
                <Button variant="secondary" className="py-2 text-xs" onClick={() => doExport("categories", "xlsx")}>
                  <IconDownload size={13} />
                  Per category (XLSX)
                </Button>
                <Button variant="ghost" className="py-2 text-xs" onClick={() => doExport("raw", "csv")}>
                  <IconDownload size={13} />
                  Raw votes (CSV)
                </Button>
              </div>
            </div>
          </div>
        </Card>
      )}

      {!isParticipant && (
        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard label="Votes stored" value={data.participation?.submittedVotes ?? "—"} icon={<IconVote size={18} />} tone="brand" />
          <StatCard label="Rounds" value={data.participation?.totalRounds ?? "—"} icon={<IconChart size={18} />} tone="ocean" />
          <StatCard label="Voting members" value={data.participation?.eligibleVoters ?? "—"} icon={<IconUsers size={18} />} tone="jade" />
          <StatCard label="Closed rounds" value={data.participation?.closedRounds ?? "—"} icon={<IconTrophy size={18} />} tone="gold" />
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState title="No votes yet" hint="Scores appear as soon as rounds are completed." icon={<IconChart size={22} />} />
      ) : (
        <>
          {podium.length > 0 && (
            <div className="mb-5">
              <SectionHeading title="Top performers" description="Ranked by weighted overall score." />
              <div className="grid gap-3 sm:grid-cols-3">
                {podium.map((team, index) => {
                  const first = index === 0;
                  return (
                    <div
                      key={team.teamId}
                      className={`relative overflow-hidden rounded-2xl border p-5 shadow-card ${
                        first
                          ? "border-transparent bg-ink-950 text-white"
                          : "border-line bg-white text-ink-900"
                      }`}
                    >
                      {first && (
                        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
                          <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-gold-400/25 blur-3xl" />
                        </div>
                      )}
                      <div className="relative">
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                              first
                                ? "bg-gold-400/15 text-gold-200 ring-1 ring-inset ring-gold-400/25"
                                : "bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200"
                            }`}
                          >
                            <IconMedal size={12} />
                            Rank {team.rank}
                          </span>
                          {first && <IconTrophy size={20} className="text-gold-300" />}
                        </div>
                        <p className={`mt-3 font-display text-lg font-semibold ${first ? "text-white" : "text-ink-900"}`}>
                          {team.teamName}
                        </p>
                        <div className="mt-3 flex items-baseline gap-1">
                          <span className={`font-display text-3xl font-semibold ${first ? "text-white" : "text-ink-950"}`}>
                            {team.overall !== null ? Math.round(team.overall * 100) / 100 : "—"}
                          </span>
                          <span className={`text-[11px] ${first ? "text-white/40" : "text-ink-400"}`}>/ 100</span>
                        </div>
                        <p className={`mt-1 text-[11px] ${first ? "text-white/40" : "text-ink-400"}`}>
                          {team.votesReceived} vote{team.votesReceived === 1 ? "" : "s"} received
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <Card className="mb-5">
            <SectionHeading title="Category comparison" description="Average score per category, by team." />
            <ResponsiveContainer width="100%" height={330}>
              <BarChart data={rows} margin={{ top: 8, right: 12, left: -14, bottom: 0 }} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eeedf5" vertical={false} />
                <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#6d6884" }} axisLine={{ stroke: "#e7e4f1" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#928da9" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e7e4f1",
                    boxShadow: "0 14px 36px -20px rgb(43 33 95 / 0.22)",
                    fontSize: 12,
                  }}
                  cursor={{ fill: "rgb(108 92 231 / 0.05)" }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} iconType="circle" iconSize={8} />
                {teams.map((team, index) => (
                  <Bar key={team.teamId} dataKey={team.teamName} fill={CHART_COLORS[index % CHART_COLORS.length]} radius={[6, 6, 0, 0]} maxBarSize={44} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <SectionHeading title="Ranking" description="Full breakdown of every team's result." count={teams.length} />
          <DataTable head={["Rank", "Team", "Overall (0–100)", "Votes", "Flagged", isParticipant ? "" : "Per-category"]}>
            {[...teams]
              .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
              .map((team) => (
                <tr key={team.teamId}>
                  <td className="px-4 py-3.5">
                    <span
                      className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold ${
                        team.rank === 1
                          ? "bg-gold-100 text-gold-800 ring-1 ring-inset ring-gold-200"
                          : team.rank === 2
                            ? "bg-ink-100 text-ink-700 ring-1 ring-inset ring-ink-200"
                            : team.rank === 3
                              ? "bg-gold-50 text-gold-700 ring-1 ring-inset ring-gold-200"
                              : "bg-ink-50 text-ink-500 ring-1 ring-inset ring-line"
                      }`}
                    >
                      {team.rank ?? "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="flex items-center gap-2.5">
                      <span aria-hidden="true" className="h-7 w-7 shrink-0 rounded-full bg-gradient-to-br from-brand-200 to-brand-400" />
                      <span className="font-medium text-ink-900">{team.teamName}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="block font-display text-sm font-semibold text-ink-900">
                      {team.overall !== null ? Math.round(team.overall * 100) / 100 : "—"}
                    </span>
                    <ProgressBar value={team.overall ?? 0} className="mt-1.5 h-1.5 w-24" />
                  </td>
                  <td className="px-4 py-3.5 text-ink-600">{team.votesReceived}</td>
                  <td className="px-4 py-3.5">
                    {team.flagged ? (
                      <span className="inline-flex rounded-full bg-gold-50 px-2 py-0.5 text-[10px] font-semibold text-gold-700 ring-1 ring-inset ring-gold-200">
                        Below threshold
                      </span>
                    ) : (
                      <span className="text-xs text-ink-300">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex max-w-xs flex-wrap gap-1">
                      {team.categories.map((category) => (
                        <span
                          key={category.categoryId}
                          className="rounded-md bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-500 ring-1 ring-inset ring-line"
                          title={`${category.name}: ${category.average ?? "—"}`}
                        >
                          {category.name}: <strong className="font-semibold text-ink-700">{category.average ?? "—"}</strong>
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
          </DataTable>
        </>
      )}

      <Link
        to={isParticipant ? "/rooms" : `/room/${roomId}`}
        className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-700"
      >
        <IconArrowLeft size={14} />
        {isParticipant ? "Back to my rooms" : "Back to room"}
      </Link>
    </>
  );
}
