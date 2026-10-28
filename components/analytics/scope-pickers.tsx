"use client";

/**
 * Analiz bandının seçicileri — solda ÖZELLİK, sağda YER (kategori ağacı).
 *
 * Konum yolunun yerini aldı: yol yalnız inilen yeri gösteriyordu, başka bir
 * yere ya da özelliğe geçmek için sayfada aşağı inip kart aramak gerekiyordu.
 * Tek çerçevede iki alan her an neye ve nereye bakıldığını söylüyor;
 * dokununca seçim listesi açılıyor. Seçim dönem görünümünün kendi durumunu
 * sürüyor (seçili kategori, inilen yol, özellik) — sayfanın geri kalanı aynı.
 *
 * Bir özellik seçiliyken yer ağacı yalnız o özelliğin bu dönem GEÇTİĞİ
 * yerleri gösterir (sayılar da o özelliğin kayıtları); istenirse tüm yerlere
 * açılır.
 */

import { createElement, useMemo, useState } from "react";
import { Check, ChevronDown, LayoutGrid, ListOrdered } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { modColor } from "@/lib/mod-color";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Category, Entry, Mod, SubCategory } from "@/types";

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

type TreeRow = {
  key: string;
  catId: string;
  pathIds: string[];
  name: string;
  icon?: string;
  color: string;
  depth: number;
  n: number;
  isCat: boolean;
};

const atomIcon = (m: Mod) => modAtomIcon({ name: m.name, entryType: { valueType: m.valueType } as never });

