import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverAnchor } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface ComboboxInputProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}

export function ComboboxInput({ value, onChange, options, placeholder, className }: ComboboxInputProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const isSelectingRef = useRef(false);

  const query = value?.trim().toLowerCase() ?? "";
  const filtered = query
    ? options.filter((o) => o.toLowerCase().includes(query))
    : options;

  const isOpen = (focused || isSelectingRef.current) && filtered.length > 0;

  function select(option: string) {
    isSelectingRef.current = false;
    onChange(option);
    setOpen(false);
    setFocused(false);
    inputRef.current?.blur();
  }

  return (
    <Popover open={isOpen} onOpenChange={() => {}}>
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={value ?? ""}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            if (!isSelectingRef.current) {
              setFocused(false);
            }
          }}
          placeholder={placeholder}
          className={className}
          autoComplete="off"
        />
      </PopoverAnchor>
      <PopoverContent
        className="p-0"
        style={{ width: "var(--radix-popper-anchor-width)" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseDown={(e) => {
          e.preventDefault();
          isSelectingRef.current = true;
        }}
        onMouseUp={() => {
          isSelectingRef.current = false;
        }}
        align="start"
        side="bottom"
        sideOffset={4}
      >
        <Command shouldFilter={false}>
          <CommandList className="max-h-52">
            <CommandEmpty>No suggestions found.</CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option}
                  value={option}
                  onSelect={() => select(option)}
                  className={cn(
                    "cursor-pointer text-sm",
                    option === value && "bg-accent font-medium"
                  )}
                >
                  {option}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
