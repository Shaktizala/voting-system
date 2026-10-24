import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../../lib/api";
import {
  Button,
  DataTable,
  EmptyState,
  fieldClass,
  PageTitle,
  SectionHeading,
  Skeleton,
} from "../../components/ui";
import { IconAudit, IconSearch, IconShield } from "../../components/icons";

export default function Audit() {
  const logsQ = useQuery({ queryKey: ["audit"], queryFn: () => api<{ logs: any[] }>("/audit") });
  const logs = logsQ.data?.logs ?? [];
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return logs;
    return logs.filter((log) =>
      [
        log.actor?.username ?? "",
        log.action,
        log.entityType ?? "",
        log.entityId ?? "",
        JSON.stringify(log.after ?? log.before ?? ""),
      ].some((value) => String(value).toLowerCase().includes(query))
    );
  }, [logs, search]);

  return (
    <>
      <PageTitle
        eyebrow="Security"
        title="Audit log"
        subtitle="Security-relevant actions, newest first. Every entry is immutable."
      />

      <div className="mb-5 flex items-start gap-2.5 rounded-2xl border border-jade-200 bg-jade-50/60 px-4 py-3">
        <IconShield size={17} className="mt-0.5 shrink-0 text-jade-600" />
        <p className="text-xs leading-relaxed text-ink-600">
          This trail captures logins, credential operations, room and category changes, round
          controls, vote submissions, publishes, and exports.
        </p>
      </div>

      <SectionHeading
        title="Recent activity"
        count={logs.length}
        description="Search by actor, action, entity, or details."
        action={
          <div className="relative w-full sm:w-72">
            <IconSearch size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search the audit log…"
              aria-label="Search audit log"
              className={`${fieldClass} py-2 pl-9`}
            />
          </div>
        }
      />

      {logsQ.isLoading ? (
        <Skeleton className="h-96 rounded-2xl" />
      ) : logsQ.isError ? (
        // never present a failed load as "nothing happened" — an empty audit trail is a claim
        <EmptyState
          title="Couldn't load the audit log"
          hint={logsQ.error instanceof ApiError ? `${logsQ.error.message}. The trail itself is unaffected.` : "The request failed. The trail itself is unaffected."}
          icon={<IconAudit size={22} />}
          action={<Button variant="secondary" onClick={() => logsQ.refetch()}>Try again</Button>}
        />
      ) : logs.length === 0 ? (
        <EmptyState title="Nothing logged yet" hint="Actions will appear here as the team works." icon={<IconAudit size={22} />} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          hint={`No audit entries match “${search}”.`}
          icon={<IconSearch size={22} />}
          action={<Button variant="secondary" onClick={() => setSearch("")}>Clear search</Button>}
        />
      ) : (
        <DataTable head={["Time", "Actor", "Action", "Entity", "Details"]}>
          {filtered.map((log) => (
            <tr key={log.id}>
              <td className="whitespace-nowrap px-4 py-3.5">
                <span className="block text-xs font-medium text-ink-700">
                  {new Date(log.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
                <span className="block text-[10px] text-ink-400">
                  {new Date(log.createdAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                </span>
              </td>
              <td className="px-4 py-3.5">
                <span className="inline-flex items-center gap-2">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-ink-100 text-[9px] font-bold uppercase text-ink-600">
                    {(log.actor?.username ?? "—").slice(0, 2)}
                  </span>
                  <span className="text-xs font-medium text-ink-700">{log.actor?.username ?? "—"}</span>
                </span>
              </td>
              <td className="px-4 py-3.5">
                <span className="rounded-md bg-brand-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-100">
                  {log.action}
                </span>
              </td>
              <td className="whitespace-nowrap px-4 py-3.5 text-xs text-ink-500">
                {log.entityType}
                {log.entityId && <span className="ml-1 font-mono text-[10px] text-ink-400">#{log.entityId.slice(0, 8)}</span>}
              </td>
              <td className="max-w-md px-4 py-3.5">
                <code
                  className="block truncate font-mono text-[10px] text-ink-500"
                  title={JSON.stringify(log.after ?? log.before ?? "")}
                >
                  {JSON.stringify(log.after ?? log.before ?? "")}
                </code>
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
