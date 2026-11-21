"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { searchEntries } from "@/lib/db/queries";
import { searchEverything } from "@/lib/db/search-all";
import { intlTag, useLocale, useT, type MessageKey } from "@/lib/i18n";
import { dayPeriod, monthPeriod, parsePeriodKey, periodLabel, weekPeriod, yearPeriod, type Period } from "@/lib/period";
import { useSkin } from "@/lib/skin";
import { PageHeader } from "@/components/layout/page-header";
import { EntryListSection, type EntryListRow } from "@/components/analytics/entry-list";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionNav, chipClass } from "@/components/ui/section-nav";
import { Input } from "@/components/ui/input";
import { SubPageMenu } from "@/components/ui/sub-page-menu";
import {
  PREVIEW_ENTRIES,
  PREVIEW_ROWS,
  RESULT_KINDS,
  SearchFeatures,
  SearchFilters,
  SearchNoResults,
  SearchNotes,
  SearchPlaces,
  SearchPlanned,
  SearchResults,
  SearchStart,
  SearchThings,
  SearchTypeBar,
  type ResultKind,
  type TimeKind,
} from "@/components/search/search-blocks";
import { cn } from "@/lib/utils";
import { PageSheet } from "@/components/ui/layer";

const LIMIT = 100;

type RangeKey = "all" | "year" | "month";

const RANGES: { key: RangeKey; label: MessageKey }[] = [
  { key: "all", label: "search.rangeAll" },
  { key: "year", label: "search.rangeYear" },
  { key: "month", label: "search.rangeMonth" },
];

/** Aralığın başlangıcı — yerel gün/ay/yıl sınırı, UTC kaymasız */
function rangeStart(key: RangeKey): number | undefined {
  if (key === "all") return undefined;
  const n = new Date();
  return key === "month"
    ? new Date(n.getFullYear(), n.getMonth(), 1).getTime()
    : new Date(n.getFullYear(), 0, 1).getTime();
}

/**
 * Girdi arama sayfası. Veri girmek kadar geçmişi bulmak da lazım: "geçen ay
 * hangi kafeye ne kadar verdim" sorusunun cevabı buradan çıkar. Sonuç satırına
 * dokunmak girdiyi düzenleme modalında açar (EntryList'in kendi davranışı).
 *
 * Arama kutusu açılışta odaklanmaz: telefonda klavye kendiliğinden açılıp
 * ekranın yarısını kapatıyordu, süzgeçler ve sonuçlar görünmüyordu.
 * Kullanıcı kutuya dokununca açılır.
 *
 * Arama adreste de durur (?q=…&cat=…&t=d-2026-11-21): sonuçtaki tarihe
 * dokunup gün sayfasına gidince geri tuşu aramayı silinmiş bulmasın. Adres
 * yalnız açılışta okunur, sonra durum adrese yazılır (replaceState — her harf
 * geçmişe yeni adım eklemesin). Ana sayfadan açılan Ara yine boş.
 */
export default function SearchPage() {
  return (
    <Suspense fallback={null}>
      <SearchPageContent />
    </Suspense>
  );
}

/** Adresteki dönem — Ara'nın zaman türlerinden biriyse (özel aralık ve Tümü yok) */
function initialPeriod(key: string | null): Period | null {
  const p = key ? parsePeriodKey(key) : null;
  return p && p.kind !== "all" && p.kind !== "custom" ? p : null;
}

/**
 * Sonuçtan gün sayfasına giderken kaydırma yeri ve açık kart sayısı ("Daha
 * fazla göster" ile açılanlar) — aramanın adres anahtarıyla. Geri gelince
 * liste o kadar kartla kurulur, sonra kaydedilen yere kaydırılır; yalnız
 * kaydırma yetmez, 30 kartlık liste 60. karta kadar inmez.
 *
 * Bellekte (modül düzeyi): uygulama açıkken geri tuşu için. Kaydırma ana
 * kapta (bkz. app-shell, data-app-main), pencerede değil; tarayıcının kendi
 * geri yüklemesi orada işlemiyor.
 */
/** Adresteki sonuç türü — tanınmayan "Hepsi" */
function initialType(v: string | null): ResultKind | "all" {
  return RESULT_KINDS.find((k) => k.kind === v)?.kind ?? "all";
}

const scrollMemory = new Map<string, { top: number; visible: number }>();
const appMain = () => document.querySelector<HTMLElement>("[data-app-main]");

