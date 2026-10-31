"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Plus, X, type LucideIcon } from "lucide-react";
import { SymbolIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

/**
 * Sayfa özeti (Brütal) — gün, kategori, alt kategori sayfalarının ve ana
 * sayfanın Bugün bloğunun tepesi.
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
  /** Kategori / alt kategori — kendi renginde, beyaz karoda simgesi. Yapı →
   *  Kategoriler listesinde üst yazı yok, adın altında sayılar (hint) */
  | {
      kind: "thing";
      color: string;
      icon?: string;
      /** Sembol adı yerine simge bileşeni (Özellikler: ölçü türünün simgesi) */
      glyph?: LucideIcon;
      overline?: string;
      title: string;
      hint?: string;
    }
  /** Ana sayfa: "BUGÜN · 8 girdi" — sayının neyin sayısı olduğu üstünde yazılı;
   *  renk verilmezse sarı (Kategorilerin pembe) */
  | {
      kind: "count";
      overline: string;
      value: string;
      unit: string;
      hint?: string;
      color?: string;
      /** İnce başta adın yanındaki karoda (bkz. SummaryBlock compact) */
      glyph?: LucideIcon;
      /** Köşede kapatma düğmesi (Başlarken) */
      close?: { label: string; onClick: () => void };
    }
  /** Ana sayfa: sayısız başlık (Yine ekle) — etiket, ad, açıklama */
  | {
      kind: "title";
      overline: string;
      title: string;
      hint?: string;
      color: string;
      /** İnce başta adın yanındaki karoda (bkz. SummaryBlock compact) */
      glyph?: LucideIcon;
      /** Köşede kapatma düğmesi (Yapı'nın örnek notu) */
      close?: { label: string; onClick: () => void };
    };

export type SummaryLink = {
  href: string;
  label: string;
  badge?: string;
  /** Alt kenardaki dağılım — renk ve pay */
  bars?: { key: string; color: string; weight: number; title?: string }[];
  /**
   * Verilirse satır gittiği yerin bandı gibi çizilir: o renkte tram benekli
   * zemin, siyah kutuda ters yazılı ad, iki yanında kare düğmeler (simge ve
   * ok). Ana sayfada Günü aç günün sarısı, Takvimi aç Takvim'in yeşili,
   * Yapıya git Yapı'nın sarısı. Verilmezse sade beyaz satır (gün sayfası).
   */
  color?: string;
  icon?: LucideIcon;
};

/** Bölüm bantlarının tram benekleri (bkz. globals.css "bolum bantlari") */
const bandDots = (color: string) => ({
  backgroundColor: color,
  backgroundImage: "radial-gradient(rgba(17, 17, 17, 0.16) 1.2px, transparent 1.5px)",
  backgroundSize: "11px 11px",
});
const SQ = "flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-white shadow-[2px_2px_0_#111]";
/** İnce bloğun bandındaki karolar */
const SQ_SM = "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-[#111] bg-white shadow-[1.5px_1.5px_0_#111]";

/**
 * Başlığın yanındaki kare karo — gün sayfasının Ekle karosunun dili: kendi
 * renginde zemin, siyah karede simge, altında kısa ad. Bloğun asıl işi
 * (Hedef koy, Not yaz…). Ekleme işleri yeşil.
 */
export function SummaryTile({
  color,
  icon: Icon,
  label,
  onClick,
  href,
  compact = false,
  dense = false,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  href?: string;
  /** İnce blok başı (Yapı'nın listeleri): yalnız simge, ad okuyucuya */
  compact?: boolean;
  /** Daha da ince baş (bkz. SummaryBlock dense): simge karosu küçük */
  dense?: boolean;
}) {
  // py: ad hücresi kısa kalınca (boş Alt kategoriler) üç satırlık ad ve simge
  // kenara, bloğun yuvarlak köşesine yapışıp kesiliyordu — satır gerekirse uzar
  if (compact) {
    const c = "flex h-full w-full items-center justify-center text-[#111] active:brightness-95";
    const mark = (
      <span
        className={cn("flex items-center justify-center bg-[#111]", dense ? "h-6 w-6 rounded-[7px]" : "h-8 w-8 rounded-[9px]")}
        style={{ color }}
      >
        <Icon className={dense ? "h-3 w-3" : "h-4 w-4"} strokeWidth={3} />
      </span>
    );
    if (!href && !onClick) {
      // Yalnız görünüş — dokunuşu dıştaki düğme alır (Analiz'in Grafik ekle menüsü)
      return (
        <span title={label} className={c} style={{ background: color }}>
          {mark}
        </span>
      );
    }
    return href ? (
      <Link href={href} aria-label={label} title={label} className={c} style={{ background: color }}>
        {mark}
      </Link>
    ) : (
      <button type="button" onClick={onClick} aria-label={label} title={label} className={c} style={{ background: color }}>
        {mark}
      </button>
    );
  }
  const cls = "flex h-full w-full flex-col items-center justify-center gap-1.5 px-1 py-2.5 text-[#111] active:brightness-95";
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111]" style={{ color }}>
        <Icon className="h-5 w-5" strokeWidth={3} />
      </span>
      <span className="text-center text-[12px] font-black leading-[1.05]">{label}</span>
    </>
  );
  if (!href && !onClick) {
    // Yalnız görünüş — dokunuşu dıştaki düğme alır (Analiz'in Grafik ekle menüsü)
    return (
      <span className={cls} style={{ background: color }}>
        {body}
      </span>
    );
  }
  return href ? (
    <Link href={href} className={cls} style={{ background: color }}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls} style={{ background: color }}>
      {body}
    </button>
  );
}

