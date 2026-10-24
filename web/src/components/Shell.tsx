import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth, type AuthUser } from "../contexts/Auth";
import { useRealtime } from "../contexts/Realtime";
import { BrandLockup, BrandMark } from "./Brand";
import {
  IconActivity,
  IconAudit,
  IconChart,
  IconClose,
  IconDashboard,
  IconLogout,
  IconMenu,
  IconRooms,
  IconTeams,
  IconUsers,
  IconWifi,
} from "./icons";

/* --------------------------------- nav ---------------------------------- */

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
}

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
        `rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          isActive
            ? "bg-ink-900 text-white shadow-sm"
            : "text-ink-600 hover:bg-ink-900/[0.055] hover:text-ink-900"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

export function ConnectionDot({
  dark = false,
  compact = false,
}: {
  dark?: boolean;
  compact?: boolean;
}) {
  const { connected } = useRealtime();
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 text-[11px] font-medium ${
        dark ? "text-white/55" : "text-ink-500"
      }`}
      title={connected ? "Realtime connected" : "Realtime offline — polling fallback active"}
    >
      <span className="relative flex h-2 w-2" aria-hidden="true">
        {connected && (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-jade-400 opacity-60" />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${
            connected ? "bg-jade-500" : "bg-gold-500"
          }`}
        />
      </span>
      {!compact && (connected ? "Realtime live" : "Reconnecting…")}
    </span>
  );
}

/* -------------------------------- shell --------------------------------- */

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // close the mobile drawer whenever the route changes
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => closeButtonRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      cancelAnimationFrame(frame);
    };
  }, [drawerOpen]);

  if (!user) return <>{children}</>;

  const isAdmin = user.role === "ADMIN";

  const items: NavItem[] = isAdmin
    ? [
        { to: "/admin", label: "Dashboard", icon: <IconDashboard size={18} />, end: true },
        { to: "/admin/participants", label: "Participants", icon: <IconUsers size={18} /> },
        { to: "/admin/teams", label: "Teams", icon: <IconTeams size={18} /> },
        { to: "/admin/rooms", label: "Rooms", icon: <IconRooms size={18} /> },
        { to: "/admin/audit", label: "Audit log", icon: <IconAudit size={18} /> },
      ]
    : [
        { to: "/rooms", label: "My rooms", icon: <IconRooms size={18} /> },
        { to: "/my-results", label: "My results", icon: <IconChart size={18} /> },
      ];

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      navigate("/login");
    }
  };

  return (
    <div className="min-h-screen lg:pl-[272px]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-xl focus:bg-ink-950 focus:px-4 focus:py-2.5 focus:text-sm focus:font-semibold focus:text-white focus:shadow-lift"
      >
        Skip to content
      </a>

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] flex-col overflow-hidden bg-ink-950 text-white lg:flex">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-brand-600/30 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-72 w-72 rounded-full bg-jade-500/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "48px 48px",
            }}
          />
        </div>

        <div className="relative flex h-full flex-col px-4 py-6">
          <div className="px-2">
            <BrandLockup dark />
          </div>

          <div className="mt-9 flex-1 overflow-y-auto scrollbar-slim">
            <p className="px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-white/30">
              {isAdmin ? "Admin workspace" : "Your workspace"}
            </p>
            <nav aria-label="Main navigation" className="mt-3 space-y-1">
              {items.map((item) => (
                <SidebarNavItem key={item.to} item={item} />
              ))}
            </nav>

            <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.045] p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">
                  Connection
                </span>
                <IconWifi size={14} className="text-white/30" />
              </div>
              <div className="mt-2">
                <ConnectionDot dark />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/35">
                Updates stream live. A polling fallback keeps things fresh if the socket drops.
              </p>
            </div>

            <div className="mt-3 rounded-2xl border border-brand-400/20 bg-gradient-to-br from-brand-500/15 to-jade-500/10 p-3.5">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-200">
                <IconActivity size={13} />
                Everything audited
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-white/45">
                Every round, vote change, and publish action is recorded for a clean review trail.
              </p>
            </div>
          </div>

          <UserPanel user={user} onLogout={handleLogout} />
        </div>
      </aside>

      {/* mobile header */}
      <header className="sticky top-0 z-30 border-b border-line/80 bg-white/80 backdrop-blur-xl lg:hidden">
        <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation"
              className="grid h-10 w-10 place-items-center rounded-xl border border-line bg-white text-ink-700 shadow-sm transition hover:bg-ink-50 focus-visible:ring-4 focus-visible:ring-brand-500/20"
            >
              <IconMenu size={19} />
            </button>
            <BrandLockup compact />
            <span className="font-display text-[15px] font-semibold tracking-tight text-ink-950 sm:hidden">
              TeamVote
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:block">
              <ConnectionDot />
            </span>
            <span className="hidden h-4 w-px bg-line sm:block" aria-hidden="true" />
            <span className="text-right">
              <span className="block max-w-[9rem] truncate text-xs font-semibold text-ink-800">
                {user.name}
              </span>
              <span className="block text-[10px] uppercase tracking-[0.12em] text-ink-400">
                {user.role.toLowerCase()}
              </span>
            </span>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-brand-400 to-brand-700 text-[11px] font-bold text-white shadow-glow">
              {initials(user.name)}
            </span>
          </div>
        </div>
      </header>

      {/* mobile drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-ink-950/55 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
            aria-hidden="true"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            className="absolute inset-y-0 left-0 flex w-[300px] max-w-[86vw] animate-drawer-in flex-col overflow-hidden bg-ink-950 px-4 py-5 text-white shadow-2xl"
          >
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              <div className="absolute -left-20 -top-20 h-56 w-56 rounded-full bg-brand-600/35 blur-3xl" />
              <div className="absolute -bottom-24 -right-16 h-64 w-64 rounded-full bg-jade-500/15 blur-3xl" />
            </div>
            <div className="relative flex items-center justify-between gap-3 px-2">
              <BrandLockup dark to="/" />
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setDrawerOpen(false)}
                aria-label="Close navigation"
                className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-white/70 transition hover:bg-white/10 hover:text-white focus-visible:ring-4 focus-visible:ring-brand-500/30"
              >
                <IconClose size={17} />
              </button>
            </div>

            <div className="relative mt-8 flex-1 overflow-y-auto scrollbar-slim">
              <p className="px-3 text-[9px] font-bold uppercase tracking-[0.22em] text-white/30">
                {isAdmin ? "Admin workspace" : "Your workspace"}
              </p>
              <nav aria-label="Main navigation" className="mt-3 space-y-1">
                {items.map((item) => (
                  <SidebarNavItem key={item.to} item={item} />
                ))}
              </nav>
              <div className="mt-6">
                <ConnectionDot dark />
              </div>
            </div>

            <UserPanel user={user} onLogout={handleLogout} />
          </aside>
        </div>
      )}

      {/* content */}
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1440px] px-4 pb-16 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-9"
      >
        <div className="page-enter">{children}</div>
      </main>
    </div>
  );
}

function SidebarNavItem({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
          isActive
            ? "bg-white/[0.09] text-white shadow-[inset_0_1px_0_rgb(255_255_255_/_0.06)] ring-1 ring-inset ring-white/10"
            : "text-white/50 hover:bg-white/[0.055] hover:text-white"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            aria-hidden="true"
            className={`absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-gradient-to-b from-brand-300 to-jade-300 transition-opacity ${
              isActive ? "opacity-100" : "opacity-0"
            }`}
          />
          <span className={isActive ? "text-brand-200" : "text-white/40 group-hover:text-white/70"}>
            {item.icon}
          </span>
          <span className="truncate">{item.label}</span>
          {isActive && (
            <span aria-hidden="true" className="ml-auto h-1.5 w-1.5 rounded-full bg-jade-300" />
          )}
        </>
      )}
    </NavLink>
  );
}

function UserPanel({
  user,
  onLogout,
}: {
  user: AuthUser;
  onLogout: () => Promise<void>;
}) {
  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.055] p-2.5">
      <div className="flex items-center gap-3 px-1.5 py-1">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-300 to-brand-600 text-[11px] font-bold text-white shadow-glow">
          {initials(user.name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{user.name}</span>
          <span className="block text-[10px] uppercase tracking-[0.14em] text-white/40">
            {user.role.toLowerCase()}
          </span>
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label="Log out"
          title="Log out"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/45 transition hover:bg-white/10 hover:text-white focus-visible:ring-4 focus-visible:ring-brand-500/30"
        >
          <IconLogout size={16} />
        </button>
      </div>
    </div>
  );
}

