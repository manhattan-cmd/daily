"use client";

import { useRef, useState } from "react";
import { Bell, Check, ChevronRight, Repeat } from "lucide-react";
import type { EntryType, GoalTargetWithContext, Mod } from "@/types";
import { isScaleChoices } from "@/types";
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
import { intlTag, useLocale, useT } from "@/lib/i18n";
import { cn, toLocalDateValue } from "@/lib/utils";
import { formatDTRDisplay, calcDTRDuration, parseDTR } from "@/components/forms/datetime-range-input";
import { ScaleMeter } from "@/components/ui/scale-meter";
import { useLongPress } from "@/lib/use-long-press";
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

/** Tek bir değer: planlanan hedef ya da yapılan girdinin değeri */
function ValueBit({
  value,
  entryType,
  mod,
  color,
}: {
  value: string;
  entryType: EntryType;
  mod?: Mod;
  color: string;
}) {
  const vt = entryType.valueType ?? "number";
  const name = mod?.name ?? entryType.name;
  if (vt === "datetime-range") {
    const { start, end } = parseDTR(value);
    const duration = calcDTRDuration(start, end);
    return (
      <span className="text-[13px]">
        <span className="font-semibold tabular-nums">{formatDTRDisplay(value)}</span>
        <span className="text-muted-foreground">{duration ? ` · ${duration}` : ""}</span>
      </span>
    );
  }
  if (vt === "boolean") {
    if (value !== "true") return null;
    return <span className="text-[13px] font-semibold">{name}</span>;
  }
  const scale =
    vt === "select" && isScaleChoices(entryType.choices) && entryType.choices!.includes(value)
      ? entryType.choices!
      : null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px]">
      {scale ? (
        <ScaleMeter value={value} choices={scale} color={color} valueClassName="text-[13px]" />
      ) : (
        <span className="font-semibold tabular-nums">{value}</span>
      )}
      {vt === "number" && entryType.unit && <span className="text-muted-foreground">{entryType.unit}</span>}
      <span className="text-muted-foreground">{name}</span>
    </span>
  );
}

/** Tekrar eden hedefin bu haftası: yapılan, kaçan, bugün, gelecek */
function WeekDots({ occ, color }: { occ: GoalOccurrence; color: string }) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const today = toLocalDateValue();
  const days = weekOf(occ.date);
  const done = new Set(occ.weekDone ?? []);
  const scheduled = days.filter((d) => occursOn(occ.goal, d));
  return (
    <div data-goal-week="" className="mt-2 flex items-center gap-2">
      <div className="flex items-center gap-[5px]">
        {days.map((d) => {
          const on = occursOn(occ.goal, d);
          const isDone = done.has(d);
          const past = d < today;
          if (!on)
            return <span key={d} className="h-1 w-2.5 rounded-full bg-muted-foreground/20" />;
          return (
            <span
              key={d}
              title={d}
              className={cn("h-2.5 w-2.5 rounded-full", brutal && "border-[1.5px] border-[#111]")}
              style={
                isDone
                  ? { background: color }
                  : d === today
                    ? { boxShadow: brutal ? undefined : `inset 0 0 0 2px ${color}`, background: brutal ? "#fff" : undefined }
                    : past
                      ? { boxShadow: brutal ? undefined : "inset 0 0 0 2px var(--ln-3, rgba(127,127,127,.45))", opacity: brutal ? 0.35 : 1 }
                      : { boxShadow: brutal ? undefined : "inset 0 0 0 1.5px rgba(127,127,127,.35)", opacity: brutal ? 0.6 : 1 }
              }
            />
          );
        })}
      </div>
      <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
        {t("goal.weekCount", { done: scheduled.filter((d) => done.has(d)).length, total: scheduled.length })}
      </span>
    </div>
  );
}

