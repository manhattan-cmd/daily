"use client";

import { Pencil, Plus } from "lucide-react";
import { fmtNum, fmtPct } from "@/lib/analytics";
import { useT, type MessageKey } from "@/lib/i18n";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";
import type { AnalysisSectionKey } from "@/types";
import { StatTile } from "./stat-tile";
import { StatCell } from "./stat-tiles";
import { ViewMenu } from "./view-menu";

/**
 * Analiz panosunun bölümleri — kutular ve grafiklerle aynı düzenleme dili
 * (bkz. StatTiles, AnalysisCharts): her bölümün Düzenle'si türünü değiştirir
 * ya da kaldırır, sondaki Bölüm ekle kaldırılanı geri getirir. Hangi
 * bölümlerin durduğu yerin tercihi (bkz. SECTIONS_VIEW).
 *
 * Bölümler eskiden kategori ve alt kategori analizinin kendi sayfasındaydı
 * (İstikrar, Gelişim); o sayfalar kalkınca Analiz'de yer seçiliyken
 * açılan panoya taşındı.
 */

export const SECTION_LABEL: Record<AnalysisSectionKey, MessageKey> = {
  consistency: "an.consistency",
  growth: "an.growth",
};

/** Menüdeki bir satırlık açıklama — seçmeden ne anlattığı bilinsin */
export const SECTION_HINT: Record<AnalysisSectionKey, MessageKey> = {
  consistency: "an.consistencyHint",
  growth: "an.growthHint",
};

const ALL_SECTIONS: AnalysisSectionKey[] = ["consistency", "growth"];

/** Menüdeki "kaldır" satırının anahtarı — gerçek bir bölüm değil */
const REMOVE = "__remove__";

/** İstikrar — girdi girilen günler, metrikten bağımsız */
export type ConsistencyData = {
  activeDays: number;
  elapsedDays: number;
  /** Yüzde (0–100) */
  ratio: number;
  current: number;
  best: number;
};

/** Gelişim — bu dönem ve karşılaştırılan önceki pencere */
export type GrowthData = {
  recentLabel: string;
  prevLabel: string;
  /** Sürmekte olan dönemde "ilk 12 gün" gibi */
  prevNote?: string;
  recentValue: number;
  prevValue: number;
  hasPrev: boolean;
  /** Fark — toplanan rakamlarda yüzde, ortalamalarda puan; önceki yoksa null */
  growthPct: number | null;
  growthPoints: number | null;
  isRate: boolean;
  isAvgLike: boolean;
  unit?: string;
  /** Rakamın okunuşu (Toplam, Ortalama…) */
  note?: string;
  /** Karşılaştırmanın kendisi: "önceki döneme göre", "son 4 hafta vs önceki" */
  basis: string;
};

const LEAD: Record<AnalysisSectionKey, string> = {
  consistency: "#7ae582",
  growth: "#c9b8ff",
};

