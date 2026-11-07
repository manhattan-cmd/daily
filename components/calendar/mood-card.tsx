"use client";

import { useState } from "react";
import { Smile } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { cn, formatDateTime } from "@/lib/utils";
import { splitChoiceLevel } from "@/lib/choice-level";
import { EmotionFace, ScaleFace, emotionLook, emotionName } from "@/lib/icons/emotions";
import { LevelCapsule } from "@/components/dashboard/entry-parts";
import { useT } from "@/lib/i18n";
import { useLongPress } from "@/lib/use-long-press";
import { useSkin } from "@/lib/skin";
import { ENTRY_BLOCK_CLS, EntryBlockCell, EntryBlockHead, EntryBlockTime } from "@/components/dashboard/entry-block";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/** Kartta en fazla kaç duygu gösterilir (adlarıyla); kalanı "+n daha" */
const MAX_FACES = 4;

/**
 * Yerleşik ruh hali kartı — mutluluk skalası + duygular.
 *
 * Uyku kartıyla AYNI iskelet (bkz. sleep-card): üstte künye (sembol, başlık,
 * sağda tarih), saç teli çizgi, altta ölçü kapsülleri ve sağda skala. İki
 * yerleşik kart yan yana durduğu için farklı düzenlerde olmaları listeyi
 * dağıtıyordu. Ayrılan tek şey kapsülün içeriği: uykuda tek bir saat aralığı,
 * burada duygu başına bir yuvarlak yüz — veri öyle geliyor.
 *
 * Künyenin sağında tarih ve saat; `dateLabel` verilirse o yazar (ana sayfanın
 * karışık listesi yalnız günü verir). Gün sayfasında eskiden boştu — sıradan
 * girdilerde tarih duruyor, ruh halinde durmuyordu.
 *
 * Duygular aynı özellikten gelen BİRDEN ÇOK değer, o yüzden `find` değil
 * `filter` ile toplanıyor: girdi kartının geri kalanı tek değer varsayar,
 * burada varsayım geçmiyor.
 */
export function MoodCard({
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

  const selects = entry.values.filter(
    (v) => (v.entryType?.valueType ?? "") === "select"
  );
  // Skala = seçenekleri sayı olan özellik; kalanı duygu
  const levelValue = selects.find((v) =>
    (v.entryType?.choices ?? []).every((c) => /^\d+$/.test(c))
  );
  const emotions = selects
    .filter((v) => v.modId !== levelValue?.modId)
    .map((v) => splitChoiceLevel(v.value))
    // Güçlü duygu önce: kartta yalnız birkaçı sığıyor, en çok hissedilen
    // görünsün (yoğunluk kaydı olmayanlar sıralamayı bozmadan sonda kalır)
    .sort((a, b) => (b.level ?? 0) - (a.level ?? 0));

  // Yerleşik akışın rengi kategoriden; boşsa ruh halinin pembesi
  const color = entry.category.color || "#f472b6";

  const levelMax = levelValue?.entryType?.choices?.length ?? 5;
  const level = levelValue ? Number(levelValue.value) : null;
  const hasLevel = level !== null && !Number.isNaN(level);

  // Alt bölüm — iki biçimde de aynı kapsüller: önce mutluluk (yüz, "2/5" ve
  // noktalar), sonra her duygu ADIYLA kendi kapsülünde. Eskiden duygular
  // yalnız yüz karolarıydı (hangisi olduğu okunmuyordu), mutluluk da kartın
  // sağında kapsülsüz duruyordu.
  const shown = emotions.slice(0, MAX_FACES);
  const body = (
    <>
      {hasLevel && levelValue && (
        <LevelCapsule
          icon={<ScaleFace index={level - 1} total={levelMax} size={13} style={{ color }} />}
          value={levelValue.value}
          choices={levelValue.entryType?.choices ?? []}
          color={color}
          title={t("mood.level")}
        />
      )}
      {shown.map((e) => {
        const look = emotionLook(e.label);
        const name = emotionName(e.label, t);
        return (
          <span
            key={e.label}
            data-capsule=""
            data-word=""
            title={e.level === null ? name : `${name} %${e.level}`}
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
            style={{
              ["--cap-c" as string]: look.color,
              background: `${look.color}1f`,
              boxShadow: `inset 0 0 0 1px ${look.color}47`,
            }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${look.color}40` }}
            >
              <EmotionFace name={e.label} size={14} style={{ color: look.color }} />
            </span>
            <span className="truncate text-[12.5px] font-semibold leading-none" style={{ color: look.color }}>
              {name}
            </span>
            {e.level !== null && (
              <span className="shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground/70">
                %{e.level}
              </span>
            )}
          </span>
        );
      })}
      {emotions.length > shown.length && (
        <span
          data-more=""
          className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-semibold leading-none"
          style={{ color, boxShadow: `inset 0 0 0 1px ${color}40` }}
        >
          {t("entry.moreValues", { n: emotions.length - shown.length })}
        </span>
      )}
      {!hasLevel && emotions.length === 0 && (
        <span className="truncate text-[11px] leading-none text-muted-foreground">{t("mood.logged")}</span>
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
          aria-label={t("mood.edit")}
        >
          <EntryBlockHead
            color={color}
            icon={hasLevel ? <ScaleFace index={level - 1} total={levelMax} size={14} style={{ color: "#111" }} /> : <Smile className="h-3.5 w-3.5" strokeWidth={2.25} />}
            title={t("mood.title")}
            right={dateLabel ? <EntryBlockTime>{dateLabel}</EntryBlockTime> : undefined}
          />
          <EntryBlockCell className="flex flex-wrap items-center gap-1.5">{body}</EntryBlockCell>
          {selection?.active && (
            <SelectionLayer selected={selection.selected} onToggle={selection.onToggle} label={t("mood.select")} />
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
        // Kenarlık ve zemin satır içi — sınıfla verilen kenarlık rengi
        // globals.css'teki katmansız `*` kuralı yüzünden uygulanmıyor
        // (bkz. sleep-card)
        style={{
          ["--card-c" as string]: color,
          borderColor: `${color}73`,
          background: `linear-gradient(135deg, ${color}24, ${color}0d 45%, transparent), var(--card)`,
        }}
        aria-label={t("mood.edit")}
      >
        {/* Künye — sembol, başlık, sağda tarih */}
        <div data-entry-head="" data-sel-head="" className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
            style={{ background: `${color}33` }}>
            {hasLevel ? (
              <ScaleFace
                index={level - 1}
                total={levelMax}
                size={17}
                style={{ color }}
              />
            ) : (
              <Smile
                className="h-[17px] w-[17px]"
                style={{ color }}
                strokeWidth={1.75}
              />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
            style={{ color }}>
            {t("mood.title")}
          </span>
          {dateLabel && (
            <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
              {dateLabel}
            </span>
          )}
        </div>

        {/* Alt bölüm — mutluluk ve duygu kapsülleri */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-[var(--ln-1)] pt-2">
          {body}
        </div>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("mood.select")}
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
