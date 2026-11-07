"use client";

import { useState } from "react";
import { Clock, MoonStar, Star } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { parseDTR } from "@/components/forms/datetime-range-input";
import { LevelCapsule } from "@/components/dashboard/entry-parts";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { cn, formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/use-long-press";
import { useSkin } from "@/lib/skin";
import { ENTRY_BLOCK_CLS, EntryBlockCell, EntryBlockHead, EntryBlockTime } from "@/components/dashboard/entry-block";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Yerleşik uyku kartı — süre aralığı + kalite.
 *
 * Girdi kartıyla aynı iskelet: üstte künye (sembol + başlık + tarih), altında
 * saç teli çizgiyle ayrılmış bölümde ölçü kapsülü. Başlık eskiden saatlerin
 * üstünde sıkışıyor, kart iki satırlık tek bir blok gibi duruyordu.
 *
 * Künyenin sağında tarih ve saat (uyanma anı); `dateLabel` verilirse o yazar
 * (ana sayfanın karışık listesi yalnız günü verir). Gün sayfasında eskiden
 * boş bırakılıyordu — sıradan girdilerin künyesinde tarih dururken uykunun
 * künyesi eksik görünüyordu.
 * `selection` verilirse basılı tutmak toplu seçimi başlatır; kartın kendisi
 * `<button>` olduğundan seçim katmanı dıştaki sarmalayıcıya konur.
 */
export function SleepCard({
  entry,
  selection,
  dateLabel = formatDateTime(entry.occurredAt),
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
  dateLabel?: string;
}) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const brutal = useSkin() === "brutal";

  const rangeValue = entry.values.find(
    (v) => (v.entryType?.valueType ?? "") === "datetime-range"
  );
  const qualityValue = entry.values.find(
    (v) => (v.entryType?.valueType ?? "") === "select"
  );

  const { start, end } = parseDTR(rangeValue?.value ?? "");
  const startTime = start?.split("T")[1]?.slice(0, 5);
  const endTime = end?.split("T")[1]?.slice(0, 5);
  // Süre kısa: "7 sa 30 dk" — uzun hali ("7 saat 30 dakika") kapsülü
  // taşırıp kaliteyi alt satıra itiyordu
  const duration = (() => {
    if (!start || !end) return null;
    const diff = new Date(end).getTime() - new Date(start).getTime();
    if (diff <= 0) return null;
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h === 0 ? t("sleep.durM", { m }) : m === 0 ? t("sleep.durH", { h }) : t("sleep.durHM", { h, m });
  })();

  // Yerleşik akışın rengi kategoriden; boşsa uykunun moru
  const color = entry.category.color || "#8b5cf6";

  const qualityChoices = qualityValue?.entryType?.choices ?? [];

  // Alt bölüm — iki biçimde de aynı kapsüller: saat aralığı (süresiyle) ve
  // kalite. Kalite eskiden kartın sağında kapsülsüz "4/5 ●●●●○" idi
  const body = (
    <>
          <span
            data-capsule=""
            className="inline-flex min-w-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5"
            style={{
              ["--cap-c" as string]: color,
              background: `${color}1f`,
              boxShadow: `inset 0 0 0 1px ${color}47`,
            }}
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${color}3d` }}>
              <Clock className="h-3 w-3" style={{ color }} strokeWidth={1.9} />
            </span>
            {startTime || endTime ? (
              <span className="text-[13px] font-semibold leading-none tabular-nums text-foreground">
                {startTime ?? "?"}
                <span className="mx-0.5 font-normal text-muted-foreground">→</span>
                {endTime ?? "?"}
              </span>
            ) : (
              <span className="truncate text-[11px] leading-none text-muted-foreground">
                {t("sleep.logged")}
              </span>
            )}
            {duration && (
              <span data-plain="" className="shrink-0 text-[10px] leading-none text-muted-foreground/70">
                {duration}
              </span>
            )}
          </span>

          {qualityValue && qualityChoices.includes(qualityValue.value) && (
            <LevelCapsule
              icon={<Star className="h-3 w-3" style={{ color }} strokeWidth={1.9} />}
              value={qualityValue.value}
              choices={qualityChoices}
              color={color}
              title={qualityValue.mod?.name ?? qualityValue.entryType?.name}
            />
          )}
    </>
  );

  // Brütal: ana sayfanın blok dili (bkz. entry-block) — künye kendi renginde,
  // altında beyaz hücrede kapsüller; kapsüller aynı kalır
  if (brutal) {
    return (
      <>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setEditOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setEditOpen(true);
          }}
          {...(selection && !selection.active ? longPress : {})}
          data-entry-block=""
          className={cn(
            ENTRY_BLOCK_CLS,
            "cursor-pointer transition-transform active:scale-[0.99]",
            selection?.selected && selectedCardClass
          )}
          aria-label={t("sleep.edit")}
        >
          <EntryBlockHead
            color={color}
            icon={<MoonStar className="h-3.5 w-3.5" strokeWidth={2.25} />}
            title={t("sleep.title")}
            right={dateLabel ? <EntryBlockTime>{dateLabel}</EntryBlockTime> : undefined}
          />
          <EntryBlockCell color={color} className="flex flex-wrap items-center gap-1.5">{body}</EntryBlockCell>
          {selection?.active && (
            <SelectionLayer selected={selection.selected} onToggle={selection.onToggle} label={t("sleep.select")} />
          )}
        </div>
        {editOpen && <EditEntryModal entry={entry} open={editOpen} onOpenChange={setEditOpen} />}
      </>
    );
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditOpen(true);
        }}
        {...(selection && !selection.active ? longPress : {})}
        data-entry-card=""
        className={cn(
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-2.5 py-2 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        // Kenarlık ve zemin SATIR İÇİ: globals.css'teki `* { border-color:
        // var(--border) }` katmansız bir kural, yani Tailwind'in
        // `border-violet-500/45` gibi yardımcılarını eziyor — sınıfla verilen
        // kenarlık rengi hiç uygulanmıyordu, kart varsayılan gri çerçeveyle
        // çiziliyordu. Sıradan girdi kartı da bu yüzden satır içi stil
        // kullanıyor. Renk kategoriden geliyor: kullanıcı rengi değiştirirse
        // kart da onunla gidiyor.
        style={{
          ["--card-c" as string]: color,
          borderColor: `${color}73`,
          background: `linear-gradient(135deg, ${color}24, ${color}0d 45%, transparent), var(--card)`,
        }}
        aria-label={t("sleep.edit")}
      >
        {/* Künye — sembol, başlık, sağda tarih */}
        <div data-entry-head="" data-sel-head="" className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}33` }}>
            <MoonStar
              className="h-[17px] w-[17px]"
              style={{ color }}
              strokeWidth={1.75}
            />
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color }}>
            {t("sleep.title")}
          </span>
          {dateLabel && (
            <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
              {dateLabel}
            </span>
          )}
        </div>

        {/* Alt bölüm — aralık ve kalite kapsülleri */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--ln-1)] pt-2">
          {body}
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("sleep.select")}
          />
        )}
      </div>

      {/* Yalnız açıkken yüklenir — bkz. entry-card */}
      {editOpen && (
        <EditEntryModal entry={entry} open={editOpen} onOpenChange={setEditOpen} />
      )}
    </>
  );
}
