"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Boxes,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Circle,
  Diamond,
  Rows3,
  Search,
  Square,
  StickyNote,
  Target,
  type LucideIcon,
} from "lucide-react";
import { db } from "@/lib/db";
import { intlTag, useLocale, useT, type MessageKey } from "@/lib/i18n";
import { periodLabel, shiftPeriod, type Period } from "@/lib/period";
import { routes } from "@/lib/routes";
import { cn, toLocalDateValue } from "@/lib/utils";
import { HScroll } from "@/components/ui/h-scroll";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { EntryCard } from "@/components/dashboard/entry-card";
import { NoteCard } from "@/components/notes/note-card";
import { GoalRow, type Row as GoalRowData } from "@/components/goals/planned-list";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { DayCell, groupByDay, useDayLabel } from "@/components/ui/day-cell";
import { SymbolIcon } from "@/lib/icons";
import { measureSummary } from "@/lib/measure-kinds";
import { modColor } from "@/lib/mod-color";
import type { ModWithType } from "@/lib/db/queries";
import type { Category, Collection, EntryWithContext, Note, SubCategory, Tag, Thing } from "@/types";
import { blockFillTint, blockInk, fillStyle } from "@/lib/fill";
import type { TagFilter } from "@/lib/tags";
import { TagGlyph } from "@/components/ui/tag-glyph";

/**
 * Aramanın zaman süzgeci — Analiz'in dönem türleri, onunla aynı sırada:
 * yakından uzağa (Gün · Hafta · Ay · Yıl · Tümü). İlk hali Tümü'yle
 * başlıyordu ve gün yoktu; kullanıcı Analiz'deki sırayı istedi.
 */
export type TimeKind = "day" | "week" | "month" | "year" | "all";
export const TIME_KINDS: { kind: TimeKind; label: MessageKey }[] = [
  { kind: "day", label: "range.day" },
  { kind: "week", label: "range.week" },
  { kind: "month", label: "range.month" },
  { kind: "year", label: "range.year" },
  { kind: "all", label: "insights.all" },
];

/** Şimdi — bileşen dışında: çizim saf kalsın */
const nowMs = () => Date.now();

/** Ara'nın bloklarının rengi — Son girdiler bloklarının şeftalisi */
export const SEARCH_COLOR = "#ffb38a";

/** Bir seferde gösterilen kart — 100 sonucun hepsini birden çizmek telefonda ağır */
const PAGE_SIZE = 30;

/** Öneriler için geriye bakılan gün ve en çok kaç öneri */
const SUGGEST_DAYS = 60;
const SUGGEST_LIMIT = 8;

/** Kategori karesi — şekil dili: kare = kategori (bkz. design-modular-boxes) */
export function CategorySquare({ color }: { color: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px] border-line" style={{ background: color }} />;
}

/**
 * Süzgeç kapsülü — kategori çipleri ve öneriler. Seçili olan kendi renginde
 * dolar ve hafifçe kalkar (alt menünün seçili sekmesi gibi).
 */
export function FilterChip({
  on = false,
  color,
  onClick,
  children,
}: {
  on?: boolean;
  /** Seçiliyken zemin — verilmezse siyah (Tümü) */
  color?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] px-3 text-[12.5px] font-extrabold transition-transform " +
        (on ? "-translate-y-px shadow-[2px_2px_0_var(--shade)]" : "bg-paper active:bg-paper-2")
      }
      style={{
        borderColor: "var(--line)",
        background: on ? color ?? "var(--well)" : undefined,
        color: on && !color ? "#fff" : "var(--ink)",
      }}
    >
      {children}
    </button>
  );
}

