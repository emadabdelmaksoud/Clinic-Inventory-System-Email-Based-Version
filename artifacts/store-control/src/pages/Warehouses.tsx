import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { listWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, warehouseSchema, type WarehouseInput } from "@/lib/warehouses";
import { useAuth } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, Trash2, Edit, Eye, Warehouse } from "lucide-react";
import { toast } from "sonner";

function WarehouseForm({ onClose, warehouse }: { onClose: () => void; warehouse?: WarehouseInput & { id?: string } }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const form = useForm<WarehouseInput>({
    resolver: zodResolver(warehouseSchema),
    defaultValues: warehouse ?? { warehouseName: "", warehouseCode: "", description: "", isActive: true },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: async (data: WarehouseInput) => {
      if (warehouse?.id) await updateWarehouse(warehouse.id, data, user?.id);
      else await createWarehouse(data, user?.id);
    },
    onSuccess: async () => {
      toast.success(warehouse?.id ? "Warehouse updated" : "Warehouse created");
      await qc.invalidateQueries({ queryKey: ["warehouses"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((d) => mutate(d))} className="space-y-4">
        <FormField control={form.control} name="warehouseName" render={({ field }) => (
          <FormItem>
            <FormLabel>Warehouse Name *</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ""} data-testid="input-warehouse-name" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="warehouseCode" render={({ field }) => (
          <FormItem>
            <FormLabel>Code</FormLabel>
            <FormControl><Input {...field} value={field.value ?? ""} placeholder="Auto-generated" data-testid="input-warehouse-code" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="description" render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl><Textarea {...field} value={field.value ?? ""} rows={2} data-testid="input-warehouse-desc" /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="isActive" render={({ field }) => (
          <FormItem className="flex items-center gap-3">
            <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} data-testid="switch-is-active" /></FormControl>
            <FormLabel className="!mt-0">Active</FormLabel>
          </FormItem>
        )} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={isPending} data-testid="button-save-warehouse">
            {isPending ? "Saving..." : warehouse?.id ? "Update" : "Create"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

export default function WarehousesPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editWh, setEditWh] = useState<(WarehouseInput & { id: string }) | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: allWarehouses = [], isLoading } = useQuery({
    queryKey: ["warehouses"],
    queryFn: () => listWarehouses(),
  });

  const warehouses = useMemo(() => {
    if (!search.trim()) return allWarehouses;
    const s = search.trim().toLowerCase();
    return allWarehouses.filter(w =>
      w.warehouseName.toLowerCase().includes(s) ||
      w.warehouseCode.toLowerCase().includes(s)
    );
  }, [allWarehouses, search]);

  const { mutate: doDelete } = useMutation({
    mutationFn: (id: string) => deleteWarehouse(id, user?.id),
    onSuccess: async () => {
      toast.success("Warehouse deleted");
      await qc.invalidateQueries({ queryKey: ["warehouses"] });
      setDeleteId(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const canEdit = can(user?.role, "inventory", "edit");
  const canDelete = can(user?.role, "inventory", "delete");
  const canCreate = can(user?.role, "inventory", "edit");

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Warehouse className="w-6 h-6" /> Warehouses</h1>
          <p className="text-sm text-muted-foreground">{warehouses.length} warehouse{warehouses.length !== 1 ? "s" : ""}</p>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} data-testid="button-add-warehouse">
            <Plus className="w-4 h-4 mr-1" /> Add Warehouse
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search warehouses..." value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search" />
      </div>

      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />)}</div>
      ) : warehouses.length === 0 ? (
        <Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">No warehouses found.</p></CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {warehouses.map(wh => (
            <Card key={wh.id} className="hover:shadow-md transition-shadow" data-testid={`warehouse-card-${wh.id}`}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{wh.warehouseName}</h3>
                    <p className="text-xs font-mono text-muted-foreground">{wh.warehouseCode}</p>
                  </div>
                  <Badge variant={wh.isActive ? "default" : "secondary"} className="text-xs">
                    {wh.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                {wh.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{wh.description}</p>}
                <div className="flex items-center gap-1 pt-2 border-t">
                  <Link href={`/warehouses/${wh.id}`}>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" data-testid={`button-view-${wh.id}`}>
                      <Eye className="w-3 h-3" /> View
                    </Button>
                  </Link>
                  {canEdit && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs gap-1"
                      onClick={() => setEditWh({ id: wh.id, warehouseName: wh.warehouseName, warehouseCode: wh.warehouseCode, description: wh.description ?? "", isActive: wh.isActive })}
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </Button>
                  )}
                  {canDelete && (
                    <Button
                      size="sm" variant="ghost" className="h-7 text-xs text-destructive gap-1 ml-auto"
                      onClick={() => setDeleteId(wh.id)}
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showForm || !!editWh} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditWh(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editWh ? "Edit Warehouse" : "Add Warehouse"}</DialogTitle></DialogHeader>
          <WarehouseForm onClose={() => { setShowForm(false); setEditWh(null); }} warehouse={editWh ?? undefined} />
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete warehouse?</AlertDialogTitle>
            <AlertDialogDescription>This will also delete all sections. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && doDelete(deleteId)} className="bg-destructive text-destructive-foreground" data-testid="button-confirm-delete">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
