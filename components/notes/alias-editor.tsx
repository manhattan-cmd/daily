"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");

/**
 * Takma ad (alias) editörü — çip olarak ekle/kaldır. Takma adlar otomatik bağ
 * önerisinde de eşleşir (başlık nadiren metinde birebir geçer). [[app-vision]]
 */
export function AliasEditor({
  aliases,
  onChange,
  className,
}: {
  aliases: string[];
  onChange: (a: string[]) => void;
  className?: string;
}) {
  const [input, setInput] = useState("");

  function add() {
    const v = input.trim();
    setInput("");
    if (!v || aliases.some((a) => norm(a) === norm(v))) return;
    onChange([...aliases, v]);
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] text-muted-foreground/70">Takma ad:</span>
      {aliases.map((a) => (
        <span
          key={a}
          className="inline-flex items-center gap-0.5 rounded-full border border-border bg-muted/40 py-0.5 pl-2 pr-1 text-[11px]"
        >
          {a}
          <button
            type="button"
            onClick={() => onChange(aliases.filter((x) => x !== a))}
            className="rounded-full p-0.5 text-muted-foreground/50 hover:text-destructive"
            aria-label={`${a} takma adını kaldır`}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="+ ekle"
        className="w-14 bg-transparent text-[11px] outline-none placeholder:text-muted-foreground/40"
      />
    </div>
  );
}
