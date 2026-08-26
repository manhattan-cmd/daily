"use client";

import { createElement, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext, EntryValueWithType } from "@/types";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteEntry } from "@/lib/db/queries";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { modAtomIcon } from "@/components/structure/mod-atom";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Gün/ana sayfa girdi kartı — uyku kartıyla aynı dil: kategori renginde degrade
 * zemin, karta dokununca düzenleme açılır. İç içe buton olmaması için kart
 * div[role=button] (içteki gerçek butonlar kabarcıklanmayı durdurur).
 * `selection` verilirse basılı tutmak toplu seçimi başlatır.
 *
 * Yerleşim ilk tasarımın gövdesi (git etiketleri tasarim-1-asil /
 * tasarim-2-pencere), üç düzeltmeyle: sembol düşeyde ortalı, girdinin adı
 * kategorinin ÜSTÜNDE (ilk tasarımda tersiydi; ağırlıkları aynı kaldı, yalnız
 * yerleri değişti) ve tarih + düzenle/sil sağda tek bölümde toplu.
 *
 * Değerler ve not künyenin dışında, tam genişlikte duruyor; metin sütununun
 * hizasına girintili. Künyenin içinde kalınca sağdaki bölüm sütunu ~60px
 * daraltıp kapsülleri alt alta düşürüyordu.
 *
 * Değerler kapsül: kategori renginde zemin, başında özelliğin simgesi. Girdinin
 * taşıdığı asıl veri onlar, gri kutu yerine kendi nesneleri var.
 *
 * Sil/düzenle her zaman görünür. İlk tasarımda silme yalnız
 * düzenleme penceresinin menüsündeydi çünkü kartın köşesindeki ikon sadece
 * hover'da görünüyordu: dokunmatikte görünmez ama basılabilirdi. Şimdi ikisi de
 * görünür ve silme onay ister, ardından kabuktaki geri-al çubuğu çıkar.
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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          borderColor: `${color}28`,
          background: `linear-gradient(135deg, ${color}1f, ${color}08 45%, transparent)`,
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        {/* Künye — sembol düşeyde ortalı, sağda tarih + eylemler tek bölüm */}
        <div className="flex items-center gap-2.5">
          <EntryIcon category={entry.category} subcategory={entry.subcategory} />

          <div className="min-w-0 flex-1">
            {/* Girdinin adı üstte: vurgulanan o. Kategori altında sönük bağlam
                satırı — ikisinin yeri ilk tasarımdakinin tersi, ağırlıkları
                aynı kaldı. */}
            <div className="break-words text-sm font-semibold leading-snug">
              {title}
            </div>
            {!isRoot && (
              <div
                className="mt-0.5 truncate text-[10px] font-semibold uppercase leading-none tracking-[0.14em]"
                style={{ color: `${color}cc` }}
              >
                {entry.category.name}
              </div>
            )}
          </div>

          {/* Tarih + eylemler tek bölüm, sağda. Kart tıklaması düzenleme
              açtığından butonlar kabarcıklanmayı durdurur. */}
          <div className="-mr-1 flex shrink-0 flex-col items-end gap-0.5">
            <div className="px-1 text-right leading-tight">
              <span className="block whitespace-nowrap text-[10px] text-muted-foreground/50">
                {formatDate(entry.occurredAt)}
              </span>
              <span className="block whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground/80">
                {formatTime(entry.occurredAt)}
              </span>
            </div>
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

        {/* Değerler ve not künyenin altında, tam genişlikte; metin sütununun
            hizasına girinti. Künyenin içinde kalınca sağdaki bölüm sütunu
            daraltıp kapsülleri alt alta düşürüyordu. */}
        {typedValues.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[46px]">
            {typedValues.map((v) => (
              <ValueCapsule key={v.id} v={v} color={color} />
            ))}
          </div>
        )}

        {entry.notes && (
          <p className="mt-1.5 pl-[46px] text-xs text-muted-foreground">
            {entry.notes}
          </p>
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
 * Özellik kapsülü — girdideki her özellik kendi nesnesi.
 *
 * Renk kategoriden geliyor: kart tek renkte kalsın, kapsüller kartın parçası
 * gibi dursun. Özelliğin kendi rengi (lib/mod-color) de denendi — her kapsül
 * ayrı renk olunca kart alacalanıyordu. Ayrımı simge yapıyor: cüzdan = Money,
 * kronometre = Duration (modAtomIcon, yapı ekranlarıyla aynı set).
 */
function ValueCapsule({
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
function readValue(v: EntryValueWithType): {
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
          ? "text-muted-foreground/50 hover:bg-destructive/15 hover:text-destructive"
          : "text-muted-foreground/50 hover:bg-white/10 hover:text-foreground"
      )}
    >
      <Icon className="h-[15px] w-[15px]" />
    </button>
  );
}
