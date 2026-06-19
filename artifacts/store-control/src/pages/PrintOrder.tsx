import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProducts } from "@/lib/products";
import { listProductUnits } from "@/lib/product-units";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Printer, Plus, Trash2, Search, ClipboardEdit, X } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/db";

interface OrderItem {
  productId: string;
  productName: string;
  productCode: string;
  category: string | null;
  quantity: number;
  unitName: string;
  unitId: string;
  notes: string;
}

interface OrderHeader {
  title: string;
  orderNumber: string;
  notes: string;
  recipientName: string;
  recipientDept: string;
}

function ProductPickerDialog({
  open,
  onClose,
  onSelect,
  alreadySelected,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
  alreadySelected: string[];
}) {
  const [search, setSearch] = useState("");
  const { data: products = [] } = useQuery({ queryKey: ["products"], queryFn: () => listProducts() });

  const filtered = products.filter(p => {
    if (alreadySelected.includes(p.id)) return false;
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return p.productName.toLowerCase().includes(s) || p.productCode.toLowerCase().includes(s) || (p.category ?? "").toLowerCase().includes(s);
  });

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Product</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search products…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
        </div>
        <div className="overflow-y-auto flex-1 -mx-1 px-1 space-y-0.5">
          {filtered.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No products found</p>
          ) : filtered.map(p => (
            <button
              key={p.id}
              className="w-full text-left px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors group"
              onClick={() => { onSelect(p); onClose(); setSearch(""); }}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm group-hover:text-primary transition-colors">{p.productName}</span>
                {p.category && <Badge variant="secondary" className="text-xs ml-2">{p.category}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{p.productCode} · {p.baseUnit}</div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemUnitSelector({ productId, unitId, onChange }: { productId: string; unitId: string; onChange: (uid: string, uname: string) => void }) {
  const { data: units = [] } = useQuery({
    queryKey: ["product-units", productId],
    queryFn: () => listProductUnits(productId),
  });

  if (units.length <= 1) return <span className="text-sm text-muted-foreground px-2">{units[0]?.unitName ?? "unit"}</span>;

  return (
    <Select value={unitId} onValueChange={v => {
      const u = units.find(u => u.id === v);
      if (u) onChange(u.id, u.unitName);
    }}>
      <SelectTrigger className="w-32 h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {units.map(u => <SelectItem key={u.id} value={u.id}>{u.unitName}{u.isBase ? " (base)" : ""}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export default function PrintOrderPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<OrderItem[]>([]);
  const [header, setHeader] = useState<OrderHeader>({
    title: "Supply Request Order",
    orderNumber: `ORD-${Date.now().toString().slice(-6)}`,
    notes: "",
    recipientName: "",
    recipientDept: "",
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data: unitDefaults = {} as Record<string, { id: string; name: string }> } = useQuery({
    queryKey: ["unit-defaults", items.map(i => i.productId).join(",")],
    queryFn: async () => {
      const result: Record<string, { id: string; name: string }> = {};
      for (const item of items) {
        if (!result[item.productId]) {
          const units = await listProductUnits(item.productId);
          const base = units.find(u => u.isBase) ?? units[0];
          if (base) result[item.productId] = { id: base.id, name: base.unitName };
        }
      }
      return result;
    },
    enabled: items.length > 0,
  });

  async function addProduct(product: Product) {
    const units = await listProductUnits(product.id);
    const base = units.find(u => u.isBase) ?? units[0];
    setItems(prev => [...prev, {
      productId: product.id,
      productName: product.productName,
      productCode: product.productCode,
      category: product.category,
      quantity: 1,
      unitName: base?.unitName ?? product.baseUnit,
      unitId: base?.id ?? "",
      notes: "",
    }]);
  }

  function updateItem(idx: number, patch: Partial<OrderItem>) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function printOrder() {
    if (items.length === 0) { toast.error("Add at least one product"); return; }
    const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    const rows = items.map((it, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${it.productName}</strong><br><small style="color:#666">${it.productCode}${it.category ? ` · ${it.category}` : ""}</small></td>
        <td style="text-align:center;font-size:16px;font-weight:700">${it.quantity}</td>
        <td style="text-align:center">${it.unitName}</td>
        <td>${it.notes || ""}</td>
      </tr>`).join("");

    const win = window.open("", "_blank");
    if (!win) { toast.error("Pop-up blocked — allow pop-ups and try again"); return; }
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>${header.title}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; margin: 30px; }
  .header-block { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 2px solid #0c4a6e; padding-bottom: 12px; }
  .clinic-name { font-size: 16px; font-weight: 700; color: #0c4a6e; }
  .order-title { font-size: 20px; font-weight: 700; margin: 8px 0 4px; }
  .meta { font-size: 11px; color: #555; margin-bottom: 2px; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th { background: #0c4a6e; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; }
  td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  tr:nth-child(even) td { background: #f9fafb; }
  .notes-box { margin-top: 16px; padding: 10px; border: 1px solid #e5e7eb; border-radius: 4px; min-height: 48px; font-size: 11px; }
  .sig-row { display: flex; justify-content: space-between; margin-top: 48px; }
  .sig-box { text-align: center; min-width: 180px; }
  .sig-line { border-top: 1px solid #111; padding-top: 4px; margin-top: 40px; font-size: 11px; }
  @media print { @page { size: A4 portrait; margin: 15mm; } }
</style></head><body>
<div class="header-block">
  <div>
    <div class="clinic-name">AUC Clinic Inventory System</div>
    <div class="order-title">${header.title}</div>
    <div class="meta">Order No: <strong>${header.orderNumber}</strong></div>
    <div class="meta">Date: <strong>${dateStr}</strong></div>
    ${header.recipientName ? `<div class="meta">Recipient: <strong>${header.recipientName}</strong></div>` : ""}
    ${header.recipientDept ? `<div class="meta">Department: <strong>${header.recipientDept}</strong></div>` : ""}
  </div>
</div>
<table>
<thead><tr><th style="width:32px">#</th><th>Product</th><th style="width:70px;text-align:center">Qty</th><th style="width:80px;text-align:center">Unit</th><th>Notes / Specification</th></tr></thead>
<tbody>${rows}</tbody>
</table>
${header.notes ? `<div class="notes-box"><strong>Order Notes:</strong> ${header.notes}</div>` : ""}
<div class="sig-row">
  <div class="sig-box">
    <div style="font-size:11px;color:#555">Prepared by</div>
    <div class="sig-line">${user?.fullName ?? user?.username ?? ""}</div>
  </div>
  <div class="sig-box">
    <div style="font-size:11px;color:#555">Approved by</div>
    <div class="sig-line">&nbsp;</div>
  </div>
  <div class="sig-box">
    <div style="font-size:11px;color:#555">Received by</div>
    <div class="sig-line">&nbsp;</div>
  </div>
</div>
</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardEdit className="w-6 h-6 text-primary" /> Print Order
          </h1>
          <p className="text-sm text-muted-foreground">Create a customizable supply request order to print</p>
        </div>
        <Button onClick={printOrder} disabled={items.length === 0} className="gap-2">
          <Printer className="w-4 h-4" /> Print Order
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Order Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Order Title</Label>
              <Input value={header.title} onChange={e => setHeader(h => ({ ...h, title: e.target.value }))} placeholder="e.g. Supply Request Order" />
            </div>
            <div className="space-y-1">
              <Label>Order Number</Label>
              <Input value={header.orderNumber} onChange={e => setHeader(h => ({ ...h, orderNumber: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Recipient Name</Label>
              <Input value={header.recipientName} onChange={e => setHeader(h => ({ ...h, recipientName: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1">
              <Label>Department / Section</Label>
              <Input value={header.recipientDept} onChange={e => setHeader(h => ({ ...h, recipientDept: e.target.value }))} placeholder="Optional" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Order Notes</Label>
              <Textarea value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} rows={2} placeholder="General notes or instructions…" />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Products <span className="text-muted-foreground font-normal">({items.length})</span></h3>
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)} className="gap-1.5">
            <Plus className="w-4 h-4" /> Add Product
          </Button>
        </div>

        {items.length === 0 ? (
          <Card>
            <CardContent className="py-14 text-center">
              <ClipboardEdit className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground text-sm">No products added yet.</p>
              <Button variant="outline" size="sm" className="mt-3 gap-1.5" onClick={() => setPickerOpen(true)}>
                <Plus className="w-4 h-4" /> Add First Product
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium w-8">#</th>
                  <th className="text-left px-4 py-2.5 font-medium">Product</th>
                  <th className="text-left px-4 py-2.5 font-medium w-28">Quantity</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">Unit</th>
                  <th className="text-left px-4 py-2.5 font-medium">Notes / Specification</th>
                  <th className="px-3 py-2.5 w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{item.productName}</div>
                      <div className="text-xs text-muted-foreground font-mono">{item.productCode}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={e => updateItem(idx, { quantity: Math.max(1, Number(e.target.value)) })}
                        className="h-8 w-24 text-sm"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <ItemUnitSelector
                        productId={item.productId}
                        unitId={item.unitId}
                        onChange={(uid, uname) => updateItem(idx, { unitId: uid, unitName: uname })}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <Input
                        value={item.notes}
                        onChange={e => updateItem(idx, { notes: e.target.value })}
                        placeholder="e.g. colour, strength, form…"
                        className="h-8 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {items.length > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-3">
          <span>{items.length} product{items.length !== 1 ? "s" : ""} · Total qty: {items.reduce((s, i) => s + i.quantity, 0)}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setItems([])} className="gap-1.5 text-destructive hover:text-destructive">
              <X className="w-3.5 h-3.5" /> Clear All
            </Button>
            <Button size="sm" onClick={printOrder} className="gap-1.5">
              <Printer className="w-3.5 h-3.5" /> Print Order
            </Button>
          </div>
        </div>
      )}

      <ProductPickerDialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={addProduct}
        alreadySelected={items.map(i => i.productId)}
      />
    </div>
  );
}