/**
 * Süzgeç bloğu — zaman ve kategori tek çerçevede, ortak 2 px çizgilerle
 * (bkz. SummaryBlock):
 *
 *  1. Zaman türü — beş eşit bölmeli anahtar (Gün · Hafta · Ay · Yıl ·
 *     Tümü), seçili bölme siyah. Eskiden şeritte düz yazı üç sekmeydi (Tüm
 *     zamanlar · Bu yıl · Bu ay): "geçen ay" aranamıyordu, sekmeler de
 *     hizasız duruyordu.
 *  2. Dönem — tür seçiliyken: ‹ Kasım 2026 › ile geriye gidilir (Analiz'in
 *     dönemi gibi; gelecekteki döneme geçilmez).
 *  3. Kategoriler — çipler hücrenin İÇİNDE kayar; bloğun çerçevesi keser.
 *     Eskiden sıra sayfa zemininin kenarına taşıyordu, kaydırınca çipler
 *     pencerenin dışına çıkıyor gibi görünüyordu.
 *  4. Etiketler (varsa) — çipler etiketin şekliyle; birine dokununca
 *     "yalnız" süzgeci, satırın başında Yalnız | Hariç anahtarı belirir.
 *     Seçiliye yeniden dokunmak süzgeci kaldırır.
 */
export function SearchFilters({
  kind,
  period,
  onKind,
  onPeriod,
  categories,
  categoryId,
  onCategory,
  tags = [],
  tagFilter = null,
  onTagFilter,
}: {
  kind: TimeKind;
  period: Period | null;
  onKind: (k: TimeKind) => void;
  onPeriod: (p: Period) => void;
  categories: Category[];
  categoryId: string | null;
  onCategory: (id: string | null) => void;
  tags?: Tag[];
  tagFilter?: TagFilter | null;
  onTagFilter?: (f: TagFilter | null) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const prev = period ? shiftPeriod(period, -1) : null;
  const next = period ? shiftPeriod(period, 1) : null;
  const nextOff = !next || next.start > nowMs();
  const arrow =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-line bg-paper text-ink shadow-[1.5px_1.5px_0_var(--shade)] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-25 disabled:shadow-none";
  return (
    <section
      data-search-filters=""
      aria-label={t("search.filters")}
      className="mb-4 grid grid-cols-1 gap-[2px] overflow-hidden rounded-[18px] border-2 border-line bg-line shadow-[4px_4px_0_var(--shade)]"
    >
      <div className="bg-paper p-2">
        <div
          role="tablist"
          aria-label={t("insights.period")}
          className="grid grid-cols-5 overflow-hidden rounded-[11px] border-[1.5px] border-line"
        >
          {TIME_KINDS.map((k, i) => {
            const on = kind === k.kind;
            return (
              <button
                key={k.kind}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => onKind(k.kind)}
                className={cn(
                  "h-9 min-w-0 truncate px-1 text-[13px] font-extrabold transition-colors",
                  i > 0 && "border-l-[1.5px] border-line",
                  on ? "bg-well text-white" : "bg-paper text-ink/70 active:bg-paper-2"
                )}
              >
                {t(k.label)}
              </button>
            );
          })}
        </div>
      </div>
      {period && (
        <div className="flex items-center gap-2 bg-fill-[#ffe7d6] px-2 py-1.5 text-ink">
          <button
            type="button"
            onClick={() => prev && onPeriod(prev)}
            disabled={!prev}
            aria-label={t("insights.previousPeriod")}
            title={t("insights.previousPeriod")}
            className={arrow}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.75} />
          </button>
          <span className="min-w-0 flex-1 truncate text-center text-[15px] font-black leading-tight tracking-tight">
            {periodLabel(period, locale)}
          </span>
          <button
            type="button"
            onClick={() => next && !nextOff && onPeriod(next)}
            disabled={nextOff}
            aria-label={t("insights.nextPeriod")}
            title={t("insights.nextPeriod")}
            className={arrow}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
          </button>
        </div>
      )}
      <nav aria-label={t("structure.categories")} className="bg-paper">
        <HScroll className="gap-1.5 px-2 py-2">
          <FilterChip on={categoryId === null} onClick={() => onCategory(null)}>
            {t("search.allCategories")}
          </FilterChip>
          {categories.map((c) => (
            <FilterChip
              key={c.id}
              on={categoryId === c.id}
              color={c.color}
              onClick={() => onCategory(categoryId === c.id ? null : c.id)}
            >
              <CategorySquare color={c.color} />
              {c.name}
            </FilterChip>
          ))}
        </HScroll>
      </nav>
      {tags.length > 0 && onTagFilter && (
        <nav aria-label={t("tags.title")} data-search-tags="" className="bg-paper">
          <HScroll className="items-center gap-1.5 px-2 py-2">
            {tagFilter ? (
              /* Kip — yalnız bu etiketli yerler ya da onlar hariç */
              <div data-tag-mode="" className="flex h-8 shrink-0 overflow-hidden rounded-full border-[1.5px] border-line">
                {(["only", "exclude"] as const).map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={tagFilter.mode === m}
                    onClick={() => onTagFilter({ tagId: tagFilter.tagId, mode: m })}
                    className={cn(
                      "px-2.5 text-[12px] font-extrabold capitalize",
                      i > 0 && "border-l-[1.5px] border-line",
                      tagFilter.mode === m ? "bg-well text-white" : "bg-paper text-ink/70 active:bg-paper-2"
                    )}
                  >
                    {t(m === "only" ? "an.tag.modeShortOnly" : "an.tag.modeShortExclude")}
                  </button>
                ))}
              </div>
            ) : (
              <span className="shrink-0 pl-1 pr-0.5 text-[10px] font-black uppercase tracking-[0.1em] text-ink/50">{t("an.tag.cell")}</span>
            )}
            {tags.map((tg) => {
              const on = tagFilter?.tagId === tg.id;
              return (
                <FilterChip
                  key={tg.id}
                  on={on}
                  color={blockFillTint(tg.color, 100)}
                  onClick={() => onTagFilter(on ? null : { tagId: tg.id, mode: tagFilter?.mode ?? "only" })}
                >
                  <TagGlyph color={tg.color} size={12} />
                  {tg.name}
                </FilterChip>
              );
            })}
          </HScroll>
        </nav>
      )}
    </section>
  );
}

