"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Sayfa özeti (Brütal) — gün, kategori ve alt kategori sayfalarının tepesi.
 *
 * Eskiden üç ayrı kart üst üste duruyordu (tarih/başlık kartı, sayı şeridi,
 * gün analizi), her biri kendi çerçevesi ve gölgesiyle; kategori sayfasında
 * damgalı tek kart, alt kategoride çıplak başlık ve üç ayrı kutu vardı. Artık
 * üçü tek çerçevede, aralarında ortak çizgiler: üstte tarih ya da ad (günde
 * yanında kare Ekle), ortada üç sayı, altta gün analizi ve dağılımı.
 *
 * Dört yerleşim denendi (ayrık ve bitişik kare ızgaralar, bütün bloğun kare
 * olduğu 3×3); kullanıcı bu tek bloğu seçti — en sıkısı, bugünkü düzene en
 * yakını. Dış katman yok: blok kendisi pencere gibi duruyor.
 */

export type SummaryStat = {
  label: string;
  value: string;
  unit?: string;
  color: string;
  /** Verilirse sayı düğme olur (kategoride sıradaki özelliğin toplamı) */
  onClick?: () => void;
};

export type SummaryLead =
  | { kind: "date"; weekday: string; today?: string; day: number; month: string; year: number }
  | { kind: "thing"; color: string; icon?: string; overline: string; title: string };

export type SummaryLink = {
  href: string;
  label: string;
  badge?: string;
  /** Alt kenardaki dağılım — renk ve pay */
  bars?: { key: string; color: string; weight: number; title?: string }[];
};

function Lead({ lead }: { lead: SummaryLead }) {
  if (lead.kind === "date") {
    return (
      <div className="flex h-full min-w-0 flex-col justify-center bg-[#ffd23f] px-3.5 py-2.5 text-[#111]">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-black uppercase tracking-wider">{lead.weekday}</span>
          {lead.today && (
            <span className="rounded-md bg-[#111] px-1.5 py-px text-[9.5px] font-black uppercase tracking-wider text-[#ffd23f]">
              {lead.today}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-baseline gap-2">
          <h1 className="text-[26px] font-black leading-none tracking-tight">
            {lead.day} {lead.month}
          </h1>
          <span className="font-mono text-[12px] font-bold opacity-70">{lead.year}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-w-0 items-center gap-3 px-3 py-2.5 text-[#111]" style={{ background: lead.color }}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-white">
        {lead.icon && <SymbolIcon name={lead.icon} size={22} style={{ color: "#111" }} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[10.5px] font-extrabold uppercase tracking-wider opacity-80">{lead.overline}</div>
        <h1 className="line-clamp-2 break-words text-[22px] font-black leading-[1.05] tracking-tight">{lead.title}</h1>
      </div>
    </div>
  );
}

/** Sayı — beyaz, tepesinde kendi renginde bant */
function Stat({ s }: { s: SummaryStat }) {
  const body = (
    <>
      <span className="h-1.5 shrink-0" style={{ background: s.color }} />
      <span className="min-w-0 px-2.5 pb-2 pt-1.5 text-left">
        <span className="block truncate text-[9.5px] font-black uppercase text-[#111]/60">{s.label}</span>
        <b className="block truncate font-mono text-[19px] font-bold leading-6 tabular-nums">
          {s.value}
          {s.unit && <span className="ml-1 font-sans text-[11px] font-extrabold opacity-70">{s.unit}</span>}
        </b>
      </span>
    </>
  );
  const cls = "flex min-w-0 flex-col bg-white text-[#111]";
  return s.onClick ? (
    <button type="button" onClick={s.onClick} aria-label={`${s.label}: ${s.value} ${s.unit ?? ""}`} className={cn(cls, "active:bg-[#f5f1e8]")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function SummaryBlock({
  lead,
  stats,
  action,
  link,
  className,
}: {
  lead: SummaryLead;
  /** Sayılar — genelde üç */
  stats: SummaryStat[];
  /** Ekle düğmesi (gün) — adın yanındaki kare hücreyi doldurur */
  action?: ReactNode;
  link?: SummaryLink;
  className?: string;
}) {
  // Hücreler arası 2 px siyah: zemin siyah, hücreler arası boşluk 2 px
  return (
    <div
      data-summary=""
      className={cn(
        "grid gap-[2px] overflow-hidden rounded-[18px] border-2 border-[#111] bg-[#111] shadow-[4px_4px_0_#111]",
        className
      )}
    >
      <div className="flex gap-[2px]">
        <div className="min-w-0 flex-1">
          <Lead lead={lead} />
        </div>
        {action && <div className="h-[76px] w-[76px] shrink-0">{action}</div>}
      </div>
      {/* Sayı kadar sütun: bağlı sayısal özelliği olmayan kategoride iki;
          sayılar yüklenirken satır hiç yok */}
      {stats.length > 0 && (
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
          {stats.map((s) => (
            <Stat key={s.label} s={s} />
          ))}
        </div>
      )}
      {link && (
        <Link
          href={link.href}
          prefetch={false}
          className="flex min-w-0 flex-col bg-white text-[#111] active:bg-[#f5f1e8]"
        >
          <span className="flex h-10 items-center gap-2 px-3">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-black uppercase tracking-wide">{link.label}</span>
            {link.badge && (
              <span className="shrink-0 rounded-md bg-[#111] px-1.5 py-px font-mono text-[11px] font-bold text-[#fff4dc]">
                {link.badge}
              </span>
            )}
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </span>
          {link.bars && link.bars.length > 0 && (
            <span className="flex h-2.5 border-t-2 border-[#111]">
              {link.bars.map((b, i) => (
                <span
                  key={b.key}
                  title={b.title}
                  className={i ? "border-l-[1.5px] border-[#111]" : undefined}
                  style={{ background: b.color, flex: b.weight }}
                />
              ))}
            </span>
          )}
        </Link>
      )}
    </div>
  );
}
