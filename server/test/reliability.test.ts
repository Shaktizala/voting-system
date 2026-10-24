/**
 * Live-event reliability + access regressions: concurrent vote bursts, the
 * close/vote race, one live round per room, realtime delivery to moderators,
 * and the RBAC gaps (unpublished results, room list, temp passwords).
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { io as ioClient } from "socket.io-client";
import { prisma, PASSWORD, setupRoom, addMembership, linkRoomTeam, U } from "./helpers";
import { hashPassword } from "../src/utils/password";

let base = "";
let server: http.Server;
let passwordHash = "";

beforeAll(async () => {
  const { createApp } = await import("../src/app");
  const { createRealtime } = await import("../src/realtime");
  server = http.createServer(createApp());
  createRealtime(server);
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  passwordHash = await hashPassword(PASSWORD);
});
afterAll(async () => {
  await new Promise((r) => server.close(r));
  await prisma.$disconnect();
});

/* ------------------------------- tiny client ------------------------------ */
type Jar = Record<string, string>;
const cookie = (j: Jar) => Object.entries(j).map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(j: Jar, res: Response) {
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    j[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
  }
}
async function login(username: string): Promise<Jar> {
  const j: Jar = {};
  absorb(j, await fetch(`${base}/api/auth/csrf`));
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie(j), "X-CSRF-Token": j.csrf },
    body: JSON.stringify({ identifier: username, password: PASSWORD }),
  });
  expect(res.status).toBe(200);
  absorb(j, res);
  return j;
}
async function call(j: Jar, method: string, path: string, body?: unknown) {
  const res = await fetch(`${base}/api${path}`, {
    method,
    headers: { "Content-Type": "application/json", Cookie: cookie(j), ...(method === "GET" ? {} : { "X-CSRF-Token": j.csrf }) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const isJson = res.headers.get("content-type")?.includes("json");
  return { status: res.status, body: (isJson ? await res.json() : await res.text()) as any };
}
async function makeUser(role: "ADMIN" | "MODERATOR" | "PARTICIPANT" = "PARTICIPANT", extra: { teamId?: string | null; mustChangePassword?: boolean } = {}) {
  const username = U(role.toLowerCase());
  return prisma.user.create({
    data: { name: username, username, email: `${username}@rel.test`, passwordHash, role, teamId: extra.teamId ?? null, mustChangePassword: extra.mustChangePassword ?? false },
  });
}

/** Active room with two linked teams, an admin, a moderator and `voters` teamless participants. */
async function liveRoom(voters: number) {
  const admin = await makeUser("ADMIN");
  const mod = await makeUser("MODERATOR");
  const { room, cats } = await setupRoom(admin.id, { categories: [{ name: "Tech" }, { name: "Pitch" }] });
  const teamA = await prisma.team.create({ data: { name: U("Alpha") } });
  const teamB = await prisma.team.create({ data: { name: U("Beta") } });
  await linkRoomTeam(room.id, teamA.id, 1);
  await linkRoomTeam(room.id, teamB.id, 2);
  await addMembership(room.id, mod.id, null, "MODERATOR");
  const people = [];
  for (let i = 0; i < voters; i++) {
    const u = await makeUser("PARTICIPANT");
    await addMembership(room.id, u.id, null);
    people.push(u);
  }
  const [adminJar, modJar, ...voterJars] = await Promise.all([admin, mod, ...people].map((u) => login(u.username)));
  return { room, cats, teamA, teamB, admin, adminJar, modJar, voterJars, ballot: (v: number) => ({ scores: cats.map((c) => ({ categoryId: c.id, score: v })) }) };
}

async function presentAndOpen(modJar: Jar, roomId: string, teamId: string) {
  const sel = await call(modJar, "POST", `/rooms/${roomId}/rounds/select`, { teamId });
  expect(sel.status).toBe(201);
  const open = await call(modJar, "POST", `/rounds/${sel.body.round.id}/open`, {});
  expect(open.status).toBe(200);
  return sel.body.round.id as string;
}

/* ================================ voting load ============================== */

describe("vote bursts", () => {
  it("accepts 150 simultaneous votes on one round with no server errors", async () => {
    const r = await liveRoom(150);
    const roundId = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);

    const results = await Promise.all(r.voterJars.map((j, i) => call(j, "POST", `/rounds/${roundId}/votes`, r.ballot((i % 10) + 1))));

    expect(results.filter((x) => x.status !== 201).map((x) => `${x.status} ${JSON.stringify(x.body)}`)).toEqual([]);
    expect(await prisma.vote.count({ where: { roundId } })).toBe(150);
    // the last response reports the full turnout from committed data
    expect(Math.max(...results.map((x) => x.body.votedCount))).toBe(150);
  }, 120_000);

  it("never stores a vote after the round is closed, even when they race", async () => {
    const r = await liveRoom(40);
    const roundId = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);

    const [close, ...votes] = await Promise.all([
      call(r.modJar, "POST", `/rounds/${roundId}/close`, {}),
      ...r.voterJars.map((j) => call(j, "POST", `/rounds/${roundId}/votes`, r.ballot(5))),
    ]);
    expect(close.status).toBe(200);

    const round = await prisma.votingRound.findUniqueOrThrow({ where: { id: roundId } });
    const late = await prisma.vote.count({ where: { roundId, updatedAt: { gt: round.closedAt! } } });
    expect(late).toBe(0);
    // every vote that was told "accepted" is really stored; the rest got a clean 409
    const accepted = votes.filter((v) => v.status === 201).length;
    expect(votes.every((v) => v.status === 201 || v.status === 409)).toBe(true);
    expect(await prisma.vote.count({ where: { roundId } })).toBe(accepted);
  }, 60_000);
});

/* ============================== round control ============================= */

describe("one live round per room", () => {
  it("parallel 'present team' clicks create exactly one active round", async () => {
    const r = await liveRoom(0);
    const attempts = await Promise.all(
      Array.from({ length: 5 }, () => call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: r.teamA.id }))
    );
    // idempotent: every click succeeds and they all point at the same round
    expect(attempts.map((a) => a.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(attempts.map((a) => a.body.round.id)).size).toBe(1);
    expect(await prisma.votingRound.count({ where: { roomId: r.room.id, status: { in: ["PENDING", "OPEN", "PAUSED"] } } })).toBe(1);
  });

  it("refuses to re-open a closed round while another one is live", async () => {
    const r = await liveRoom(0);
    const first = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);
    await call(r.modJar, "POST", `/rounds/${first}/close`, {});
    await presentAndOpen(r.modJar, r.room.id, r.teamB.id);
    const reopen = await call(r.adminJar, "POST", `/rounds/${first}/reopen`, {});
    expect(reopen.status).toBe(409);
  });

  it("mixed parallel picks of different teams still leave one active round", async () => {
    const r = await liveRoom(0);
    await Promise.all(
      [r.teamA, r.teamB, r.teamA, r.teamB].map((t) => call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: t.id }))
    );
    expect(await prisma.votingRound.count({ where: { roomId: r.room.id, status: { in: ["PENDING", "OPEN", "PAUSED"] } } })).toBe(1);
  });

  it("switching away from a never-opened team doesn't mark it as presented", async () => {
    const r = await liveRoom(0);
    await call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: r.teamA.id }); // mis-click
    await call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: r.teamB.id });
    const back = await call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: r.teamA.id });
    expect(back.status).toBe(201); // no "already presented — pass force" error
  });

  it("double 'open' is a clean 409, not a second transition", async () => {
    const r = await liveRoom(0);
    const sel = await call(r.modJar, "POST", `/rooms/${r.room.id}/rounds/select`, { teamId: r.teamA.id });
    const opens = await Promise.all([1, 2, 3].map(() => call(r.modJar, "POST", `/rounds/${sel.body.round.id}/open`, {})));
    expect(opens.map((o) => o.status).sort()).toEqual([200, 409, 409]);
  });
});

