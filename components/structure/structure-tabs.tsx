"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HScroll } from "@/components/ui/h-scroll";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/structure", label: "Kategoriler" },
  { href: "/structure/mods", label: "Özellikler" },
  { href: "/structure/mods/olculer", label: "Ölçüler" },
  { href: "/structure/notes", label: "Notlar" },
  { href: "/structure/galaxy", label: "Harita" },
  { href: "/structure/backup", label: "Yedekleme" },
] as const;

/** Yapı bölümünün üst menüsü — beş alt sayfa arasında pill sekmeler */
export function StructureTabs({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Yapı bölümleri" className={className}>
      <HScroll wrapperClassName="-mx-4" className="gap-1.5 px-4">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary/40 bg-primary/15 text-primary"
                  : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-card/80"
              )}
              aria-current={active ? "page" : undefined}
            >
              {tab.label}
            </Link>
          );
        })}
      </HScroll>
    </nav>
  );
}
