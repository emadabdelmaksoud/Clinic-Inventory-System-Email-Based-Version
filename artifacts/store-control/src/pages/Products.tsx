import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { listProducts, deleteProduct, createProduct, updateProduct, type ProductInput, productSchema, getCategories } from "@/lib/products";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Search, Trash2, Edit, Eye, Package } from "lucide-react";
import { toast } from "sonner";
import { ComboboxInput } from "@/components/ui/combobox-input";
import { PHARMA_UNITS, PHARMA_CATEGORIES } from "@/lib/pharma-constants";

function ProductForm({ onClose, product }: { onClose: () => void; product?: ProductInput & { id?: string } }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const form = useForm<ProductInput>({
    resolver: zodResolver(productSchema),
    defaultValues: product ?? { productName: "", baseUnit: "unit", reorderLevel: 0, productCode: "", barcode: "", category: "", manufacturer: "", notes: "" },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: ProductInput) => {
      if (product?.id) await updateProduct(product.id, data, user?.id);
      else await createProduct(data, user?.id);
    },
    onSuccess: async () => {
      toast.success(product?.id ? "Product updated" : "Product created");
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["categories"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutate(d))} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <FormField control={form.control} name="productName" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Product Name *</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="productCode" render={({ field }) => (
            <FormItem>
              <FormLabel>Product Code</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} placeholder="Auto-generated" /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="barcode" render={({ field }) => (
            <FormItem>
              <FormLabel>Barcode</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="category" render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <ComboboxInput
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  options={PHARMA_CATEGORIES}
                  placeholder="Type or select a category…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="manufacturer" render={({ field }) => (
            <FormItem>
              <FormLabel>Manufacturer</FormLabel>
              <FormControl><Input {...field} value={field.value ?? ""} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="baseUnit" render={({ field }) => (
            <FormItem>
              <FormLabel>Base Unit *</FormLabel>
              <FormControl>
                <ComboboxInput
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  options={PHARMA_UNITS}
                  placeholder="Type or select a unit…"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="reorderLevel" render={({ field }) => (
            <FormItem>
              <FormLabel>Reorder Level</FormLabel>
              <FormControl><Input {...field} value={field.value ?? 0} type="number" min={0} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
          <FormField control={form.control} name="notes" render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Notes</FormLabel>
              <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} /></FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving..." : product?.id ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<(ProductInput & { id: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: allProducts = [], isLoading } = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
  });
  const { data: categories = [] } = useQuery({ queryKey: ["categories"], queryFn: getCategories });

  const filtered = useMemo(() => {
    let result = allProducts;
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      result = result.filter(p =>
        p.productName.toLowerCase().includes(s) ||
        p.productCode.toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s) ||
        (p.manufacturer ?? "").toLowerCase().includes(s) ||
        (p.category ?? "").toLowerCase().includes(s)
      );
    }
    if (category !== "all") result = result.filter(p => p.category === category);
    return result;
  }, [allProducts, search, category]);

  const { mutate: doDelete } = useMutation({
    mutationFn: (id: string) => deleteProduct(id, user?.id),
    onSuccess: async () => {
      toast.success("Product deleted");
      await qc.invalidateQueries({ queryKey: ["products"] });
      setDeleteId(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canEdit = can(user?.role, "products", "edit");
  const canDelete = can(user?.role, "products", "delete");
  const canCreate = can(user?.role, "products", "create");

  return (
    <div className="space-y-4 max-w-7xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="w-6 h-6" /> Products</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} product{filtered.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} data-testid="button-add-product">
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Button>
        )}
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Search products..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-40" data-testid="select-category">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No products found.</p></CardContent></Card>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-3 font-medium">Product</th>
              <th className="text-left px-4 py-3 font-medium">Code</th>
              <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Category</th>
              <th className="text-left px-4 py-3 font-medium hidden lg:table-cell">Manufacturer</th>
              <th className="text-left px-4 py-3 font-medium">Unit</th>
              <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Reorder</th>
              <th className="px-4 py-3" />
            </tr></thead>
            <tbody className="divide-y">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-muted/30 transition-colors" data-testid={`product-row-${p.id}`}>
                  <td className="px-4 py-3">
                    <Link href={`/products/${p.id}`} className="font-medium hover:text-primary transition-colors">
                      {p.productName}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.productCode}</td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    {p.category && <Badge variant="secondary" className="text-xs">{p.category}</Badge>}
                  </td>
                  <td className="px-4 py-3 hidden lg:table-cell text-muted-foreground">{p.manufacturer ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.baseUnit}</td>
                  <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground">{p.reorderLevel}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/products/${p.id}`}>
                        <Button size="icon" variant="ghost" className="h-7 w-7" data-testid={`button-view-${p.id}`}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                      {canEdit && (
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7"
                          data-testid={`button-edit-${p.id}`}
                          onClick={() => setEditProduct({ id: p.id, productName: p.productName, productCode: p.productCode, barcode: p.barcode ?? "", category: p.category ?? "", manufacturer: p.manufacturer ?? "", baseUnit: p.baseUnit, reorderLevel: p.reorderLevel, notes: p.notes ?? "" })}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button
                          size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                          data-testid={`button-delete-${p.id}`}
                          onClick={() => setDeleteId(p.id)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={showForm || !!editProduct} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditProduct(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editProduct ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
          <ProductForm onClose={() => { setShowForm(false); setEditProduct(null); }} product={editProduct ?? undefined} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete product?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && doDelete(deleteId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
