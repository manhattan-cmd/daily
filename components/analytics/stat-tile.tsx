"use client";

import { cn } from "@/lib/utils";

/**
 * Tek sayılık istatistik kutusu — üç sabit bant: başlık, değer, dönem.
 *
 * Bantların yüksekliği SABİT çünkü kutular yan yana duruyor ve hizaları
 * birbirine bağlı. Eskiden her bant içeriği kadar yer kaplıyordu: "Toplam" tek
 * satır, "Günlük ortalama" iki satır sarınca yanındaki kutunun değeri 14px
 * yukarıda kalıyor, alttaki dönem yazısı da öyle — satır baştan sona kaymış
 * görünüyordu. Ölçüldü: aynı ızgarada değer bandı 843 ve 857'de başlıyordu.
 *
 * Bantlar:
 *   1. Başlık — iki satıra kadar (28px), üstten hizalı.
 *   2. Değer — 28px, TABANDAN hizalı: kelime değerler daha küçük puntoda
 *      yazılıyor, taban hizası olmasa rakamla kelime aynı satırda oturmuyordu.
 *   3. Dönem — 14px, değer yoksa da yer tutar; yoksa kutular yine kayardı.
 *
 * Renk kutunun zemininde ve kenarlığında, YAZIDA DEĞİL: değer ve etiketler
 * normal metin renginde kalıyor, kimliği yanlarındaki nokta taşıyor. Kategori
 * rengiyle yazılan bir rakam hem okunurluğu renge bağlıyor hem de koyu
 * kategori renklerinde sönük çıkıyordu.
 *
 * Değer orantılı rakamlarla (tabular değil) — büyük puntoda tabular rakamlar
 * her basamağa "0" genişliği verdiği için "121" gibi bir sayı gevşek duruyor.
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  color,
  wordValue = false,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  /** Kategori rengi — kutuyu boyar, yazıya dokunmaz */
  color?: string;
  /** Değer bir rakam değil bir kelime (örn. en sık seçenek) — puntoyu düşürür,
   *  yoksa "yorgun" gibi bir sözcük rakam boyunda ezici duruyor */
  wordValue?: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-2xl border px-3.5 py-3",
        !color && "border-border bg-card"
      )}
      style={
        color
          ? {
              borderColor: `${color}40`,
              background: `linear-gradient(135deg, ${color}14, transparent 60%), var(--card)`,
            }
          : undefined
      }
    >
      {/* 1 — Başlık. Kırpılmaz, sarar: dar kutularda "Daily avg." gibi
          kısaltmalara gerek kalmasın. İki satırdan uzunu kırpılır ki bant
          taşıp hizayı bozmasın. */}
      <div className="flex h-7 items-start gap-1.5">
        {color && (
          <span
            className="mt-[3.5px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="line-clamp-2 text-[11px] font-medium leading-[14px] text-muted-foreground">
          {label}
        </span>
      </div>

      {/* 2 — Değer */}
      <div className="flex h-7 items-end gap-1">
        <span
          className={cn(
            "min-w-0 truncate font-semibold leading-none",
            wordValue ? "text-base" : "text-xl"
          )}
        >
          {value}
        </span>
        {unit && (
          <span className="shrink-0 pb-px text-xs font-normal leading-none text-muted-foreground">
            {unit}
          </span>
        )}
      </div>

      {/* 3 — Dönem */}
      <div className="mt-1 h-3.5 truncate text-[10px] leading-[14px] text-muted-foreground/70">
        {sub}
      </div>
    </div>
  );
}
