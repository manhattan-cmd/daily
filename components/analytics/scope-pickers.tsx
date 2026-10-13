"use client";

/**
 * Analiz bandının seçicileri — solda ÖZELLİK, sağda YER (kategori ağacı).
 *
 * Konum yolunun yerini aldı: yol yalnız inilen yeri gösteriyordu, başka bir
 * yere ya da özelliğe geçmek için sayfada aşağı inip kart aramak gerekiyordu.
 * İki çip her an ne'ye ve nereye bakıldığını söylüyor; dokununca seçim
 * listesi açılıyor. Seçim dönem görünümünün kendi durumunu sürüyor (seçili
 * kategori, inilen yol, özellik) — sayfanın geri kalanı aynı.
 */

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { modColor } from "@/lib/mod-color";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Category, Entry, SubCategory } from "@/types";

type Props = {
  cats: Category[];
  subs: SubCategory[];
  /** Dönemin girdileri */
  entries: Entry[];
  selectedCat: Category | null;
  path: SubCategory[];
  /** "count" ya da özellik id */
  metricId: string;
  /** Yer seçildi: kategori yoksa "tüm kategoriler" */
  onPlace: (catId: string | null, pathIds: string[]) => void;
  /** Özellik seçildi — kategori seçili değilse en çok kullanıldığı kategoriyle */
  onMetric: (catId: string, metricId: string) => void;
};

