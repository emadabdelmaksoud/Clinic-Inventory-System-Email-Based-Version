import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { searchProductsAutocomplete } from "@/lib/products";
import type { Product } from "@/lib/db";
import { Search, X } from "lucide-react";

export type PickedProduct = Pick<Product, "id" | "productCode" | "productName" | "manufacturer">;

interface Props {
  value: PickedProduct | null;
  onChange: (p: PickedProduct | null) => void;
  placeholder?: string;
}

export function ProductPicker({ value, onChange, placeholder }: Props) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<PickedProduct[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!term.trim()) { setSuggestions([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await searchProductsAutocomplete(term);
        setSuggestions(res);
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [term]);

  if (value) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/40 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{value.productName}</div>
          <div className="truncate text-xs text-muted-foreground font-mono">
            {value.productCode}{value.manufacturer ? ` · ${value.manufacturer}` : ""}
          </div>
        </div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => onChange(null)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <Input
          placeholder={placeholder ?? "Search product…"}
          className="pl-9"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.id}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(s); setTerm(""); setOpen(false); }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-accent transition-colors"
            >
              <div className="font-medium">{s.productName}</div>
              <div className="text-xs text-muted-foreground font-mono">
                {s.productCode}{s.manufacturer ? ` · ${s.manufacturer}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
