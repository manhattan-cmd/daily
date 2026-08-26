"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext, EntryValueWithType } from "@/types";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteEntry } from "@/lib/db/queries";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";

/**
 * Gün/ana sayfa girdi kartı — tek gövde. Karta dokununca düzenleme açılır;
 * iç içe buton olmaması için kart div[role=button] (içteki gerçek butonlar
 * kabarcıklanmayı durdurur). `selection` verilirse basılı tutmak toplu seçimi
 * başlatır.
 *
 * İçeride kutu YOK. Bölümleri saç teli çizgi ve boşluk ayırır: iç pencereler
 * denendi (bkz. git etiketi tasarim-2-pencere) ve kartı bölük pörçük gösterdi.
 * Sıra: künye → değerler → not.
 *
 * Alt kategori kartın adı, kategori onun altında sönük bağlam satırı — girdi
 * hangi yaprağa düştüyse öne çıkan o; üst kategori arka rolde.
 *
 * Değerler rozet değil, istatistik bloğu: sayı büyük ve kategori renginde,
 * özelliğin adı altında küçük. Girdinin taşıdığı asıl veri onlar, kutuya
 * sıkıştırmak yerine kendi hizalarında duruyorlar.
 *
 * "Özellik ekle" karttan kalktı — gereksiz bulundu. Yeteneğin kendisi
 * duruyor: düzenleme penceresindeki "Bu girdiye özellik ekle".
 *
 * Sil/düzenle sağ üst köşede, her zaman görünür. Eskiden köşedeki ikon yalnız
 * hover'da görünüyordu: dokunmatikte görünmez ama basılabilirdi. Silme onay
 * ister, ardından kabuktaki geri-al çubuğu çıkar.
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

  // Ölçümü olan her değer çizilir. Eskiden entryTypeId de şarttı; v18'den
  // sonra yeni değerler onu taşımadığı için hepsi görünmez olmuştu.
  const values = entry.values.filter((v) => !!v.entryType);

  // Kök girdinin alt kategorisi yok; o zaman kategori adı öne geçer ve
  // bağlam satırı boş kalır (aynı adı iki kez yazmanın anlamı yok).
  const heading = isRoot ? entry.category.name : entry.subcategory.name;
  const context = isRoot ? null : entry.category.name;

  async function handleDelete() {
    const ok = await confirmDialog({
      title: t("confirm.deleteEntry", { name: heading }),
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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-3 py-3 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          borderColor: `${color}2e`,
          background: `linear-gradient(135deg, ${color}24, ${color}0a 50%, transparent)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.05), 0 1px 2px rgba(0,0,0,0.28)",
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        {/* ── Künye: sembol + ad/bağlam + köşede tarih ve eylemler ── */}
        <div className="flex items-start gap-2.5">
          <div className="h-10 w-10 shrink-0">
            <EntryIcon
              category={entry.category}
              subcategory={entry.subcategory}
              size="fill"
              shape="square"
            />
          </div>

          <div className="min-w-0 flex-1 pt-0.5">
            <div className="text-[15px] font-semibold leading-tight break-words">
              {heading}
            </div>
            {context && (
              <div className="mt-0.5 break-words text-[11px] leading-tight text-muted-foreground/55">
                {context}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1 pl-2">
            <div className="text-right leading-tight">
              <div className="whitespace-nowrap text-[10px] text-muted-foreground/50">
                {formatDate(entry.occurredAt)}
              </div>
              <div className="whitespace-nowrap text-[11px] font-medium tabular-nums text-muted-foreground/80">
                {formatTime(entry.occurredAt)}
              </div>
            </div>
            {/* Kart tıklaması düzenleme açtığından iç butonlar durdurur */}
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

        {/* ── Değerler ── */}
        {values.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-t border-white/[0.06] pt-2.5">
            {values.map((v) => (
              <ValueStat key={v.id} v={v} color={color} />
            ))}
          </div>
        )}

        {/* ── Not ── */}
        {entry.notes && (
          <p className="mt-2.5 border-t border-white/[0.06] pt-2.5 text-xs leading-relaxed text-muted-foreground/85">
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
 * Değer bloğu — sayı üstte büyük ve kategori renginde, özelliğin adı altta
 * küçük.
 *
 * Ad BÜYÜK HARFE çevrilmiyor: css'in `uppercase`i sayfanın diline göre
 * çalışıyor, Türkçe kipte "Duration" → "DURATİON" oluyordu.
 */
function ValueStat({ v, color }: { v: EntryValueWithType; color: string }) {
  const { main, unit, label } = readValue(v);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline gap-1 leading-none">
        <span
          className="text-[17px] font-semibold tabular-nums"
          style={{ color }}
        >
          {main}
        </span>
        {unit && (
          <span className="text-[11px] text-muted-foreground/70">{unit}</span>
        )}
      </div>
      <div className="mt-1 truncate text-[10px] tracking-[0.06em] text-muted-foreground/50">
        {label}
      </div>
    </div>
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
