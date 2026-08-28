"use client";

import { useState } from "react";
import type { EntryWithContext } from "@/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import {
  NoteCapsule,
  ValueCapsuleRow,
} from "@/components/dashboard/entry-parts";
import {
  SelectionLayer,
  selectedCardClass,
  type EntrySelection,
} from "@/components/calendar/entry-selection";
import { SleepCard } from "@/components/calendar/sleep-card";
import { MoodCard } from "@/components/calendar/mood-card";

/**
 * Girdi kartı — yerleşik akışların kendi biçimi vardır. Uyku ve ruh hali düz
 * girdi gibi çizilince (künye + kapsül dizisi) formunu kaybediyordu: gün
 * sayfası bunları ayrı yuvalara ayırdığı için doğru görünüyor, ana sayfa gibi
 * düz listeler ayırmıyordu. Ayrım kartın kendisinde yapılınca girdi nerede
 * listelenirse listelensin aynı yüzle çıkar.
 */
export function EntryCard({
  entry,
  selection,
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
}) {
  // Anahtarı doldurulmamış tek yerleşik = eski kurulumdaki Uyku
  const builtInKey = entry.category.isBuiltIn
    ? entry.category.builtInKey ?? "sleep"
    : undefined;
  // Yerleşik kartlar gün sayfası için yazıldı, orada tarih zaten belli.
  // Düz listede günler karışık olduğundan tarihi kendimiz veriyoruz.
  if (builtInKey === "sleep")
    return (
      <SleepCard
        entry={entry}
        selection={selection}
        dateLabel={formatDate(entry.occurredAt)}
      />
    );
  if (builtInKey === "mood")
    return (
      <MoodCard
        entry={entry}
        selection={selection}
        dateLabel={formatDate(entry.occurredAt)}
      />
    );
  return <PlainEntryCard entry={entry} selection={selection} />;
}

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
 * Kartta en fazla dört özellik ve üç satır not gösterilir; kalanı "+n daha"
 * ile özetlenir ve girdiye girilince tamamı görünür. Not kapsül değil, kendi
 * penceresi — kapsül biçimindeyken bir ölçüm gibi okunuyordu.
 *
 * Değerler kapsül: kategori renginde zemin, başında özelliğin simgesi. Girdinin
 * taşıdığı asıl veri onlar, gri kutu yerine kendi nesneleri var.
 *
 * Kartta düzenle/sil düğmesi YOK, sağ üstte yalnız tarih var. İkisi de bir
 * dönem kartta duruyordu; ikisi de gereksiz çıktı: karta dokunmak zaten
 * düzenleme penceresini açıyor ve silme o pencerenin menüsünde duruyor. İki
 * küçük ikon hem künyenin sağını daraltıyor hem de yanlışlıkla silmeye açık
 * bir hedef bırakıyordu.
 */
function PlainEntryCard({
  entry,
  selection,
}: {
  entry: EntryWithContext;
  selection?: EntrySelection;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const color = entry.category.color;
  const isRoot = !!entry.subcategory.isCategoryRoot;
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const title = isRoot ? entry.category.name : entry.subcategory.name;

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
          "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border px-2.5 py-2 text-left transition-transform active:scale-[0.99]",
          selection?.selected && selectedCardClass
        )}
        style={{
          // Kenarlık %16'dan %35'e: liste halinde kartlar birbirine giriyordu.
          // Asıl sorun zeminde: degrade "transparent"a inince kartın alt-sağı
          // sayfayla aynı renk oluyor, kart bitmiyordu. Degradenin ALTINA
          // kartın kendi zemini kondu — renk tonu duruyor, sınır belli.
          borderColor: `${color}59`,
          background: `linear-gradient(135deg, ${color}24, ${color}0d 45%, transparent), var(--card)`,
        }}
        aria-label={`${entry.subcategory.name} girdisini düzenle`}
      >
        {/* Künye — sembol düşeyde ortalı, sağda tarih + eylemler tek bölüm */}
        <div className="flex items-center gap-2">
          <EntryIcon category={entry.category} subcategory={entry.subcategory} />

          <div className="min-w-0 flex-1">
            {/* Girdinin adı üstte: vurgulanan o. Kategori altında sönük bağlam
                satırı — ikisinin yeri ilk tasarımdakinin tersi, ağırlıkları
                aynı kaldı. */}
            <div className="break-words text-[13px] font-semibold leading-snug">
              {title}
            </div>
            {!isRoot && (
              <div
                className="mt-0.5 truncate text-[9px] font-semibold uppercase leading-none tracking-[0.12em]"
                style={{ color: `${color}cc` }}
              >
                {entry.category.name}
              </div>
            )}
          </div>

          {/* Sağda yalnız tarih — uyku/ruh hali kartlarındaki yeriyle aynı */}
          <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">
            {formatDateTime(entry.occurredAt)}
          </span>
        </div>

        {/* Alt bölüm — künyeden saç teli çizgiyle ayrılır ve tam genişlik
            kullanır. Girinti kaldırıldı: kendi alanı olunca künyenin metin
            sütununa hizalanmasının anlamı yok, kapsüller de daha çok yer
            buluyor. Kutu değil çizgi: iç pencereler kartı bölük pörçük
            gösteriyordu (git etiketi tasarim-2-pencere). */}
        {(typedValues.length > 0 || entry.notes) && (
          <div className="mt-2 border-t border-white/[0.07] pt-2">
            {typedValues.length > 0 && (
              <ValueCapsuleRow values={typedValues} color={color} />
            )}
            {entry.notes && (
              <div className={cn(typedValues.length > 0 && "mt-2")}>
                <NoteCapsule text={entry.notes} color={color} />
              </div>
            )}
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
