import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listTransactions, TRANSACTION_LABELS } from "@/lib/inventory";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowRightLeft, Minus, Plus, RefreshCw, Zap, Package } from "lucide-react";
import { format } from "date-fns";
import { TransactionForm } from "@/components/inventory/transaction-form";
import { FifoDispenseForm } from "@/components/inventory/fifo-dispense-form";
import { TransferForm } from "@/components/inventory/transfer-form";
import type { TransactionType } from "@/lib/db";

const txnTone: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  stock_in: "default",
  transfer_in: "default",
  inventory_count: "outline",
  adjustment: "outline",
  dispensing: "secondary",
  transfer_out: "secondary",
  disposal: "destructive",
};

export default function InventoryPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formTab, setFormTab] = useState("stock_in");
  const [filterType, setFilterType] = useState<string>("all");

  const { data: txns = [], isLoading } = useQuery({
    queryKey: ["transactions", filterType],
    queryFn: async () => {
      const raw = await listTransactions({
        limit: 300,
        transactionType: filterType === "all" ? undefined : filterType as TransactionType,
      });
      const [products, warehouses, units, users] = await Promise.all([
        db.products.toArray(),
        db.warehouses.toArray(),
        db.productUnits.toArray(),
        db.users.toArray(),
      ]);
      const pm = new Map(products.map(p => [p.id, p]));
      const wm = new Map(warehouses.map(w => [w.id, w]));
      const um = new Map(units.map(u => [u.id, u]));
      const usm = new Map(users.map(u => [u.id, u]));
      return raw.map(t => ({
        ...t,
        productName: pm.get(t.productId)?.productName ?? "Unknown",
        productCode: pm.get(t.productId)?.productCode ?? "",
        warehouseName: wm.get(t.warehouseId)?.warehouseName ?? "Unknown",
        unitName: um.get(t.unitId)?.unitName ?? "",
        performedByName: t.performedBy ? (usm.get(t.performedBy)?.fullName ?? null) : null,
      }));
    },
  });

  const canCreate = can(user?.role, "inventory", "create");

  function handleFormSuccess() {
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ["transactions"] });
  }

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> Inventory</h1>
          <p className="text-sm text-muted-foreground">Transaction ledger · {txns.length} records</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} data-testid="button-add-txn">
            <Plus className="w-4 h-4 mr-1" /> New Transaction
          </Button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {(Object.keys(TRANSACTION_LABELS) as TransactionType[]).map(t => (
              <SelectItem key={t} value={t}>{TRANSACTION_LABELS[t]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["transactions"] })}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : txns.length === 0 ? (
        <Card><CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No transactions found.</p>
          {canCreate && <Button className="mt-4" onClick={() => setShowForm(true)}>Record first transaction</Button>}
        </CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Product</th>
              <th className="text-left px-4 py-3 font-medium">Qty</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Warehouse</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Notes</th>
              <th className="text-left px-4 py-3 font-medium">Date</th>
            </tr></thead>
            <tbody className="divide-y">
              {txns.map(t => (
                <tr key={t.id} className="hover:bg-muted/30" data-testid={`txn-row-${t.id}`}>
                  <td className="px-4 py-3">
                    <Badge variant={txnTone[t.transactionType] ?? "outline"}>
                      {TRANSACTION_LABELS[t.transactionType]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">{t.productName}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.productCode}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-sm">{t.quantity} {t.unitName}</td>
                  <td className="px-4 py-3 hidden md:table-cell text-muted-foreground">{t.warehouseName}</td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground text-xs max-w-xs truncate">{t.notes ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs whitespace-nowrap">
                    {format(new Date(t.createdAt), "MMM d, HH:mm")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => !o && setShowForm(false)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Transaction</DialogTitle></DialogHeader>
          <Tabs value={formTab} onValueChange={setFormTab}>
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="stock_in" className="gap-1 text-xs">
                <Plus className="h-3 w-3" /> Stock In
              </TabsTrigger>
              <TabsTrigger value="dispensing" className="gap-1 text-xs">
                <Minus className="h-3 w-3" /> Dispense
              </TabsTrigger>
              <TabsTrigger value="fifo" className="gap-1 text-xs">
                <Zap className="h-3 w-3" /> FIFO
              </TabsTrigger>
              <TabsTrigger value="transfer" className="gap-1 text-xs">
                <ArrowRightLeft className="h-3 w-3" /> Transfer
              </TabsTrigger>
              <TabsTrigger value="disposal" className="gap-1 text-xs">
                Disposal
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock_in" className="mt-4">
              <TransactionForm type="stock_in" onSuccess={handleFormSuccess} />
            </TabsContent>
            <TabsContent value="dispensing" className="mt-4">
              <TransactionForm type="dispensing" onSuccess={handleFormSuccess} />
            </TabsContent>
            <TabsContent value="fifo" className="mt-4">
              <FifoDispenseForm onSuccess={handleFormSuccess} />
            </TabsContent>
            <TabsContent value="transfer" className="mt-4">
              <TransferForm onSuccess={handleFormSuccess} />
            </TabsContent>
            <TabsContent value="disposal" className="mt-4">
              <TransactionForm type="disposal" onSuccess={handleFormSuccess} />
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
