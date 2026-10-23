export function Spinner({ text = "Loading…" }: { text?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-gray-500" role="status" aria-live="polite">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-blue-700" aria-hidden="true" />
      {text}
    </div>
  );
}
