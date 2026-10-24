import { BrandMark } from "./Brand";

export function Spinner({
  text = "Loading…",
  compact = false,
}: {
  text?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-col items-center justify-center gap-4 py-6"
          : "flex min-h-screen flex-col items-center justify-center gap-5"
      }
      role="status"
      aria-live="polite"
    >
      <div className="relative grid h-14 w-14 place-items-center">
        <span aria-hidden="true" className="absolute inset-0 rounded-2xl bg-brand-500/10 blur-md" />
        <svg
          aria-hidden="true"
          viewBox="0 0 56 56"
          className="absolute inset-0 h-full w-full animate-spin text-brand-500"
          style={{ animationDuration: "1.5s" }}
        >
          <circle cx="28" cy="28" r="25" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="2" />
          <circle
            cx="28"
            cy="28"
            r="25"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="44 113"
          />
        </svg>
        <BrandMark size="sm" />
      </div>
      <p className="text-sm font-medium text-ink-500">{text}</p>
    </div>
  );
}
