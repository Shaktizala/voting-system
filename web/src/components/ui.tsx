import {
  useEffect,
  useId,
  useRef,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";
import { IconAlert, IconCheck, IconChevronDown, IconInfo } from "./icons";

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
      className={`relative rounded-[10px] border border-line bg-white p-5 ${className}`}
    >
      {children}
    </div>
  );
}

/** Title row: a 22px noun, an optional grey line about the data, real actions on the right. */
export function PageTitle({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold leading-tight text-ink-950">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-500">{subtitle}</p>}
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
    <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-baseline gap-2">
          <h2 className="text-base font-semibold text-ink-950">{title}</h2>
          {count !== undefined && <span className="num text-sm text-ink-500">{count}</span>}
        </div>
        {description && <p className="mt-1 text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- form --------------------------------- */

export const fieldClass =
  "h-10 w-full rounded-lg border border-control bg-white px-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-ink-400 hover:border-ink-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-500";

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
        <span className="text-sm font-medium text-ink-800">{label}</span>
        {hint && (
          <span id={hintId} className="text-xs font-normal text-ink-500">
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
      {label && <span className="mb-1.5 block text-sm font-medium text-ink-800">{label}</span>}
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

/* One control height (36px), one radius (8px). One filled primary per screen, near-black. */
const BUTTON_BASE =
  "inline-flex h-9 select-none items-center justify-center gap-1.5 rounded-lg px-3.5 text-sm font-medium leading-none outline-none transition-[background-color,border-color,color,transform] duration-150 active:translate-y-px focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-55";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-ink-950 text-white hover:bg-ink-700",
  success: "bg-ink-950 text-white hover:bg-ink-700",
  secondary: "border border-control bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50",
  ghost: "text-ink-700 hover:bg-ink-100 hover:text-ink-950",
  dangerGhost: "text-coral-700 hover:bg-coral-50 hover:text-coral-800",
  // destructive actions are outlined in the negative colour, never a red slab
  danger: "border border-coral-300 bg-white text-coral-700 hover:border-coral-500 hover:bg-coral-50",
  soft: "bg-ink-100 text-ink-800 hover:bg-ink-200",
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
        className="mt-0.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[4px] border-2 border-ink-400 bg-white text-transparent transition-colors duration-150 peer-checked:border-ink-950 peer-checked:bg-ink-950 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" /* taste-skill-ignore: hides the unchecked tick, not gradient text */
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
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-[10px] border border-line bg-white px-4 py-3.5 transition-colors hover:border-ink-300">
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
        <span className="absolute inset-0 rounded-full bg-ink-300 transition-colors duration-200 peer-checked:bg-ink-950 peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500" />
        <span className="pointer-events-none absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5" />
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

/* pale tint with dark ink of the same hue; neutral states are grey */
const STATUS_STYLES: Record<string, { chip: string; dot: string; label: string }> = {
  OPEN: { chip: "bg-[#dcfae5] text-[#04250e]", dot: "bg-jade-600", label: "Voting open" },
  ACTIVE: { chip: "bg-[#dcfae5] text-[#04250e]", dot: "bg-jade-600", label: "Active" },
  PENDING: { chip: "bg-ink-100 text-ink-800", dot: "bg-ink-500", label: "Up next" },
  PAUSED: { chip: "bg-[#fffbeb] text-[#92400e]", dot: "bg-gold-500", label: "Paused" },
  DRAFT: { chip: "bg-ink-100 text-ink-800", dot: "bg-ink-400", label: "Draft" },
  CLOSED: { chip: "bg-ink-100 text-ink-800", dot: "bg-ink-500", label: "Closed" },
  ARCHIVED: { chip: "bg-ink-100 text-ink-700", dot: "bg-ink-400", label: "Archived" },
  not_published: { chip: "bg-ink-100 text-ink-800", dot: "bg-ink-400", label: "Not published" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const key = status ?? "DRAFT";
  // unknown states keep the neutral style but say what they are
  const s = STATUS_STYLES[key] ?? { ...STATUS_STYLES.DRAFT, label: key.charAt(0) + key.slice(1).toLowerCase().replace(/_/g, " ") };
  return (
    <span className={`inline-flex h-6 flex-none items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ${s.chip}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
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
        className={`h-full rounded-full transition-[width] duration-500 ease-out ${tone === "jade" ? "bg-jade-600" : "bg-brand-500"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** A figure as type: grey label over a regular-weight value, an optional caption naming its baseline. */
export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-0 px-5 py-4">
      <p className="text-sm text-ink-500">{label}</p>
      <div className="num mt-1 text-[28px] font-normal leading-none text-ink-950">{value}</div>
      {hint && <p className="mt-2 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}

/** KPIs grouped in one container split by 1px dividers, never one tile each. */
export function StatStrip({ children, columns }: { children: ReactNode; columns: 2 | 3 | 4 }) {
  const cols = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[columns];
  return (
    <div className={`grid grid-cols-2 divide-line overflow-hidden rounded-[10px] border border-line bg-white max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(n+3)]:border-t sm:divide-x ${cols}`}>
      {children}
    </div>
  );
}

/* ------------------------------- feedback ------------------------------- */

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton rounded-lg ${className}`} />;
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
    <div className="flex flex-col items-center justify-center rounded-[10px] border border-dashed border-ink-300 px-6 py-10 text-center">
      {icon && <span className="text-ink-400">{icon}</span>}
      <p className={`${icon ? "mt-3" : ""} text-[15px] font-medium text-ink-900`}>{title}</p>
      {hint && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-500">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-[#ffedea] px-3.5 py-2.5 text-sm text-[#831c1e]"
    >
      <IconAlert size={16} className="mt-0.5 shrink-0 text-coral-700" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

export function InfoBox({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-ink-50 px-3.5 py-2.5 text-sm text-ink-800">
      <IconInfo size={16} className="mt-0.5 shrink-0 text-ink-500" />
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
      className="m-auto w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-white p-0 shadow-lift"
    >
      <div className="p-6">
        <h2 id="dlg-title" className="text-lg font-semibold text-ink-950">
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

/** `numeric` lists the columns whose header (and cells) are right-aligned figures. */
export function DataTable({ head, numeric = [], children }: { head: string[]; numeric?: number[]; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-line bg-white">
      <div className="overflow-x-auto scrollbar-slim">
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead>
            <tr className="border-b border-line">
              {head.map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  scope="col"
                  className={`h-10 whitespace-nowrap px-4 text-xs font-normal text-ink-500 ${numeric.includes(i) ? "text-right" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-rule [&>tr:last-child]:border-0">{children}</tbody>
        </table>
      </div>
    </div>
  );
}
