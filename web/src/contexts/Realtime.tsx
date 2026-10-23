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

  const reconnectedCount = useRef(0);

  useEffect(() => {
    socketRef.current = io("/", { withCredentials: true, transports: ["polling", "websocket"] });
    const socket = socketRef.current;
    socket.on("connect", () => {
      setConnected(true);
      // full resync after (re)connection
      if (joined.current) socket.emit("room:join", { roomId: joined.current });
      qc.invalidateQueries();
      reconnectedCount.current = 0;
    });
    socket.on("disconnect", () => setConnected(false));
    return () => {
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
