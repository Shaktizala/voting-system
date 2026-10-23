import { Server, type Socket } from "socket.io";
import { parse as parseCookie } from "cookie";
import { env } from "../config";
import { SESSION_COOKIE } from "../middleware/auth";
import { sha256 } from "../utils/codes";
import { sessionRepo } from "../repositories/session.repo";
import { roomRepo } from "../repositories/room.repo";
import { ROOM_CHANNEL } from "@voting/shared";
import { setIo } from "./emit";

export function createRealtime(httpServer: any): Server {
  const io = new Server(httpServer, {
    cors: { origin: [env.WEB_ORIGIN], credentials: true },
    transports: ["websocket", "polling"], // polling fallback
    maxHttpBufferSize: 1e6,
  });

  setIo(io);

  if (env.REDIS_URL) {
    (async () => {
      try {
        const { createClient } = await import("redis");
        const pub = createClient({ url: env.REDIS_URL });
        const sub = pub.duplicate();
        await Promise.all([pub.connect(), sub.connect()]);
        const { createAdapter } = await import("@socket.io/redis-adapter");
        io.adapter(createAdapter(pub as any, sub as any));
        console.log("[realtime] redis adapter enabled");
      } catch (e) {
        console.error("[realtime] redis adapter failed, running single-instance:", e);
      }
    })();
  }

  // session-authenticated handshake; every event & join is authorized
  io.use(async (socket, next) => {
    try {
      const cookies = parseCookie(socket.request.headers.cookie ?? "");
      const token = cookies[SESSION_COOKIE];
      if (!token) return next(new Error("unauthorized"));
      const session = await sessionRepo.findValid(sha256(token));
      if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE" || session.user.deletedAt) {
        return next(new Error("unauthorized"));
      }
      socket.data.user = {
        id: session.user.id,
        role: session.user.role,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: Socket) => {
    socket.on("room:join", async ({ roomId }: { roomId: string }, ack?: (r: unknown) => void) => {
      const user = socket.data.user as { id: string; role: string } | undefined;
      if (!user) return ack?.({ ok: false, error: "unauthorized" });
      const room = await roomRepo.findById(roomId);
      if (!room) return ack?.({ ok: false, error: "not_found" });
      const membership = await roomRepo.findMember(roomId, user.id).catch(() => null);
      const isMod = user.role === "ADMIN" || (user.role === "MODERATOR" && membership?.role === "MODERATOR");
      if (!membership && user.role !== "ADMIN") return ack?.({ ok: false, error: "forbidden" });

      socket.join(ROOM_CHANNEL(roomId));
      if (isMod) socket.join(`mod:${roomId}`);
      ack?.({ ok: true, roomStatus: room.status });
    });

    socket.on("room:leave", async ({ roomId }: { roomId: string }) => {
      socket.leave(ROOM_CHANNEL(roomId));
      socket.leave(`mod:${roomId}`);
    });

    socket.on("disconnecting", () => {
      // nothing to persist; server state is source of truth
    });
  });

  // periodically clean expired sessions
  setInterval(() => sessionRepo.deleteExpired().catch(() => {}), 10 * 60_000).unref?.();

  return io;
}
