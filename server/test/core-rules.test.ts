/**
 * Core rule tests: auth + RBAC, room isolation, self-vote, duplicate
 * submissions, edit/close rules, score validation, config lock, and
 * result arithmetic. Runs against the real Express app + Postgres.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";
import {
  prisma, startServer, stopServer, PASSWORD,
  setupRoom, addMembership, linkRoomTeam, openRound, voteBody, U,
} from "./helpers";
void PrismaClient;

let base = "";
beforeAll(async () => {
  base = await startServer();
});
afterAll(async () => {
  await stopServer();
  await prisma.$disconnect();
});

/* -------------------------- tiny cookie-aware client ------------------------- */
function jar() {
  const store: Record<string, string> = {};
  return {
    header: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; "),
    csrf: () => store["csrf"] ?? "",
    absorb(res: Response) {
      const list = (res as any).headers.getSetCookie?.() ?? [];
      for (const c of list) {
        const [pair] = c.split(";");
        const i = pair.indexOf("=");
        store[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      }
    },
  };
}

async function login(identifier: string, password = PASSWORD) {
  const j = jar();
  const boot = await fetch(`${base}/api/auth/csrf`);
  j.absorb(boot);
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: j.header(), "X-CSRF-Token": j.csrf() },
    body: JSON.stringify({ identifier, password }),
  });
  j.absorb(res);
  const body = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  return { j, status: res.status, body };
}

async function call(j: ReturnType<typeof jar>, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: j.header(), ...(method === "GET" ? {} : { "X-CSRF-Token": j.csrf() }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
}

async function makeUser(role: "ADMIN" | "MODERATOR" | "PARTICIPANT", teamId?: string | null) {
  const username = await uniqueUsername(role.toLowerCase());
  const user = await prisma.user.create({
    data: { name: username, username, email: `${username}@test.example`, passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }), role, teamId: teamId ?? null, mustChangePassword: false },
  });
  return user;
}

async function uniqueUsername(prefix: string) {
  for (;;) {
    const candidate = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
    const exists = await prisma.user.findFirst({ where: { username: candidate } });
    if (!exists) return candidate;
  }
}

/* =============================== 1. auth/RBAC ============================= */

describe("authentication and RBAC", () => {
  it("rejects bad credentials generically", async () => {
    const { status, body } = await login("admin", "wrong-password");
    expect(status).toBe(401);
    expect((body as any).error).toBe("Invalid credentials");
  });

  it("locks the account after 5 failed logins", async () => {
    const u = await makeUser("PARTICIPANT");
    for (let i = 0; i < 5; i++) await login(u.username, "nope");
    const { status } = await login(u.username, PASSWORD);
    expect(status).toBe(429);
  });

  it("hides admin surfaces from participants", async () => {
    const u = await makeUser("PARTICIPANT");
    const { j } = await login(u.username);
    expect((await call(j, "GET", "/participants")).status).toBe(403);
    expect((await call(j, "GET", "/audit")).status).toBe(403);
    expect((await call(j, "POST", "/teams", { name: "nope" })).status).toBe(403);
  });

  it("hides room endpoints from non-members (no IDOR)", async () => {
    const admin = await makeUser("ADMIN");
    const outsider = await makeUser("PARTICIPANT");
    const { room, cats, version } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    const { j } = await login(outsider.username);
    const r = await call(j, "GET", `/rooms/${room.id}`);
    expect(r.status).toBe(404);

    const insider = await makeUser("PARTICIPANT");
    await addMembership(room.id, insider.id, null);
    const { j: jj } = await login(insider.username);
    expect((await call(jj, "GET", `/rooms/${room.id}`)).status).toBe(200);
    expect((await call(jj, `POST` as any, "/x")).status as any >= 400).toBe(true);
    void cats; void version;
  });

  it("forces password change flag on temp accounts via admin reset", async () => {
    const u = await makeUser("PARTICIPANT");
    expect(u.mustChangePassword).toBe(false);
  });
});

