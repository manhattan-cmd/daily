"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import {
  loadUsageCounts,
  USAGE_COUNTS_KEY,
  useCachedLiveQuery,
} from "@/lib/db/live-cache";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, SubCategory } from "@/types";
import { routes } from "@/lib/routes";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Hızlı ekle bölmesindeki en fazla kalem */
const QUICK_MAX = 8;
/** Rayın ilk durağı — kategori değil, hızlı ekle bölmesi */
const QUICK = "quick";

/**
 * Hızlı eklemeye elle sabitlenen kalemler (localStorage).
 *
 * Bölme kendiliğinden en çok kullanılanlarla doluyor ama bu her zaman
 * yetmiyor: yeni edinilen bir alışkanlık daha sayı biriktirmediği için
 * oraya giremiyor, oysa kullanıcının en çok gireceği yer tam da orası.
 * Sabitlenenler önde, kalan yerleri sıklık dolduruyor.
 *
 * Cihazda kalan bir görünüm tercihi olduğu için localStorage yetiyor —
 * Dexie'ye tablo açmak yedek/senkron yüzeyini de büyütürdü.
 */
const LS_PINS = "entrypicker:pins";
/** Rayda en son bakılan durak — pencere yeniden açılınca oradan başlar */
const LS_RAIL = "entrypicker:rail";

function readPins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PINS) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // okunamayan tercih sessizce boş sayılır
  }
}
function readRail(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(LS_RAIL);
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

type Result =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory; path: string; kids: number };

/**
 * Girdi eklerken "nereye" sorusunun cevabı — RAY düzeni.
 *
 * Solda dikey kategori rayı, sağda seçilen kategorinin BÜTÜN kalemleri.
 * Eskiden her kademe yeni bir sayfaydı: "Harcamalar › Yemek › Dışardan
 * Yemek" için iki sayfa ileri, yanlışta iki sayfa geri. Şimdi sayfa hiç
 * değişmiyor; kategoriye dokunmak yalnız sağ bölmeyi değiştiriyor, alt
 * kalemler kendi grubunda girintili duruyor. Kategori adları rayda hep
 * okunur.
 *
 * Bir süre burada bir sinir ağı vardı (Yapı > Harita'ya taşındı): girdi
 * eklemek SERİ bir iş, seçicinin ölçüsü hız.
 */
