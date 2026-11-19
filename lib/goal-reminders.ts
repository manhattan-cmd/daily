"use client";

import { liveQuery } from "dexie";
import { db } from "@/lib/db";
import { loadReminderState } from "@/lib/db/queries";
import { doneKey, planReminders, type PlannedReminder } from "@/lib/goals";
import { translate } from "@/lib/i18n";
import { isNative } from "@/lib/native";
import { routes } from "@/lib/routes";

/**
 * Planlı girdi hatırlatmaları.
 *
 * Mobil uygulamada (Android) işletim sisteminin zamanlanmış bildirimleri:
 * uygulama kapalıyken de gelir, telefon yeniden başlasa da kalır (eklenti
 * kendisi yeniden kurar). Bildirime dokununca uygulama planlı girdinin
 * gününde açılır ve tamamlama formu kendiliğinden gelir (`fill=1`):
 * tamamlama her zaman doldurarak. Eskiden bildirimde formsuz kaydeden bir
 * "Yaptım" düğmesi vardı.
 *
 * Web'de sunucu olmadığı için kapalı sekmeye bildirim gönderilemez; yalnız
 * uygulama açıkken, saati gelen hatırlatma tarayıcı bildirimi olarak çıkar.
 *
 * Tekrar eden hedefte "her gün 10:00" alarmı KURULMUYOR: o gün hedef zaten
 * yapıldıysa bildirim gelmemeli. Bunun yerine önümüzdeki 21 günün her biri
 * ayrı bildirim; yapılan günün bildirimi iptal edilir. Uygulama her
 * açılışta ve her değişiklikte planı yeniden kurar, pencere ileri kayar.
 */

const KIND = "logbit-goal";
const CHANNEL = "goals";
/** Bildirimin küçük simgesi — android/app/src/main/res/drawable */
const SMALL_ICON = "ic_stat_logbit";
const ICON_COLOR = "#ffd23f";

export type ReminderPermission = "granted" | "denied" | "prompt" | "unsupported";

type Extra = { kind: typeof KIND; goalId: string; date: string; slot?: string };

/** Bildirime dokununca: planın günü, anı ve tamamlama formu */
const fillUrl = (goalId: string, date: string, slot?: string) =>
  `${routes.day(date)}&goal=${encodeURIComponent(goalId)}${slot ? `&slot=${encodeURIComponent(slot)}` : ""}&fill=1`;

const plugin = () => import("@capacitor/local-notifications").then((m) => m.LocalNotifications);

export async function reminderPermission(): Promise<ReminderPermission> {
  if (isNative()) {
    try {
      const { display } = await (await plugin()).checkPermissions();
      return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
    } catch {
      return "unsupported";
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  const p = Notification.permission;
  return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
}

/** İzin iste — hatırlatma açıldığı an (izin istemenin anlamlı olduğu tek yer) */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (isNative()) {
    try {
      const { display } = await (await plugin()).requestPermissions();
      return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
    } catch {
      return "unsupported";
    }
  }
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  try {
    const p = await Notification.requestPermission();
    return p === "granted" ? "granted" : p === "denied" ? "denied" : "prompt";
  } catch {
    return "unsupported";
  }
}

interface Texts {
  title: string;
  body: string;
}

function textOf(p: PlannedReminder, texts: Map<string, Texts>) {
  const t = texts.get(p.goalId);
  return {
    title: t?.title ?? translate("goal.notify.fallback"),
    body: t?.body ? t.body : translate("goal.notify.body"),
  };
}

let lastSignature = "";
/** Uygulamanın yönlendiricisi (startGoalReminders verir) — bildirime dokununca */
let go: ((url: string) => void) | null = null;
let webTimers: ReturnType<typeof setTimeout>[] = [];
let syncing: Promise<void> | null = null;
let again = false;

/** Planı kur (üst üste çağrılırsa birleşir) */
export function syncGoalReminders(): Promise<void> {
  if (syncing) {
    again = true;
    return syncing;
  }
  syncing = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
    } catch (err) {
      console.warn("Goal reminders", err);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

async function syncOnce(): Promise<void> {
  const { goals, done, texts } = await loadReminderState();
  const native = isNative();
  const plan = planReminders(goals, done, Date.now(), native ? 21 : 2);
  const permission = await reminderPermission();
  if (permission !== "granted") return;

  const signature = JSON.stringify(
    plan.map((p) => [p.id, p.at, textOf(p, texts).title, textOf(p, texts).body])
  );
  if (signature === lastSignature) return;
  lastSignature = signature;

  if (native) await scheduleNative(plan, texts);
  else scheduleWeb(plan, texts);
}

let nativeReady: Promise<void> | null = null;

async function prepareNative(): Promise<void> {
  nativeReady ??= (async () => {
    const ln = await plugin();
    await ln.createChannel({
      id: CHANNEL,
      name: translate("goal.notify.channel"),
      description: translate("goal.notify.channelHint"),
      importance: 4,
      vibration: true,
    });
  })();
  return nativeReady;
}

async function scheduleNative(plan: PlannedReminder[], texts: Map<string, Texts>) {
  await prepareNative();
  const ln = await plugin();
  const pending = await ln.getPending();
  const ours = pending.notifications.filter((n) => (n.extra as Extra | undefined)?.kind === KIND);
  if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  if (!plan.length) return;
  await ln.schedule({
    notifications: plan.map((p) => {
      const { title, body } = textOf(p, texts);
      const extra: Extra = { kind: KIND, goalId: p.goalId, date: p.date, slot: p.slot };
      return {
        id: p.id,
        title,
        body,
        channelId: CHANNEL,
        smallIcon: SMALL_ICON,
        iconColor: ICON_COLOR,
        schedule: { at: new Date(p.at), allowWhileIdle: true },
        extra,
      };
    }),
  });
}

function scheduleWeb(plan: PlannedReminder[], texts: Map<string, Texts>) {
  webTimers.forEach(clearTimeout);
  webTimers = [];
  const now = Date.now();
  for (const p of plan) {
    const wait = p.at - now;
    // Yalnız önümüzdeki gün: açık sekme saatlerce sürebilir, yarını yarın kurarız
    if (wait <= 0 || wait > 86_400_000) continue;
    webTimers.push(setTimeout(() => void showWeb(p, texts), wait));
  }
}

async function showWeb(p: PlannedReminder, texts: Map<string, Texts>) {
  // Saati gelene kadar yapılmış olabilir
  const state = await loadReminderState();
  if (state.done.has(doneKey(p.goalId, p.date, p.slot))) return;
  const { title, body } = textOf(p, state.texts.size ? state.texts : texts);
  const url = fillUrl(p.goalId, p.date, p.slot);
  const options: NotificationOptions = {
    body,
    tag: `${KIND}-${p.id}`,
    icon: "/icons/icon-192.png",
    data: { url },
  };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, options);
      return;
    }
  } catch {
    /* service worker yok — doğrudan bildirim */
  }
  try {
    const n = new Notification(title, options);
    n.onclick = () => {
      window.focus();
      go?.(url);
      n.close();
    };
  } catch {
    /* bu tarayıcı bildirim gösteremiyor */
  }
}

