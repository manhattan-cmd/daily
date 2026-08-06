"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Layers, Sparkles, X } from "lucide-react";
import { db } from "@/lib/db";
import { useLocalFlag } from "@/lib/local-flag";

export const WELCOME_DISMISSED = "routine:welcomeDismissed";

/** Zincirin üç halkası — örnek yapıdaki gerçek karşılıklarıyla */
const CHAIN = [
  {
    label: "Category",
    example: "Expenses, Fitness, Health",
    hint: "the main headings of your life",
  },
  {
    label: "Subcategory",
    example: "Bills › Electricity",
    hint: "nests as deep as you want",
  },
  {
    label: "Feature",
    example: "Money $, Duration min, Weight kg",
    hint: "what gets measured here",
  },
];

/**
 * İlk açılış karşılaması. Soyut anlatım yerine uygulamayla gelen ÖRNEK yapıyı
 * işaret ediyor: kullanıcı Harcamalar › Fatura › Elektrik'i gezerken mantığı
 * kendiliğinden kavrıyor. İlk girdi girilince ya da kapatılınca bir daha çıkmaz.
 */
export function WelcomeCard() {
  const [dismissed, dismiss] = useLocalFlag(WELCOME_DISMISSED);
  const entryCount = useLiveQuery(() => db.entries.count(), []);

  if (dismissed || entryCount === undefined || entryCount > 0) return null;

  return (
    <div className="animate-in mb-4 overflow-hidden rounded-2xl border border-primary/25 bg-primary/[0.06]">
      <div className="flex items-start gap-3 px-4 pb-3 pt-3.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Welcome</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            You decide what to track. The structure has three links:
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss welcome"
          className="shrink-0 rounded-lg p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <ol className="flex flex-col gap-px bg-white/[0.04]">
        {CHAIN.map((step, i) => (
          <li
            key={step.label}
            className="flex items-baseline gap-2.5 bg-background/40 px-4 py-2"
          >
            <span className="flex h-4 w-4 shrink-0 items-center justify-center self-center rounded-full bg-primary/20 text-[9px] font-bold tabular-nums text-primary">
              {i + 1}
            </span>
            <span className="w-[74px] shrink-0 text-xs font-semibold">
              {step.label}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-foreground/85">
                {step.example}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground/70">
                {step.hint}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="px-4 pb-3.5 pt-3">
        <p className="mb-2.5 text-xs leading-relaxed text-muted-foreground">
          A sample structure is ready — explore it, delete what you don&rsquo;t need, make it yours.
        </p>
        <Link
          href="/structure"
          className="flex items-center justify-center gap-2 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          <Layers className="h-4 w-4" />
          Explore the sample structure
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
