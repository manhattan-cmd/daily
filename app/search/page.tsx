"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Search, X } from "lucide-react";
import { db } from "@/lib/db";
import { searchEntries } from "@/lib/db/queries";
import { useT, type MessageKey } from "@/lib/i18n";
import { PageHeader } from "@/components/layout/page-header";
import { EntryListSection, type EntryListRow } from "@/components/analytics/entry-list";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionNav, chipClass } from "@/components/ui/section-nav";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
 */
export default function SearchPage() {
  const t = useT();
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

  const rows: EntryListRow[] = (results ?? []).map((e) => ({
    id: e.id,
    occurredAt: e.occurredAt,
    title: e.title,
    notes: e.notes,
    subLabel: e.subcategory.isCategoryRoot
      ? e.category.name
      : `${e.category.name} · ${e.subcategory.name}`,
  }));

  const searching = !!(trimmed || categoryId);

  return (
    <>
      <PageHeader
        title={t("search.title")}
        description={t("search.lead")}
        back="/"
      />

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("search.placeholder")}
          autoFocus
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
    </>
  );
}
