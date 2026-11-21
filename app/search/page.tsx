"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { searchEntries } from "@/lib/db/queries";
import { useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { PageHeader } from "@/components/layout/page-header";
import { EntryListSection, type EntryListRow } from "@/components/analytics/entry-list";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionNav, chipClass } from "@/components/ui/section-nav";
import { Input } from "@/components/ui/input";
import { SubPageMenu } from "@/components/ui/sub-page-menu";
import {
  CategorySquare,
  FilterChip,
  SearchNoResults,
  SearchResults,
  SearchStart,
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
 */
export default function SearchPage() {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [range, setRange] = useState<RangeKey>("all");

  const categories = useLiveQuery(
    // Yerleşik akışlar (Uyku, Ruh hali) kategori süzgecinde yok — kullanıcıya
    // kategori olarak sunulmuyorlar
    () => db.categories.orderBy("order").filter((c) => !c.isBuiltIn).toArray(),
    []
  );

  const trimmed = query.trim();
  const from = useMemo(() => rangeStart(range), [range]);

  // Boş sorguda arama yapılmaz — tüm girdileri listelemek arama değil
  const results = useLiveQuery(
    () =>
      trimmed || categoryId
        ? searchEntries({
            query: trimmed,
            categoryId: categoryId ?? undefined,
            from,
            limit: LIMIT,
          })
        : Promise.resolve(undefined),
    [trimmed, categoryId, from]
  );

  const searching = !!(trimmed || categoryId);

  /*
   * Brütal: üst menü şerit (bkz. SubPageMenu) — geri okunun yanında arama
   * kutusu tek beyaz kartta (ayrı "Ara" başlığı yok, kutu kendini
   * anlatıyor), altında tarih aralığı düz yazı sekmeler, seçili olan kalkık
   * beyaz kapsülde (Analiz'in dönem türleri gibi). Yapışkan: kaydırırken kutu
   * elde kalır. Altında kategori çipleri (kategorinin renginde kare, seçili
   * olan kendi renginde), sonra arama başlamadan öneriler, sonuçlar ya da
   * sonuç yok bloğu (bkz. search-blocks).
   */
  if (brutal) {
    const rangeLabel = t(RANGES.find((r) => r.key === range)!.label);
    const catLabel = categories?.find((c) => c.id === categoryId)?.name;
    return (
      <PageSheet
        top={
          <SubPageMenu
            title={t("search.title")}
            center={
              <div
                data-search-box=""
                className="relative flex items-center rounded-[12px] border-2 bg-white shadow-[2px_2px_0_#111]"
                style={{ borderColor: "#111" }}
              >
                <Search className="pointer-events-none absolute left-3 h-4 w-4 text-[#111]/50" strokeWidth={2.75} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("search.placeholder")}
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
            }
          >
            <div role="tablist" aria-label={t("insights.period")} className="grid grid-cols-3 items-center px-1.5 pb-2.5 pt-0.5">
              {RANGES.map((r) => {
                const on = range === r.key;
                return (
                  <button
                    key={r.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setRange(r.key)}
                    className="flex min-w-0 justify-center"
                  >
                    <span
                      className={cn(
                        "rounded-full border-[1.5px] px-2.5 py-[6px] text-[12.5px] font-extrabold leading-none transition-transform",
                        on ? "-translate-y-px bg-white text-[#111] shadow-[2px_2px_0_#111]" : "text-[#111]/65 active:text-[#111]"
                      )}
                      // Çerçeve rengi satır içi: globals.css'teki katmansız
                      // "* { border-color }" kuralı border-transparent'ı eziyor
                      style={{ borderColor: on ? "#111" : "transparent" }}
                    >
                      {t(r.label)}
                    </span>
                  </button>
                );
              })}
            </div>
          </SubPageMenu>
        }
      >
        <SectionNav label={t("structure.categories")}>
          <FilterChip on={categoryId === null} onClick={() => setCategoryId(null)}>
            {t("search.allCategories")}
          </FilterChip>
          {(categories ?? []).map((c) => (
            <FilterChip
              key={c.id}
              on={categoryId === c.id}
              color={c.color}
              onClick={() => setCategoryId(categoryId === c.id ? null : c.id)}
            >
              <CategorySquare color={c.color} />
              {c.name}
            </FilterChip>
          ))}
        </SectionNav>
        {!searching ? (
          <SearchStart onPick={setQuery} />
        ) : results === undefined ? null : results.length === 0 ? (
          <SearchNoResults onWiden={range !== "all" ? () => setRange("all") : undefined} />
        ) : (
          <div className="pb-6">
            {/* Anahtar: süzgeç değişince sayfalama baştan */}
            <SearchResults
              key={`${trimmed}|${categoryId}|${range}`}
              entries={results}
              hint={[rangeLabel, catLabel].filter(Boolean).join(" · ")}
            />
            {results.length >= LIMIT && (
              <p className="-mt-2 px-1 text-[11px] font-bold text-[#111]/55">
                {t("search.limitNote", { n: LIMIT })}
              </p>
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
