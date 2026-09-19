"use client";

import { fmtNum, fmtPct } from "@/lib/analytics";
import { useT } from "@/lib/i18n";
import { StatTile } from "./stat-tile";
import type { StatKey } from "@/types";

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
};

export function StatTiles({
  keys,
  values,
  unit,
  color,
  /** Kutunun altındaki bağlam: dönem adı ("bu ay") */
  periodSub,
  /** Gün sayısı bağlamı ("17 gün") */
  daysSub,
}: {
  keys: StatKey[];
  values: StatValues;
  unit?: string;
  color: string;
  periodSub?: string;
  daysSub?: string;
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

  const shown = keys.slice(0, 3);
  if (!shown.length) return null;

  return (
    <div
      className={
        shown.length >= 3 ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"
      }
    >
      {shown.map((key) => {
        const it = tile(key);
        if (!it) return null;
        return (
          <StatTile
            key={key}
            color={color}
            label={it.label}
            value={it.value}
            unit={"unit" in it ? it.unit : undefined}
            wordValue={"wordValue" in it ? it.wordValue : undefined}
            sub={it.sub}
          />
        );
      })}
    </div>
  );
}
