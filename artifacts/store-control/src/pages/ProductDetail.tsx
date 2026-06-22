import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getProduct } from "@/lib/products";
import { listProductUnits, createProductUnit, updateProductUnit, deleteProductUnit, productUnitSchema, type ProductUnitInput } from "@/lib/product-units";
import { getTotalStock } from "@/lib/inventory";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

function UnitForm({ productId, onClose, unit }: { productId: string; onClose: () => void; unit?: ProductUnitInput & { id?: string } }) {
  const qc = useQueryClient();
  const form = useForm<ProductUnitInput>({
    resolver: zodResolver(productUnitSchema),
    defaultValues: unit ?? { unitName: "", factorToBase: 1, isBase: false, sortOrder: 0, barcode: "" },
  });
  const isBase = form.watch("isBase");

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: ProductUnitInput) => {
      if (unit?.id) await updateProductUnit(unit.id, data);
      else await createProductUnit(productId, data);
    },
    onSuccess: () => {
      toast.success(unit?.id ? "Unit updated" : "Unit added");
      qc.invalidateQueries({ queryKey: ["units", productId] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutate(d))} className="space-y-4">
        <FormField control={form.control} name="unitName" render={({ field }) => (
          <FormItem><FormLabel>Unit Name *</FormLabel><FormControl><Input {...field} data-testid="input-unit-name" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="factorToBase" render={({ field }) => (
          <FormItem><FormLabel>Factor to Base</FormLabel><FormControl><Input {...field} type="number" step="any" min={0.0001} disabled={isBase} data-testid="input-factor" /></FormControl><FormMessage /><p className="text-xs text-muted-foreground">How many base units = 1 of this unit</p></FormItem>
        )} />
        <FormField control={form.control} name="isBase" render={({ field }) => (
          <FormItem className="flex items-center gap-3">
            <FormControl><Switch checked={field.value} onCheckedChange={(v) => { field.onChange(v); if (v) form.setValue("factorToBase", 1); }} data-testid="switch-is-base" /></FormControl>
            <FormLabel className="!mt-0">Is base unit</FormLabel>
          </FormItem>
        )} />
        <FormField control={form.control} name="barcode" render={({ field }) => (
          <FormItem><FormLabel>Barcode</FormLabel><FormControl><Input {...field} data-testid="input-unit-barcode" /></FormControl><FormMessage /></FormItem>
        )} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-unit">{isPending ? "Saving..." : unit?.id ? "Update" : "Add Unit"}</Button>
        </div>
      </form>
    </Form>
  );
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showUnitForm, setShowUnitForm] = useState(false);
  const [editUnit, setEditUnit] = useState<(ProductUnitInput & { id: string }) | null>(null);
  const [deleteUnitId, setDeleteUnitId] = useState<string | null>(null);

  const { data: product, isLoading } = useQuery({ queryKey: ["product", id], queryFn: () => getProduct(id!) });
  const { data: units = [] } = useQuery({ queryKey: ["units", id], queryFn: () => listProductUnits(id!) });
  const { data: totalStock = 0 } = useQuery({ queryKey: ["stock", id], queryFn: () => getTotalStock(id!) });

  const { mutate: doDeleteUnit } = useMutation({
    mutationFn: (uid: string) => deleteProductUnit(uid),
    onSuccess: () => { toast.success("Unit deleted"); qc.invalidateQueries({ queryKey: ["units", id] }); setDeleteUnitId(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  const canEditProducts = can(user?.role, "products", "edit");

  if (isLoading) return <div className="h-48 bg-muted animate-pulse rounded-lg" />;
  if (!product) return <div className="text-center py-12 text-muted-foreground">Product not found</div>;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/products"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div>
          <h1 className="text-xl font-bold">{product.productName}</h1>
          <p className="text-sm text-muted-foreground font-mono">{product.productCode}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Product Details</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {[
              ["Barcode", product.barcode],
              ["Category", product.category],
              ["Manufacturer", product.manufacturer],
              ["Base Unit", product.baseUnit],
              ["Reorder Level", product.reorderLevel],
              ["Notes", product.notes],
            ].map(([label, value]) => value != null && (
              <div key={String(label)} className="flex justify-between">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-medium">{String(value)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Stock Overview</CardTitle></CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{totalStock.toLocaleString()}</div>
            <p className="text-sm text-muted-foreground">{product.baseUnit}s on hand</p>
            {product.reorderLevel > 0 && (
              <div className="mt-3">
                <div className="flex justify-between text-xs mb-1">
                  <span>Current</span>
                  <span>Reorder: {product.reorderLevel}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${totalStock < product.reorderLevel ? "bg-red-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(100, (totalStock / Math.max(product.reorderLevel * 2, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm">Units of Measure</CardTitle>
          {canEditProducts && (
            <Button size="sm" onClick={() => setShowUnitForm(true)} data-testid="button-add-unit">
              <Plus className="w-3.5 h-3.5 mr-1" /> Add Unit
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {units.length === 0 ? (
            <p className="text-sm text-muted-foreground">No units defined. Add a base unit first.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b bg-muted/50">
                  <th className="text-left px-3 py-2">Unit</th>
                  <th className="text-left px-3 py-2">Factor to Base</th>
                  <th className="text-left px-3 py-2">Equivalence</th>
                  <th className="text-left px-3 py-2">Barcode</th>
                  <th className="px-3 py-2" />
                </tr></thead>
                <tbody className="divide-y">
                  {units.map(u => (
                    <tr key={u.id} className="hover:bg-muted/30" data-testid={`unit-row-${u.id}`}>
                      <td className="px-3 py-2.5 font-medium">
                        <div className="flex items-center gap-2">
                          {u.unitName}
                          {u.isBase && <Badge variant="secondary" className="text-xs">base</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{u.factorToBase}×</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs">
                        {u.isBase ? "—" : `1 ${u.unitName} = ${u.factorToBase} ${product.baseUnit}`}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{u.barcode ?? "—"}</td>
                      <td className="px-3 py-2.5">
                        {canEditProducts && !u.isBase && (
                          <div className="flex gap-1 justify-end">
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditUnit({ id: u.id, unitName: u.unitName, factorToBase: u.factorToBase, isBase: u.isBase, barcode: u.barcode ?? "", sortOrder: u.sortOrder })}><Edit className="w-3 h-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteUnitId(u.id)}><Trash2 className="w-3 h-3" /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showUnitForm || !!editUnit} onOpenChange={(o) => { if (!o) { setShowUnitForm(false); setEditUnit(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editUnit ? "Edit Unit" : "Add Unit"}</DialogTitle></DialogHeader>
          <UnitForm productId={id!} onClose={() => { setShowUnitForm(false); setEditUnit(null); }} unit={editUnit ?? undefined} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteUnitId} onOpenChange={(o) => !o && setDeleteUnitId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete unit?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteUnitId && doDeleteUnit(deleteUnitId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
