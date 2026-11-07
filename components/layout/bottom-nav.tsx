"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Home, CalendarDays, BarChart3, Layers } from "lucide-react";
import { MARK } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useT, type MessageKey } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useRoutePath } from "@/lib/use-route-path";
import { prefetchDayOnPress } from "@/lib/db/day-cache";

const leftItems = [
  { href: "/", key: "nav.home" as MessageKey, icon: Home },
  { href: "/calendar", key: "nav.calendar", icon: CalendarDays },
] as const;

const rightItems = [
  { href: "/analytics", key: "nav.insights", icon: BarChart3 },
  { href: "/structure", key: "nav.structure", icon: Layers },
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
      data-active={active ? "" : undefined}
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

/**
 * Brütal: Bugün dairesini Kutu maskotu (logo) tutuyor — daire menünün öbür
 * simgeleriyle aynı hizada (globals.css: 30 px, ortası bağlantının
 * tepesinden 19 px aşağıda), pembe gövde logodaki gibi arkasında, beyaz
 * elleri iki yanında. Kafanın üstü menünün çizgisini aşıp dışarı taşar.
 * Maskot da bağlantının içinde: daireyle birlikte tek dokunma alanı, ikisi
 * de bugünün sayfasını açar. Birim px, bağlantının tepesine göre.
 */
function NavMascot() {
  return (
    <span data-brut-only aria-hidden className="absolute inset-0">
      <svg viewBox="0 0 49 44" className="absolute left-1/2 -top-[13px] h-[44px] w-[49px] -translate-x-[23px]">
        <rect x="3" y="3" width="44" height="40" rx="9" fill={MARK.ink} />
        <rect x="1" y="1" width="44" height="40" rx="9" fill={MARK.body} stroke={MARK.ink} strokeWidth="1.5" />
        <ellipse cx="17.8" cy="7.5" rx="1.6" ry="2.3" fill={MARK.ink} />
        <ellipse cx="28.2" cy="7.5" rx="1.6" ry="2.3" fill={MARK.ink} />
        <path d="M20 11.8 Q23 14 26 11.8" fill="none" stroke={MARK.ink} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      {[-16, 16].map((dx) => (
        <span
          key={dx}
          className="absolute top-[20px] z-20 h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[#111] bg-white"
          style={{ left: `calc(50% + ${dx}px)` }}
        />
      ))}
    </span>
  );
}

/**
 * Gün sayfasının tarihi adresin sorgusunda (/calendar/day?d=…, bkz.
 * lib/routes) — "Bugün"ün vurgusu için okunması gerekiyor. Sorgu okuyan
 * bileşen statik çıktıda bir Suspense sınırı istiyor; sınır dolana kadar
 * menü aynı görünür, yalnız Bugün vurgusuz.
 */
export function BottomNav() {
  return (
    <Suspense fallback={<NavBar day={null} />}>
      <NavWithQuery />
    </Suspense>
  );
}

function NavWithQuery() {
  return <NavBar day={useSearchParams().get("d")} />;
}

function NavBar({ day }: { day: string | null }) {
  const pathname = useRoutePath();
  const t = useT();
  const today = todayStr();
  const todayHref = routes.day(today);
  const todayActive = pathname === "/calendar/day" && day === today;

  const isActive = (href: string) =>
    href === "/"
      ? pathname === "/"
      : href === "/calendar"
      ? pathname.startsWith(href) && !todayActive
      : pathname.startsWith(href);

  return (
    <nav data-bottom-nav="" className="shrink-0 border-t border-border bg-background/85 backdrop-blur-xl pb-safe">
      <div className="flex items-stretch justify-around px-2">
        {leftItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={t(item.key)}
            active={isActive(item.href)}
          />
        ))}

        {/* Bugün — ortadaki yükseltilmiş buton. Zaten bugünün sayfasındayken
            adres değişmiyor, ScrollReset de çalışmıyordu: dokunuş hiçbir şey
            yapmıyordu. O durumda sayfanın başına kayar. */}
        <Link
          href={todayHref}
          {...prefetchDayOnPress(today)}
          onClick={(e) => {
            if (!todayActive) return;
            e.preventDefault();
            document
              .querySelector<HTMLElement>("[data-app-main]")
              ?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          data-active={todayActive ? "" : undefined}
          data-today=""
          className="relative flex flex-1 flex-col items-center justify-end gap-1 py-3 text-xs"
          aria-label={t("nav.todayPage")}
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
          <NavMascot />
          <span
            className={cn(
              "font-medium transition-colors",
              todayActive ? "text-foreground" : "text-muted-foreground"
            )}
          >
            {t("nav.today")}
          </span>
        </Link>

        {rightItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            icon={item.icon}
            label={t(item.key)}
            active={isActive(item.href)}
          />
        ))}
      </div>
    </nav>
  );
}