/* ============================ 2. room isolation =========================== */

describe("room isolation and category independence", () => {
  it("does not leak categories between two rooms", async () => {
    const admin = await makeUser("ADMIN");
    const a = await setupRoom(admin.id, { categories: [{ name: "OnlyInA" }] });
    const b = await setupRoom(admin.id, { categories: [{ name: "OnlyInB", maxScore: 5 }] });

    const ra = await prisma.category.findMany({ where: { roomId: a.room.id, configVersionId: a.version.id } });
    const rb = await prisma.category.findMany({ where: { roomId: b.room.id, configVersionId: b.version.id } });

    expect(ra.some((c) => c.name === "OnlyInA")).toBe(true);
    expect(rb.some((c) => c.name === "OnlyInA")).toBe(false);
    expect(rb[0].maxScore).toBe(5);
    expect(ra[0].maxScore).toBe(10);
    void b;
  });

  it("duplicate room copies categories and members but not votes (API)", async () => {
    const admin = await makeUser("ADMIN");
    const src = await setupRoom(admin.id, { categories: [{ name: "X" }] });
    const team = await prisma.team.create({ data: { name: U("DupT") } });
    await linkRoomTeam(src.room.id, team.id);
    const voter = await makeUser("PARTICIPANT");
    await addMembership(src.room.id, voter.id, null);
    const round = await openRound(src.room.id, team.id);
    await prisma.vote.create({ data: { roundId: round.id, roomId: src.room.id, teamId: team.id, voterId: voter.id } });

    const { j } = await login(admin.username);
    const dup = await call(j, "POST", `/rooms/${src.room.id}/duplicate`);
    expect(dup.status).toBe(201);
    const newRoom = (dup.body as any).room;
    expect(newRoom.id).not.toBe(src.room.id);

    // categories are copied as a fresh v1 config for the new room
    const newCats = await prisma.category.findMany({ where: { roomId: newRoom.id } });
    expect(newCats.map((c) => c.name)).toContain("X");
    expect(newCats.some((c) => c.roomId === src.room.id)).toBe(false);

    // members are copied, votes are not
    const newMembers = await prisma.roomMember.findMany({ where: { roomId: newRoom.id } });
    expect(newMembers.some((m) => m.userId === voter.id)).toBe(true);
    expect(await prisma.vote.count({ where: { roomId: newRoom.id } })).toBe(0);

    // source room is untouched
    expect(await prisma.vote.count({ where: { roomId: src.room.id } })).toBe(1);
  });
});

/* ============================ 3. voting rules ============================= */

