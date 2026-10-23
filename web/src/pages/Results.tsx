import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { api, download } from "../lib/api";
import { useAuth } from "../contexts/Auth";
import { useToast } from "../contexts/Toast";
import { Button, Card, EmptyState, LabelledSelect, PageTitle, Skeleton, StatusBadge, DataTable } from "../components/ui";

interface TeamResult {
  teamId: string;
  teamName: string;
  votesReceived: number;
  overall: number | null;
  rank: number | null;
  flagged: boolean;
  categories: { categoryId: string; name: string; average: number | null; normalized: number | null; weight: number; scores: number[] }[];
}

export default function Results({ self = false }: { self?: boolean }) {
  const { roomId } = useParams<{ roomId: string }>();
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [roundFilter, setRoundFilter] = useState("");

  const isParticipant = user!.role === "PARTICIPANT" || self;
  const path = isParticipant ? `/rooms/${roomId}/my-results` : `/rooms/${roomId}/results`;
  const resultsQ = useQuery<any>({
    queryKey: [path, roundFilter],
    queryFn: () => api(path.replace("/results", `/results${""}`) + (isParticipant ? "" : `${roundFilter ? `?roundId=${roundFilter}` : ""}`)),
  });

  const roundsQ = useQuery({
    queryKey: ["rounds", roomId],
    queryFn: () => api<{ rounds: any[] }>(`/rooms/${roomId}/rounds`),
    enabled: !isParticipant,
  });

  const publish = useMutation({
    mutationFn: (v: boolean) => api(`/rooms/${roomId}/results/publish`, { body: { publish: v } }),
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

  if (resultsQ.isLoading) return <Skeleton className="h-96" />;
  const data = resultsQ.data;
  if (isParticipant && !data?.visible) {
    return <EmptyState title="Results not published yet" hint="The moderator will publish results when voting completes." />;
  }

  const teams: TeamResult[] = isParticipant ? data.results : data.teams;

  // one row per category, one series per team
  const categoryNames = [...new Set(teams.flatMap((t) => t.categories.map((c) => c.name)))];
  const rows = categoryNames.map((name) => {
    const row: Record<string, string | number> = { category: name };
    for (const t of teams) {
      const c = t.categories.find((x) => x.name === name);
      if (c && c.average !== null) row[t.teamName] = Math.round(c.average * 100) / 100;
    }
    return row;
  });

  return (
    <>
      <PageTitle
        title="Results and analytics"
        subtitle={data.tieBreakRule}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!isParticipant && data.publishedAt ? (
              <StatusBadge status="ACTIVE" />
            ) : (
              !isParticipant && <StatusBadge status="not_published" />
            )}
          </div>
        }
      />

      {!isParticipant && (
        <Card className="mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button data-testid="publish-results" onClick={() => publish.mutate(true)} disabled={!!data.publishedAt}>Publish results</Button>
            <Button variant="secondary" onClick={() => publish.mutate(false)} disabled={!data.publishedAt}>Unpublish</Button>
            <Button variant="secondary" onClick={() => doExport("summary", "csv")}>Export summary (CSV)</Button>
            <Button variant="secondary" onClick={() => doExport("summary", "xlsx")}>Export summary (XLSX)</Button>
            <Button variant="secondary" onClick={() => doExport("categories", "xlsx")}>Per category (XLSX)</Button>
            <Button variant="secondary" onClick={() => doExport("raw", "csv")}>Raw votes (CSV)</Button>
            <LabelledSelect label="Round" value={roundFilter} onChange={(e) => setRoundFilter(e.target.value)}>
              <option value="">All rounds</option>
              {roundsQ.data?.rounds.map((r) => (
                <option key={r.id} value={r.id}>{r.roomTeam?.team?.name ?? r.teamId} · {r.status}</option>
              ))}
            </LabelledSelect>
          </div>
        </Card>
      )}

      {!isParticipant && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card><p className="text-2xl font-bold">{data.participation?.submittedVotes ?? "—"}</p><p className="text-sm text-gray-500">Votes stored</p></Card>
          <Card><p className="text-2xl font-bold">{data.participation?.totalRounds ?? "—"}</p><p className="text-sm text-gray-500">Rounds</p></Card>
          <Card><p className="text-2xl font-bold">{data.participation?.eligibleVoters ?? "—"}</p><p className="text-sm text-gray-500">Eligible voters</p></Card>
          <Card><p className="text-2xl font-bold">{data.participation?.closedRounds ?? "—"}</p><p className="text-sm text-gray-500">Closed rounds</p></Card>
        </div>
      )}

      {teams.length === 0 ? (
        <EmptyState title="No votes yet" hint="Scores appear as soon as rounds are completed." />
      ) : (
        <>
          <Card className="mb-4">
            <h2 className="mb-2 font-semibold">Category comparison</h2>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={rows} margin={{ top: 8, right: 12, left: -14, bottom: 0 }}>
                <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                {teams.map((t, i) => (
                  <Bar key={t.teamId} dataKey={t.teamName} fill={["#2563eb", "#059669", "#d97706", "#7c3aed", "#dc2626", "#0891b2"][i % 6]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>

          <h2 className="mb-2 font-semibold">Ranking</h2>
          <DataTable head={["Rank", "Team", "Overall (0–100)", "Votes", "Flagged", isParticipant ? "" : "Per-category"]}>
            {teams.map((t) => (
              <tr key={t.teamId} className="border-t border-gray-100">
                <td className="px-3 py-2 font-bold">{t.rank ?? "—"}</td>
                <td className="px-3 py-2 font-medium">{t.teamName}</td>
                <td className="px-3 py-2">{t.overall !== null ? Math.round(t.overall * 100) / 100 : "—"}</td>
                <td className="px-3 py-2">{t.votesReceived}</td>
                <td className="px-3 py-2">{t.flagged ? "⚠ below threshold / no votes" : ""}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {t.categories.map((c) => `${c.name}: ${c.average ?? "—"}`).join(" · ")}
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
      <Link to={isParticipant ? "/rooms" : `/room/${roomId}`} className="mt-4 inline-block text-sm text-blue-700 hover:underline">← Back</Link>
    </>
  );
}
