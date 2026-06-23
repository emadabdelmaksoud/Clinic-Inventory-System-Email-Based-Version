import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { TRANSACTION_LABELS } from "@/lib/inventory";
import type { TransactionType } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Printer, Users, Search, X, Activity, Package, TrendingDown, ArrowUpDown } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import * as XLSX from "xlsx";

const TXN_TYPES: TransactionType[] = [
  "stock_in", "dispensing", "transfer_in", "transfer_out", "disposal", "adjustment", "inventory_count",
];

const txnTypeColor: Record<string, string> = {
  stock_in: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  dispensing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  transfer_in: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  transfer_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  disposal: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  adjustment: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  inventory_count: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

interface StaffRow {
  id: string;
  createdAt: string;
  transactionType: TransactionType;
  quantity: number;
  quantityBaseUnit: number;
  productName: string;
  productCode: string;
  category: string | null;
  baseUnit: string;
  unitName: string | null;
  warehouseName: string;
  sectionName: string | null;
  batchNumber: string | null;
  expiryDate: string | null;
  performedByName: string;
  performedById: string | null;
  notes: string | null;
}

export default function StaffReportPage() {
  const { user } = useAuth();
  const isAdmin = can(user?.role, "users", "read");

  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(firstOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [staffId, setStaffId] = useState<string>("all");
  const [txnType, setTxnType] = useState<string>("all");
  const [warehouseId, setWarehouseId] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const { data: users = [] } = useQuery({
    queryKey: ["users_list"],
    queryFn: () => db.users.orderBy("fullName").toArray(),
    enabled: isAdmin,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => db.warehouses.filter(w => w.isActive).toArray(),
  });

  const { data: allRows = [], isLoading } = useQuery({
    queryKey: ["staff_report_raw"],
    queryFn: async () => {
      const [txns, products, warehouseList, sections, units, batches, userList] = await Promise.all([
        db.inventoryTransactions.toArray(),
        db.products.toArray(),
        db.warehouses.toArray(),
        db.warehouseSections.toArray(),
        db.productUnits.toArray(),
        db.inventoryBatches.toArray(),
        db.users.toArray(),
      ]);
      const pm = new Map(products.map(p => [p.id, p]));
      const wm = new Map(warehouseList.map(w => [w.id, w]));
      const sm = new Map(sections.map(s => [s.id, s]));
      const um = new Map(units.map(u => [u.id, u]));
      const bm = new Map(batches.map(b => [b.id, b]));
      const usrm = new Map(userList.map(u => [u.id, u]));

      return txns.map(t => {
        const product = pm.get(t.productId);
        const performedUser = t.performedBy ? usrm.get(t.performedBy) : null;
        return {
          id: t.id,
          createdAt: t.createdAt,
          transactionType: t.transactionType,
          quantity: t.quantity,
          quantityBaseUnit: t.quantityBaseUnit,
          productName: product?.productName ?? "Unknown",
          productCode: product?.productCode ?? "",
          category: product?.category ?? null,
          baseUnit: product?.baseUnit ?? "",
          unitName: um.get(t.unitId)?.unitName ?? null,
          warehouseName: wm.get(t.warehouseId)?.warehouseName ?? "Unknown",
          sectionName: t.sectionId ? (sm.get(t.sectionId)?.sectionName ?? null) : null,
          batchNumber: bm.get(t.batchId)?.batchNumber ?? null,
          expiryDate: bm.get(t.batchId)?.expiryDate ?? null,
          performedByName: performedUser?.fullName ?? performedUser?.username ?? "System",
          performedById: t.performedBy ?? null,
          notes: t.notes,
        } satisfies StaffRow;
      });
    },
  });

  const filtered = useMemo(() => {
    let rows = allRows;

    // Staff can only see their own transactions
    if (!isAdmin) {
      rows = rows.filter(r => r.performedById === user?.id);
    } else if (staffId !== "all") {
      rows = rows.filter(r => r.performedById === staffId);
    }

    if (dateFrom) rows = rows.filter(r => r.createdAt.slice(0, 10) >= dateFrom);
    if (dateTo) rows = rows.filter(r => r.createdAt.slice(0, 10) <= dateTo);
    if (txnType !== "all") rows = rows.filter(r => r.transactionType === txnType);
    if (warehouseId !== "all") rows = rows.filter(r => r.warehouseName === (warehouses.find(w => w.id === warehouseId)?.warehouseName ?? ""));
    if (productSearch.trim()) {
      const s = productSearch.toLowerCase();
      rows = rows.filter(r => r.productName.toLowerCase().includes(s) || r.productCode.toLowerCase().includes(s));
    }

    return [...rows].sort((a, b) =>
      sortDir === "desc"
        ? b.createdAt.localeCompare(a.createdAt)
        : a.createdAt.localeCompare(b.createdAt)
    );
  }, [allRows, isAdmin, user?.id, staffId, dateFrom, dateTo, txnType, warehouseId, productSearch, sortDir, warehouses]);

  // Summary stats
  const summary = useMemo(() => {
    const byStaff = new Map<string, { name: string; count: number; dispensed: number; stockIn: number }>();
    for (const r of filtered) {
      const key = r.performedById ?? "system";
      if (!byStaff.has(key)) byStaff.set(key, { name: r.performedByName, count: 0, dispensed: 0, stockIn: 0 });
      const s = byStaff.get(key)!;
      s.count++;
      if (r.transactionType === "dispensing") s.dispensed += r.quantityBaseUnit;
      if (r.transactionType === "stock_in") s.stockIn += r.quantityBaseUnit;
    }
    return [...byStaff.values()].sort((a, b) => b.count - a.count);
  }, [filtered]);

  function clearFilters() {
    setDateFrom(firstOfMonth);
    setDateTo(today);
    setStaffId("all");
    setTxnType("all");
    setWarehouseId("all");
    setProductSearch("");
  }

  function exportExcel() {
    if (filtered.length === 0) { toast.error("No data to export"); return; }
    const wsData = [
      ["AUC Clinic Inventory — Staff Activity Report"],
      [`Period: ${dateFrom} to ${dateTo}`, `Generated: ${new Date().toLocaleString()}`],
      [],
      ["Date", "Time", "Staff", "Type", "Product", "Code", "Category", "Qty", "Unit", "Base Qty", "Base Unit", "Warehouse", "Section", "Batch No.", "Expiry", "Notes"],
      ...filtered.map(r => [
        r.createdAt.slice(0, 10),
        r.createdAt.slice(11, 19),
        r.performedByName,
        TRANSACTION_LABELS[r.transactionType] ?? r.transactionType,
        r.productName,
        r.productCode,
        r.category ?? "",
        r.quantity,
        r.unitName ?? r.baseUnit,
        r.quantityBaseUnit,
        r.baseUnit,
        r.warehouseName,
        r.sectionName ?? "",
        r.batchNumber ?? "",
        r.expiryDate ?? "",
        r.notes ?? "",
      ]),
      [],
      [`Total Transactions: ${filtered.length}`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 11 }, { wch: 9 }, { wch: 20 }, { wch: 16 }, { wch: 28 }, { wch: 12 }, { wch: 16 }, { wch: 7 }, { wch: 8 }, { wch: 9 }, { wch: 9 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 11 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Staff Report");
    XLSX.writeFile(wb, `staff_report_${dateFrom}_${dateTo}.xlsx`);
    toast.success("Excel exported");
  }

  function printReport() {
    if (filtered.length === 0) { toast.error("No data to print"); return; }
    const rows_html = filtered.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.createdAt.slice(0, 10)}<br><small>${r.createdAt.slice(11, 16)}</small></td>
        <td><strong>${r.performedByName}</strong></td>
        <td style="font-size:10px;white-space:nowrap">${TRANSACTION_LABELS[r.transactionType] ?? r.transactionType}</td>
        <td><strong>${r.productName}</strong><br><small>${r.productCode}</small></td>
        <td style="text-align:right">${r.quantity} ${r.unitName ?? r.baseUnit}</td>
        <td>${r.warehouseName}${r.sectionName ? ` / ${r.sectionName}` : ""}</td>
        <td>${r.batchNumber ?? ""}${r.expiryDate ? `<br><small>${r.expiryDate}</small>` : ""}</td>
        <td style="font-size:10px">${r.notes ?? ""}</td>
      </tr>`).join("");

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Staff Report</title>
<style>body{font-family:Arial;font-size:11px;margin:20px}h2{color:#0c4a6e;margin:0 0 4px}
.meta{font-size:10px;color:#555;margin-bottom:12px}
table{width:100%;border-collapse:collapse}th{background:#0c4a6e;color:#fff;padding:5px 7px;text-align:left;font-size:10px}
td{padding:4px 7px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#f9fafb}
small{color:#888}
@media print{@page{size:A4 landscape;margin:12mm}}</style></head><body>
<h2>AUC Clinic Inventory — Staff Activity Report</h2>
<div class="meta">Period: ${dateFrom} to ${dateTo} | ${isAdmin && staffId !== "all" ? `Staff: ${users.find(u => u.id === staffId)?.fullName ?? ""}  | ` : ""}Total: ${filtered.length} transactions | Generated: ${new Date().toLocaleString()}</div>
<table><thead><tr><th>#</th><th>Date/Time</th><th>Staff</th><th>Type</th><th>Product</th><th>Qty</th><th>Warehouse</th><th>Batch</th><th>Notes</th></tr></thead>
<tbody>${rows_html}</tbody></table>
<div style="margin-top:8px;font-size:10px;color:#555">Total: ${filtered.length} transactions</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  const hasActiveFilters = staffId !== "all" || txnType !== "all" || warehouseId !== "all" || productSearch.trim() || dateFrom !== firstOfMonth || dateTo !== today;

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" /> Staff Report
          </h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Activity log for all staff members" : "Your personal activity log"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={filtered.length === 0} className="gap-2">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printReport} disabled={filtered.length === 0} className="gap-2">
            <Printer className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground" /> Filters</p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-7 text-xs gap-1 text-muted-foreground">
                <X className="w-3.5 h-3.5" /> Clear all
              </Button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {/* Date From */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">From</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Date To */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">To</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-8 text-sm"
              />
            </div>

            {/* Staff Member — admin only */}
            {isAdmin && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Staff Member</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All staff" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All staff</SelectItem>
                    {users.map(u => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.fullName || u.username}
                        {u.role === "admin" && <span className="text-muted-foreground ml-1">(admin)</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Transaction Type */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Transaction Type</Label>
              <Select value={txnType} onValueChange={setTxnType}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {TXN_TYPES.map(t => (
                    <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warehouse */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Warehouse</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All warehouses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product search */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Product</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1.5 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  className="h-8 text-sm pl-7"
                  placeholder="Name or code…"
                  value={productSearch}
                  onChange={e => setProductSearch(e.target.value)}
                />
                {productSearch && (
                  <button className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground" onClick={() => setProductSearch("")}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Summary Cards ─────────────────────────────────────── */}
      {summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summary.slice(0, 6).map(s => (
            <Card key={s.name} className="border-border/60">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-7 h-7 bg-primary/15 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-primary uppercase">{s.name[0]}</span>
                  </div>
                  <span className="font-medium text-sm truncate">{s.name}</span>
                  <Badge variant="secondary" className="ml-auto text-xs flex-shrink-0">{s.count} txns</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <TrendingDown className="w-3 h-3 text-blue-500" />
                    Dispensed: <span className="font-medium text-foreground ml-1">{s.dispensed.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Package className="w-3 h-3 text-green-500" />
                    Stock in: <span className="font-medium text-foreground ml-1">{s.stockIn.toLocaleString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ── Transaction Table ─────────────────────────────────── */}
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{filtered.length} transaction{filtered.length !== 1 ? "s" : ""}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
          {sortDir === "desc" ? "Newest first" : "Oldest first"}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Activity className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No transactions match the current filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                <th className="text-left px-4 py-2.5 font-medium">Date & Time</th>
                {isAdmin && <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">Staff</th>}
                <th className="text-left px-4 py-2.5 font-medium">Type</th>
                <th className="text-left px-4 py-2.5 font-medium">Product</th>
                <th className="text-right px-4 py-2.5 font-medium">Qty</th>
                <th className="text-left px-4 py-2.5 font-medium hidden md:table-cell">Warehouse</th>
                <th className="text-left px-4 py-2.5 font-medium hidden lg:table-cell">Batch</th>
                <th className="text-left px-4 py-2.5 font-medium hidden xl:table-cell">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r, i) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <div className="text-xs font-medium">{r.createdAt.slice(0, 10)}</div>
                    <div className="text-xs text-muted-foreground">{r.createdAt.slice(11, 16)}</div>
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5">
                        <div className="w-5 h-5 bg-primary/15 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-bold text-primary uppercase">{r.performedByName[0]}</span>
                        </div>
                        <span className="text-xs">{r.performedByName}</span>
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${txnTypeColor[r.transactionType] ?? "bg-gray-100 text-gray-700"}`}>
                      {TRANSACTION_LABELS[r.transactionType] ?? r.transactionType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-sm">{r.productName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{r.productCode}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium whitespace-nowrap">
                    {r.quantity} <span className="text-xs text-muted-foreground">{r.unitName ?? r.baseUnit}</span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-xs text-muted-foreground">
                    {r.warehouseName}{r.sectionName ? ` / ${r.sectionName}` : ""}
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell text-xs text-muted-foreground font-mono">
                    {r.batchNumber ?? "—"}
                    {r.expiryDate && <div className="font-sans text-muted-foreground/70">{r.expiryDate}</div>}
                  </td>
                  <td className="px-4 py-2.5 hidden xl:table-cell text-xs text-muted-foreground max-w-xs truncate">
                    {r.notes ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-muted/30 flex justify-between text-xs text-muted-foreground">
            <span>{filtered.length} transactions shown</span>
            <span>Period: {dateFrom} → {dateTo}</span>
          </div>
        </div>
      )}
    </div>
  );
}
