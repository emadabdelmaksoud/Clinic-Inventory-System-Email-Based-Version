import { useMemo, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, Printer, Scale, AlertTriangle, TrendingDown, Filter } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface BalanceRow {
  productId: string;
  productName: string;
  productCode: string;
  category: string | null;
  baseUnit: string;
  reorderLevel: number;
  onHandBase: number;
  isLow: boolean;
}

type SortKey = "name_asc" | "name_desc" | "stock_low" | "stock_high" | "code_asc";

export default function BalancePage() {
  const [search, setSearch] = useState("");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");
  const [showLowOnly, setShowLowOnly] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["balance"],
    queryFn: async () => {
      const [products, batches, warehouses, sections] = await Promise.all([
        db.products.toArray(),
        db.inventoryBatches.toArray(),
        db.warehouses.toArray(),
        db.warehouseSections.toArray(),
      ]);
      return { products, batches, warehouses, sections };
    },
  });

  const warehouses = rawData?.warehouses ?? [];
  const allSections = rawData?.sections ?? [];

  const sectionsForWarehouse = useMemo(() => {
    if (warehouseFilter === "all") return allSections;
    return allSections.filter(s => s.warehouseId === warehouseFilter);
  }, [allSections, warehouseFilter]);

  const categories = useMemo(() => {
    const cats = new Set((rawData?.products ?? []).map(p => p.category).filter(Boolean) as string[]);
    return [...cats].sort();
  }, [rawData]);

  const rows: BalanceRow[] = useMemo(() => {
    if (!rawData) return [];
    const { products, batches } = rawData;

    return products.map(p => {
      let pBatches = batches.filter(b => b.productId === p.id && b.quantityBaseUnit > 0);
      if (warehouseFilter !== "all") pBatches = pBatches.filter(b => b.warehouseId === warehouseFilter);
      if (sectionFilter !== "all") pBatches = pBatches.filter(b => b.sectionId === sectionFilter);
      const onHandBase = pBatches.reduce((s, b) => s + b.quantityBaseUnit, 0);
      return {
        productId: p.id,
        productName: p.productName,
        productCode: p.productCode,
        category: p.category,
        baseUnit: p.baseUnit,
        reorderLevel: p.reorderLevel,
        onHandBase,
        isLow: onHandBase <= p.reorderLevel && p.reorderLevel > 0,
      };
    });
  }, [rawData, warehouseFilter, sectionFilter]);

  const filtered = useMemo(() => {
    let result = rows;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter(r =>
        r.productName.toLowerCase().includes(s) ||
        r.productCode.toLowerCase().includes(s) ||
        (r.category ?? "").toLowerCase().includes(s)
      );
    }
    if (categoryFilter !== "all") result = result.filter(r => r.category === categoryFilter);
    if (showLowOnly) result = result.filter(r => r.isLow);

    const sorted = [...result];
    switch (sortKey) {
      case "name_asc": sorted.sort((a, b) => a.productName.localeCompare(b.productName)); break;
      case "name_desc": sorted.sort((a, b) => b.productName.localeCompare(a.productName)); break;
      case "stock_low": sorted.sort((a, b) => a.onHandBase - b.onHandBase); break;
      case "stock_high": sorted.sort((a, b) => b.onHandBase - a.onHandBase); break;
      case "code_asc": sorted.sort((a, b) => a.productCode.localeCompare(b.productCode)); break;
    }
    return sorted;
  }, [rows, search, categoryFilter, showLowOnly, sortKey]);

  const lowCount = rows.filter(r => r.isLow).length;
  const totalStock = rows.reduce((s, r) => s + r.onHandBase, 0);

  const warehouseName = warehouseFilter === "all" ? "All Warehouses" : warehouses.find(w => w.id === warehouseFilter)?.warehouseName ?? warehouseFilter;
  const sectionName = sectionFilter === "all" ? "" : allSections.find(s => s.id === sectionFilter)?.sectionName ?? "";

  function exportExcel() {
    const wsData = [
      ["AUC Clinic Inventory — Balance Report"],
      [`Date: ${new Date().toLocaleDateString()}`, `Location: ${warehouseName}${sectionName ? ` / ${sectionName}` : ""}`],
      [],
      ["#", "Product Name", "Code", "Category", "Base Unit", "Stock On Hand", "Reorder Level", "Status"],
      ...filtered.map((r, i) => [
        i + 1,
        r.productName,
        r.productCode,
        r.category ?? "",
        r.baseUnit,
        r.onHandBase,
        r.reorderLevel,
        r.isLow ? "LOW STOCK" : r.onHandBase === 0 ? "OUT OF STOCK" : "OK",
      ]),
      [],
      [`Total Products: ${filtered.length}`, `Total Stock Units: ${totalStock.toLocaleString()}`],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 35 }, { wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Balance");
    XLSX.writeFile(wb, `balance_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success("Excel exported");
  }

  function printPDF() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) { toast.error("Pop-up blocked"); return; }
    const rows_html = filtered.map((r, i) => `
      <tr style="${r.isLow ? "background:#fff7ed" : r.onHandBase === 0 ? "background:#fef2f2" : ""}">
        <td>${i + 1}</td>
        <td style="font-weight:500">${r.productName}</td>
        <td style="font-family:monospace;font-size:11px">${r.productCode}</td>
        <td>${r.category ?? ""}</td>
        <td>${r.baseUnit}</td>
        <td style="font-weight:600;text-align:right">${r.onHandBase.toLocaleString()}</td>
        <td style="text-align:right">${r.reorderLevel}</td>
        <td style="text-align:center;font-size:11px;font-weight:600;color:${r.onHandBase === 0 ? "#dc2626" : r.isLow ? "#ea580c" : "#16a34a"}">${r.onHandBase === 0 ? "OUT OF STOCK" : r.isLow ? "LOW" : "OK"}</td>
      </tr>`).join("");

    printWindow.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Balance Report</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 20px; }
  h2 { font-size: 18px; margin: 0 0 4px; color: #0c4a6e; }
  .meta { font-size: 11px; color: #555; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #0c4a6e; color: #fff; padding: 6px 8px; text-align: left; font-size: 11px; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  .footer { margin-top: 24px; font-size: 11px; color: #555; }
  .summary { margin-top: 12px; font-size: 12px; font-weight: 600; }
  @media print { @page { size: A4 landscape; margin: 15mm; } }
</style></head><body>
<h2>AUC Clinic Inventory — Balance Report</h2>
<div class="meta">Date: ${new Date().toLocaleDateString()} &nbsp;|&nbsp; Location: ${warehouseName}${sectionName ? ` / ${sectionName}` : ""} &nbsp;|&nbsp; Total Products: ${filtered.length}</div>
<table>
<thead><tr><th>#</th><th>Product Name</th><th>Code</th><th>Category</th><th>Unit</th><th style="text-align:right">Stock</th><th style="text-align:right">Reorder</th><th style="text-align:center">Status</th></tr></thead>
<tbody>${rows_html}</tbody>
</table>
<div class="summary">Total Stock Units: ${totalStock.toLocaleString()}</div>
<div class="footer" style="margin-top:40px;display:flex;justify-content:flex-end"><div style="text-align:center;min-width:160px">
<div style="border-top:1px solid #111;padding-top:4px">Authorized Signature</div>
</div></div>
</body></html>`);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Scale className="w-6 h-6 text-primary" /> Balance
          </h1>
          <p className="text-sm text-muted-foreground">Current stock on hand for all products</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} className="gap-2">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button variant="outline" onClick={printPDF} className="gap-2">
            <Printer className="w-4 h-4" /> PDF
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Products</p>
            <p className="text-2xl font-semibold mt-1">{rows.length}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Units On Hand</p>
            <p className="text-2xl font-semibold mt-1">{totalStock.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 col-span-2 sm:col-span-1">
          <CardContent className="p-4 flex items-center gap-3">
            {lowCount > 0 && <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0" />}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Low / Out of Stock</p>
              <p className={`text-2xl font-semibold mt-1 ${lowCount > 0 ? "text-orange-600" : "text-green-600"}`}>{lowCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search by name, code, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Select value={sortKey} onValueChange={v => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-44">
            <Filter className="w-3.5 h-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name_asc">Name A → Z</SelectItem>
            <SelectItem value="name_desc">Name Z → A</SelectItem>
            <SelectItem value="stock_low">Stock Low → High</SelectItem>
            <SelectItem value="stock_high">Stock High → Low</SelectItem>
            <SelectItem value="code_asc">Code A → Z</SelectItem>
          </SelectContent>
        </Select>

        <Select value={warehouseFilter} onValueChange={v => { setWarehouseFilter(v); setSectionFilter("all"); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Warehouses</SelectItem>
            {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>)}
          </SelectContent>
        </Select>

        {warehouseFilter !== "all" && sectionsForWarehouse.length > 0 && (
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All Sections" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sections</SelectItem>
              {sectionsForWarehouse.map(s => <SelectItem key={s.id} value={s.id}>{s.sectionName}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Button
          variant={showLowOnly ? "default" : "outline"}
          size="sm"
          onClick={() => setShowLowOnly(v => !v)}
          className="gap-1.5"
        >
          <TrendingDown className="w-3.5 h-3.5" />
          Low Stock Only
          {lowCount > 0 && <Badge variant="secondary" className="ml-1 text-xs px-1.5 py-0">{lowCount}</Badge>}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center"><p className="text-muted-foreground">No products match the current filters.</p></CardContent></Card>
      ) : (
        <div ref={printRef} className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-4 py-3 font-medium w-8">#</th>
                <th className="text-left px-4 py-3 font-medium">Product Name</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Code</th>
                <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Category</th>
                <th className="text-left px-4 py-3 font-medium">Unit</th>
                <th className="text-right px-4 py-3 font-medium">Stock On Hand</th>
                <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Reorder Level</th>
                <th className="text-center px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r, i) => (
                <tr
                  key={r.productId}
                  className={`transition-colors ${r.onHandBase === 0 ? "bg-red-50/60 dark:bg-red-950/20" : r.isLow ? "bg-orange-50/60 dark:bg-orange-950/20" : "hover:bg-muted/30"}`}
                >
                  <td className="px-4 py-3 text-muted-foreground text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-medium">{r.productName}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground font-mono text-xs">{r.productCode}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {r.category && <Badge variant="secondary" className="text-xs">{r.category}</Badge>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.baseUnit}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold text-base tabular-nums ${r.onHandBase === 0 ? "text-destructive" : r.isLow ? "text-orange-600 dark:text-orange-400" : "text-foreground"}`}>
                      {r.onHandBase.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden sm:table-cell text-muted-foreground tabular-nums">{r.reorderLevel}</td>
                  <td className="px-4 py-3 text-center">
                    {r.onHandBase === 0 ? (
                      <Badge variant="destructive" className="text-xs">Out of Stock</Badge>
                    ) : r.isLow ? (
                      <Badge className="text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-0">Low</Badge>
                    ) : (
                      <Badge className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-0">OK</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-muted/30 flex justify-between text-xs text-muted-foreground">
            <span>Showing {filtered.length} of {rows.length} products</span>
            <span>Total on-hand: <span className="font-semibold text-foreground">{filtered.reduce((s, r) => s + r.onHandBase, 0).toLocaleString()}</span> units</span>
          </div>
        </div>
      )}
    </div>
  );
}
