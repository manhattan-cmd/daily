"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { db } from "@/lib/db";
import {
  getOrCreateCategoryRootSub,
  type ParallelSub,
} from "@/lib/db/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { SubCategory } from "@/types";

/**
 * Paralel perspektif seçici — hem yeni girdi akışı (DayEntrySheet) hem de var
 * olan girdinin düzenleme modalı kullanır. Her kategorinin TÜM alt kategori
 * ağacı listelenir (iç içe olanlar yol etiketiyle: "Öğünler › Kahvaltı");
 * kategori adını taşıyan kesikli çip, kategorinin kendisini (gizli kök
 * üzerinden, gerekirse o an yaratılarak) perspektif olarak seçer.
 */
export function ParallelPickDialog({
  open,
  onOpenChange,
  excludeCategoryId,
  hiddenSubIds,
  selected,
  onAdd,
  onRemove,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Girdinin kendi kategorisi — listede sunulmaz */
  excludeCategoryId: string;
  /** Zaten perspektifi olan alt kategoriler — çipleri gizlenir */
  hiddenSubIds?: Set<string>;
  selected: ParallelSub[];
  onAdd: (ps: ParallelSub) => void;
  onRemove: (id: string) => void;
  /** Tamam'a basılınca (dışarı tıklayarak kapatmada değil) — düzenleme modalı
   * bununla akışı hemen başlatır; verilmezse Tamam yalnızca kapatır */
  onConfirm?: () => void;
}) {
  const selectedIds = new Set(selected.map((p) => p.id));

  const groups = useLiveQuery(
    async () => {
      if (!open) return [];
      const cats = await db.categories.orderBy("order").toArray();
      const subs = await db.subcategories.toArray();
      return cats
        .filter((c) => c.id !== excludeCategoryId && !c.isBuiltIn)
        .map((cat) => {
          const catSubs = subs.filter(
            (s) => s.categoryId === cat.id && !s.isCategoryRoot
          );
          const list: { sub: SubCategory; label: string }[] = [];
          const walk = (parentId: string | undefined, prefix: string) => {
            catSubs
              .filter((s) => (s.parentId ?? undefined) === parentId)
              .sort((a, b) => a.order - b.order)
              .forEach((s) => {
                const label = prefix ? `${prefix} › ${s.name}` : s.name;
                list.push({ sub: s, label });
                walk(s.id, label);
              });
          };
          walk(undefined, "");
          const rootSub = subs.find(
            (s) => s.categoryId === cat.id && s.isCategoryRoot
          );
          return { category: cat, subs: list, rootSub };
        });
    },
    [open, excludeCategoryId]
  ) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[70dvh] overflow-y-auto gap-4">
        <DialogHeader>
          <DialogTitle>Paralel perspektif seç</DialogTitle>
          <DialogDescription>
            Bu girdiyi hangi kategoride de takip etmek istersin?
          </DialogDescription>
        </DialogHeader>

        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Başka kategori yok.
          </p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.map(({ category, subs, rootSub }) => {
              const rootSel = selected.find(
                (p) => p.isCategoryRoot && p.categoryId === category.id
              );
              const rootHidden =
                !!rootSub && !!hiddenSubIds?.has(rootSub.id);
              const visibleSubs = subs.filter(
                ({ sub }) => !hiddenSubIds?.has(sub.id)
              );
              if (rootHidden && visibleSubs.length === 0) return null;
              return (
                <div key={category.id}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {category.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Kategorinin kendisi — kesikli çip, kategori adıyla */}
                    {!rootHidden && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (rootSel) {
                            onRemove(rootSel.id);
                          } else {
                            const root = await getOrCreateCategoryRootSub(
                              category.id
                            );
                            onAdd({ ...root, categoryName: category.name });
                          }
                        }}
                        className={cn(
                          "flex items-center gap-1.5 rounded-xl border border-dashed px-3 py-1.5 text-sm transition-colors",
                          rootSel
                            ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                            : "border-border bg-muted/10 text-muted-foreground hover:bg-muted/30 hover:text-foreground"
                        )}
                      >
                        {rootSel && <Check className="h-3 w-3 shrink-0" />}
                        {category.name}
                        <span className="text-[10px] text-muted-foreground/60">
                          genel
                        </span>
                      </button>
                    )}
                    {visibleSubs.map(({ sub, label }) => {
                      const isSel = selectedIds.has(sub.id);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() =>
                            isSel
                              ? onRemove(sub.id)
                              : onAdd({ ...sub, categoryName: category.name })
                          }
                          className={cn(
                            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                            isSel
                              ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                              : "border-border bg-muted/20 text-foreground hover:bg-muted/40"
                          )}
                        >
                          {isSel && <Check className="h-3 w-3 shrink-0" />}
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirm?.();
            }}
          >
            Tamam
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