/**
 * Arama başlamadan — boş pencere yerine öneriler: son 60 günde en sık
 * eklenen kalemler; dokununca o kalem aranır. Hiç girdi yoksa yalnız
 * nasıl aranacağı yazar.
 */
export function SearchStart({ onPick }: { onPick: (q: string) => void }) {
  const t = useT();
  const suggestions = useLiveQuery(async () => {
    const since = Date.now() - SUGGEST_DAYS * 86400e3;
    const [recent, subs, cats] = await Promise.all([
      db.entries.where("occurredAt").aboveOrEqual(since).toArray(),
      db.subcategories.toArray(),
      db.categories.toArray(),
    ]);
    const subById = new Map(subs.map((s) => [s.id, s]));
    const catById = new Map(cats.map((c) => [c.id, c]));
    const bySub = new Map<string, number>();
    for (const e of recent) bySub.set(e.subcategoryId, (bySub.get(e.subcategoryId) ?? 0) + 1);
    const out: { key: string; name: string; color: string }[] = [];
    for (const [id] of [...bySub.entries()].sort((a, b) => b[1] - a[1])) {
      const sub = subById.get(id);
      const cat = sub && catById.get(sub.categoryId);
      // Uyku, ruh hali ve nesne adları kayıtta İngilizce — öneri olmaz
      if (!sub || !cat || cat.isBuiltIn) continue;
      out.push({ key: id, name: sub.isCategoryRoot ? cat.name : sub.name, color: cat.color });
      if (out.length === SUGGEST_LIMIT) break;
    }
    return out;
  }, []);

  return (
    <SummaryBlock
      compact
      className="mb-4"
      lead={{ kind: "title", overline: "", title: t("search.startAll"), hint: t("search.startHintAll"), color: SEARCH_COLOR, glyph: Search }}
      stats={[]}
    >
      {suggestions && suggestions.length > 0 ? (
        <div className="bg-paper px-3 pb-3 pt-2.5">
          <p className="mb-2 text-[11.5px] font-bold text-ink/55">{t("home.frequentTitle")}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <FilterChip key={s.key} onClick={() => onPick(s.name)}>
                <CategorySquare color={s.color} />
                {s.name}
              </FilterChip>
            ))}
          </div>
        </div>
      ) : suggestions ? (
        <SummaryEmpty text={t("search.startHintAll")} />
      ) : null}
    </SummaryBlock>
  );
}

