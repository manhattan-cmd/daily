import { MARK, markPartsSvg } from "@/lib/brand";

// sabit geometri: bir kez üretilir
const PARTS = markPartsSvg();

/**
 * Logbit logosu ("Kutu" maskotu) — zemini dahil, kare; köşe yuvarlaklığı ve
 * çerçeve kullanılan yerde verilir. Çizim lib/brand'deki markPartsSvg'den:
 * ikon dosyalarıyla birebir aynı.
 */
export function LogbitMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} aria-hidden>
      <rect width="512" height="512" fill={MARK.bg} />
      <g dangerouslySetInnerHTML={{ __html: PARTS }} />
    </svg>
  );
}
