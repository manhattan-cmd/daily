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
 *
 * Bulunulan yerin (kategori ya da altı olan alt kategori) alt kategorileri
 * varsa özellik listesi yalnız onların HEPSİNDE ortak olanları gösterir —
 * o düzeyde ancak hepsinde olan özellik bütünü anlatır; ötekiler alt
 * kategoriye inince listede. Altı olmayan kalemde süzgeç yok.
 *
 * Ruh halinde (brütal) Mutluluk ve Duygular özel sayfada birlikte okunuyor;
 * özellik hücresi yalnız kişinin Ruh hali kategorisine kendi eklediği bir
 * özellik varsa görünür ve listede onlarla birlikte "Hepsi" (özel sayfa) durur.
 *
 * Etiket varsa sonda dar bir ETİKET hücresi: süzgeç (yalnız bu etiketli
 * yerler ya da onlar hariç). Süzgeç açıkken hücre etiketin renginde ve
 * altında kipi yazar (YALNIZ / HARİÇ); bkz. tag-filter.
 */

import { createElement, useCallback, useMemo, useState } from "react";
import { Check, ChevronDown, LayoutGrid, ListOrdered } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { loadCommonModIds } from "@/lib/db/queries";
import { SymbolIcon } from "@/lib/icons";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { translate, useLocale, useT } from "@/lib/i18n";
import { modColor } from "@/lib/mod-color";
import { moodText } from "@/lib/icons/emotions";
import { isMoodModName } from "@/lib/mood-analytics";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Category, Entry, Mod, SubCategory, Tag } from "@/types";
import { blockFill, blockInk, fillStyle } from "@/lib/fill";
import type { TagFilter } from "@/lib/tags";
import { TagGlyph } from "@/components/ui/tag-glyph";

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
  /** Etiketler — boşsa etiket hücresi yok */
  tags?: Tag[];
  tagFilter?: TagFilter | null;
  /** Dönemde etiket başına girdi (süzgeçsiz) */
  tagCounts?: Map<string, number>;
  onTagFilter?: (f: TagFilter | null) => void;
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

