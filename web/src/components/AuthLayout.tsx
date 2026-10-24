import type { ReactNode } from "react";
import { BrandLockup } from "./Brand";
import { IconCheckCircle, IconSparkles } from "./icons";

const FEATURES = [
  "Live scoring that lands the instant voting closes",
  "Transparent rankings with an auditable trail",
  "Set up rooms, teams, and categories in minutes",
];

/**
 * Shared split-screen shell for sign-in and account screens.
 * The right column holds the form; the left is a branded, decorative panel.
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen p-3 sm:p-5 lg:p-6">
      <div className="mx-auto grid min-h-[calc(100vh-1.5rem)] max-w-[1440px] items-stretch gap-5 lg:min-h-[calc(100vh-3rem)] lg:grid-cols-[1.02fr_0.98fr]">
        {/* decorative brand panel */}
        <aside className="relative hidden flex-col overflow-hidden rounded-[2rem] bg-ink-950 p-10 text-white lg:flex xl:p-14">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0">
            <div className="absolute -right-28 -top-24 h-80 w-80 rounded-full bg-brand-600/35 blur-3xl" />
            <div className="absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-jade-500/20 blur-3xl" />
            <div className="absolute right-1/4 top-1/3 h-48 w-48 rounded-full bg-ocean-500/15 blur-3xl" />
            <div
              className="absolute inset-0 opacity-[0.06]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
                backgroundSize: "56px 56px",
              }}
            />
          </div>

          <div className="relative flex items-center justify-between gap-4">
            <BrandLockup dark />
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/55 backdrop-blur">
              Real-time
            </span>
          </div>

          <div className="relative mt-auto max-w-lg pb-2 pt-16">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur">
              <IconSparkles size={14} className="text-jade-300" />
              Built for fair, fast decisions
            </span>
            <h2 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.08] tracking-tight xl:text-5xl">
              Every team gets
              <br />
              <span className="text-gradient">their moment.</span>
            </h2>
            <p className="mt-5 max-w-md text-sm leading-relaxed text-white/55">
              Score live presentations, watch results land in real time, and close every
              round with a transparent record your whole team can trust.
            </p>

            <ul className="mt-8 space-y-3">
              {FEATURES.map((feature) => (
                <li key={feature} className="flex items-start gap-3 text-sm text-white/70">
                  <IconCheckCircle size={17} className="mt-0.5 shrink-0 text-jade-300" />
                  {feature}
                </li>
              ))}
            </ul>

            <div aria-hidden="true" className="mt-10 max-w-sm animate-fade-up">
              <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-4 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                    Presenting now
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-jade-400/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-jade-300 ring-1 ring-inset ring-jade-400/20">
                    <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-jade-400" />
                    Live
                  </span>
                </div>
                <p className="mt-1.5 font-display text-lg font-semibold">Team Aurora</p>
                <div className="mt-4 space-y-2.5">
                  {[
                    ["Innovation", 92],
                    ["Design", 86],
                    ["Impact", 94],
                  ].map(([label, value]) => (
                    <div key={label as string} className="flex items-center gap-3">
                      <span className="w-20 text-[11px] text-white/45">{label}</span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className="block h-full rounded-full bg-gradient-to-r from-brand-400 to-jade-300"
                          style={{ width: `${value}%` }}
                        />
                      </span>
                      <span className="w-7 text-right font-mono text-[11px] text-white/70">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* form column */}
        <main className="flex items-center justify-center px-1 py-8 sm:px-8 lg:px-10">
          <div className="w-full max-w-[26rem]">
            <div className="mb-10 flex items-center justify-between lg:hidden">
              <BrandLockup />
            </div>
            <div className="animate-fade-up">{children}</div>
            <p className="mt-8 text-center text-[11px] leading-relaxed text-ink-400">
              Protected by encrypted sessions and role-based access.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
