import { APP_NAME, MARK } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * Logbit kelime logosu — Geist 800, küçük harf, sıkı aralık; i'nin noktası logodaki
 * sarı bit (siyah çerçeveli daire). Boyut yazı boyutuyla (em) ölçeklenir:
 * className ile text-[..] ver. Ekran okuyucu "Logbit" duyar.
 */
export function LogbitWordmark({ className }: { className?: string }) {
  const bit = MARK.parts.find((p) => p.kind === "circle")?.fill ?? "#ffd23f";
  return (
    <span
      className={cn(
        "inline-flex items-baseline font-extrabold leading-none tracking-[-0.03em] text-[#111]",
        className
      )}
    >
      <span className="sr-only">{APP_NAME}</span>
      <span aria-hidden className="inline-flex items-baseline">
        logb
        {/*
          noktasız ı + üstünde bit. Geist'te ı simetrik (sapın ortası genişliğin
          yarısı, 800 ve 900'de ölçüldü) ama negatif harf aralığı kutuyu sağdan
          daraltıyor: kutunun ortası sapın aralığın yarısı kadar solunda kalır
          (900 / -0.045em'de 24px'te 0.54px kaymıştı) — nokta o pay kadar sağda:
          -0.03em aralık → +0.015em. Harf aralığı değişirse bu da değişir.
        */}
        <span className="relative inline-block">
          ı
          <span
            className="absolute left-[calc(50%+0.015em)] top-[0.15em] h-[0.32em] w-[0.32em] -translate-x-1/2 rounded-full border-[0.06em] border-[#111]"
            style={{ background: bit }}
          />
        </span>
        t
      </span>
    </span>
  );
}
