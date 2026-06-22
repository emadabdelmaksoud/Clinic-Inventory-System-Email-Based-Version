import { useQuery } from "@tanstack/react-query";
import { listAuditLogs } from "@/lib/audit";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList } from "lucide-react";
import { format } from "date-fns";

const actionColors: Record<string, string> = {
  create: "bg-green-100 text-green-700",
  update: "bg-blue-100 text-blue-700",
  delete: "bg-red-100 text-red-700",
  transaction: "bg-purple-100 text-purple-700",
};

export default function AuditLogsPage() {
  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const raw = await listAuditLogs(500);
      const users = await db.users.toArray();
      const um = new Map(users.map(u => [u.id, u]));
      return raw.map(l => ({ ...l, userName: l.userId ? (um.get(l.userId)?.fullName ?? l.userId) : "System" }));
    },
  });

  return (
    <div className="space-y-4 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ClipboardList className="w-6 h-6" /> Audit Logs</h1>
        <p className="text-sm text-muted-foreground">{logs.length} entries</p>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No audit logs</CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Action</th>
              <th className="text-left px-4 py-3 font-medium">Table</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Record ID</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">User</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr></thead>
            <tbody className="divide-y">
              {logs.map(l => (
                <tr key={l.id} className="hover:bg-muted/30" data-testid={`audit-row-${l.id}`}>
                  <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${actionColors[l.action] ?? "bg-gray-100 text-gray-700"}`}>{l.action}</span></td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{l.tableName}</td>
                  <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-muted-foreground">{l.recordId.slice(0, 8)}…</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{(l as { userName?: string }).userName}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{format(new Date(l.createdAt), "MMM d, HH:mm:ss")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
