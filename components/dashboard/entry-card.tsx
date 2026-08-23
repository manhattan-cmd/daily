"use client";

import { useState } from "react";
import type { EntryWithContext } from "@/types";
import { cn, formatDateTime, formatTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { ValueChip } from "@/components/dashboard/value-chip";
import { QuickModAdd } from "@/components/forms/quick-mod-add";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

/**
 * Gün/ana sayfa girdi kartı — uyku kartıyla aynı dil: kategori renginde degrade
 * zemin, karta dokununca düzenleme açılır. Silme kartta değil, düzenleme
 * modalının menüsünde: köşedeki ikon yalnız hover'da göründüğünden dokunmatikte
 * görünmez ama basılabilir durumdaydı (kazara silme).
 * İç içe buton olmaması için kart div[role=button] (QuickModAdd gerçek buton).
 * `selection` verilirse basılı tutmak toplu seçimi başlatır.
 *
 * Yerleşim: sembol düşeyde ortalı (aktivite kartıyla aynı), saat sağ kenara
 * yaslı ve tabular — liste boyunca saatler tek sütunda hizalanır, kategori adı
 * uzayınca kaymaz.
 */
export function EntryCard({
  entry,
  selection,
  showDate = true,
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
  /** Gün sayfasında hepsi aynı güne ait — "Today" satır satır tekrarlamasın */
  showDate?: boolean;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const color = entry.category.color;
  const isRoot = !!entry.subcategory.isCategoryRoot;
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });

  // Ölçümü olan her değer çizilir. Eskiden entryTypeId de şarttı; v18'den
  // sonra yeni değerler onu taşımadığı için hepsi görünmez olmuştu.
  const typedValues = entry.values.filter((v) => !!v.entryType);

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
        <div className="flex items-center gap-2.5">
          <EntryIcon category={entry.category} subcategory={entry.subcategory} />
          <div className="flex-1 min-w-0">
            {/* Üst satır: kategori etiketi (kök girdide gizli) + saat sağda */}
            <div className="flex items-baseline gap-2 text-[10px] leading-none">
              {!isRoot && (
                <span
                  className="font-semibold uppercase tracking-[0.14em] truncate"
                  style={{ color: `${color}cc` }}
                >
                  {entry.category.name}
                </span>
              )}
              <span className="ml-auto shrink-0 tabular-nums text-muted-foreground/70">
                {showDate
                  ? formatDateTime(entry.occurredAt)
                  : formatTime(entry.occurredAt)}
              </span>
            </div>
            <div className="mt-1 text-sm font-semibold truncate">
              {isRoot ? entry.category.name : entry.subcategory.name}
            </div>

            {/* Değer chipleri + hızlı mod ekle — karta tıklama düzenleme
                açtığından iç etkileşimler kabarcıklanmadan durdurulur */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {typedValues.map((v) => (
                <ValueChip
                  key={v.id}
                  value={v.value}
                  label={v.mod?.name ?? v.entryType!.name}
                  entryType={v.entryType!}
                  color={color}
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
                  compact={typedValues.length > 0}
                />
              </span>
            </div>

            {entry.notes && (
              <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-muted-foreground/80">
                {entry.notes}
              </p>
            )}
          </div>
        </div>

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