export function EntryPicker({
  groups,
  onPick,
  onPickCategory,
  onClose,
  onCreateCategory,
}: {
  groups: NetGroup[] | undefined;
  /**
   * Bir kaleme kayıt aç. Seçicinin tek çıkışı bu: kaleme dokunmak, hızlı
   * ekle ve dalın kendisi aynı yüzeyi açıyor.
   */
  onPick: (sub: SubCategory) => void;
  onPickCategory: (category: Category) => void;
  onClose: () => void;
  /** Ana kategori yaratma formunu aç — ⋯ menüsünde */
  onCreateCategory?: () => void;
}) {
  const t = useT();
  const [rail, setRailState] = useState<string>(() => readRail() ?? QUICK);
  // Kullanıcı raya kendisi dokunduysa boş "Hızlı ekle"den kaçırılmaz
  const [railTouched, setRailTouched] = useState(false);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  // Aramadan bir dala gelinince o grup ortalanıp kısa süre vurgulanır
  const [flashId, setFlashId] = useState<string | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  // Hızlı eklemeye elle eklenenler + onları seçtiren panel
  const [pins, setPins] = useState<string[]>(readPins);
  const [pinOpen, setPinOpen] = useState(false);

  function setRail(id: string) {
    setRailState(id);
    setRailTouched(true);
    try {
      localStorage.setItem(LS_RAIL, id);
    } catch {
      /* kalıcı yazılamazsa oturum boyunca geçerli */
    }
  }

  function togglePin(id: string) {
    setPins((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem(LS_PINS, JSON.stringify(next));
      } catch {
        /* kalıcı yazılamazsa oturum boyunca geçerli */
      }
      return next;
    });
  }

  const categories = useMemo(
    () => (groups ?? []).map((g) => g.category),
    [groups]
  );
  const visibleSubs = useMemo(
    () =>
      (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [visibleSubs]);
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const topSubsByCat = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.topSubs])),
    [groups]
  );

  /** Kalemin yolu — "Harcamalar › Yemek"; aynı adlı iki kalemi ayırır */
  const pathOf = useMemo(
    () => (s: SubCategory) => {
      const parts: string[] = [];
      let cur = s.parentId ? subById.get(s.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
      return [catById.get(s.categoryId)?.name, ...parts]
        .filter(Boolean)
        .join(" › ");
    },
    [subById, catById]
  );

  // Sayım son 30 güne bakıyor (lib/usage): "sık kullanılanlar" şu anki
  // hayatı göstermeli, arşivi değil.
  const entryCounts =
    useCachedLiveQuery(USAGE_COUNTS_KEY, loadUsageCounts) ?? NO_COUNTS;

  /**
   * Hızlı ekle — ağacın HER YERİNDEN, en çok kayıt alan kalemler. Önce
   * elle sabitlenenler (kullanıcının sırasıyla), sonra sıklık. Sayım
   * kalemin KENDİ girdisi: dokunulunca kayıt oraya gidecek.
   */
  const quick = useMemo(() => {
    const pinned = pins
      .map((id) => subById.get(id))
      .filter((s): s is SubCategory => !!s);
    const seen = new Set(pinned.map((s) => s.id));
    const byUse = visibleSubs
      .filter((s) => !seen.has(s.id))
      .map((sub) => ({ sub, n: entryCounts.get(sub.id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.sub);
    return [...pinned, ...byUse].slice(0, QUICK_MAX);
  }, [visibleSubs, subById, entryCounts, pins]);

  /** Hızlı eklemeye eklenebilecekler: bütün kalemler, sabitlenmişler üstte */
  const pinCandidates = useMemo(
    () =>
      visibleSubs
        .map((sub) => ({
          id: sub.id,
          name: sub.name,
          icon: sub.icon,
          color: catById.get(sub.categoryId)?.color ?? "#818cf8",
          path: pathOf(sub),
        }))
        .sort((a, b) => {
          const pa = pins.indexOf(a.id);
          const pb = pins.indexOf(b.id);
          if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
          return a.path.localeCompare(b.path, "en") || a.name.localeCompare(b.name, "en");
        }),
    [visibleSubs, catById, pins, pathOf]
  );

  /*
   * Gösterilen durak. Hızlı ekle boşken (yeni kullanıcı, sabitleme yok)
   * açılış ilk kategoriye düşer — boş bir bölmeyle karşılamasın. Kullanıcı
   * raydan "Hızlı"ya kendisi dokunduysa boş hâli (sabitleme düğmesiyle)
   * görür. Silinmiş bir kategori hatırlanmışsa da yine ilk kategoriye.
   */
  const firstCat = categories[0]?.id ?? QUICK;
  const railSel =
    rail === QUICK
      ? quick.length === 0 && !railTouched
        ? firstCat
        : QUICK
      : catById.has(rail)
        ? rail
        : firstCat;
  const selCat = railSel === QUICK ? null : catById.get(railSel) ?? null;

  /** Arama BÜTÜN ağaçta — kategoriler ve her derinlikteki kalemler */
  const q = norm(query);
  const results = useMemo<Result[] | null>(() => {
    if (!q) return null;
    const cats = categories
      .filter((c) => norm(c.name).includes(q))
      .map<Result>((cat) => ({ kind: "cat", cat }));
    const subs = visibleSubs
      .filter((s) => norm(s.name).includes(q))
      .slice(0, 40)
      .map<Result>((sub) => ({
        kind: "sub",
        sub,
        path: pathOf(sub),
        kids: childrenMap.get(sub.id)?.length ?? 0,
      }));
    return [...cats, ...subs];
  }, [q, categories, visibleSubs, childrenMap, pathOf]);

  /**
   * Arama sonucuna dokunmak: kategori → rayda o kategori; alt kalemi olan
   * bir dal → kategorisi açılır ve dalın grubu ortalanıp vurgulanır (altına
   * bakmak isteyen dalı arıyor); yaprak → doğrudan form.
   */
  function openResult(r: Result) {
    setQuery("");
    if (r.kind === "cat") {
      setRail(r.cat.id);
      return;
    }
    if (r.kids === 0) {
      onPick(r.sub);
      return;
    }
    setRail(r.sub.categoryId);
    setFlashId(r.sub.id);
  }
  useEffect(() => {
    if (!flashId) return;
    const el = paneRef.current?.querySelector(`[data-sub="${flashId}"]`);
    el?.scrollIntoView({ block: "center" });
    const tm = setTimeout(() => setFlashId(null), 1400);
    return () => clearTimeout(tm);
  }, [flashId]);

  // Durak değişince bölme başa döner
  useEffect(() => {
    if (!flashId) paneRef.current?.scrollTo({ top: 0 });
    // flashId'de kendi kaydırması var
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railSel]);

  const accent = selCat?.color ?? "#818cf8";

  /** Bir dalı (ve altını) çizer — alt kalemi olan dal kendi grubunda */
  function renderSub(sub: SubCategory, depth: number): React.ReactNode {
    const kids = childrenMap.get(sub.id) ?? [];
    const color = catById.get(sub.categoryId)?.color ?? accent;
    const flashing = flashId === sub.id;
    if (kids.length === 0) {
      return (
        <PaneRow
          key={sub.id}
          dataSub={sub.id}
          color={color}
          icon={sub.icon}
          name={sub.name}
          small={depth > 0}
          flashing={flashing}
          onClick={() => onPick(sub)}
        />
      );
    }
    return (
      <div
        key={sub.id}
        data-sub={sub.id}
        className={cn(
          "flex flex-col rounded-2xl p-1 transition-shadow duration-500",
          depth === 0 ? "my-1 bg-[var(--sf-1)]" : "bg-[var(--sf-2)]"
        )}
        style={flashing ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
      >
        <PaneRow
          color={color}
          icon={sub.icon}
          name={sub.name}
          sub={t("entry.subCount", { n: kids.length })}
          small={depth > 0}
          plus
          onClick={() => onPick(sub)}
        />
        <div className="flex flex-col pl-3">
          {kids.map((k) => renderSub(k, depth + 1))}
        </div>
      </div>
    );
  }

  const structureHref = selCat ? routes.structureCategory(selCat.id) : "";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Üst çubuk — solda kapat, ortada soru, sağda yapı işlemleri (⋯).
          Yapı kurmak girdi eklemeye gelen kişinin ilk işi değil; eskiden
          "Kategori yarat" ekranın en görünür düğmesiydi. */}
      <div className="flex shrink-0 items-center gap-2 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={onClose}
          aria-label={t("action.close")}
          className={ROUND}
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold tracking-tight">
          {t("entry.pickTitle")}
        </h2>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={t("entry.moreActions")}
          aria-expanded={menuOpen}
          className={ROUND}
        >
          <MoreHorizontal className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="shrink-0 px-4 pb-3 pt-2">
        <label className="flex h-11 items-center gap-2.5 rounded-2xl bg-[var(--sf-2)] px-4 ring-1 ring-inset ring-[var(--ln-1)] transition-shadow focus-within:ring-2 focus-within:ring-primary/50">
          <Search className="h-[18px] w-[18px] shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("entry.searchAll")}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-muted-foreground/60 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("action.close")}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sf-4)] text-muted-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
      </div>

      {results ? (
        /* Aramada ray çekilir: sonuçlar yollarıyla birlikte tam genişlikte */
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3"
          style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
        >
          {results.length === 0 ? (
            <p className="px-1 py-10 text-center text-sm text-muted-foreground">
              {t("entry.noMatch")}
            </p>
          ) : (
            <div className="entry-stagger flex flex-col">
              {results.map((r) =>
                r.kind === "cat" ? (
                  <PaneRow
                    key={r.cat.id}
                    color={r.cat.color}
                    icon={r.cat.icon}
                    name={r.cat.name}
                    sub={t("structure.categories")}
                    onClick={() => openResult(r)}
                  />
                ) : (
                  <PaneRow
                    key={r.sub.id}
                    color={catById.get(r.sub.categoryId)?.color ?? "#818cf8"}
                    icon={r.sub.icon}
                    name={r.sub.name}
                    sub={r.path}
                    onClick={() => openResult(r)}
                  />
                )
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* RAY — hızlı ekle + kategoriler. Seçili durak kendi renginde
              zeminlenir; adlar hep okunur. */}
          <nav
            className="no-scrollbar flex w-[78px] shrink-0 flex-col gap-1 overflow-y-auto overscroll-contain pl-2.5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <RailItem
              active={railSel === QUICK}
              activeBg="var(--sf-3)"
              label={t("entry.quickShort")}
              onClick={() => setRail(QUICK)}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[var(--sf-3)]">
                <Star className="h-[17px] w-[17px] fill-amber-400 text-amber-400" />
              </span>
            </RailItem>
            {categories.map((c) => (
              <RailItem
                key={c.id}
                active={railSel === c.id}
                activeBg={`${c.color}29`}
                label={c.name}
                onClick={() => setRail(c.id)}
              >
                <Tile color={c.color} icon={c.icon} size={36} />
              </RailItem>
            ))}
          </nav>

          {/* BÖLME — seçilen durağın bütün kalemleri */}
          <div
            ref={paneRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pl-2 pr-3"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
          >
            <div key={railSel} className="entry-stagger flex flex-col">
              {selCat == null ? (
                <>
                  <PaneHead
                    title={t("entry.quickAdd")}
                    action={
                      <button
                        type="button"
                        onClick={() => setPinOpen(true)}
                        className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        {quick.length ? t("action.edit") : t("action.add")}
                      </button>
                    }
                  />
                  {quick.length > 0 ? (
                    quick.map((sub) => (
                      <PaneRow
                        key={sub.id}
                        color={catById.get(sub.categoryId)?.color ?? "#818cf8"}
                        icon={sub.icon}
                        name={sub.name}
                        sub={pathOf(sub)}
                        onClick={() => onPick(sub)}
                      />
                    ))
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPinOpen(true)}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Plus className="h-4 w-4" />
                      {t("entry.pinTitle")}
                    </button>
                  )}
                </>
              ) : (
                <>
                  {/* Kategorinin kendisine kayıt başlıkta, küçük bir düğme —
                      eskiden ayrı, iri bir "Buraya ekle" şeridiydi */}
                  <PaneHead
                    title={selCat.name}
                    action={
                      <button
                        type="button"
                        onClick={() => onPickCategory(selCat)}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-semibold transition-transform active:scale-95"
                        style={{ background: `${selCat.color}24`, color: selCat.color }}
                      >
                        <Plus className="h-3.5 w-3.5" strokeWidth={2.75} />
                        {t("entry.general")}
                      </button>
                    }
                  />
                  {(topSubsByCat.get(selCat.id) ?? []).map((s) => renderSub(s, 0))}
                  {(topSubsByCat.get(selCat.id) ?? []).length === 0 && (
                    <button
                      type="button"
                      onClick={() => setAddSub({ categoryId: selCat.id })}
                      className="mt-1 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] py-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <FolderPlus className="h-4 w-4" />
                      {t("tree.createSubcategory")}
                    </button>
                  )}
                </>
              )}
              {categories.length === 0 && (
                <p className="px-1 py-10 text-center text-sm text-muted-foreground">
                  {t("tree.noCategoriesYet")}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ⋯ — yapı işlemleri. Ayrı diyalog değil, aynı yüzeyde küçük bir
          menü: üst üste açılan diyaloglar bu uygulamada kırılgan. */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-30" onClick={() => setMenuOpen(false)} />
          <div className="animate-in fade-in zoom-in-95 absolute right-4 top-[60px] z-40 flex min-w-[220px] flex-col overflow-hidden rounded-2xl border border-[var(--ln-2)] bg-card p-1 shadow-[0_18px_40px_-12px_rgba(0,0,0,0.8)]">
            {onCreateCategory && (
              <MenuItem
                icon={<Plus className="h-4 w-4" strokeWidth={2.25} />}
                label={t("entry.createCategory")}
                onClick={() => {
                  setMenuOpen(false);
                  onCreateCategory();
                }}
              />
            )}
            {selCat && (
              <MenuItem
                icon={<FolderPlus className="h-4 w-4" />}
                label={t("tree.createSubcategory")}
                hint={selCat.name}
                onClick={() => {
                  setMenuOpen(false);
                  setAddSub({ categoryId: selCat.id });
                }}
              />
            )}
            {selCat && (
              /* prefetch açıkça: pencere içindeki bağlantıda görünürlük
                 tabanlı önden çekme tetiklenmiyor */
              <Link
                href={structureHref}
                prefetch
                onClick={onClose}
                className={MENU_ITEM}
              >
                <Layers className="h-4 w-4 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block">{t("tree.structurePage")}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {selCat.name}
                  </span>
                </span>
              </Link>
            )}
          </div>
        </>
      )}

      {/* ── Hızlı eklemeye ekle ─────────────────────────────────────────
          Ayrı bir diyalog değil, aynı yüzeyin üstünde bir panel. Seçilen
          kalem bölmede en öne geçiyor, tekrar dokunmak çıkarıyor. */}
      {pinOpen && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setPinOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-2xl border-t border-[var(--ln-2)] bg-background">
            <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight">
                  {t("entry.pinTitle")}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">
                  {t("entry.pinHint")}
                </div>
              </div>
              <button
                onClick={() => setPinOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-6">
              <div className="overflow-hidden rounded-xl border border-[var(--ln-1)] bg-[var(--sf-1)]">
                {pinCandidates.map((c) => {
                  const on = pins.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => togglePin(c.id)}
                      aria-pressed={on}
                      className="flex min-h-[56px] w-full items-center gap-3 border-t border-[var(--ln-1)] px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]"
                    >
                      <Tile color={c.color} icon={c.icon} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-5 text-foreground">
                          {c.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                          {c.path}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                          on ? "text-white" : "bg-[var(--sf-2)] text-muted-foreground/50"
                        )}
                        style={on ? { backgroundColor: c.color } : undefined}
                      >
                        {on ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />
    </div>
  );
}

/**
 * Karonun üstünde okunacak mürekkep. Sarı, limon, açık turkuaz gibi
 * renklerde beyaz simge kayboluyor; parlaklığa göre siyaha dönüyor.
 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return L > 0.45 ? "#0b0c10" : "#ffffff";
}

/**
 * Kalemin karosu — DOLU renk, üstünde okunur bir simge.
 *
 * İki uçtan da dönüldü. Önce dışa ışıyan bir haleydi ve liste boyunca
 * tekrarlayınca sayfa uzay boşluğuna dönüyordu; sonra rengi %16 alfaya
 * indirdik ve bu sefer her şey soldu. Doğrusu ortada değil, başka bir
 * yerde: renk TAM doygun ama ışımıyor. Karo listenin renk çıpası,
 * gerisi nötr kalıyor.
 */
function Tile({
  color,
  icon,
  fallback: Fallback = Folder,
  size = 40,
}: {
  color: string;
  icon?: string;
  fallback?: typeof Folder;
  size?: number;
}) {
  const ink = inkOn(color);
  const glyph = Math.round(size * 0.5);
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: color,
        // Üstten gelen ince ışık + koyu çeper: dolu renk yassı durmasın
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
      }}
    >
      {icon ? (
        <SymbolIcon name={icon} size={glyph} style={{ color: ink }} />
      ) : (
        <Fallback
          style={{ color: ink, width: glyph, height: glyph }}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

/** Üst çubuğun yuvarlak simge düğmesi */
const ROUND =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95";
const MENU_ITEM =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[14px] font-medium transition-colors hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]";

function MenuItem({
  icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className={MENU_ITEM}>
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && (
          <span className="block truncate text-[11px] text-muted-foreground">{hint}</span>
        )}
      </span>
    </button>
  );
}

/** Rayın bir durağı — karo ve altında adı; seçili durak zeminlenir */
function RailItem({
  active,
  activeBg,
  label,
  onClick,
  children,
}: {
  active: boolean;
  activeBg: string;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="flex shrink-0 flex-col items-center gap-1 rounded-2xl px-0.5 pb-1.5 pt-2 transition-[background-color,transform] active:scale-95"
      style={active ? { background: activeBg } : undefined}
    >
      {children}
      <span
        className={cn(
          "block w-full truncate text-center text-[10px] leading-3",
          active ? "font-semibold text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
      </span>
    </button>
  );
}

/** Bölmenin başlığı — durağın adı, sağda bir eylem */
function PaneHead({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 px-1.5 pb-2 pt-1.5">
      <h3 className="min-w-0 flex-1 truncate text-[19px] font-bold tracking-tight">
        {title}
      </h3>
      {action}
    </div>
  );
}

/**
 * Bölme satırı — çerçevesiz, dokununca hafifçe zeminlenir; dokunmak kaydı
 * oraya açar. Alt kalemi olan dalın satırı (plus) kendi grubunun başında:
 * sağdaki artı dalın KENDİSİNE de kayıt girileceğini söyler.
 */
function PaneRow({
  color,
  icon,
  name,
  sub,
  small,
  plus,
  flashing,
  dataSub,
  onClick,
}: {
  color: string;
  icon?: string;
  name: string;
  sub?: string;
  small?: boolean;
  plus?: boolean;
  flashing?: boolean;
  dataSub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-sub={dataSub}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl px-1.5 text-left transition-[background-color,box-shadow] duration-300 hover:bg-[var(--sf-2)] active:bg-[var(--sf-3)]",
        small ? "min-h-[44px] py-1.5" : "min-h-[52px] py-2"
      )}
      style={flashing ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : undefined}
    >
      <Tile color={color} icon={icon} fallback={plus ? FolderOpen : Folder} size={small ? 30 : 36} />
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate leading-5 text-foreground",
            small ? "text-[14px]" : "text-[15px] font-semibold"
          )}
        >
          {name}
        </span>
        {sub && (
          <span className="block truncate text-xs leading-4 text-muted-foreground">
            {sub}
          </span>
        )}
      </span>
      {plus && (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
          style={{ background: `${color}22`, color }}
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
        </span>
      )}
    </button>
  );
}
