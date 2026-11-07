"use client";

import { createElement } from "react";
import { Check, NotebookPen, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { EntryValueWithType } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { parseDTR } from "@/components/forms/datetime-range-input";
import { splitChoiceLevel } from "@/lib/choice-level";
import { isScaleChoices } from "@/types";
import { thingLabel, useThingNames } from "@/lib/db/thing-names";
import { SymbolIcon } from "@/lib/icons";
import { EMOTION_LOOKS, EmotionFace, emotionLook, emotionName } from "@/lib/icons/emotions";

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
 *
 * Kabuk her türde aynı (Cap), İÇİ özelliğin türüne göre değişir:
 *  - sayı: simge, değer, birim, ad (en sade hali, para ve mesafe böyle)
 *  - skala: kapsülün kendisi gösterge, değer kadar dolar (LevelCapsule)
 *  - duygu: tam yuvarlak, başta duygunun yüzü (EmotionCapsule)
 *  - seçenek: başta dolu seçim düğmesi, sonra seçilen
 *  - evet/hayır: onay kutusu ve özelliğin adı
 *  - metin: tırnakla açılan konuşma balonu
 *  - saat aralığı: "09:00 → 17:30" ve süre
 * Eskiden hepsi sayının kalıbındaydı: seçenek, metin ve sayı ayırt
 * edilmiyordu, skala noktaları brütalde okunmuyordu.
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
  const t = useT();
  const et = v.entryType!;
  const label = v.mod?.name ?? et.name;
  const icon = createElement(modAtomIcon({ name: v.mod?.name, entryType: et }), {
    className: "h-3 w-3",
    style: { color: c },
    strokeWidth: 1.9,
  });

  switch (capKind(v)) {
    case "scale":
      return <LevelCapsule icon={icon} value={v.value} choices={et.choices!} color={c} label={label} />;

    case "emotion": {
      const { label: name, level } = splitChoiceLevel(v.value);
      return <EmotionCapsule name={name} level={level} />;
    }

    case "choice": {
      // Seçeneklerden biri seçildi: başta dolu bir seçim düğmesi (radyo)
      const { label: choice, level } = splitChoiceLevel(v.value);
      return (
        <Cap kind="choice" color={c} word>
          <span data-radio="" aria-hidden className="flex h-5 w-5 shrink-0 items-center justify-center">
            <span
              className="h-3 w-3 rounded-full"
              style={{
                boxShadow: `inset 0 0 0 1.5px ${c}`,
                background: `radial-gradient(circle, ${c} 0 2.5px, transparent 3px)`,
              }}
            />
          </span>
          <span className="min-w-0 truncate text-[13px] font-semibold leading-tight" style={{ color: c }}>
            {choice}
          </span>
          {level !== null && (
            <span data-plain="" className="shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground/70">
              %{level}
            </span>
          )}
          <span className="shrink-0 text-[10px] leading-none text-muted-foreground/60">{label}</span>
        </Cap>
      );
    }

    case "bool": {
      // Onay kutusu ve özelliğin adı: "☑ Esneme yapıldı". Hayır ise kutu
      // boş, ad üstü çizili. Eskiden "Yes / No" yazıyordu (dile de çevrilmeden)
      const yes = v.value === "true";
      return (
        <Cap kind="bool" color={c} word title={`${label}: ${t(yes ? "entry.yes" : "entry.no")}`}>
          <span
            data-check=""
            data-on={yes ? "" : undefined}
            aria-hidden
            className="flex h-5 w-5 shrink-0 items-center justify-center"
          >
            <span
              className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px]"
              style={yes ? { background: c } : { boxShadow: `inset 0 0 0 1.5px ${c}99` }}
            >
              {yes ? (
                <Check className="h-2.5 w-2.5" strokeWidth={3.5} style={{ color: "#fff" }} />
              ) : (
                <X className="h-2.5 w-2.5" strokeWidth={3} style={{ color: `${c}b3` }} />
              )}
            </span>
          </span>
          <span
            className={cn(
              "min-w-0 truncate text-[12.5px] font-semibold leading-tight",
              !yes && "line-through decoration-[1.5px] opacity-60"
            )}
            style={{ color: c }}
          >
            {label}
          </span>
        </Cap>
      );
    }

    case "text":
      // Serbest metin: tırnakla açılır, köşesi konuşma balonu gibi sivri
      return (
        <Cap kind="text" color={c} word className="rounded-bl-[5px]">
          <span
            data-quote=""
            aria-hidden
            className="flex h-5 w-3.5 shrink-0 justify-center pl-0.5 font-serif text-[19px] font-black leading-[23px]"
            style={{ color: c }}
          >
            “
          </span>
          <span className="min-w-0 truncate text-[12.5px] font-semibold leading-tight" style={{ color: c }}>
            {v.value}
          </span>
          <span className="shrink-0 text-[10px] leading-none text-muted-foreground/60">{label}</span>
        </Cap>
      );

    case "range": {
      // Saat aralığı: uyku kartındaki gibi "09:00 → 17:30" ve süre
      const { start, end } = parseDTR(v.value);
      const s = start?.split("T")[1]?.slice(0, 5);
      const e = end?.split("T")[1]?.slice(0, 5);
      const dur = durationText(start, end, t);
      return (
        <Cap kind="range" color={c}>
          <IconSlot color={c}>{icon}</IconSlot>
          <span className="text-[13px] font-semibold leading-none tabular-nums" style={{ color: c }}>
            {s ?? "?"}
            <span className="mx-0.5 font-normal text-muted-foreground">→</span>
            {e ?? "?"}
          </span>
          {dur && (
            <span data-plain="" className="shrink-0 text-[10px] leading-none text-muted-foreground/70">
              {dur}
            </span>
          )}
          <span className="shrink-0 text-[10px] leading-none text-muted-foreground/60">{label}</span>
        </Cap>
      );
    }

    default: {
      // Sayı — en sade hali: simge, değer, birim, özelliğin adı
      const { main, unit } = readValue(v, t);
      return (
        <Cap kind="number" color={c}>
          <IconSlot color={c}>{icon}</IconSlot>
          <span className="text-[13px] font-semibold leading-none tabular-nums" style={{ color: c }}>
            {main}
          </span>
          {unit && <span className="text-[10px] leading-none text-muted-foreground/70">{unit}</span>}
          <span className="text-[10px] leading-none text-muted-foreground/60">{label}</span>
        </Cap>
      );
    }
  }
}

