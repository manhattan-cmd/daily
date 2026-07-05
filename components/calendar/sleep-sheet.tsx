"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { MoonStar, X } from "lucide-react";
import { db } from "@/lib/db";
import { createEntry, listModifiersForTarget } from "@/lib/db/queries";
import {
  DateTimeRangeInput,
  parseDTR,
} from "@/components/forms/datetime-range-input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SleepSheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

/** Yerleşik Uyku akışı: Ekle → Uyku. Gece Uykusu altına süre + kalite kaydeder. */
export function SleepSheet({ date, open, onClose }: SleepSheetProps) {
  const [range, setRange] = useState("");
  const [quality, setQuality] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setRange("");
        setQuality("");
      }, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  const target = useLiveQuery(async () => {
    const cat = await db.categories.filter((c) => !!c.isBuiltIn).first();
    if (!cat) return null;
    const subs = await db.subcategories
      .where("categoryId")
      .equals(cat.id)
      .toArray();
    const sub =
      subs.find((s) => s.name.toLocaleLowerCase("tr-TR") === "gece uykusu") ??
      subs.find((s) => !s.parentId);
    if (!sub) return null;
    const mods = await listModifiersForTarget("subcategory", sub.id);
    return {
      sub,
      rangeMod: mods.find(
        (m) => (m.entryType.valueType ?? "number") === "datetime-range"
      ),
      qualityMod: mods.find(
        (m) => (m.entryType.valueType ?? "number") === "select"
      ),
    };
  }, []);

  async function handleSave() {
    if (!target) return;
    setSaving(true);
    try {
      const typeValues: { entryTypeId: string; modId?: string; value: string }[] = [];
      if (range && target.rangeMod) {
        typeValues.push({
          entryTypeId: target.rangeMod.entryTypeId,
          modId: target.rangeMod.modId,
          value: range,
        });
      }
      if (quality && target.qualityMod) {
        typeValues.push({
          entryTypeId: target.qualityMod.entryTypeId,
          modId: target.qualityMod.modId,
          value: quality,
        });
      }

      // Uyanma saati varsa girdinin zamanı odur; yoksa günün o anki saati
      const { end } = parseDTR(range);
      let occurredAt: number;
      if (end) {
        occurredAt = new Date(end).getTime();
      } else {
        const [y, m, d] = date.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        const n = new Date();
        dt.setHours(n.getHours(), n.getMinutes(), 0, 0);
        occurredAt = dt.getTime();
      }

      await createEntry({
        subcategoryId: target.sub.id,
        typeValues,
        occurredAt,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px]",
          "flex flex-col rounded-t-3xl bg-background border-t border-white/8",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.6)]",
          "transition-transform duration-300 ease-out",
          "max-h-[80vh]",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-[3px] w-10 rounded-full bg-white/15" />
        </div>

        <div className="flex items-center gap-3 px-5 pt-2 pb-4 shrink-0">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
            <MoonStar className="h-4.5 w-4.5 text-violet-300" />
          </span>
          <h2 className="flex-1 text-base font-semibold tracking-tight">
            Uyku ekle
          </h2>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors"
            aria-label="Kapat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6 flex flex-col gap-5">
          {target === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Uyku kategorisi bulunamadı.
            </p>
          ) : target === undefined ? null : (
            <>
              {target.rangeMod && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    {target.rangeMod.name ?? "Uyku Süresi"}
                  </label>
                  <DateTimeRangeInput
                    value={range}
                    onChange={setRange}
                    entryDate={date}
                  />
                </div>
              )}

              {target.qualityMod && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium">
                    {target.qualityMod.name ?? "Uyku Kalitesi"}
                  </label>
                  <div className="flex gap-2">
                    {(target.qualityMod.entryType.choices ?? []).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setQuality(quality === c ? "" : c)}
                        className={cn(
                          "flex h-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold transition-colors",
                          quality === c
                            ? "border-violet-400 bg-violet-500/20 text-violet-200"
                            : "border-border bg-input text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 pb-8 pt-2 shrink-0 border-t border-white/8">
          <Button
            className="w-full bg-violet-600 hover:bg-violet-700"
            size="lg"
            onClick={handleSave}
            disabled={saving || !target}
          >
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </div>
      </div>
    </>
  );
}