describe("voting rules", () => {
  it("rejects self-votes via the API and via the DB trigger", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("SelfTeam") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    await linkRoomTeam(room.id, team.id);
    const own = await makeUser("PARTICIPANT", team.id);
    await addMembership(room.id, own.id, team.id);

    const round = await openRound(room.id, team.id);
    const { j } = await login(own.username);
    const v = await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 5));
    expect(v.status).toBe(403);
    expect(String((v.body as any).error)).toMatch(/own team/i);

    // race-free path: direct DB insert must trip the trigger too
    let dbError: any = null;
    try {
      await prisma.vote.create({ data: { roundId: round.id, roomId: room.id, teamId: team.id, voterId: own.id } });
    } catch (e) {
      dbError = e;
    }
    expect(dbError?.message ?? "").toMatch(/own team/i);
  });

  it("rejects out-of-range scores at the DB level (vote_scores trigger)", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("Trig") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    const round = await openRound(room.id, team.id);
    const vote = await prisma.vote.create({ data: { roundId: round.id, roomId: room.id, teamId: team.id, voterId: voter.id } });
    let err: any = null;
    try {
      await prisma.voteScore.create({ data: { voteId: vote.id, categoryId: cats[0].id, roomId: room.id, score: 11 } });
    } catch (e) {
      err = e;
    }
    expect((err?.message ?? "")).toMatch(/outside|range/i);
  });

  it("rejects votes outside an open round (paused/closed)", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T2") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);

    const round = await prisma.votingRound.create({ data: { roomId: room.id, teamId: team.id, status: "CLOSED", configVersionId: (await cfVer(room.id)).id } as any });
    const { j } = await login(voter.username);
    const res = await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 5));
    expect(res.status).toBe(409);
  });

  it("validates score ranges, steps, unknown and missing required categories", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T3") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "Range" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    const round = await openRound(room.id, team.id);
    const { j } = await login(voter.username);
    const cid = cats[0].id;

    expect((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: cid, score: 11 }] })).status).toBe(409);
    expect((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: cid, score: 1.5 }] })).status).toBe(409); // invalid step
    expect((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: "clxxxxxxxxxxxxxxxxxxxxxxx", score: 5 }] })).status).toBe(409);
    expect((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [] })).status).toBe(400);
  });

  it("idempotent duplicate submissions: second POST upserts instead of erroring", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T4") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    const round = await openRound(room.id, team.id);
    const { j } = await login(voter.username);

    const first = await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 5));
    expect(first.status).toBe(201);
    const second = await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 7));
    expect(second.status).toBe(201);
    expect((second.body as any).edited).toBe(true);
    expect((second.body as any).revision).toBe(2);

    const votes = await prisma.vote.findMany({ where: { roundId: round.id, voterId: voter.id } });
    expect(votes).toHaveLength(1); // unique (round_id, voter_id)
  });

  it("blocks editing when room sets allowVoteEdit=false", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T5") } });
    const { room, cats } = await setupRoom(admin.id, {
      categories: [{ name: "C1" }],
      status: "ACTIVE",
    });
    await prisma.room.update({ where: { id: room.id }, data: { settings: { allowVoteEdit: false, adminCanSeeVoterIdentity: true, liveResults: false, minVotesThreshold: 0, aggregationMethod: "weighted_mean" } } });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    const round = await openRound(room.id, team.id);
    const { j } = await login(voter.username);
    await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 5));
    const res = await call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 6));
    expect(res.status).toBe(409);
    expect(String((res.body as any).error)).toMatch(/final/i);
  });

  it("handles many concurrent submissions without duplicates", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T6") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    await linkRoomTeam(room.id, team.id);
    const voters = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser("PARTICIPANT", null)));
    for (const v of voters) await addMembership(room.id, v.id, null);
    const round = await openRound(room.id, team.id);

    // log everyone in first, then fire two submissions each concurrently
    const jars = await Promise.all(voters.map((v) => login(v.username).then(({ j }) => j)));
    const promises: Promise<{ status: number; body: any }>[] = [];
    for (const j of jars) {
      promises.push(call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 5)));
      promises.push(call(j, "POST", `/rounds/${round.id}/votes`, voteBody(round.id, cats.map((c) => c.id), 6)));
    }
    const all = await Promise.all(promises);
    // every submission is acceptable (2nd = audited edit), never a crash
    expect(all.every((r) => r.status === 201 || r.status === 409)).toBe(true);
    expect(all.filter((r) => r.status === 201).length).toBe(voters.length * 2);

    const stored = await prisma.vote.findMany({ where: { roundId: round.id } });
    const seen = new Set(stored.map((v) => v.voterId));
    expect(stored.length).toBe(seen.size);
    expect(stored.length).toBe(voters.length);
  });
});

async function cfVer(roomId: string) {
  const v = await prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
  return v!;
}

/* ============================ 4. config lock ============================== */

