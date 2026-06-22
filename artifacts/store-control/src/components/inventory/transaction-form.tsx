import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ProductPicker, type PickedProduct } from "./product-picker";
import { LocationPicker } from "./location-picker";
import { listProductUnits, fromBase, toBase } from "@/lib/product-units";
import { listProductBatches, listLocationBatches } from "@/lib/inventory";
import { listWarehouses } from "@/lib/warehouses";
import { performStockIn, performOutOrCount } from "@/lib/inventory-ops";
import { classifyExpiry, daysUntil } from "@/lib/fifo";
import { useAuth } from "@/lib/auth";
import type { TransactionType } from "@/lib/db";

type SupportedType = Extract<TransactionType, "stock_in" | "dispensing" | "disposal" | "inventory_count">;

interface Props {
  type: SupportedType;
  onSuccess?: () => void;
}

export function TransactionForm({ type, onSuccess }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [notes, setNotes] = useState("");
  const [batchNumber, setBatchNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [batchId, setBatchId] = useState("");

  const isDispenseType = type === "dispensing" || type === "disposal";

  useEffect(() => {
    setProduct(null); setWarehouseId(""); setSectionId("");
    setUnitId(""); setQuantity(""); setNotes("");
    setBatchNumber(""); setExpiryDate(""); setBatchId("");
  }, [type]);

  const units = useQuery({
    queryKey: ["product_units", product?.id],
    queryFn: () => listProductUnits(product!.id),
    enabled: !!product?.id,
  });

  useEffect(() => {
    const list = units.data ?? [];
    if (list.length && !list.find((u) => u.id === unitId)) {
      const base = list.find((u) => u.isBase) ?? list[0];
      setUnitId(base?.id ?? "");
    }
  }, [units.data, unitId]);

  const warehousesQuery = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
  });
  const warehouseMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const w of warehousesQuery.data ?? []) map.set(w.id, w.warehouseName);
    return map;
  }, [warehousesQuery.data]);

  const productBatches = useQuery({
    queryKey: ["product_batches", product?.id],
    queryFn: () => listProductBatches(product!.id),
    enabled: !!product?.id && isDispenseType,
  });

  const locationBatches = useQuery({
    queryKey: ["inv_batches", product?.id, warehouseId, sectionId || null],
    queryFn: () => listLocationBatches(product!.id, warehouseId, sectionId || null),
    enabled: !!product?.id && !!warehouseId && type === "inventory_count",
  });

  const batchList = isDispenseType
    ? (productBatches.data ?? [])
    : (locationBatches.data ?? []);

  useEffect(() => {
    if (!batchList.length) { setBatchId(""); return; }
    if (!batchList.find((b) => b.id === batchId)) {
      const first = batchList.find((b) => b.quantityBaseUnit > 0) ?? batchList[0];
      setBatchId(first?.id ?? "");
    }
  }, [batchList, batchId]);

  useEffect(() => {
    if (!isDispenseType || !batchId) return;
    const batch = (productBatches.data ?? []).find((b) => b.id === batchId);
    if (batch) {
      setWarehouseId(batch.warehouseId);
      setSectionId(batch.sectionId ?? "");
    }
  }, [batchId, productBatches.data, isDispenseType]);

  const selectedUnit = useMemo(() => (units.data ?? []).find((u) => u.id === unitId) ?? null, [units.data, unitId]);
  const selectedBatch = useMemo(() => batchList.find((b) => b.id === batchId) ?? null, [batchList, batchId]);

  const qtyNum = Number(quantity);
  const qtyBase = selectedUnit && qtyNum > 0 ? toBase(qtyNum, selectedUnit) : 0;
  const stockBase = selectedBatch ? selectedBatch.quantityBaseUnit : 0;
  const stockInUnit = selectedBatch && selectedUnit ? fromBase(stockBase, selectedUnit) : 0;
  const overStock = (type === "dispensing" || type === "disposal") && !!selectedBatch && qtyBase > stockBase;

  const expiryStatus = selectedBatch ? classifyExpiry(selectedBatch.expiryDate) : "no-expiry";
  const isExpired = expiryStatus === "expired";
  const isNearExpiry = expiryStatus === "near";
  const blockForExpiry = type === "dispensing" && isExpired;

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Select a product");
      if (!unitId) throw new Error("Select a unit");
      if (!(qtyNum > 0)) throw new Error("Quantity must be > 0");

      if (type === "stock_in") {
        if (!warehouseId) throw new Error("Select a warehouse");
        return performStockIn({
          productId: product.id,
          warehouseId,
          sectionId: sectionId || null,
          batchNumber: batchNumber.trim() || null,
          expiryDate: expiryDate || null,
          unitId,
          quantity: qtyNum,
          notes: notes.trim() || null,
          performedBy: user?.id ?? null,
        });
      }

      if (!batchId) throw new Error("Select a batch");
      if (!warehouseId) throw new Error("No warehouse resolved from batch");
      if (overStock) throw new Error("Quantity exceeds available stock");
      if (blockForExpiry) throw new Error("Cannot dispense an expired batch — use disposal instead");
      if (type === "dispensing" && isNearExpiry) {
        if (!confirm(`This batch expires in ${daysUntil(selectedBatch?.expiryDate ?? null)} days. Continue?`))
          throw new Error("Cancelled");
      }

      return performOutOrCount({
        type,
        productId: product.id,
        batchId,
        warehouseId,
        sectionId: sectionId || null,
        unitId,
        quantity: qtyNum,
        notes: notes.trim() || null,
        performedBy: user?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success(`${labelFor(type)} recorded`);
      qc.invalidateQueries({ queryKey: ["inv_batches"] });
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      qc.invalidateQueries({ queryKey: ["fifo_batches"] });
      qc.invalidateQueries({ queryKey: ["overview_kpis"] });
      setQuantity(""); setNotes(""); setBatchNumber(""); setExpiryDate(""); setBatchId("");
      onSuccess?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
      <div className="space-y-1.5">
        <Label>Product</Label>
        <ProductPicker value={product} onChange={(p) => { setProduct(p); setBatchId(""); setWarehouseId(""); setSectionId(""); }} />
      </div>

      {type === "stock_in" && (
        <LocationPicker
          warehouseId={warehouseId}
          sectionId={sectionId}
          onChange={({ warehouseId: w, sectionId: s }) => { setWarehouseId(w); setSectionId(s); }}
        />
      )}

      {type === "inventory_count" && (
        <LocationPicker
          warehouseId={warehouseId}
          sectionId={sectionId}
          onChange={({ warehouseId: w, sectionId: s }) => { setWarehouseId(w); setSectionId(s); }}
        />
      )}

      {type === "stock_in" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Batch number <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input placeholder="e.g. LOT-2026-001" value={batchNumber} onChange={(e) => setBatchNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Expiry date <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
        </div>
      )}

      {(isDispenseType || type === "inventory_count") && (
        <div className="space-y-1.5">
          <Label>Batch</Label>
          {isDispenseType && !product && (
            <p className="text-sm text-muted-foreground border rounded-md px-3 py-2 bg-muted/30">
              Select a product to see available batches
            </p>
          )}
          {isDispenseType && product && (productBatches.data ?? []).length === 0 && !productBatches.isLoading && (
            <p className="text-sm text-amber-600 dark:text-amber-400 border rounded-md px-3 py-2 bg-amber-50 dark:bg-amber-950/30">
              No stock found for this product. Record a Stock In first.
            </p>
          )}
          {isDispenseType && product && (productBatches.data ?? []).length > 0 && (
            <Select value={batchId || undefined} onValueChange={setBatchId}>
              <SelectTrigger>
                <SelectValue placeholder="Select batch…" />
              </SelectTrigger>
              <SelectContent>
                {(productBatches.data ?? []).map((b) => {
                  const whName = warehouseMap.get(b.warehouseId) ?? "Unknown warehouse";
                  const expLabel = b.expiryDate ? `exp ${b.expiryDate}` : "no expiry";
                  const status = classifyExpiry(b.expiryDate);
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-2">
                        <span>{b.batchNumber ?? "Auto-batch"}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className={status === "expired" ? "text-destructive" : status === "near" ? "text-amber-600" : ""}>
                          {expLabel}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span>{whName}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono">{b.quantityBaseUnit} in stock</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {type === "inventory_count" && (
            <Select value={batchId || undefined} onValueChange={setBatchId} disabled={!product || !warehouseId}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    !product || !warehouseId
                      ? "Pick product and warehouse first"
                      : (locationBatches.data ?? []).length
                      ? "Select batch…"
                      : "No batches at this location"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(locationBatches.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batchNumber ?? "Auto-batch"} ·{" "}
                    {b.expiryDate ? `exp ${b.expiryDate}` : "no expiry"} · stock {b.quantityBaseUnit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {isDispenseType && selectedBatch && warehouseId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded-md border bg-muted/20 px-3 py-2">
          <span className="font-medium text-foreground">Warehouse:</span>
          <span>{warehouseMap.get(warehouseId) ?? warehouseId}</span>
          {sectionId && <><span>·</span><span>Section auto-filled</span></>}
          <Badge variant="outline" className="ml-auto text-xs">Auto-resolved</Badge>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-1">
          <Label>Unit</Label>
          <Select value={unitId || undefined} onValueChange={setUnitId} disabled={!product}>
            <SelectTrigger><SelectValue placeholder={product ? "Select unit…" : "Pick product first"} /></SelectTrigger>
            <SelectContent>
              {(units.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.unitName}{u.isBase ? " (base)" : ""} · ×{u.factorToBase}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Quantity{type === "inventory_count" ? " (absolute on-hand)" : ""}</Label>
          <Input
            type="number" inputMode="decimal" step="any" min="0"
            value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0"
          />
          {selectedUnit && qtyNum > 0 && (
            <p className="text-xs text-muted-foreground">= {qtyBase} base unit{qtyBase === 1 ? "" : "s"}</p>
          )}
          {isDispenseType && selectedBatch && (
            <p className={`text-xs ${overStock ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Available: {stockBase} base{selectedUnit ? ` · ${stockInUnit.toFixed(2)} ${selectedUnit.unitName}` : ""}
              {overStock && " — exceeds available stock"}
            </p>
          )}
          {selectedBatch && isExpired && (
            <p className="text-xs text-destructive">⚠ Batch expired {Math.abs(daysUntil(selectedBatch.expiryDate) ?? 0)} days ago.</p>
          )}
          {selectedBatch && isNearExpiry && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Near expiry: {daysUntil(selectedBatch.expiryDate)} days remaining.
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending || overStock || blockForExpiry}>
          {submit.isPending ? "Saving…" : `Record ${labelFor(type)}`}
        </Button>
      </div>
    </form>
  );
}

function labelFor(t: SupportedType): string {
  switch (t) {
    case "stock_in": return "Stock In";
    case "dispensing": return "Dispensing";
    case "disposal": return "Disposal";
    case "inventory_count": return "Inventory Count";
  }
}
