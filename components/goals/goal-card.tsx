"use client";

import { useRef, useState, type ReactNode } from "react";
import { Bell, Check, MoonStar, NotebookPen, Repeat, Smile, Target } from "lucide-react";
import type { EntryValueWithType, GoalTargetWithContext, GoalWithContext } from "@/types";
import {
  completeGoal,
  goalCompletesDirectly,
  goalTitle,
  uncompleteGoal,
  type GoalOccurrence,
} from "@/lib/db/queries";
import { occursOn, weekOf } from "@/lib/goals";
import { playEntrySound } from "@/lib/sound";
import { useSkin } from "@/lib/skin";
import { SymbolIcon } from "@/lib/icons";
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { cn, toLocalDateValue } from "@/lib/utils";
import { useLongPress } from "@/lib/use-long-press";
import { blockTint } from "@/components/dashboard/entry-block";
import { ValueCapsuleRow } from "@/components/dashboard/entry-parts";
import { SelectionLayer, selectedCardClass, type EntrySelection } from "@/components/calendar/entry-selection";
import { EditEntryModal } from "@/components/forms/edit-entry-modal";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { MoodSheet } from "@/components/calendar/mood-sheet";
import { SleepSheet } from "@/components/calendar/sleep-sheet";
import { inkOn, useRepeatLabel } from "./goal-plan";
import { GoalBurst } from "./goal-burst";

/** Yerleşik akışların kendi rengi (pencereleriyle aynı) */
function accentOf(category: { color?: string; isBuiltIn?: boolean; builtInKey?: string }): string {
  if (category.isBuiltIn) {
    const key = category.builtInKey ?? "sleep";
    if (key === "sleep") return "#8b5cf6";
    if (key === "mood") return "#f472b6";
  }
  return category.color || "#818cf8";
}

/** Künyedeki simge: alt kategorinin, yoksa kategorinin; uyku ve ruh halinin kendi simgesi */
function goalIcon(goal: GoalWithContext, size: number): ReactNode {
  if (goal.category.isBuiltIn) {
    const key = goal.category.builtInKey ?? "sleep";
    if (key === "sleep") return <MoonStar style={{ width: size, height: size }} strokeWidth={2.25} />;
    if (key === "mood") return <Smile style={{ width: size, height: size }} strokeWidth={2.25} />;
  }
  const name = goal.subcategory.icon || goal.category.icon;
  return name ? <SymbolIcon name={name} size={size} /> : <Target style={{ width: size, height: size }} strokeWidth={2.25} />;
}

/** Planlanan değerler girdi değeri kılığında — kapsüller girdi kartındakilerle aynı çizilsin */
function plannedValues(targets: GoalTargetWithContext[]): EntryValueWithType[] {
  return targets
    .filter((tg) => tg.targetValue)
    .map((tg) => ({
      id: `plan-${tg.modId ?? tg.entryTypeId}`,
      entryId: "",
      modId: tg.modId,
      entryTypeId: tg.entryTypeId,
      value: tg.targetValue,
      updatedAt: 0,
      entryType: tg.entryType,
      mod: tg.mod,
    }));
}

/**
 * Tekrar eden hedefin bu haftası — günün baş harfi dairenin içinde: yapılan
 * dolu, kartın günü kalın çerçeveli (yarının sayfasında yarın), kaçan sönük,
 * gelecek ince çerçeveli; hedefin olmadığı gün yalnız harf. Kaçan / gelecek
 * ayrımı gerçek bugüne göre.
 */