/* ================================= realtime ================================ */

describe("realtime", () => {
  it("delivers vote:submitted counts to the room's moderators", async () => {
    const r = await liveRoom(1);
    const roundId = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);
    const socket = ioClient(base, { transports: ["websocket"], extraHeaders: { cookie: cookie(r.modJar) } });
    try {
      await new Promise<void>((res, rej) => { socket.on("connect", () => res()); socket.on("connect_error", rej); });
      await new Promise((res) => socket.emit("room:join", { roomId: r.room.id }, res));
      const got = new Promise<any>((res) => socket.on("vote:submitted", res));
      await call(r.voterJars[0], "POST", `/rounds/${roundId}/votes`, r.ballot(7));
      const payload = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error("no vote:submitted within 3s")), 3000))]);
      expect(payload).toMatchObject({ roundId, votedCount: 1, eligibleCount: 2 }); // voter + teamless moderator
    } finally {
      socket.close();
    }
  });
});

/* ================================== access ================================= */

describe("access control", () => {
  it("unpublished full results are admin/moderator only", async () => {
    const r = await liveRoom(1);
    expect((await call(r.voterJars[0], "GET", `/rooms/${r.room.id}/results`)).status).toBe(404);
    expect((await call(r.voterJars[0], "GET", `/rooms/${r.room.id}/my-results`)).body.visible).toBe(false);
    expect((await call(r.modJar, "GET", `/rooms/${r.room.id}/results`)).status).toBe(200);
    expect((await call(r.adminJar, "GET", `/rooms/${r.room.id}/results`)).status).toBe(200);
  });

  it("room list shows participants only their rooms, without join codes", async () => {
    const r = await liveRoom(1);
    const other = await setupRoom(r.admin.id);
    const list = (await call(r.voterJars[0], "GET", "/rooms")).body.rooms as any[];
    expect(list.map((x) => x.id)).toContain(r.room.id);
    expect(list.map((x) => x.id)).not.toContain(other.room.id);
    expect(list.every((x) => x.joinCode === undefined)).toBe(true);
    expect((await call(r.voterJars[0], "GET", `/rooms/${r.room.id}`)).body.room.joinCode).toBeUndefined();
    // the room's moderator gets the code (to share it) from the room itself, not the list
    expect((await call(r.modJar, "GET", `/rooms/${r.room.id}`)).body.room.joinCode).toBe(r.room.joinCode);
  });

  it("temporary-password accounts can only reach auth endpoints", async () => {
    const u = await makeUser("PARTICIPANT", { mustChangePassword: true });
    const j = await login(u.username);
    expect((await call(j, "GET", "/auth/me")).status).toBe(200);
    const blocked = await call(j, "GET", "/rooms");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await call(j, "POST", "/auth/change-password", { currentPassword: PASSWORD, newPassword: "BrandNewPass123!" })).status).toBeLessThan(300);
    expect((await call(j, "GET", "/rooms")).status).toBe(200);
  });

  it("never sends password hashes to any client", async () => {
    const r = await liveRoom(1);
    const people = await call(r.adminJar, "GET", "/participants");
    expect(people.status).toBe(200);
    expect(JSON.stringify(people.body)).not.toContain("passwordHash");
    expect(JSON.stringify(people.body)).not.toContain("$argon2");
    const mine = await call(r.voterJars[0], "GET", `/rooms/${r.room.id}/my-membership`);
    expect(JSON.stringify(mine.body)).not.toContain("$argon2");
  });

  it("whitespace variants of a username share one lockout counter", async () => {
    const u = await makeUser("PARTICIPANT");
    const variants = [u.username, ` ${u.username}`, `${u.username} `, `  ${u.username}  `, u.username.toUpperCase()];
    for (let i = 0; i < 10; i++) {
      const j: Jar = {};
      absorb(j, await fetch(`${base}/api/auth/csrf`));
      await fetch(`${base}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: cookie(j), "X-CSRF-Token": j.csrf },
        body: JSON.stringify({ identifier: variants[i % variants.length], password: "wrong-password" }),
      });
    }
    const j: Jar = {};
    absorb(j, await fetch(`${base}/api/auth/csrf`));
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie(j), "X-CSRF-Token": j.csrf },
      body: JSON.stringify({ identifier: u.username, password: PASSWORD }),
    });
    expect(res.status).toBe(429);
  });

  it("audit log is served at /api/audit", async () => {
    const r = await liveRoom(0);
    const res = await call(r.adminJar, "GET", "/audit");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.logs)).toBe(true);
  });
});

/* ============================== config safety ============================= */

describe("configuration safety", () => {
  it("a partial settings PATCH keeps the other settings", async () => {
    const r = await liveRoom(0);
    await call(r.adminJar, "PATCH", `/rooms/${r.room.id}`, { settings: { allowVoteEdit: false } });
    await call(r.adminJar, "PATCH", `/rooms/${r.room.id}`, { settings: { liveResults: true } });
    const { room } = (await call(r.adminJar, "GET", `/rooms/${r.room.id}`)).body;
    expect(room.settings).toMatchObject({ allowVoteEdit: false, liveResults: true });
  });

  it("an identical resubmission is a no-op success, even where edits are disabled", async () => {
    const r = await liveRoom(1);
    await call(r.adminJar, "PATCH", `/rooms/${r.room.id}`, { settings: { allowVoteEdit: false } });
    const roundId = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);
    const first = await call(r.voterJars[0], "POST", `/rounds/${roundId}/votes`, r.ballot(6));
    expect(first.status).toBe(201);
    // the client retries after a lost response: same ballot
    const retry = await call(r.voterJars[0], "POST", `/rounds/${roundId}/votes`, r.ballot(6));
    expect(retry.status).toBe(201);
    expect(retry.body).toMatchObject({ voteId: first.body.voteId, revision: 1, unchanged: true });
    // a different ballot is still refused in this room
    expect((await call(r.voterJars[0], "POST", `/rounds/${roundId}/votes`, r.ballot(7))).status).toBe(409);
    const edits = await prisma.auditLog.count({ where: { entityId: first.body.voteId, action: "vote.edit" } });
    expect(edits).toBe(0);
  });

  it("a category with votes cannot be switched off mid-event", async () => {
    const r = await liveRoom(1);
    const roundId = await presentAndOpen(r.modJar, r.room.id, r.teamA.id);
    expect((await call(r.voterJars[0], "POST", `/rounds/${roundId}/votes`, r.ballot(6))).status).toBe(201);
    const res = await call(r.adminJar, "PATCH", `/categories/${r.cats[1].id}`, { active: false });
    expect(res.status).toBe(409);
  });
});
