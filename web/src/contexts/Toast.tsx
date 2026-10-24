import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { IconAlert, IconCheck, IconClose, IconInfo } from "../components/icons";

type ToastKind = "success" | "error" | "info";
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

const Ctx = createContext<{
  toast: (message: string, kind?: ToastKind) => void;
} | null>(null);

let nextId = 1;

const KIND_STYLES: Record<ToastKind, { icon: ReactNode; iconWrap: string; bar: string }> = {
  success: {
    icon: <IconCheck size={15} strokeWidth={2.5} />,
    iconWrap: "bg-jade-400/15 text-jade-300 ring-jade-400/20",
    bar: "bg-jade-400",
  },
  error: {
    icon: <IconAlert size={15} />,
    iconWrap: "bg-coral-400/15 text-coral-300 ring-coral-400/20",
    bar: "bg-coral-400",
  },
  info: {
    icon: <IconInfo size={15} />,
    iconWrap: "bg-brand-400/15 text-brand-200 ring-brand-400/20",
    bar: "bg-brand-400",
  },
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = nextId++;
      setToasts((current) => [...current.slice(-4), { id, kind, message }]);
      setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[22rem]"
      >
        {toasts.map((item) => {
          const style = KIND_STYLES[item.kind];
          return (
            <div
              key={item.id}
              role="status"
              className="pointer-events-auto relative animate-toast-in overflow-hidden rounded-2xl border border-white/10 bg-ink-950/95 p-3.5 pr-10 text-sm text-white shadow-lift backdrop-blur-xl"
            >
              <div className="flex items-start gap-3">
                <span
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset ${style.iconWrap}`}
                  aria-hidden="true"
                >
                  {style.icon}
                </span>
                <p className="pt-1 leading-snug text-white/90">{item.message}</p>
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss notification"
                className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-lg text-white/40 transition hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/30"
              >
                <IconClose size={14} />
              </button>
              <span
                aria-hidden="true"
                className={`absolute inset-x-0 bottom-0 h-0.5 origin-left ${style.bar} toast-progress`}
              />
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast outside provider");
  return ctx.toast;
}