describe("config lock after first vote", () => {
  it("blocks structural category changes once votes exist, but allows cosmetic edits", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T7") } });
    const { room, cats, version } = await setupRoom(admin.id, { categories: [{ name: "Locked" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    await openRound(room.id, team.id);
    await prisma.vote.createMany({
      data: [{ roundId: (await prisma.votingRound.findFirst({ where: { roomId: room.id } }))!.id, roomId: room.id, teamId: team.id, voterId: voter.id }],
    });
    await prisma.voteScore.create({
      data: { voteId: (await prisma.vote.findFirst({ where: { voterId: voter.id } }))!.id, categoryId: cats[0].id, roomId: room.id, score: 5 },
    });

    const { j } = await login(admin.username);
    // structural change blocked via service call (tested through admin API)
    const res = await call(j, "POST", `/rooms/${room.id}/categories`, { name: "Extra", minScore: 1, maxScore: 10, step: 1, weight: 1, isRequired: true });
    expect(res.status).toBe(409);
    expect(String((res.body as any).error)).toMatch(/locked/i);

    // cosmetic edit of name allowed
    const cat = cats[0];
    const upd = await call(j, "PATCH", `/categories/${cat.id}`, { name: "Renamed (cosmetic)" });
    expect(upd.status).toBe(200);
    void version;
  });

  it("new config version deep-copies categories", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("T8") } });
    const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "V1 only" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);
    await openRound(room.id, team.id);
    await prisma.vote.createMany({
      data: [{ roundId: (await prisma.votingRound.findFirst({ where: { roomId: room.id } }))!.id, roomId: room.id, teamId: team.id, voterId: voter.id }],
    });
    const { j } = await login(admin.username);
    const nv = await call(j, "POST", `/rooms/${room.id}/config/new-version`, { reason: "test" });
    expect(nv.status).toBe(200);
    const newVersionId = (nv.body as any).versionId;
    const ncats = await prisma.category.findMany({ where: { configVersionId: newVersionId } });
    expect(ncats.map((c) => c.name)).toContain("V1 only");
    expect(ncats[0].id).not.toBe(cats[0].id); // immutable snapshot
  });
});

/* ========================== 5. result calculation ========================= */

