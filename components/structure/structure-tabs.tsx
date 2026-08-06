"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SectionNav, chipClass } from "@/components/ui/section-nav";
import { useT, type MessageKey } from "@/lib/i18n";

const TABS: { href: string; key: MessageKey }[] = [
  { href: "/structure", key: "structure.categories" },
  { href: "/structure/mods", key: "structure.features" },
  { href: "/structure/mods/olculer", key: "structure.measures" },
  { href: "/structure/notes", key: "structure.notes" },
  { href: "/structure/galaxy", key: "structure.map" },
];

/**
 * Yapı bölümünün üst menüsü — alt sayfalar arası pill sekmeler. Konum ve
 * biçim Analiz'in dönem çipleriyle ortak (SectionNav).
 */
export function StructureTabs() {
  const t = useT();
  const pathname = usePathname();
  return (
    <SectionNav label={t("structure.title")}>
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={chipClass(active)}
            aria-current={active ? "page" : undefined}
          >
            {t(tab.key)}
          </Link>
        );
      })}
    </SectionNav>
  );
}
