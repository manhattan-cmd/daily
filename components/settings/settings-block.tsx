"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Check, ChevronRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { fillStyle } from "@/lib/fill";

/**
 * Ayar bloğu (Brütal) — ana sayfanın ve Yapı listelerinin blok dili (bkz.
 * SummaryBlock compact): tek çerçeve, hücreler arası ortak 2 px çizgi. Başta
 * ayarın renginde ince baş: beyaz karoda simge, ad, altında açıklama ya da
 * durum (iki satıra sarar — SummaryBlock'un ince başı tek satırda kesiyordu,
 * ayar açıklamaları ondan uzun). Yanında isteğe bağlı karo (Sesler'in
 * anahtarı), altında beyaz hücreler (seçenekler, düğmeler).
 *
 * `href` ya da `onClick` verilirse baş dokunulur olur, sağında ›.
 *
 * Eskiden her ayar çerçeveli bir karttı, üstünde büyük harfli bölüm adı;
 * kartların içi sade temaların yapısıydı, brütal görünümü globals.css'teki
 * [data-settings] kurallarıyla sonradan giydiriliyordu.
 */
export function SettingsBlock({
  color,
  icon: Icon,
  title,
  hint,
  action,
  href,
  onClick,
  children,
}: {
  color: string;
  icon: LucideIcon;
  title: string;
  hint?: ReactNode;
  /** Başın yanındaki karo — kendi zeminini çizer */
  action?: ReactNode;
  href?: string;
  onClick?: () => void;
  children?: ReactNode;
}) {
  const head = (
    <div className="flex min-h-[54px] items-center gap-2.5 px-3 py-2 text-ink" style={fillStyle(color)}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-line bg-paper">
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[16px] font-extrabold leading-tight tracking-tight">{title}</h2>
        {hint && <p className="mt-px text-[11.5px] font-bold leading-snug opacity-60">{hint}</p>}
      </div>
      {(href || onClick) && <ChevronRight className="-mr-0.5 h-4 w-4 shrink-0 opacity-50" strokeWidth={2.75} />}
    </div>
  );
  return (
    <section
      data-settings-block=""
      className="mb-4 grid grid-cols-1 gap-[2px] overflow-hidden rounded-[18px] border-2 border-line bg-line shadow-[4px_4px_0_var(--shade)]"
    >
      <div className="flex gap-[2px]">
        <div className="min-w-0 flex-1">
          {href ? (
            <Link href={href} prefetch={false} className="block active:brightness-95">
              {head}
            </Link>
          ) : onClick ? (
            <button type="button" onClick={onClick} className="block w-full text-left active:brightness-95">
              {head}
            </button>
          ) : (
            head
          )}
        </div>
        {action && <div className="flex w-[60px] shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

/** Beyaz hücre — bloğun gövdesi */
export function SettingsCell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("bg-paper px-3 py-2.5 text-ink", className)}>{children}</div>;
}

/**
 * Seçenek hücreleri — her seçenek ayrı beyaz hücre, seçili olan bloğun
 * renginde, köşesinde siyah yuvarlakta ✓ (Yine ekle karolarının dizilişi).
 * Tek sayıda seçenekte sonuncusu iki sütuna yayılır (boş hücre siyah
 * görünmesin).
 */
export function SettingsChoices<T extends string>({
  options,
  value,
  onPick,
  color,
  render,
  top = false,
}: {
  options: readonly T[];
  value: T;
  onPick: (v: T) => void;
  color: string;
  render: (v: T) => ReactNode;
  /** İçerik hücrenin üstünde (Tema karoları: tarifi iki satır olan komşusu
   *  uzayınca renk örnekleri aynı hizada kalsın) */
  top?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-[2px]">
      {options.map((o, i) => {
        const on = o === value;
        const wide = options.length % 2 === 1 && i === options.length - 1;
        return (
          <button
            key={o}
            type="button"
            onClick={() => onPick(o)}
            aria-pressed={on}
            className={cn(
              "relative flex min-h-[46px] min-w-0 px-3 py-2.5 text-left text-ink",
              top ? "items-start" : "items-center",
              !on && "bg-paper active:bg-paper-2",
              wide && "col-span-2"
            )}
            style={on ? fillStyle(color) : undefined}
          >
            <span className="min-w-0 flex-1 pr-5">{render(o)}</span>
            {on && (
              <span className="absolute right-2.5 top-1/2 flex h-[18px] w-[18px] -translate-y-1/2 items-center justify-center rounded-full bg-well text-white">
                <Check className="h-3 w-3" strokeWidth={3.5} />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Hücre içi küçük düğme — çerçeveli kapsül, basınca gölgesi iner */
export const settingsPill =
  "inline-flex h-8 items-center gap-1 rounded-full border-[1.5px] border-line bg-paper px-3 text-[12.5px] font-black text-ink shadow-[1.5px_1.5px_0_var(--shade)] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50";

/** Hücre içi asıl düğme — iri, köşeli; zemin rengini çağıran verir */
export const settingsButton =
  "inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border-2 border-line px-3.5 text-[13.5px] font-black text-ink shadow-[2px_2px_0_var(--shade)] active:translate-x-px active:translate-y-px active:shadow-none disabled:opacity-50";

/** Aç/kapa anahtarı — Sesler bloğunun başındaki karoda */
export function SettingsSwitch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="flex flex-1 items-center justify-center bg-paper active:bg-paper-2"
    >
      <span className={cn("relative h-6 w-10 rounded-full border-2 border-line transition-colors", on ? "bg-fill-[#7ae582]" : "bg-fill-[#e7e1d4]")}>
        <span
          className={cn(
            "absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-line bg-paper transition-all",
            on ? "right-0.5" : "left-0.5"
          )}
        />
      </span>
    </button>
  );
}
