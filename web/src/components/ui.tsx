import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconInfo,
  IconSparkles,
} from "./icons";

/* -------------------------------- layout -------------------------------- */

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-2xl border border-line bg-white p-5 shadow-card sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-600">
            <span className="h-1 w-6 rounded-full bg-gradient-to-r from-brand-500 to-jade-400" aria-hidden="true" />
            {eyebrow}
          </p>
        )}
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink-950 sm:text-[2rem] sm:leading-[1.15]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-500">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionHeading({
  title,
  description,
  action,
  count,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  count?: number;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <h2 className="font-display text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
          {count !== undefined && (
            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
              {count}
            </span>
          )}
        </div>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- form --------------------------------- */

export const fieldClass =
  "w-full rounded-xl border border-line bg-white px-3.5 py-2.5 text-sm text-ink-900 shadow-[inset_0_1px_1px_rgb(20_16_50_/_0.02)] outline-none transition duration-200 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400";

export function LabelledInput(
  props: InputHTMLAttributes<HTMLInputElement> & {
    label: string;
    error?: string;
    hint?: string;
    trailing?: ReactNode;
  }
) {
  const { label, error, hint, trailing, id, className = "", ...rest } = props;
  const autoId = useId();
  const inputId = id ?? autoId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink-700">{label}</span>
        {hint && (
          <span id={hintId} className="text-[11px] font-normal text-ink-400">
            {hint}
          </span>
        )}
      </span>
      <span className="relative block">
        <input
          id={inputId}
          {...rest}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`${fieldClass} ${trailing ? "pr-11" : ""} ${
            error ? "border-coral-400 focus:border-coral-500 focus:ring-coral-500/15" : ""
          } ${className}`}
        />
        {trailing && (
          <span className="absolute inset-y-0 right-1.5 flex items-center">{trailing}</span>
        )}
      </span>
      {error && (
        <span id={errorId} role="alert" className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-coral-600">
          <IconAlert size={13} />
          {error}
        </span>
      )}
    </label>
  );
}

export function LabelledSelect(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label: string }
) {
  const { label, id, children, className = "", ...rest } = props;
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <label className="block" htmlFor={selectId}>
      {label && <span className="mb-1.5 block text-[13px] font-semibold text-ink-700">{label}</span>}
      <span className="relative block">
        <select
          id={selectId}
          {...rest}
          className={`${fieldClass} appearance-none pr-9 ${className}`}
        >
          {children}
        </select>
        <IconChevronDown
          size={16}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-400"
        />
      </span>
    </label>
  );
}

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "danger"
  | "dangerGhost"
  | "ghost"
  | "success"
  | "soft";

const BUTTON_BASE =
  "inline-flex select-none items-center justify-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold leading-none outline-none transition-all duration-200 focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-50";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary:
    "bg-gradient-to-b from-brand-500 to-brand-600 text-white shadow-glow hover:from-brand-500 hover:to-brand-700 hover:shadow-[0_20px_44px_-16px_rgb(108_92_231_/_0.7)] active:translate-y-px focus-visible:ring-brand-500/25",
  success:
    "bg-gradient-to-b from-jade-500 to-jade-600 text-white shadow-glow-mint hover:from-jade-500 hover:to-jade-700 active:translate-y-px focus-visible:ring-jade-500/25",
  secondary:
    "border border-line bg-white text-ink-700 shadow-[0_1px_2px_rgb(20_16_50_/_0.04)] hover:border-brand-200 hover:bg-brand-50/60 hover:text-ink-900 active:translate-y-px focus-visible:ring-brand-500/20",
  ghost:
    "text-ink-600 hover:bg-ink-900/[0.055] hover:text-ink-900 active:translate-y-px focus-visible:ring-brand-500/20",
  dangerGhost:
    "text-coral-600 hover:bg-coral-50 hover:text-coral-700 active:translate-y-px focus-visible:ring-coral-500/20",
  danger:
    "bg-gradient-to-b from-coral-500 to-coral-600 text-white shadow-[0_18px_40px_-18px_rgb(244_63_85_/_0.55)] hover:from-coral-500 hover:to-coral-700 active:translate-y-px focus-visible:ring-coral-500/25",
  soft:
    "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100 hover:bg-brand-100/80 active:translate-y-px focus-visible:ring-brand-500/20",
};

/** Shared button styling for router links that need to look like a button. */
export function buttonClass(variant: ButtonVariant = "primary", className = "") {
  return `${BUTTON_BASE} ${BUTTON_STYLES[variant]} ${className}`;
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
}) {
  return (
    <button {...rest} className={buttonClass(variant, className)}>
      {children}
    </button>
  );
}

export function CheckRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="group flex cursor-pointer items-start gap-2.5 text-sm text-ink-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border border-ink-300 bg-white text-transparent shadow-[0_1px_2px_rgb(20_16_50_/_0.04)] transition-all duration-150 peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20"
      >
        <IconCheck size={12} strokeWidth={3} />
      </span>
      <span className="leading-snug">{label}</span>
    </label>
  );
}