/** Kapsülün türü — değerin ne olduğuna göre içi değişir (bkz. ValueCapsule) */
type CapKind = "number" | "scale" | "emotion" | "choice" | "bool" | "text" | "range";

function capKind(v: EntryValueWithType): CapKind {
  const et = v.entryType!;
  switch (et.valueType ?? "number") {
    case "select":
      if (isScaleChoices(et.choices) && et.choices!.includes(v.value)) return "scale";
      // Seçenek yerleşik duygulardan biriyse yüzüyle çizilir
      return splitChoiceLevel(v.value).label in EMOTION_LOOKS ? "emotion" : "choice";
    case "boolean":
      return "bool";
    case "text":
      return "text";
    case "datetime-range":
      return "range";
    default:
      return "number";
  }
}

/**
 * Kapsülün kabuğu — her türde AYNI: yuvarlak, kartın renginde tonlu zemin ve
 * ince halka; brütalde beyaz zemin, çerçeve, sert gölge (globals.css,
 * data-capsule). Türler yalnız içte ayrılır, kart tek aile gibi kalsın.
 * `word`: değer sözcük (seçenek, metin) — brütalde daktilo değil düz kalın.
 */
function Cap({
  kind,
  color: c,
  word,
  title,
  className,
  children,
}: {
  kind: CapKind;
  color: string;
  word?: boolean;
  title?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      data-capsule=""
      data-cap-kind={kind}
      data-word={word ? "" : undefined}
      title={title}
      className={cn(
        "relative inline-flex min-w-0 max-w-full shrink-0 items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2",
        className
      )}
      style={{
        ["--cap-c" as string]: c,
        background: `${c}14`,
        boxShadow: `inset 0 0 0 1px ${c}33`,
      }}
    >
      {children}
    </span>
  );
}

/** Sayı ve aralık kapsüllerinin başı — özelliğin simgesi yuvarlak yuvada */
function IconSlot({ color: c, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
      style={{ background: `${c}33` }}
    >
      {children}
    </span>
  );
}

/** "8 sa 30 dk" — uyku kartıyla aynı kısa biçim */
function durationText(
  start: string | undefined,
  end: string | undefined,
  t: ReturnType<typeof useT>
): string | null {
  if (!start || !end) return null;
  const diff = new Date(end).getTime() - new Date(start).getTime();
  if (diff <= 0) return null;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return h === 0 ? t("sleep.durM", { m }) : m === 0 ? t("sleep.durH", { h }) : t("sleep.durHM", { h, m });
}

/**
 * Skala kapsülü — "4/5" ve yanında değer kadar dolan küçük bir çubuk
 * (5'te 4 ise %80), sonra özelliğin adı. İki yönlü skalada (−3…+3) dolgu
 * ortadaki sıfırdan değere uzanır.
 *
 * Eskiden çubuk yerine nokta dizisi vardı ("4/5 ●●●●○"); brütalde dolu ve
 * boş noktalar neredeyse aynı görünüyordu, 10'luk skalada da kapsülü
 * uzatıyordu. Kapsülün tamamının dolması da denendi: dolgunun ucu
 * özelliğin adını ortasından kesiyordu. Uyku kalitesi ve mutluluk da bunu
 * kullanır (`label` yok, simge kendi: yıldız, yüz).
 */