/** Hiçbir şey eşleşmedi — dar aralıktaysa tek dokunuşla bütün zamanlarda ara */
export function SearchNoResults({ onWiden }: { onWiden?: () => void }) {
  const t = useT();
  return (
    <SummaryBlock
      compact
      className="mb-4"
      lead={{ kind: "title", overline: "", title: t("search.empty"), color: SEARCH_COLOR, glyph: Search }}
      stats={[]}
    >
      <SummaryEmpty
        text={t("search.emptyHint")}
        action={onWiden ? { label: t("search.rangeAll"), onClick: onWiden, icon: CalendarRange, color: "var(--paper)" } : undefined}
      />
    </SummaryBlock>
  );
}

/**
 * Sonuç türleri — genel aramanın (ana sayfadaki Ara) blokları ve tür
 * çipleri bu sırada. Renkler her türün kendi sayfasındaki bloğun rengi:
 * girdilerin şeftalisi, notların gülü, planlıların pembesi, Yapı'nın sarısı,
 * özelliklerin menekşesi.
 */
export type ResultKind = "entries" | "notes" | "planned" | "things" | "categories" | "features";
export const RESULT_KINDS: { kind: ResultKind; label: MessageKey; color: string; glyph: LucideIcon }[] = [
  { kind: "entries", label: "structure.entries", color: SEARCH_COLOR, glyph: Rows3 },
  { kind: "notes", label: "structure.notes", color: "#fda4af", glyph: StickyNote },
  { kind: "planned", label: "goal.pageTitle", color: "#ff9ecd", glyph: Target },
  { kind: "things", label: "structure.objects", color: "#8ee0d6", glyph: Diamond },
  { kind: "categories", label: "structure.categories", color: "#ffd23f", glyph: Square },
  { kind: "features", label: "structure.features", color: "#c9b8ff", glyph: Circle },
];
const KIND = Object.fromEntries(RESULT_KINDS.map((k) => [k.kind, k])) as Record<ResultKind, (typeof RESULT_KINDS)[number]>;

/** "Hepsi"nde bir blokta en çok kaç satır/kart — fazlası "Tümünü gör" ile o türe geçer */
export const PREVIEW_ROWS = 4;
export const PREVIEW_ENTRIES = 6;

/**
 * Tür çipleri — Hepsi · Girdiler 22 · Notlar 3 · … Yalnız sonucu olan
 * türler; birden çok tür varsa görünür. Seçili tür kendi renginde dolar.
 * Çerçeveli şerit: çipler şeridin içinde kayar (bkz. SearchFilters).
 */
export function SearchTypeBar({
  counts,
  value,
  onPick,
}: {
  counts: Partial<Record<ResultKind, string>>;
  value: ResultKind | "all";
  onPick: (k: ResultKind | "all") => void;
}) {
  const t = useT();
  return (
    <nav
      data-search-types=""
      aria-label={t("search.types")}
      className="mb-4 overflow-hidden rounded-[14px] border-2 border-line bg-paper shadow-[3px_3px_0_var(--shade)]"
    >
      <HScroll className="gap-1.5 p-2">
        <FilterChip on={value === "all"} onClick={() => onPick("all")}>
          {t("search.allTypes")}
        </FilterChip>
        {RESULT_KINDS.filter((k) => counts[k.kind]).map((k) => (
          <FilterChip key={k.kind} on={value === k.kind} color={k.color} onClick={() => onPick(k.kind)}>
            {t(k.label)}
            <span className="font-mono text-[11px] font-bold opacity-60">{counts[k.kind]}</span>
          </FilterChip>
        ))}
      </HScroll>
    </nav>
  );
}

