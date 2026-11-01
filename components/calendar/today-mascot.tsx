import { MARK } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Takvimde bugün (Brütal): gün kutusu Kutu maskotu — logodaki gibi üstte yüzü,
 * önünde günün numarasını taşıyan sarı biti iki eliyle tutuyor. Gövde (pembe
 * zemin, çerçeve, sert gölge) globals.css'teki [data-cal-day][data-today]
 * kuralında. Kutu küçük (~42 px): yüz üst üçte birde, bit alt %62'de; o
 * günün kategori noktalarına yer kalmadığı için bugün kutusunda gösterilmez.
 */
export function TodayMascot({ day }: { day: number }) {
  return (
    <>
      <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full">
        <ellipse cx="38" cy="17" rx="4.4" ry="6.2" fill={MARK.ink} />
        <ellipse cx="62" cy="17" rx="4.4" ry="6.2" fill={MARK.ink} />
        <path d="M42 27 Q50 33 58 27" fill="none" stroke={MARK.ink} strokeWidth="4" strokeLinecap="round" />
      </svg>
      <span
        className={cn(
          "absolute bottom-px left-1/2 flex aspect-square h-[62%] -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#111] font-black leading-none",
          // iki haneli gün bitin içine sıkışıp çerçeveye değiyordu
          day < 10 ? "text-[13px]" : "text-[11.5px] tracking-[-0.02em]"
        )}
        style={{ background: MARK.bit, boxShadow: `1.5px 1.5px 0 ${MARK.ink}` }}
      >
        {day}
      </span>
      {/* eller: bitin iki yanında, dikey ortasında (bit %62 yüksek, ortası %31 + 1 px) */}
      {(["19%", "81%"] as const).map((left) => (
        <span
          key={left}
          aria-hidden
          className="absolute h-[7px] w-[7px] -translate-x-1/2 translate-y-1/2 rounded-full border-[1.5px] border-[#111] bg-white"
          style={{ left, bottom: "calc(1px + 31%)" }}
        />
      ))}
    </>
  );
}
