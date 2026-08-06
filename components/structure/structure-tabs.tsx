"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SectionNav, chipClass } from "@/components/ui/section-nav";

const TABS = [
  { href: "/structure", label: "Categories" },
  { href: "/structure/mods", label: "Features" },
  { href: "/structure/mods/olculer", label: "Measures" },
  { href: "/structure/notes", label: "Notes" },
  { href: "/structure/galaxy", label: "Map" },
] as const;

/**
 * Yapı bölümünün üst menüsü — alt sayfalar arası pill sekmeler. Konum ve
 * biçim Analiz'in dönem çipleriyle ortak (SectionNav).
 */
export function StructureTabs() {
  const pathname = usePathname();
  return (
    <SectionNav label="Yapı bölümleri">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={chipClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </SectionNav>
  );
}
