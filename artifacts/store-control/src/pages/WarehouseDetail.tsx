import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getWarehouse, listSections, createSection, updateSection, deleteSection, sectionSchema, type SectionInput } from "@/lib/warehouses";
import { listBatches } from "@/lib/inventory";
import { db } from "@/lib/db";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "wouter";
import { ArrowLeft, Plus, Trash2, Edit } from "lucide-react";
import { toast } from "sonner";

function SectionForm({ warehouseId, onClose, section }: { warehouseId: string; onClose: () => void; section?: SectionInput & { id?: string } }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const form = useForm<SectionInput>({
    resolver: zodResolver(sectionSchema),
    defaultValues: section ?? { sectionName: "", description: "", isActive: true },
  });
  const { mutate, isPending } = useMutation({
    mutationFn: async (data: SectionInput) => {
      if (section?.id) await updateSection(section.id, data, user?.id);
      else await createSection(warehouseId, data, user?.id);
    },
    onSuccess: () => { toast.success(section?.id ? "Section updated" : "Section created"); qc.invalidateQueries({ queryKey: ["sections", warehouseId] }); onClose(); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutate(d))} className="space-y-4">
        <FormField control={form.control} name="sectionName" render={({ field }) => (
          <FormItem><FormLabel>Section Name *</FormLabel><FormControl><Input {...field} data-testid="input-section-name" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem><FormLabel>Description</FormLabel><FormControl><Input {...field} data-testid="input-section-desc" /></FormControl><FormMessage /></FormItem>
        )} />
        <FormField control={form.control} name="isActive" render={({ field }) => (
          <FormItem className="flex items-center gap-3"><FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl><FormLabel className="!mt-0">Active</FormLabel></FormItem>
        )} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-section">{isPending ? "Saving..." : section?.id ? "Update" : "Create"}</Button>
        </div>
      </form>
    </Form>
  );
}

export default function WarehouseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editSection, setEditSection] = useState<(SectionInput & { id: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: warehouse, isLoading } = useQuery({ queryKey: ["warehouse", id], queryFn: () => getWarehouse(id!) });
  const { data: sections = [] } = useQuery({ queryKey: ["sections", id], queryFn: () => listSections(id!) });
  const { data: stockRows = [] } = useQuery({
    queryKey: ["wh-stock", id],
    queryFn: async () => {
      const batches = await listBatches({ warehouseId: id! });
      const products = await db.products.toArray();
      const pm = new Map(products.map(p => [p.id, p]));
      const map = new Map<string, number>();
      for (const b of batches) map.set(b.productId, (map.get(b.productId) ?? 0) + b.quantityBaseUnit);
      return [...map.entries()].map(([pid, qty]) => ({ productId: pid, product: pm.get(pid), qty })).filter(r => r.qty > 0);
    },
  });

  const { mutate: doDelete } = useMutation({
    mutationFn: (sid: string) => deleteSection(sid, user?.id),
    onSuccess: () => { toast.success("Section deleted"); qc.invalidateQueries({ queryKey: ["sections", id] }); setDeleteId(null); },
    onError: (e) => toast.error((e as Error).message),
  });

  const canEdit = can(user?.role, "inventory", "edit");

  if (isLoading) return <div className="h-48 bg-muted animate-pulse rounded-lg" />;
  if (!warehouse) return <div className="text-center py-12 text-muted-foreground">Warehouse not found</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/warehouses"><Button variant="ghost" size="icon"><ArrowLeft className="w-4 h-4" /></Button></Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold">{warehouse.warehouseName}</h1>
            <Badge variant={warehouse.isActive ? "default" : "secondary"}>{warehouse.isActive ? "Active" : "Inactive"}</Badge>
          </div>
          <p className="text-sm text-muted-foreground font-mono">{warehouse.warehouseCode}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm">Sections</CardTitle>
            {canEdit && <Button size="sm" onClick={() => setShowForm(true)} data-testid="button-add-section"><Plus className="w-3.5 h-3.5 mr-1" /> Add</Button>}
          </CardHeader>
          <CardContent>
            {sections.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sections</p>
            ) : (
              <div className="space-y-2">
                {sections.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-1.5 border-b last:border-0" data-testid={`section-row-${s.id}`}>
                    <div>
                      <p className="text-sm font-medium">{s.sectionName}</p>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      {canEdit && <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditSection({ id: s.id, sectionName: s.sectionName, description: s.description ?? "", isActive: s.isActive })}><Edit className="w-3 h-3" /></Button>}
                      {canEdit && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => setDeleteId(s.id)}><Trash2 className="w-3 h-3" /></Button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Stock in this Warehouse</CardTitle></CardHeader>
          <CardContent>
            {stockRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No stock</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {stockRows.map(r => (
                  <div key={r.productId} className="flex justify-between text-sm">
                    <span className="font-medium">{r.product?.productName ?? r.productId}</span>
                    <span className="text-muted-foreground">{r.qty} {r.product?.baseUnit ?? "units"}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={showForm || !!editSection} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditSection(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editSection ? "Edit Section" : "Add Section"}</DialogTitle></DialogHeader>
          <SectionForm warehouseId={id!} onClose={() => { setShowForm(false); setEditSection(null); }} section={editSection ?? undefined} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete section?</AlertDialogTitle><AlertDialogDescription>This cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && doDelete(deleteId)} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