export function ScopePickers({ cats, subs, entries, selectedCat, path, metricId, onPlace, onMetric }: Props) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const [open, setOpen] = useState<"ne" | "yer" | null>(null);

  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const catById = useMemo(() => new Map(cats.map((c) => [c.id, c])), [cats]);
  const focus = path[path.length - 1] ?? null;

  /** Girdinin kalemi bulunulan kapsamın içinde mi */
  const inScope = useMemo(() => {
    return (e: Entry) => {
      const sub = subById.get(e.subcategoryId);
      if (!sub) return false;
      if (!selectedCat) return true;
      if (sub.categoryId !== selectedCat.id) return false;
      if (!focus) return true;
      for (let cur: SubCategory | undefined = sub; cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) {
        if (cur.id === focus.id) return true;
      }
      return false;
    };
  }, [subById, selectedCat, focus]);

  // Kapsamdaki özellikler — seçici açıkken okunur
  const scopeIds = useMemo(() => entries.filter(inScope).map((e) => e.id), [entries, inScope]);
  const features = useLiveQuery(async () => {
    if (open !== "ne" && metricId === "count") return null;
    const [values, mods] = await Promise.all([
      db.entryValues.where("entryId").anyOf(scopeIds).toArray(),
      db.mods.toArray(),
    ]);
    const modById = new Map(mods.map((m) => [m.id, m]));
    const entryCat = new Map(entries.map((e) => [e.id, subById.get(e.subcategoryId)?.categoryId]));
    const agg = new Map<string, { n: number; byCat: Map<string, number> }>();
    for (const v of values) {
      if (!v.modId || !modById.has(v.modId)) continue;
      const a = agg.get(v.modId) ?? { n: 0, byCat: new Map() };
      a.n++;
      const c = entryCat.get(v.entryId);
      if (c) a.byCat.set(c, (a.byCat.get(c) ?? 0) + 1);
      agg.set(v.modId, a);
    }
    return [...agg.entries()]
      .map(([id, a]) => ({
        mod: modById.get(id)!,
        n: a.n,
        topCat: [...a.byCat.entries()].sort((x, y) => y[1] - x[1])[0]?.[0],
        cats: a.byCat.size,
      }))
      .sort((x, y) => y.n - x.n);
  }, [open, metricId, scopeIds.join(","), entries, subById]);

  // Ağaç: dönemde girdisi olan kategoriler ve kalemler, kayıt sayısıyla
  const tree = useMemo(() => {
    const count = new Map<string, number>();
    for (const e of entries) {
      for (let cur: SubCategory | undefined = subById.get(e.subcategoryId); cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) {
        if (!cur.isCategoryRoot) count.set(cur.id, (count.get(cur.id) ?? 0) + 1);
      }
      const c = subById.get(e.subcategoryId)?.categoryId;
      if (c) count.set(`c:${c}`, (count.get(`c:${c}`) ?? 0) + 1);
    }
    const out: { catId: string; pathIds: string[]; name: string; color: string; depth: number; n: number; isCat: boolean }[] = [];
    const walk = (cat: Category, parentId: string | undefined, depth: number, trail: string[]) => {
      subs
        .filter((s) => s.categoryId === cat.id && !s.isCategoryRoot && s.parentId === parentId && (count.get(s.id) ?? 0) > 0)
        .sort((a, b) => a.order - b.order)
        .forEach((s) => {
          const p = [...trail, s.id];
          out.push({ catId: cat.id, pathIds: p, name: s.name, color: cat.color, depth, n: count.get(s.id) ?? 0, isCat: false });
          walk(cat, s.id, depth + 1, p);
        });
    };
    [...cats]
      .filter((c) => (count.get(`c:${c.id}`) ?? 0) > 0)
      .sort((a, b) => (count.get(`c:${b.id}`) ?? 0) - (count.get(`c:${a.id}`) ?? 0))
      .forEach((c) => {
        out.push({ catId: c.id, pathIds: [], name: c.name, color: c.color, depth: 0, n: count.get(`c:${c.id}`) ?? 0, isCat: true });
        walk(c, undefined, 1, []);
      });
    return out;
  }, [cats, subs, entries, subById]);

  const currentMod = metricId !== "count" ? features?.find((f) => f.mod.id === metricId)?.mod : undefined;
  const placeText = selectedCat
    ? [selectedCat.name, ...path.map((s) => s.name)].slice(-2).join(" › ")
    : t("structure.categories");
  const curPathKey = selectedCat ? [selectedCat.id, ...path.map((s) => s.id)].join("/") : "";

  const chip = cn(
    "flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-[12.5px] font-bold",
    brutal
      ? "rounded-[9px] border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]"
      : "rounded-lg bg-[var(--sf-2)] text-foreground ring-1 ring-inset ring-[var(--ln-1)]"
  );
  const row = (on: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px]",
      on ? (brutal ? "bg-[#111] font-bold text-[#FFF4DC]" : "bg-[var(--sf-3)] font-semibold") : "hover:bg-[var(--sf-2)]"
    );

  return (
    <>
      <div data-scope-pickers="" className="flex items-center gap-1.5">
        <button type="button" onClick={() => setOpen("ne")} className={cn(chip, "max-w-[46%]")} aria-label="Özellik seç">
          {currentMod && (
            <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-[#111]" style={{ background: modColor(currentMod) }} />
          )}
          <span className="truncate">{currentMod ? currentMod.name : t("insights.entries")}</span>
          <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
        <span className="text-muted-foreground">·</span>
        <button type="button" onClick={() => setOpen("yer")} className={cn(chip, "flex-1")} aria-label="Yer seç">
          {selectedCat && (
            <span className="h-3.5 w-3.5 shrink-0 rounded-[4px] border-[1.5px] border-[#111]" style={{ background: selectedCat.color }} />
          )}
          <span className="truncate">{placeText}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
        </button>
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[80vh] max-w-[360px] gap-2 overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{open === "ne" ? "Neye bakılsın?" : "Nerede?"}</DialogTitle>
          </DialogHeader>
          {open === "ne" ? (
            <div className="flex flex-col gap-0.5">
              {selectedCat && (
                <button
                  type="button"
                  className={row(metricId === "count")}
                  onClick={() => {
                    setOpen(null);
                    onMetric(selectedCat.id, "count");
                  }}
                >
                  {t("insights.entries")}
                  <span className="ml-auto text-[12px] opacity-70">{scopeIds.length}</span>
                </button>
              )}
              {!selectedCat && (
                <p className="px-2.5 pb-1 text-[12px] text-muted-foreground">Seçtiğin özellik en çok kullanıldığı kategoride açılır.</p>
              )}
              {(features ?? []).map((f) => (
                <button
                  key={f.mod.id}
                  type="button"
                  className={row(metricId === f.mod.id)}
                  onClick={() => {
                    setOpen(null);
                    const catId = selectedCat?.id ?? f.topCat;
                    if (catId) onMetric(catId, f.mod.id);
                  }}
                >
                  <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[#111]" style={{ background: modColor(f.mod) }} />
                  <span className="truncate">{f.mod.name}</span>
                  <span className="ml-auto shrink-0 text-[11.5px] opacity-60">
                    {!selectedCat && f.topCat ? catById.get(f.topCat)?.name : f.n}
                  </span>
                </button>
              ))}
              {features && features.length === 0 && (
                <p className="px-2.5 py-2 text-[13px] text-muted-foreground">Bu dönemde burada özellik değeri yok.</p>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                className={row(!selectedCat)}
                onClick={() => {
                  setOpen(null);
                  onPlace(null, []);
                }}
              >
                {t("structure.categories")} <span className="ml-auto text-[12px] opacity-70">hepsi</span>
              </button>
              {tree.map((n) => {
                const key = [n.catId, ...n.pathIds].join("/");
                return (
                  <button
                    key={key}
                    type="button"
                    className={row(curPathKey === key)}
                    style={{ paddingLeft: 10 + n.depth * 18 }}
                    onClick={() => {
                      setOpen(null);
                      onPlace(n.catId, n.pathIds);
                    }}
                  >
                    <span
                      className={cn("h-4 w-4 shrink-0 border-[1.5px] border-[#111]", n.isCat ? "rounded-[4px]" : "rounded-[3px] opacity-80")}
                      style={{ background: n.color }}
                    />
                    <span className={cn("truncate", n.isCat && "font-semibold")}>{n.name}</span>
                    <span className="ml-auto shrink-0 text-[11.5px] opacity-60">{n.n}</span>
                  </button>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