export function ScopePickers({ cats, subs, entries, selectedCat, path, metricId, onPlace, onMetric, tags, tagFilter, tagCounts, onTagFilter }: Props) {
  const t = useT();
  const brutal = isBlockSkin(useSkin());
  const [open, setOpen] = useState<"ne" | "yer" | "etiket" | null>(null);
  // Etiket listesinde seçilecek kip — açılışta süzgecinki
  const [tagMode, setTagMode] = useState<TagFilter["mode"]>("only");
  const showTags = !!onTagFilter && (tags?.length ?? 0) > 0;
  const activeTag = tagFilter ? tags?.find((x) => x.id === tagFilter.tagId) : undefined;
  const modeShort = tagFilter?.mode === "exclude" ? t("an.tag.modeShortExclude") : t("an.tag.modeShortOnly");
  // Sade temada etiket hücresinin zemini: koyu zeminde rengin saydamı (blok
  // dilinin renk değişkenleri orada yok — bilerek JSX dışında)
  const plainTagStyle = activeTag ? { backgroundColor: activeTag.color + "2e" } : undefined;
  const openTags = () => {
    setTagMode(tagFilter?.mode ?? "only");
    setOpen("etiket");
  };
  // Yer listesinde özellik süzgecini kaldır
  const [allPlaces, setAllPlaces] = useState(false);

  const subById = useMemo(() => new Map(subs.map((s) => [s.id, s])), [subs]);
  const focus = path[path.length - 1] ?? null;
  // Yerleşik ruh halinin adları kayıtta İngilizce ("Mood", "Emotions") — dile çevrilir
  const moodCatIds = useMemo(() => new Set(cats.filter((c) => c.builtInKey === "mood").map((c) => c.id)), [cats]);
  const locale = useLocale();
  const local = useCallback(
    (name: string, catId: string | undefined) =>
      catId && moodCatIds.has(catId) ? moodText(name, (k) => translate(k, undefined, locale)) : name,
    [moodCatIds, locale]
  );
  const inMood = !!selectedCat && moodCatIds.has(selectedCat.id);
  const modName = (m: Mod, catId = selectedCat?.id) => local(m.name, catId);
  // Ruh halinin özel sayfası mutluluğu ve duyguları birlikte okuyor (bkz. MoodPanel)
  const noMetric = inMood ? t("moodan.allFeatures") : "Seç";

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

  // Yerin alt kategorilerinin hepsinde ortak özellikler; altı yoksa süzgeç yok
  const commonCatId = selectedCat?.id ?? null;
  const commonSubId = focus?.id;
  const common = useLiveQuery(
    async () => ({ ids: commonCatId ? await loadCommonModIds(commonCatId, commonSubId) : null }),
    [commonCatId, commonSubId]
  );
  const commonOn = !!commonCatId && !!common?.ids;

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
  // Seçili özellik ortak olmasa da listede kalır (alt kategoriden çıkılınca
  // seçim taşınıyor — işaretsiz kalmasın)
  const listed = commonOn ? features?.filter((f) => common!.ids!.has(f.mod.id) || f.mod.id === metricId) : features;
  const filtering = !!metricEntryIds && !allPlaces;
  // Ruh halinde kişinin eklediği özellikler; yoksa özellik hücresi gizli
  const moodExtras = inMood ? (listed ?? []).filter((f) => !isMoodModName(f.mod.name)) : [];
  const moodMenu = brutal && inMood;
  const hideMetric = moodMenu && moodExtras.length === 0;
  // Yerleşik ruh hali özelliği seçili kalmışsa (eski seçim) hücrede "Hepsi"
  const cellMod = moodMenu && currentMod && isMoodModName(currentMod.name) ? undefined : currentMod;

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
          out.push({ key: [cat.id, ...p].join("/"), catId: cat.id, pathIds: p, name: local(s.name, cat.id), icon: s.icon ?? cat.icon, color: cat.color, depth, n: count.get(s.id) ?? 0, isCat: false });
          walk(cat, s.id, depth + 1, p);
        });
    };
    [...cats]
      .filter((c) => (count.get(`c:${c.id}`) ?? 0) > 0)
      .sort((a, b) => (count.get(`c:${b.id}`) ?? 0) - (count.get(`c:${a.id}`) ?? 0))
      .forEach((c) => {
        out.push({ key: c.id, catId: c.id, pathIds: [], name: local(c.name, c.id), icon: c.icon, color: c.color, depth: 0, n: count.get(`c:${c.id}`) ?? 0, isCat: true });
        walk(c, undefined, 1, []);
      });
    return out;
  }, [cats, subs, entries, subById, filtering, metricEntryIds, local]);

  const placeText = selectedCat ? [selectedCat.name, ...path.map((s) => s.name)].map((x) => local(x, selectedCat.id)).slice(-2).join(" › ") : t("structure.categories");
  const placeIcon = focus?.icon ?? selectedCat?.icon;
  const curPathKey = selectedCat ? [selectedCat.id, ...path.map((s) => s.id)].join("/") : "";

  // ── Görünüm parçaları ──
  const fieldLabel = cn("block text-[9.5px] font-bold uppercase leading-none tracking-[0.12em]", brutal ? "text-ink/55" : "text-muted-foreground");
  const fieldValue = cn("block truncate text-[13.5px] font-bold leading-tight", brutal ? "text-ink" : "text-foreground");
  const pill = (on: boolean) =>
    cn(
      "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums",
      on ? (brutal ? "bg-[#FFD23F] text-ink" : "bg-white/15") : brutal ? "border-[1.5px] border-ink/20 text-ink/70" : "bg-[var(--sf-2)] text-muted-foreground"
    );
  const rowCls = (on: boolean) =>
    cn(
      "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
      on
        ? brutal
          ? "bg-well text-[#FFF4DC]"
          : "bg-[var(--sf-3)] ring-1 ring-inset ring-[var(--ln-2)]"
        : brutal
          ? "hover:bg-ink/5"
          : "hover:bg-[var(--sf-2)]"
    );
  const tile = (color: string, icon: string | undefined, size: number, round = 9) => (
    <span
      className={cn("flex shrink-0 items-center justify-center", brutal && "border-[1.5px] border-line")}
      style={{ width: size, height: size, borderRadius: round, background: brutal ? blockFill(color) : blockFill(`${color}26`) }}
    >
      {icon && <SymbolIcon name={icon} size={Math.round(size * 0.55)} style={{ color: brutal ? "var(--ink)" : color }} />}
    </span>
  );
  const atom = (m: Mod) => (
    <span className={cn("shrink-0 rounded-full", brutal && "border-[1.5px] border-line bg-paper")}>
      <ModAtomCore icon={atomIcon(m)} size="sm" color={modColor(m)} />
    </span>
  );

  return (
    <>
      {brutal ? (
        /* Brütal: Analiz'in kontrol bloğunun son satırı (bkz. AnalysisDeck) —
           iki hücre, arasında bloğun 2 px çizgisi; çerçeveyi blok çiziyor.
           Solda yerin karosu (kare = kategori), sağda özelliğin dairesi;
           seçimsizken Analiz'in mavisinde */
        <div
          data-scope-cells=""
          className={cn(
            "grid bg-paper",
            hideMetric
              ? showTags
                ? "grid-cols-[minmax(0,1fr)_auto]"
                : "grid-cols-1"
              : showTags
                ? "grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)_auto]"
                : "grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]"
          )}
        >
          <button
            type="button"
            onClick={() => {
              setAllPlaces(false);
              setOpen("yer");
            }}
            aria-label="Yer seç"
            className="flex min-w-0 items-center gap-2 px-2.5 py-2 text-left text-ink active:bg-paper-2"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border-2"
              style={{ background: blockFill(selectedCat?.color ?? "#8ea6ff"), borderColor: "var(--line)" }}
            >
              {selectedCat ? (
                placeIcon && <SymbolIcon name={placeIcon} size={16} style={{ color: blockInk(selectedCat?.color ?? "#8ea6ff") }} />
              ) : (
                <LayoutGrid className="h-4 w-4" strokeWidth={2.5} />
              )}
            </span>
            <span className="min-w-0 flex-1">
              {/* İnildiyse üstü etikette, bulunulan yer kalın — dar hücrede
                  "Harcamalar › Ulaşım" sığmayıp "Harcamalar › …" oluyordu */}
              <span className="block truncate text-[9.5px] font-black uppercase leading-none tracking-[0.1em] text-ink/55">
                {focus && selectedCat
                  ? `Yer · ${local(path.length > 1 ? path[path.length - 2].name : selectedCat.name, selectedCat.id)}`
                  : "Yer"}
              </span>
              <span className="mt-[3px] block truncate text-[13.5px] font-black leading-tight">
                {selectedCat ? local(focus?.name ?? selectedCat.name, selectedCat.id) : t("structure.categories")}
              </span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </button>
          {!hideMetric && (
          <button
            type="button"
            onClick={() => setOpen("ne")}
            aria-label="Özellik seç"
            className="flex min-w-0 items-center gap-2 border-l-2 px-2.5 py-2 text-left text-ink active:bg-paper-2"
            style={{ borderLeftColor: "var(--line)" }}
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2"
              style={{ background: cellMod ? blockFill(modColor(cellMod)) : blockFill("#8ea6ff"), borderColor: "var(--line)" }}
            >
              {createElement(cellMod ? atomIcon(cellMod) : ListOrdered, { className: "h-4 w-4", strokeWidth: 2.5 })}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[9.5px] font-black uppercase leading-none tracking-[0.1em] text-ink/55">Özellik</span>
              <span className="mt-[3px] block truncate text-[13.5px] font-black leading-tight">{cellMod ? modName(cellMod) : noMetric}</span>
            </span>
            <ChevronDown className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </button>
          )}
          {showTags && (
            <button
              type="button"
              onClick={openTags}
              aria-label={t("an.tag.pick")}
              title={activeTag ? t(tagFilter!.mode === "only" ? "an.tag.headOnly" : "an.tag.headExclude", { name: activeTag.name }) : t("an.tag.pick")}
              data-tag-cell=""
              data-on={activeTag ? "" : undefined}
              className="flex w-[54px] flex-col items-center justify-center gap-[5px] border-l-2 px-1 py-2 text-ink active:bg-paper-2"
              style={{ borderLeftColor: "var(--line)", ...(activeTag ? fillStyle(activeTag.color) : {}) }}
            >
              <TagGlyph color={activeTag?.color ?? "#8ea6ff"} size={15} hollow={!activeTag} />
              <span className="text-[8.5px] font-black uppercase leading-none tracking-[0.08em]">
                {activeTag ? modeShort : t("an.tag.cell")}
              </span>
            </button>
          )}
        </div>
      ) : (
      /* Tek çerçeve, iki alan: YER | ÖZELLİK */
      <div
        data-scope-pickers=""
        className={cn(
          "flex items-stretch overflow-hidden",
          brutal
            ? "rounded-[13px] border-2 border-line bg-paper shadow-[2.5px_2.5px_0_var(--shade)]"
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
            brutal ? "active:bg-ink/5" : "active:bg-[var(--sf-3)]"
          )}
        >
          {selectedCat ? (
            tile(selectedCat.color, placeIcon, 24, 7)
          ) : (
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px]", brutal ? "border-[1.5px] border-line bg-[#6366f1] text-white" : "bg-[var(--sf-3)]")}>
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
            brutal ? "border-l-2 border-line active:bg-ink/5" : "border-l border-[var(--ln-1)] active:bg-[var(--sf-3)]"
          )}
        >
          {currentMod ? (
            <span className="h-6 w-6 shrink-0 rounded-full border-[1.5px] border-ink/80" style={{ background: modColor(currentMod) }} />
          ) : (
            <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full", brutal ? "border-[1.5px] border-line bg-[#6366f1] text-white" : "bg-[var(--sf-3)]")}>
              <ListOrdered className="h-3.5 w-3.5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className={fieldLabel}>Özellik</span>
            <span className={fieldValue}>{currentMod ? modName(currentMod) : noMetric}</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </button>
        {showTags && (
          <button
            type="button"
            onClick={openTags}
            aria-label={t("an.tag.pick")}
            data-tag-cell=""
            className="flex w-12 shrink-0 flex-col items-center justify-center gap-1 border-l border-[var(--ln-1)] px-1 active:bg-[var(--sf-3)]"
            style={plainTagStyle}
          >
            <TagGlyph color={activeTag?.color ?? "#8ea6ff"} size={14} hollow={!activeTag} className={activeTag ? undefined : "text-muted-foreground"} />
            <span className="text-[8.5px] font-bold uppercase leading-none tracking-[0.08em] text-muted-foreground">
              {activeTag ? modeShort : t("an.tag.cell")}
            </span>
          </button>
        )}
      </div>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent data-scope-dialog="" className="max-h-[82vh] max-w-[370px] gap-3 overflow-y-auto p-5">
          {open === "etiket" ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[17px]">{t("an.tag.cell")}</DialogTitle>
                <p className={cn("text-[12px] leading-snug", brutal ? "text-ink/60" : "text-muted-foreground")}>{t("an.tag.howto")}</p>
              </DialogHeader>
              {/* Kip: yalnız bu etiketli yerler ya da onlar hariç; süzgeç açıksa anında işler */}
              <div data-tag-mode="" className={cn("flex gap-1 rounded-xl p-[3px]", brutal ? "border-[1.5px] border-line bg-paper" : "bg-[var(--sf-2)]")}>
                {(["only", "exclude"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={tagMode === m}
                    onClick={() => {
                      setTagMode(m);
                      if (tagFilter && tagFilter.mode !== m) onTagFilter?.({ tagId: tagFilter.tagId, mode: m });
                    }}
                    className={cn(
                      "flex h-8 min-w-0 flex-1 items-center justify-center truncate rounded-lg px-2 text-[12.5px] font-bold",
                      tagMode === m ? (brutal ? "bg-well text-[#FFF4DC]" : "bg-card shadow-sm") : brutal ? "text-ink" : "text-muted-foreground"
                    )}
                  >
                    {t(m === "only" ? "an.tag.only" : "an.tag.exclude")}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  className={rowCls(!activeTag)}
                  onClick={() => {
                    setOpen(null);
                    if (tagFilter) onTagFilter?.(null);
                  }}
                >
                  <span className={cn("flex h-7 w-9 shrink-0 items-center justify-center rounded-[9px]", brutal ? "border-[1.5px] border-line bg-floor text-ink" : "bg-[var(--sf-2)]")}>
                    <LayoutGrid className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold">{t("an.tag.all")}</span>
                    <span className="block truncate text-[11.5px] opacity-60">{t("an.tag.allHint")}</span>
                  </span>
                  {!activeTag && <Check className="ml-auto h-4 w-4 shrink-0" />}
                </button>
                {(tags ?? []).map((tag) => {
                  const on = activeTag?.id === tag.id;
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      data-tag-option=""
                      className={rowCls(on)}
                      onClick={() => {
                        setOpen(null);
                        onTagFilter?.({ tagId: tag.id, mode: tagMode });
                      }}
                    >
                      <span className="flex w-9 shrink-0 justify-center">
                        <TagGlyph color={tag.color} size={18} />
                      </span>
                      <span className="truncate text-[14px] font-semibold">{tag.name}</span>
                      {on ? <Check className="ml-auto h-4 w-4 shrink-0" /> : <span className={pill(false)}>{tagCounts?.get(tag.id) ?? 0}</span>}
                    </button>
                  );
                })}
              </div>
            </>
          ) : open === "ne" ? (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[17px]">Özellik</DialogTitle>
                {commonOn && !moodMenu && (
                  <p data-common-hint="" className={cn("text-[12px] leading-snug", brutal ? "text-ink/60" : "text-muted-foreground")}>
                    {t("an.commonOnly", { place: selectedCat ? local(focus?.name ?? selectedCat.name, selectedCat.id) : "" })}
                  </p>
                )}
              </DialogHeader>
              <div className="flex flex-col gap-1">
                {moodMenu && selectedCat && (
                  <button
                    type="button"
                    className={rowCls(!cellMod)}
                    onClick={() => {
                      setOpen(null);
                      onMetric(selectedCat.id, "count");
                    }}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line bg-fill-[#8ea6ff] text-ink">
                      <ListOrdered className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{t("moodan.allFeatures")}</span>
                      <span className="block truncate text-[11.5px] opacity-60">{t("moodan.allFeaturesHint")}</span>
                    </span>
                    {!cellMod && <Check className="ml-auto h-4 w-4 shrink-0" />}
                  </button>
                )}
                {((moodMenu ? moodExtras : listed) ?? []).map((f) => {
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
                      <span className="truncate text-[14px] font-semibold">{modName(f.mod, selectedCat?.id ?? f.topCat)}</span>
                      {on ? <Check className="ml-auto h-4 w-4 shrink-0" /> : <span className={pill(false)}>{f.n}</span>}
                    </button>
                  );
                })}
                {features && features.length === 0 && (
                  <p className="px-2.5 py-3 text-[13px] text-muted-foreground">Bu dönemde burada özellik değeri yok.</p>
                )}
                {features && features.length > 0 && listed?.length === 0 && (
                  <p className="px-2.5 py-3 text-[13px] text-muted-foreground">{t("an.noCommon")}</p>
                )}
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="text-left">
                <DialogTitle className="text-[17px]">Yer</DialogTitle>
              </DialogHeader>
              {currentMod && (
                <div className={cn("flex gap-1 rounded-xl p-[3px]", brutal ? "border-[1.5px] border-line bg-paper" : "bg-[var(--sf-2)]")}>
                  {[
                    { on: !allPlaces, label: `${modName(currentMod)} geçen yerler`, set: false },
                    { on: allPlaces, label: "Tüm yerler", set: true },
                  ].map((o) => (
                    <button
                      key={o.label}
                      type="button"
                      onClick={() => setAllPlaces(o.set)}
                      className={cn(
                        "flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 truncate rounded-lg px-2 text-[12px] font-bold",
                        o.on ? (brutal ? "bg-well text-[#FFF4DC]" : "bg-card shadow-sm") : brutal ? "text-ink" : "text-muted-foreground"
                      )}
                    >
                      {!o.set && <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-ink/60" style={{ background: modColor(currentMod) }} />}
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
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]", brutal ? "border-[1.5px] border-line bg-floor text-ink" : "bg-[var(--sf-2)]")}>
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
