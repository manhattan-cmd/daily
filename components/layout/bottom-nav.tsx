"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, CalendarDays, BarChart3, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const leftItems = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/calendar", label: "Takvim", icon: CalendarDays },
] as const;

const rightItems = [
  { href: "/analytics", label: "Analiz", icon: BarChart3 },
  { href: "/structure", label: "Yapı", icon: Layers },
] as const;

function todayStr(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Home;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-1 flex-col items-center gap-1 py-3 text-xs transition-colors",
        active ? "text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
      <span className="font-medium">{label}</span>
    </Link>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const today = todayStr();
  const todayHref = `/calendar/${today}`;
  const todayActive = pathname === todayHref;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/calendar"
      ? pathname.startsWith(href) && !todayActive
      : pathname.startsWith(href);

  return (
    <nav className="shrink-0 border-t border-border bg-background/85 backdrop-blur-xl pb-safe">
      <div className="flex items-stretch justify-around px-2">
        {leftItems.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}

        {/* Bugün — ortadaki yükseltilmiş buton */}
        <Link
          href={todayHref}
          className="relative flex flex-1 flex-col items-center justify-end gap-1 py-3 text-xs"
          aria-label="Bugünün sayfası"
        >
          <span
            className={cn(
              "absolute -top-5 z-10 flex h-12 w-12 items-center justify-center rounded-full",
              "border-4 border-background bg-primary text-primary-foreground",
              "text-base font-bold tabular-nums shadow-lg shadow-primary/30",
              "transition-transform active:scale-90",
              todayActive && "ring-2 ring-primary/50 ring-offset-2 ring-offset-background"
            )}
          >
            {new Date().getDate()}
          </span>
          <span
            className={cn(
              "font-medium transition-colors",
              todayActive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            Bugün
          </span>
        </Link>

        {rightItems.map((item) => (
          <NavItem key={item.href} {...item} active={isActive(item.href)} />
        ))}
      </div>
    </nav>
  );
}
