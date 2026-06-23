import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { classifyExpiry, daysUntil } from "@/lib/fifo";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BellRing, Download, Printer, AlertTriangle, Clock, CheckCircle2, Filter, Settings2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

type StatusFilter = "all" | "expired" | "near" | "ok";

interface ExpiryRow {
  batchId: string;
  batchNumber: string | null;
  expiryDate: string;
  quantity: number;
  productId: string;
  productName: string;
  productCode: string;
  baseUnit: string;
  warehouseId: string;
  warehouseName: string;
  sectionName: string | null;
  status: "expired" | "near" | "ok";
  daysLeft: number | null;
}

async function getSetting(key: string): Promise<string | null> {
  const row = await db.settings.get(key);
  return row?.value ?? null;
}

export default function ExpiryAlertsPage() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [editDays, setEditDays] = useState<string | null>(null);

  const { data: nearDays = 90 } = useQuery({
    queryKey: ["settings", "nearExpiryDays"],
    queryFn: async () => Number((await getSetting("nearExpiryDays")) ?? "90"),
  });

  const { mutate: saveDays, isPending: savingDays } = useMutation({
    mutationFn: async (days: number) => {
      await db.settings.put({ key: "nearExpiryDays", value: String(days) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings"] });
      qc.invalidateQueries({ queryKey: ["alerts_near"] });
      qc.invalidateQueries({ queryKey: ["expiry_rows"] });
      setEditDays(null);
      toast.success("Warning threshold updated");
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["expiry_rows", nearDays],
    queryFn: async () => {
      const [batches, products, warehouses, sections] = await Promise.all([
        db.inventoryBatches.filter(b => b.quantityBaseUnit > 0 && !!b.expiryDate).toArray(),
        db.products.toArray(),
        db.warehouses.toArray(),
        db.warehouseSections.toArray(),
      ]);
      const pm = new Map(products.map(p => [p.id, p]));
      const wm = new Map(warehouses.map(w => [w.id, w]));
      const sm = new Map(sections.map(s => [s.id, s]));

      return batches
        .map(b => {
          const product = pm.get(b.productId);
          if (!product || !b.expiryDate) return null;
          const status = classifyExpiry(b.expiryDate, nearDays);
          if (status === "no-expiry") return null;
          return {
            batchId: b.id,
            batchNumber: b.batchNumber,
            expiryDate: b.expiryDate,
            quantity: b.quantityBaseUnit,
            productId: b.productId,
            productName: product.productName,
            productCode: product.productCode,
            baseUnit: product.baseUnit,
            warehouseId: b.warehouseId,
            warehouseName: wm.get(b.warehouseId)?.warehouseName ?? "Unknown",
            sectionName: b.sectionId ? (sm.get(b.sectionId)?.sectionName ?? null) : null,
            status: status as "expired" | "near" | "ok",
            daysLeft: daysUntil(b.expiryDate),
          } satisfies ExpiryRow;
        })
        .filter(Boolean) as ExpiryRow[];
    },
  });

  const filtered = useMemo(() => {
    let result = rows;
    if (statusFilter !== "all") result = result.filter(r => r.status === statusFilter);
    if (search.trim()) {
      const s = search.toLowerCase();
      result = result.filter(r =>
        r.productName.toLowerCase().includes(s) ||
        r.productCode.toLowerCase().includes(s) ||
        (r.batchNumber ?? "").toLowerCase().includes(s) ||
        r.warehouseName.toLowerCase().includes(s)
      );
    }
    return [...result].sort((a, b) => {
      const order = { expired: 0, near: 1, ok: 2 };
      if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
      return a.expiryDate.localeCompare(b.expiryDate);
    });
  }, [rows, statusFilter, search]);

  const counts = useMemo(() => ({
    expired: rows.filter(r => r.status === "expired").length,
    near: rows.filter(r => r.status === "near").length,
    ok: rows.filter(r => r.status === "ok").length,
  }), [rows]);

  function exportExcel() {
    const wsData = [
      ["AUC Clinic Inventory — Expiry Alerts Report"],
      [`Date: ${new Date().toLocaleDateString()}`, `Warning threshold: ${nearDays} days`],
      [],
      ["Product", "Code", "Batch No.", "Expiry Date", "Days Left", "Qty", "Unit", "Warehouse", "Section", "Status"],
      ...filtered.map(r => [
        r.productName,
        r.productCode,
        r.batchNumber ?? "",
        r.expiryDate,
        r.daysLeft !== null ? r.daysLeft : "",
        r.quantity,
        r.baseUnit,
        r.warehouseName,
        r.sectionName ?? "",
        r.status === "expired" ? "EXPIRED" : r.status === "near" ? `EXPIRING SOON (${nearDays}d)` : "OK",
      ]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 8 }, { wch: 20 }, { wch: 16 }, { wch: 18 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Expiry Alerts");
    XLSX.writeFile(wb, `expiry_alerts_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exported");
  }

  function printReport() {
    const rows_html = filtered.map((r, i) => {
      const color = r.status === "expired" ? "#fef2f2" : r.status === "near" ? "#fff7ed" : "";
      const statusText = r.status === "expired" ? "EXPIRED" : r.status === "near" ? `${r.daysLeft}d left` : "OK";
      const statusColor = r.status === "expired" ? "#dc2626" : r.status === "near" ? "#ea580c" : "#16a34a";
      return `<tr style="${color ? `background:${color}` : ""}">
        <td>${i + 1}</td>
        <td><strong>${r.productName}</strong><br><small>${r.productCode}</small></td>
        <td>${r.batchNumber ?? "—"}</td>
        <td><strong>${r.expiryDate}</strong></td>
        <td style="text-align:right">${r.quantity}</td>
        <td>${r.baseUnit}</td>
        <td>${r.warehouseName}${r.sectionName ? ` / ${r.sectionName}` : ""}</td>
        <td style="color:${statusColor};font-weight:600;text-align:center">${statusText}</td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Expiry Report</title>
<style>body{font-family:Arial;font-size:12px;margin:20px}h2{color:#0c4a6e;margin:0 0 4px}
.meta{font-size:11px;color:#555;margin-bottom:16px}
table{width:100%;border-collapse:collapse}
th{background:#0c4a6e;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
td{padding:5px 8px;border-bottom:1px solid #e5e7eb;vertical-align:top}
@media print{@page{size:A4 landscape;margin:15mm}}</style></head><body>
<h2>AUC Clinic Inventory — Expiry Alerts</h2>
<div class="meta">Date: ${new Date().toLocaleDateString()} | Warning threshold: ${nearDays} days | Total: ${filtered.length} batches (${counts.expired} expired, ${counts.near} near-expiry)</div>
<table><thead><tr><th>#</th><th>Product</th><th>Batch No.</th><th>Expiry Date</th><th style="text-align:right">Qty</th><th>Unit</th><th>Location</th><th style="text-align:center">Status</th></tr></thead>
<tbody>${rows_html}</tbody></table>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="w-6 h-6 text-primary" /> Expiry Alerts
          </h1>
          <p className="text-sm text-muted-foreground">Track batches by expiry date</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} className="gap-2">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printReport} className="gap-2">
            <Printer className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Expired</p>
              <p className="text-2xl font-semibold text-destructive">{counts.expired}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-300/40 bg-orange-50/50 dark:bg-orange-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <Clock className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Expiring within {nearDays} days</p>
              <p className="text-2xl font-semibold text-orange-600 dark:text-orange-400">{counts.near}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-300/40 bg-green-50/50 dark:bg-green-950/20">
          <CardContent className="p-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">OK (has expiry date)</p>
              <p className="text-2xl font-semibold text-green-600 dark:text-green-400">{counts.ok}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-dashed">
        <CardContent className="p-3 flex items-center gap-3 flex-wrap">
          <Settings2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Label className="text-sm text-muted-foreground">Warning threshold:</Label>
          {editDays !== null ? (
            <>
              <Input
                type="number"
                min={1}
                max={365}
                className="h-7 w-20 text-sm"
                value={editDays}
                onChange={e => setEditDays(e.target.value)}
                autoFocus
              />
              <span className="text-sm text-muted-foreground">days before expiry</span>
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                disabled={savingDays}
                onClick={() => saveDays(Math.max(1, Number(editDays) || 90))}
              >
                Save
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setEditDays(null)}>Cancel</Button>
            </>
          ) : (
            <>
              <span className="text-sm font-medium">{nearDays} days before expiry</span>
              <Button size="sm" variant="outline" className="h-7 text-xs px-3" onClick={() => setEditDays(String(nearDays))}>
                Change
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Filter className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search product, batch, warehouse…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses ({rows.length})</SelectItem>
            <SelectItem value="expired">Expired ({counts.expired})</SelectItem>
            <SelectItem value="near">Near Expiry ({counts.near})</SelectItem>
            <SelectItem value="ok">OK ({counts.ok})</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            {rows.length === 0
              ? <p className="text-muted-foreground">No batches with expiry dates recorded yet.</p>
              : <p className="text-muted-foreground">No items match the current filter.</p>
            }
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 font-medium">Product</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Batch No.</th>
                <th className="text-left px-4 py-3 font-medium">Expiry Date</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Days Left</th>
                <th className="text-right px-4 py-3 font-medium">Qty</th>
                <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Location</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r, i) => (
                <tr
                  key={r.batchId}
                  className={`transition-colors ${r.status === "expired" ? "bg-red-50/60 dark:bg-red-950/20" : r.status === "near" ? "bg-orange-50/40 dark:bg-orange-950/10" : "hover:bg-muted/30"}`}
                >
                  <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.productName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.productCode}</div>
                  </td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground font-mono text-xs">{r.batchNumber ?? "—"}</td>
                  <td className="px-4 py-3 font-medium tabular-nums">{r.expiryDate}</td>
                  <td className="px-4 py-3 hidden md:table-cell tabular-nums">
                    {r.daysLeft === null ? "—" : r.daysLeft < 0
                      ? <span className="text-destructive font-semibold">{Math.abs(r.daysLeft)}d ago</span>
                      : r.daysLeft === 0
                        ? <span className="text-destructive font-semibold">Today!</span>
                        : <span className={r.status === "near" ? "text-orange-600 dark:text-orange-400 font-medium" : "text-muted-foreground"}>{r.daysLeft}d</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">{r.quantity.toLocaleString()} <span className="text-xs text-muted-foreground">{r.baseUnit}</span></td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {r.warehouseName}{r.sectionName ? ` / ${r.sectionName}` : ""}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.status === "expired" ? (
                      <Badge variant="destructive" className="text-xs">Expired</Badge>
                    ) : r.status === "near" ? (
                      <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0">Near Expiry</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-muted/30 flex justify-between text-xs text-muted-foreground">
            <span>Showing {filtered.length} of {rows.length} batches</span>
            <span>{counts.expired} expired · {counts.near} near-expiry</span>
          </div>
        </div>
      )}
    </div>
  );
}
