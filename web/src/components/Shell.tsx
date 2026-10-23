import { Routes, Route, NavLink, Navigate, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../contexts/Auth";
import { useRealtime } from "../contexts/Realtime";
import { Button, StatusBadge } from "./ui";
import { useEffect } from "react";
import { api } from "../lib/api";
import type { ReactNode } from "react";

export function Nav({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1">
      {children}
    </nav>
  );
}

export function NavLinkItem({ to, children }: { to: string; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium ${
          isActive ? "bg-gray-900 text-white" : "text-gray-200 hover:bg-white/10"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function ConnectionDot() {
  const { connected } = useRealtime();
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-gray-200"
      title={connected ? "Realtime connected" : "Realtime offline — polling fallback active"}
    >
      <span className={`h-2 w-2 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} aria-hidden="true" />
      {connected ? "live" : "reconnecting"}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  if (!user) return <>{children}</>;

  const isAdmin = user.role === "ADMIN";
  return (
    <div className="min-h-screen">
      <header className="bg-gray-900 text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-lg font-bold tracking-tight">TeamVote</Link>
            <Nav>
              {isAdmin && (
                <>
                  <NavLinkItem to="/admin">Dashboard</NavLinkItem>
                  <NavLinkItem to="/admin/participants">Participants</NavLinkItem>
                  <NavLinkItem to="/admin/teams">Teams</NavLinkItem>
                  <NavLinkItem to="/admin/rooms">Rooms</NavLinkItem>
                  <NavLinkItem to="/admin/audit">Audit log</NavLinkItem>
                </>
              )}
              {user.role !== "ADMIN" && (
                <>
                  <NavLinkItem to="/rooms">My rooms</NavLinkItem>
                  <NavLinkItem to="/my-results">My results</NavLinkItem>
                </>
              )}
            </Nav>
          </div>
          <div className="flex items-center gap-3">
            <ConnectionDot />
            <span className="text-xs text-gray-300">{user.name} · {user.role.toLowerCase()}</span>
            <Button
              variant="ghost"
              className="text-gray-200 hover:bg-white/10"
              onClick={async () => {
                await logout();
                navigate("/login");
              }}
            >
              Log out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
