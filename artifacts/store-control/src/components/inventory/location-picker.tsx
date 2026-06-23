import { useQuery } from "@tanstack/react-query";
import { listWarehouses, listSections } from "@/lib/warehouses";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

interface Props {
  warehouseId: string;
  sectionId: string;
  onChange: (next: { warehouseId: string; sectionId: string }) => void;
  warehouseLabel?: string;
  sectionLabel?: string;
}

export function LocationPicker({
  warehouseId,
  sectionId,
  onChange,
  warehouseLabel = "Warehouse",
  sectionLabel = "Section",
}: Props) {
  const warehouses = useQuery({ queryKey: ["warehouses"], queryFn: () => listWarehouses() });
  const sections = useQuery({
    queryKey: ["sections", warehouseId],
    queryFn: () => listSections(warehouseId),
    enabled: !!warehouseId,
  });

  const whs = (warehouses.data ?? []).filter((w) => w.isActive);
  const secs = (sections.data ?? []).filter((s) => s.isActive);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>{warehouseLabel}</Label>
        <Select
          value={warehouseId || undefined}
          onValueChange={(v) => onChange({ warehouseId: v, sectionId: "" })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select warehouse…" />
          </SelectTrigger>
          <SelectContent>
            {whs.map((w) => (
              <SelectItem key={w.id} value={w.id}>{w.warehouseName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>{sectionLabel}</Label>
        <Select
          value={sectionId || "__none__"}
          onValueChange={(v) => onChange({ warehouseId, sectionId: v === "__none__" ? "" : v })}
          disabled={!warehouseId}
        >
          <SelectTrigger>
            <SelectValue placeholder={warehouseId ? "Select section…" : "Pick a warehouse first"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— No section —</SelectItem>
            {secs.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.sectionName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