/**
 * Hedef kartı — günün bekleyen girdisi.
 *
 * Soldaki daire "Yaptım": hedef o an girdiye dönüşür (planlanan değerlerle),
 * ses ve kıvılcımlar onu kutlar. Ruh hali ve saati verilmemiş uyku
 * hedefinde daire kendi penceresini açar; kaydedince yine kutlanır.
 * Yapılmış hedefe dokunmak girdinin kendisini açar (gerçekte 12 km
 * koştuysan düzelt); bekleyene dokunmak hedefi düzenler.
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
  const repeatLabel = useRepeatLabel();
  const { goal, entry, date } = occ;
  const accent = accentOf(goal.category);
  const ink = brutal ? "#111" : inkOn(accent);
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
    entry &&
    new Date(entry.occurredAt).toLocaleTimeString(tag, { hour: "2-digit", minute: "2-digit" });
  const name = goalTitle(goal);
  const path = goal.subcategory.isCategoryRoot || goal.category.isBuiltIn ? "" : goal.category.name;

  const planned = goal.targets.filter((tg: GoalTargetWithContext) => tg.targetValue);
  const actual = (entry?.values ?? []).filter((v) => v.entryType && !v.thingId);

  return (
    <>
      <div
        ref={scrollIn}
        data-goal-card=""
        data-done={shown ? "" : undefined}
        className={cn(
          "relative flex select-none touch-manipulation items-stretch gap-3 rounded-2xl border bg-card px-3 py-3 transition-colors",
          burst > 0 && "goal-bounce",
          highlight && "goal-attn",
          selection?.selected && selectedCardClass
        )}
        key={`card-${burst}`}
        style={
          {
            "--goal-c": accent,
            ...(shown && !brutal ? { borderColor: `${accent}55`, background: `${accent}12` } : {}),
            ...(shown && brutal ? { background: `color-mix(in srgb, ${accent} 22%, #fff)` } : {}),
          } as React.CSSProperties
        }
        {...(selection && !selection.active ? longPress : {})}
      >
        {/* Yaptım */}
        <button
          type="button"
          data-goal-check=""
          onClick={toggle}
          disabled={busy}
          aria-pressed={shown}
          aria-label={shown ? t("goal.completedUndo") : t("goal.markComplete")}
          className={cn(
            "relative mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-full transition-[background-color,transform] active:scale-90",
            brutal ? "border-[2.5px] border-[#111]" : "border-[2.5px]"
          )}
          style={{
            borderColor: brutal ? "#111" : accent,
            background: shown ? accent : brutal ? "#fff" : "transparent",
            boxShadow: brutal && !shown ? "2px 2px 0 #111" : undefined,
          }}
        >
          {shown ? (
            <Check key={`c-${burst}`} className="goal-pop h-6 w-6" strokeWidth={3.25} style={{ color: ink }} />
          ) : (
            <Check className="h-5 w-5 opacity-25" strokeWidth={3} style={{ color: brutal ? "#111" : accent }} />
          )}
          {burst > 0 && <GoalBurst key={burst} color={accent} />}
        </button>

        {/* Gövde: bekleyen → hedefi düzenle, yapılmış → girdiyi aç */}
        <button
          type="button"
          data-goal-body=""
          onClick={() => setSheet(shown && entry ? "entry" : "goal")}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <div className="min-w-0 flex-1">
            {path && (
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: accent }} />
                <span className="truncate text-[11.5px] font-medium text-muted-foreground">{path}</span>
              </div>
            )}
            <div className="text-[15px] font-semibold leading-5 tracking-tight">{name}</div>

            {/* Değerler: yapıldıysa girilenler, değilse planlananlar */}
            {(shown && actual.length > 0) || (!shown && planned.length > 0) ? (
              <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                {shown && entry
                  ? actual.map((v) => (
                      <ValueBit key={v.id} value={v.value} entryType={v.entryType!} mod={v.mod} color={accent} />
                    ))
                  : planned.map((tg) => (
                      <ValueBit
                        key={tg.modId ?? tg.entryTypeId}
                        value={tg.targetValue}
                        entryType={tg.entryType}
                        mod={tg.mod}
                        color={accent}
                      />
                    ))}
              </div>
            ) : null}

            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11.5px] font-medium text-muted-foreground">
              {shown ? (
                <span data-goal-done-label="" className="font-semibold" style={{ color: brutal ? "#111" : accent }}>
                  {doneAt ? t("goal.doneAt", { time: doneAt }) : t("goal.doneLabel")}
                </span>
              ) : null}
              {goal.repeat && (
                <span className="inline-flex items-center gap-1">
                  <Repeat className="h-3 w-3" />
                  {repeatLabel(goal.repeat)}
                </span>
              )}
              {goal.remindAt && !shown && (
                <span className="inline-flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  {goal.remindAt}
                </span>
              )}
            </div>
            {goal.repeat && <WeekDots occ={occ} color={accent} />}
          </div>
          {!selection?.active && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/40" />}
        </button>

        {selection?.active && (
          <SelectionLayer
            selected={selection.selected}
            onToggle={selection.onToggle}
            label={t("goal.select", { name })}
          />
        )}
      </div>

      {sheet === "goal" && (
        <DayEntrySheet date={date} open onClose={() => setSheet(null)} editGoal={goal} />
      )}
      {sheet === "entry" && entry && (
        <EditEntryModal entry={entry} open onOpenChange={(o) => !o && setSheet(null)} />
      )}
      <MoodSheet
        date={date}
        open={sheet === "mood"}
        onClose={() => setSheet(null)}
        goal={{ id: goal.id, date }}
      />
      <SleepSheet
        date={date}
        open={sheet === "sleep"}
        onClose={() => setSheet(null)}
        goal={{ id: goal.id, date }}
      />
    </>
  );
}
