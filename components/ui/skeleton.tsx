import { cn } from "@/lib/utils";

/**
 * Yükleniyor yer tutucusu. Veri gelene kadar `return null` demek "içerik yok"
 * gibi görünüp sonra aniden dolmak demekti; iskelet sayfanın şeklini önden
 * gösterir, geçiş sıçramaz.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-xl bg-white/[0.055]", className)}
    />
  );
}

/** Kart listesi iskeleti — gün/ana sayfa girdi listeleri için */
export function CardListSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-[68px] rounded-2xl" />
      ))}
    </div>
  );
}
