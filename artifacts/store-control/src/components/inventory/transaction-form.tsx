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
import { Plus, Trash2 } from "lucide-react";

type SupportedType = Extract<TransactionType, "stock_in" | "dispensing" | "disposal" | "inventory_count">;

interface LineState {
  id: string;
  product: PickedProduct | null;
  warehouseId: string;
  sectionId: string;
  unitId: string;
  quantity: string;
  batchNumber: string;
  expiryDate: string;
  batchId: string;
}

function newLine(): LineState {
  return {
    id: Math.random().toString(36).slice(2),
    product: null,
    warehouseId: "",
    sectionId: "",
    unitId: "",
    quantity: "",
    batchNumber: "",
    expiryDate: "",
    batchId: "",
  };
}

interface Props {
  type: SupportedType;
  onSuccess?: () => void;
}

export function TransactionForm({ type, onSuccess }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [lines, setLines] = useState<LineState[]>([newLine()]);
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setLines([newLine()]);
    setNotes("");
  }, [type]);

  function updateLine(id: string, patch: Partial<LineState>) {
    setLines(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }

  function addLine() {
    setLines(prev => [...prev, newLine()]);
  }

  function removeLine(id: string) {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  const submit = useMutation({
    mutationFn: async () => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const label = `Line ${i + 1}`;
        if (!line.product) throw new Error(`${label}: Select a product`);
        if (!line.unitId) throw new Error(`${label}: Select a unit`);
        const qty = Number(line.quantity);
        if (!(qty > 0)) throw new Error(`${label}: Quantity must be > 0`);
        if (type === "stock_in" && !line.warehouseId) throw new Error(`${label}: Select a warehouse`);
        if (type !== "stock_in" && !line.batchId) throw new Error(`${label}: Select a batch`);
      }

      const results = [];
      for (const line of lines) {
        const qty = Number(line.quantity);
        if (type === "stock_in") {
          results.push(await performStockIn({
            productId: line.product!.id,
            warehouseId: line.warehouseId,
            sectionId: line.sectionId || null,
            batchNumber: line.batchNumber.trim() || null,
            expiryDate: line.expiryDate || null,
            unitId: line.unitId,
            quantity: qty,
            notes: notes.trim() || null,
            performedBy: user?.id ?? null,
          }));
        } else {
          results.push(await performOutOrCount({
            type,
            productId: line.product!.id,
            batchId: line.batchId,
            warehouseId: line.warehouseId,
            sectionId: line.sectionId || null,
            unitId: line.unitId,
            quantity: qty,
            notes: notes.trim() || null,
            performedBy: user?.id ?? null,
          }));
        }
      }
      return results;
    },
    onSuccess: () => {
      const n = lines.length;
      toast.success(`${labelFor(type)} recorded${n > 1 ? ` (${n} lines)` : ""}`);
      qc.invalidateQueries({ queryKey: ["inv_batches"] });
      qc.invalidateQueries({ queryKey: ["product_batches"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["kpis"] });
      qc.invalidateQueries({ queryKey: ["fifo_batches"] });
      qc.invalidateQueries({ queryKey: ["overview_kpis"] });
      setLines([newLine()]);
      setNotes("");
      onSuccess?.();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
      <div className="space-y-2">
        {lines.map((line, idx) => (
          <LineRow
            key={line.id}
            type={type}
            line={line}
            lineNumber={idx + 1}
            totalLines={lines.length}
            onUpdate={(patch) => updateLine(line.id, patch)}
            onRemove={() => removeLine(line.id)}
          />
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full border-dashed text-muted-foreground hover:text-foreground gap-1.5"
        onClick={addLine}
      >
        <Plus className="w-3.5 h-3.5" /> Add another line
      </Button>

      <div className="space-y-1.5 pt-1">
        <Label>Notes <span className="text-muted-foreground text-xs">(applies to all lines)</span></Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
      </div>

      <div className="flex items-center justify-between pt-1">
        <span className="text-xs text-muted-foreground">{lines.length} line{lines.length !== 1 ? "s" : ""}</span>
        <Button type="submit" disabled={submit.isPending}>
          {submit.isPending ? "Saving…" : `Record ${labelFor(type)}`}
        </Button>
      </div>
    </form>
  );
}

interface LineRowProps {
  type: SupportedType;
  line: LineState;
  lineNumber: number;
  totalLines: number;
  onUpdate: (patch: Partial<LineState>) => void;
  onRemove: () => void;
}

function LineRow({ type, line, lineNumber, totalLines, onUpdate, onRemove }: LineRowProps) {
  const isDispenseType = type === "dispensing" || type === "disposal";

  const units = useQuery({
    queryKey: ["product_units", line.product?.id],
    queryFn: () => listProductUnits(line.product!.id),
    enabled: !!line.product?.id,
  });

  useEffect(() => {
    const list = units.data ?? [];
    if (list.length && !list.find((u) => u.id === line.unitId)) {
      const base = list.find((u) => u.isBase) ?? list[0];
      onUpdate({ unitId: base?.id ?? "" });
    }
  }, [units.data]);

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
    queryKey: ["product_batches", line.product?.id],
    queryFn: () => listProductBatches(line.product!.id),
    enabled: !!line.product?.id && isDispenseType,
  });

  const locationBatches = useQuery({
    queryKey: ["inv_batches", line.product?.id, line.warehouseId, line.sectionId || null],
    queryFn: () => listLocationBatches(line.product!.id, line.warehouseId, line.sectionId || null),
    enabled: !!line.product?.id && !!line.warehouseId && type === "inventory_count",
  });

  const batchList = useMemo(
    () => isDispenseType ? (productBatches.data ?? []) : (locationBatches.data ?? []),
    [isDispenseType, productBatches.data, locationBatches.data],
  );

  useEffect(() => {
    if (!batchList.length) { onUpdate({ batchId: "" }); return; }
    if (!batchList.find((b) => b.id === line.batchId)) {
      const first = batchList.find((b) => b.quantityBaseUnit > 0) ?? batchList[0];
      onUpdate({ batchId: first?.id ?? "" });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchList]);

  useEffect(() => {
    if (!isDispenseType || !line.batchId) return;
    const batch = (productBatches.data ?? []).find((b) => b.id === line.batchId);
    if (batch) onUpdate({ warehouseId: batch.warehouseId, sectionId: batch.sectionId ?? "" });
  }, [line.batchId, productBatches.data]);

  const selectedUnit = useMemo(() => (units.data ?? []).find((u) => u.id === line.unitId) ?? null, [units.data, line.unitId]);
  const selectedBatch = useMemo(() => batchList.find((b) => b.id === line.batchId) ?? null, [batchList, line.batchId]);

  const qtyNum = Number(line.quantity);
  const qtyBase = selectedUnit && qtyNum > 0 ? toBase(qtyNum, selectedUnit) : 0;
  const stockBase = selectedBatch ? selectedBatch.quantityBaseUnit : 0;
  const stockInUnit = selectedBatch && selectedUnit ? fromBase(stockBase, selectedUnit) : 0;
  const overStock = (type === "dispensing" || type === "disposal") && !!selectedBatch && qtyBase > stockBase;
  const expiryStatus = selectedBatch ? classifyExpiry(selectedBatch.expiryDate) : "no-expiry";
  const isExpired = expiryStatus === "expired";
  const isNearExpiry = expiryStatus === "near";

  return (
    <div className="rounded-lg border bg-muted/20 p-3 space-y-3 relative">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Line {lineNumber}</span>
        {totalLines > 1 && (
          <button
            type="button"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5 rounded"
            aria-label="Remove line"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs">Product</Label>
        <ProductPicker
          value={line.product}
          onChange={(p) => onUpdate({ product: p, batchId: "", warehouseId: "", sectionId: "", unitId: "" })}
        />
      </div>

      {(type === "stock_in" || type === "inventory_count") && (
        <LocationPicker
          warehouseId={line.warehouseId}
          sectionId={line.sectionId}
          onChange={({ warehouseId: w, sectionId: s }) => onUpdate({ warehouseId: w, sectionId: s })}
        />
      )}

      {type === "stock_in" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Batch # <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              className="h-8 text-sm"
              placeholder="e.g. LOT-2026-001"
              value={line.batchNumber}
              onChange={(e) => onUpdate({ batchNumber: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Expiry <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              className="h-8 text-sm"
              type="date"
              value={line.expiryDate}
              onChange={(e) => onUpdate({ expiryDate: e.target.value })}
            />
          </div>
        </div>
      )}

      {(isDispenseType || type === "inventory_count") && (
        <div className="space-y-1.5">
          <Label className="text-xs">Batch</Label>
          {isDispenseType && !line.product && (
            <p className="text-xs text-muted-foreground border rounded px-2 py-1.5 bg-background">
              Select a product to see batches
            </p>
          )}
          {isDispenseType && line.product && (productBatches.data ?? []).length === 0 && !productBatches.isLoading && (
            <p className="text-xs text-amber-600 border rounded px-2 py-1.5 bg-amber-50 dark:bg-amber-950/30">
              No stock — record a Stock In first
            </p>
          )}
          {isDispenseType && line.product && (productBatches.data ?? []).length > 0 && (
            <Select value={line.batchId || undefined} onValueChange={(v) => onUpdate({ batchId: v })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select batch…" /></SelectTrigger>
              <SelectContent>
                {(productBatches.data ?? []).map((b) => {
                  const whName = warehouseMap.get(b.warehouseId) ?? "Unknown";
                  const expLabel = b.expiryDate ? `exp ${b.expiryDate}` : "no expiry";
                  const status = classifyExpiry(b.expiryDate);
                  return (
                    <SelectItem key={b.id} value={b.id}>
                      <span className="flex items-center gap-1.5 text-xs">
                        <span>{b.batchNumber ?? "Auto-batch"}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className={status === "expired" ? "text-destructive" : status === "near" ? "text-amber-600" : ""}>{expLabel}</span>
                        <span className="text-muted-foreground">·</span>
                        <span>{whName}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono">{b.quantityBaseUnit} on hand</span>
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
          {type === "inventory_count" && (
            <Select value={line.batchId || undefined} onValueChange={(v) => onUpdate({ batchId: v })} disabled={!line.product || !line.warehouseId}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={!line.product || !line.warehouseId ? "Pick product & warehouse first" : (locationBatches.data ?? []).length ? "Select batch…" : "No batches here"} />
              </SelectTrigger>
              <SelectContent>
                {(locationBatches.data ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batchNumber ?? "Auto-batch"} · {b.expiryDate ? `exp ${b.expiryDate}` : "no expiry"} · {b.quantityBaseUnit} on hand
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {isDispenseType && selectedBatch && line.warehouseId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground rounded border bg-background px-2 py-1.5">
          <span className="font-medium text-foreground">Warehouse:</span>
          <span>{warehouseMap.get(line.warehouseId) ?? line.warehouseId}</span>
          {line.sectionId && <><span>·</span><span>Section auto-filled</span></>}
          <Badge variant="outline" className="ml-auto text-xs py-0">Auto</Badge>
        </div>
      )}

      <div className="grid gap-2 grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Unit</Label>
          <Select value={line.unitId || undefined} onValueChange={(v) => onUpdate({ unitId: v })} disabled={!line.product}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder={line.product ? "Unit…" : "Product first"} /></SelectTrigger>
            <SelectContent>
              {(units.data ?? []).map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.unitName}{u.isBase ? " (base)" : ""} · ×{u.factorToBase}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label className="text-xs">Quantity{type === "inventory_count" ? " (on-hand)" : ""}</Label>
          <Input
            className="h-8 text-sm"
            type="number" inputMode="decimal" step="any" min="0"
            value={line.quantity}
            onChange={(e) => onUpdate({ quantity: e.target.value })}
            placeholder="0"
          />
          {selectedUnit && qtyNum > 0 && (
            <p className="text-xs text-muted-foreground">= {qtyBase} base unit{qtyBase === 1 ? "" : "s"}</p>
          )}
          {isDispenseType && selectedBatch && (
            <p className={`text-xs ${overStock ? "text-destructive font-medium" : "text-muted-foreground"}`}>
              Avail: {stockBase} base{selectedUnit ? ` · ${stockInUnit.toFixed(2)} ${selectedUnit.unitName}` : ""}
              {overStock && " — exceeds stock"}
            </p>
          )}
          {selectedBatch && isExpired && (
            <p className="text-xs text-destructive">⚠ Expired {Math.abs(daysUntil(selectedBatch.expiryDate) ?? 0)} days ago</p>
          )}
          {selectedBatch && isNearExpiry && (
            <p className="text-xs text-amber-600 dark:text-amber-400">Near expiry: {daysUntil(selectedBatch.expiryDate)} days left</p>
          )}
        </div>
      </div>
    </div>
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
