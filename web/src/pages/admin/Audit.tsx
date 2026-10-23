import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { DataTable, PageTitle, Skeleton, EmptyState } from "../../components/ui";

export default function Audit() {
  const logsQ = useQuery({ queryKey: ["audit"], queryFn: () => api<{ logs: any[] }>("/audit") });
  const logs = logsQ.data?.logs ?? [];
  return (
    <>
      <PageTitle title="Audit log" subtitle="Security-relevant actions, newest first" />
      {logsQ.isLoading ? (
        <Skeleton className="h-96" />
      ) : logs.length === 0 ? (
        <EmptyState title="Nothing logged yet" />
      ) : (
        <DataTable head={["Time", "Actor", "Action", "Entity", "Details"]}>
          {logs.map((l) => (
            <tr key={l.id} className="border-t border-gray-100">
              <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
              <td className="px-3 py-2">{l.actor?.username ?? "—"}</td>
              <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
              <td className="px-3 py-2 text-xs">{l.entityType} {l.entityId?.slice(0, 8)}</td>
              <td className="max-w-md truncate px-3 py-2 text-xs text-gray-600">{JSON.stringify(l.after ?? l.before ?? "")}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </>
  );
}
