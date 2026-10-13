"use client";

import { Plus } from "lucide-react";
import { HScroll } from "@/components/ui/h-scroll";
import { fmtNum, fmtPct, MAX_STATS } from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { StatTile } from "./stat-tile";
import { ViewMenu } from "./view-menu";
import type { StatKey } from "@/types";

/** Kutu adları — menüde ve kutunun başlığında aynı sözcük görünsün */
export const STAT_LABEL: Record<StatKey, MessageKey> = {
  total: "stat.total",
  dailyAverage: "stat.dailyAverage",
  perActiveDay: "stat.perActiveDay",
  average: "stat.average",
  median: "stat.median",
  last: "stat.last",
  first: "stat.first",
  min: "stat.min",
  max: "stat.max",
  range: "stat.range",
  maxDay: "stat.maxDay",
  entries: "insights.entries",
  activeDays: "stat.activeDays",
  streak: "stat.streak",
  distinct: "stat.distinct",
  rate: "stat.yesRate",
  yesCount: "entry.yes",
  noCount: "stat.noCount",
  yesStreak: "stat.yesStreak",
  topChoice: "stat.mostFrequent",
  written: "stat.written",
};

/** Menüdeki bir satırlık açıklama — kutunun ne anlattığı seçmeden bilinsin */
export const STAT_HINT: Record<StatKey, MessageKey> = {
  total: "stat.totalHint",
  dailyAverage: "stat.dailyAverageHint",
  perActiveDay: "stat.perActiveDayHint",
  average: "stat.averageHint",
  median: "stat.medianHint",
  last: "stat.lastHint",
  first: "stat.firstHint",
  min: "stat.minHint",
  max: "stat.maxHint",
  range: "stat.rangeHint",
  maxDay: "stat.maxDayHint",
  entries: "stat.entriesHint",
  activeDays: "stat.activeDaysHint",
  streak: "stat.streakHint",
  distinct: "stat.distinctHint",
  rate: "stat.yesRateHint",
  yesCount: "stat.yesCountHint",
  noCount: "stat.noCountHint",
  yesStreak: "stat.yesStreakHint",
  topChoice: "stat.mostFrequentHint",
  written: "stat.writtenHint",
};

/**
 * Analiz kutuları — hangilerinin çıkacağı ÖZELLİĞİN kendi ayarından geliyor
 * (bkz. types ModAnalysis, lib/analytics statsOf).
 *
 * Eskiden her panelde ölçü türüne göre dallanan uzun bir koşul zinciri vardı
 * ve aynı zincir iki panelde iki kez yazılıydı. Kutular kullanıcı seçimine
 * bağlanınca zincirin yerini tek liste aldı: panel "şu kutuları çiz" diyor,
 * hangi kutunun ne anlattığı burada tek yerde duruyor.
 */

export type StatValues = {
  /** Toplam (oranda "evet" adedi, metinde "kaç girdide yazılmış") */
  total: number;
  /** Dönemdeki gün başına düşen */
  dailyAvg: number;
  /** Girdi başına ortalama */
  avg: number;
  /** Bu metriğin değeri olan girdi sayısı — oranın paydası */
  withValueCount: number;
  /**
   * "Girdi sayısı" kutusunun rakamı. Dağılımda paydadan ayrılıyor: dağılımda
   * değer sayısal bir haritada durmuyor, o yüzden withValueCount 0 kalıyor ve
   * kutu kapsamdaki BÜTÜN girdileri sayıyordu ("31 girdi" derken dağılımda 11
   * kayıt vardı).
   */
  entriesCount: number;
  /** Evet oranı (0–1) */
  rate: number;
  yesStreakCurrent?: number;
  yesStreakBest?: number;
  topChoice?: { choice: string; count: number };
  choiceTotal: number;
  /** Düzey okuması: son ölçüm ve uçlar */
  last: number;
  min: number;
  max: number;
  elapsedDays: number;
  /** Panoya sonradan eklenebilen kutuların kaynağı */
  first: number;
  median: number;
  maxDay: number;
  perActiveDay: number;
  activeDays: number;
  distinct: number;
  streakCurrent?: number;
  streakBest?: number;
  noCount: number;
};

