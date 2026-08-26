"use client";

import { createElement } from "react";
import { NotebookPen } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EntryValueWithType } from "@/types";
import { cn } from "@/lib/utils";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Girdi kartlarının ortak parçaları — hem tek girdi kartı hem paralel girdi
 * kartı bunları kullanır. Daha önce rozet iki kartta kopyalanmıştı ve aynı
 * listede iki ayrı dil gibi okunuyordu; tek kaynakta duruyorlar.
 */

/**
 * Not kapsülü — değer kapsülleriyle aynı aile: kategori renginde zemin ve ince
 * halka, başında not simgesi. Tam satırı kaplar; uzun not sarar, o yüzden
 * yuvarlaklık tam daire değil (çok satırda daire kenar tuhaf duruyor).
 */
export function NoteCapsule({ text, color: c }: { text: string; color: string }) {
  return (
    <span
      className="flex w-full items-start gap-1.5 rounded-2xl px-2.5 py-1.5"
      style={{
        background: `${c}14`,
        boxShadow: `inset 0 0 0 1px ${c}2b`,
      }}
    >
      <NotebookPen
        className="mt-[1px] h-3.5 w-3.5 shrink-0"
        style={{ color: `${c}b3` }}
        strokeWidth={1.9}
      />
      <span className="min-w-0 text-xs leading-relaxed text-muted-foreground">
        {text}
      </span>
    </span>
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
      className: "h-3.5 w-3.5",
      style: { color: c },
      strokeWidth: 1.9,
    }
  );
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3"
      style={{
        background: `${c}14`,
        boxShadow: `inset 0 0 0 1px ${c}33`,
      }}
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${c}33` }}
      >
        {icon}
      </span>
      <span
        className="text-[15px] font-semibold leading-none tabular-nums"
        style={{ color: c }}
      >
        {main}
      </span>
      {unit && (
        <span className="text-[11px] leading-none text-muted-foreground/70">
          {unit}
        </span>
      )}
      <span className="text-[11px] leading-none text-muted-foreground/60">
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
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors active:scale-95",
        destructive
          ? "text-muted-foreground/50 hover:bg-destructive/15 hover:text-destructive"
          : "text-muted-foreground/50 hover:bg-white/10 hover:text-foreground"
      )}
    >
      <Icon className="h-[15px] w-[15px]" />
    </button>
  );
}
