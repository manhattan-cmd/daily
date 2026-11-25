"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowRight, Bell, BellOff } from "lucide-react";
import { db } from "@/lib/db";
import {
  invalidateReminderPlan,
  reminderPermission,
  requestReminderPermission,
  sendTestReminder,
  syncGoalReminders,
  type ReminderPermission,
} from "@/lib/goal-reminders";
import { isNative } from "@/lib/native";
import { routes } from "@/lib/routes";
import { useSkin, isBlockSkin } from "@/lib/skin";
import { useT } from "@/lib/i18n";
import { cn, toLocalDateValue } from "@/lib/utils";
import { goalTimes } from "@/lib/goals";
import { SettingsBlock, SettingsCell, settingsPill } from "./settings-block";
import { blockFill } from "@/lib/fill";

/**
 * Hedef hatırlatmaları: izin durumu, deneme bildirimi ve hedeflere geçit.
 * İzin ilk kez hatırlatmalı bir hedef kurulurken isteniyor; burası
 * reddedildiyse ya da denemek istenirse.
 */
export function ReminderSection() {
  const t = useT();
  const brutal = isBlockSkin(useSkin());
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [tested, setTested] = useState<"ok" | "fail" | null>(null);
  const withReminder = useLiveQuery(
    async () => (await db.goals.toArray()).filter((g) => goalTimes(g).length > 0 && (!g.until || g.until >= toLocalDateValue())).length,
    []
  );

  useEffect(() => {
    let alive = true;
    void reminderPermission().then((p) => alive && setPermission(p));
    return () => {
      alive = false;
    };
  }, []);

  async function ask() {
    const p = await requestReminderPermission();
    setPermission(p);
    if (p === "granted") {
      invalidateReminderPlan();
      void syncGoalReminders();
    }
  }

  async function test() {
    const ok = await sendTestReminder();
    setTested(ok ? "ok" : "fail");
    setPermission(await reminderPermission());
  }

  const status =
    permission === "granted"
      ? t("settings.remind.on", { n: withReminder ?? 0 })
      : permission === "denied"
        ? t("settings.remind.denied")
        : permission === "unsupported"
          ? t("settings.remind.unsupported")
          : t("settings.remind.prompt");
  const pill = cn(
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
    brutal
      ? "border-2 border-line bg-paper text-ink active:translate-x-px active:translate-y-px"
      : "bg-[var(--sf-2)] hover:bg-[var(--sf-3)]"
  );

  // Brütal: blok — durum başın altında, düğmeler beyaz hücrede, tarayıcı
  // notu krem hücrede
  if (brutal) {
    return (
      <SettingsBlock
        color="#c9b8ff"
        icon={permission === "denied" ? BellOff : Bell}
        title={t("settings.remind")}
        hint={permission ? status : "…"}
      >
        <SettingsCell className="flex flex-wrap items-center gap-1.5">
          {permission === "prompt" && (
            <button type="button" onClick={ask} className={settingsPill} style={{ background: blockFill("#7ae582") }}>
              {t("settings.remind.allow")}
            </button>
          )}
          {permission !== "unsupported" && permission !== "denied" && (
            <button type="button" data-remind-test="" onClick={test} className={settingsPill}>
              {t("settings.remind.test")}
            </button>
          )}
          <Link href={routes.structureEntries("planned")} prefetch={false} className={settingsPill}>
            {t("goal.pageTitle")}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.75} />
          </Link>
          {tested === "fail" && <span className="text-[12px] font-bold text-[var(--danger-ink)]">{t("settings.remind.testFail")}</span>}
        </SettingsCell>
        {!isNative() && (
          <SettingsCell className="bg-floor text-[11.5px] font-bold leading-snug text-ink/65">
            {t("goal.plan.webHint")}
          </SettingsCell>
        )}
      </SettingsBlock>
    );
  }

  return (
    <div data-reminder-section="" className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center gap-3 px-4 py-3.5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--sf-2)]">
          {permission === "denied" ? (
            <BellOff className="h-5 w-5 text-muted-foreground" />
          ) : (
            <Bell className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{t("settings.remind")}</div>
          <div className="text-xs text-muted-foreground">{permission ? status : "…"}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
        {permission === "prompt" && (
          <button type="button" onClick={ask} className={pill}>
            {t("settings.remind.allow")}
          </button>
        )}
        {permission !== "unsupported" && permission !== "denied" && (
          <button type="button" data-remind-test="" onClick={test} className={pill}>
            {t("settings.remind.test")}
          </button>
        )}
        <Link href={routes.structureEntries("planned")} className={cn(pill, "inline-flex items-center gap-1")}>
          {t("goal.pageTitle")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        {tested === "fail" && <span className="text-xs text-muted-foreground">{t("settings.remind.testFail")}</span>}
      </div>
      {!isNative() && (
        <p className="border-t border-border px-4 py-3 text-[12px] leading-4 text-muted-foreground">
          {t("goal.plan.webHint")}
        </p>
      )}
    </div>
  );
}

