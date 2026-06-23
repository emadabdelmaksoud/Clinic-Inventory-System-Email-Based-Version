import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProductPicker, type PickedProduct } from "./product-picker";
import { LocationPicker } from "./location-picker";
import { listProductUnits, toBase, fromBase } from "@/lib/product-units";
import { listLocationBatches } from "@/lib/inventory";
import { performTransfer } from "@/lib/inventory-ops";
import { useAuth } from "@/lib/auth";

export function TransferForm({ onSuccess }: { onSuccess?: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [product, setProduct] = useState<PickedProduct | null>(null);
  const [srcW, setSrcW] = useState("");
  const [srcS, setSrcS] = useState("");
  const [dstW, setDstW] = useState("");
  const [dstS, setDstS] = useState("");
  const [unitId, setUnitId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [srcBatchId, setSrcBatchId] = useState("");
  const [destBatchNumber, setDestBatchNumber] = useState("");
  const [destExpiry, setDestExpiry] = useState("");
  const [notes, setNotes] = useState("");

  const units = useQuery({
    queryKey: ["product_units", product?.id],
    queryFn: () => listProductUnits(product!.id),
    enabled: !!product?.id,
  });

  const srcBatches = useQuery({
    queryKey: ["inv_batches", product?.id, srcW, srcS || null],
    queryFn: () => listLocationBatches(product!.id, srcW, srcS || null),
    enabled: !!product?.id && !!srcW,
  });

  useEffect(() => {
    const list = units.data ?? [];
    if (list.length && !list.find((u) => u.id === unitId)) {
      setUnitId((list.find((u) => u.isBase) ?? list[0])?.id ?? "");
    }
  }, [units.data, unitId]);

  useEffect(() => {
    const list = srcBatches.data ?? [];
    if (list.length && !list.find((b) => b.id === srcBatchId)) {
      const first = list.find((b) => b.quantityBaseUnit > 0) ?? list[0];
      setSrcBatchId(first?.id ?? "");
      if (first) { setDestBatchNumber(first.batchNumber ?? ""); setDestExpiry(first.expiryDate ?? ""); }
    }
  }, [srcBatches.data, srcBatchId]);

  const selectedUnit = useMemo(() => (units.data ?? []).find((u) => u.id === unitId) ?? null, [units.data, unitId]);
  const selectedBatch = useMemo(() => (srcBatches.data ?? []).find((b) => b.id === srcBatchId) ?? null, [srcBatches.data, srcBatchId]);

  const qtyNum = Number(quantity);
  const qtyBase = selectedUnit && qtyNum > 0 ? toBase(qtyNum, selectedUnit) : 0;
  const stockBase = selectedBatch ? selectedBatch.quantityBaseUnit : 0;
  const overStock = !!selectedBatch && qtyBase > stockBase;
  const sameLocation = srcW === dstW && (srcS || null) === (dstS || null);

  const submit = useMutation({
    mutationFn: async () => {
      if (!product) throw new Error("Select a product");
      if (!srcW || !dstW) throw new Error("Select source and destination warehouses");
      if (!srcBatchId) throw new Error("Select source batch");
      if (!unitId) throw new Error("Select a unit");
      if (!(qtyNum > 0)) throw new Error("Quantity must be > 0");
      if (sameLocation) throw new Error("Source and destination must differ");
      if (overStock) throw new Error("Quantity exceeds available stock");

      return performTransfer({
        productId: product.id,
        sourceBatchId: srcBatchId,
        sourceWarehouseId: srcW,
        sourceSectionId: srcS || null,
        destWarehouseId: dstW,
        destSectionId: dstS || null,
        destBatchNumber: destBatchNumber.trim() || null,
        destExpiryDate: destExpiry || null,
        unitId,
        quantity: qtyNum,
        notes: notes.trim() || null,
        performedBy: user?.id ?? null,
      });
    },
    onSuccess: () => {
      toast.success("Transfer recorded");
      qc.invalidateQueries({ queryKey: ["inv_batches"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      qc.invalidateQueries({ queryKey: ["fifo_batches"] });
      qc.invalidateQueries({ queryKey: ["overview_kpis"] });
      setQuantity(""); setNotes("");
      onSuccess?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
      <div className="space-y-1.5">
        <Label>Product</Label>
        <ProductPicker value={product} onChange={setProduct} />
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Source</div>
        <LocationPicker
          warehouseId={srcW} sectionId={srcS}
          onChange={({ warehouseId, sectionId }) => { setSrcW(warehouseId); setSrcS(sectionId); }}
          warehouseLabel="Source warehouse" sectionLabel="Source section"
        />
        <div className="space-y-1.5">
          <Label>Source batch</Label>
          <Select value={srcBatchId || undefined} onValueChange={setSrcBatchId} disabled={!product || !srcW}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !product || !srcW ? "Pick product and source warehouse"
                  : (srcBatches.data ?? []).length ? "Select batch…" : "No batches at this location"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {(srcBatches.data ?? []).map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.batchNumber ?? "—"} · {b.expiryDate ? `exp ${b.expiryDate}` : "no expiry"} · stock {b.quantityBaseUnit}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Destination</div>
        <LocationPicker
          warehouseId={dstW} sectionId={dstS}
          onChange={({ warehouseId, sectionId }) => { setDstW(warehouseId); setDstS(sectionId); }}
          warehouseLabel="Destination warehouse" sectionLabel="Destination section"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Dest. batch number</Label>
            <Input value={destBatchNumber} onChange={(e) => setDestBatchNumber(e.target.value)} placeholder="Defaults to source batch #" />
          </div>
          <div className="space-y-1.5">
            <Label>Dest. expiry date</Label>
            <Input type="date" value={destExpiry} onChange={(e) => setDestExpiry(e.target.value)} />
          </div>
        </div>
      </div>

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
          <Label>Quantity</Label>
          <Input
            type="number" inputMode="decimal" step="any" min="0"
            value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="0"
          />
          {selectedBatch && selectedUnit && (
            <p className={`text-xs ${overStock ? "text-destructive" : "text-muted-foreground"}`}>
              Available: {stockBase} base · {fromBase(stockBase, selectedUnit).toFixed(2)} {selectedUnit.unitName}
            </p>
          )}
          {sameLocation && srcW && (
            <p className="text-xs text-destructive">Source and destination must differ.</p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={submit.isPending || overStock || sameLocation}>
          {submit.isPending ? "Saving…" : "Record Transfer"}
        </Button>
      </div>
    </form>
  );
}
