"use client";

import { useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { CalendarRange, Search } from "lucide-react";
import { db } from "@/lib/db";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { toLocalDateValue } from "@/lib/utils";
import { SummaryBlock, SummaryEmpty } from "@/components/ui/summary-block";
import { EntryCard } from "@/components/dashboard/entry-card";
import type { EntryWithContext } from "@/types";

/** Ara'nın bloklarının rengi — Son girdiler bloklarının şeftalisi */
export const SEARCH_COLOR = "#ffb38a";

/** Bir seferde gösterilen kart — 100 sonucun hepsini birden çizmek telefonda ağır */
const PAGE_SIZE = 30;

/** Öneriler için geriye bakılan gün ve en çok kaç öneri */
const SUGGEST_DAYS = 60;
const SUGGEST_LIMIT = 8;

/** Dünün anahtarı — bileşen dışında: çizim saf kalsın (yaz saatinde de doğru gün) */
function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateValue(d.getTime());
}

/** Kategori karesi — şekil dili: kare = kategori (bkz. design-modular-boxes) */
export function CategorySquare({ color }: { color: string }) {
  return <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-[3px] border-[1.5px] border-[#111]" style={{ background: color }} />;
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
        (on ? "-translate-y-px shadow-[2px_2px_0_#111]" : "bg-white active:bg-[#f5f1e8]")
      }
      style={{
        borderColor: "#111",
        background: on ? color ?? "#111" : undefined,
        color: on && !color ? "#fff" : "#111",
      }}
    >
      {children}
    </button>
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
      lead={{ kind: "title", overline: "", title: t("search.start"), hint: t("search.startHint"), color: SEARCH_COLOR, glyph: Search }}
      stats={[]}
    >
      {suggestions && suggestions.length > 0 ? (
        <div className="bg-white px-3 pb-3 pt-2.5">
          <p className="mb-2 text-[11.5px] font-bold text-[#111]/55">{t("home.frequentTitle")}</p>
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
        <SummaryEmpty text={t("search.startHint")} />
      ) : null}
    </SummaryBlock>
  );
}

/** Eşleşen girdi yok — dar aralıktaysa tek dokunuşla bütün zamanlarda ara */
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
        action={onWiden ? { label: t("search.rangeAll"), onClick: onWiden, icon: CalendarRange, color: "#ffffff" } : undefined}
      />
    </SummaryBlock>
  );
}

/**
 * Sonuçlar — tek blok: ince başta "Sonuçlar · 11 girdi · Bu ay", altında
 * günler krem ara satırda ("Bugün", "Dün", "18 Kasım Salı"), her günün
 * girdileri uygulamanın her yerindeki girdi kartlarıyla (bkz. EntryCard) —
 * kategorinin rengi, simgesi, değerleri. Karta dokununca girdi açılır.
 *
 * Eskiden sonuçlar düz bir tabloydu: solda soluk "Kas 21 · 06:27", yanında
 * "Harcamalar · Kira"; renk ve simge yoktu, girdiler uygulamanın geri
 * kalanındaki gibi görünmüyordu. Başı da 170 px'lik iri bir sayıydı.
 */
export function SearchResults({ entries, hint }: { entries: EntryWithContext[]; hint?: string }) {
  const t = useT();
  const tag = intlTag(useLocale());
  const [visible, setVisible] = useState(PAGE_SIZE);
  const shown = entries.slice(0, visible);
  const remaining = entries.length - shown.length;

  // Günlere böl — sonuçlar zaten yeniden eskiye sıralı
  const days: { key: string; items: EntryWithContext[] }[] = [];
  for (const e of shown) {
    const key = toLocalDateValue(e.occurredAt);
    const last = days[days.length - 1];
    if (last && last.key === key) last.items.push(e);
    else days.push({ key, items: [e] });
  }
  const today = toLocalDateValue();
  const yesterday = yesterdayKey();
  const thisYear = new Date().getFullYear();
  const dayLabel = (key: string) => {
    if (key === today) return t("datetime.today");
    if (key === yesterday) return t("datetime.yesterday");
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(tag, {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: y === thisYear ? undefined : "numeric",
    });
  };
  const fmt = (n: number) => new Intl.NumberFormat(tag).format(n);

  return (
    <SummaryBlock
      compact
      className="mb-4"
      lead={{
        kind: "count",
        color: SEARCH_COLOR,
        glyph: Search,
        overline: t("search.results"),
        value: fmt(entries.length),
        unit: t("home.entries"),
        hint,
      }}
      stats={[]}
    >
      {days.map((d) => (
        <div key={d.key} className="grid gap-[2px]">
          <div className="flex items-center gap-2 bg-[#fff4dc] px-3 py-1.5 text-[#111]">
            <span className="min-w-0 flex-1 truncate text-[12px] font-black leading-tight first-letter:uppercase">{dayLabel(d.key)}</span>
            <span className="shrink-0 font-mono text-[11px] font-bold text-[#111]/55">{fmt(d.items.length)}</span>
          </div>
          <div className="flex flex-col gap-2 bg-white p-2.5">
            {d.items.map((e) => (
              <EntryCard key={e.id} entry={e} />
            ))}
          </div>
        </div>
      ))}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="flex h-11 items-center justify-center bg-white text-[13px] font-black text-[#111] active:bg-[#f5f1e8]"
        >
          {t("list.showMore")} ({fmt(remaining)})
        </button>
      )}
    </SummaryBlock>
  );
}
