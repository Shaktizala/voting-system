import { Link } from "react-router-dom";

/**
 * TeamVote's mark: a ballot tick in a flat violet square. The brand hue lives
 * here and on data, nowhere else in the chrome.
 */
export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = { sm: 24, md: 28, lg: 40 }[size];
  return (
    <svg width={px} height={px} viewBox="0 0 32 32" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--color-brand-500)" />
      <path d="M9 16.5l4.2 4.2L23 10.8" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function BrandLockup({ to = "/", compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <BrandMark size={compact ? "sm" : "md"} />
      <span className={compact ? "sr-only" : "text-[15px] font-semibold text-ink-950"}>TeamVote</span>
    </Link>
  );
}
