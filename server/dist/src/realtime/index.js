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
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRealtime = createRealtime;
const socket_io_1 = require("socket.io");
const cookie_1 = require("cookie");
const config_1 = require("../config");
const auth_1 = require("../middleware/auth");
const codes_1 = require("../utils/codes");
const session_repo_1 = require("../repositories/session.repo");
const room_repo_1 = require("../repositories/room.repo");
const shared_1 = require("@voting/shared");
const emit_1 = require("./emit");
function createRealtime(httpServer) {
    const io = new socket_io_1.Server(httpServer, {
        cors: { origin: [config_1.env.WEB_ORIGIN], credentials: true },
        transports: ["websocket", "polling"], // polling fallback
        maxHttpBufferSize: 1e6,
    });
    (0, emit_1.setIo)(io);
    if (config_1.env.REDIS_URL) {
        (async () => {
            try {
                const { createClient } = await Promise.resolve().then(() => __importStar(require("redis")));
                const pub = createClient({ url: config_1.env.REDIS_URL });
                const sub = pub.duplicate();
                await Promise.all([pub.connect(), sub.connect()]);
                const { createAdapter } = await Promise.resolve().then(() => __importStar(require("@socket.io/redis-adapter")));
                io.adapter(createAdapter(pub, sub));
                console.log("[realtime] redis adapter enabled");
            }
            catch (e) {
                console.error("[realtime] redis adapter failed, running single-instance:", e);
            }
        })();
    }
    // session-authenticated handshake; every event & join is authorized
    io.use(async (socket, next) => {
        try {
            const cookies = (0, cookie_1.parse)(socket.request.headers.cookie ?? "");
            const token = cookies[auth_1.SESSION_COOKIE];
            if (!token)
                return next(new Error("unauthorized"));
            const session = await session_repo_1.sessionRepo.findValid((0, codes_1.sha256)(token));
            if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE" || session.user.deletedAt) {
                return next(new Error("unauthorized"));
            }
            socket.data.user = {
                id: session.user.id,
                role: session.user.role,
            };
            next();
        }
        catch {
            next(new Error("unauthorized"));
        }
    });
    io.on("connection", (socket) => {
        socket.on("room:join", async ({ roomId }, ack) => {
            const user = socket.data.user;
            if (!user)
                return ack?.({ ok: false, error: "unauthorized" });
            const room = await room_repo_1.roomRepo.findById(roomId);
            if (!room)
                return ack?.({ ok: false, error: "not_found" });
            const membership = await room_repo_1.roomRepo.findMember(roomId, user.id).catch(() => null);
            const isMod = user.role === "ADMIN" || (user.role === "MODERATOR" && membership?.role === "MODERATOR");
            if (!membership && user.role !== "ADMIN")
                return ack?.({ ok: false, error: "forbidden" });
            socket.join((0, shared_1.ROOM_CHANNEL)(roomId));
            if (isMod)
                socket.join(`mod:${roomId}`);
            ack?.({ ok: true, roomStatus: room.status });
        });
        socket.on("room:leave", async ({ roomId }) => {
            socket.leave((0, shared_1.ROOM_CHANNEL)(roomId));
            socket.leave(`mod:${roomId}`);
        });
        socket.on("disconnecting", () => {
            // nothing to persist; server state is source of truth
        });
    });
    // periodically clean expired sessions
    setInterval(() => session_repo_1.sessionRepo.deleteExpired().catch(() => { }), 10 * 60_000).unref?.();
    return io;
}
