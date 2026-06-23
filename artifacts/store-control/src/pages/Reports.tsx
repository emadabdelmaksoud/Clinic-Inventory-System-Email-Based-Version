import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getStockSummary,
  listTransactionsFull,
  type ReportFilters,
  type StockSummaryRow,
} from "@/lib/reports";
import { listWarehouses } from "@/lib/warehouses";
import { TRANSACTION_TYPES, TRANSACTION_LABELS } from "@/lib/inventory";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { exportTransactionsExcel, exportStockSummaryExcel } from "@/lib/backup";
import {
  BarChart3,
  Download,
  AlertTriangle,
  Printer,
  Search,
  ChevronDown,
  ChevronRight,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TransactionType } from "@/lib/db";

const txnColors: Record<string, string> = {
  stock_in: "bg-green-100 text-green-700",
  dispensing: "bg-blue-100 text-blue-700",
  transfer_in: "bg-purple-100 text-purple-700",
  transfer_out: "bg-orange-100 text-orange-700",
  disposal: "bg-red-100 text-red-700",
  adjustment: "bg-gray-100 text-gray-700",
  inventory_count: "bg-teal-100 text-teal-700",
};

function expiryColor(dateStr: string | null): string {
  if (!dateStr) return "";
  const today = new Date().toISOString().slice(0, 10);
  const near = new Date();
  near.setDate(near.getDate() + 90);
  const nearStr = near.toISOString().slice(0, 10);
  if (dateStr < today) return "text-red-600 font-semibold";
  if (dateStr <= nearStr) return "text-amber-600 font-semibold";
  return "text-green-700";
}

