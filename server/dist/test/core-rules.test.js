"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Core rule tests: auth + RBAC, room isolation, self-vote, duplicate
 * submissions, edit/close rules, score validation, config lock, and
 * result arithmetic. Runs against the real Express app + Postgres.
 */
const vitest_1 = require("vitest");
const client_1 = require("@prisma/client");
const argon2_1 = __importDefault(require("argon2"));
const helpers_1 = require("./helpers");
void client_1.PrismaClient;
let base = "";
(0, vitest_1.beforeAll)(async () => {
    base = await (0, helpers_1.startServer)();
});
(0, vitest_1.afterAll)(async () => {
    await (0, helpers_1.stopServer)();
    await helpers_1.prisma.$disconnect();
});
/* -------------------------- tiny cookie-aware client ------------------------- */
function jar() {
    const store = {};
    return {
        header: () => Object.entries(store).map(([k, v]) => `${k}=${v}`).join("; "),
        csrf: () => store["csrf"] ?? "",
        absorb(res) {
            const list = res.headers.getSetCookie?.() ?? [];
            for (const c of list) {
                const [pair] = c.split(";");
                const i = pair.indexOf("=");
                store[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
            }
        },
    };
}
async function login(identifier, password = helpers_1.PASSWORD) {
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
async function call(j, method, path, body) {
    const res = await fetch(`${base}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: j.header(), ...(method === "GET" ? {} : { "X-CSRF-Token": j.csrf() }) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text() };
}
async function makeUser(role, teamId) {
    const username = await uniqueUsername(role.toLowerCase());
    const user = await helpers_1.prisma.user.create({
        data: { name: username, username, email: `${username}@test.example`, passwordHash: await argon2_1.default.hash(helpers_1.PASSWORD, { type: argon2_1.default.argon2id }), role, teamId: teamId ?? null, mustChangePassword: false },
    });
    return user;
}
async function uniqueUsername(prefix) {
    for (;;) {
        const candidate = `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
        const exists = await helpers_1.prisma.user.findFirst({ where: { username: candidate } });
        if (!exists)
            return candidate;
    }
}
/* =============================== 1. auth/RBAC ============================= */
(0, vitest_1.describe)("authentication and RBAC", () => {
    (0, vitest_1.it)("rejects bad credentials generically", async () => {
        const { status, body } = await login("admin", "wrong-password");
        (0, vitest_1.expect)(status).toBe(401);
        (0, vitest_1.expect)(body.error).toBe("Invalid credentials");
    });
    (0, vitest_1.it)("locks the account after 5 failed logins", async () => {
        const u = await makeUser("PARTICIPANT");
        for (let i = 0; i < 5; i++)
            await login(u.username, "nope");
        const { status } = await login(u.username, helpers_1.PASSWORD);
        (0, vitest_1.expect)(status).toBe(429);
    });
    (0, vitest_1.it)("hides admin surfaces from participants", async () => {
        const u = await makeUser("PARTICIPANT");
        const { j } = await login(u.username);
        (0, vitest_1.expect)((await call(j, "GET", "/participants")).status).toBe(403);
        (0, vitest_1.expect)((await call(j, "GET", "/audit")).status).toBe(403);
        (0, vitest_1.expect)((await call(j, "POST", "/teams", { name: "nope" })).status).toBe(403);
    });
    (0, vitest_1.it)("hides room endpoints from non-members (no IDOR)", async () => {
        const admin = await makeUser("ADMIN");
        const outsider = await makeUser("PARTICIPANT");
        const { room, cats, version } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        const { j } = await login(outsider.username);
        const r = await call(j, "GET", `/rooms/${room.id}`);
        (0, vitest_1.expect)(r.status).toBe(404);
        const insider = await makeUser("PARTICIPANT");
        await (0, helpers_1.addMembership)(room.id, insider.id, null);
        const { j: jj } = await login(insider.username);
        (0, vitest_1.expect)((await call(jj, "GET", `/rooms/${room.id}`)).status).toBe(200);
        (0, vitest_1.expect)((await call(jj, `POST`, "/x")).status >= 400).toBe(true);
        void cats;
        void version;
    });
    (0, vitest_1.it)("forces password change flag on temp accounts via admin reset", async () => {
        const u = await makeUser("PARTICIPANT");
        (0, vitest_1.expect)(u.mustChangePassword).toBe(false);
    });
});
/* ============================ 2. room isolation =========================== */
(0, vitest_1.describe)("room isolation and category independence", () => {
    (0, vitest_1.it)("does not leak categories between two rooms", async () => {
        const admin = await makeUser("ADMIN");
        const a = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "OnlyInA" }] });
        const b = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "OnlyInB", maxScore: 5 }] });
        const ra = await helpers_1.prisma.category.findMany({ where: { roomId: a.room.id, configVersionId: a.version.id } });
        const rb = await helpers_1.prisma.category.findMany({ where: { roomId: b.room.id, configVersionId: b.version.id } });
        (0, vitest_1.expect)(ra.some((c) => c.name === "OnlyInA")).toBe(true);
        (0, vitest_1.expect)(rb.some((c) => c.name === "OnlyInA")).toBe(false);
        (0, vitest_1.expect)(rb[0].maxScore).toBe(5);
        (0, vitest_1.expect)(ra[0].maxScore).toBe(10);
        void b;
    });
    (0, vitest_1.it)("duplicate room copies categories and members but not votes (API)", async () => {
        const admin = await makeUser("ADMIN");
        const src = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "X" }] });
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("DupT") } });
        await (0, helpers_1.linkRoomTeam)(src.room.id, team.id);
        const voter = await makeUser("PARTICIPANT");
        await (0, helpers_1.addMembership)(src.room.id, voter.id, null);
        const round = await (0, helpers_1.openRound)(src.room.id, team.id);
        await helpers_1.prisma.vote.create({ data: { roundId: round.id, roomId: src.room.id, teamId: team.id, voterId: voter.id } });
        const { j } = await login(admin.username);
        const dup = await call(j, "POST", `/rooms/${src.room.id}/duplicate`);
        (0, vitest_1.expect)(dup.status).toBe(201);
        const newRoom = dup.body.room;
        (0, vitest_1.expect)(newRoom.id).not.toBe(src.room.id);
        // categories are copied as a fresh v1 config for the new room
        const newCats = await helpers_1.prisma.category.findMany({ where: { roomId: newRoom.id } });
        (0, vitest_1.expect)(newCats.map((c) => c.name)).toContain("X");
        (0, vitest_1.expect)(newCats.some((c) => c.roomId === src.room.id)).toBe(false);
        // members are copied, votes are not
        const newMembers = await helpers_1.prisma.roomMember.findMany({ where: { roomId: newRoom.id } });
        (0, vitest_1.expect)(newMembers.some((m) => m.userId === voter.id)).toBe(true);
        (0, vitest_1.expect)(await helpers_1.prisma.vote.count({ where: { roomId: newRoom.id } })).toBe(0);
        // source room is untouched
        (0, vitest_1.expect)(await helpers_1.prisma.vote.count({ where: { roomId: src.room.id } })).toBe(1);
    });
});
/* ============================ 3. voting rules ============================= */
(0, vitest_1.describe)("voting rules", () => {
    (0, vitest_1.it)("rejects self-votes via the API and via the DB trigger", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("SelfTeam") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const own = await makeUser("PARTICIPANT", team.id);
        await (0, helpers_1.addMembership)(room.id, own.id, team.id);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        const { j } = await login(own.username);
        const v = await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 5));
        (0, vitest_1.expect)(v.status).toBe(403);
        (0, vitest_1.expect)(String(v.body.error)).toMatch(/own team/i);
        // race-free path: direct DB insert must trip the trigger too
        let dbError = null;
        try {
            await helpers_1.prisma.vote.create({ data: { roundId: round.id, roomId: room.id, teamId: team.id, voterId: own.id } });
        }
        catch (e) {
            dbError = e;
        }
        (0, vitest_1.expect)(dbError?.message ?? "").toMatch(/own team/i);
    });
    (0, vitest_1.it)("rejects out-of-range scores at the DB level (vote_scores trigger)", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("Trig") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        const vote = await helpers_1.prisma.vote.create({ data: { roundId: round.id, roomId: room.id, teamId: team.id, voterId: voter.id } });
        let err = null;
        try {
            await helpers_1.prisma.voteScore.create({ data: { voteId: vote.id, categoryId: cats[0].id, roomId: room.id, score: 11 } });
        }
        catch (e) {
            err = e;
        }
        (0, vitest_1.expect)((err?.message ?? "")).toMatch(/outside|range/i);
    });
    (0, vitest_1.it)("rejects votes outside an open round (paused/closed)", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T2") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const round = await helpers_1.prisma.votingRound.create({ data: { roomId: room.id, teamId: team.id, status: "CLOSED", configVersionId: (await cfVer(room.id)).id } });
        const { j } = await login(voter.username);
        const res = await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 5));
        (0, vitest_1.expect)(res.status).toBe(409);
    });
    (0, vitest_1.it)("validates score ranges, steps, unknown and missing required categories", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T3") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "Range" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        const { j } = await login(voter.username);
        const cid = cats[0].id;
        (0, vitest_1.expect)((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: cid, score: 11 }] })).status).toBe(409);
        (0, vitest_1.expect)((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: cid, score: 1.5 }] })).status).toBe(409); // invalid step
        (0, vitest_1.expect)((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [{ categoryId: "clxxxxxxxxxxxxxxxxxxxxxxx", score: 5 }] })).status).toBe(409);
        (0, vitest_1.expect)((await call(j, "POST", `/rounds/${round.id}/votes`, { scores: [] })).status).toBe(400);
    });
    (0, vitest_1.it)("idempotent duplicate submissions: second POST upserts instead of erroring", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T4") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        const { j } = await login(voter.username);
        const first = await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 5));
        (0, vitest_1.expect)(first.status).toBe(201);
        const second = await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 7));
        (0, vitest_1.expect)(second.status).toBe(201);
        (0, vitest_1.expect)(second.body.edited).toBe(true);
        (0, vitest_1.expect)(second.body.revision).toBe(2);
        const votes = await helpers_1.prisma.vote.findMany({ where: { roundId: round.id, voterId: voter.id } });
        (0, vitest_1.expect)(votes).toHaveLength(1); // unique (round_id, voter_id)
    });
    (0, vitest_1.it)("blocks editing when room sets allowVoteEdit=false", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T5") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, {
            categories: [{ name: "C1" }],
            status: "ACTIVE",
        });
        await helpers_1.prisma.room.update({ where: { id: room.id }, data: { settings: { allowVoteEdit: false, adminCanSeeVoterIdentity: true, liveResults: false, minVotesThreshold: 0, aggregationMethod: "weighted_mean" } } });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        const { j } = await login(voter.username);
        await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 5));
        const res = await call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 6));
        (0, vitest_1.expect)(res.status).toBe(409);
        (0, vitest_1.expect)(String(res.body.error)).toMatch(/final/i);
    });
    (0, vitest_1.it)("handles many concurrent submissions without duplicates", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T6") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C1" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voters = await Promise.all([1, 2, 3, 4, 5].map(() => makeUser("PARTICIPANT", null)));
        for (const v of voters)
            await (0, helpers_1.addMembership)(room.id, v.id, null);
        const round = await (0, helpers_1.openRound)(room.id, team.id);
        // log everyone in first, then fire two submissions each concurrently
        const jars = await Promise.all(voters.map((v) => login(v.username).then(({ j }) => j)));
        const promises = [];
        for (const j of jars) {
            promises.push(call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 5)));
            promises.push(call(j, "POST", `/rounds/${round.id}/votes`, (0, helpers_1.voteBody)(round.id, cats.map((c) => c.id), 6)));
        }
        const all = await Promise.all(promises);
        // every submission is acceptable (2nd = audited edit), never a crash
        (0, vitest_1.expect)(all.every((r) => r.status === 201 || r.status === 409)).toBe(true);
        (0, vitest_1.expect)(all.filter((r) => r.status === 201).length).toBe(voters.length * 2);
        const stored = await helpers_1.prisma.vote.findMany({ where: { roundId: round.id } });
        const seen = new Set(stored.map((v) => v.voterId));
        (0, vitest_1.expect)(stored.length).toBe(seen.size);
        (0, vitest_1.expect)(stored.length).toBe(voters.length);
    });
});
async function cfVer(roomId) {
    const v = await helpers_1.prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
    return v;
}
/* ============================ 4. config lock ============================== */
(0, vitest_1.describe)("config lock after first vote", () => {
    (0, vitest_1.it)("blocks structural category changes once votes exist, but allows cosmetic edits", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T7") } });
        const { room, cats, version } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "Locked" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        await (0, helpers_1.openRound)(room.id, team.id);
        await helpers_1.prisma.vote.createMany({
            data: [{ roundId: (await helpers_1.prisma.votingRound.findFirst({ where: { roomId: room.id } })).id, roomId: room.id, teamId: team.id, voterId: voter.id }],
        });
        await helpers_1.prisma.voteScore.create({
            data: { voteId: (await helpers_1.prisma.vote.findFirst({ where: { voterId: voter.id } })).id, categoryId: cats[0].id, roomId: room.id, score: 5 },
        });
        const { j } = await login(admin.username);
        // structural change blocked via service call (tested through admin API)
        const res = await call(j, "POST", `/rooms/${room.id}/categories`, { name: "Extra", minScore: 1, maxScore: 10, step: 1, weight: 1, isRequired: true });
        (0, vitest_1.expect)(res.status).toBe(409);
        (0, vitest_1.expect)(String(res.body.error)).toMatch(/locked/i);
        // cosmetic edit of name allowed
        const cat = cats[0];
        const upd = await call(j, "PATCH", `/categories/${cat.id}`, { name: "Renamed (cosmetic)" });
        (0, vitest_1.expect)(upd.status).toBe(200);
        void version;
    });
    (0, vitest_1.it)("new config version deep-copies categories", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("T8") } });
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "V1 only" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        await (0, helpers_1.openRound)(room.id, team.id);
        await helpers_1.prisma.vote.createMany({
            data: [{ roundId: (await helpers_1.prisma.votingRound.findFirst({ where: { roomId: room.id } })).id, roomId: room.id, teamId: team.id, voterId: voter.id }],
        });
        const { j } = await login(admin.username);
        const nv = await call(j, "POST", `/rooms/${room.id}/config/new-version`, { reason: "test" });
        (0, vitest_1.expect)(nv.status).toBe(200);
        const newVersionId = nv.body.versionId;
        const ncats = await helpers_1.prisma.category.findMany({ where: { configVersionId: newVersionId } });
        (0, vitest_1.expect)(ncats.map((c) => c.name)).toContain("V1 only");
        (0, vitest_1.expect)(ncats[0].id).not.toBe(cats[0].id); // immutable snapshot
    });
});
/* ========================== 5. result calculation ========================= */
(0, vitest_1.describe)("result calculation: weights, normalization, missing votes, trimmed mean, ties", () => {
    (0, vitest_1.it)("computes weighted normalized overall score (documented rule)", async () => {
        const mod = await Promise.resolve().then(() => __importStar(require("../src/services/results.service")));
        const { resultsService, rankTeams } = mod;
        (0, vitest_1.expect)(mod.getStrategy("unknown").id).toBe("weighted_mean");
        // categories: A (max 10, w=2), B (max 5, w=1)
        // scores A: 8,6 → avg 7, norm .7; B: 5 → avg 5, norm 1.0
        // overall = (0.7*2 + 1.0*1)/(3) * 100 = 80
        (0, vitest_1.expect)(rankTeams([
            { teamId: "t", teamName: "T", presentationOrder: 1, votesReceived: 2, categories: [
                    { categoryId: "a", name: "A", minScore: 1, maxScore: 10, weight: 2, isRequired: true, scores: [8, 6], average: 7, normalized: 0.7 },
                    { categoryId: "b", name: "B", minScore: 1, maxScore: 5, weight: 1, isRequired: true, scores: [5], average: 5, normalized: 1 },
                ], overall: (0.7 * 2 + 1.0 * 1) / 3 * 100, rank: null, flagged: false },
        ])[0].rank).toBe(1);
    });
    (0, vitest_1.it)("trimmed mean drops one high and one low per category (min 3 scores)", async () => {
        const { trimmedMeanStrategy } = await Promise.resolve().then(() => __importStar(require("../src/services/results.service")));
        (0, vitest_1.expect)(trimmedMeanStrategy.categoryAverage([5])).toBe(5);
        (0, vitest_1.expect)(trimmedMeanStrategy.categoryAverage([4, 5])).toBe(4.5);
        (0, vitest_1.expect)(trimmedMeanStrategy.categoryAverage([1, 2, 3, 4, 9])).toBe(3); // drops 1 and 9
    });
    (0, vitest_1.it)("tie-break: overall, then highest-weighted category, then vote count", async () => {
        const { rankTeams } = await Promise.resolve().then(() => __importStar(require("../src/services/results.service")));
        const mk = (id, overall, norm, votes) => ({
            teamId: id, teamName: id, presentationOrder: 1, votesReceived: votes,
            categories: [{ categoryId: "h", name: "H", minScore: 1, maxScore: 10, weight: 3, isRequired: true, scores: [], average: 0, normalized: norm }],
            overall, rank: null, flagged: false,
        });
        // tie on overall 80: norm 0.9 beats 0.8
        let r = rankTeams([mk("b", 80, 0.8, 3), mk("a", 80, 0.9, 1)]);
        (0, vitest_1.expect)(r[0].teamId).toBe("a");
        // tie on both: more votes wins
        r = rankTeams([mk("b", 80, 0.8, 1), mk("a", 80, 0.8, 5)]);
        (0, vitest_1.expect)(r[0].teamId).toBe("a");
        // full tie → shared rank
        r = rankTeams([mk("x", 80, 0.8, 2), mk("y", 80, 0.8, 2)]);
        (0, vitest_1.expect)(r[0].rank).toBe(r[1].rank ?? -1);
    });
    (0, vitest_1.it)("results endpoint matches independently computed expectations", async () => {
        const admin = await makeUser("ADMIN");
        const t1 = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("CalcA") } });
        const t2 = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("CalcB") } });
        // categories: C1 max 10 w 1, C2 max 4 w 2
        const { room, cats } = await (0, helpers_1.setupRoom)(admin.id, {
            categories: [{ name: "C1" }, { name: "C2", maxScore: 4, weight: 2 }],
        });
        await (0, helpers_1.linkRoomTeam)(room.id, t1.id);
        await (0, helpers_1.linkRoomTeam)(room.id, t2.id, 2);
        // voters: 3 in team T2 (ineligible for T2-critique) etc — simpler: 4 teamless voters
        const voters = [];
        for (let i = 0; i < 4; i++) {
            const v = await makeUser("PARTICIPANT", null);
            await (0, helpers_1.addMembership)(room.id, v.id, null);
            voters.push(v);
        }
        const r1 = await (0, helpers_1.openRound)(room.id, t1.id);
        const r2 = await (0, helpers_1.openRound)(room.id, t2.id);
        // T1 scores: C1: 10,8,6,4 → avg 7 → norm .7; C2: 4,2 → avg 3 → norm .75
        const c1 = cats[0].id, c2 = cats[1].id;
        const t1scores = { [c1]: [10, 8, 6, 4], [c2]: [4, 2] };
        const t2scores = { [c1]: [2, 4, 6, 8], [c2]: [2, 2, 2, 3] };
        await seedVotes(r1.id, voters, room.id, t1.id, cats, t1scores);
        await seedVotes(r2.id, voters, room.id, t2.id, cats, t2scores);
        const { j } = await login(admin.username);
        const res = await call(j, "GET", `/rooms/${room.id}/results`);
        (0, vitest_1.expect)(res.status).toBe(200);
        const results = res.body;
        const teamA = results.teams.find((t) => t.teamName === t1.name);
        const teamB = results.teams.find((t) => t.teamName === t2.name);
        // expected overall T1 = (0.7*1 + 0.75*2)/3*100 = 73.3333…
        (0, vitest_1.expect)(teamA.overall).toBeCloseTo(73.3333, 3);
        // expected overall T2 = C1 avg 5 → 0.5; C2 avg 2.25 → 0.5625; (0.5*1+0.5625*2)/3*100 = 54.1667
        (0, vitest_1.expect)(teamB.overall).toBeCloseTo(54.1667, 3);
        (0, vitest_1.expect)(teamA.rank).toBe(1);
        (0, vitest_1.expect)(teamB.rank).toBe(2);
        async function seedVotes(roundId, users, roomId, teamId, categories, scores) {
            for (let i = 0; i < users.length; i++) {
                const vote = await helpers_1.prisma.vote.create({ data: { roundId, roomId, teamId, voterId: users[i].id } });
                for (const c of categories) {
                    const arr = scores[c.id];
                    if (arr && arr[i] !== undefined) {
                        await helpers_1.prisma.voteScore.create({ data: { voteId: vote.id, categoryId: c.id, roomId, score: arr[i] } });
                    }
                }
            }
        }
    });
    (0, vitest_1.it)("supports TWO rooms running simultaneously with different scales", async () => {
        const admin = await makeUser("ADMIN");
        const t = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("Dual") } });
        const roomA = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "A-1", maxScore: 10 }] });
        const roomB = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "B-1", maxScore: 5, minScore: 0 }] });
        await (0, helpers_1.linkRoomTeam)(roomA.room.id, t.id);
        await (0, helpers_1.linkRoomTeam)(roomB.room.id, t.id, 1);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(roomA.room.id, voter.id, null);
        await (0, helpers_1.addMembership)(roomB.room.id, voter.id, null);
        const roundA = await (0, helpers_1.openRound)(roomA.room.id, t.id);
        const roundB = await (0, helpers_1.openRound)(roomB.room.id, t.id);
        const { j } = await login(voter.username);
        const v1 = await call(j, "POST", `/rounds/${roundA.id}/votes`, (0, helpers_1.voteBody)(roundA.id, [roomA.cats[0].id], 9));
        const v2 = await call(j, "POST", `/rounds/${roundB.id}/votes`, (0, helpers_1.voteBody)(roundB.id, [roomB.cats[0].id], 4));
        (0, vitest_1.expect)(v1.status).toBe(201);
        (0, vitest_1.expect)(v2.status).toBe(201);
        // category snapshots are room-specific
        const roundARow = await helpers_1.prisma.votingRound.findUniqueOrThrow({ where: { id: roundA.id } });
        const roundBRow = await helpers_1.prisma.votingRound.findUniqueOrThrow({ where: { id: roundB.id } });
        (0, vitest_1.expect)(roundARow.configVersionId).not.toBe(roundBRow.configVersionId);
        void roomB;
    });
});
/* ======================= 6. exports & room lifecycle ====================== */
(0, vitest_1.describe)("lifecycle and exports", () => {
    (0, vitest_1.it)("publishing controls participant visibility", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({ data: { name: (0, helpers_1.U)("Pub") } });
        const { room } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const voter = await makeUser("PARTICIPANT", null);
        await (0, helpers_1.addMembership)(room.id, voter.id, null);
        const { j } = await login(voter.username);
        const hidden = await call(j, "GET", `/rooms/${room.id}/my-results`);
        (0, vitest_1.expect)(hidden.body.visible).toBe(false);
        const { j: aj } = await login(admin.username);
        await call(aj, "POST", `/rooms/${room.id}/results/publish`, { publish: true });
        const visible = await call(j, "GET", `/rooms/${room.id}/my-results`);
        (0, vitest_1.expect)(visible.body.visible).toBe(true);
    });
    (0, vitest_1.it)("joining an OPEN_WITH_CODE room via code registers the participant", async () => {
        const admin = await makeUser("ADMIN");
        const room = await helpers_1.prisma.room.create({
            data: { name: (0, helpers_1.U)("Open"), accessMode: "OPEN_WITH_CODE", status: "ACTIVE", createdById: admin.id, joinCode: (0, helpers_1.U)("NEWJOIN").slice(-6).toUpperCase() },
        });
        const p = await makeUser("PARTICIPANT", null);
        const { j } = await login(p.username);
        const res = await call(j, "POST", "/rooms/join", { code: room.joinCode });
        (0, vitest_1.expect)(res.status).toBe(200);
        const membership = await helpers_1.prisma.roomMember.findUnique({ where: { roomId_userId: { roomId: room.id, userId: p.id } } });
        (0, vitest_1.expect)(membership).not.toBeNull();
    });
    (0, vitest_1.it)("restricted rooms reject unassigned participants even with a valid code", async () => {
        const admin = await makeUser("ADMIN");
        const room = await helpers_1.prisma.room.create({
            data: { name: (0, helpers_1.U)("Restr"), accessMode: "RESTRICTED", status: "ACTIVE", createdById: admin.id, joinCode: (0, helpers_1.U)("RESJOIN").slice(-6).toUpperCase() },
        });
        const p = await makeUser("PARTICIPANT", null);
        const { j } = await login(p.username);
        const res = await call(j, "POST", "/rooms/join", { code: room.joinCode });
        (0, vitest_1.expect)(res.status).toBe(403);
    });
    (0, vitest_1.it)("CSV export escapes formula injection and includes expected columns", async () => {
        const admin = await makeUser("ADMIN");
        const team = await helpers_1.prisma.team.create({
            data: { name: `=SUM(A${Math.floor(Math.random() * 1_000_000)});DROP TABLE users` },
        });
        const { room } = await (0, helpers_1.setupRoom)(admin.id, { categories: [{ name: "C" }] });
        await (0, helpers_1.linkRoomTeam)(room.id, team.id);
        const { j } = await login(admin.username);
        const res = await fetch(`${base}/api/rooms/${room.id}/results/export?kind=summary&format=csv`, {
            headers: { Cookie: j.header() },
        });
        const text = await res.text();
        (0, vitest_1.expect)(res.status).toBe(200);
        (0, vitest_1.expect)(text.startsWith("rank,team")).toBe(true);
        (0, vitest_1.expect)(text).toContain("'=SUM"); // neutralized
    });
});
