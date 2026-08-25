"use client";

import { useState } from "react";
import { CornerDownRight, Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext, EntryType } from "@/types";
import { SymbolIcon } from "@/lib/icons";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteEntry } from "@/lib/db/queries";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { QuickModAdd } from "@/components/forms/quick-mod-add";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Gün/ana sayfa girdi kartı — uyku kartıyla aynı dil: kategori renginde degrade
 * zemin, karta dokununca düzenleme açılır.
 * İç içe buton olmaması için kart div[role=button] (içteki gerçek butonlar
 * kabarcıklanmayı durdurur). `selection` verilirse basılı tutmak toplu seçimi
 * başlatır.
 *
 * Kart pencerelere bölünür: üstte başlık (sembol + kategori + altında girdinin
 * indiği alt kategori) ve onun sağında tarih/eylem bölümü; altta değerler ve
 * not. Pencereler kartın renkli zemini üstünde koyu birer oyuk — kenarlık
 * yerine hafif iç halka, böylece ayrım çizgi çekmeden okunuyor. Sembol kare:
 * pencere kare olunca içindeki daire kutu içinde kutu gibi duruyordu.
 *
 * Hiçbir metin kesilmiyor. Ad, kategori ve saat tek satırı paylaşırken uzun
 * adlar "…" ile bitiyordu; tarih ve düğmeler kendi bölümüne çıkınca başlığa
 * tam genişlik kaldı ve metin kesilmek yerine satır atlıyor.
 *
 * Başlık kategoriyi söyler, altındaki rozet kaydın indiği alt kategoriyi.
 * Alt kategori düz yazı değil rozet: dal işareti + kendi sembolü + kategori
 * renginde zemin, böylece adın devamı değil ağaçtaki yeri olduğu okunuyor.
 *
 * Sil/düzenle KARTTA duruyor. Eskiden köşedeki ikon yalnız hover'da
 * görünüyordu — dokunmatikte görünmez ama basılabilir olduğundan kazara silme
 * riskiydi ve silme modalın menüsüne taşınmıştı. Şimdi ikisi de her zaman
 * görünür, silme ayrıca onay ister; iki sorun da kalkıyor.
 */
export function EntryCard({
  entry,
  selection,
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
}) {
  const t = useT();
  const [editOpen, setEditOpen] = useState(false);
  const color = entry.category.color;
  const isRoot = !!entry.subcategory.isCategoryRoot;
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const title = isRoot ? entry.category.name : entry.subcategory.name;

  // Ölçümü olan her değer çizilir. Eskiden entryTypeId de şarttı; v18'den
  // sonra yeni değerler onu taşımadığı için hepsi görünmez olmuştu.
  const typedValues = entry.values.filter((v) => !!v.entryType);

  // Pencere yüzeyi: kartın renkli zemininde koyu oyuk + kategori renginde
  // ince iç halka. Kenarlık kullanılmıyor — üst üste binen çizgiler kartı
  // ızgaraya çeviriyordu.
  const paneStyle = {
    background: "rgba(0,0,0,0.24)",
    boxShadow: `inset 0 0 0 1px ${color}1f`,
  };

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("confirm.deleteEntry", { name: title }),
      body: `${t("confirm.deleteEntryBody")} ${t("confirm.undoHint")}`,
      destructive: true,
    });
    if (ok) await deleteEntry(entry.id);
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setEditOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") setEditOpen(true);
        }}
        {...(selection && !selection.active ? longPress : {})}
        className={cn(
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border p-1.5 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          borderColor: `${color}2e`,
          background: `linear-gradient(135deg, ${color}26, ${color}0a 50%, transparent)`,
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        {/* ── Üst sıra: başlık bölümü + tarih/eylem bölümü ── */}
        <div className="flex items-stretch gap-1.5">
          {/* Başlık: sembol + kategori adı + altında alt kategori rozeti.
              Sembol kategoriye ait (subcategory verilmiyor) — alt kategorinin
              kendi sembolü rozette duruyor, ikisi aynı anda görünsün diye. */}
          <div
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-2"
            style={paneStyle}
          >
            <div className="h-12 w-12 shrink-0">
              <EntryIcon
                category={entry.category}
                size="fill"
                shape="square"
              />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold leading-snug break-words">
                {entry.category.name}
              </div>
              {!isRoot && (
                <SubCategoryTag
                  name={entry.subcategory.name}
                  icon={entry.subcategory.icon}
                  color={color}
                />
              )}
            </div>
          </div>

          {/* Tarih + eylemler — kendi bölümünde, sağ üstte */}
          <div
            className="flex shrink-0 flex-col items-end justify-between gap-1 rounded-xl px-1.5 py-1.5"
            style={paneStyle}
          >
            <div className="px-1 pt-0.5 text-right leading-tight">
              <div className="whitespace-nowrap text-[10px] text-muted-foreground/60">
                {formatDate(entry.occurredAt)}
              </div>
              <div className="whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground/85">
                {formatTime(entry.occurredAt)}
              </div>
            </div>
            {/* Kart tıklaması düzenleme açtığından iç butonlar durdurur */}
            <div className="flex items-center gap-0.5">
              <CardAction
                icon={Pencil}
                label={t("action.edit")}
                onClick={() => setEditOpen(true)}
              />
              <CardAction
                icon={Trash2}
                label={t("action.delete")}
                destructive
                onClick={handleDelete}
              />
            </div>
          </div>
        </div>

        {/* ── Pencere 2: değerler ── */}
        <div className="mt-1.5 rounded-xl px-2 py-1.5" style={paneStyle}>
          <div className="flex flex-wrap items-center gap-1.5">
            {typedValues.map((v) => (
              <ValueChip
                key={v.id}
                value={v.value}
                label={v.mod?.name ?? v.entryType!.name}
                entryType={v.entryType!}
              />
            ))}
            <span
              className="flex"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <QuickModAdd
                subcategoryId={entry.subcategoryId}
                subcategoryName={entry.subcategory.name}
                categoryId={entry.category.id}
                entryId={entry.id}
                occurredAt={entry.occurredAt}
              />
            </span>
          </div>
        </div>

        {/* ── Pencere 3: not ── */}
        {entry.notes && (
          <div className="mt-1.5 rounded-xl px-2.5 py-2" style={paneStyle}>
            <p className="text-xs leading-snug text-muted-foreground">
              {entry.notes}
            </p>
          </div>
        )}

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={`${entry.subcategory.name} girdisini seç`}
          />
        )}
      </div>

      <EditEntryModal
        entry={entry}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
    </>
  );
}