export default function ReportsPage() {
  const [tab, setTab] = useState("stock");

  const [stockSearch, setStockSearch] = useState("");
  const [stockSort, setStockSort] = useState("name-asc");
  const [stockCategory, setStockCategory] = useState("all");
  const [stockWarehouse, setStockWarehouse] = useState("all");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const [txnSearch, setTxnSearch] = useState("");
  const [filters, setFilters] = useState<ReportFilters>({});

  const { data: warehouses = [] } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
  });
  const { data: stockSummary = [] } = useQuery({
    queryKey: ["stock-summary"],
    queryFn: getStockSummary,
  });
  const { data: txns = [], isLoading: txnsLoading } = useQuery({
    queryKey: ["txns-report", filters],
    queryFn: () => listTransactionsFull(filters),
  });

  const setFilter = (key: keyof ReportFilters, value: string | null) => {
    setFilters(prev => ({ ...prev, [key]: value === "all" ? null : value }));
  };

  const stockCategories = useMemo(() => {
    const cats = new Set(
      stockSummary.map(p => p.category).filter(Boolean) as string[]
    );
    return [...cats].sort();
  }, [stockSummary]);

  const txnCategories = useMemo(() => {
    const cats = new Set(
      txns.map(t => t.category).filter(Boolean) as string[]
    );
    return [...cats].sort();
  }, [txns]);

  const filteredStock = useMemo(() => {
    let result = stockSummary.map(p => ({ ...p, batches: [...p.batches] }));

    if (stockSearch.trim()) {
      const s = stockSearch.trim().toLowerCase();
      result = result.filter(
        p =>
          p.productName.toLowerCase().includes(s) ||
          p.productCode.toLowerCase().includes(s)
      );
    }

    if (stockCategory !== "all") {
      result = result.filter(p => p.category === stockCategory);
    }

    if (stockWarehouse !== "all") {
      result = result
        .map(p => ({
          ...p,
          batches: p.batches.filter(b => b.warehouseId === stockWarehouse),
        }))
        .filter(p => p.batches.length > 0)
        .map(p => ({
          ...p,
          onHandBase: p.batches.reduce((s, b) => s + b.quantityBaseUnit, 0),
          batchCount: p.batches.length,
        }));
    }

    switch (stockSort) {
      case "name-asc":
        result.sort((a, b) => a.productName.localeCompare(b.productName));
        break;
      case "name-desc":
        result.sort((a, b) => b.productName.localeCompare(a.productName));
        break;
      case "stock-high":
        result.sort((a, b) => b.onHandBase - a.onHandBase);
        break;
      case "stock-low":
        result.sort((a, b) => a.onHandBase - b.onHandBase);
        break;
      case "reorder":
        result.sort((a, b) => b.reorderLevel - a.reorderLevel);
        break;
      case "status": {
        const score = (p: StockSummaryRow) =>
          (p.expired > 0 ? 4 : 0) +
          (p.nearExpiry > 0 ? 2 : 0) +
          (p.reorderLevel > 0 && p.onHandBase < p.reorderLevel ? 1 : 0);
        result.sort((a, b) => score(b) - score(a));
        break;
      }
    }

    return result;
  }, [stockSummary, stockSearch, stockSort, stockCategory, stockWarehouse]);

  const filteredTxns = useMemo(() => {
    if (!txnSearch.trim()) return txns;
    const s = txnSearch.trim().toLowerCase();
    return txns.filter(
      t =>
        t.productName.toLowerCase().includes(s) ||
        t.productCode.toLowerCase().includes(s)
    );
  }, [txns, txnSearch]);

  const lowStock = stockSummary.filter(
    p => p.reorderLevel > 0 && p.onHandBase < p.reorderLevel
  );

  const chartData = stockSummary.slice(0, 20).map(p => ({
    name:
      p.productName.length > 15
        ? p.productName.slice(0, 15) + "…"
        : p.productName,
    stock: p.onHandBase,
    reorder: p.reorderLevel,
  }));

  function toggleRow(productId: string) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function handleExportStockExcel() {
    if (filteredStock.length === 0) return toast.error("No stock data to export");
    exportStockSummaryExcel(filteredStock).catch(e => toast.error(e.message));
    toast.success("Stock summary exported");
  }

  function handleExportTxnsExcel() {
    if (filteredTxns.length === 0)
      return toast.error("No transactions match the current filters");
    exportTransactionsExcel(filteredTxns, "transactions").catch(e =>
      toast.error(e.message)
    );
    toast.success(`Exported ${filteredTxns.length} transactions`);
  }

  const hasStockFilters =
    stockSearch || stockCategory !== "all" || stockWarehouse !== "all" || stockSort !== "name-asc";

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6" /> Reports
          </h1>
          <p className="text-sm text-muted-foreground">
            Inventory analytics and transaction history
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.print()}
          data-testid="button-print-report"
        >
          <Printer className="w-4 h-4 mr-1" /> Print / PDF
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="stock">Stock Summary</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="charts">Charts</TabsTrigger>
        </TabsList>

        {/* ── STOCK SUMMARY TAB ────────────────────────────────── */}
        <TabsContent value="stock" className="space-y-4">

          {/* Filters row */}
          <div className="flex flex-wrap gap-2 items-end p-4 bg-card border rounded-lg">
            {/* Search */}
            <div className="flex-1 min-w-[180px] space-y-1">
              <Label className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  className="pl-9 h-9"
                  placeholder="Product name or code…"
                  value={stockSearch}
                  onChange={e => setStockSearch(e.target.value)}
                />
                {stockSearch && (
                  <button
                    className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                    onClick={() => setStockSearch("")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Sort */}
            <div className="space-y-1 w-44">
              <Label className="text-xs">Sort by</Label>
              <Select value={stockSort} onValueChange={setStockSort}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name-asc">Name A → Z</SelectItem>
                  <SelectItem value="name-desc">Name Z → A</SelectItem>
                  <SelectItem value="stock-high">Stock: High → Low</SelectItem>
                  <SelectItem value="stock-low">Stock: Low → High</SelectItem>
                  <SelectItem value="reorder">Reorder Level</SelectItem>
                  <SelectItem value="status">Status (Alerts first)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            <div className="space-y-1 w-44">
              <Label className="text-xs">Category</Label>
              <Select value={stockCategory} onValueChange={setStockCategory}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {stockCategories.map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Warehouse */}
            <div className="space-y-1 w-44">
              <Label className="text-xs">Warehouse</Label>
              <Select value={stockWarehouse} onValueChange={setStockWarehouse}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All warehouses</SelectItem>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.warehouseName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Export + Reset */}
            <div className="flex gap-2 ml-auto">
              {hasStockFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStockSearch("");
                    setStockSort("name-asc");
                    setStockCategory("all");
                    setStockWarehouse("all");
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Reset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportStockExcel}
                data-testid="button-export-stock-excel"
              >
                <Download className="w-4 h-4 mr-1" /> Export Excel
              </Button>
            </div>
          </div>

          {/* Low stock alert */}
          {lowStock.length > 0 && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                <strong>{lowStock.length}</strong> product
                {lowStock.length !== 1 ? "s are" : " is"} below reorder level.
              </span>
            </div>
          )}

          {/* Results count */}
          <div className="text-xs text-muted-foreground">
            Showing {filteredStock.length} of {stockSummary.length} products
            {stockWarehouse !== "all" && " · Click a row to see batch details"}
            {stockWarehouse === "all" && " · Click a row to see batch details"}
          </div>

          {/* Table */}
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium w-8" />
                  <th className="text-left px-4 py-3 font-medium">Product</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Category</th>
                  <th className="text-left px-4 py-3 font-medium">Stock</th>
                  <th className="text-left px-4 py-3 font-medium">Reorder</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Batches</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStock.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                      No products match the current filters.
                    </td>
                  </tr>
                ) : (
                  filteredStock.map(p => {
                    const expanded = expandedRows.has(p.productId);
                    return (
                      <>
                        {/* Main product row */}
                        <tr
                          key={p.productId}
                          className="hover:bg-muted/30 cursor-pointer transition-colors"
                          onClick={() => toggleRow(p.productId)}
                          data-testid={`stock-row-${p.productId}`}
                        >
                          <td className="px-3 py-3 text-muted-foreground">
                            {expanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium">{p.productName}</div>
                            <div className="text-xs font-mono text-muted-foreground">
                              {p.productCode}
                            </div>
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell">
                            {p.category ? (
                              <Badge variant="secondary" className="text-xs">
                                {p.category}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3 font-medium">
                            {p.onHandBase.toLocaleString()} {p.baseUnit}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {p.reorderLevel}
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">
                            {p.batchCount}
                          </td>
                          <td className="px-4 py-3">
                            {p.expired > 0 && (
                              <Badge variant="destructive" className="text-xs mr-1">
                                Expired: {p.expired}
                              </Badge>
                            )}
                            {p.nearExpiry > 0 && (
                              <Badge className="text-xs bg-amber-500 mr-1">
                                Near Expiry: {p.nearExpiry}
                              </Badge>
                            )}
                            {p.reorderLevel > 0 && p.onHandBase < p.reorderLevel && (
                              <Badge className="text-xs bg-orange-500">Low Stock</Badge>
                            )}
                            {p.expired === 0 &&
                              p.nearExpiry === 0 &&
                              (p.reorderLevel === 0 || p.onHandBase >= p.reorderLevel) && (
                                <span className="text-green-600 text-xs font-medium">OK</span>
                              )}
                          </td>
                        </tr>

                        {/* Expanded batch detail row */}
                        {expanded && (
                          <tr key={`${p.productId}-batches`} className="bg-muted/10">
                            <td colSpan={7} className="px-6 py-3">
                              {p.batches.length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">
                                  No active batches found.
                                </p>
                              ) : (
                                <div className="text-xs space-y-1.5">
                                  <div className="grid grid-cols-5 gap-3 font-semibold text-muted-foreground pb-1.5 border-b text-[11px] uppercase tracking-wide">
                                    <span>Batch #</span>
                                    <span>Expiry Date</span>
                                    <span>Qty ({p.baseUnit})</span>
                                    <span>Warehouse</span>
                                    <span>Status</span>
                                  </div>
                                  {p.batches.map(b => {
                                    const today = new Date().toISOString().slice(0, 10);
                                    const near = new Date();
                                    near.setDate(near.getDate() + 90);
                                    const nearStr = near.toISOString().slice(0, 10);
                                    const isExpired = b.expiryDate && b.expiryDate < today;
                                    const isNear = b.expiryDate && b.expiryDate >= today && b.expiryDate <= nearStr;
                                    return (
                                      <div
                                        key={b.batchId}
                                        className="grid grid-cols-5 gap-3 py-1 hover:bg-muted/30 rounded"
                                      >
                                        <span className="font-mono font-medium">
                                          {b.batchNumber ?? <span className="italic text-muted-foreground">No batch #</span>}
                                        </span>
                                        <span className={expiryColor(b.expiryDate)}>
                                          {b.expiryDate
                                            ? format(new Date(b.expiryDate + "T00:00:00"), "dd MMM yyyy")
                                            : <span className="text-muted-foreground">—</span>}
                                        </span>
                                        <span>{b.quantityBaseUnit.toLocaleString()}</span>
                                        <span className="text-muted-foreground">{b.warehouseName}</span>
                                        <span>
                                          {isExpired && (
                                            <Badge variant="destructive" className="text-[10px] py-0">Expired</Badge>
                                          )}
                                          {isNear && !isExpired && (
                                            <Badge className="text-[10px] py-0 bg-amber-500">Near Expiry</Badge>
                                          )}
                                          {!isExpired && !isNear && (
                                            <span className="text-green-600">Good</span>
                                          )}
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* ── TRANSACTIONS TAB ─────────────────────────────────── */}
        <TabsContent value="transactions" className="space-y-4">
          <div className="p-4 bg-card border rounded-lg space-y-3">
            {/* Row 1: dates + warehouse + type */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={filters.from ?? ""}
                  onChange={e => setFilter("from", e.target.value || null)}
                  data-testid="input-from"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  className="h-9"
                  value={filters.to ?? ""}
                  onChange={e => setFilter("to", e.target.value || null)}
                  data-testid="input-to"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Warehouse</Label>
                <Select
                  value={filters.warehouseId ?? "all"}
                  onValueChange={v => setFilter("warehouseId", v)}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    {warehouses.map(w => (
                      <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Select
                  value={filters.transactionType ?? "all"}
                  onValueChange={v => setFilter("transactionType", v)}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {TRANSACTION_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: product search + category */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Search product</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2 w-4 h-4 text-muted-foreground" />
                  <Input
                    className="pl-9 h-9"
                    placeholder="Product name or code…"
                    value={txnSearch}
                    onChange={e => setTxnSearch(e.target.value)}
                  />
                  {txnSearch && (
                    <button
                      className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      onClick={() => setTxnSearch("")}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Category</Label>
                <Select
                  value={filters.category ?? "all"}
                  onValueChange={v => setFilter("category", v)}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {txnCategories.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 w-full"
                  onClick={() => {
                    setFilters({});
                    setTxnSearch("");
                  }}
                >
                  <X className="w-3.5 h-3.5 mr-1" /> Reset
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full"
                  onClick={handleExportTxnsExcel}
                  disabled={txnsLoading}
                  data-testid="button-export-txns-excel"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Excel {filteredTxns.length > 0 && `(${filteredTxns.length})`}
                </Button>
              </div>
            </div>
          </div>

          {txnsLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredTxns.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                No transactions found
              </CardContent>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left px-4 py-3 font-medium">Type</th>
                    <th className="text-left px-4 py-3 font-medium">Product</th>
                    <th className="text-left px-4 py-3 font-medium">Qty</th>
                    <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Warehouse</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Batch #</th>
                    <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Expiry</th>
                    <th className="text-left px-4 py-3 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredTxns.map(t => (
                    <tr
                      key={t.id}
                      className="hover:bg-muted/30"
                      data-testid={`txn-report-${t.id}`}
                    >
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full font-medium ${txnColors[t.transactionType] ?? ""}`}
                        >
                          {TRANSACTION_LABELS[t.transactionType]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{t.productName}</div>
                        <div className="text-xs text-muted-foreground">{t.productCode}</div>
                        {t.category && (
                          <div className="text-xs text-muted-foreground">{t.category}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {t.quantity} {t.unitName ?? ""}
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">
                        {t.warehouseName}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell font-mono text-xs text-muted-foreground">
                        {t.batchNumber ?? "—"}
                      </td>
                      <td className={`px-4 py-3 hidden lg:table-cell text-xs ${expiryColor(t.expiryDate)}`}>
                        {t.expiryDate
                          ? format(new Date(t.expiryDate + "T00:00:00"), "dd MMM yyyy")
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {format(new Date(t.createdAt), "MMM d, HH:mm")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── CHARTS TAB ───────────────────────────────────────── */}
        <TabsContent value="charts" className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Stock Levels (Top 20 products)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar
                    dataKey="stock"
                    fill="hsl(var(--primary))"
                    radius={[3, 3, 0, 0]}
                    name="Stock"
                  />
                  <Bar
                    dataKey="reorder"
                    fill="hsl(var(--destructive))"
                    radius={[3, 3, 0, 0]}
                    name="Reorder Level"
                    opacity={0.6}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