/** Bir türün bloğu — ince başta türün adı ve sayısı, altında satırlar */
function KindBlock({ kind, count, hint, children }: { kind: ResultKind; count: string; hint?: string; children: ReactNode }) {
  const t = useT();
  const k = KIND[kind];
  return (
    <div data-search-kind={kind}>
      <SummaryBlock
        compact
        className="mb-4"
        lead={{ kind: "count", color: k.color, glyph: k.glyph, overline: t(k.label), value: count, unit: "", hint }}
        stats={[]}
      >
        {children}
      </SummaryBlock>
    </div>
  );
}

/** Bloğun alt satırı: "Tümünü gör (12)" — o türe geçer */
function SeeAll({ n, onClick }: { n: string; onClick?: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center gap-1 bg-paper text-[13px] font-black text-ink active:bg-paper-2"
    >
      {t("search.seeAll", { n })}
      <ChevronRight className="h-4 w-4" strokeWidth={2.75} />
    </button>
  );
}

/** "Daha fazla göster (40)" — uzun listede sayfa sayfa */
function ShowMore({ n, onClick }: { n: string; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-11 items-center justify-center bg-paper text-[13px] font-black text-ink active:bg-paper-2"
    >
      {t("list.showMore")} ({n})
    </button>
  );
}

/**
 * Sonuç satırı — yapıdaki bir şeye giden bağlantı: solda türün şekliyle
 * karo (kare = kategori, daire = özellik, baklava = nesne; bkz.
 * design-modular-boxes), adı, altında nerede olduğu, sağda ok.
 */
function ResultRow({
  href,
  shape,
  color,
  icon,
  glyph: Glyph,
  title,
  hint,
}: {
  href: string;
  shape: "square" | "circle" | "diamond";
  color: string;
  /** Kullanıcının seçtiği sembol (kategori, kalem, liste) */
  icon?: string;
  glyph?: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      data-search-row=""
      className="flex min-h-[54px] items-center gap-3 bg-paper px-3 py-2 text-ink active:bg-paper-2"
    >
      {shape === "diamond" ? (
        <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center">
          <span className="h-[21px] w-[21px] rotate-45 rounded-[4px] border-[1.5px] border-line" style={{ background: color }} />
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center border-[1.5px] border-line",
            shape === "circle" ? "rounded-full" : "rounded-[9px]"
          )}
          style={fillStyle(color)}
        >
          {icon ? (
            <SymbolIcon name={icon} size={17} style={{ color: blockInk(color) }} />
          ) : Glyph ? (
            <Glyph style={{ color: blockInk(color) }} className="h-4 w-4 text-ink" strokeWidth={2.5} />
          ) : null}
        </span>
      )}
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[14.5px] font-extrabold">{title}</span>
        {hint && <span className="mt-0.5 block truncate text-[11.5px] font-bold text-ink/55">{hint}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink/45" strokeWidth={2.75} />
    </Link>
  );
}

/** Ortak: önizlemede ilk `cap` tanesi ve "Tümünü gör", yoksa hepsi */
function useCapped<T>(items: T[], cap?: number) {
  const capped = cap !== undefined && items.length > cap;
  return { shown: capped ? items.slice(0, cap) : items, capped };
}

/**
 * Sonuçlar: girdiler — her gün bir hücre (bkz. DayCell): tepesinde siyah
 * tarih etiketi ("Bugün", "Dün", "18 Kasım Salı"; dokununca gün sayfası),
 * altında o günün girdileri uygulamanın her yerindeki girdi kartlarıyla
 * (bkz. EntryCard) — kategorinin rengi, simgesi, değerleri. Karta dokununca
 * girdi açılır.
 *
 * Eskiden sonuçlar düz bir tabloydu: solda soluk "Kas 21 · 06:27", yanında
 * "Harcamalar · Kira"; renk ve simge yoktu, girdiler uygulamanın geri
 * kalanındaki gibi görünmüyordu. Başı da 170 px'lik iri bir sayıydı.
 */