function SearchPageContent() {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const params = useSearchParams();
  const [query, setQuery] = useState(() => params.get("q") ?? "");
  const [categoryId, setCategoryId] = useState<string | null>(() => params.get("cat"));
  const [range, setRange] = useState<RangeKey>("all");
  // Brütal: zaman türü ve dönemi (bkz. SearchFilters) — sade temalar eski aralıkla
  const [period, setPeriod] = useState<Period | null>(() => initialPeriod(params.get("t")));
  const [kind, setKind] = useState<TimeKind>(() => (period ? (period.kind as TimeKind) : "all"));
  // Sonuç türü (bkz. SearchTypeBar) — Hepsi ya da tek tür
  const [type, setType] = useState<ResultKind | "all">(() => initialType(params.get("type")));
  const locale = useLocale();

  // Aramanın adres sorgusu — adrese yazılır, kaydırma hafızasının da anahtarı
  const urlKey = useMemo(() => {
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    if (categoryId) p.set("cat", categoryId);
    if (period) p.set("t", period.key);
    if (type !== "all") p.set("type", type);
    return p.toString();
  }, [query, categoryId, period, type]);

  // Durum → adres (bkz. üstteki not). Next'in kendi geçmiş kaydı korunur
  useEffect(() => {
    if (urlKey === window.location.search.slice(1)) return;
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${urlKey ? `?${urlKey}` : ""}`);
  }, [urlKey]);

  // Gün sayfasından geri gelindiyse kaldığı yer (bkz. scrollMemory) —
  // açılıştaki aramanın, bir kez
  const [restore] = useState(() => scrollMemory.get(urlKey) ?? null);
  const restored = useRef(false);
  function rememberScroll(visible: number) {
    scrollMemory.set(urlKey, { top: appMain()?.scrollTop ?? 0, visible });
  }
  // Tür değişince sayfa başa: "Tümünü gör" aşağıdaki bir bloktan basılıyor,
  // liste o türe daralınca ekran boşlukta kalıyordu
  function pickType(k: ResultKind | "all") {
    setType(k);
    appMain()?.scrollTo({ top: 0 });
  }
  function pickKind(k: TimeKind) {
    setKind(k);
    const now = Date.now();
    setPeriod(
      k === "day" ? dayPeriod(now) : k === "week" ? weekPeriod(now) : k === "month" ? monthPeriod(now) : k === "year" ? yearPeriod(now) : null
    );
  }

  const categories = useLiveQuery(
    // Yerleşik akışlar (Uyku, Ruh hali) kategori süzgecinde yok — kullanıcıya
    // kategori olarak sunulmuyorlar
    () => db.categories.orderBy("order").filter((c) => !c.isBuiltIn).toArray(),
    []
  );

  const trimmed = query.trim();
  const from = useMemo(() => (brutal ? period?.start : rangeStart(range)), [brutal, period, range]);
  const to = brutal ? period?.end : undefined;

  // Boş sorguda arama yapılmaz — tüm girdileri listelemek arama değil
  const results = useLiveQuery(
    () =>
      trimmed || categoryId
        ? searchEntries({
            query: trimmed,
            categoryId: categoryId ?? undefined,
            from,
            to,
            limit: LIMIT,
          })
        : Promise.resolve(undefined),
    [trimmed, categoryId, from, to]
  );

  // Girdilerden başka her şey — notlar, planlı girdiler, nesneler, yapı,
  // özellikler (bkz. searchEverything). Ana sayfadaki Ara genel arama: Yapı
  // sayfalarının kendi aramaları var, burası hepsini birden arıyor
  const everything = useLiveQuery(
    () =>
      brutal && (trimmed || categoryId)
        ? searchEverything({ query: trimmed, categoryId: categoryId ?? undefined, from, to })
        : Promise.resolve(undefined),
    [brutal, trimmed, categoryId, from, to]
  );

  const searching = !!(trimmed || categoryId);

  // Sonuçlar çizilince kaldığı yere — sonuçlar veritabanından sonra geliyor,
  // ilk çizimde liste yok; kare sonrası: kartlar yerleşsin
  useEffect(() => {
    if (!restore || restored.current || !results || !everything) return;
    const id = requestAnimationFrame(() => {
      restored.current = true;
      appMain()?.scrollTo({ top: restore.top });
    });
    return () => cancelAnimationFrame(id);
  }, [restore, results, everything]);

  /*
   * Brütal: üst menü şerit (bkz. SubPageMenu) — ortada "Ara" ve altında
   * durum ("Her şeyde ara", aranırken "18 sonuç bulundu"), altında arama
   * kutusu tek beyaz kartta. Yapışkan: kaydırırken kutu elde kalır.
   * Gövdede önce süzgeç bloğu (zaman türü, dönem, kategoriler — bkz.
   * SearchFilters), sonra arama başlamadan öneriler, sonuçlar ya da sonuç
   * yok bloğu (bkz. search-blocks).
   *
   * Genel arama: girdiler, notlar, planlı girdiler, nesneler, kategoriler ve
   * özellikler, her tür kendi bloğunda. Birden çok tür bulunursa üstte tür
   * çipleri; Hepsi'nde her blok ilk birkaçını gösterir ("Tümünü gör" o türe
   * geçer). Eskiden yalnız girdileri arıyordu — Yapı sayfalarının da kendi
   * aramaları olunca ana sayfadaki Ara onlardan farksız kalmıştı.
   *
   * İlk denemede şeritte başlık yoktu, kutu okun yanındaydı; kullanıcı
   * sayfanın bir başlığı olsun istedi.
   */
  if (brutal) {
    const timeLabel = period ? periodLabel(period, locale) : t("search.rangeAll");
    const catLabel = categories?.find((c) => c.id === categoryId)?.name;
    const fmt = (n: number) => new Intl.NumberFormat(intlTag(locale)).format(n);
    const entriesFull = !!results && results.length >= LIMIT;
    // Türlerin sayısı — sonuçlar gelmeden yok
    const counts: Record<ResultKind, number> | null =
      results && everything
        ? {
            entries: results.length,
            notes: everything.notes.length,
            planned: everything.planned.length,
            things: everything.things.length + everything.collections.length,
            categories: everything.categories.length + everything.subs.length,
            features: everything.features.length,
          }
        : null;
    const kinds = counts ? RESULT_KINDS.filter((k) => counts[k.kind] > 0).map((k) => k.kind) : [];
    const total = counts ? kinds.reduce((n, k) => n + counts[k], 0) : 0;
    const countLabel = (k: ResultKind) =>
      k === "entries" && entriesFull ? `${fmt(LIMIT)}+` : fmt(counts?.[k] ?? 0);
    // Seçili türün sonucu kalmadıysa (arama değişti) Hepsi
    const shownType = type !== "all" && kinds.includes(type) ? type : "all";
    // Hepsi'nde birden çok tür varsa her blok önizleme: ilk birkaçı ve "Tümünü gör"
    const preview = shownType === "all" && kinds.length > 1;
    const show = (k: ResultKind) => kinds.includes(k) && (shownType === "all" || shownType === k);
    const sub =
      searching && counts
        ? t("search.foundAll", { n: entriesFull ? `${fmt(total)}+` : fmt(total) })
        : t("search.leadAll");
    // Süzgeç değişince sayfalama baştan
    const listKey = `${trimmed}|${categoryId}|${period?.key ?? "all"}|${shownType}`;
    return (
      <PageSheet
        top={
          <SubPageMenu title={t("search.title")} sub={sub}>
            <div className="px-2.5 pb-2.5">
              <div
                data-search-box=""
                className="relative flex items-center rounded-[12px] border-2 bg-white shadow-[2px_2px_0_#111]"
                style={{ borderColor: "#111" }}
              >
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#111]/50" strokeWidth={2.75} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search.placeholderAll")}
                  aria-label={t("search.title")}
                  enterKeyHint="search"
                  className="h-11 w-full rounded-[10px] bg-transparent pl-9 pr-10 text-[15px] font-bold text-[#111] placeholder:font-semibold placeholder:text-[#111]/40 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    aria-label={t("features.clearSearch")}
                    className="absolute right-1.5 flex h-8 w-8 items-center justify-center rounded-lg text-[#111] active:bg-[#111]/10"
                  >
                    <X className="h-4 w-4" strokeWidth={2.75} />
                  </button>
                )}
              </div>
            </div>
          </SubPageMenu>
        }
      >
        <SearchFilters
          kind={kind}
          period={period}
          onKind={pickKind}
          onPeriod={setPeriod}
          categories={categories ?? []}
          categoryId={categoryId}
          onCategory={setCategoryId}
        />
        {!searching ? (
          <SearchStart onPick={setQuery} />
        ) : !counts || !everything || !results ? null : total === 0 ? (
          <SearchNoResults onWiden={kind !== "all" ? () => pickKind("all") : undefined} />
        ) : (
          <div className="pb-6">
            {kinds.length > 1 && (
              <SearchTypeBar
                counts={Object.fromEntries(kinds.map((k) => [k, countLabel(k)]))}
                value={shownType}
                onPick={pickType}
              />
            )}
            {show("entries") && (
              <>
                <SearchResults
                  key={listKey}
                  entries={results}
                  count={countLabel("entries")}
                  hint={[timeLabel, catLabel].filter(Boolean).join(" · ")}
                  cap={preview ? PREVIEW_ENTRIES : undefined}
                  onAll={() => pickType("entries")}
                  initialVisible={restore?.visible}
                  onOpenDay={rememberScroll}
                />
                {entriesFull && !preview && (
                  <p className="-mt-2 mb-4 px-1 text-[11px] font-bold text-[#111]/55">
                    {t("search.limitNote", { n: LIMIT })}
                  </p>
                )}
              </>
            )}
            {show("notes") && (
              <SearchNotes
                key={listKey}
                notes={everything.notes}
                cap={preview ? PREVIEW_ROWS : undefined}
                onAll={() => pickType("notes")}
                initialVisible={restore?.visible}
                onOpenDay={rememberScroll}
              />
            )}
            {show("planned") && (
              <SearchPlanned rows={everything.planned} cap={preview ? PREVIEW_ROWS : undefined} onAll={() => pickType("planned")} />
            )}
            {show("things") && (
              <SearchThings
                collections={everything.collections}
                things={everything.things}
                cap={preview ? PREVIEW_ROWS : undefined}
                onAll={() => pickType("things")}
              />
            )}
            {show("categories") && (
              <SearchPlaces
                categories={everything.categories}
                subs={everything.subs}
                cap={preview ? PREVIEW_ROWS : undefined}
                onAll={() => pickType("categories")}
              />
            )}
            {show("features") && (
              <SearchFeatures features={everything.features} cap={preview ? PREVIEW_ROWS : undefined} onAll={() => pickType("features")} />
            )}
          </div>
        )}
      </PageSheet>
    );
  }

  const rows: EntryListRow[] = (results ?? []).map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    title: e.title,
    notes: e.notes,
    subLabel: e.subcategory.isCategoryRoot
      ? e.category.name
      : `${e.category.name} · ${e.subcategory.name}`,
  }));

  return (
    <PageSheet
      top={
        <PageHeader
          title={t("search.title")}
          description={t("search.lead")}
          icon={Search}
          back="/"
        />
      }
    >

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          className="h-11 pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label={t("features.clearSearch")}
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Kategori süzgeci — renkli noktalarla, analiz çipleriyle aynı dilde */}
      <SectionNav label={t("structure.categories")}>
        <button
          type="button"
          onClick={() => setCategoryId(null)}
          className={chipClass(categoryId === null)}
        >
          {t("search.allCategories")}
        </button>
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            className={cn(chipClass(categoryId === c.id), "gap-1.5")}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: c.color }}
            />
            {c.name}
          </button>
        ))}
      </SectionNav>

      <div className="mb-4 flex gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            onClick={() => setRange(r.key)}
            className={cn(
              "flex-1 rounded-xl border py-2 text-xs font-medium transition-colors",
              range === r.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {t(r.label)}
          </button>
        ))}
      </div>

      {!searching ? (
        <EmptyState
          icon={Search}
          title={t("search.start")}
          description={t("search.startHint")}
        />
      ) : results === undefined ? null : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title={t("search.empty")}
          description={t("search.emptyHint")}
        />
      ) : (
        <div className="pb-6">
          {/* Sonucun içinde ikinci bir arama kutusu kafa karıştırır —
              daraltma yukarıdaki alanla yapılır */}
          <EntryListSection
            title={t("search.results")}
            rows={rows}
            searchable={false}
          />
          {rows.length >= LIMIT && (
            <p className="mt-2 px-1 text-[11px] text-muted-foreground/60">
              {t("search.limitNote", { n: LIMIT })}
            </p>
          )}
        </div>
      )}
    </PageSheet>
  );
}