export function LevelCapsule({
  icon,
  value,
  choices,
  color: c,
  label,
  title,
}: {
  icon: React.ReactNode;
  value: string;
  choices: string[];
  color: string;
  label?: string;
  title?: string;
}) {
  const n = choices.length;
  const idx = Math.max(0, choices.indexOf(value));
  const bipolar = Number(choices[0]) < 0 && Number(choices[n - 1]) > 0;
  const zero = Math.max(0, choices.indexOf("0"));
  const seg = 100 / n;
  const [from, width] = !bipolar
    ? [0, (idx + 1) * seg]
    : idx >= zero
      ? [(zero + 0.5) * seg, Math.max((idx - zero) * seg, 3)]
      : [(idx + 0.5) * seg, (zero - idx) * seg];
  const signed = bipolar && Number(value) > 0 ? `+${value}` : value.replace("-", "−");
  return (
    <Cap kind="scale" color={c} title={title ?? label}>
      <IconSlot color={c}>{icon}</IconSlot>
      <span data-scale-val="" className="text-[13px] font-semibold leading-none tabular-nums" style={{ color: c }}>
        {signed}
        {!bipolar && (
          <span className="text-[0.77em] font-medium text-muted-foreground/70">/{choices[n - 1]}</span>
        )}
      </span>
      <span
        data-track=""
        aria-hidden
        className="relative h-2 w-8 shrink-0 overflow-hidden rounded-full"
        style={{ background: `${c}33` }}
      >
        <span
          data-gauge=""
          className="absolute inset-y-0"
          style={{ left: `${from}%`, width: `${width}%`, background: c }}
        />
      </span>
      {label && <span className="text-[10px] leading-none text-muted-foreground/60">{label}</span>}
    </Cap>
  );
}

/**
 * Duygu kapsülü — tam yuvarlak, başında duygunun yüzü kendi renginde bir
 * daire içinde, yanında adı (ve kaydedildiyse yoğunluğu). Ruh hali kartı ve
 * duygu seçenekli özellikler bunu kullanır.
 */
export function EmotionCapsule({ name, level }: { name: string; level: number | null }) {
  const t = useT();
  const look = emotionLook(name);
  const shown = emotionName(name, t);
  return (
    <Cap kind="emotion" color={look.color} word title={level === null ? shown : `${shown} %${level}`}>
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{ background: `${look.color}40` }}
      >
        <EmotionFace name={name} size={14} style={{ color: look.color }} />
      </span>
      <span className="min-w-0 truncate text-[12.5px] font-semibold leading-tight" style={{ color: look.color }}>
        {shown}
      </span>
      {level !== null && (
        <span data-plain="" className="shrink-0 text-[10px] leading-none tabular-nums text-muted-foreground/70">
          %{level}
        </span>
      )}
    </Cap>
  );
}

/**
 * İliştirilen nesneler — her biri kendi kapsülünde, adı ve bu girdide onun
 * için yazılan değerlerle: "Dacia Duster · 45230 km · HANGİ ARABA".
 * Kategorinin değer kapsüllerinden ayrı satır: eylem ile ilgili olduğu şey
 * karışmasın.
 *
 * Kapsül değer kapsülüyle (ValueCapsule) aynı kalıpta: ad, değerler, en
 * sonda rol; brütalde aynı çerçeve ve sert gölge (data-capsule). Eskiden
 * kendi dili vardı (köşeli, tonlu, çerçevesiz kutu) ve çerçeveli değer
 * kapsüllerinin yanında soluk kalıyordu.
 *
 * Nesne olduğu baştan belli: değer kapsülünün renkli bölmesi yerine BAKLAVA
 * (şekil dili: kare kategori, daire özellik, baklava nesne; formdaki nesne
 * başlığı da baklava, bkz. thing-ui Diamond). Baklava listenin renginde ve
 * içinde listenin sembolü: Duster hangi kategorinin kartında olursa olsun
 * mavi baklavada araba. Listenin rengi yoksa kartın rengi, sembolü yoksa
 * boş baklava.
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
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-1" data-thing-capsules="">
      {thingIds.map((tid) => {
        const parts = values.filter((v) => v.thingId === tid && v.entryType).map((v) => readValue(v, t));
        // Nesnenin girdideki rolü — onu seçtiren özelliğin adı (HANGİ ARABA)
        const role = values.find(
          (v) => v.entryType?.valueType === "object" && v.value.split(",").includes(tid)
        );
        const look = names.looks.get(tid);
        const dc = look?.color || c;
        return (
          <span
            key={tid}
            data-capsule=""
            data-word=""
            data-thing-capsule=""
            className="inline-flex min-w-0 max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2"
            style={{
              ["--cap-c" as string]: c,
              ["--dia-c" as string]: dc,
              background: `${c}14`,
              boxShadow: `inset 0 0 0 1px ${c}33`,
            }}
          >
            <span data-thing-slot="" className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              <span
                data-thing-dia=""
                className="absolute h-[14px] w-[14px] rotate-45 rounded-[3px]"
                style={{ background: `${dc}40`, boxShadow: `inset 0 0 0 1px ${dc}99` }}
              />
              {look?.icon && (
                <SymbolIcon name={look.icon} size={10} className="relative" style={{ color: dc }} />
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
export function readValue(
  v: EntryValueWithType,
  t: ReturnType<typeof useT>
): {
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
    return { main: s && e ? `${s}–${e}` : (s ?? e ?? "—"), unit: durationText(start, end, t) ?? undefined, label };
  }
  if (vt === "boolean") return { main: t(v.value === "true" ? "entry.yes" : "entry.no"), label };
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
