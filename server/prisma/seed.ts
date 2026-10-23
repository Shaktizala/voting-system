import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding…");

  // ---------------------------------------------------------------- admin
  const adminHash = await argon2.hash("Admin123!", { type: argon2.argon2id });
  const admin = await prisma.user.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      name: "System Admin",
      username: "admin",
      email: "admin@example.org",
      passwordHash: adminHash,
      role: "ADMIN",
      mustChangePassword: false,
    },
  });
  console.log("Admin → admin / Admin123!");

  // ---------------------------------------------------------------- teams
  const teamNames = ["Team Alpha", "Team Beta", "Team Gamma", "Team Delta"];
  const teams: Record<string, { id: string }> = {};
  for (const name of teamNames) {
    const t = await prisma.team.upsert({
      where: { name },
      update: {},
      create: { name, description: `${name} — seeded sample team`, projectTitle: `Project by ${name}` },
    });
    teams[name] = t;
  }

  // ------------------------------------------------------- moderators & participants
  const modHash = await argon2.hash("Modordion123!", { type: argon2.argon2id });
  const mod = await prisma.user.upsert({
    where: { username: "moderator1" },
    update: {},
    create: {
      name: "Riley Moderator",
      username: "moderator1",
      email: "mod1@example.org",
      passwordHash: modHash,
      role: "MODERATOR",
      mustChangePassword: false,
    },
  });
  console.log("Moderator → moderator1 / Modordion123!");

  const participantData = [
    { name: "Alice Kumar", username: "alice", email: "alice@example.org", team: "Team Alpha" },
    { name: "Ben Osei", username: "ben", email: "ben@example.org", team: "Team Alpha" },
    { name: "Carla Diaz", username: "carla", email: "carla@example.org", team: "Team Beta" },
    { name: "Dmitri Novak", username: "dmitri", email: "dmitri@example.org", team: "Team Beta" },
    { name: "Elin Sjoberg", username: "elin", email: "elin@example.org", team: "Team Gamma" },
    { name: "Femi Ade", username: "femi", email: "femi@example.org", team: "Team Gamma" },
    { name: "Gita Rao", username: "gita", email: "gita@example.org", team: null }, // judge, no team
  ];
  const defaultHash = await argon2.hash("Participant123!", { type: argon2.argon2id });
  const users: Record<string, { id: string; username: string; teamId: string | null }> = {};
  for (const p of participantData) {
    const u = await prisma.user.upsert({
      where: { username: p.username },
      update: {},
      create: {
        name: p.name,
        username: p.username,
        email: p.email,
        passwordHash: defaultHash,
        role: "PARTICIPANT",
        teamId: p.team ? teams[p.team].id : null,
      },
    });
    users[p.username] = u;
  }
  console.log("Participants → alice|ben|carla|dmitri|elin|femi|gita / Participant123!");

  // ---------------------------------------------------------------- rooms
  const roomDefs = [
    {
      name: "Hackathon Finals",
      description: "Live technical evaluation room",
      categoryDefs: [
        { name: "Technical Depth", minScore: 1, maxScore: 10, step: 1, weight: 2 },
        { name: "Innovation", minScore: 1, maxScore: 10, step: 1, weight: 1.5 },
        { name: "Presentation", minScore: 1, maxScore: 10, step: 1, weight: 1 },
      ],
    },
    {
      name: "Design Sprint Review",
      description: "Design-focused evaluation room",
      categoryDefs: [
        { name: "Visual Clarity", minScore: 0, maxScore: 5, step: 1, weight: 1 },
        { name: "User Empathy", minScore: 0, maxScore: 5, step: 1, weight: 2 },
        { name: "Accessibility", minScore: 0, maxScore: 3, step: 1, weight: 1 },
      ],
    },
  ];

  for (const def of roomDefs) {
    const existing = await prisma.room.findFirst({ where: { name: def.name } });
    if (existing) {
      console.log(`Room "${def.name}" already seeded`);
      continue;
    }
    const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const code = Array.from({ length: 7 }, () => letters[Math.floor(Math.random() * letters.length)]).join("");
    const room = await prisma.room.create({
      data: { name: def.name, description: def.description, joinCode: code, status: "ACTIVE", createdById: admin.id },
    });
    const version = await prisma.roomConfigVersion.create({ data: { roomId: room.id, version: 1, isCurrent: true } });
    await prisma.category.createMany({
      data: def.categoryDefs.map((c, i) => ({ ...c, roomId: room.id, configVersionId: version.id, displayOrder: i, description: `Rate ${def.name}: ${c.name}` })),
    });

    const participantTeamIds = teamNames.slice(0, 3);
    for (const teamName of participantTeamIds) {
      await prisma.roomTeam.create({ data: { roomId: room.id, teamId: teams[teamName].id, presentationOrder: 0 } });
    }
    // admins see everything; moderator + participants below
    await prisma.roomTeam.update({
      where: { roomId_teamId: { roomId: room.id, teamId: teams["Team Delta"].id } },
      data: { presentationOrder: 4 },
    }).catch(() => {});
    if (teams["Team Delta"]) {
      const dt = await prisma.roomTeam.findUnique({ where: { roomId_teamId: { roomId: room.id, teamId: teams["Team Delta"].id } } });
      if (!dt) await prisma.roomTeam.create({ data: { roomId: room.id, teamId: teams["Team Delta"].id, presentationOrder: 4 } });
    }
    await prisma.roomMember.create({ data: { roomId: room.id, userId: mod.id, role: "MODERATOR", teamId: null } }).catch(() => {});
    for (const [username, u] of Object.entries(users)) {
      await prisma.roomMember.create({
        data: { roomId: room.id, userId: u.id, role: "PARTICIPANT", teamId: u.teamId },
      }).catch(() => {});
    }
    console.log(`Room "${def.name}" → join code ${code}`);
  }

  console.log("Seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(() => prisma.$disconnect());