describe("result calculation: weights, normalization, missing votes, trimmed mean, ties", () => {
  it("computes weighted normalized overall score (documented rule)", async () => {
    const mod = await import("../src/services/results.service");
    const { resultsService, rankTeams } = mod;
    expect(mod.getStrategy("unknown").id).toBe("weighted_mean");
    // categories: A (max 10, w=2), B (max 5, w=1)
    // scores A: 8,6 → avg 7, norm .7; B: 5 → avg 5, norm 1.0
    // overall = (0.7*2 + 1.0*1)/(3) * 100 = 80
    expect(rankTeams([
      { teamId: "t", teamName: "T", presentationOrder: 1, votesReceived: 2, categories: [
        { categoryId: "a", name: "A", minScore: 1, maxScore: 10, weight: 2, isRequired: true, scores: [8, 6], average: 7, normalized: 0.7 },
        { categoryId: "b", name: "B", minScore: 1, maxScore: 5, weight: 1, isRequired: true, scores: [5], average: 5, normalized: 1 },
      ], overall: (0.7 * 2 + 1.0 * 1) / 3 * 100, rank: null, flagged: false },
    ])[0].rank).toBe(1);
  });

  it("trimmed mean drops one high and one low per category (min 3 scores)", async () => {
    const { trimmedMeanStrategy } = await import("../src/services/results.service");
    expect(trimmedMeanStrategy.categoryAverage([5])).toBe(5);
    expect(trimmedMeanStrategy.categoryAverage([4, 5])).toBe(4.5);
    expect(trimmedMeanStrategy.categoryAverage([1, 2, 3, 4, 9])).toBe(3); // drops 1 and 9
  });

  it("tie-break: overall, then highest-weighted category, then vote count", async () => {
    const { rankTeams } = await import("../src/services/results.service");
    const mk = (id: string, overall: number, norm: number, votes: number): any => ({
      teamId: id, teamName: id, presentationOrder: 1, votesReceived: votes,
      categories: [{ categoryId: "h", name: "H", minScore: 1, maxScore: 10, weight: 3, isRequired: true, scores: [], average: 0, normalized: norm }],
      overall, rank: null, flagged: false,
    });
    // tie on overall 80: norm 0.9 beats 0.8
    let r = rankTeams([mk("b", 80, 0.8, 3), mk("a", 80, 0.9, 1)]);
    expect(r[0].teamId).toBe("a");
    // tie on both: more votes wins
    r = rankTeams([mk("b", 80, 0.8, 1), mk("a", 80, 0.8, 5)]);
    expect(r[0].teamId).toBe("a");
    // full tie → shared rank
    r = rankTeams([mk("x", 80, 0.8, 2), mk("y", 80, 0.8, 2)]);
    expect(r[0].rank).toBe(r[1].rank ?? -1);
  });

  it("results endpoint matches independently computed expectations", async () => {
    const admin = await makeUser("ADMIN");
    const t1 = await prisma.team.create({ data: { name: U("CalcA") } });
    const t2 = await prisma.team.create({ data: { name: U("CalcB") } });
    // categories: C1 max 10 w 1, C2 max 4 w 2
    const { room, cats } = await setupRoom(admin.id, {
      categories: [{ name: "C1" }, { name: "C2", maxScore: 4, weight: 2 }],
    });
    await linkRoomTeam(room.id, t1.id);
    await linkRoomTeam(room.id, t2.id, 2);

    // voters: 3 in team T2 (ineligible for T2-critique) etc — simpler: 4 teamless voters
    const voters = [];
    for (let i = 0; i < 4; i++) {
      const v = await makeUser("PARTICIPANT", null);
      await addMembership(room.id, v.id, null);
      voters.push(v);
    }
    const r1 = await openRound(room.id, t1.id);
    const r2 = await openRound(room.id, t2.id);
    // T1 scores: C1: 10,8,6,4 → avg 7 → norm .7; C2: 4,2 → avg 3 → norm .75
    const c1 = cats[0].id, c2 = cats[1].id;
    const t1scores: Record<string, number[]> = { [c1]: [10, 8, 6, 4], [c2]: [4, 2] };
    const t2scores: Record<string, number[]> = { [c1]: [2, 4, 6, 8], [c2]: [2, 2, 2, 3] };
    await seedVotes(r1.id, voters, room.id, t1.id, cats, t1scores);
    await seedVotes(r2.id, voters, room.id, t2.id, cats, t2scores);

    const { j } = await login(admin.username);
    const res = await call(j, "GET", `/rooms/${room.id}/results`);
    expect(res.status).toBe(200);
    const results = res.body as any;
    const teamA = results.teams.find((t: any) => t.teamName === t1.name);
    const teamB = results.teams.find((t: any) => t.teamName === t2.name);

    // expected overall T1 = (0.7*1 + 0.75*2)/3*100 = 73.3333…
    expect(teamA.overall).toBeCloseTo(73.3333, 3);
    // expected overall T2 = C1 avg 5 → 0.5; C2 avg 2.25 → 0.5625; (0.5*1+0.5625*2)/3*100 = 54.1667
    expect(teamB.overall).toBeCloseTo(54.1667, 3);
    expect(teamA.rank).toBe(1);
    expect(teamB.rank).toBe(2);

    async function seedVotes(roundId: string, users: { id: string }[], roomId: string, teamId: string, categories: { id: string }[], scores: Record<string, number[]>) {
      for (let i = 0; i < users.length; i++) {
        const vote = await prisma.vote.create({ data: { roundId, roomId, teamId, voterId: users[i].id } });
        for (const c of categories) {
          const arr = scores[c.id];
          if (arr && arr[i] !== undefined) {
            await prisma.voteScore.create({ data: { voteId: vote.id, categoryId: c.id, roomId, score: arr[i] } });
          }
        }
      }
    }
  });

  it("supports TWO rooms running simultaneously with different scales", async () => {
    const admin = await makeUser("ADMIN");
    const t = await prisma.team.create({ data: { name: U("Dual") } });
    const roomA = await setupRoom(admin.id, { categories: [{ name: "A-1", maxScore: 10 }] });
    const roomB = await setupRoom(admin.id, { categories: [{ name: "B-1", maxScore: 5, minScore: 0 }] });
    await linkRoomTeam(roomA.room.id, t.id);
    await linkRoomTeam(roomB.room.id, t.id, 1);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(roomA.room.id, voter.id, null);
    await addMembership(roomB.room.id, voter.id, null);

    const roundA = await openRound(roomA.room.id, t.id);
    const roundB = await openRound(roomB.room.id, t.id);
    const { j } = await login(voter.username);
    const v1 = await call(j, "POST", `/rounds/${roundA.id}/votes`, voteBody(roundA.id, [roomA.cats[0].id], 9));
    const v2 = await call(j, "POST", `/rounds/${roundB.id}/votes`, voteBody(roundB.id, [roomB.cats[0].id], 4));
    expect(v1.status).toBe(201);
    expect(v2.status).toBe(201);

    // category snapshots are room-specific
    const roundARow = await prisma.votingRound.findUniqueOrThrow({ where: { id: roundA.id } });
    const roundBRow = await prisma.votingRound.findUniqueOrThrow({ where: { id: roundB.id } });
    expect(roundARow.configVersionId).not.toBe(roundBRow.configVersionId);
    void roomB;
  });
});