function WeekRow({ occ, color, brutal }: { occ: GoalOccurrence; color: string; brutal: boolean }) {
  const t = useT();
  const tag = intlTag(useLocale());
  const repeatLabel = useRepeatLabel();
  const today = toLocalDateValue();
  const days = weekOf(occ.date);
  const done = new Set(occ.weekDone ?? []);
  const scheduled = days.filter((d) => occursOn(occ.goal, d));
  const line = brutal ? "#111" : color;
  return (
    <div data-goal-week="" className="flex items-center gap-2">
      <div className="flex shrink-0 items-center gap-[3px]">
        {days.map((d) => {
          const [y, m, dd] = d.split("-").map(Number);
          const letter = new Date(y, m - 1, dd).toLocaleDateString(tag, { weekday: "narrow" });
          const on = occursOn(occ.goal, d);
          const isDone = done.has(d);
          const isThis = d === occ.date;
          const past = d < today;
          return (
            <span
              key={d}
              title={d}
              data-day={isDone ? "done" : !on ? "off" : isThis ? "this" : past ? "missed" : "next"}
              className="flex h-[17px] w-[17px] items-center justify-center rounded-full text-[8.5px] font-extrabold leading-none"
              style={
                !on
                  ? { color: "var(--muted-foreground)", opacity: 0.45 }
                  : isDone
                    ? { background: color, color: brutal ? "#111" : inkOn(color), boxShadow: brutal ? "inset 0 0 0 1.5px #111" : undefined }
                    : isThis
                      ? { background: brutal ? "#fff" : "transparent", color: brutal ? "#111" : color, boxShadow: `inset 0 0 0 2px ${line}` }
                      : past
                        ? { color: "var(--muted-foreground)", boxShadow: "inset 0 0 0 1.5px currentColor", opacity: 0.4 }
                        : { color: brutal ? "#111" : "var(--muted-foreground)", boxShadow: `inset 0 0 0 1.5px ${brutal ? "#111" : "currentColor"}`, opacity: brutal ? 0.55 : 0.7 }
              }
            >
              {letter}
            </span>
          );
        })}
      </div>
      <div className="min-w-0 flex-1 text-right leading-tight">
        <div className="flex items-center justify-end gap-1 truncate text-[10.5px] font-bold">
          <Repeat className="h-2.5 w-2.5 shrink-0" strokeWidth={2.75} />
          <span className="truncate">{repeatLabel(occ.goal.repeat!)}</span>
        </div>
        <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {t("goal.weekCount", { done: scheduled.filter((d) => done.has(d)).length, total: scheduled.length })}
        </div>
      </div>
    </div>
  );
}

/**
 * Hedef kartı — günün bekleyen girdisi, girdi kartıyla aynı dilde.
 *
 * Solda girdinin künyesi (simge, ad, kategori), altında planlanan değerler,
 * tekrar ediyorsa haftanın şeridi. Sağda boydan boya "Yaptım" karosu.
 * Bekleyen kartın künyesi kategorinin renginde ÇİZGİLİ: yapılacak, henüz
 * olmadı. "Yaptım" deyince künye dolar, değerler girdinin değerleri olur,
 * karo kategorinin rengine boyanır: hedef girdiye dönüştü. Ses ve
 * kıvılcımlar bu anı kutlar.
 *
 * Ruh hali ve saati verilmemiş uyku hedefinde karo kendi penceresini açar;
 * kaydedince yine kutlanır. Bekleyene dokunmak hedefi düzenler, yapılmışa
 * dokunmak girdinin kendisini açar (gerçekte 12 km koştuysan düzelt).
 *
 * Yapıldı durumu verinin kendisinden: girdi silinirse hedef yeniden bekler,
 * aynı yere başka yoldan girilen kayıt da hedefi yapılmış sayar.
 */