/**
 * Boş pencerenin gövdesi — pencere kapanıp yalnız başa inmesin: belli bir
 * boyda açık kalır, ortada kısa yazı ("Henüz alt kategori yok"), altında
 * ufak yeşil düğme. Boşken baştaki ekle karosu çizilmez; iş bu düğmede.
 */
export function SummaryEmpty({
  text,
  action,
}: {
  text: string;
  /** Varsayılanı yeşil + (oluştur/ekle); başka işte simgesi ve rengi verilir */
  action?: { label: string; onClick: () => void; icon?: LucideIcon; color?: string };
}) {
  const Icon = action?.icon ?? Plus;
  return (
    <div data-summary-empty="" className="flex min-h-[124px] flex-col items-center justify-center gap-3 bg-white px-4 py-5 text-center text-[#111]">
      <p className="text-[13px] font-bold leading-snug text-[#111]/55">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex h-8 max-w-full items-center gap-1.5 rounded-[9px] border-[1.5px] border-[#111] px-3 text-[12.5px] font-black shadow-[1.5px_1.5px_0_#111] active:translate-x-px active:translate-y-px active:shadow-none"
          style={{ background: action.color ?? "#7ae582" }}
        >
          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={3} />
          <span className="truncate">{action.label}</span>
        </button>
      )}
    </div>
  );
}

