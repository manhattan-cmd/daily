"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
  "#f59e0b", "#84cc16", "#22c55e", "#10b981", "#06b6d4",
  "#3b82f6", "#0ea5e9", "#14b8a6", "#7c3aed", "#db2777",
];

export function TemplateSetup() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customName, setCustomName] = useState("");
  const [customColor, setCustomColor] = useState(PALETTE[0]);
  const [loading, setLoading] = useState(false);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const totalCount = selected.size + (customName.trim() ? 1 : 0);

  async function handleSubmit() {
    if (totalCount === 0) return;
    setLoading(true);
    try {
      const toAdd = PRESETS.filter((p) => selected.has(p.name));
      if (customName.trim()) {
        toAdd.push({ name: customName.trim(), color: customColor });
      }
      for (const cat of toAdd) {
        await createCategory({ name: cat.name, color: cat.color });
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">
        Neleri takip etmek istiyorsun? İstediğin kadar seç.
      </p>

      <div className="mb-6 flex flex-wrap gap-2">
        {PRESETS.map((p) => {
          const isSelected = selected.has(p.name);
          return (
            <button
              key={p.name}
              onClick={() => toggle(p.name)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all active:scale-95",
                isSelected
                  ? "border-transparent text-white"
                  : "border-border bg-card text-foreground hover:bg-muted"
              )}
              style={isSelected ? { backgroundColor: p.color } : undefined}
            >
              {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
              {p.name}
            </button>
          );
        })}
      </div>

      <div className="mb-4 rounded-2xl border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Kendin ekle</p>
        <Input
          placeholder="Kategori adı"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
          className="mb-3"
        />
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((color) => (
            <button
              key={color}
              onClick={() => setCustomColor(color)}
              className="relative h-7 w-7 rounded-full transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: color }}
            >
              {customColor === color && (
                <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white" />
              )}
            </button>
          ))}
        </div>
      </div>

      <Button
        className="w-full"
        onClick={handleSubmit}
        disabled={loading || totalCount === 0}
      >
        {totalCount > 0 ? `${totalCount} kategori ekle` : "En az bir kategori seç"}
      </Button>
    </div>
  );
}
