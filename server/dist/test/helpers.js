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
exports._spawn = exports._path = exports._fs = exports.mkcat = exports.PASSWORD = exports.uniqName = exports.U = exports.prisma = void 0;
exports.startServer = startServer;
exports.stopServer = stopServer;
exports.cookieJar = cookieJar;
exports.makeUser = makeUser;
exports.req = req;
exports.reqJar = reqJar;
exports.makeTeam = makeTeam;
exports.makeRoom = makeRoom;
exports.randomJoinCode = randomJoinCode;
exports.makeVoteWithScores = makeVoteWithScores;
exports.setupRoom = setupRoom;
exports.addMembership = addMembership;
exports.linkRoomTeam = linkRoomTeam;
exports.openRound = openRound;
exports.voteBody = voteBody;
const node_child_process_1 = require("node:child_process");
Object.defineProperty(exports, "_spawn", { enumerable: true, get: function () { return node_child_process_1.spawn; } });
const node_fs_1 = __importDefault(require("node:fs"));
exports._fs = node_fs_1.default;
const node_path_1 = __importDefault(require("node:path"));
exports._path = node_path_1.default;
const argon2_1 = __importDefault(require("argon2"));
const client_1 = require("@prisma/client");
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgresql://voting:voting@localhost:5432/voting?schema=public";
exports.prisma = new client_1.PrismaClient({ log: ["error"] });
let server = null;
let serverPort = 4005;
/** Boots the real Express app on a test port. */
async function startServer() {
    const mod = await Promise.resolve().then(() => __importStar(require("../src/app")));
    const app = mod.createApp();
    server = app.listen(serverPort);
    await new Promise((r) => server.on("listening", r));
    return `http://127.0.0.1:${serverPort}`;
}
async function stopServer() {
    if (server)
        await new Promise((r) => server.close(r));
}
/** A deterministic test-scoped tag so tests don't collide across run pools. */
const runId = process.env.VITEST_POOL_ID ?? "x";
let serial = 0;
const uniq = (s) => `${s}-${runId}-${++serial}-${Math.random().toString(36).slice(2, 6)}`;
exports.uniqName = uniq;
exports.U = uniq;
exports.PASSWORD = "Participant123!";
function cookieJar() {
    const jar = {};
    return {
        header() {
            return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
        },
        absorb(res) {
            const setCookie = res.headers.get("set-cookie");
            return Array.from(res.headers.getSetCookie?.() ?? (setCookie ? [setCookie] : []));
        },
        absorbAll(res) {
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
/** Registers + logs the user in directly through the API. */
async function makeUser(ctx, opts = {}) {
    const username = opts.username ?? (0, exports.U)("user");
    const user = await exports.prisma.user.create({
        data: {
            name: opts.name ?? username,
            username,
            email: `${username}@example.test`,
            passwordHash: await argon2_1.default.hash(exports.PASSWORD, { type: argon2_1.default.argon2id }),
            role: opts.role ?? "PARTICIPANT",
            teamId: opts.teamId ?? null,
            mustChangePassword: false,
        },
    });
    const res = await fetch(`${ctx.serverUrl}/api/auth/csrf`);
    const client = { jar: cookieJar(), serverUrl: ctx.serverUrl };
    client.jar.absorbAll(res);
    await client.jar.absorbAll(res);
    const login = await fetch(`${ctx.serverUrl}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: client.jar.header(), "X-CSRF-Token": client.jar.csrf },
        body: JSON.stringify({ identifier: username, password: exports.PASSWORD }),
    });
    client.jar.absorbAll(login);
    ctx.user = { id: user.id, username: user.username, role: (opts.role ?? "PARTICIPANT") };
    return user;
}
/** Raw fetch with cookie/CSRF attached from a jar. */
function req(ctx, path, init = {}) {
    const { method, body } = init;
    return reqJar(ctx.jar, ctx.serverUrl, path, { method, body });
}
function reqJar(jar, serverUrl, path, init = {}) {
    const headers = { "Content-Type": "application/json", Cookie: jar.header() };
    const method = init.method ?? (init.body ? "POST" : "GET");
    if (method !== "GET")
        headers["X-CSRF-Token"] = jar.csrf;
    return fetch(`${serverUrl}/api${path}`, {
        method,
        headers,
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
}
/* ------------------------------ domain helpers ---------------------------- */
async function makeTeam(name) {
    return exports.prisma.team.create({ data: { name: name ?? uniq("Team"), description: "test team" } });
}
async function makeRoom(opts = {}, creatorId) {
    return exports.prisma.room.create({
        data: {
            name: opts.name ?? uniq("Room"),
            accessMode: opts.accessMode ?? "RESTRICTED",
            status: opts.status ?? "ACTIVE",
            createdById: creatorId,
            settings: opts.settings ?? undefined,
            joinCode: opts.joinCode ?? randomJoinCode(),
        },
    });
}
const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomJoinCode() {
    return Array.from({ length: 7 }, () => JOIN_ALPHABET[Math.floor(Math.random() * JOIN_ALPHABET.length)]).join("");
}
const mkcat = async (roomId, versionId, overrides = {}) => {
    return exports.prisma.category.create({
        data: {
            roomId,
            configVersionId: versionId,
            name: overrides.name ?? uniq("Cat"),
            minScore: 1,
            maxScore: 10,
            step: 1,
            weight: 1,
            isRequired: true,
            displayOrder: 0,
            ...overrides,
        },
    });
};
exports.mkcat = mkcat;
async function makeVoteWithScores(roomId, roundId, teamId, voterId, scores) {
    const vote = await exports.prisma.vote.create({ data: { roundId, roomId, teamId, voterId } });
    for (const s of scores) {
        await exports.prisma.voteScore.create({ data: { voteId: vote.id, categoryId: s.categoryId, roomId, score: s.score } });
    }
    return vote;
}
/** Creates room + v1 config + categories. */
async function setupRoom(creatorId, opts = {}) {
    const room = await makeRoom({ status: opts.status ?? "ACTIVE" }, creatorId);
    const version = await exports.prisma.roomConfigVersion.create({ data: { roomId: room.id, version: 1, isCurrent: true } });
    const cats = [];
    for (const def of opts.categories ?? [{}, {}]) {
        cats.push(await (0, exports.mkcat)(room.id, version.id, def));
    }
    return { room, version, cats };
}
async function addMembership(roomId, userId, teamId, role = "PARTICIPANT") {
    return exports.prisma.roomMember.create({ data: { roomId, userId, teamId, role } });
}
async function linkRoomTeam(roomId, teamId, order = 0) {
    return exports.prisma.roomTeam.create({ data: { roomId, teamId, presentationOrder: order } });
}
async function openRound(roomId, teamId) {
    const version = await exports.prisma.roomConfigVersion.findFirst({ where: { roomId, isCurrent: true } });
    return exports.prisma.votingRound.create({
        data: { roomId, teamId, status: "OPEN", configVersionId: version.id, openedAt: new Date() },
    });
}
function voteBody(roundId, categories, score) {
    const scores = (typeof score === "number" ? categories.map(() => score) : score).map((v, i) => ({ categoryId: categories[i], score: v }));
    return { roundId, scores };
}
