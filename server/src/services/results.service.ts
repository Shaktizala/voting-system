import { prisma } from "../db";
import { roomRepo } from "../repositories/room.repo";
import { categoryRepo } from "../repositories/category.repo";
import { audit } from "../repositories/audit.repo";
import { notFound } from "../utils/errors";
import { getSettings } from "./room.service";
import ExcelJS from "exceljs";
import type { Room } from "@prisma/client";

/* ========================================================================== */
/* Aggregation strategies (pluggable — add an entry to STRATEGIES)             */
/* ========================================================================== */

export interface CategoryAgg {
  categoryId: string;
  name: string;
  minScore: number;
  maxScore: number;
  weight: number;
  isRequired: boolean;
  /** real submitted scores; missing votes are excluded, never counted as zero */
  scores: number[];
  average: number | null; // in category units
  normalized: number | null; // average / maxScore (0..1)
}

export interface TeamResult {
  teamId: string;
  teamName: string;
  presentationOrder: number;
  votesReceived: number;
  categories: CategoryAgg[];
  /** 0–100 normalized weighted mean of category averages */
  overall: number | null;
  rank: number | null;
  flagged: boolean;
}

export interface AggregationStrategy {
  readonly id: string;
  categoryAverage(scores: number[]): number | null;
}

export const weightedMeanStrategy: AggregationStrategy = {
  id: "weighted_mean",
  categoryAverage(scores) {
    if (scores.length === 0) return null;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  },
};

export const trimmedMeanStrategy: AggregationStrategy = {
  id: "trimmed_mean",
  categoryAverage(scores) {
    if (scores.length === 0) return null;
    if (scores.length < 3) return weightedMeanStrategy.categoryAverage(scores);
    const sorted = [...scores].sort((a, b) => a - b);
    const trimmed = sorted.slice(1, -1); // drop one lowest and one highest per category
    return trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  },
};

const STRATEGIES: Record<string, AggregationStrategy> = {
  [weightedMeanStrategy.id]: weightedMeanStrategy,
  [trimmedMeanStrategy.id]: trimmedMeanStrategy,
};

export function getStrategy(id: string): AggregationStrategy {
  return STRATEGIES[id] ?? weightedMeanStrategy;
}

export const TIE_BREAK_TEXT =
  "Ties are broken by (1) higher overall score, (2) higher normalized score in the highest-weighted category, (3) more votes received; otherwise teams share a rank.";

/* ========================================================================== */
/* Ranking with the documented tie-break rule                                  */
/* ========================================================================== */

export function rankTeams(teams: TeamResult[]): TeamResult[] {
  const scored = teams.filter((t) => t.overall !== null);
  const unscored = teams.filter((t) => t.overall === null);
  scored.sort(compareTeams);
  let rank = 1;
  scored.forEach((t, i) => {
    if (i > 0 && compareTeams(scored[i - 1], t) !== 0) rank = i + 1;
    t.rank = rank;
  });
  // unscored teams have no rank (displayed as "—")
  return [...scored, ...unscored];
}

function compareTeams(a: TeamResult, b: TeamResult): number {
  if (a.overall !== b.overall) return (b.overall ?? 0) - (a.overall ?? 0);
  const heaviestOf = (t: TeamResult) =>
    [...t.categories].sort((x, y) => y.weight - x.weight)[0];
  const na = heaviestOf(a)?.normalized ?? 0;
  const nb = heaviestOf(b)?.normalized ?? 0;
  if (na !== nb) return nb - na;
  if (a.votesReceived !== b.votesReceived) return b.votesReceived - a.votesReceived;
  return 0; // shared rank
}

/* ========================================================================== */
/* Aggregation over stored votes                                               */
/* ========================================================================== */

