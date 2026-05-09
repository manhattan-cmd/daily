"use client";

import { useState, useRef, useEffect } from "react";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCategory } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

const PRESETS = [
  { name: "Uyku", color: "#6366f1" },
  { name: "Spor & Fitness", color: "#22c55e" },
  { name: "Beslenme", color: "#f97316" },
  { name: "Harcamalar", color: "#f59e0b" },
  { name: "Ruh Hali", color: "#ec4899" },
  { name: "Sağlık", color: "#ef4444" },
  { name: "Sosyal Hayat", color: "#f43f5e" },
  { name: "Çalışma", color: "#3b82f6" },
  { name: "Öğrenme", color: "#84cc16" },
  { name: "Eğlence", color: "#a855f7" },
  { name: "Seyahat", color: "#06b6d4" },
  { name: "Hobiler", color: "#eab308" },
  { name: "Kişisel Bakım", color: "#14b8a6" },
];

const PALETTE = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f97316",
  "#f59e0b", "#22c55e", "#10b981", "#06b6d4", "#3b82f6",
];

export function CategoryQuickAdd({
  existingNames = new Set<string>(),
}: {
  existingNames?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState(PALETTE[0]);
  const [adding, setAdding] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  async function addPreset(preset: { name: string; color: string }) {
    if (existingNames.has(preset.name)) return;
    setAdding(preset.name);
    await createCategory({ name: preset.name, color: preset.color });
    setAdding(null);
  }

  async function addCustom() {
    const name = customName.trim();
    if (!name) return;
    setAdding("__custom__");
    await createCategory({ name, color: customColor });
    setCustomName("");
    setAdding(null);
  }

  return (
    <div className="relative" ref={ref}>
      <Button
        size="icon"
        onClick={() => setOpen((v) => !v)}
        aria-label="Yeni kategori"
      >
        <Plus className="h-5 w-5" />
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
          {/* Preset list */}
          <div className="max-h-64 overflow-y-auto">
            {PRESETS.map((p) => {
              const exists = existingNames.has(p.name);
              const isAdding = adding === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => addPreset(p)}
                  disabled={exists || isAdding}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2.5 text-sm transition-colors",
                    exists
                      ? "text-muted-foreground/40 cursor-default"
                      : "hover:bg-muted active:bg-muted/80"
                  )}
                >
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: p.color }}
                  />
                  <span className="flex-1 text-left">{p.name}</span>
                  {exists && <Check className="h-3.5 w-3.5 text-muted-foreground/40" />}
                </button>
              );
            })}
          </div>

          {/* Custom input */}
          <div className="border-t border-border bg-muted/30 p-3">
            <div className="flex gap-2">
              <Input
                placeholder="Kendin yaz..."
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addCustom();
                }}
                className="h-8 flex-1 text-sm"
              />
              <Button
                size="sm"
                className="h-8 px-2"
                onClick={addCustom}
                disabled={!customName.trim() || adding === "__custom__"}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex gap-1.5">
              {PALETTE.map((color) => (
                <button
                  key={color}
                  onClick={() => setCustomColor(color)}
                  className="relative h-5 w-5 shrink-0 rounded-full transition-transform hover:scale-110"
                  style={{ backgroundColor: color }}
                >
                  {customColor === color && (
                    <Check className="absolute inset-0 m-auto h-3 w-3 text-white" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
