"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { setLocalFlag } from "@/lib/local-flag";
import { WELCOME_DISMISSED } from "@/components/dashboard/welcome-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataSection } from "@/components/settings/data-section";

/**
 * Ayarlar — verinin ve uygulamanın kendisiyle ilgili her şey. Yedekleme
 * buraya taşındı: "Yapı" sekmesi kategori/özellik kurmakla ilgili olmalı,
 * veri güvenliğiyle değil.
 */
export default function SettingsPage() {
  const counts = useLiveQuery(async () => {
    const [categories, subcategories, mods] = await Promise.all([
      db.categories.count(),
      db.subcategories.count(),
      db.mods.count(),
    ]);
    return { categories, subcategories, mods };
  }, []);

  return (
    <>
      <PageHeader title="Settings" description="Data, backup and app" back="/" />

      <div className="flex flex-col gap-6 pb-6">
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Data & backup
          </h2>
          <DataSection />
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Yapı
          </h2>
          <Link
            href="/structure"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">Categories and features</div>
              <div className="text-xs text-muted-foreground">
                {counts
                  ? `${counts.categories} categories · ${counts.subcategories} subcategories · ${counts.mods} features`
                  : "Loading..."}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          </Link>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Uygulama
          </h2>
          <div className="rounded-2xl border border-border bg-card">
            <button
              type="button"
              onClick={() => setLocalFlag(WELCOME_DISMISSED, false)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">Show the welcome again</div>
                <div className="text-xs text-muted-foreground">
                  The category → subcategory → feature walkthrough reappears on the home page
                </div>
              </div>
            </button>
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Routine · version 0.1.0 — your data is kept on this device only and never sent to a server.
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