export const resultsService = {
  /**
   * Full snapshot: per-team per-category averages, overall score and rank.
   * Calculation rules (see docs/DESIGN.md):
   *  - category average = mean of submitted scores for (team, category)
   *  - overall = Σ(weight_i × avg_i/max_i) / Σ(weight_i) × 100
   *  - missing votes excluded, participation shown alongside
   */
  async forRoom(roomId: string, roundId?: string) {
    const room = (await roomRepo.findById(roomId)) ?? null;
    if (!room) throw notFound("Room not found");
    const settings = getSettings(room);
    const strategy = getStrategy(settings.aggregationMethod);

    const roomTeams = await roomRepo.listRoomTeams(roomId);
    const rounds = await prisma.votingRound.findMany({
      where: { roomId, ...(roundId ? { id: roundId } : {}) },
    });
    const roundIds = rounds.map((r) => r.id);
    const votes = await prisma.vote.findMany({
      where: { roomId, ...(roundId ? { roundId } : {}) },
      include: { scores: { include: { category: true } } },
    });

    // categories in scope: display order from the room's current config
    const orderedCategories =
      roundId && rounds[0]
        ? await prisma.category.findMany({
            where: { roomId, configVersionId: rounds[0].configVersionId },
            orderBy: { displayOrder: "asc" },
          })
        : await categoryRepo.listForRoom(roomId);
    const orderIndex = new Map(orderedCategories.map((c, i) => [c.id, i]));

    const teams: TeamResult[] = roomTeams.map((rt) => {
      const teamVotes = votes.filter((v) => v.teamId === rt.teamId);

      // collect scores per category (union across submitted votes)
      const byCategory = new Map<string, number[]>();
      const catInfo = new Map<string, { name: string; minScore: number; maxScore: number; weight: number; isRequired: boolean }>();
      for (const v of teamVotes) {
        for (const s of v.scores) {
          if (!byCategory.has(s.categoryId)) byCategory.set(s.categoryId, []);
          byCategory.get(s.categoryId)!.push(Number(s.score));
          catInfo.set(s.categoryId, {
            name: s.category.name,
            minScore: s.category.minScore,
            maxScore: s.category.maxScore,
            weight: Number(s.category.weight),
            isRequired: s.category.isRequired,
          });
        }
      }

      const categories: CategoryAgg[] = [...byCategory.entries()]
        .map(([categoryId, scores]) => {
          const info = catInfo.get(categoryId)!;
          const avg = strategy.categoryAverage(scores);
          const normalized = avg !== null ? avg / info.maxScore : null;
          return {
            categoryId,
            name: info.name,
            minScore: info.minScore,
            maxScore: info.maxScore,
            weight: info.weight,
            isRequired: info.isRequired,
            scores,
            average: avg !== null ? round4(avg) : null,
            normalized: normalized !== null ? round4(normalized) : null,
          };
        })
        .sort((a, b) => (orderIndex.get(a.categoryId) ?? 999) - (orderIndex.get(b.categoryId) ?? 999));

      const weightSum = categories.reduce((s, c) => s + c.weight, 0);
      const overall =
        weightSum > 0 && categories.some((c) => c.normalized !== null)
          ? round4((categories.reduce((s, c) => s + (c.normalized ?? 0) * c.weight, 0) / weightSum) * 100)
          : null;

      return {
        teamId: rt.teamId,
        teamName: rt.team.name,
        presentationOrder: rt.presentationOrder,
        votesReceived: teamVotes.length,
        categories,
        overall,
        rank: null,
        flagged: teamVotes.length < settings.minVotesThreshold || teamVotes.length === 0,
      };
    });

    const ranked = rankTeams(teams);
    const eligible = await eligibleVoters(roomId);
    return {
      roomId,
      roomName: room.name,
      publishedAt: room.publishedAt,
      aggregationMethod: strategy.id,
      tieBreakRule: TIE_BREAK_TEXT,
      minVotesThreshold: settings.minVotesThreshold,
      participation: {
        totalRounds: rounds.length,
        closedRounds: rounds.filter((r) => r.status === "CLOSED").length,
        submittedVotes: votes.length,
        eligibleVoters: eligible,
        submittedReal: votes.filter((v) => roundIds.includes(v.roundId)).length,
      },
      teams: ranked,
    };
  },

  async publish(roomId: string, publish: boolean, actorId: string, ip?: string) {
    const room = await roomRepo.findById(roomId);
    if (!room) throw notFound("Room not found");
    const updated = await roomRepo.update(roomId, { publishedAt: publish ? new Date() : null });
    audit({ actorId, action: publish ? "results.publish" : "results.unpublish", entityType: "room", entityId: roomId, ip });
    const { rtEvents } = await import("../realtime/emit");
    if (updated.publishedAt) {
      rtEvents.resultsPublished(roomId, { roomId, publishedAt: updated.publishedAt.toISOString() });
    }
    return updated;
  },

  /** Participant-visible results (own team only until published). */
  async forParticipant(roomId: string, userId: string) {
    const room = (await roomRepo.findById(roomId)) ?? null;
    if (!room) throw notFound("Room not found");
    const isPublished = room.publishedAt !== null;
    const settings = getSettings(room);
    if (!isPublished && !settings.liveResults) {
      return { visible: false as const, reason: "not_published", results: null };
    }
    const full = await this.forRoom(roomId);
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId, userId } },
    });
    const ownTeamId = membership?.teamId ?? null;
    if (!isPublished && ownTeamId) {
      const own = full.teams.find((t) => t.teamId === ownTeamId);
      return {
        visible: true as const,
        scope: "own_team" as const,
        aggregationMethod: full.aggregationMethod,
        results: own ? [own] : [],
      };
    }
    return {
      visible: true as const,
      scope: isPublished ? ("published" as const) : ("live" as const),
      aggregationMethod: full.aggregationMethod,
      results: full.teams,
    };
  },

  /* ------------------------------ exports -------------------------------- */

  async exportResults(roomId: string, kind: "summary" | "categories" | "raw", format: "csv" | "xlsx") {
    const room = (await roomRepo.findById(roomId)) ?? null;
    if (!room) throw notFound("Room not found");
    const full = await this.forRoom(roomId);

    let rows: string[][];
    let filename: string;

    if (kind === "raw") {
      const votes = await prisma.vote.findMany({
        where: { roomId },
        include: { scores: { include: { category: true } }, voter: true, team: true, round: true },
        orderBy: { submittedAt: "asc" },
      });
      const settings = getSettings(room);
      rows = [["round_id", "round_status", "team", "voter", "revision", "submitted_at", "category", "category_max", "score"]];
      for (const v of votes) {
        for (const s of v.scores) {
          rows.push([
            v.roundId,
            v.round.status,
            v.team.name,
            settings.adminCanSeeVoterIdentity ? v.voter.username : "anonymous",
            String(v.revision),
            v.submittedAt.toISOString(),
            s.category.name,
            String(s.category.maxScore),
            String(s.score),
          ]);
        }
      }
      filename = `results_raw`;
    } else if (kind === "categories") {
      rows = [["team", "category", "average", "normalized", "weight", "max_score", "votes"]];
      for (const t of full.teams) {
        for (const c of t.categories) {
          rows.push([
            t.teamName,
            c.name,
            c.average !== null ? String(c.average) : "",
            c.normalized !== null ? String(c.normalized) : "",
            String(c.weight),
            String(c.maxScore),
            String(c.scores.length),
          ]);
        }
      }
      filename = `results_by_category`;
    } else {
      rows = [["rank", "team", "overall_score", "votes_received", "flagged", "participation_note"]];
      for (const t of full.teams) {
        rows.push([
          t.rank !== null ? String(t.rank) : "",
          t.teamName,
          t.overall !== null ? String(t.overall) : "",
          String(t.votesReceived),
          t.flagged ? "flagged" : "",
          `${t.votesReceived}/${full.participation.eligibleVoters}`,
        ]);
      }
      filename = `results_summary`;
    }

    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Results");
      rows.forEach((r) => ws.addRow(r));
      const buf = await wb.xlsx.writeBuffer();
      return { contentType: XLSX_TYPE, filename: `${filename}_${room.joinCode}.xlsx`, buffer: Buffer.from(buf as ArrayBuffer) };
    }
    const csv = rows.map((r) => r.map(escapeCsv).join(",")).join("\n");
    return { contentType: "text/csv", filename: `${filename}_${room.joinCode}.csv`, buffer: Buffer.from(csv) };
  },
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

async function eligibleVoters(roomId: string): Promise<number> {
  return prisma.roomMember.count({
    where: { roomId, user: { status: "ACTIVE", deletedAt: null } },
  });
}

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function escapeCsv(v: string): string {
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export type { Room };
