import { APP_NAME, MARK } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Logbit kelime logosu — küçük harf, sıkı aralık; i'nin noktası logodaki
 * sarı bit (siyah çerçeveli daire). Boyut yazı boyutuyla (em) ölçeklenir:
 * className ile text-[..] ver. Ekran okuyucu "Logbit" duyar.
 */
export function LogbitWordmark({ className }: { className?: string }) {
  const bit = MARK.parts.find((p) => p.kind === "circle")?.fill ?? "#ffd23f";
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-black leading-none tracking-[-0.045em] text-[#111]",
        className
      )}
    >
      <span className="sr-only">{APP_NAME}</span>
      <span aria-hidden className="inline-flex items-baseline">
        logb
        {/* noktasız ı + üstünde bit: noktanın yeri glifin ortası */}
        <span className="relative inline-block">
          ı
          <span
            className="absolute left-1/2 top-[0.15em] h-[0.32em] w-[0.32em] -translate-x-1/2 rounded-full border-[0.06em] border-[#111]"
            style={{ background: bit }}
          />
        </span>
        t
      </span>
    </span>
  );
}
