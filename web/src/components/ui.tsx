import { useEffect, useRef, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes } from "react";

/* -------------------------------- layout -------------------------------- */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>{children}</div>;
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex gap-2">{actions}</div>
    </div>
  );
}

/* --------------------------------- form --------------------------------- */

export function LabelledInput(
  props: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }
) {
  const { label, error, id, ...rest } = props;
  const autoId = useRef(`f${Math.random().toString(36).slice(2)}`);
  const inputId = id ?? autoId.current;
  return (
    <label className="block" htmlFor={inputId}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <input
        id={inputId}
        {...rest}
        aria-invalid={!!error}
        className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 ${
          error ? "border-red-500" : "border-gray-300"
        }`}
      />
      {error && <span role="alert" className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function LabelledSelect(
  props: SelectHTMLAttributes<HTMLSelectElement> & { label: string }
) {
  const { label, id, children, ...rest } = props;
  const autoId = useRef(`s${Math.random().toString(36).slice(2)}`);
  return (
    <label className="block" htmlFor={id ?? autoId.current}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <select
        id={id ?? autoId.current}
        {...rest}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
      >
        {children}
      </select>
    </label>
  );
}

export function Button({
  children,
  variant = "primary",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger" | "ghost" }) {
  const base = "inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50";
  const styles = {
    primary: "bg-blue-700 text-white hover:bg-blue-800",
    secondary: "border border-gray-300 bg-white text-gray-800 hover:bg-gray-100",
    danger: "bg-red-700 text-white hover:bg-red-800",
    ghost: "text-gray-700 hover:bg-gray-100",
  }[variant];
  return (
    <button {...rest} className={`${base} ${styles} ${className}`}>
      {children}
    </button>
  );
}

export function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
      {label}
    </label>
  );
}

/* ------------------------------- indicators ------------------------------ */

export type Status = "OPEN" | "PAUSED" | "CLOSED" | "PENDING" | "ACTIVE" | "DRAFT" | "ARCHIVED" | "not_published";

const STATUS_STYLES: Record<string, { bg: string; icon: string }> = {
  OPEN: { bg: "bg-green-100 text-green-900 border-green-300", icon: "●" },
  ACTIVE: { bg: "bg-green-100 text-green-900 border-green-300", icon: "●" },
  PENDING: { bg: "bg-blue-100 text-blue-900 border-blue-300", icon: "◐" },
  PAUSED: { bg: "bg-amber-100 text-amber-900 border-amber-400", icon: "◐" },
  DRAFT: { bg: "bg-gray-100 text-gray-800 border-gray-300", icon: "○" },
  CLOSED: { bg: "bg-red-100 text-red-900 border-red-300", icon: "■" },
  ARCHIVED: { bg: "bg-gray-200 text-gray-700 border-gray-300", icon: "▣" },
  not_published: { bg: "bg-gray-100 text-gray-700 border-gray-300", icon: "—" },
};

export function StatusBadge({ status }: { status: string | null | undefined }) {
  const s = STATUS_STYLES[status ?? "DRAFT"] ?? STATUS_STYLES.DRAFT;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${s.bg}`}>
      <span aria-hidden="true">{s.icon}</span>
      {status?.replace("_", " ") ?? "UNKNOWN"}
    </span>
  );
}

/* ------------------------------- feedback ------------------------------- */

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-gray-200 ${className}`} />;
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
      <p className="font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-gray-500">{hint}</p>}
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
      {children}
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
    <dialog ref={ref} className="rounded-xl p-0 backdrop:bg-black/40" aria-labelledby="dlg-title">
      <div className="w-80 p-5">
        <h2 id="dlg-title" className="font-bold">{title}</h2>
        <p className="mt-2 text-sm text-gray-600">{body}</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </dialog>
  );
}

/* -------------------------------- tables -------------------------------- */

export function DataTable({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