export function AnalysisSections({
  keys,
  onPick,
  consistency,
  growth,
  color,
}: {
  keys: AnalysisSectionKey[];
  /** Yuvayı değiştir (key), kaldır (null) ya da sona ekle (slot = -1) */
  onPick: (slot: number, key: AnalysisSectionKey | null) => void;
  /** Gösterilemiyorsa (tek günlük dönem) null — bölüm durur, çizilmez */
  consistency: ConsistencyData | null;
  /** Gösterilemiyorsa (dağılımda seçenek seçilmemişken) null */
  growth: GrowthData | null;
  /** Sade temada kutuların rengi */
  color: string;
}) {
  const t = useT();
  const brutal = useIsBrutal();
  const optionsFor = (key: AnalysisSectionKey) => [
    // Zaten panoda duran bölüm listede görünmez
    ...ALL_SECTIONS.filter((o) => o === key || !keys.includes(o)).map((o) => ({
      key: o,
      label: t(SECTION_LABEL[o]),
      hint: t(SECTION_HINT[o]),
    })),
    { key: REMOVE, label: t("board.remove"), danger: true },
  ];
  const addable = ALL_SECTIONS.filter((o) => !keys.includes(o));

  const editMenu = (key: AnalysisSectionKey, slot: number, children: React.ReactNode, triggerClassName?: string) => (
    <ViewMenu
      label={t("board.sectionType")}
      value={key}
      options={optionsFor(key)}
      onPick={(k) => onPick(slot, k === REMOVE ? null : (k as AnalysisSectionKey))}
      triggerClassName={triggerClassName}
    >
      {children}
    </ViewMenu>
  );

  const addMenu = (children: React.ReactNode, triggerClassName?: string) => (
    <ViewMenu
      label={t("board.addSection")}
      value=""
      options={addable.map((o) => ({ key: o, label: t(SECTION_LABEL[o]), hint: t(SECTION_HINT[o]) }))}
      onPick={(k) => onPick(-1, k as AnalysisSectionKey)}
      triggerClassName={triggerClassName}
      pickSingle
    >
      {children}
    </ViewMenu>
  );

  const days = t("stat.days");
  const growthValue = (g: GrowthData) =>
    g.growthPoints !== null
      ? `${g.growthPoints >= 0 ? "+" : "−"}${fmtNum(Math.abs(g.growthPoints))}`
      : g.growthPct !== null
        ? `${g.growthPct >= 0 ? "+" : "−"}${fmtPct(Math.abs(g.growthPct) / 100)}`
        : "—";
  const recentText = (g: GrowthData) => (g.isRate ? fmtPct(g.recentValue) : fmtNum(g.recentValue));
  // Ortalama rakamlarda veri yokluğu "0" diye okunmamalı
  const prevMissing = (g: GrowthData) => g.isAvgLike && !g.hasPrev;
  const prevText = (g: GrowthData) => (prevMissing(g) ? "—" : g.isRate ? fmtPct(g.prevValue) : fmtNum(g.prevValue));
  const prevSub = (g: GrowthData) =>
    prevMissing(g) ? t("stat.noData") : (g.prevNote ?? (g.isRate ? t("stat.yesRate") : g.note));

  if (brutal) {
    // Brütal: her bölüm bir blok (bkz. SummaryBlock) — yanında beyaz Düzenle
    // karosu (grafiklerin Düzenle'si gibi: türünü değiştir ya da kaldır);
    // sonda yeşil Bölüm ekle şeridi
    const editTile = (key: AnalysisSectionKey, slot: number) =>
      editMenu(key, slot, <SummaryTile color="#ffffff" icon={Pencil} label={t("action.edit")} />);
    return (
      <>
        {keys.map((key, slot) => {
          if (key === "consistency") {
            if (!consistency) return null;
            return (
              <SummaryBlock
                key={key}
                lead={{
                  kind: "count",
                  color: LEAD.consistency,
                  overline: t("an.consistency"),
                  value: `%${fmtNum(consistency.ratio)}`,
                  unit: t("insights.activeDays").toLocaleLowerCase("tr"),
                  hint: `${consistency.activeDays}/${consistency.elapsedDays} ${days}`,
                }}
                action={editTile(key, slot)}
                stats={[]}
              >
                <div className="grid grid-cols-2 gap-[2px]">
                  <StatCell color={LEAD.consistency} label={t("insights.currentStreak")} value={fmtNum(consistency.current)} unit={days} sub={t("an.inARow")} />
                  <StatCell color={LEAD.consistency} label={t("an.bestStreak")} value={fmtNum(consistency.best)} unit={days} sub={t("an.longest")} />
                </div>
              </SummaryBlock>
            );
          }
          if (!growth) return null;
          return (
            <SummaryBlock
              key={key}
              lead={{
                kind: "count",
                color: LEAD.growth,
                overline: t("an.growth"),
                value: growthValue(growth),
                unit: growth.growthPoints !== null ? t("stat.points", { n: "" }).trim() : "",
                hint: growth.hasPrev ? growth.basis : t("stat.noPrevPeriod"),
              }}
              action={editTile(key, slot)}
              stats={[]}
            >
              <div className="grid grid-cols-2 gap-[2px]">
                <StatCell
                  color={LEAD.growth}
                  label={growth.recentLabel}
                  value={recentText(growth)}
                  unit={growth.isRate ? undefined : growth.unit}
                  sub={growth.isRate ? t("stat.yesRate") : growth.note}
                />
                <StatCell
                  color={LEAD.growth}
                  label={growth.prevLabel}
                  value={prevText(growth)}
                  unit={growth.isRate || prevMissing(growth) ? undefined : growth.unit}
                  sub={prevSub(growth)}
                />
              </div>
            </SummaryBlock>
          );
        })}
        {addable.length > 0 &&
          addMenu(
            <span
              data-add-section=""
              className="flex items-center gap-3 rounded-[18px] border-2 bg-[#7ae582] px-3 py-2.5 text-[#111] shadow-[4px_4px_0_#111] active:brightness-95"
              style={{ borderColor: "#111" }}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111] text-[#7ae582]">
                <Plus className="h-5 w-5" strokeWidth={3} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-black leading-tight">{t("board.addSection")}</span>
                <span className="block truncate text-[11.5px] font-bold leading-tight text-[#111]/65">
                  {addable.map((o) => t(SECTION_LABEL[o])).join(" · ")}
                </span>
              </span>
            </span>,
            "block w-full text-left"
          )}
      </>
    );
  }

  // Sade temalar: başlık + kutular, başlığın yanında küçük Düzenle; sonda
  // kesik çerçeveli Bölüm ekle (grafiklerin sade dili)
  const editButton =
    "-mr-1 flex h-7 shrink-0 items-center gap-1 rounded-full bg-[var(--sf-2)] px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--sf-3)] hover:text-foreground";
  const head = (key: AnalysisSectionKey, slot: number, extra?: string) => (
    <div className="flex items-center gap-2 px-1">
      <h3 className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(SECTION_LABEL[key])}
        {extra && <span className="font-normal normal-case text-muted-foreground/60"> ({extra})</span>}
      </h3>
      {editMenu(
        key,
        slot,
        <>
          <Pencil className="h-3 w-3" />
          {t("action.edit")}
        </>,
        editButton
      )}
    </div>
  );
  return (
    <>
      {keys.map((key, slot) => {
        if (key === "consistency") {
          if (!consistency) return null;
          return (
            <div key={key} className="flex flex-col gap-2">
              {head(key, slot)}
              <div className="grid grid-cols-3 gap-2">
                <StatTile color={color} label={t("insights.activeDays")} value={`%${fmtNum(consistency.ratio)}`} sub={`${consistency.activeDays}/${consistency.elapsedDays} ${days}`} />
                <StatTile color={color} label={t("insights.currentStreak")} value={fmtNum(consistency.current)} unit={days} sub={t("an.inARow")} />
                <StatTile color={color} label={t("an.bestStreak")} value={fmtNum(consistency.best)} unit={days} sub={t("an.longest")} />
              </div>
            </div>
          );
        }
        if (!growth) return null;
        return (
          <div key={key} className="flex flex-col gap-2">
            {head(key, slot, growth.basis)}
            <div className="grid grid-cols-2 gap-2">
              <StatTile
                color={color}
                label={growth.recentLabel}
                value={recentText(growth)}
                unit={growth.isRate ? undefined : growth.unit}
                sub={
                  growth.growthPoints !== null
                    ? t("stat.pointsVsPrev", { sign: growth.growthPoints >= 0 ? "+" : "−", n: fmtNum(Math.abs(growth.growthPoints)) })
                    : growth.growthPct !== null
                      ? t("stat.pctVsPrev", { sign: growth.growthPct >= 0 ? "+" : "−", pct: fmtPct(Math.abs(growth.growthPct) / 100) })
                      : t("stat.noPrevPeriod")
                }
              />
              <StatTile
                color={color}
                label={growth.prevLabel}
                value={prevText(growth)}
                unit={growth.isRate || prevMissing(growth) ? undefined : growth.unit}
                sub={prevSub(growth)}
              />
            </div>
          </div>
        );
      })}
      {addable.length > 0 &&
        addMenu(
          <span className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border py-3 text-[12px] font-medium text-muted-foreground/70 transition-colors hover:border-muted-foreground/50 hover:text-foreground">
            <Plus className="h-3.5 w-3.5" />
            {t("board.addSection")}
          </span>,
          "block w-full"
        )}
    </>
  );
}