/**
 * Girdinin indiği alt kategori — düz yazı değil rozet. Dal işareti onu adın
 * devamı olmaktan çıkarıp ağaçtaki yer olarak okutuyor; kendi sembolü varsa
 * yanında duruyor. Uzun adlar kesilmez, satır atlar.
 *
 * Punto başlıkla aynı: ikisi de kartın adı, biri ötekinin alt yazısı değil.
 * Ayrımı büyüklük değil biçim yapıyor — başlık düz beyaz, bu kategori
 * renginde çerçeveli rozet.
 */
function SubCategoryTag({
  name,
  icon,
  color,
}: {
  name: string;
  icon?: string;
  color: string;
}) {
  return (
    <span
      className="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-lg py-1 pl-1.5 pr-2 text-sm font-semibold leading-snug"
      style={{
        background: `${color}1f`,
        boxShadow: `inset 0 0 0 1px ${color}33`,
        color: `${color}e6`,
      }}
    >
      <CornerDownRight className="h-4 w-4 shrink-0 opacity-60" />
      {icon && <SymbolIcon name={icon} size={15} className="shrink-0" />}
      <span className="break-words">{name}</span>
    </span>
  );
}

/** Eylem düğmesi — her zaman görünür, dokunmatikte de bulunur */
function CardAction({
  icon: Icon,
  label,
  destructive,
  onClick,
}: {
  icon: typeof Pencil;
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
          ? "text-muted-foreground/60 hover:bg-destructive/15 hover:text-destructive"
          : "text-muted-foreground/60 hover:bg-white/10 hover:text-foreground"
      )}
    >
      <Icon className="h-[15px] w-[15px]" />
    </button>
  );
}

function ValueChip({
  value,
  label,
  entryType,
}: {
  value: string;
  label: string;
  entryType: EntryType;
}) {
  const vt = entryType.valueType ?? "number";

  if (vt === "datetime-range") {
    const { start, end } = parseDTR(value);
    const startTime = start?.split("T")[1]?.slice(0, 5);
    const endTime = end?.split("T")[1]?.slice(0, 5);
    const duration = calcDTRDuration(start, end);
    const shortDuration = duration
      ? duration
          .replace(" saat", "s")
          .replace(" dakika", "dk")
          .replace("s dk", "s")
      : null;

    return (
      <div className="flex items-center gap-1.5 rounded-md bg-muted/80 px-1.5 py-0.5">
        {startTime && (
          <span className="text-[13px] font-semibold tabular-nums">{startTime}</span>
        )}
        {startTime && endTime && (
          <span className="text-xs text-muted-foreground">→</span>
        )}
        {endTime && (
          <span className="text-[13px] font-semibold tabular-nums">{endTime}</span>
        )}
        {shortDuration && (
          <span className="text-xs text-muted-foreground ml-0.5">
            · {shortDuration}
          </span>
        )}
        {!startTime && !endTime && (
          <span className="text-xs text-muted-foreground">{label}</span>
        )}
      </div>
    );
  }

  let display = value;
  if (vt === "boolean") display = value === "true" ? "Yes" : "No";

  return (
    <div className="flex items-baseline gap-1 rounded-md bg-muted/80 px-1.5 py-0.5">
      <span className="text-[13px] font-semibold tabular-nums">{display}</span>
      {vt === "number" && entryType.unit && (
        <span className="text-xs text-muted-foreground">{entryType.unit}</span>
      )}
      <span className="ml-0.5 text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