/** Menüdeki "kaldır" satırının anahtarı — gerçek bir kutu türü değil */
const REMOVE = "__remove__";

/** Kutu genişliği — 390px'lik ekranda üçü tam sığmaz, dördüncünün ucu görünür */
const TILE_W = "w-[124px] shrink-0";

export function StatTiles({
  keys,
  values,
  unit,
  color,
  /** Kutunun altındaki bağlam: dönem adı ("bu ay") */
  periodSub,
  /** Gün sayısı bağlamı ("17 gün") */
  daysSub,
  options,
  onPick,
}: {
  keys: StatKey[];
  values: StatValues;
  unit?: string;
  color: string;
  periodSub?: string;
  daysSub?: string;
  /** Bu ölçüde seçilebilen kutular — verilirse kutular dokunulabilir olur */
  options?: StatKey[];
  /** Yuvayı değiştir (key), kaldır (null) ya da sona ekle (slot = -1) */
  onPick?: (slot: number, key: StatKey | null) => void;
}) {
  const t = useT();
  const v = values;

  const tile = (key: StatKey) => {
    switch (key) {
      case "total":
        return {
          label: t("stat.total"),
          value: fmtNum(v.total),
          unit,
          sub: periodSub,
        };
      case "dailyAverage":
        return {
          label: t("stat.dailyAverage"),
          value: fmtNum(v.dailyAvg),
          unit,
          sub: `${v.elapsedDays} ${t("stat.days")}`,
        };
      case "average":
        return {
          label: t("stat.average"),
          value: fmtNum(v.avg),
          unit,
          sub: t("stat.perEntry"),
        };
      case "last":
        return {
          label: t("stat.last"),
          value: fmtNum(v.last),
          unit,
          sub: periodSub,
        };
      case "min":
        return { label: t("stat.min"), value: fmtNum(v.min), unit, sub: periodSub };
      case "max":
        return { label: t("stat.max"), value: fmtNum(v.max), unit, sub: periodSub };
      case "range":
        // Tek kutuda iki uç. Boşluksuz tire ve birimsiz: üç kutuluk ızgarada
        // "79,2 – 79,3 kg" kutuya sığmayıp "79,2 – …" diye kırpılıyordu.
        // Birim ve fark alt banda indi, rakamlar tam okunuyor.
        return {
          label: t("stat.range"),
          value: `${fmtNum(v.min)}–${fmtNum(v.max)}`,
          wordValue: true,
          sub: `Δ ${fmtNum(v.max - v.min)}${unit ? ` ${unit}` : ""}`,
        };
      case "perActiveDay":
        return {
          label: t("stat.perActiveDay"),
          value: fmtNum(v.perActiveDay),
          unit,
          sub: `${v.activeDays} ${t("stat.days")}`,
        };
      case "median":
        return { label: t("stat.median"), value: fmtNum(v.median), unit, sub: t("stat.perEntry") };
      case "first":
        return { label: t("stat.first"), value: fmtNum(v.first), unit, sub: periodSub };
      case "maxDay":
        return { label: t("stat.maxDay"), value: fmtNum(v.maxDay), unit, sub: periodSub };
      case "activeDays":
        return {
          label: t("stat.activeDays"),
          value: fmtNum(v.activeDays),
          sub: `/ ${v.elapsedDays} ${t("stat.days")}`,
        };
      case "streak":
        return {
          label: t("stat.streak"),
          value: fmtNum(v.streakCurrent ?? 0),
          unit: t("stat.days"),
          sub: t("stat.best", { n: v.streakBest ?? 0 }),
        };
      case "distinct":
        return { label: t("stat.distinct"), value: fmtNum(v.distinct), sub: periodSub };
      case "noCount":
        return {
          label: t("stat.noCount"),
          value: fmtNum(v.noCount),
          sub: t("stat.outOfEntries", { n: v.withValueCount }),
        };
      case "entries":
        return {
          label: t("insights.entries"),
          value: fmtNum(v.entriesCount),
          sub: daysSub ?? periodSub,
        };
      case "rate":
        return {
          label: t("stat.yesRate"),
          value: fmtPct(v.rate),
          sub: `${fmtNum(v.total)}/${fmtNum(v.withValueCount)}`,
        };
      case "yesCount":
        return {
          label: t("entry.yes"),
          value: fmtNum(v.total),
          sub: t("stat.outOfEntries", { n: v.withValueCount }),
        };
      case "yesStreak":
        return {
          label: t("stat.yesStreak"),
          value: fmtNum(v.yesStreakCurrent ?? 0),
          unit: t("stat.days"),
          sub: t("stat.best", { n: v.yesStreakBest ?? 0 }),
        };
      case "written":
        return {
          label: t("stat.written"),
          value: fmtNum(v.total),
          sub: t("stat.outOfEntries", { n: v.withValueCount }),
        };
      case "topChoice":
        return {
          label: t("stat.mostFrequent"),
          value: v.topChoice?.choice ?? "—",
          wordValue: true,
          sub: v.topChoice
            ? `${fmtPct(v.topChoice.count / (v.choiceTotal || 1))} · ${fmtNum(v.topChoice.count)}`
            : t("stat.noData"),
        };
    }
  };

  const shown = keys;
  const canEdit = !!onPick && (options?.length ?? 0) > 0;
  if (!shown.length && !canEdit) return null;

  // Kutular alta sarmak yerine SAĞA gidiyor: pano büyüdükçe sayfa uzamıyor,
  // sıra kaydırılıyor. Genişlik üç kutu tam sığmayacak kadar — dördüncünün
  // ucu görünüp "devamı var" diyor.
  return (
    <HScroll wrapperClassName="-mx-4" className="gap-2 px-4 pb-1">
      {shown.map((key, slot) => {
        const it = tile(key);
        if (!it) return null;
        const box = (
          <StatTile
            color={color}
            label={it.label}
            value={it.value}
            unit={"unit" in it ? it.unit : undefined}
            wordValue={"wordValue" in it ? it.wordValue : undefined}
            sub={it.sub}
            pickable={!!onPick && (options?.length ?? 0) > 1}
          />
        );
        if (!canEdit) return <div key={key} className={TILE_W}>{box}</div>;
        return (
          <div key={key} className={TILE_W}>
          <ViewMenu
            label={t("board.boxType")}
            value={key}
            // Zaten panoda duran kutu listede görünmez: aynı rakamı iki
            // kutuda göstermek yer israfı
            options={[
              ...options!
                .filter((o) => o === key || !shown.includes(o))
                .map((o) => ({
                  key: o,
                  label: t(STAT_LABEL[o]),
                  hint: t(STAT_HINT[o]),
                })),
              { key: REMOVE, label: t("board.remove"), danger: true },
            ]}
            onPick={(k) => onPick!(slot, k === REMOVE ? null : (k as StatKey))}
          >
            {box}
          </ViewMenu>
          </div>
        );
      })}

      {/* Yeni kutu — sıranın sonunda, diğerleriyle aynı kutu, ortasında + */}
      {canEdit && shown.length < MAX_STATS && (
        <div className={TILE_W}>
          <ViewMenu
            label={t("board.addBox")}
            value=""
            options={options!
              .filter((o) => !shown.includes(o))
              .map((o) => ({
                key: o,
                label: t(STAT_LABEL[o]),
                hint: t(STAT_HINT[o]),
              }))}
            onPick={(k) => onPick!(-1, k as StatKey)}
          >
            <div className="flex h-full min-h-[84px] items-center justify-center rounded-2xl border border-dashed border-border text-muted-foreground/60 transition-colors hover:border-muted-foreground/50 hover:text-foreground">
              <Plus className="h-5 w-5" />
            </div>
          </ViewMenu>
        </div>
      )}
    </HScroll>
  );
}
