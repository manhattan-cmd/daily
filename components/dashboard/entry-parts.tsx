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
import { isScaleChoices } from "@/types";
import { ScaleMeter } from "@/components/ui/scale-meter";
import { thingLabel, useThingNames } from "@/lib/db/thing-names";
import { SymbolIcon } from "@/lib/icons";

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
 *
 * Zemin bağlamdan geliyor: kartın kategorisinin rengi ince bir tabaka
 * halinde, altında da temanın "oyuk" tonu. Eskiden sabit siyah bir oyuktu —
 * koyu temada doğru, açık temada beyaz kartın ortasında kara bir leke.
 */
export function NoteCapsule({ text, color: c }: { text: string; color: string }) {
  return (
    <div
      data-note-capsule=""
      className="flex w-full items-start gap-1.5 rounded-xl px-2 py-1.5"
      style={{
        background: `linear-gradient(0deg, ${c}1c, ${c}1c), var(--note-ground)`,
        boxShadow: `inset 0 0 0 1px ${c}3d`,
      }}
    >
      <NotebookPen
        className="mt-[2px] h-3 w-3 shrink-0"
        style={{ color: c }}
        strokeWidth={1.9}
      />
      <p className="line-clamp-3 min-w-0 text-[11px] leading-snug text-foreground/75">
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
  // Nesneye ait değerler ve nesne seçimi (Hangi araba) kartta nesnenin
  // kapsülünde (ThingCapsuleRow) — aynı nesne iki kez görünmesin
  values = values.filter((v) => !v.thingId && v.entryType?.valueType !== "object");
  const shown = values.slice(0, MAX_CAPSULES);
  const rest = values.length - shown.length;
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((v) => (
        <ValueCapsule key={v.id} v={v} color={color} />
      ))}
      {rest > 0 && (
        <span
          data-more=""
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
  // Nesne adları yüklenince / değişince kapsül yeniden çizilsin
  useThingNames();
  const { main, unit, label } = readValue(v);
  // Ölçek değeri: yalnız sayı değil, kaçta kaç olduğu (bkz. ScaleMeter)
  const scale =
    v.entryType?.valueType === "select" &&
    isScaleChoices(v.entryType.choices) &&
    v.entryType.choices!.includes(v.value)
      ? v.entryType.choices!
      : null;
  const icon = createElement(
    modAtomIcon({ name: v.mod?.name, entryType: v.entryType! }),
    {
      className: "h-3 w-3",
      style: { color: c },
      strokeWidth: 1.9,
    }
  );
  // Sözcük değerler (seçenek, metin, evet/hayır) Brütalde düz kalın yazı;
  // sayılar daktilo harfiyle
  const vt = v.entryType?.valueType ?? "number";
  const isWord = !scale && vt !== "number" && vt !== "datetime-range";
  return (
    <span
      data-capsule=""
      data-word={isWord ? "" : undefined}
      className="inline-flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
      style={{
        ["--cap-c" as string]: c,
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
      {scale ? (
        <ScaleMeter value={v.value} choices={scale} color={c} />
      ) : (
        <span
          className="text-[13px] font-semibold leading-none tabular-nums"
          style={{ color: c }}
        >
          {main}
        </span>
      )}
      {!scale && unit && (
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

/**
 * Seviye kapsülü — uyku kalitesi, mutluluk: başında simge, içinde "4/5" ve
 * noktalar (ScaleMeter). Eskiden kartın sağında kapsülsüz, boşlukta yüzen
 * bir "4/5 ●●●●○" duruyordu; öteki değerler kapsüldeyken o kopuk kalıyordu.
 */
export function LevelCapsule({
  icon,
  value,
  choices,
  color: c,
  title,
}: {
  icon: React.ReactNode;
  value: string;
  choices: string[];
  color: string;
  title?: string;
}) {
  return (
    <span
      data-capsule=""
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
      style={{
        ["--cap-c" as string]: c,
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
      <ScaleMeter value={value} choices={choices} color={c} />
    </span>
  );
}

/**
 * İliştirilen nesneler — her biri kendi kapsülünde, adı ve bu girdide onun
 * için yazılan değerlerle: "Dacia Duster · 45230 km · HANGİ ARABA".
 * Kategorinin değer kapsüllerinden ayrı satır: eylem ile ilgili olduğu şey
 * karışmasın.
 *
 * Kapsül değer kapsülüyle (ValueCapsule) AYNI kalıpta: başta kartın renginde
 * simge bölmesi, sonra ad, değerler, en sonda rol. Brütalde de aynı kurallar
 * (data-capsule) uygulanır: çerçeve, sert gölge, renkli bölme. Eskiden kendi
 * dili vardı (köşeli, tonlu, çerçevesiz kutu, baklava nokta) ve çerçeveli
 * değer kapsüllerinin yanında soluk kalıyordu. Bölmedeki simge nesnenin
 * listesinin sembolü (araba, kitap); listenin sembolü yoksa nesnenin şekli
 * baklava.
 */
export function ThingCapsuleRow({
  thingIds,
  values,
  color: c,
}: {
  thingIds: string[];
  values: EntryValueWithType[];
  color: string;
}) {
  const names = useThingNames();
  return (
    <div className="flex flex-wrap items-center gap-1" data-thing-capsules="">
      {thingIds.map((tid) => {
        const parts = values.filter((v) => v.thingId === tid && v.entryType).map(readValue);
        // Nesnenin girdideki rolü — onu seçtiren özelliğin adı (HANGİ ARABA)
        const role = values.find(
          (v) => v.entryType?.valueType === "object" && v.value.split(",").includes(tid)
        );
        const icon = names.icons.get(tid);
        return (
          <span
            key={tid}
            data-capsule=""
            data-word=""
            data-thing-capsule=""
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
            style={{
              ["--cap-c" as string]: c,
              background: `${c}14`,
              boxShadow: `inset 0 0 0 1px ${c}33`,
            }}
          >
            <span
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
              style={{ background: `${c}33` }}
            >
              {icon ? (
                <SymbolIcon name={icon} size={12} style={{ color: c }} />
              ) : (
                <span data-thing-mark="" className="h-2 w-2 rotate-45 rounded-[1.5px]" style={{ background: c }} />
              )}
            </span>
            <span className="min-w-0 truncate text-[13px] font-semibold leading-tight" style={{ color: c }}>
              {names.names.get(tid) ?? "?"}
            </span>
            {/* Değerler: sayı ve birim ayrı — değer kapsülündeki gibi birim
                küçük ve düz yazı ("45230 km"), aralarına " · " */}
            {parts.length > 0 && (
              <span
                data-thing-vals=""
                className="shrink-0 text-[11px] font-semibold leading-none tabular-nums text-foreground/70"
              >
                {parts.map((p, i) => (
                  <span key={i}>
                    {i > 0 && <span className="opacity-60"> · </span>}
                    {p.main}
                    {p.unit && (
                      <span data-thing-unit="" className="ml-0.5 text-[10px] font-normal text-muted-foreground/80">
                        {p.unit}
                      </span>
                    )}
                  </span>
                ))}
              </span>
            )}
            {role && (
              <span className="shrink-0 text-[10px] leading-none text-muted-foreground/60">
                {role.mod?.name ?? role.entryType?.name}
              </span>
            )}
          </span>
        );
      })}
    </div>
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
  if (vt === "object") return { main: thingLabel(v.value), label };
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
          : "text-muted-foreground/50 hover:bg-[var(--sf-3)] hover:text-foreground"
      )}
    >
      <Icon className="h-[14px] w-[14px]" />
    </button>
  );
}
