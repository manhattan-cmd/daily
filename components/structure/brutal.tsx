"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BarChart3, ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import type { StructureSummary } from "@/lib/db/queries";
import type { Category, SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { SmartText } from "@/components/ui/smart-text";
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
  onAddSub,
}: {
  back: string;
  analyticsHref?: string;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Bulunulan yerin altına alt kategori aç */
  onAddSub?: () => void;
}) {
  const t = useT();
  return (
    <div className="sticky top-0 z-30 -mx-4 mb-4 flex items-center justify-between bg-background px-4 pb-3 pt-safe">
      <div className="pt-3">
        <BrutIconButton icon={ArrowLeft} label={t("action.back")} href={back} />
      </div>
      <div className="flex gap-2 pt-3">
        {onAddSub && (
          <button
            type="button"
            onClick={onAddSub}
            aria-label={t("entry.addSub")}
            title={t("entry.addSub")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-[#7ae582] text-[#111] shadow-[2px_2px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
          >
            <Plus className="h-5 w-5" strokeWidth={3} />
          </button>
        )}
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
  color,
  icon,
}: {
  parentName?: string;
  title: string;
  summary?: StructureSummary;
  /** Kategorinin rengi — alt kategorinin simge karosu bununla */
  color?: string;
  /** Alt kategorinin sembolü (yoksa kategorininki) */
  icon?: string;
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
      <div className="flex items-center gap-3">
        {icon && (
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] shadow-[3px_3px_0_#111]"
            style={{ background: color ?? "#ffd23f" }}
          >
            <SymbolIcon name={icon} size={28} style={{ color: "#111" }} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          {parentName && (
            <div className="truncate text-[12px] font-extrabold uppercase tracking-wider">{parentName} /</div>
          )}
          <h1 className="break-words text-[34px] font-black leading-none tracking-tight">{title}</h1>
        </div>
      </div>
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

/** Boş bölüm kartı — kesik çerçeveli, kısa açıklama, isteğe bağlı eylem */
export function BrutEmpty({
  title,
  hint,
  action,
  onAction,
}: {
  title: string;
  hint?: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-[#111] bg-white/60 px-4 py-5 text-center text-[#111]">
      <b className="text-[14px] font-black">{title}</b>
      {hint && <span className="text-[12px] font-semibold opacity-70">{hint}</span>}
      {action && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-1 flex h-9 items-center gap-1.5 rounded-xl border-2 border-[#111] bg-[#ffd23f] px-3 text-[13px] font-black shadow-[2px_2px_0_#111] active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
        >
          <Plus className="h-4 w-4" strokeWidth={3} />
          {action}
        </button>
      )}
    </div>
  );
}

/**
 * Kategoriler sayfasının ağacı — her kategori kalın çerçeveli, sert gölgeli
 * bir kart: tepede kategorinin renginde başlık şeridi (beyaz karo, dev ad,
 * alt kategori · girdi sayısı), altında gerçek dallarla (├ └) bağlanmış alt
 * kategoriler. Kartlar katlanabilir; katlananlar cihazda hatırlanıyor.
 * Her satır kendi kategori / alt kategori sayfasına gider.
 */
type TreeLine = { sub: SubCategory; depth: number; last: boolean; rails: boolean[] };

const FOLD_KEY = "routine:brut-tree-folded";
const COL = 18; // bir derinlik basamağının genişliği
const BASE = 34; // gövde — başlıktaki karonun ortasından iner

function readFolded(): Set<string> {
  try {
    const raw = window.localStorage.getItem(FOLD_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function BrutCategoryTree({
  categories,
  subs,
  counts,
}: {
  categories: Category[];
  subs: SubCategory[];
  counts?: Map<string, number>;
}) {
  const t = useT();
  const [folded, setFolded] = useState<Set<string>>(() =>
    typeof window === "undefined" ? new Set() : readFolded()
  );
  const toggle = (id: string) =>
    setFolded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(FOLD_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  // Kategori başına düzleştirilmiş ağaç: her satır hangi atasının çizgisinin
  // sürdüğünü (rails) ve kardeşlerinin sonuncusu olup olmadığını bilir
  const lines = useMemo(() => {
    const kids = new Map<string, SubCategory[]>();
    for (const s of subs) {
      const k = `${s.categoryId}/${s.parentId ?? ""}`;
      kids.set(k, [...(kids.get(k) ?? []), s]);
    }
    const out = new Map<string, TreeLine[]>();
    for (const cat of categories) {
      const acc: TreeLine[] = [];
      const walk = (parentId: string | undefined, depth: number, rails: boolean[]) => {
        const list = (kids.get(`${cat.id}/${parentId ?? ""}`) ?? []).sort((a, b) => a.order - b.order);
        list.forEach((s, i) => {
          const last = i === list.length - 1;
          acc.push({ sub: s, depth, last, rails });
          walk(s.id, depth + 1, [...rails, !last]);
        });
      };
      walk(undefined, 1, []);
      out.set(cat.id, acc);
    }
    return out;
  }, [categories, subs]);

  const count = (n: number) =>
    n > 0 ? (
      <span className="ml-auto shrink-0 rounded-md border-[1.5px] border-[#111] bg-[#111] px-1.5 py-px text-[11px] font-black tabular-nums text-[#FFF4DC]">
        {n}
      </span>
    ) : (
      <span className="ml-auto shrink-0 px-1.5 text-[12px] font-black text-[#111]/25">–</span>
    );

  return (
    <div className="flex flex-col gap-5 pb-6 pt-1">
      {categories.map((cat) => {
        const rows = lines.get(cat.id) ?? [];
        const open = !folded.has(cat.id);
        const total = counts?.get(`c:${cat.id}`) ?? 0;
        return (
          <section
            key={cat.id}
            className="overflow-hidden rounded-2xl border-2 border-[#111] bg-white shadow-[5px_5px_0_#111]"
          >
            {/* Başlık şeridi — kategorinin renginde */}
            <div
              className={cn("flex items-stretch", open && rows.length > 0 && "border-b-2 border-[#111]")}
              style={{ background: cat.color }}
            >
              <Link
                href={routes.structureCategory(cat.id)}
                prefetch={false}
                className="flex min-w-0 flex-1 items-center gap-3 px-3 py-3 text-[#111] active:bg-[#111]/10"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 border-[#111] bg-white shadow-[2px_2px_0_#111]">
                  {cat.icon && <SymbolIcon name={cat.icon} size={22} style={{ color: "#111" }} />}
                </span>
                <span className="min-w-0 flex-1">
                  <SmartText text={cat.name} className="block text-[19px] font-black leading-tight tracking-tight" />
                  <span className="block text-[11.5px] font-bold opacity-75">
                    {t("brut.subsAndEntries", { subs: rows.length, entries: total })}
                  </span>
                </span>
              </Link>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(cat.id)}
                  aria-expanded={open}
                  aria-label={cat.name}
                  className="flex w-12 shrink-0 items-center justify-center border-l-2 border-[#111] text-[#111] active:bg-[#111]/10"
                >
                  <ChevronDown className={cn("h-5 w-5 transition-transform", !open && "-rotate-90")} strokeWidth={3} />
                </button>
              )}
            </div>

            {/* Dallar */}
            {open && rows.length > 0 && (
              <div className="pb-1.5">
                {rows.map(({ sub, depth, last, rails }) => {
                  const x = BASE + (depth - 1) * COL;
                  const icon = sub.icon ?? cat.icon;
                  return (
                    <Link
                      key={sub.id}
                      href={routes.structureSub(cat.id, sub.id)}
                      prefetch={false}
                      className="relative flex min-h-[38px] items-center gap-2.5 pr-3 text-[#111] active:bg-[#111]/[0.06]"
                      style={{ paddingLeft: x + COL - 2 }}
                    >
                      {/* Atalardan süren çizgiler */}
                      {rails.map((on, k) =>
                        on ? (
                          <span key={k} className="absolute inset-y-0 w-[2px] bg-[#111]" style={{ left: BASE + k * COL - 1 }} />
                        ) : null
                      )}
                      {/* Kendi dalı: ├ ya da └ */}
                      <span
                        className={cn("absolute top-0 w-[2px] bg-[#111]", last ? "h-1/2" : "h-full")}
                        style={{ left: x - 1 }}
                      />
                      <span className="absolute top-1/2 h-[2px] -translate-y-px bg-[#111]" style={{ left: x - 1, width: COL - 6 }} />
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center border-2 border-[#111]",
                          depth === 1 ? "h-7 w-7 rounded-lg" : "h-6 w-6 rounded-md"
                        )}
                        style={{ background: depth === 1 ? cat.color : "#fff" }}
                      >
                        {icon && <SymbolIcon name={icon} size={depth === 1 ? 15 : 13} style={{ color: "#111" }} />}
                      </span>
                      <SmartText
                        text={sub.name}
                        className={cn(
                          "min-w-0",
                          depth === 1 ? "text-[14.5px] font-extrabold" : "text-[13.5px] font-semibold text-[#111]/80"
                        )}
                      />
                      {count(counts?.get(sub.id) ?? 0)}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
