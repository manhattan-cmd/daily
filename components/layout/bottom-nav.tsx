"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BarChart3, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/analytics", label: "Analiz", icon: BarChart3 },
  { href: "/structure", label: "Yapı", icon: Layers },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav className="shrink-0 border-t border-border bg-background/85 backdrop-blur-xl pb-safe">
      <div className="flex items-stretch justify-around px-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
                active ? "text-foreground" : "text-muted-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-5 w-5 transition-transform",
                  active && "scale-110"
                )}
              />
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
