import { useState } from "react";
import { useAuth } from "@/lib/auth";
import {
  exportProductsExcel, exportInventoryExcel,
  importProductsFromExcel, importStockInFromExcel,
  downloadStockImportTemplate,
} from "@/lib/backup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileUp, Download, Upload, FileSpreadsheet, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

interface ImportResult {
  imported: number;
  errors: string[];
}

export default function ImportExportPage() {
  const { user } = useAuth();
  const [importingProducts, setImportingProducts] = useState(false);
  const [importingStock, setImportingStock] = useState(false);
  const [stockResult, setStockResult] = useState<ImportResult | null>(null);
  const [productsResult, setProductsResult] = useState<ImportResult | null>(null);

  async function handleImportProducts(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingProducts(true);
    setProductsResult(null);
    try {
      const result = await importProductsFromExcel(file);
      setProductsResult(result);
      if (result.imported > 0) toast.success(`Imported ${result.imported} product${result.imported !== 1 ? "s" : ""}`);
      if (result.errors.length > 0) toast.warning(`${result.errors.length} row(s) skipped — see details below`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    setImportingProducts(false);
    e.target.value = "";
  }

  async function handleImportStock(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingStock(true);
    setStockResult(null);
    try {
      const result = await importStockInFromExcel(file, user?.id ?? null);
      setStockResult(result);
      if (result.imported > 0) toast.success(`Loaded ${result.imported} stock batch${result.imported !== 1 ? "es" : ""}`);
      if (result.errors.length > 0) toast.warning(`${result.errors.length} row(s) skipped — see details below`);
      if (result.imported === 0 && result.errors.length === 0) toast.info("No rows found in the file");
    } catch (err) {
      toast.error((err as Error).message);
    }
    setImportingStock(false);
    e.target.value = "";
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FileUp className="w-6 h-6" /> Import / Export</h1>
        <p className="text-sm text-muted-foreground">Move data in and out using Excel files</p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {/* Products */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Products</CardTitle>
            <CardDescription>Export product catalog or import from Excel.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full" onClick={() => exportProductsExcel().catch(e => toast.error(e.message))} data-testid="button-export-products">
              <Download className="w-4 h-4 mr-1.5" /> Export Products
            </Button>
            <label className="block w-full">
              <input type="file" accept=".xlsx,.xls" onChange={handleImportProducts} className="hidden" data-testid="input-import-products" />
              <Button asChild variant="outline" disabled={importingProducts} className="w-full cursor-pointer" data-testid="button-import-products">
                <span><Upload className="w-4 h-4 mr-1.5" />{importingProducts ? "Importing..." : "Import Products"}</span>
              </Button>
            </label>
            {productsResult && <ImportResultBadge result={productsResult} />}
          </CardContent>
        </Card>

        {/* Inventory Export */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><FileSpreadsheet className="w-4 h-4" /> Inventory Snapshot</CardTitle>
            <CardDescription>Export current stock batches as Excel.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => exportInventoryExcel().catch(e => toast.error(e.message))} data-testid="button-export-inventory">
              <Download className="w-4 h-4 mr-1.5" /> Export Inventory
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Bulk Stock Import */}
      <Card className="border-primary/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" /> Bulk Stock-In (Opening Stock)
          </CardTitle>
          <CardDescription>
            Load opening stock or bulk receive items from an Excel file. Each row creates a <strong>Stock In</strong> transaction.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => downloadStockImportTemplate()} data-testid="button-download-template">
              <Download className="w-4 h-4 mr-1.5" /> Download Template
            </Button>
            <label className="flex-1">
              <input type="file" accept=".xlsx,.xls" onChange={handleImportStock} className="hidden" data-testid="input-import-stock" />
              <Button asChild disabled={importingStock} className="w-full cursor-pointer" data-testid="button-import-stock">
                <span><Upload className="w-4 h-4 mr-1.5" />{importingStock ? "Importing..." : "Import Stock"}</span>
              </Button>
            </label>
          </div>

          {stockResult && <ImportResultBadge result={stockResult} label="batch" />}

          <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-3 space-y-1">
            <p className="font-medium text-foreground">Required columns:</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
              <span><code className="bg-muted px-1 rounded">Product Code</code> or <code className="bg-muted px-1 rounded">Product Name</code></span>
              <span><code className="bg-muted px-1 rounded">Warehouse</code> (name)</span>
              <span><code className="bg-muted px-1 rounded">Quantity</code> (number)</span>
              <span><code className="bg-muted px-1 rounded">Unit</code> (optional)</span>
              <span><code className="bg-muted px-1 rounded">Batch Number</code> (optional)</span>
              <span><code className="bg-muted px-1 rounded">Expiry Date (YYYY-MM-DD)</code></span>
            </div>
            <p className="mt-1 text-muted-foreground">Products and warehouses must already exist in the system before importing stock.</p>
          </div>
        </CardContent>
      </Card>

      {/* Products format hint */}
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Products Import Format</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Products Excel file must have these columns:</p>
          <ul className="list-disc list-inside space-y-0.5 ml-2">
            <li><code className="text-xs bg-muted px-1 rounded">Product Name</code> (required)</li>
            <li><code className="text-xs bg-muted px-1 rounded">Product Code</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Barcode</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Category</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Manufacturer</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Base Unit</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Reorder Level</code></li>
            <li><code className="text-xs bg-muted px-1 rounded">Notes</code></li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}

function ImportResultBadge({ result, label = "item" }: { result: ImportResult; label?: string }) {
  return (
    <div className="space-y-1.5">
      {result.imported > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2.5 py-1.5">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          {result.imported} {label}{result.imported !== 1 ? "s" : ""} imported successfully
        </div>
      )}
      {result.errors.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2.5 py-1.5 space-y-0.5">
          <div className="flex items-center gap-1.5 font-medium">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {result.errors.length} row{result.errors.length !== 1 ? "s" : ""} skipped:
          </div>
          <ul className="ml-5 list-disc space-y-0.5">
            {result.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
            {result.errors.length > 5 && <li>…and {result.errors.length - 5} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