export function SearchResults({
  entries,
  count,
  hint,
  cap,
  onAll,
  initialVisible,
  onOpenDay,
}: {
  entries: EntryWithContext[];
  /** Başta yazan sayı ("100+") */
  count: string;
  hint?: string;
  /** "Hepsi"nde önizleme — ilk bu kadar kart ve "Tümünü gör" */
  cap?: number;
  onAll?: () => void;
  /** Geri gelindiğinde açık kart sayısı (bkz. app/search scrollMemory) */
  initialVisible?: number;
  /** Tarihe dokununca, gün sayfasına geçmeden — açık kart sayısıyla */
  onOpenDay?: (visible: number) => void;
}) {
  const tag = intlTag(useLocale());
  const dayLabel = useDayLabel();
  const [visible, setVisible] = useState(() => Math.max(PAGE_SIZE, initialVisible ?? 0));
  const { shown: head, capped } = useCapped(entries, cap);
  const shown = capped ? head : entries.slice(0, visible);
  const remaining = capped ? 0 : entries.length - shown.length;
  const fmt = (n: number) => new Intl.NumberFormat(tag).format(n);

  return (
    <KindBlock kind="entries" count={count} hint={hint}>
      {groupByDay(shown, (e) => toLocalDateValue(e.occurredAt)).map((d) => (
        <DayCell key={d.key} day={d.key} label={dayLabel(d.key)} count={fmt(d.items.length)} onOpen={() => onOpenDay?.(visible)}>
          {d.items.map((e) => (
            <EntryCard key={e.id} entry={e} />
          ))}
        </DayCell>
      ))}
      {capped && <SeeAll n={count} onClick={onAll} />}
      {remaining > 0 && <ShowMore n={fmt(remaining)} onClick={() => setVisible((v) => v + PAGE_SIZE)} />}
    </KindBlock>
  );
}

/** Sonuçlar: notlar — girdiler gibi gün gün, not kartlarıyla (dokununca not penceresi) */
export function SearchNotes({
  notes,
  cap,
  onAll,
  initialVisible,
  onOpenDay,
}: {
  notes: Note[];
  cap?: number;
  onAll?: () => void;
  initialVisible?: number;
  onOpenDay?: (visible: number) => void;
}) {
  const tag = intlTag(useLocale());
  const dayLabel = useDayLabel();
  const [visible, setVisible] = useState(() => Math.max(PAGE_SIZE, initialVisible ?? 0));
  const { shown: head, capped } = useCapped(notes, cap);
  const shown = capped ? head : notes.slice(0, visible);
  const remaining = capped ? 0 : notes.length - shown.length;
  const fmt = (n: number) => new Intl.NumberFormat(tag).format(n);
  return (
    <KindBlock kind="notes" count={fmt(notes.length)}>
      {groupByDay(shown, (n) => n.date).map((d) => (
        <DayCell key={d.key} day={d.key} label={dayLabel(d.key)} count={fmt(d.items.length)} onOpen={() => onOpenDay?.(visible)}>
          {d.items.map((n) => (
            <NoteCard key={n.id} note={n} />
          ))}
        </DayCell>
      ))}
      {capped && <SeeAll n={fmt(notes.length)} onClick={onAll} />}
      {remaining > 0 && <ShowMore n={fmt(remaining)} onClick={() => setVisible((v) => v + PAGE_SIZE)} />}
    </KindBlock>
  );
}