export function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-line bg-white px-4 py-3.5 transition-colors hover:border-ink-200">
      <span>
        <span className="block text-sm font-medium text-ink-800">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-relaxed text-ink-500">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-label={label}
          className="peer sr-only"
        />
        <span className="absolute inset-0 rounded-full bg-ink-200 transition-colors duration-200 peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-500/20" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

/* ------------------------------- indicators ------------------------------ */

export type Status =
  | "OPEN"
  | "PAUSED"
  | "CLOSED"
  | "PENDING"
  | "ACTIVE"
  | "DRAFT"
  | "ARCHIVED"
  | "not_published";

const STATUS_STYLES: Record<string, { chip: string; dot: string; pulse?: boolean }> = {
  OPEN: { chip: "bg-jade-50 text-jade-700 ring-jade-200", dot: "bg-jade-500", pulse: true },
  ACTIVE: { chip: "bg-jade-50 text-jade-700 ring-jade-200", dot: "bg-jade-500", pulse: true },
  PENDING: { chip: "bg-ocean-50 text-ocean-700 ring-ocean-200", dot: "bg-ocean-500" },
  PAUSED: { chip: "bg-gold-50 text-gold-700 ring-gold-200", dot: "bg-gold-500" },
  DRAFT: { chip: "bg-ink-100 text-ink-600 ring-ink-200", dot: "bg-ink-400" },
  CLOSED: { chip: "bg-coral-50 text-coral-700 ring-coral-200", dot: "bg-coral-500" },
  ARCHIVED: { chip: "bg-ink-100 text-ink-600 ring-ink-200", dot: "bg-ink-400" },
  not_published: { chip: "bg-ink-100 text-ink-600 ring-ink-200", dot: "bg-ink-400" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = status ?? "DRAFT";
  const s = STATUS_STYLES[key] ?? STATUS_STYLES.DRAFT;
  const label = key.replace(/_/g, " ");
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ring-1 ring-inset ${s.chip}`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${s.dot} ${s.pulse ? "animate-pulse-soft" : ""}`}
      />
      {label}
    </span>
  );
}

export function ProgressBar({
  value,
  className = "",
  tone = "brand",
}: {
  value: number;
  className?: string;
  tone?: "brand" | "jade";
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={`h-2 w-full overflow-hidden rounded-full bg-ink-100 ${className}`}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-700 ease-out ${
          tone === "jade"
            ? "bg-gradient-to-r from-jade-500 to-jade-300"
            : "bg-gradient-to-r from-brand-500 to-brand-300"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const TONE_STYLES = {
  brand: "bg-brand-50 text-brand-600 ring-brand-100",
  jade: "bg-jade-50 text-jade-600 ring-jade-100",
  gold: "bg-gold-50 text-gold-600 ring-gold-100",
  ocean: "bg-ocean-50 text-ocean-600 ring-ocean-100",
  coral: "bg-coral-50 text-coral-600 ring-coral-100",
  ink: "bg-ink-100 text-ink-600 ring-ink-200",
} as const;

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "brand",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: keyof typeof TONE_STYLES;
}) {
  return (
    <Card className="group overflow-hidden p-5 transition-shadow duration-300 hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-ink-400">{label}</p>
          <div className="mt-2 font-display text-[2rem] font-semibold leading-none tracking-tight text-ink-950">
            {value}
          </div>
          {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
        </div>
        {icon && (
          <span
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ring-1 transition-transform duration-300 group-hover:scale-105 ${TONE_STYLES[tone]}`}
          >
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------- feedback ------------------------------- */

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-xl ${className}`} />;
}

export function EmptyState({
  title,
  hint,
  icon,
  action,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-50 text-brand-500 ring-1 ring-brand-100">
        {icon ?? <IconSparkles size={22} />}
      </span>
      <p className="mt-4 font-display text-[15px] font-semibold text-ink-800">{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-xl border border-coral-200 bg-coral-50 px-3.5 py-2.5 text-sm text-coral-800"
    >
      <IconAlert size={16} className="mt-0.5 shrink-0 text-coral-500" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-ocean-200 bg-ocean-50 px-3.5 py-2.5 text-sm text-ocean-900">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-ocean-500" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

/* -------------------------------- dialog -------------------------------- */

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  onConfirm,
  onCancel,
  danger = false,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);
  if (!open) return null;
  return (
    <dialog
      ref={ref}
      aria-labelledby="dlg-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onCancel();
      }}
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-3xl border border-line bg-white p-0 shadow-lift"
    >
      <div className="p-6 sm:p-7">
        <span
          className={`grid h-12 w-12 place-items-center rounded-2xl ring-1 ${
            danger
              ? "bg-coral-50 text-coral-600 ring-coral-100"
              : "bg-brand-50 text-brand-600 ring-brand-100"
          }`}
        >
          <IconAlert size={22} />
        </span>
        <h2 id="dlg-title" className="mt-4 font-display text-lg font-semibold text-ink-950">
          {title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-500">{body}</p>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}

/* -------------------------------- tables -------------------------------- */

export function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-card">
      <div className="overflow-x-auto scrollbar-slim">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-line bg-ink-50/80">
              {head.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  scope="col"
                  className="whitespace-nowrap px-4 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:transition-colors [&>tr:hover]:bg-brand-50/40">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