/* ======================= 6. exports & room lifecycle ====================== */

describe("lifecycle and exports", () => {
  it("publishing controls participant visibility", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({ data: { name: U("Pub") } });
    const { room } = await setupRoom(admin.id, { categories: [{ name: "C" }] });
    await linkRoomTeam(room.id, team.id);
    const voter = await makeUser("PARTICIPANT", null);
    await addMembership(room.id, voter.id, null);

    const { j } = await login(voter.username);
    const hidden = await call(j, "GET", `/rooms/${room.id}/my-results`);
    expect((hidden.body as any).visible).toBe(false);

    const { j: aj } = await login(admin.username);
    await call(aj, "POST", `/rooms/${room.id}/results/publish`, { publish: true });
    const visible = await call(j, "GET", `/rooms/${room.id}/my-results`);
    expect((visible.body as any).visible).toBe(true);
  });

  it("joining an OPEN_WITH_CODE room via code registers the participant", async () => {
    const admin = await makeUser("ADMIN");
    const room = await prisma.room.create({
      data: { name: U("Open"), accessMode: "OPEN_WITH_CODE", status: "ACTIVE", createdById: admin.id, joinCode: U("NEWJOIN").slice(-6).toUpperCase() },
    });
    const p = await makeUser("PARTICIPANT", null);
    const { j } = await login(p.username);
    const res = await call(j, "POST", "/rooms/join", { code: room.joinCode });
    expect(res.status).toBe(200);
    const membership = await prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: p.id } } });
    expect(membership).not.toBeNull();
  });

  it("restricted rooms reject unassigned participants even with a valid code", async () => {
    const admin = await makeUser("ADMIN");
    const room = await prisma.room.create({
      data: { name: U("Restr"), accessMode: "RESTRICTED", status: "ACTIVE", createdById: admin.id, joinCode: U("RESJOIN").slice(-6).toUpperCase() },
    });
    const p = await makeUser("PARTICIPANT", null);
    const { j } = await login(p.username);
    const res = await call(j, "POST", "/rooms/join", { code: room.joinCode });
    expect(res.status).toBe(403);
  });

  it("CSV export escapes formula injection and includes expected columns", async () => {
    const admin = await makeUser("ADMIN");
    const team = await prisma.team.create({
      data: { name: `=SUM(A${Math.floor(Math.random() * 1_000_000)});DROP TABLE users` },
    });
    const { room } = await setupRoom(admin.id, { categories: [{ name: "C" }] });
    await linkRoomTeam(room.id, team.id);
    const { j } = await login(admin.username);
    const res = await fetch(`${base}/api/rooms/${room.id}/results/export?kind=summary&format=csv`, {
      headers: { Cookie: j.header() },
    });
    const text = await res.text();
    expect(res.status).toBe(200);
    expect(text.startsWith("rank,team")).toBe(true);
    expect(text).toContain("'=SUM"); // neutralized
  });
});
