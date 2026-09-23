"use client";

import {
  Book,
  BookOpen,
  Boxes,
  CheckCircle2,
  Clock,
  Droplet,
  Dumbbell,
  Flame,
  Footprints,
  Gauge,
  Heart,
  Layers,
  MapPin,
  MoonStar,
  Plus,
  Repeat,
  Route,
  Scale,
  Smile,
  Star,
  Stethoscope,
  Thermometer,
  Timer,
  TrendingUp,
  Users,
  Utensils,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import { F, type StarterFeature } from "@/lib/db/starter";
import type { ModWithType } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

/**
 * Tohumla gelen özelliklerin simgeleri.
 *
 * Eşleme ADA bakıyor (özelliğin kalıcı bir anahtarı yok), o yüzden tablo
 * havuzun kendi tanımından üretiliyor: her özelliğin İNGİLİZCE ve TÜRKÇE adı
 * aynı simgeye bağlanır. Elle yazılan bir ad listesi tutulsaydı, tohum
 * Türkçe kurulduğunda hiçbiri eşleşmez ve havuzdaki 22 atomun tamamı aynı
 * "#" ile çizilirdi.
 *
 * Kullanıcı adı değiştirirse simge ölçü türünün simgesine düşer — bilinçli:
 * ad artık bizim tanıdığımız şey değildir.
 */
const SEED_ICONS: [StarterFeature, LucideIcon][] = [
  [F.money, Wallet],
  [F.duration, Timer],
  [F.distance, Route],
  [F.steps, Footprints],
  [F.quantity, Boxes],
  [F.glasses, Droplet],
  [F.pages, BookOpen],
  [F.calories, Flame],
  [F.bodyWeight, Scale],
  [F.liftedWeight, Dumbbell],
  [F.sets, Layers],
  [F.reps, Repeat],
  [F.exertion, Gauge],
  [F.productivity, TrendingUp],
  [F.severity, Thermometer],
  [F.done, CheckCircle2],
  [F.meal, Utensils],
  [F.workHours, Clock],
  [F.book, Book],
  [F.withWhom, Users],
  [F.symptom, Stethoscope],
  [F.place, MapPin],
];

const BUILT_IN_MOD_ICONS: Record<string, LucideIcon> = {
  // Yerleşik akışların atomları — adları kanonik İngilizce
  "Sleep Duration": MoonStar,
  "Sleep Quality": Star,
  Happiness: Smile,
  Emotions: Heart,
  // Eski (v19 öncesi) ad devrinden kalanlar
  Weight: Scale,
  ...Object.fromEntries(
    SEED_ICONS.flatMap(([f, icon]) =>
      typeof f.name === "string"
        ? [[f.name, icon]]
        : [
            [f.name.en, icon],
            [f.name.tr, icon],
          ]
    )
  ),
};

/** Özelliğin atom simgesi: yerleşikse özel simgesi, değilse ölçü türünün simgesi.
 * Bağlanmış özelliklerde (CategoryModifierWithType) ad boş olabilir. */
export function modAtomIcon(mod: {
  name?: string;
  entryType: ModWithType["entryType"];
}): LucideIcon {
  // Tanınmayan ölçü türünde sayıya düşülüyor: veri göçlerinden gelen eski
  // bir tür bütün paneli çökertmemeli (ekleme yüzeyi her atomu buradan çiziyor)
  const kind = MEASURE_KIND_META[mod.entryType.valueType ?? "number"];
  return BUILT_IN_MOD_ICONS[mod.name ?? ""] ?? kind?.icon ?? MEASURE_KIND_META.number.icon;
}

/** "#818cf8" → "129,140,248" — renk tonunu saydamlıkla karıştırabilmek için */
function rgbOf(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return "129,140,248";
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Varsayılan ton — rengi olmayan atomlarda (ve eski çağrı yerlerinde) */
const DEFAULT_ATOM_COLOR = "#818cf8";

/**
 * Atom çekirdeği — dairesel, hafif ışıltılı disk.
 *
 * `color` verilirse disk ve simge o tonda çizilir. Özelliğin rengi zaten
 * girdi formunda kullanılıyordu ([[lib/mod-color]]); havuzda hepsini aynı
 * morla göstermek aynı özelliği iki ekranda iki ayrı şey gibi gösteriyordu.
 */
export function ModAtomCore({
  icon: Icon,
  size = "md",
  color = DEFAULT_ATOM_COLOR,
}: {
  icon: LucideIcon;
  size?: "sm" | "md" | "lg";
  color?: string;
}) {
  const rgb = rgbOf(color);
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "lg" ? "h-16 w-16" : size === "sm" ? "h-9 w-9" : "h-12 w-12"
      )}
      style={{
        background: `radial-gradient(circle at 32% 28%, rgba(${rgb},0.34), rgba(${rgb},0.08) 72%)`,
        boxShadow: `inset 0 0 0 1px rgba(${rgb},0.26), 0 0 14px rgba(${rgb},0.10)`,
      }}
    >
      <Icon
        className={cn(
          size === "lg" ? "h-7 w-7" : size === "sm" ? "h-4 w-4" : "h-5 w-5"
        )}
        style={{ color }}
        strokeWidth={1.75}
      />
    </span>
  );
}

/** Özellik atomu — dairesel çekirdek + altta ad; sık 4 sütunlu ızgarada dizilir */
export function ModAtom({
  icon,
  name,
  color,
  onClick,
  disabled,
}: {
  icon: LucideIcon;
  name: string;
  color?: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-[var(--sf-2)] active:scale-[0.92] disabled:opacity-50"
    >
      <ModAtomCore icon={icon} color={color} />
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight">
        {name}
      </span>
    </button>
  );
}

/** Izgara sonuna eklenen "yeni yarat" atomu — kesikli boş çekirdek */
export function ModAtomAdd({
  label = "Yeni yarat",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center gap-1.5 rounded-2xl px-1 py-2 transition-all hover:bg-[var(--sf-2)] active:scale-[0.92]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-dashed border-primary/35 text-primary/60 transition-colors group-hover:border-primary/60 group-hover:text-primary">
        <Plus className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <span className="w-full truncate text-center text-[11px] font-medium leading-tight text-muted-foreground group-hover:text-foreground">
        {label}
      </span>
    </button>
  );
}
