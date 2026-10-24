import { Link } from "react-router-dom";
import { IconVote } from "./icons";

export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const dims = {
    sm: "h-8 w-8 rounded-lg",
    md: "h-10 w-10 rounded-xl",
    lg: "h-12 w-12 rounded-2xl",
  }[size];
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden bg-gradient-to-br from-brand-400 via-brand-500 to-brand-700 text-white shadow-glow ${dims}`}
      aria-hidden="true"
    >
      <span className="absolute -right-2 -top-2 h-6 w-6 rounded-full bg-white/25 blur-[6px]" />
      <IconVote size={size === "lg" ? 24 : size === "md" ? 20 : 16} strokeWidth={2} />
    </span>
  );
}

export function BrandLockup({
  to = "/",
  compact = false,
  dark = false,
}: {
  to?: string;
  compact?: boolean;
  dark?: boolean;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
    >
      <BrandMark size={compact ? "sm" : "md"} />
      {compact ? (
        <span className="sr-only">TeamVote</span>
      ) : (
        <span className="flex flex-col">
          <span
            className={`font-display text-[17px] font-semibold tracking-tight ${
              dark ? "text-white" : "text-ink-950"
            }`}
          >
            TeamVote
          </span>
          <span
            className={`text-[9px] font-semibold uppercase tracking-[0.22em] ${
              dark ? "text-white/35" : "text-ink-400"
            }`}
          >
            Live evaluation
          </span>
        </span>
      )}
    </Link>
  );
}
