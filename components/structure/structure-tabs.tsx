"use client";

import Link from "next/link";
import { Circle, Diamond, Map as MapIcon, Square, StickyNote, type LucideIcon } from "lucide-react";
import { useRoutePath } from "@/lib/use-route-path";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useSkin } from "@/lib/skin";

export const STRUCTURE_TABS: { href: string; key: MessageKey; icon: LucideIcon }[] = [
  // Simgeler şekil dilinden: kare = kategori, daire = özellik, baklava = nesne
  { href: "/structure", key: "structure.categories", icon: Square },
  { href: "/structure/mods", key: "structure.features", icon: Circle },
  { href: "/structure/objects", key: "structure.objects", icon: Diamond },
  // Ölçüler sekmesi v18'de kalktı — ölçüm artık özelliğin kendi içinde
  { href: "/structure/notes", key: "structure.notes", icon: StickyNote },
  { href: "/structure/galaxy", key: "structure.map", icon: MapIcon },
];

/**
 * Seçili sekme — kategori ve alt kategori sayfaları Kategoriler sekmesinin
 * içi: Brütalde üçünün başlığı aynı (bkz. StructureHeader), aşağı indikçe
 * yalnız altındaki konum yolu değişir.
 */
export function structureTabIndex(path: string): number {
  const i = STRUCTURE_TABS.findIndex((tab) => tab.href === path);
  if (i >= 0) return i;
  return /^\/structure\/(category|sub)(\/|$)/.test(path) ? 0 : -1;
}

/**
 * Yapı bölümünün üst menüsü.
 *
 * Tek parça bir ray: dört sekme eşit bölünür, seçili olanın arkasındaki
 * gösterge kayarak gelir. Eskiden bunlar sayfa gövdesinde duran ayrı ayrı
 * çiplerdi ve Analiz'in dönem SÜZGEÇ çipleriyle aynı biçimdeydi — iki ayrı
 * iş aynı görünüyordu. Burası gezinme; süzgeç değil, o yüzden kendi biçimi
 * var ve başlığın yapışkan bandının içinde duruyor (bkz. PageHeader `nav`).
 *
 * Her sekme simge üstte, ad altta: beş ad tek satırda yan yana sığmıyordu
 * ("Kategoril…"); alt alta dizilince her ad hücrenin bütün genişliğini alıyor.
 */
export function StructureTabs() {
  const t = useT();
  const pathname = useRoutePath();
  const activeIndex = structureTabIndex(pathname);
  const brutal = useSkin() === "brutal";

  // Brütal: şeridin sekmeleri (bkz. StructureHeader) — alt menünün aynası:
  // simge ve altında ad, çerçevesiz; seçili olanın simgesi kalkık beyaz
  // kapsülde (şekli sarı dolu), adı koyu. Eskiden beş beyaz hücre ortak
  // çizgilerle, seçili olan siyahtı.
  if (brutal) {
    return (
      <nav aria-label={t("structure.title")}>
        <div
          data-tab-strip=""
          className="grid px-1 pb-2 pt-1.5"
          style={{ gridTemplateColumns: `repeat(${STRUCTURE_TABS.length}, minmax(0, 1fr))` }}
        >
          {STRUCTURE_TABS.map((tab, i) => {
            const on = i === activeIndex;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={on ? "page" : undefined}
                className="flex min-w-0 flex-col items-center gap-[5px] pt-1 text-[#111]"
              >
                <span
                  className={cn(
                    "box-content flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] px-[10px] py-[2px] transition-transform",
                    on ? "-translate-y-0.5 bg-white shadow-[2px_2px_0_#111]" : "text-[#111]/60"
                  )}
                  // Çerçeve rengi satır içi: katmansız "* { border-color }" kuralı border-transparent'ı eziyor
                  style={{ borderColor: on ? "#111" : "transparent" }}
                >
                  <tab.icon
                    className={cn("shrink-0", tab.icon === Diamond ? "h-[15px] w-[15px]" : "h-3.5 w-3.5")}
                    strokeWidth={2.6}
                    fill={on ? "#ffd23f" : "none"}
                  />
                </span>
                <span
                  className={cn(
                    "w-full whitespace-nowrap text-center text-[10.5px] leading-none tracking-[-0.01em]",
                    on ? "font-black" : "font-bold text-[#111]/65"
                  )}
                >
                  {t(tab.key)}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={t("structure.title")}>
      <div data-brut-tabs="" style={{ gridTemplateColumns: `repeat(${STRUCTURE_TABS.length}, minmax(0, 1fr))` }}
        className="relative grid rounded-2xl border border-border/70 bg-card/40 p-[3px]">
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/5)] rounded-xl bg-primary/15 ring-1 ring-inset ring-primary/30 transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        )}
        {STRUCTURE_TABS.map((tab, i) => {
          const on = i === activeIndex;
          return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={on ? "page" : undefined}
            data-active={on ? "" : undefined}
            className={cn(
              "relative z-10 flex min-w-0 flex-col items-center gap-1 rounded-xl px-0 pb-1.5 pt-2 transition-colors",
              on ? "text-primary" : "text-muted-foreground/75 hover:text-foreground"
            )}
          >
            {/* Simgeler aynı yükseklikte kutuda — baklava biraz büyük, adlar aynı hizada */}
            <span className="flex h-4 items-center justify-center">
              <tab.icon
                className={cn("shrink-0", tab.icon === Diamond ? "h-[15px] w-[15px]" : "h-3.5 w-3.5")}
                strokeWidth={2.4}
                fill={on ? "currentColor" : "none"}
              />
            </span>
            <span className="w-full whitespace-nowrap text-center text-[10.5px] font-semibold leading-none tracking-[-0.01em]">
              {t(tab.key)}
            </span>
          </Link>
          );
        })}
      </div>
    </nav>
  );
}
