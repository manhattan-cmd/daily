"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Layers, Sparkles } from "lucide-react";
import { db } from "@/lib/db";
import { setLocalFlag } from "@/lib/local-flag";
import { useT } from "@/lib/i18n";
import { WELCOME_DISMISSED } from "@/components/dashboard/welcome-card";
import { PageHeader } from "@/components/layout/page-header";
import { DataSection } from "@/components/settings/data-section";
import { LanguageSection } from "@/components/settings/language-section";

const APP_VERSION = "0.1.0";

/**
 * Ayarlar — verinin ve uygulamanın kendisiyle ilgili her şey. Yedekleme
 * buraya taşındı: "Yapı" sekmesi kategori/özellik kurmakla ilgili olmalı,
 * veri güvenliğiyle değil.
 */
export default function SettingsPage() {
  const t = useT();
  const counts = useLiveQuery(async () => {
    const [categories, subcategories, mods] = await Promise.all([
      db.categories.count(),
      db.subcategories.count(),
      db.mods.count(),
    ]);
    return { categories, subcategories, mods };
  }, []);

  const heading = "mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground";

  return (
    <>
      <PageHeader
        title={t("settings.title")}
        description={t("settings.lead")}
        back="/"
      />

      <div className="flex flex-col gap-6 pb-6">
        <section>
          <h2 className={heading}>{t("settings.appSection")}</h2>
          <LanguageSection />
        </section>

        <section>
          <h2 className={heading}>{t("settings.dataSection")}</h2>
          <DataSection />
        </section>

        <section>
          <h2 className={heading}>{t("settings.structureSection")}</h2>
          <Link
            href="/structure"
            className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 transition-colors hover:bg-white/[0.03]"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]">
              <Layers className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">{t("settings.structureLink")}</div>
              <div className="text-xs text-muted-foreground">
                {counts
                  ? t("settings.structureCounts", {
                      categories: counts.categories,
                      subcategories: counts.subcategories,
                      features: counts.mods,
                    })
                  : "…"}
              </div>
            </div>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />
          </Link>
        </section>

        <section>
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
                <div className="font-medium">{t("settings.showWelcome")}</div>
                <div className="text-xs text-muted-foreground">
                  {t("settings.showWelcomeHint")}
                </div>
              </div>
            </button>
            <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {t("settings.about", { version: APP_VERSION })}
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
