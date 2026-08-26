"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { EntryWithContext } from "@/types";
import { cn, formatDate, formatTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { deleteEntry } from "@/lib/db/queries";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import {
  CardAction,
  NoteCapsule,
  ValueCapsule,
} from "@/components/dashboard/entry-parts";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";

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
 * Kart iki bölüm: üstte künye, altında saç teli çizgiyle ayrılmış değerler ve
 * not. Alt bölüm tam genişlik kullanır — künyenin içinde kalınca sağdaki
 * tarih/eylem bölümü sütunu ~60px daraltıp kapsülleri alt alta düşürüyordu.
 * Not da kapsül, değerlerle aynı aile.
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

        {/* Alt bölüm — künyeden saç teli çizgiyle ayrılır ve tam genişlik
            kullanır. Girinti kaldırıldı: kendi alanı olunca künyenin metin
            sütununa hizalanmasının anlamı yok, kapsüller de daha çok yer
            buluyor. Kutu değil çizgi: iç pencereler kartı bölük pörçük
            gösteriyordu (git etiketi tasarim-2-pencere). */}
        {(typedValues.length > 0 || entry.notes) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-white/[0.07] pt-2.5">
            {typedValues.map((v) => (
              <ValueCapsule key={v.id} v={v} color={color} />
            ))}
            {entry.notes && <NoteCapsule text={entry.notes} color={color} />}
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