/** Planı ilk saniyede yeniden kurmamak için bekleme (art arda yazmalar birleşsin) */
const DEBOUNCE = 1200;

/**
 * Uygulama kabuğunda bir kez: hedef ve girdi değişince, sayfa öne gelince
 * ve her saat başı planı yenile; mobilde bildirime dokunmayı dinle.
 * `navigate` gün sayfasına gitmek için (Next yönlendiricisi).
 */
export function startGoalReminders(navigate: (url: string) => void): () => void {
  go = navigate;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const soon = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void syncGoalReminders(), DEBOUNCE);
  };

  // Hedefler ya da hedefe bağlı girdiler değişince
  const sub = liveQuery(async () => {
    const [goals, linked] = await Promise.all([
      db.goals.toArray(),
      db.entries.where("goalId").above("").toArray(),
    ]);
    return `${goals.map((g) => `${g.id}:${g.updatedAt}`).join(",")}|${linked
      .map((e) => `${e.id}:${e.occurredAt}`)
      .join(",")}`;
  }).subscribe({ next: soon, error: () => {} });

  const onVisible = () => {
    if (document.visibilityState === "visible") soon();
  };
  document.addEventListener("visibilitychange", onVisible);
  const hourly = setInterval(soon, 3_600_000);

  let removeListener: (() => void) | null = null;
  let cancelled = false;
  if (isNative()) {
    void plugin().then((ln) =>
      ln
        .addListener("localNotificationActionPerformed", async (action) => {
          const extra = action.notification.extra as Extra | undefined;
          if (extra?.kind !== KIND) return;
          navigate(fillUrl(extra.goalId, extra.date, extra.slot));
        })
        .then((h) => {
          if (cancelled) void h.remove();
          else removeListener = () => void h.remove();
        })
    );
  }

  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    sub.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    clearInterval(hourly);
    removeListener?.();
    webTimers.forEach(clearTimeout);
  };
}

/** Ayarlar › Bildirimler: hemen bir deneme bildirimi */
export async function sendTestReminder(): Promise<boolean> {
  const permission = await requestReminderPermission();
  if (permission !== "granted") return false;
  const title = translate("goal.notify.testTitle");
  const body = translate("goal.notify.testBody");
  if (isNative()) {
    await prepareNative();
    const ln = await plugin();
    await ln.schedule({
      notifications: [
        {
          id: 1,
          title,
          body,
          channelId: CHANNEL,
          smallIcon: SMALL_ICON,
          iconColor: ICON_COLOR,
          schedule: { at: new Date(Date.now() + 3000), allowWhileIdle: true },
        },
      ],
    });
    return true;
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: "/icons/icon-192.png" });
    else new Notification(title, { body });
    return true;
  } catch {
    return false;
  }
}

/** Plan yeniden hesaplansın (izin yeni verildi) */
export function invalidateReminderPlan() {
  lastSignature = "";
}
