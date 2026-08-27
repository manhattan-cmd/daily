"use client";

import { createElement } from "react";
import { NotebookPen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EntryValueWithType } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";
import { splitChoiceLevel } from "@/lib/choice-level";

/**
 * Girdi kartlarının ortak parçaları — hem tek girdi kartı hem paralel girdi
 * kartı bunları kullanır. Daha önce rozet iki kartta kopyalanmıştı ve aynı
 * listede iki ayrı dil gibi okunuyordu; tek kaynakta duruyorlar.
 */

/**
 * Kartta gösterilecek en fazla özellik sayısı. Aşanlar "+n daha" ile
 * özetlenir; hepsi girdiye girilince görünür. Dört, telefonda iki satır
 * demek — kısıtlama var ama kart hâlâ ne taşıdığını söylüyor.
 */
const MAX_CAPSULES = 4;

/**
 * Not penceresi — değer kapsülleriyle AYNI aile değil, bilerek. Kapsül
 * biçimindeyken not da bir ölçüm gibi okunuyordu; oysa o serbest metin.
 * Bu yüzden kendi penceresi var: kartın renkli zemininde koyu oyuk + ince
 * halka, kapsüllerin altında ayrı bir blok.
 *
 * Üç satırda kırpılır; tamamı girdiye girilince görünür.
 */
export function NoteCapsule({ text, color: c }: { text: string; color: string }) {
  return (
    <div
      className="flex w-full items-start gap-1.5 rounded-xl px-2 py-1.5"
      style={{
        background: "rgba(0,0,0,0.26)",
        boxShadow: `inset 0 0 0 1px ${c}24`,
      }}
    >
      <NotebookPen
        className="mt-[2px] h-3 w-3 shrink-0"
        style={{ color: `${c}99` }}
        strokeWidth={1.9}
      />
      <p className="line-clamp-3 min-w-0 text-[11px] leading-snug text-muted-foreground">
        {text}
      </p>
    </div>
  );
}

/**
 * Değer kapsülü satırı — kartta en fazla MAX_CAPSULES tanesi çizilir, kalanı
 * sayı olarak özetlenir. Sınır olmadan çok özellikli girdiler kartı üç dört
 * satır uzatıyordu.
 */
export function ValueCapsuleRow({
  values,
  color,
  className,
}: {
  values: EntryValueWithType[];
  color: string;
  className?: string;
}) {
  const t = useT();
  const shown = values.slice(0, MAX_CAPSULES);
  const rest = values.length - shown.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((v) => (
        <ValueCapsule key={v.id} v={v} color={color} />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium leading-none"
          style={{
            color: `${color}cc`,
            boxShadow: `inset 0 0 0 1px ${color}2b`,
          }}
        >
          {t("entry.moreValues", { n: rest })}
        </span>
      )}
    </div>
  );
}

/**
 * Özellik kapsülü — girdideki her özellik kendi nesnesi.
 *
 * Renk kategoriden geliyor: kart tek renkte kalsın, kapsüller kartın parçası
 * gibi dursun. Özelliğin kendi rengi (lib/mod-color) de denendi — her kapsül
 * ayrı renk olunca kart alacalanıyordu. Ayrımı simge yapıyor: cüzdan = Money,
 * kronometre = Duration (modAtomIcon, yapı ekranlarıyla aynı set).
 */
export function ValueCapsule({
  v,
  color: c,
}: {
  v: EntryValueWithType;
  color: string;
}) {
  const { main, unit, label } = readValue(v);
  const icon = createElement(
    modAtomIcon({ name: v.mod?.name, entryType: v.entryType! }),
    {
      className: "h-3 w-3",
      style: { color: c },
      strokeWidth: 1.9,
    }
  );
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
      style={{
        background: `${c}14`,
        boxShadow: `inset 0 0 0 1px ${c}33`,
      }}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${c}33` }}
      >
        {icon}
      </span>
      <span
        className="text-[13px] font-semibold leading-none tabular-nums"
        style={{ color: c }}
      >
        {main}
      </span>
      {unit && (
        <span className="text-[10px] leading-none text-muted-foreground/70">
          {unit}
        </span>
      )}
      <span className="text-[10px] leading-none text-muted-foreground/60">
        {label}
      </span>
    </span>
  );
}

/** Değerin okunur parçaları — sayı, birim, özelliğin adı */
export function readValue(v: EntryValueWithType): {
  main: string;
  unit?: string;
  label: string;
} {
  const et = v.entryType!;
  const vt = et.valueType ?? "number";
  const label = v.mod?.name ?? et.name;

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(v.value);
    const s = start?.split("T")[1]?.slice(0, 5);
    const e = end?.split("T")[1]?.slice(0, 5);
    const dur = calcDTRDuration(start, end);
    const short = dur
      ? dur.replace(" saat", "s").replace(" dakika", "dk").replace("s dk", "s")
      : undefined;
    return { main: s && e ? `${s}–${e}` : (s ?? e ?? "—"), unit: short, label };
  }
  if (vt === "boolean") return { main: v.value === "true" ? "Yes" : "No", label };
  if (vt === "select") {
    // Seçenek yoğunluk taşıyabilir ("Happy|70"): etiket ana metin, yoğunluk
    // birim yerinde küçük kalır
    const { label: choice, level } = splitChoiceLevel(v.value);
    return { main: choice, unit: level === null ? undefined : `%${level}`, label };
  }
  return {
    main: v.value,
    unit: vt === "number" ? et.unit || undefined : undefined,
    label,
  };
}

/** Eylem düğmesi — her zaman görünür, dokunmatikte de bulunur */
export function CardAction({
  icon: Icon,
  label,
  destructive,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-95",
        destructive
          ? "text-muted-foreground/50 hover:bg-destructive/15 hover:text-destructive"
          : "text-muted-foreground/50 hover:bg-white/10 hover:text-foreground"
      )}
    >
      <Icon className="h-[14px] w-[14px]" />
    </button>
  );
}
