import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://voting:voting@localhost:5432/voting?schema=public";

export const prisma = new PrismaClient({ log: ["error"] });

let server: any = null;
let serverPort = 4005;

/** Boots the real Express app on a test port. */
export async function startServer(): Promise<string> {
  const mod = await import("../src/app");
  const app = (mod as any).createApp();
  server = app.listen(serverPort);
  await new Promise((r) => server.on("listening", r));
  return `http://127.0.0.1:${serverPort}`;
}

export async function stopServer() {
  if (server) await new Promise((r) => server.close(r));
}

/** A deterministic test-scoped tag so tests don't collide across run pools. */
const runId = process.env.VITEST_POOL_ID ?? "x";
let serial = 0;
const uniq = (s: string) => `${s}-${runId}-${++serial}-${Math.random().toString(36).slice(2, 6)}`;
export const U = uniq;
export { uniq as uniqName };

export const PASSWORD = "Participant123!";

export function cookieJar(){
  const jar: Record<string, string> = {};
  return {
    header(): string {
      return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
    },
    absorb(res: Response) {
      const setCookie = res.headers.get("set-cookie");
      return Array.from(res.headers.getSetCookie?.() ?? (setCookie ? [setCookie] : []));
    },
    absorbAll(res: Response) {
      for (const c of res.headers.getSetCookie?.() ?? []) {
        const [pair] = c.split(";");
        const idx = pair.indexOf("=");
        jar[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
      }
    },
    get csrf() {
      return jar["csrf"] ?? "";
    },
  };
}

export interface TestClient {
  jar: ReturnType<typeof cookieJar>;
  serverUrl: string;
  user?: { id: string; username: string; role: string };
}

/** Registers + logs the user in directly through the API. */
export async function makeUser(
  ctx: TestClient,
  opts: { username?: string; role?: "ADMIN" | "MODERATOR" | "PARTICIPANT"; teamId?: string | null; name?: string } = {}
): Promise<{ id: string; username: string; email: string }> {
  const username = opts.username ?? U("user");
  const user = await prisma.user.create({
    data: {
      name: opts.name ?? username,
      username,
      email: `${username}@example.test`,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      role: opts.role ?? "PARTICIPANT",
      teamId: opts.teamId ?? null,
      mustChangePassword: false,
    },
  });
  const res = await fetch(`${ctx.serverUrl}/api/auth/csrf`);
  const client: TestClient = { jar: cookieJar(), serverUrl: ctx.serverUrl };
  client.jar.absorbAll(res);
  await client.jar.absorbAll(res);
  const login = await fetch(`${ctx.serverUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: client.jar.header(), "X-CSRF-Token": client.jar.csrf },
    body: JSON.stringify({ identifier: username, password: PASSWORD }),
  });
  client.jar.absorbAll(login);
  ctx.user = { id: user.id, username: user.username, role: (opts.role ?? "PARTICIPANT") as string };
  return user;
}

/** Raw fetch with cookie/CSRF attached from a jar. */
export function req(ctx: TestClient, path: string, init: { method?: string; body?: unknown } = {}) {
  const { method, body } = init;
  return reqJar(ctx.jar, ctx.serverUrl, path, { method, body });
}

export function reqJar(jar: ReturnType<typeof cookieJar>, serverUrl: string, path: string, init: { method?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json", Cookie: jar.header() };
  const method = init.method ?? (init.body ? "POST" : "GET");
  if (method !== "GET") headers["X-CSRF-Token"] = jar.csrf;
  return fetch(`${serverUrl}/api${path}`, {
    method,
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/* ------------------------------ domain helpers ---------------------------- */

export async function makeTeam(name?: string) {
  return prisma.team.create({ data: { name: name ?? uniq("Team"), description: "test team" } });
}

export async function makeRoom(opts: any = {}, creatorId?: string) {
  return prisma.room.create({
    data: {
      name: opts.name ?? uniq("Room"),
      accessMode: opts.accessMode ?? "RESTRICTED",
      status: opts.status ?? "ACTIVE",
      createdById: creatorId!,
      settings: opts.settings ?? undefined,
      joinCode: opts.joinCode ?? randomJoinCode(),
    },
  });
}

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function randomJoinCode() {
  return Array.from({ length: 7 }, () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]).join("");
}

export const mkcat = async (roomId: string, versionId: string, overrides: Record<string, unknown> = {}) => {
  return prisma.category.create({
    data: {
      roomId,
      configVersionId: versionId,
      name: (overrides.name as string) ?? uniq("Cat"),
      minScore: 1,
      maxScore: 10,
      step: 1,
      weight: 1,
      isRequired: true,
      displayOrder: 0,
      ...overrides,
    } as any,
  });
};

export async function makeVoteWithScores(roomId: string, roundId: string, teamId: string, voterId: string, scores: { categoryId: string; score: number }[]) {
  const vote = await prisma.vote.create({ data: { roundId, roomId, teamId, voterId } });
  for (const s of scores) {
    await prisma.voteScore.create({ data: { voteId: vote.id, categoryId: s.categoryId, roomId, score: s.score } });
  }
  return vote;
}

/** Creates room + v1 config + categories. */
export async function setupRoom(creatorId: string, opts: { categories?: { name?: string; minScore?: number; maxScore?: number; step?: number; weight?: number; isRequired?: boolean }[]; status?: string } = {}) {
  const room = await makeRoom({ status: opts.status ?? "ACTIVE" }, creatorId);
  const version = await prisma.roomConfigVersion.create({ data: { roomId: room.id, version: 1, isCurrent: true } });
  const cats = [];
  for (const def of opts.categories ?? [{}, {}]) {
    cats.push(await mkcat(room.id, version.id, def as any));
  }
  return { room, version, cats };
}

export async function addMembership(roomId: string, userId: string, teamId: string | null, role: "PARTICIPANT" | "MODERATOR" = "PARTICIPANT") {
  return prisma.roomMember.create({ data: { roomId, userId, teamId, role } });
}

export async function linkRoomTeam(roomId: string, teamId: string, order = 0) {
  return prisma.roomTeam.create({ data: { roomId, teamId, presentationOrder: order } });
}

export async function openRound(roomId: string, teamId: string) {
  const version = await prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
  return prisma.votingRound.create({
    data: { roomId, teamId, status: "OPEN", configVersionId: version!.id, openedAt: new Date() },
  });
}

export function voteBody(roundId: string, categories: string[], score: number | number[]) {
  const scores = (typeof score === "number" ? categories.map(() => score) : score).map((v, i) => ({ categoryId: categories[i], score: v }));
  return { roundId, scores };
}

export { fs as _fs, path as _path, spawn as _spawn };
