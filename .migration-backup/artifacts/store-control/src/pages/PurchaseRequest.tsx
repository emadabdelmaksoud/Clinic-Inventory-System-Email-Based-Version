import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Printer, Download, Search, Plus, Trash2, TrendingDown, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface RequestItem {
  productId: string;
  productName: string;
  productCode: string;
  category: string | null;
  currentStock: number;
  reorderLevel: number;
  baseUnit: string;
  requestQty: number;
  notes: string;
  included: boolean;
  isManual: boolean;
}

interface OrderMeta {
  title: string;
  requestNumber: string;
  supplierName: string;
  notes: string;
}

type FilterKey = "all" | "low" | "out";

export default function PurchaseRequestPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [showFilter, setShowFilter] = useState<FilterKey>("all");
  const [items, setItems] = useState<RequestItem[]>([]);
  const [pickerSearch, setPickerSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [meta, setMeta] = useState<OrderMeta>({
    title: "Purchase Request",
    requestNumber: `PR-${Date.now().toString().slice(-6)}`,
    supplierName: "",
    notes: "",
  });

  const { data: rawData, isLoading } = useQuery({
    queryKey: ["purchase_req_data"],
    queryFn: async () => {
      const [products, batches] = await Promise.all([
        db.products.toArray(),
        db.inventoryBatches.toArray(),
      ]);
      const onHand = new Map<string, number>();
      for (const b of batches) {
        onHand.set(b.productId, (onHand.get(b.productId) ?? 0) + b.quantityBaseUnit);
      }
      return products.map(p => ({
        ...p,
        onHandBase: onHand.get(p.id) ?? 0,
      }));
    },
  });

  const allProducts = rawData ?? [];

  const categories = useMemo(() => {
    const cats = new Set(allProducts.map(p => p.category).filter(Boolean) as string[]);
    return [...cats].sort();
  }, [allProducts]);

  // Auto-populate low-stock items on first load
  useEffect(() => {
    if (!rawData || items.length > 0) return;
    const lowItems = rawData
      .filter(p => p.reorderLevel > 0 && p.onHandBase < p.reorderLevel)
      .map(p => ({
        productId: p.id,
        productName: p.productName,
        productCode: p.productCode,
        category: p.category,
        currentStock: p.onHandBase,
        reorderLevel: p.reorderLevel,
        baseUnit: p.baseUnit,
        requestQty: Math.max(1, p.reorderLevel * 2 - p.onHandBase),
        notes: "",
        included: true,
        isManual: false,
      } satisfies RequestItem));
    setItems(lowItems);
  }, [rawData]);

  const filtered = useMemo(() => {
    let list = items;
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter(i => i.productName.toLowerCase().includes(s) || i.productCode.toLowerCase().includes(s));
    }
    if (categoryFilter !== "all") list = list.filter(i => i.category === categoryFilter);
    if (showFilter === "low") list = list.filter(i => i.currentStock > 0 && i.currentStock < i.reorderLevel);
    if (showFilter === "out") list = list.filter(i => i.currentStock <= 0);
    return list;
  }, [items, search, categoryFilter, showFilter]);

  // Products not yet in list for picker
  const pickerProducts = useMemo(() => {
    const inList = new Set(items.map(i => i.productId));
    return allProducts.filter(p => {
      if (inList.has(p.id)) return false;
      if (!pickerSearch.trim()) return true;
      const s = pickerSearch.toLowerCase();
      return p.productName.toLowerCase().includes(s) || p.productCode.toLowerCase().includes(s);
    });
  }, [allProducts, items, pickerSearch]);

  function updateItem(productId: string, patch: Partial<RequestItem>) {
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, ...patch } : i));
  }

  function removeItem(productId: string) {
    setItems(prev => prev.filter(i => i.productId !== productId));
  }

  function addFromPicker(p: typeof allProducts[0]) {
    setItems(prev => [...prev, {
      productId: p.id,
      productName: p.productName,
      productCode: p.productCode,
      category: p.category,
      currentStock: p.onHandBase,
      reorderLevel: p.reorderLevel,
      baseUnit: p.baseUnit,
      requestQty: Math.max(1, p.reorderLevel > 0 ? p.reorderLevel * 2 - p.onHandBase : 1),
      notes: "",
      included: true,
      isManual: true,
    }]);
    setPickerSearch("");
  }

  const includedItems = items.filter(i => i.included);
  const totalIncluded = includedItems.length;
  const lowCount = items.filter(i => i.currentStock < i.reorderLevel && i.reorderLevel > 0).length;
  const outCount = items.filter(i => i.currentStock <= 0).length;

  function exportExcel() {
    const rows = includedItems;
    if (!rows.length) { toast.error("No items selected"); return; }
    const wsData = [
      ["AUC Clinic Inventory — Purchase Request"],
      [`Request No: ${meta.requestNumber}`, `Date: ${new Date().toLocaleDateString()}`, `Prepared by: ${user?.fullName ?? user?.username ?? ""}`],
      meta.supplierName ? [`Supplier: ${meta.supplierName}`] : [],
      [],
      ["#", "Product Name", "Code", "Category", "Current Stock", "Reorder Level", "Request Qty", "Unit", "Notes"],
      ...rows.map((r, i) => [i + 1, r.productName, r.productCode, r.category ?? "", r.currentStock, r.reorderLevel, r.requestQty, r.baseUnit, r.notes]),
      [],
      meta.notes ? [`General Notes: ${meta.notes}`] : [],
    ].filter(r => r.length > 0);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws["!cols"] = [{ wch: 4 }, { wch: 34 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 13 }, { wch: 10 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Purchase Request");
    XLSX.writeFile(wb, `purchase_request_${meta.requestNumber}.xlsx`);
    toast.success("Excel exported");
  }

  function printRequest() {
    const rows = includedItems;
    if (!rows.length) { toast.error("No items selected"); return; }
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const rows_html = rows.map((r, i) => {
      const stockColor = r.currentStock <= 0 ? "#dc2626" : r.currentStock < r.reorderLevel ? "#ea580c" : "#16a34a";
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${r.productName}</strong><br><small style="color:#888">${r.productCode}${r.category ? ` · ${r.category}` : ""}</small></td>
        <td style="text-align:right;color:${stockColor};font-weight:600">${r.currentStock}</td>
        <td style="text-align:right">${r.reorderLevel}</td>
        <td style="text-align:center;font-size:17px;font-weight:700">${r.requestQty}</td>
        <td>${r.baseUnit}</td>
        <td>${r.notes}</td>
      </tr>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${meta.title}</title>
<style>
body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:30px}
.header-block{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0c4a6e;padding-bottom:12px;margin-bottom:16px}
.clinic{font-size:15px;font-weight:700;color:#0c4a6e}
.title{font-size:20px;font-weight:700;margin:6px 0 4px}
.meta{font-size:11px;color:#555;margin-bottom:2px}
table{width:100%;border-collapse:collapse;margin-top:8px}
th{background:#0c4a6e;color:#fff;padding:6px 9px;text-align:left;font-size:11px}
td{padding:6px 9px;border-bottom:1px solid #e5e7eb;vertical-align:top}
tr:nth-child(even) td{background:#f9fafb}
.sig-row{display:flex;justify-content:space-between;margin-top:50px}
.sig-box{text-align:center;min-width:170px}
.sig-line{border-top:1px solid #111;padding-top:4px;margin-top:38px;font-size:11px}
.notes-box{margin-top:14px;padding:9px;border:1px solid #e5e7eb;border-radius:4px;min-height:44px;font-size:11px}
@media print{@page{size:A4 portrait;margin:15mm}}
</style></head><body>
<div class="header-block">
  <div>
    <div class="clinic">AUC Clinic Inventory System</div>
    <div class="title">${meta.title}</div>
    <div class="meta">Request No: <strong>${meta.requestNumber}</strong></div>
    <div class="meta">Date: <strong>${dateStr}</strong></div>
    <div class="meta">Prepared by: <strong>${user?.fullName ?? user?.username ?? ""}</strong></div>
    ${meta.supplierName ? `<div class="meta">Supplier: <strong>${meta.supplierName}</strong></div>` : ""}
  </div>
</div>
<table>
<thead><tr>
  <th style="width:32px">#</th>
  <th>Product</th>
  <th style="text-align:right;width:80px">In Stock</th>
  <th style="text-align:right;width:80px">Reorder</th>
  <th style="text-align:center;width:75px">Request Qty</th>
  <th style="width:60px">Unit</th>
  <th>Notes / Specification</th>
</tr></thead>
<tbody>${rows_html}</tbody>
</table>
${meta.notes ? `<div class="notes-box"><strong>Notes:</strong> ${meta.notes}</div>` : ""}
<div class="sig-row">
  <div class="sig-box"><div class="meta">Prepared by</div><div class="sig-line">${user?.fullName ?? user?.username ?? ""}</div></div>
  <div class="sig-box"><div class="meta">Approved by</div><div class="sig-line">&nbsp;</div></div>
  <div class="sig-box"><div class="meta">Received / Confirmed by</div><div class="sig-line">&nbsp;</div></div>
</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  return (
    <div className="space-y-4 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-primary" /> Purchase Request
          </h1>
          <p className="text-sm text-muted-foreground">Generate a printable purchase request for low or out-of-stock items</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={totalIncluded === 0} className="gap-2">
            <Download className="w-4 h-4" /> Excel
          </Button>
          <Button onClick={printRequest} disabled={totalIncluded === 0} className="gap-2">
            <Printer className="w-4 h-4" /> Print Request
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="border-border/60">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Items in list</p>
            <p className="text-xl font-semibold">{items.length}</p>
          </CardContent>
        </Card>
        <Card className="border-orange-300/40 bg-orange-50/50 dark:bg-orange-950/20">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Low stock</p>
            <p className="text-xl font-semibold text-orange-600">{lowCount}</p>
          </CardContent>
        </Card>
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Out of stock</p>
            <p className="text-xl font-semibold text-destructive">{outCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Request metadata */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-muted-foreground">Request Details</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Title</Label>
              <Input value={meta.title} onChange={e => setMeta(m => ({ ...m, title: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Request No.</Label>
              <Input value={meta.requestNumber} onChange={e => setMeta(m => ({ ...m, requestNumber: e.target.value }))} className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supplier</Label>
              <Input value={meta.supplierName} onChange={e => setMeta(m => ({ ...m, supplierName: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input value={meta.notes} onChange={e => setMeta(m => ({ ...m, notes: e.target.value }))} placeholder="Optional" className="h-8 text-sm" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters + controls */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px] max-w-xs">
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-8 text-sm" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={showFilter} onValueChange={v => setShowFilter(v as FilterKey)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All items</SelectItem>
            <SelectItem value="low">Low stock only</SelectItem>
            <SelectItem value="out">Out of stock</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue placeholder="All categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{totalIncluded} selected</span>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm" onClick={() => setShowPicker(p => !p)}>
            <Plus className="w-3.5 h-3.5" /> Add Product
          </Button>
          {items.length > 0 && (
            <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={() => setItems([])}>
              <X className="w-3.5 h-3.5" /> Clear
            </Button>
          )}
        </div>
      </div>

      {/* Product picker */}
      {showPicker && (
        <Card className="border-primary/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Add a product to the list</p>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowPicker(false)}><X className="w-3.5 h-3.5" /></Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-muted-foreground" />
              <Input autoFocus className="pl-8 h-8 text-sm" placeholder="Search products…" value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} />
            </div>
            <div className="max-h-48 overflow-y-auto space-y-0.5">
              {pickerProducts.slice(0, 30).map(p => (
                <button key={p.id} className="w-full text-left px-3 py-2 rounded hover:bg-muted/60 transition-colors flex items-center justify-between" onClick={() => addFromPicker(p)}>
                  <div>
                    <span className="text-sm font-medium">{p.productName}</span>
                    <span className="text-xs text-muted-foreground ml-2 font-mono">{p.productCode}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">stock: {p.onHandBase} {p.baseUnit}</span>
                </button>
              ))}
              {pickerProducts.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">All products already in list</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Items table */}
      {isLoading ? (
        <div className="space-y-2">{[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            {items.length === 0
              ? <>
                  <TrendingDown className="w-10 h-10 mx-auto text-green-500 mb-3" />
                  <p className="text-muted-foreground font-medium">All products are adequately stocked!</p>
                  <p className="text-xs text-muted-foreground mt-1">Use "Add Product" to manually add items to the request.</p>
                </>
              : <p className="text-muted-foreground">No items match the current filter.</p>
            }
          </CardContent>
        </Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-3 py-2.5 w-10">
                  <Checkbox
                    checked={filtered.every(i => i.included)}
                    onCheckedChange={v => {
                      const ids = new Set(filtered.map(i => i.productId));
                      setItems(prev => prev.map(i => ids.has(i.productId) ? { ...i, included: !!v } : i));
                    }}
                  />
                </th>
                <th className="text-left px-3 py-2.5 font-medium">Product</th>
                <th className="text-right px-3 py-2.5 font-medium hidden sm:table-cell">In Stock</th>
                <th className="text-right px-3 py-2.5 font-medium hidden sm:table-cell">Reorder</th>
                <th className="text-center px-3 py-2.5 font-medium">Request Qty</th>
                <th className="text-left px-3 py-2.5 font-medium hidden md:table-cell">Unit</th>
                <th className="text-left px-3 py-2.5 font-medium hidden lg:table-cell">Notes</th>
                <th className="px-3 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map(item => (
                <tr key={item.productId} className={`transition-colors ${!item.included ? "opacity-50" : item.currentStock <= 0 ? "bg-red-50/40 dark:bg-red-950/10" : item.currentStock < item.reorderLevel ? "bg-orange-50/30 dark:bg-orange-950/10" : ""}`}>
                  <td className="px-3 py-2.5">
                    <Checkbox checked={item.included} onCheckedChange={v => updateItem(item.productId, { included: !!v })} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-sm">{item.productName}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground font-mono">{item.productCode}</span>
                      {item.category && <Badge variant="secondary" className="text-xs px-1.5 py-0 h-4">{item.category}</Badge>}
                      {item.isManual && <Badge className="text-xs px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-0">manual</Badge>}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right hidden sm:table-cell">
                    <span className={`font-semibold tabular-nums ${item.currentStock <= 0 ? "text-destructive" : item.currentStock < item.reorderLevel ? "text-orange-600" : "text-foreground"}`}>
                      {item.currentStock}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right hidden sm:table-cell text-muted-foreground tabular-nums">{item.reorderLevel}</td>
                  <td className="px-3 py-2.5 text-center">
                    <Input
                      type="number"
                      min={1}
                      value={item.requestQty}
                      onChange={e => updateItem(item.productId, { requestQty: Math.max(1, Number(e.target.value) || 1) })}
                      className="h-7 w-20 text-sm text-center mx-auto font-semibold"
                    />
                  </td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-muted-foreground text-xs">{item.baseUnit}</td>
                  <td className="px-3 py-2.5 hidden lg:table-cell">
                    <Input
                      value={item.notes}
                      onChange={e => updateItem(item.productId, { notes: e.target.value })}
                      placeholder="Specification, brand…"
                      className="h-7 text-xs"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => removeItem(item.productId)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2 border-t bg-muted/30 flex justify-between text-xs text-muted-foreground">
            <span>{totalIncluded} of {items.length} items selected for printing</span>
            <span>Total request qty: {includedItems.reduce((s, i) => s + i.requestQty, 0).toLocaleString()} units</span>
          </div>
        </div>
      )}
    </div>
  );
}
