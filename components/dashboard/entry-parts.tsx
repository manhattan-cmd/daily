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
 * Değer hücreleri (Brütal) — ana sayfanın blok dili girdi kartında: kapsül
 * dizisi yerine ortak ince çizgilerle ayrılmış hücreler, Bugün bloğunun
 * sayıları gibi. Her hücrede özelliğin simgesi ve adı küçük, altında değer
 * (sayıysa eş aralıklı) ve birimi; ölçek değeri kaçta kaç olduğunu
 * noktalarla gösterir. En çok üç sütun; dört değer 2 × 2; son satırda
 * boş kalan yer son hücreye katılır (siyah boşluk görünmesin). Fazlası
 * "+n" hücresiyle özetlenir (bkz. MAX_CAPSULES).
 *
 * Satırın kendi zemini yok: hücreler beyaz, aralarındaki 1.5 px kartın siyah
 * zemininden (bkz. BrutEntryCard).
 */
export function ValueCells({ values, color }: { values: EntryValueWithType[]; color: string }) {
  values = values.filter((v) => !v.thingId && v.entryType?.valueType !== "object");
  const shown = values.slice(0, MAX_CAPSULES);
  const rest = values.length - shown.length;
  const n = shown.length + (rest > 0 ? 1 : 0);
  if (!n) return null;
  const cols = n <= 3 ? n : n === 4 ? 2 : 3;
  const left = n % cols;
  // Son hücre satırın kalanını kaplar
  const lastSpan = left ? cols - left + 1 : 1;
  return (
    <div data-value-cells="" className="grid gap-[1.5px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {shown.map((v, i) => (
        <ValueCell
          key={v.id}
          v={v}
          color={color}
          span={rest === 0 && i === shown.length - 1 ? lastSpan : 1}
        />
      ))}
      {rest > 0 && (
        <span
          className="flex items-center justify-center bg-white px-2 py-1 font-mono text-[12px] font-bold text-[#111]/60"
          style={lastSpan > 1 ? { gridColumn: `span ${lastSpan}` } : undefined}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

function ValueCell({ v, color: c, span }: { v: EntryValueWithType; color: string; span: number }) {
  useThingNames();
  const { main, unit, label } = readValue(v);
  const scale =
    v.entryType?.valueType === "select" &&
    isScaleChoices(v.entryType.choices) &&
    v.entryType.choices!.includes(v.value)
      ? v.entryType.choices!
      : null;
  const icon = createElement(modAtomIcon({ name: v.mod?.name, entryType: v.entryType! }), {
    className: "h-2.5 w-2.5 shrink-0",
    strokeWidth: 2.5,
  });
  // Sayılar eş aralıklı (Bugün'ün sayıları gibi), seçenek adları düz yazı
  const numeric = /^[\d.,:–\-\s]+$/.test(main);
  return (
    <span
      data-value-cell=""
      className="flex min-w-0 flex-col justify-center bg-white px-2 pb-1 pt-[5px] text-[#111]"
      style={span > 1 ? { gridColumn: `span ${span}` } : undefined}
    >
      <span className="flex min-w-0 items-center gap-1 text-[8.5px] font-black uppercase leading-none tracking-wide text-[#111]/55">
        <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] text-[#111]" style={{ background: c }}>
          {icon}
        </span>
        <span className="truncate">{label}</span>
      </span>
      <span className="mt-[3px] flex min-w-0 items-baseline gap-1 leading-none">
        {scale ? (
          <ScaleMeter value={v.value} choices={scale} color={c} />
        ) : (
          <b className={cn("truncate font-bold tabular-nums", numeric ? "font-mono text-[14.5px]" : "text-[13px] font-black")}>
            {main}
          </b>
        )}
        {!scale && unit && <span className="shrink-0 text-[10px] font-bold opacity-60">{unit}</span>}
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
  return (
    <span
      data-capsule=""
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
 * İliştirilen nesneler — her biri kendi kapsülünde, adı ve bu girdide onun
 * için yazılan değerlerle: "Dacia Duster · 45.230 km". Kategorinin değer
 * kapsüllerinden ayrı satır: eylem ile ilgili olduğu şey karışmasın.
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
        const parts = values
          .filter((v) => v.thingId === tid && v.entryType)
          .map((v) => {
            const r = readValue(v);
            return [r.main, r.unit].filter(Boolean).join(" ");
          });
        // Nesnenin girdideki rolü — onu seçtiren özelliğin adı (ARABALARIM)
        const role = values.find(
          (v) => v.entryType?.valueType === "object" && v.value.split(",").includes(tid)
        );
        return (
          <span
            key={tid}
            data-thing-capsule=""
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg py-0.5 pl-1 pr-2 text-[12.5px] font-bold leading-5"
            style={{ background: `${c}1f`, boxShadow: `inset 0 0 0 1.5px ${c}66` }}
          >
            <span className="h-2.5 w-2.5 shrink-0 rotate-45 rounded-[2px]" style={{ background: c }} />
            <span className="truncate">{names.names.get(tid) ?? "?"}</span>
            {parts.length > 0 && (
              <span className="truncate font-semibold opacity-70">{parts.join(" · ")}</span>
            )}
            {role && (
              <span className="shrink-0 text-[10px] font-bold uppercase leading-none opacity-55">
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
