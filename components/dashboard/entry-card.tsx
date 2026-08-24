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
 * Yerleşim iki satır: ad + (kategori · saat), altında rozetler. Sembol düşeyde
 * ortalı (aktivite kartıyla aynı), saat sağ kenarda ve tabular — liste boyunca
 * saatler tek sütunda hizalanır.
 *
 * Kategori adı kendi satırını harcamıyor, saatin soluna geçti: satır maliyeti
 * sıfır ama renkli kaş kalıyor. Adsız denendi ve "çok düz" bulundu — kimliği
 * yalnız zemin rengine bırakmak kartları tek kalıba düşürüyor.
 *
 * Kabartı üç parçadan geliyor: sol renk şeridi, güçlendirilmiş degrade, üstte
 * iç ışık + altta gölge. Sembol de 36px'te kalıyor; 28px'e inince satırın
 * görsel çıpası kayboluyordu.
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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border py-2 pl-4 pr-3 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          borderColor: `${color}28`,
          background: `linear-gradient(135deg, ${color}30, ${color}0d 55%, transparent)`,
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.06), 0 1px 2px rgba(0,0,0,0.3)",
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        {/* Sol renk şeridi — kartın kategorisini kenardan okutur */}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 w-[3px]"
          style={{ background: `linear-gradient(180deg, ${color}, ${color}66)` }}
        />

        <div className="flex items-center gap-2.5">
          <EntryIcon category={entry.category} subcategory={entry.subcategory} />
          <div className="flex-1 min-w-0">
            {/* Üst satır: ad solda; kategori ve saat sağ kenarda */}
            {/* Sağ blok satırın en çok yarısını alabilir ve içinde önce
                kategori adı kısalır: aksi halde uzun bir kategori adı ("Kişisel
                Gelişim ve Öğrenme") girdinin kendi adını tümüyle siliyordu.
                Saat hiç kısalmaz — listenin hizasını o tutuyor. */}
            <div className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                {isRoot ? entry.category.name : entry.subcategory.name}
              </span>
              <span className="flex max-w-[50%] shrink items-baseline gap-1.5 overflow-hidden">
                {!isRoot && (
                  <>
                    <span
                      className="truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
                      style={{ color: `${color}cc` }}
                    >
                      {entry.category.name}
                    </span>
                    <span className="text-muted-foreground/30">·</span>
                  </>
                )}
                <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                  {showDate
                    ? formatDateTime(entry.occurredAt)
                    : formatTime(entry.occurredAt)}
                </span>
              </span>
            </div>

            {/* Değer chipleri + hızlı mod ekle — karta tıklama düzenleme
                açtığından iç etkileşimler kabarcıklanmadan durdurulur */}
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {typedValues.map((v) => (
                <ValueChip
                  key={v.id}
                  value={v.value}
                  label={v.mod?.name ?? v.entryType!.name}
                  entryType={v.entryType!}
                  color={color}
                  dense
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
              <p className="mt-1 line-clamp-1 text-xs leading-snug text-muted-foreground/80">
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