export function GoalCard({
  occ,
  selection,
  celebrate = false,
  highlight = false,
}: {
  occ: GoalOccurrence;
  /** Yalnız tek günlük hedefte: basılı tutmak toplu seçimi başlatır */
  selection?: EntrySelection;
  /** Açılır açılmaz kutla (bildirimdeki "Yaptım"dan gelindi) */
  celebrate?: boolean;
  /** Bildirimden gelindi: kart bir an dikkat çeker */
  highlight?: boolean;
}) {
  const t = useT();
  const tag = intlTag(useLocale());
  const brutal = useSkin() === "brutal";
  const { goal, entry, date } = occ;
  // Brütalde girdi kartlarıyla aynı renk (kategorinin kendisi)
  const color = brutal ? goal.category.color || accentOf(goal.category) : accentOf(goal.category);
  const ink = brutal ? "#111" : inkOn(color);
  const done = !!entry;

  const [optimistic, setOptimistic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"mood" | "sleep" | "goal" | "entry" | null>(null);
  const [burst, setBurst] = useState(celebrate ? 1 : 0);
  const shown = done || optimistic;

  // Yapılmadan yapıldıya her geçiş kutlanır — dokunuşla, pencereyle ya da
  // aynı yere başka yoldan girilen kayıtla (çizim sırasında ayarlanır)
  const [seen, setSeen] = useState(shown);
  if (shown !== seen) {
    setSeen(shown);
    if (shown) setBurst((b) => b + 1);
  }
  if (optimistic && done) setOptimistic(false);

  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  // Bildirimden gelindiyse kart görünüme gelsin (bir kez)
  const scrolled = useRef(false);
  const scrollIn = (el: HTMLDivElement | null) => {
    if (!el || !highlight || scrolled.current) return;
    scrolled.current = true;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
  };

  async function toggle() {
    if (busy) return;
    if (shown) {
      setBusy(true);
      try {
        setOptimistic(false);
        await uncompleteGoal(goal.id, date);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!goalCompletesDirectly(goal)) {
      const key = goal.category.builtInKey ?? "sleep";
      setSheet(key === "mood" ? "mood" : "sleep");
      return;
    }
    // Anında: ses, dolan daire ve kıvılcım dokunuşla birlikte; kayıt arkadan
    setOptimistic(true);
    playEntrySound("goal");
    setBusy(true);
    try {
      const created = await completeGoal(goal.id, date);
      if (!created) setOptimistic(false);
    } catch {
      setOptimistic(false);
    } finally {
      setBusy(false);
    }
  }

  const doneAt =
    entry && new Date(entry.occurredAt).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const name = goalTitle(goal);
  const sub = goal.subcategory.isCategoryRoot || goal.category.isBuiltIn ? "" : goal.category.name;
  // Yapıldıysa girilen değerler, değilse planlananlar
  const values = shown && entry ? entry.values.filter((v) => v.entryType && !v.thingId) : plannedValues(goal.targets);
  const note = shown && entry ? entry.notes : goal.note;

  // Künyenin zemini: bekleyen çizgili (kategorinin açık tonu), yapılmış dolu
  const stripe = brutal ? `color-mix(in srgb, ${color} 34%, #fff)` : `${color}26`;
  const headBg = shown
    ? brutal
      ? color
      : `linear-gradient(135deg, ${color}2e, ${color}12)`
    : `repeating-linear-gradient(-45deg, ${stripe} 0 5px, ${brutal ? "#fff" : "transparent"} 5px 11px)`;
  const cellBg = brutal ? (shown ? blockTint(color) : "#fff") : undefined;
  const cellCls = cn("px-2.5 py-2", !brutal && "border-t border-[var(--ln-1)]");

  return (
    <>
      <div
        ref={scrollIn}
        data-goal-card=""
        data-done={shown ? "" : undefined}
        key={`card-${burst}`}
        className={cn(
          "relative grid select-none touch-manipulation grid-cols-[minmax(0,1fr)_72px]",
          brutal
            ? "gap-[2px] rounded-[14px] border-2 border-[#111] bg-[#111] text-[#111] shadow-[3px_3px_0_#111]"
            : "rounded-2xl border bg-card",
          burst > 0 && "goal-bounce",
          highlight && "goal-attn",
          selection?.selected && selectedCardClass
        )}
        style={
          {
            "--goal-c": color,
            ...(!brutal ? { borderColor: shown ? `${color}66` : `${color}40` } : {}),
          } as React.CSSProperties
        }
        {...(selection && !selection.active ? longPress : {})}
      >
        {/* Gövde: bekleyen → hedefi düzenle, yapılmış → girdiyi aç */}
        <button
          type="button"
          data-goal-body=""
          onClick={() => setSheet(shown && entry ? "entry" : "goal")}
          className={cn(
            // Son hücre boşluğu doldurur: karo kartın boyunu belirler, gövde kısa kalırsa altında boşluk kalmasın
            "flex min-w-0 flex-col overflow-hidden text-left transition-transform active:scale-[0.99] [&>*:last-child]:flex-1",
            brutal ? "gap-[2px] rounded-l-[12px] bg-[#111]" : "rounded-l-2xl"
          )}
        >
          {/* Künye */}
          <div data-goal-head="" className="flex items-center gap-2 px-2.5 py-2" style={{ background: headBg }}>
            <span
              className={cn(
                "flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-[8px]",
                brutal ? "bg-white text-[#111] shadow-[inset_0_0_0_2px_#111,1.5px_1.5px_0_#111]" : "bg-[var(--sf-2)]"
              )}
              style={brutal ? undefined : { color }}
            >
              {goalIcon(goal, 15)}
            </span>
            <div className="min-w-0 flex-1">
              <div className={cn("break-words text-[14px] leading-snug tracking-[-0.01em]", brutal ? "font-extrabold" : "font-semibold")}>
                {name}
              </div>
              {sub && (
                <div
                  className="mt-0.5 truncate text-[8.5px] font-bold uppercase leading-none tracking-[0.12em]"
                  style={{ color: brutal ? undefined : `${color}cc`, opacity: brutal ? 0.75 : 1 }}
                >
                  {sub}
                </div>
              )}
            </div>
            {/* Sağda: bekleyende hatırlatma saati, yapılmışta yapıldığı saat */}
            {(shown ? doneAt : goal.remindAt) && (
              <span
                data-goal-time=""
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap font-mono text-[9.5px] font-bold leading-none tabular-nums",
                  brutal
                    ? "rounded-[6px] border-[1.5px] border-[#111] bg-white px-1.5 py-[3px]"
                    : "rounded-full bg-[var(--sf-2)] px-1.5 py-1 text-muted-foreground"
                )}
              >
                {!shown && <Bell className="h-2.5 w-2.5" strokeWidth={2.75} />}
                {shown ? doneAt : goal.remindAt}
              </span>
            )}
          </div>

          {values.length > 0 && (
            <div data-goal-values="" className={cn(cellCls, "flex flex-col justify-center")} style={{ background: cellBg }}>
              <ValueCapsuleRow values={values} color={color} />
            </div>
          )}

          {note && (
            <div className={cn(cellCls, "flex items-center gap-1.5")} style={{ background: cellBg }}>
              <NotebookPen className="h-3 w-3 shrink-0 opacity-70" strokeWidth={2.25} />
              <p className="line-clamp-2 min-w-0 text-[11px] font-medium leading-snug opacity-75">{note}</p>
            </div>
          )}

          {goal.repeat && (
            <div className={cn(cellCls, "flex flex-col justify-center")} style={{ background: brutal ? "#fff" : undefined }}>
              <WeekRow occ={occ} color={color} brutal={brutal} />
            </div>
          )}
        </button>

        {/* Yaptım — boydan boya karo; daire dolar, kıvılcım oradan çıkar */}
        <button
          type="button"
          data-goal-check=""
          onClick={toggle}
          disabled={busy}
          aria-pressed={shown}
          aria-label={shown ? t("goal.completedUndo") : t("goal.markComplete")}
          className={cn(
            "group relative flex flex-col items-center justify-center gap-1.5 px-1 py-2.5 transition-colors",
            brutal ? "rounded-r-[12px]" : "rounded-r-2xl border-l border-[var(--ln-1)]"
          )}
          style={{
            background: shown ? (brutal ? color : `${color}22`) : brutal ? "#fff" : undefined,
          }}
        >
          <span
            className={cn(
              "relative flex h-10 w-10 items-center justify-center rounded-full border-[2.5px] transition-[background-color,transform] group-active:scale-90",
              brutal && "border-[#111]"
            )}
            style={{
              borderColor: brutal ? "#111" : color,
              background: shown ? (brutal ? "#111" : color) : brutal ? "#fff" : "transparent",
              boxShadow: brutal ? "2px 2px 0 #111" : undefined,
            }}
          >
            {shown ? (
              <Check
                key={`c-${burst}`}
                className="goal-pop h-[22px] w-[22px]"
                strokeWidth={3.5}
                style={{ color: brutal ? "#fff" : ink }}
              />
            ) : (
              <Check className="h-5 w-5 opacity-25" strokeWidth={3} style={{ color: brutal ? "#111" : color }} />
            )}
            {burst > 0 && <GoalBurst key={burst} color={color} />}
          </span>
          <span
            data-goal-done-label={shown ? "" : undefined}
            className="text-[10.5px] font-extrabold leading-none tracking-[0.02em]"
            style={{ color: brutal ? "#111" : shown ? color : undefined }}
          >
            {shown ? t("goal.doneLabel") : t("goal.checkLabel")}
          </span>
        </button>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("goal.select", { name })}
          />
        )}
      </div>

      {sheet === "goal" && <DayEntrySheet date={date} open onClose={() => setSheet(null)} editGoal={goal} />}
      {sheet === "entry" && entry && (
        <EditEntryModal entry={entry} open onOpenChange={(o) => !o && setSheet(null)} />
      )}
      <MoodSheet date={date} open={sheet === "mood"} onClose={() => setSheet(null)} goal={{ id: goal.id, date }} />
      <SleepSheet date={date} open={sheet === "sleep"} onClose={() => setSheet(null)} goal={{ id: goal.id, date }} />
    </>
  );
}
