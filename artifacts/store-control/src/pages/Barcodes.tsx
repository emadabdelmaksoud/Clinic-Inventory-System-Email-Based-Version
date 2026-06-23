import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listProducts } from "@/lib/products";
import { listProductUnits } from "@/lib/product-units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { QrCode, Search, Printer } from "lucide-react";

function BarcodeDisplay({ value, label }: { value: string; label: string }) {
  if (!value) return null;
  const svg = generateBarcodeSvg(value);
  return (
    <div className="flex flex-col items-center gap-1 p-4 border rounded-lg bg-white print:break-inside-avoid">
      <div dangerouslySetInnerHTML={{ __html: svg }} />
      <p className="text-xs font-mono mt-1">{value}</p>
      <p className="text-xs text-muted-foreground text-center">{label}</p>
    </div>
  );
}

function generateBarcodeSvg(code: string): string {
  const chars = code.split("").map(c => c.charCodeAt(0));
  const barWidth = 2;
  const height = 60;
  let bars: { x: number; width: number; dark: boolean }[] = [];
  let x = 10;
  bars.push({ x, width: barWidth, dark: true }); x += barWidth;
  bars.push({ x, width: barWidth, dark: false }); x += barWidth;
  bars.push({ x, width: barWidth, dark: true }); x += barWidth * 2;
  for (const ch of chars) {
    const bits = ch.toString(2).padStart(7, "0");
    for (const bit of bits) {
      bars.push({ x, width: barWidth, dark: bit === "1" });
      x += barWidth;
    }
    x += barWidth;
  }
  bars.push({ x, width: barWidth, dark: true }); x += barWidth;
  bars.push({ x, width: barWidth, dark: false }); x += barWidth;
  bars.push({ x, width: barWidth, dark: true }); x += barWidth;
  const totalWidth = x + 10;
  const rects = bars.filter(b => b.dark).map(b => `<rect x="${b.x}" y="0" width="${b.width}" height="${height}" fill="black"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height + 10}"><rect width="${totalWidth}" height="${height + 10}" fill="white"/>${rects}</svg>`;
}

export default function BarcodesPage() {
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [customBarcode, setCustomBarcode] = useState("");
  const [customLabel, setCustomLabel] = useState("");

  const { data: products = [] } = useQuery({ queryKey: ["products", search], queryFn: () => listProducts(search) });
  const { data: units = [] } = useQuery({ queryKey: ["units", selectedProductId], queryFn: () => selectedProductId ? listProductUnits(selectedProductId) : Promise.resolve([]), enabled: !!selectedProductId });

  const selectedProduct = products.find(p => p.id === selectedProductId);
  const barcodes: Array<{ value: string; label: string }> = [];
  if (selectedProduct?.barcode) barcodes.push({ value: selectedProduct.barcode, label: selectedProduct.productName });
  for (const u of units) {
    if (u.barcode) barcodes.push({ value: u.barcode, label: `${selectedProduct?.productName ?? ""} — ${u.unitName}` });
  }
  if (customBarcode) barcodes.push({ value: customBarcode, label: customLabel || customBarcode });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><QrCode className="w-6 h-6" /> Barcodes</h1>
          <p className="text-sm text-muted-foreground">Generate and print barcodes</p>
        </div>
        {barcodes.length > 0 && (
          <Button variant="outline" onClick={() => window.print()} data-testid="button-print"><Printer className="w-4 h-4 mr-1" /> Print</Button>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div>
              <Label className="text-xs mb-1.5 block">Search Products</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" />
              </div>
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Select Product</Label>
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger data-testid="select-product"><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.productName} {p.barcode ? `(${p.barcode})` : ""}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs font-medium text-muted-foreground">Or generate a custom barcode</p>
            <div>
              <Label className="text-xs mb-1.5 block">Barcode Value</Label>
              <Input value={customBarcode} onChange={(e) => setCustomBarcode(e.target.value)} placeholder="Enter barcode..." data-testid="input-custom-barcode" />
            </div>
            <div>
              <Label className="text-xs mb-1.5 block">Label</Label>
              <Input value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="Optional label..." data-testid="input-custom-label" />
            </div>
          </CardContent>
        </Card>
      </div>

      {barcodes.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Select a product or enter a custom barcode to generate</CardContent></Card>
      ) : (
        <div className="flex flex-wrap gap-4 print:flex print:flex-wrap">
          {barcodes.map((b, i) => <BarcodeDisplay key={i} value={b.value} label={b.label} />)}
        </div>
      )}
    </div>
  );
}
