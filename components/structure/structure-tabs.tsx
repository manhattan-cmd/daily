"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const STRUCTURE_TABS: { href: string; key: MessageKey }[] = [
  { href: "/structure", key: "structure.categories" },
  { href: "/structure/mods", key: "structure.features" },
  // Ölçüler sekmesi v18'de kalktı — ölçüm artık özelliğin kendi içinde
  { href: "/structure/notes", key: "structure.notes" },
  { href: "/structure/galaxy", key: "structure.map" },
];

/**
 * Yapı bölümünün üst menüsü.
 *
 * Tek parça bir ray: dört sekme eşit bölünür, seçili olanın arkasındaki
 * gösterge kayarak gelir. Eskiden bunlar sayfa gövdesinde duran ayrı ayrı
 * çiplerdi ve Analiz'in dönem SÜZGEÇ çipleriyle aynı biçimdeydi — iki ayrı
 * iş aynı görünüyordu. Burası gezinme; süzgeç değil, o yüzden kendi biçimi
 * var ve başlığın yapışkan bandının içinde duruyor (bkz. PageHeader `nav`).
 */
export function StructureTabs() {
  const t = useT();
  const pathname = usePathname();
  const activeIndex = STRUCTURE_TABS.findIndex((tab) => tab.href === pathname);

  return (
    <nav aria-label={t("structure.title")}>
      <div className="relative grid grid-cols-4 rounded-full border border-border/70 bg-card/40 p-[3px]">
        {activeIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-[3px] left-[3px] w-[calc((100%-6px)/4)] rounded-full bg-primary/15 ring-1 ring-inset ring-primary/30 transition-transform duration-200 ease-out motion-reduce:transition-none"
            style={{ transform: `translateX(${activeIndex * 100}%)` }}
          />
        )}
        {STRUCTURE_TABS.map((tab, i) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={i === activeIndex ? "page" : undefined}
            className={cn(
              "relative z-10 truncate rounded-full px-1 py-1.5 text-center text-[11.5px] font-medium transition-colors",
              i === activeIndex
                ? "text-primary"
                : "text-muted-foreground/75 hover:text-foreground"
            )}
          >
            {t(tab.key)}
          </Link>
        ))}
      </div>
    </nav>
  );
}
