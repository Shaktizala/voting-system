/**
 * Bulk team import: CSV preview/commit, duplicate protection, room assignment,
 * automatic participant creation and assignment of existing accounts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import argon2 from "argon2";
import {
  prisma,
  startServer,
  stopServer,
  setupRoom,
  U,
  PASSWORD,
} from "./helpers";

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
      for (const cookie of (res as any).headers.getSetCookie?.() ?? []) {
        const [pair] = cookie.split(";");
        const i = pair.indexOf("=");
        store[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
      }
    },
  };
}

async function login(identifier: string, password = PASSWORD) {
  const j = jar();
  j.absorb(await fetch(`${base}/api/auth/csrf`));
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: j.header(), "X-CSRF-Token": j.csrf() },
    body: JSON.stringify({ identifier, password }),
  });
  j.absorb(res);
  return { j, status: res.status, body: await res.json() };
}

async function makeAdmin() {
  const username = U("admin-import");
  const user = await prisma.user.create({
    data: {
      name: username,
      username,
      email: `${username}@test.example`,
      passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
      role: "ADMIN",
      mustChangePassword: false,
    },
  });
  const { j } = await login(username);
  return { user, j };
}

function csv(header: string[], rows: string[][]) {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [header.join(",")].concat(rows.map((row) => row.map(quote).join(","))).join("\n");
}

function form(file: string, fields: Record<string, string> = {}) {
  const body = new FormData();
  body.append("file", new Blob([file], { type: "text/csv" }), "teams.csv");
  for (const [key, value] of Object.entries(fields)) body.append(key, value);
  return body;
}

async function uploadCall(j: ReturnType<typeof jar>, path: string, body: FormData): Promise<{ status: number; body: any }> {
  const res = await fetch(`${base}/api${path}`, {
    method: "POST",
    headers: { Cookie: j.header(), "X-CSRF-Token": j.csrf() },
    body,
  });
  return {
    status: res.status,
    body: res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text(),
  };
}

const HEADER = [
  "team_name",
  "team_description",
  "project_title",
  "participant_name",
  "participant_email",
  "participant_username",
  "participant_role",
];

describe("bulk team import", () => {
  it("creates teams, participants and room assignments from a CSV", async () => {
    const { user: admin, j } = await makeAdmin();
    const { room } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });

    const teamA = U("Import Aurora");
    const teamB = U("Import Nova");
    const alice = U("alice").toLowerCase();
    const bob = U("bob").toLowerCase();
    const carol = U("carol").toLowerCase();
    const file = csv(HEADER, [
      [teamA, "Rover control", "Atlas", "Alice One", `${alice}@test.example`, alice, "PARTICIPANT"],
      [teamA, "Rover control", "Atlas", "Bob Two", `${bob}@test.example`, bob, "PARTICIPANT"],
      [teamB, "Design toolkit", "Prism", "Carol Three", `${carol}@test.example`, carol, "MODERATOR"],
    ]);

    const preview = await uploadCall(j, "/teams/import/preview", form(file, { roomId: room.id }));
    expect(preview.status).toBe(200);
    expect(preview.body.errorCount).toBe(0);
    expect(preview.body.teamCount).toBe(2);
    expect(preview.body.participantCount).toBe(3);
    expect(preview.body.validTeamCount).toBe(2);
    expect(preview.body.room.id).toBe(room.id);

    const committed = await uploadCall(j, "/teams/import/commit", form(file, { roomId: room.id }));
    expect(committed.status).toBe(200);
    expect(committed.body.teamsCreated).toBe(2);
    expect(committed.body.teamsFailed).toBe(0);
    expect(committed.body.participantsCreated).toBe(3);
    expect(committed.body.participantsAssigned).toBe(0);
    expect(committed.body.rowsCommitted).toBe(3);
    expect(committed.body.rowsSkipped).toBe(0);
    expect(committed.body.credentials).toHaveLength(3);

    const createdA = await prisma.team.findFirst({ where: { name: teamA } });
    const createdB = await prisma.team.findFirst({ where: { name: teamB } });
    expect(createdA).toBeTruthy();
    expect(createdB).toBeTruthy();
    expect(createdA!.description).toBe("Rover control");
    expect(createdA!.projectTitle).toBe("Atlas");

    const createdUsers = await prisma.user.findMany({
      where: { username: { in: [alice, bob, carol] } },
    });
    expect(createdUsers).toHaveLength(3);
    expect(createdUsers.find((u) => u.username === alice)!.teamId).toBe(createdA!.id);
    expect(createdUsers.find((u) => u.username === bob)!.teamId).toBe(createdA!.id);
    expect(createdUsers.find((u) => u.username === carol)!.teamId).toBe(createdB!.id);
    expect(createdUsers.find((u) => u.username === alice)!.mustChangePassword).toBe(true);

    const roomTeams = await prisma.roomTeam.findMany({ where: { roomId: room.id }, orderBy: { presentationOrder: "asc" } });
    expect(roomTeams.map((rt) => rt.teamId)).toEqual([createdA!.id, createdB!.id]);
    expect(roomTeams.map((rt) => rt.presentationOrder)).toEqual([1, 2]);

    const roomMembers = await prisma.roomMember.findMany({ where: { roomId: room.id } });
    expect(roomMembers).toHaveLength(3);
    for (const member of roomMembers) {
      const expectedTeam = member.userId === createdUsers.find((u) => u.username === carol)!.id ? createdB!.id : createdA!.id;
      expect(member.teamId).toBe(expectedTeam);
    }

    // Audit trail names the import and its counts.
    const audit = await prisma.auditLog.findFirst({ where: { action: "team.bulk_import", actorId: admin.id } });
    expect(audit).toBeTruthy();
    expect((audit!.after as any).teamsCreated).toBe(2);
  }, 30000);

  it("reports invalid rows, blocks all-or-nothing writes, and commits valid rows only", async () => {
    const { j } = await makeAdmin();
    const existingTeam = await prisma.team.create({ data: { name: U("Existing Team") } });
    const validTeam = U("Valid Team");
    const duplicateUsername = U("dupuser").toLowerCase();
    const file = csv(HEADER, [
      [validTeam, "", "", "Valid Person", `${U("valid").toLowerCase()}@test.example`, U("valid").toLowerCase(), "PARTICIPANT"],
      ["", "", "", "No Team", `${U("noteam").toLowerCase()}@test.example`, U("noteam").toLowerCase(), "PARTICIPANT"],
      [existingTeam.name, "", "", "Duplicate Team", `${U("dupteam").toLowerCase()}@test.example`, U("dupteam").toLowerCase(), "PARTICIPANT"],
      [U("Bad Parts"), "", "", "Bad Email", "not-an-email", U("badmail").toLowerCase(), "PARTICIPANT"],
      [validTeam, "", "", "Duplicate User", `${U("dup2").toLowerCase()}@test.example`, duplicateUsername, "PARTICIPANT"],
      [validTeam, "", "", "Duplicate User Again", `${U("dup3").toLowerCase()}@test.example`, duplicateUsername, "PARTICIPANT"],
    ]);

    const preview = await uploadCall(j, "/teams/import/preview", form(file));
    expect(preview.status).toBe(200);
    expect(preview.body.errorCount).toBe(4);
    expect(preview.body.validRowCount).toBe(2);
    const messages = preview.body.rows.flatMap((row: any) => row.errors).join(" | ");
    expect(messages).toMatch(/Missing team name/);
    expect(messages).toMatch(/already exists/);
    expect(messages).toMatch(/Invalid participant email/);
    expect(messages).toMatch(/Duplicate username in file/);

    const blocked = await uploadCall(j, "/teams/import/commit", form(file, { allOrNothing: "true" }));
    expect(blocked.status).toBe(400);
    expect(await prisma.team.findFirst({ where: { name: validTeam } })).toBeNull();

    const committed = await uploadCall(j, "/teams/import/commit", form(file));
    expect(committed.status).toBe(200);
    expect(committed.body.teamsCreated).toBe(1);
    expect(committed.body.participantsCreated).toBe(2);
    expect(committed.body.rowsSkipped).toBe(4);
    expect(committed.body.failed).toHaveLength(4);
    expect(await prisma.team.findFirst({ where: { name: validTeam } })).toBeTruthy();
  }, 30000);

  it("assigns an existing participant with no team instead of creating a duplicate", async () => {
    const { user: admin, j } = await makeAdmin();
    const { room } = await setupRoom(admin.id, { categories: [{ name: "C1" }] });
    const username = U("existing").toLowerCase();
    const existing = await prisma.user.create({
      data: {
        name: "Existing Person",
        username,
        email: `${username}@test.example`,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        role: "PARTICIPANT",
        mustChangePassword: false,
      },
    });
    const teamName = U("Existing Team Import");
    const file = csv(HEADER, [
      [teamName, "Already registered", "", "Existing Person", `${username}@test.example`, username, "PARTICIPANT"],
    ]);

    const preview = await uploadCall(j, "/teams/import/preview", form(file, { roomId: room.id }));
    expect(preview.status).toBe(200);
    expect(preview.body.errorCount).toBe(0);
    expect(preview.body.rows[0].participant.existingUserId).toBe(existing.id);
    expect(preview.body.teams[0].existingParticipantCount).toBe(1);

    const committed = await uploadCall(j, "/teams/import/commit", form(file, { roomId: room.id }));
    expect(committed.status).toBe(200);
    expect(committed.body.participantsCreated).toBe(0);
    expect(committed.body.participantsAssigned).toBe(1);
    expect(committed.body.credentials).toHaveLength(0);

    const team = await prisma.team.findFirst({ where: { name: teamName } });
    expect(team).toBeTruthy();
    const updated = await prisma.user.findUnique({ where: { id: existing.id } });
    expect(updated!.teamId).toBe(team!.id);
    const membership = await prisma.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: existing.id } },
    });
    expect(membership!.teamId).toBe(team!.id);
  }, 30000);

  it("rejects an existing participant who already belongs to another team", async () => {
    const { j } = await makeAdmin();
    const oldTeam = await prisma.team.create({ data: { name: U("Old Team") } });
    const username = U("taken").toLowerCase();
    await prisma.user.create({
      data: {
        name: "Taken Person",
        username,
        email: `${username}@test.example`,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        role: "PARTICIPANT",
        teamId: oldTeam.id,
        mustChangePassword: false,
      },
    });
    const file = csv(HEADER, [
      [U("New Team"), "", "", "Taken Person", `${username}@test.example`, username, "PARTICIPANT"],
    ]);

    const preview = await uploadCall(j, "/teams/import/preview", form(file));
    expect(preview.status).toBe(200);
    expect(preview.body.errorCount).toBe(1);
    expect(preview.body.rows[0].errors.join(" ")).toMatch(/already belongs to team/);

    const committed = await uploadCall(j, "/teams/import/commit", form(file));
    expect(committed.status).toBe(200);
    expect(committed.body.teamsCreated).toBe(0);
    expect(committed.body.teamsFailed).toBe(1);
    expect(committed.body.participantsCreated).toBe(0);
    expect(committed.body.participantsAssigned).toBe(0);
    expect(committed.body.failed).toHaveLength(1);
  }, 30000);

  it("serves a CSV template with the expected headers", async () => {
    const { j } = await makeAdmin();
    const res = await fetch(`${base}/api/teams/import/template`, {
      headers: { Cookie: j.header() },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const text = await res.text();
    expect(text.split("\n")[0]).toBe(HEADER.join(","));
    expect(text).toMatch(/team_name/);
    expect(text).toMatch(/participant_username/);
  }, 30000);

  it("requires admin permission", async () => {
    const username = U("participant-import");
    await prisma.user.create({
      data: {
        name: username,
        username,
        email: `${username}@test.example`,
        passwordHash: await argon2.hash(PASSWORD, { type: argon2.argon2id }),
        role: "PARTICIPANT",
        mustChangePassword: false,
      },
    });
    const { j } = await login(username);
    const file = csv(HEADER, [[U("Forbidden Team"), "", "", "", "", "", ""]]);
    const res = await uploadCall(j, "/teams/import/preview", form(file));
    expect(res.status).toBe(403);
  }, 30000);
});