function CloseButton({ close }: { close: { label: string; onClick: () => void } }) {
  return (
    <button
      type="button"
      onClick={close.onClick}
      aria-label={close.label}
      className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-lg active:bg-[#111]/10"
    >
      <X className="h-4 w-4" strokeWidth={2.75} />
    </button>
  );
}

/** linked: hücre bir bağlantının içinde (liste) — ad h2, sağda ok.
 *  compact: ince baş (bkz. SummaryBlock compact) */
function Lead({
  lead,
  linked = false,
  compact = false,
  expanded,
  centered = false,
  dense = false,
}: {
  lead: SummaryLead;
  linked?: boolean;
  compact?: boolean;
  expanded?: boolean;
  centered?: boolean;
  dense?: boolean;
}) {
  if (compact && lead.kind !== "date")
    return <CompactLead lead={lead} linked={linked} expanded={expanded} centered={centered} dense={dense} />;
  if (lead.kind === "title") {
    return (
      <div className="relative flex h-full min-w-0 flex-col justify-center px-3.5 py-2.5 text-[#111]" style={{ background: lead.color }}>
        {lead.close && <CloseButton close={lead.close} />}
        <span
          className="self-start rounded-md bg-[#111] px-1.5 py-px text-[10px] font-black uppercase tracking-wider"
          style={{ color: lead.color }}
        >
          {lead.overline}
        </span>
        <span className="mt-1.5 text-[19px] font-black leading-tight tracking-tight">{lead.title}</span>
        {lead.hint && <span className="mt-0.5 line-clamp-2 text-[11.5px] font-bold leading-snug opacity-70">{lead.hint}</span>}
      </div>
    );
  }
  if (lead.kind === "count") {
    return (
      <div
        className="relative flex h-full min-w-0 flex-col justify-center px-3.5 py-2.5 text-[#111]"
        style={{ background: lead.color ?? "#ffd23f" }}
      >
        {lead.close && <CloseButton close={lead.close} />}
        <span
          className="self-start rounded-md bg-[#111] px-1.5 py-px text-[10px] font-black uppercase tracking-wider"
          style={{ color: lead.color ?? "#ffd23f" }}
        >
          {lead.overline}
        </span>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <b className="font-mono text-[30px] font-bold leading-none tabular-nums">{lead.value}</b>
          <span className="text-[16px] font-black leading-none">{lead.unit}</span>
        </div>
        {lead.hint && <span className="mt-1 line-clamp-2 text-[11.5px] font-bold leading-snug opacity-70">{lead.hint}</span>}
      </div>
    );
  }
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
  const Title = linked ? "h2" : "h1";
  return (
    <div className="flex h-full min-w-0 items-center gap-3 px-3 py-2.5 text-[#111]" style={{ background: lead.color }}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] border-2 border-[#111] bg-white">
        {lead.glyph ? (
          <lead.glyph className="h-[22px] w-[22px]" strokeWidth={2.5} />
        ) : (
          lead.icon && <SymbolIcon name={lead.icon} size={22} style={{ color: "#111" }} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {lead.overline && (
          <div className="truncate text-[10.5px] font-extrabold uppercase tracking-wider opacity-80">{lead.overline}</div>
        )}
        <Title className="line-clamp-2 break-words text-[22px] font-black leading-[1.05] tracking-tight">{lead.title}</Title>
        {lead.hint && <div className="mt-1 truncate text-[11.5px] font-bold leading-tight opacity-75">{lead.hint}</div>}
      </div>
      {linked && <ChevronRight className="-mr-1 h-5 w-5 shrink-0 opacity-70" strokeWidth={2.75} />}
    </div>
  );
}

/**
 * İnce baş — bütün türler aynı satırda: küçük simge karosu, tek satır ad,
 * altında soluk ikinci satır. Sayılı başta (Alt kategoriler, Son girdiler)
 * etiket ad olur, sayı alt satıra iner ("20 alt kategori · …"); kategori /
 * alt kategori özetinde üst yazı (üst kategori) alt satırda.
 */
function CompactLead({
  lead,
  linked,
  expanded,
  centered = false,
  dense = false,
}: {
  lead: Exclude<SummaryLead, { kind: "date" }>;
  linked: boolean;
  /** Verilirse baş açılır kapanır — ok aşağı, açıkken yukarı */
  expanded?: boolean;
  /** Ad ortada (Ekle › Girdi'nin kategori başları); ok simge kadar yer tutar */
  centered?: boolean;
  /** 36 px baş, küçük simge (Ekle › Girdi'nin kategori satırları) */
  dense?: boolean;
}) {
  const color = lead.kind === "count" ? lead.color ?? "#ffd23f" : lead.color;
  const title = lead.kind === "count" ? lead.overline : lead.title;
  const hint =
    lead.kind === "count"
      ? [lead.value === "0" ? "" : `${lead.value} ${lead.unit}`, lead.hint].filter(Boolean).join(" · ")
      : lead.kind === "thing"
        ? lead.hint ?? lead.overline
        : lead.hint;
  const icon = lead.kind === "thing" ? lead.icon : undefined;
  const Glyph = lead.glyph;
  const close = lead.kind === "thing" ? undefined : lead.close;
  // Kalemin adı sayfanın başlığı (özet); listede ve bölümlerde h2
  const Title = lead.kind === "thing" && !linked ? "h1" : "h2";
  return (
    <div
      className={cn(
        "relative flex h-full min-w-0 items-center text-[#111]",
        dense ? "min-h-[36px] gap-2 px-2 py-1" : "min-h-[50px] gap-2.5 px-3 py-2",
        close && "pr-9"
      )}
      style={{ background: color }}
    >
      {close && <CloseButton close={close} />}
      {(Glyph || icon) && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center border-[1.5px] border-[#111] bg-white",
            dense ? "h-6 w-6 rounded-[7px]" : "h-8 w-8 rounded-[9px]"
          )}
        >
          {Glyph ? (
            <Glyph className={dense ? "h-3 w-3" : "h-4 w-4"} strokeWidth={2.5} />
          ) : (
            <SymbolIcon name={icon} size={dense ? 13 : 17} style={{ color: "#111" }} />
          )}
        </span>
      )}
      <div className={cn("min-w-0 flex-1", centered && "text-center")}>
        <Title className={cn("truncate font-extrabold leading-tight tracking-tight", dense ? "text-[14px]" : "text-[16px]")}>{title}</Title>
        {hint && <div className="truncate text-[11px] font-bold leading-tight opacity-60">{hint}</div>}
      </div>
      {linked && (
        <span className={cn("flex shrink-0 justify-end", centered && (dense ? "w-6" : "w-8"))}>
          {expanded === undefined ? (
            <ChevronRight className="-mr-0.5 h-4 w-4 opacity-50" strokeWidth={2.75} />
          ) : (
            <ChevronDown
              className={cn("-mr-0.5 h-4 w-4 opacity-60 transition-transform", expanded && "rotate-180")}
              strokeWidth={2.75}
            />
          )}
        </span>
      )}
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
  leadHref,
  onLead,
  leadLabel,
  leadExpanded,
  leadCentered,
  dense = false,
  stats,
  action,
  link,
  children,
  className,
  compact = false,
}: {
  lead: SummaryLead;
  /** Verilirse ad hücresi bağlantı (Yapı → Kategoriler: kategorinin sayfası) */
  leadHref?: string;
  /** Verilirse ad hücresi düğme (Ekle › Girdi: kategorinin kendisine girdi) */
  onLead?: () => void;
  /** Düğme başın ekran okuyucu adı */
  leadLabel?: string;
  /** Verilirse düğme baş bloğu açıp kapatır (Ekle › Girdi'nin kategorileri) */
  leadExpanded?: boolean;
  /** İnce başta ad ortada */
  leadCentered?: boolean;
  /** compact'tan da ince blok (36 px baş, küçük köşe ve gölge) — eklenen karo da `dense` olmalı */
  dense?: boolean;
  /** Sayılar — genelde üç; boşsa satır yok */
  stats: SummaryStat[];
  /** Sayılarla alt satır arasındaki satır(lar) — zemini çağıranın (ana
   *  sayfada kategori kareleri, Yine ekle hücreleri) */
  children?: ReactNode;
  /** Ekle düğmesi (gün) — adın yanındaki kare hücreyi doldurur */
  action?: ReactNode;
  link?: SummaryLink;
  className?: string;
  /**
   * İnce baş — Yapı'nın listeleri (kategoriler, ölçü türleri, nesne
   * listeleri): küçük simge karosu, tek satır ad, altında soluk sayılar,
   * yanında dar ekle karosu (yalnız +). Tam boy baş (76 px, iri ad, adlı
   * karo) bir listede art arda gelince kaba duruyordu; ana sayfanın blokları
   * başlarındaki etiket, sayı ve açıklamayla doluyor, bunlarınki boştu
   */
  compact?: boolean;
}) {
  // Hücreler arası 2 px siyah: zemin siyah, hücreler arası boşluk 2 px.
  // grid-cols-1 (minmax(0, 1fr)): sütun kabın genişliğinde — yoksa tek
  // satıra sığmayan bir yazı (Analiz'de uzun grafik adı) sütunu kendi
  // boyuna uzatıyor, blok sağdan taşıp köşesi kesiliyordu
  return (
    <div
      data-summary=""
      className={cn(
        "grid grid-cols-1 gap-[2px] overflow-hidden border-2 border-[#111] bg-[#111]",
        dense ? "rounded-[13px] shadow-[3px_3px_0_#111]" : "rounded-[18px] shadow-[4px_4px_0_#111]",
        className
      )}
    >
      <div className="flex gap-[2px]">
        {leadHref ? (
          <Link href={leadHref} prefetch={false} className="block min-w-0 flex-1 active:brightness-95">
            <Lead lead={lead} linked compact={compact} />
          </Link>
        ) : onLead ? (
          <button
            type="button"
            onClick={onLead}
            aria-label={leadLabel}
            aria-expanded={leadExpanded}
            className="block min-w-0 flex-1 text-left active:brightness-95"
          >
            <Lead lead={lead} linked compact={compact} expanded={leadExpanded} centered={leadCentered} dense={dense} />
          </button>
        ) : (
          <div className="min-w-0 flex-1">
            <Lead lead={lead} compact={compact} />
          </div>
        )}
        {/* Satır boyunca uzar: ad iki satıra taşınca altında siyah boşluk kalmasın */}
        {action && (
          <div className={compact ? (dense ? "w-[40px] shrink-0" : "w-[52px] shrink-0") : "min-h-[76px] w-[76px] shrink-0"}>{action}</div>
        )}
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
      {children}
      {link && (
        <Link
          href={link.href}
          prefetch={false}
          className={cn(
            "flex min-w-0 flex-col text-[#111]",
            link.color ? "active:brightness-95" : "bg-white active:bg-[#f5f1e8]"
          )}
          style={link.color ? bandDots(link.color) : undefined}
        >
          {link.color ? (
            <span className={cn("flex items-center", compact ? "gap-2.5 px-3 py-2" : "gap-3 px-3 py-3")}>
              {link.icon && (
                <span className={compact ? SQ_SM : SQ}>
                  <link.icon className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.5} />
                </span>
              )}
              <span
                className={cn(
                  "min-w-0 truncate bg-[#111] font-black leading-none tracking-tight",
                  compact
                    ? "rounded-[8px] px-2.5 pb-[5px] pt-[3px] text-[15px] shadow-[2px_2px_0_rgba(17,17,17,0.25)]"
                    : "rounded-[10px] px-3 pb-1.5 pt-1 text-[19px] shadow-[3px_3px_0_rgba(17,17,17,0.25)]"
                )}
                style={{ color: link.color }}
              >
                {link.label}
              </span>
              {link.badge && (
                <span className="shrink-0 rounded-md bg-white px-1.5 py-px font-mono text-[11px] font-bold">{link.badge}</span>
              )}
              <span className={cn(compact ? SQ_SM : SQ, "ml-auto")}>
                <ArrowRight className={compact ? "h-4 w-4" : "h-5 w-5"} strokeWidth={2.75} />
              </span>
            </span>
          ) : (
          <span className="flex h-10 items-center gap-2 px-3">
            <span className="min-w-0 flex-1 truncate text-[12.5px] font-black uppercase tracking-wide">{link.label}</span>
            {link.badge && (
              <span className="shrink-0 rounded-md bg-[#111] px-1.5 py-px font-mono text-[11px] font-bold text-[#fff4dc]">
                {link.badge}
              </span>
            )}
            <ArrowRight className="h-4 w-4 shrink-0" strokeWidth={2.75} />
          </span>
          )}
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
