import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { io, type Socket } from "socket.io-client";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./Auth";

interface RealtimeCtx {
  connected: boolean;
  socketRef: React.MutableRefObject<Socket | null>;
  join: (roomId: string) => Promise<boolean>;
  leave: (roomId: string) => void;
}

const Ctx = createContext<RealtimeCtx | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const joined = useRef<string | null>(null);

  useEffect(() => {
    socketRef.current = io("/", { withCredentials: true, transports: ["polling", "websocket"] });
    const socket = socketRef.current;
    let everConnected = false;
    let resync: ReturnType<typeof setTimeout> | undefined;
    socket.on("connect", () => {
      setConnected(true);
      if (joined.current) socket.emit("room:join", { roomId: joined.current });
      // after a REconnect, events may have been missed: resync active views.
      // Jittered so a server restart doesn't make every client refetch at once.
      if (everConnected) {
        clearTimeout(resync);
        resync = setTimeout(() => qc.invalidateQueries({ type: "active" }), Math.random() * 3000);
      }
      everConnected = true;
    });
    socket.on("disconnect", () => setConnected(false));
    return () => {
      clearTimeout(resync);
      socket.close();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const join = (roomId: string) =>
    new Promise<boolean>((resolve) => {
      joined.current = roomId;
      socketRef.current?.emit("room:join", { roomId }, (r: { ok: boolean }) => resolve(r?.ok ?? false));
    });

  const leave = (roomId: string) => {
    if (joined.current === roomId) joined.current = null;
    socketRef.current?.emit("room:leave", { roomId });
  };

  return <Ctx.Provider value={{ connected, socketRef, join, leave }}>{children}</Ctx.Provider>;
}

export function useRealtime() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRealtime outside provider");
  return ctx;
}
