import { useQuery } from "@tanstack/react-query";
import { getOverviewKpis } from "@/lib/reports";
import { listExpiredBatches, listNearExpiryBatches, listLowStockProducts } from "@/lib/fifo";
import { listTransactions, TRANSACTION_LABELS } from "@/lib/inventory";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import { Package, Warehouse, AlertTriangle, Activity, TrendingDown, Clock, Boxes, Layers, TrendingUp } from "lucide-react";
import { format } from "date-fns";

function KpiCard({
  title,
  value,
  icon: Icon,
  tint,
  ring,
  hint,
}: {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  ring: string;
  hint: string;
}) {
  return (
    <Card className="relative overflow-hidden border-border/60 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5">
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${tint} opacity-60`} />
      <CardContent className="relative p-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{title}</p>
            <div className="text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> {hint}
            </p>
          </div>
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-background/60 ring-1 ${ring} backdrop-blur-sm`}>
            <Icon className={`h-5 w-5 ${tint.split(" ").find((c) => c.startsWith("text-")) ?? ""}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const txnTypeColor: Record<string, string> = {
  stock_in: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  dispensing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  transfer_in: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  transfer_out: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  disposal: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  adjustment: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
  inventory_count: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
};

export default function DashboardPage() {
  const { data: kpis } = useQuery({ queryKey: ["overview_kpis"], queryFn: getOverviewKpis });

  const { data: expiredBatches = [] } = useQuery({ queryKey: ["alerts_expired"], queryFn: listExpiredBatches });
  const { data: nearBatches = [] } = useQuery({ queryKey: ["alerts_near", 90], queryFn: () => listNearExpiryBatches(90) });
  const { data: lowStock = [] } = useQuery({ queryKey: ["alerts_low"], queryFn: listLowStockProducts });

  const { data: recentTxns = [] } = useQuery({
    queryKey: ["recent_txns"],
    queryFn: async () => {
      const txns = await listTransactions({ limit: 10 });
      const [products, warehouses] = await Promise.all([db.products.toArray(), db.warehouses.toArray()]);
      const pm = new Map(products.map(p => [p.id, p]));
      const wm = new Map(warehouses.map(w => [w.id, w]));
      return txns.map(t => ({
        ...t,
        productName: pm.get(t.productId)?.productName ?? "Unknown",
        warehouseName: wm.get(t.warehouseId)?.warehouseName ?? "Unknown",
      }));
    },
  });

  const { data: productMap } = useQuery({
    queryKey: ["products_map"],
    queryFn: async () => {
      const products = await db.products.toArray();
      return new Map(products.map(p => [p.id, p]));
    },
  });

  const { data: warehouseMap } = useQuery({
    queryKey: ["warehouses_map"],
    queryFn: async () => {
      const warehouses = await db.warehouses.toArray();
      return new Map(warehouses.map(w => [w.id, w]));
    },
  });

  return (
    <div className="space-y-6 max-w-7xl">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Inventory overview and alerts</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          title="Total Products"
          value={kpis?.totalProducts ?? 0}
          icon={Package}
          tint="from-sky-500/15 to-sky-500/5 text-sky-600 dark:text-sky-400"
          ring="ring-sky-500/20"
          hint="Catalog SKUs"
        />
        <KpiCard
          title="Active Warehouses"
          value={kpis?.totalWarehouses ?? 0}
          icon={Warehouse}
          tint="from-emerald-500/15 to-emerald-500/5 text-emerald-600 dark:text-emerald-400"
          ring="ring-emerald-500/20"
          hint="Operational sites"
        />
        <KpiCard
          title="Active Batches"
          value={kpis?.totalBatches ?? 0}
          icon={Layers}
          tint="from-violet-500/15 to-violet-500/5 text-violet-600 dark:text-violet-400"
          ring="ring-violet-500/20"
          hint="With stock on hand"
        />
        <KpiCard
          title="Total Stock"
          value={Math.round(kpis?.totalStockBaseUnits ?? 0).toLocaleString()}
          icon={Boxes}
          tint="from-amber-500/15 to-amber-500/5 text-amber-600 dark:text-amber-400"
          ring="ring-amber-500/20"
          hint="Base units across all warehouses"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-4 h-4" /> Expired Stock ({expiredBatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {expiredBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No expired stock 🎉</p>
            ) : (
              <div className="space-y-2">
                {expiredBatches.slice(0, 5).map(b => (
                  <div key={b.id} className="flex justify-between text-sm gap-2">
                    <span className="truncate text-foreground">{productMap?.get(b.productId)?.productName ?? b.productId.slice(0, 8)}</span>
                    <span className="text-destructive text-xs flex-shrink-0">{b.expiryDate}</span>
                  </div>
                ))}
                {expiredBatches.length > 5 && <p className="text-xs text-muted-foreground">+{expiredBatches.length - 5} more</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
              <Clock className="w-4 h-4" /> Near Expiry ({nearBatches.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nearBatches.length === 0 ? (
              <p className="text-sm text-muted-foreground">No near-expiry items</p>
            ) : (
              <div className="space-y-2">
                {nearBatches.slice(0, 5).map(b => (
                  <div key={b.id} className="flex justify-between text-sm gap-2">
                    <span className="truncate text-foreground">{productMap?.get(b.productId)?.productName ?? b.productId.slice(0, 8)}</span>
                    <span className="text-amber-600 text-xs flex-shrink-0">{b.expiryDate}</span>
                  </div>
                ))}
                {nearBatches.length > 5 && <p className="text-xs text-muted-foreground">+{nearBatches.length - 5} more</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2 text-orange-600 dark:text-orange-400">
              <TrendingDown className="w-4 h-4" /> Low Stock ({lowStock.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <p className="text-sm text-muted-foreground">All products adequately stocked</p>
            ) : (
              <div className="space-y-2">
                {lowStock.slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between text-sm gap-2">
                    <Link href={`/products/${p.id}`} className="text-foreground truncate hover:text-primary transition-colors">
                      {p.productName}
                    </Link>
                    <span className="text-orange-600 text-xs flex-shrink-0 font-mono">{p.onHandBase}/{p.reorderLevel}</span>
                  </div>
                ))}
                {lowStock.length > 5 && <p className="text-xs text-muted-foreground">+{lowStock.length - 5} more</p>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentTxns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No transactions yet</p>
          ) : (
            <div className="divide-y">
              {recentTxns.map(t => (
                <div key={t.id} className="flex items-center gap-3 py-2.5" data-testid={`txn-row-${t.id}`}>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${txnTypeColor[t.transactionType] ?? "bg-gray-100 text-gray-700"}`}>
                    {TRANSACTION_LABELS[t.transactionType]}
                  </span>
                  <span className="text-sm font-medium truncate">{t.productName}</span>
                  <span className="text-xs text-muted-foreground flex-shrink-0">
                    {t.warehouseName}
                  </span>
                  <span className="text-xs text-muted-foreground flex-shrink-0 ml-auto whitespace-nowrap">
                    {format(new Date(t.createdAt), "MMM d, HH:mm")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