/** Sonuçlar: planlı girdiler — Yapı › Planlı girdiler'in satırları; dokununca düzenleme */
export function SearchPlanned({ rows, cap, onAll }: { rows: GoalRowData[]; cap?: number; onAll?: () => void }) {
  const tag = intlTag(useLocale());
  const today = toLocalDateValue();
  const [editing, setEditing] = useState<GoalRowData["goal"] | null>(null);
  const { shown, capped } = useCapped(rows, cap);
  const n = new Intl.NumberFormat(tag).format(rows.length);
  return (
    <KindBlock kind="planned" count={n}>
      <div className="flex flex-col gap-2 bg-paper p-2.5">
        {shown.map((r) => (
          <GoalRow key={r.goal.id} row={r} today={today} onOpen={() => setEditing(r.goal)} />
        ))}
      </div>
      {capped && <SeeAll n={n} onClick={onAll} />}
      {editing && <DayEntrySheet date={editing.date} open onClose={() => setEditing(null)} editGoal={editing} />}
    </KindBlock>
  );
}

/** Sonuçlar: nesneler ve listeler — önce listeler, sonra nesneler */
export function SearchThings({
  collections,
  things,
  cap,
  onAll,
}: {
  collections: Collection[];
  things: { thing: Thing; collection: Collection | undefined }[];
  cap?: number;
  onAll?: () => void;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const rows = [
    ...collections.map((c) => (
      <ResultRow
        key={c.id}
        href={routes.structureCollection(c.id)}
        shape="square"
        color={c.color ?? "#94a3b8"}
        icon={c.icon}
        glyph={Boxes}
        title={c.name}
        hint={t("search.kind.list")}
      />
    )),
    ...things.map(({ thing, collection }) => (
      <ResultRow
        key={thing.id}
        href={routes.structureThing(thing.id)}
        shape="diamond"
        color={collection?.color ?? "#94a3b8"}
        title={thing.name}
        hint={[collection?.name, thing.archivedAt ? t("objects.archivedTag") : null].filter(Boolean).join(" · ")}
      />
    )),
  ];
  const { shown, capped } = useCapped(rows, cap);
  const n = new Intl.NumberFormat(tag).format(rows.length);
  return (
    <KindBlock kind="things" count={n}>
      {shown}
      {capped && <SeeAll n={n} onClick={onAll} />}
    </KindBlock>
  );
}

/** Sonuçlar: kategoriler ve kalemler — dokununca Yapı'daki sayfası */
export function SearchPlaces({
  categories,
  subs,
  cap,
  onAll,
}: {
  categories: Category[];
  subs: { sub: SubCategory; category: Category }[];
  cap?: number;
  onAll?: () => void;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const rows = [
    ...categories.map((c) => (
      <ResultRow
        key={c.id}
        href={routes.structureCategory(c.id)}
        shape="square"
        color={c.color}
        icon={c.icon}
        glyph={Square}
        title={c.name}
        hint={t("search.kind.category")}
      />
    )),
    ...subs.map(({ sub, category }) => (
      <ResultRow
        key={sub.id}
        href={routes.structureSub(category.id, sub.id)}
        shape="square"
        color={category.color}
        icon={sub.icon ?? category.icon}
        glyph={Square}
        title={sub.name}
        hint={category.name}
      />
    )),
  ];
  const { shown, capped } = useCapped(rows, cap);
  const n = new Intl.NumberFormat(tag).format(rows.length);
  return (
    <KindBlock kind="categories" count={n}>
      {shown}
      {capped && <SeeAll n={n} onClick={onAll} />}
    </KindBlock>
  );
}

/** Sonuçlar: özellikler — dokununca Yapı › Özellikler bu adla aranmış açılır */
export function SearchFeatures({ features, cap, onAll }: { features: ModWithType[]; cap?: number; onAll?: () => void }) {
  const tag = intlTag(useLocale());
  const { shown, capped } = useCapped(features, cap);
  const n = new Intl.NumberFormat(tag).format(features.length);
  return (
    <KindBlock kind="features" count={n}>
      {shown.map((m) => (
        <ResultRow
          key={m.id}
          href={routes.structureMods(m.name)}
          shape="circle"
          color={modColor(m)}
          glyph={modAtomIcon(m)}
          title={m.name}
          hint={measureSummary(m)}
        />
      ))}
      {capped && <SeeAll n={n} onClick={onAll} />}
    </KindBlock>
  );
}