export function ScopePickers({ cats, subs, entries, selectedCat, path, metricId, onPlace, onMetric }: Props) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const [open, setOpen] = useState<"ne" | "yer" | null>(null);
  // Yer listesinde özellik süzgecini kaldır
  const [allPlaces, setAllPlaces] = useState(false);

  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
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

  const periodIds = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);
  const scopeIds = useMemo(() => entries.filter(inScope).map((e) => e.id), [entries, inScope]);
  const scopeKey = scopeIds.join(",");

  // Kapsamdaki özellikler, kayıt sayılarıyla
  const features = useLiveQuery(async () => {
    const [allValues, mods] = await Promise.all([
      db.entryValues.where("entryId").anyOf(scopeIds).toArray(),
      db.mods.toArray(),
    ]);
    // Nesneye ait değerler nesne analizinde
    const values = allValues.filter((v) => !v.thingId);
    const modById = new Map(mods.map((m) => [m.id, m]));
    const entryCat = new Map(entries.map((e) => [e.id, subById.get(e.subcategoryId)?.categoryId]));
    const agg = new Map<string, { ids: Set<string>; byCat: Map<string, number> }>();
    for (const v of values) {
      if (!v.modId || !modById.has(v.modId)) continue;
      const a = agg.get(v.modId) ?? { ids: new Set<string>(), byCat: new Map<string, number>() };
      if (!a.ids.has(v.entryId)) {
        a.ids.add(v.entryId);
        const c = entryCat.get(v.entryId);
        if (c) a.byCat.set(c, (a.byCat.get(c) ?? 0) + 1);
      }
      agg.set(v.modId, a);
    }
    return [...agg.entries()]
      .map(([id, a]) => ({
        mod: modById.get(id)!,
        n: a.ids.size,
        topCat: [...a.byCat.entries()].sort((x, y) => y[1] - x[1])[0]?.[0],
      }))
      .sort((x, y) => y.n - x.n);
  }, [scopeKey, entries, subById]);

  // Seçili özelliğin bu dönem geçtiği girdiler (yer süzgeci)
  const metricEntryIds = useLiveQuery(async () => {
    if (metricId === "count") return null;
    const vals = (await db.entryValues.where("modId").equals(metricId).toArray()).filter((v) => !v.thingId);
    return new Set(vals.map((v) => v.entryId).filter((id) => periodIds.has(id)));
  }, [metricId, periodIds]);
  const currentMod =
    metricId !== "count" ? features?.find((f) => f.mod.id === metricId)?.mod : undefined;
  const filtering = !!metricEntryIds && !allPlaces;

  // Ağaç: dönemde (süzgeçte o özelliğin) kaydı olan kategoriler ve kalemler
  const tree = useMemo<TreeRow[]>(() => {
    const count = new Map<string, number>();
    for (const e of entries) {
      if (filtering && !metricEntryIds!.has(e.id)) continue;
      for (let cur: SubCategory | undefined = subById.get(e.subcategoryId); cur; cur = cur.parentId ? subById.get(cur.parentId) : undefined) {
        if (!cur.isCategoryRoot) count.set(cur.id, (count.get(cur.id) ?? 0) + 1);
      }
      const c = subById.get(e.subcategoryId)?.categoryId;
      if (c) count.set(`c:${c}`, (count.get(`c:${c}`) ?? 0) + 1);
    }
    const out: TreeRow[] = [];
    const walk = (cat: Category, parentId: string | undefined, depth: number, trail: string[]) => {
      subs
        .filter((s) => s.categoryId === cat.id && !s.isCategoryRoot && s.parentId === parentId && (count.get(s.id) ?? 0) > 0)
        .sort((a, b) => a.order - b.order)
        .forEach((s) => {
          const p = [...trail, s.id];
          out.push({ key: [cat.id, ...p].join("/"), catId: cat.id, pathIds: p, name: s.name, icon: s.icon ?? cat.icon, color: cat.color, depth, n: count.get(s.id) ?? 0, isCat: false });
          walk(cat, s.id, depth + 1, p);
        });
    };
    [...cats]
      .filter((c) => (count.get(`c:${c.id}`) ?? 0) > 0)
      .sort((a, b) => (count.get(`c:${b.id}`) ?? 0) - (count.get(`c:${a.id}`) ?? 0))
      .forEach((c) => {
        out.push({ key: c.id, catId: c.id, pathIds: [], name: c.name, icon: c.icon, color: c.color, depth: 0, n: count.get(`c:${c.id}`) ?? 0, isCat: true });
        walk(c, undefined, 1, []);
      });
    return out;
  }, [cats, subs, entries, subById, filtering, metricEntryIds]);

  const placeText = selectedCat ? [selectedCat.name, ...path.map((s) => s.name)].slice(-2).join(" › ") : t("structure.categories");
  const placeIcon = focus?.icon ?? selectedCat?.icon;
  const curPathKey = selectedCat ? [selectedCat.id, ...path.map((s) => s.id)].join("/") : "";

  // ── Görünüm parçaları ──
  const fieldLabel = cn("block text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]", brutal ? "text-[#111]/55" : "text-muted-foreground");
  const fieldValue = cn("block truncate text-[13.5px] font-bold leading-tight", brutal ? "text-[#111]" : "text-foreground");
  const pill = (on: boolean) =>
    cn(
      "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
      on ? (brutal ? "bg-[#FFD23F] text-[#111]" : "bg-white/15") : brutal ? "border-[1.5px] border-[#111]/20 text-[#111]/70" : "bg-[var(--sf-2)] text-muted-foreground"
    );
  const rowCls = (on: boolean) =>
    cn(
      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
      on
        ? brutal
          ? "bg-[#111] text-[#FFF4DC]"
          : "bg-[var(--sf-3)] ring-1 ring-inset ring-[var(--ln-2)]"
        : brutal
          ? "hover:bg-[#111]/5"
          : "hover:bg-[var(--sf-2)]"
    );
  const tile = (color: string, icon: string | undefined, size: number, round = 9) => (
    <span
      className={cn("flex shrink-0 items-center justify-center", brutal && "border-[1.5px] border-[#111]")}
      style={{ width: size, height: size, borderRadius: round, background: brutal ? color : `${color}26` }}
    >
      {icon && <SymbolIcon name={icon} size={Math.round(size * 0.55)} style={{ color: brutal ? "#111" : color }} />}
    </span>
  );
  const atom = (m: Mod) => (
    <span className={cn("shrink-0 rounded-full", brutal && "border-[1.5px] border-[#111] bg-white")}>
      <ModAtomCore icon={atomIcon(m)} size="sm" color={modColor(m)} />
    </span>
  );

  return (
    <>
      {brutal ? (
        /* Brütal: üst menünün son satırı (bkz. AnalysisMenu) — tek beyaz
           kart, iki yarısı arasında siyah çizgi. Solda yerin karosu (kare =
           kategori), sağda özelliğin dairesi; seçimsizken Analiz'in mavisinde */
        <div
          data-scope-cells=""
          className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)] overflow-hidden rounded-[12px] border-2 bg-white shadow-[2px_2px_0_#111]"
          style={{ borderColor: "#111" }}
        >
          <button
            type="button"
            onClick={() => {
              setAllPlaces(false);
              setOpen("yer");
            }}
            aria-label="Yer seç"
            className="flex min-w-0 items-center gap-2 px-2.5 py-[7px] text-left text-[#111] active:bg-[#f5f1e8]"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2"
              style={{ background: selectedCat?.color ?? "#8ea6ff", borderColor: "#111" }}
            >
              {selectedCat ? (
                placeIcon && <SymbolIcon name={placeIcon} size={16} style={{ color: "#111" }} />
              ) : (
                <LayoutGrid className="h-4 w-4" strokeWidth={2.5} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              {/* İnildiyse üstü etikette, bulunulan yer kalın — dar hücrede
                  "Harcamalar › Ulaşım" sığmayıp "Harcamalar › …" oluyordu */}
              <span className="block truncate text-[9.5px] font-black uppercase leading-none tracking-[0.1em] text-[#111]/55">
                {focus && selectedCat
                  ? `Yer · ${path.length > 1 ? path[path.length - 2].name : selectedCat.name}`
                  : "Yer"}
              </span>
              <span className="mt-[3px] block truncate text-[13.5px] font-black leading-tight">
                {focus?.name ?? selectedCat?.name ?? t("structure.categories")}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </button>
          <button
            type="button"
            onClick={() => setOpen("ne")}
            aria-label="Özellik seç"
            className="flex min-w-0 items-center gap-2 border-l-2 px-2.5 py-[7px] text-left text-[#111] active:bg-[#f5f1e8]"
            style={{ borderLeftColor: "#111" }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
              style={{ background: currentMod ? modColor(currentMod) : "#8ea6ff", borderColor: "#111" }}
            >
              {createElement(currentMod ? atomIcon(currentMod) : ListOrdered, { className: "h-4 w-4", strokeWidth: 2.5 })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9.5px] font-black uppercase leading-none tracking-[0.1em] text-[#111]/55">Özellik</span>
              <span className="mt-[3px] block truncate text-[13.5px] font-black leading-tight">{currentMod ? currentMod.name : "Seç"}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </button>
        </div>
      ) : (
      /* Tek çerçeve, iki alan: YER | ÖZELLİK */
      <div
        data-scope-pickers=""
        className={cn(
          "flex items-stretch overflow-hidden",
          brutal
            ? "rounded-[13px] border-2 border-[#111] bg-white shadow-[2.5px_2.5px_0_#111]"
            : "rounded-2xl bg-[var(--sf-2)] ring-1 ring-inset ring-[var(--ln-1)]"
        )}
      >
        <button
          type="button"
          onClick={() => {
            setAllPlaces(false);
            setOpen("yer");
          }}
          aria-label="Yer seç"
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2 px-2.5 py-1.5 text-left",
            brutal ? "active:bg-[#111]/5" : "active:bg-[var(--sf-3)]"
          )}
        >
          {selectedCat ? (
            tile(selectedCat.color, placeIcon, 24, 7)
          ) : (
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]", brutal ? "border-[1.5px] border-[#111] bg-[#6366f1] text-white" : "bg-[var(--sf-3)]")}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={fieldLabel}>Yer</span>
            <span className={fieldValue}>{placeText}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
        <button
          type="button"
          onClick={() => setOpen("ne")}
          aria-label="Özellik seç"
          className={cn(
            "flex w-[44%] min-w-0 items-center gap-2 px-2.5 py-1.5 text-left",
            brutal ? "border-l-2 border-[#111] active:bg-[#111]/5" : "border-l border-[var(--ln-1)] active:bg-[var(--sf-3)]"
          )}
        >
          {currentMod ? (
            <span className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-[#111]/80" style={{ background: modColor(currentMod) }} />
          ) : (
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", brutal ? "border-[1.5px] border-[#111] bg-[#6366f1] text-white" : "bg-[var(--sf-3)]")}>
              <ListOrdered className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={fieldLabel}>Özellik</span>
            <span className={fieldValue}>{currentMod ? currentMod.name : "Seç"}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
      </div>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent data-scope-dialog="" className="max-h-[82vh] max-w-[370px] gap-3 overflow-y-auto p-5">
          {open === "ne" ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[17px]">Özellik</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-1">
                {(features ?? []).map((f) => {
                  const on = metricId === f.mod.id;
                  return (
                    <button
                      key={f.mod.id}
                      type="button"
                      className={rowCls(on)}
                      onClick={() => {
                        setOpen(null);
                        const catId = selectedCat?.id ?? f.topCat;
                        if (catId) onMetric(catId, f.mod.id);
                      }}
                    >
                      {atom(f.mod)}
                      <span className="truncate text-[14px] font-semibold">{f.mod.name}</span>
                      {on ? <Check className="ml-auto h-4 w-4 shrink-0" /> : <span className={pill(false)}>{f.n}</span>}
                    </button>
                  );
                })}
                {features && features.length === 0 && (
                  <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Bu dönemde burada özellik değeri yok.</p>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[17px]">Yer</DialogTitle>
              </DialogHeader>
              {currentMod && (
                <div className={cn("flex gap-1 rounded-xl p-[3px]", brutal ? "border-[1.5px] border-[#111] bg-white" : "bg-[var(--sf-2)]")}>
                  {[
                    { on: !allPlaces, label: `${currentMod.name} geçen yerler`, set: false },
                    { on: allPlaces, label: "Tüm yerler", set: true },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setAllPlaces(o.set)}
                      className={cn(
                        "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg px-2 text-[12px] font-bold",
                        o.on ? (brutal ? "bg-[#111] text-[#FFF4DC]" : "bg-card shadow-sm") : brutal ? "text-[#111]" : "text-muted-foreground"
                      )}
                    >
                      {!o.set && <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-[#111]/60" style={{ background: modColor(currentMod) }} />}
                      <span className="truncate">{o.label}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={rowCls(!selectedCat)}
                  onClick={() => {
                    setOpen(null);
                    onPlace(null, []);
                  }}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", brutal ? "border-[1.5px] border-[#111] bg-[#FFF4DC] text-[#111]" : "bg-[var(--sf-2)]")}>
                    <LayoutGrid className="h-4 w-4" />
                  </span>
                  <span className="text-[14px] font-semibold">{t("structure.categories")}</span>
                  <span className="ml-auto text-[11.5px] opacity-60">hepsi</span>
                </button>
                {tree.map((n) => {
                  const on = curPathKey === n.key;
                  return n.isCat ? (
                    <button
                      key={n.key}
                      type="button"
                      className={cn(rowCls(on), "mt-1.5")}
                      onClick={() => {
                        setOpen(null);
                        onPlace(n.catId, []);
                      }}
                    >
                      {tile(n.color, n.icon, 36, 10)}
                      <span className="truncate text-[14.5px] font-bold">{n.name}</span>
                      <span className={pill(on)}>{n.n}</span>
                    </button>
                  ) : (
                    <div key={n.key} className="flex" style={{ paddingLeft: 17 + (n.depth - 1) * 16 }}>
                      {/* Kılavuz çizgisi — kategorinin renginde */}
                      <span className="w-[2px] shrink-0 rounded-full" style={{ background: `${n.color}${brutal ? "" : "55"}`, opacity: brutal ? 0.5 : 1 }} />
                      <button
                        type="button"
                        className={cn(rowCls(on), "ml-2 py-1.5")}
                        onClick={() => {
                          setOpen(null);
                          onPlace(n.catId, n.pathIds);
                        }}
                      >
                        {tile(n.color, n.icon, 24, 7)}
                        <span className="truncate text-[13.5px] font-medium">{n.name}</span>
                        <span className={pill(on)}>{n.n}</span>
                      </button>
                    </div>
                  );
                })}
                {tree.length === 0 && <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Bu dönemde kayıt yok.</p>}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
