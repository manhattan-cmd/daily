"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, Pencil, Plus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import type { StructureSummary } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * BRÜTAL YAPI SAYFALARI — yalnız Brütal tema seçiliyken (deneme).
 *
 * Yapı ekranları için 21 yönlü öneri sayfasındaki "P · Brütal" yerleşimi:
 * kategoriler düz renkli, kalın çerçeveli kartlar; kategori ve alt kategori
 * sayfasının tepesinde renkli büyük bir kart ve özet kutuları; altta tek
 * ana eylem. Başlığın hizasında simge yok — analiz, düzenle, sil üst
 * şeritte kare düğmeler. Diğer temalarda bu parçalar hiç çizilmez.
 */
export function useIsBrutal(): boolean {
  return useSkin() === "brutal";
}

const fmt = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });

/** Kare, çerçeveli, gölgeli küçük düğme (geri, analiz, düzenle, sil) */
export function BrutIconButton({
  icon: Icon,
  label,
  href,
  onClick,
  danger,
}: {
  icon: LucideIcon;
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const cls = cn(
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none",
    danger && "bg-[#ff6b6b]"
  );
  return href ? (
    <Link href={href} aria-label={label} title={label} className={cls}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={cls}>
      <Icon className="h-[18px] w-[18px]" strokeWidth={2.5} />
    </button>
  );
}

/** Üst şerit: solda geri, sağda analiz · düzenle · sil */
export function BrutTopStrip({
  back,
  analyticsHref,
  onEdit,
  onDelete,
}: {
  back: string;
  analyticsHref?: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const t = useT();
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between bg-background px-4 pb-3 pt-safe">
      <div className="pt-3">
        <BrutIconButton icon={ArrowLeft} label={t("action.back")} href={back} />
      </div>
      <div className="flex gap-2 pt-3">
        {analyticsHref && <BrutIconButton icon={BarChart3} label={t("nav.insights")} href={analyticsHref} />}
        {onEdit && <BrutIconButton icon={Pencil} label={t("action.edit")} onClick={onEdit} />}
        {onDelete && <BrutIconButton icon={Trash2} label={t("action.delete")} onClick={onDelete} danger />}
      </div>
    </div>
  );
}

/** Kategori sayfasının büyük kartı — renkli zemin, beyaz karo, ad, sayılar, damga */
export function BrutHeroCard({
  color,
  icon,
  overline,
  title,
  summary,
}: {
  color: string;
  icon?: string;
  overline: string;
  title: string;
  summary?: StructureSummary;
}) {
  const t = useT();
  // Damga: bağlı sayısal özelliklerin toplamı; dokundukça sıradaki özellik
  const metrics = summary?.metrics ?? [];
  const [mi, setMi] = useState(0);
  const metric = metrics.length ? metrics[mi % metrics.length] : undefined;
  return (
    <div
      className="relative mb-6 flex items-center gap-3 rounded-2xl border-2 border-[#111] p-4 shadow-[5px_5px_0_#111]"
      style={{ background: color }}
    >
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
        {icon ? <SymbolIcon name={icon} size={28} style={{ color: "#111" }} /> : null}
      </span>
      <div className="min-w-0 flex-1 text-[#111]">
        <div className="text-[11px] font-extrabold uppercase tracking-wider opacity-80">{overline}</div>
        <div className="break-words text-[26px] font-black leading-[1.05] tracking-tight">{title}</div>
        {summary && (
          <div className="mt-1 text-[12.5px] font-bold">
            {t("brut.subsAndEntries", { subs: summary.subs, entries: summary.entries })}
          </div>
        )}
      </div>
      {/* Damga — düz; bağlı sayısal özelliklerin toplamı, dokundukça sıradaki */}
      {metric && (
        <button
          type="button"
          onClick={() => setMi((i) => i + 1)}
          aria-label={`${metric.name}: ${fmt(metric.total)} ${metric.unit}`}
          className="absolute -right-2 -top-3 flex items-center gap-1.5 rounded-lg border-2 border-[#111] bg-[#ff6b6b] px-2 py-0.5 text-[#111] shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <span className="text-[14px] font-black tabular-nums">
            {fmt(metric.total)}{metric.unit ? ` ${metric.unit}` : ""}
          </span>
          {metrics.length > 1 && (
            <span className="text-[10px] font-extrabold uppercase opacity-80">{metric.name}</span>
          )}
        </button>
      )}
    </div>
  );
}

/** Alt kategori sayfasının başlığı ve üç renkli kutusu */
export function BrutSubHeader({
  parentName,
  title,
  summary,
}: {
  parentName?: string;
  title: string;
  summary?: StructureSummary;
}) {
  const t = useT();
  const boxes: { label: string; value: string; bg: string; wide?: boolean }[] = [];
  if (summary?.money)
    boxes.push({ label: summary.money.name, value: `${fmt(summary.money.total)} ${summary.money.unit}`, bg: "#ff6b6b", wide: true });
  if (summary) boxes.push({ label: t("brut.entries"), value: String(summary.entries), bg: "#8ea6ff" });
  if (summary?.money) boxes.push({ label: t("brut.average"), value: fmt(summary.money.avg), bg: "#7ae582" });
  else if (summary) boxes.push({ label: t("structure.subcategories"), value: String(summary.subs), bg: "#7ae582" });
  return (
    <div className="mb-6 text-[#111]">
      {parentName && (
        <div className="text-[12px] font-extrabold uppercase tracking-wider">{parentName} /</div>
      )}
      <h1 className="break-words text-[34px] font-black leading-none tracking-tight">{title}</h1>
      {boxes.length > 0 && (
        <div className="mt-3 flex gap-2">
          {boxes.map((b) => (
            <div
              key={b.label}
              className={cn(
                "min-w-0 rounded-xl border-2 border-[#111] px-2.5 py-2 shadow-[3px_3px_0_#111]",
                b.wide ? "flex-[1.4]" : "flex-1"
              )}
              style={{ background: b.bg }}
            >
              <span className="block truncate text-[10.5px] font-extrabold">{b.label}</span>
              <b className="block truncate text-[18px] font-black tabular-nums">{b.value}</b>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kategoriler: düz renkli, kalın çerçeveli kartlar */
export function BrutCategoryCard({
  href,
  color,
  icon,
  name,
  subs,
  entries,
}: {
  href: string;
  color: string;
  icon?: string;
  name: string;
  subs?: number;
  entries?: number;
}) {
  const t = useT();
  return (
    <Link
      href={href}
      prefetch={false}
      className="flex min-h-[112px] flex-col gap-1 rounded-2xl border-2 border-[#111] p-3 text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#111]"
      style={{ background: color }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[#111] bg-white">
        {icon ? <SymbolIcon name={icon} size={18} style={{ color: "#111" }} /> : null}
      </span>
      <b className="mt-auto break-words text-[16px] font-black leading-tight">{name}</b>
      {subs !== undefined && (
        <span className="text-[11.5px] font-bold">
          {t("brut.subsShort", { subs, entries: entries ?? 0 })}
        </span>
      )}
    </Link>
  );
}

/** Altta tek ana eylem — sarı, kalın çerçeveli, sayfanın altına yapışık */
export function BrutCta({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="sticky bottom-3 z-20 mt-4">
      <button
        type="button"
        onClick={onClick}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-[#111] bg-[#ffd23f] text-[16px] font-black text-[#111] shadow-[4px_4px_0_#111] transition-transform active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0_#111]"
      >
        <Plus className="h-5 w-5" strokeWidth={3} />
        {label}
      </button>
    </div>
  );
}
