"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
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
import {
  ENTRY_BLOCK_CLS,
  EntryBlockCell,
  EntryBlockHead,
  EntryBlockTime,
} from "@/components/dashboard/entry-block";
import { EntryCard } from "@/components/dashboard/entry-card";
import { EntryIcon } from "@/components/dashboard/entry-icon";
import { ValueCapsuleRow } from "@/components/dashboard/entry-parts";
import { SelectionLayer, selectedCardClass, type EntrySelection } from "@/components/calendar/entry-selection";
import { SleepCard } from "@/components/calendar/sleep-card";
import { MoodCard } from "@/components/calendar/mood-card";
import { DayEntrySheet } from "@/components/calendar/day-entry-sheet";
import { MoodSheet } from "@/components/calendar/mood-sheet";
import { SleepSheet } from "@/components/calendar/sleep-sheet";
import { inkOn, useRepeatLabel } from "./goal-plan";
import { GoalBurst } from "./goal-burst";

/** Uyku / ruh hali / sıradan */
function builtInOf(goal: GoalWithContext): "sleep" | "mood" | undefined {
  if (!goal.category.isBuiltIn) return undefined;
  const key = goal.category.builtInKey ?? "sleep";
  return key === "sleep" || key === "mood" ? key : undefined;
}

/** Kartın rengi — girdi kartlarıyla aynı: kategorinin rengi, yerleşiklerde kendi varsayılanı */
function colorOf(goal: GoalWithContext): string {
  const b = builtInOf(goal);
  return goal.category.color || (b === "sleep" ? "#8b5cf6" : b === "mood" ? "#f472b6" : "#818cf8");
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
 * Yaptım dairesi — künyenin sağında, girdi kartlarında saatin durduğu yerin
 * yanında. Kartın kendi dokunuşu (düzenleme) tetiklenmesin diye tıklama ve
 * basılı tutma burada kalır. Dokunma alanı dairenin dışına taşar (44 px).
 */
function GoalCheck({
  ref,
  done,
  busy,
  color,
  brutal,
  burst,
  label,
  onToggle,
}: {
  ref: RefObject<HTMLButtonElement | null>;
  done: boolean;
  busy: boolean;
  color: string;
  brutal: boolean;
  burst: number;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      data-goal-check=""
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      aria-pressed={done}
      aria-label={label}
      className={cn(
        "relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition-[background-color,transform] active:scale-90",
        "before:absolute before:-inset-2 before:content-['']"
      )}
      style={{
        borderColor: brutal ? "#111" : color,
        background: done ? (brutal ? "#111" : color) : brutal ? "#fff" : "transparent",
        boxShadow: brutal ? "1.5px 1.5px 0 #111" : undefined,
      }}
    >
      {done ? (
        <Check
          key={`c-${burst}`}
          className="goal-pop h-4 w-4"
          strokeWidth={3.5}
          style={{ color: brutal ? "#fff" : inkOn(color) }}
        />
      ) : (
        <Check className="h-3.5 w-3.5 opacity-30" strokeWidth={3} style={{ color: brutal ? "#111" : color }} />
      )}
    </button>
  );
}

/**
 * Kıvılcımlar kartın DIŞINDA çizilir: girdi kartı kenarlarını kırpıyor
 * (overflow-hidden), daire künyenin kenarında olduğu için kıvılcımlar
 * yarıda kesiliyordu. Açıldığında dairenin yerini ölçüp üstüne oturur.
 */
function BurstAt({ anchor, color }: { anchor: RefObject<HTMLButtonElement | null>; color: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const a = anchor.current;
    const host = el?.parentElement;
    if (!el || !a || !host) return;
    const ar = a.getBoundingClientRect();
    const hr = host.getBoundingClientRect();
    el.style.left = `${ar.left - hr.left}px`;
    el.style.top = `${ar.top - hr.top}px`;
    el.style.width = `${ar.width}px`;
    el.style.height = `${ar.height}px`;
  }, [anchor]);
  return (
    <span ref={ref} aria-hidden className="pointer-events-none absolute z-10" style={{ left: 0, top: 0, width: 0, height: 0 }}>
      <GoalBurst color={color} />
    </span>
  );
}

/**
 * Tekrar eden hedefin bu haftası — günün baş harfi dairenin içinde: yapılan
 * dolu, kartın günü kalın çerçeveli (yarının sayfasında yarın), kaçan sönük,
 * gelecek ince çerçeveli; hedefin olmadığı gün yalnız harf. Kaçan / gelecek
 * ayrımı gerçek bugüne göre. Sağdaki yazı kesilmez, sığmazsa alt satıra geçer.
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
    <div data-goal-week="" className="flex items-center gap-3">
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
              className="flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-extrabold leading-none"
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
        <div className="flex items-start justify-end gap-1 text-[11px] font-bold">
          <Repeat className="mt-[2px] h-2.5 w-2.5 shrink-0" strokeWidth={2.75} />
          <span className="break-words">{repeatLabel(occ.goal.repeat!)}</span>
        </div>
        <div className="mt-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {t("goal.weekCount", { done: scheduled.filter((d) => done.has(d)).length, total: scheduled.length })}
        </div>
      </div>
    </div>
  );
}

/**
 * Bekleyen hedef — girdi kartının iskeleti: künye (simge, ad, kategori),
 * altında planlanan değerler, not ve tekrarın haftası. Brütalde künye
 * kategorinin renginde ÇİZGİLİ, öteki temalarda çerçeve kesik çizgi:
 * yapılacak, henüz olmadı. Boyu ve yerleşimi girdi kartıyla aynı.
 */
function PendingCard({
  goal,
  color,
  brutal,
  filled,
  check,
  week,
  selection,
  onOpen,
}: {
  goal: GoalWithContext;
  color: string;
  brutal: boolean;
  /** "Yaptım"a basıldı, kayıt yazılıyor — künye şimdiden dolsun */
  filled: boolean;
  check: ReactNode;
  week: ReactNode;
  selection?: EntrySelection;
  onOpen: () => void;
}) {
  const t = useT();
  const longPress = useLongPress({ onLongPress: () => selection?.onStart() });
  const builtIn = builtInOf(goal);
  const name = goalTitle(goal);
  const sub = goal.subcategory.isCategoryRoot || builtIn ? undefined : goal.category.name;
  const values = plannedValues(goal.targets);
  const note = goal.note;

  const root = {
    role: "button",
    tabIndex: 0,
    "data-goal-body": "",
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter") onOpen();
    },
    "aria-label": t("goal.edit"),
    ...(selection && !selection.active ? longPress : {}),
  } as const;
  const selectionLayer = selection?.active && (
    <SelectionLayer selected={selection.selected} onToggle={selection.onToggle} label={t("goal.select", { name })} />
  );
  const remind = goal.remindAt && (
    <span className="inline-flex items-center gap-1">
      <Bell className="h-2.5 w-2.5" strokeWidth={2.75} />
      {goal.remindAt}
    </span>
  );

  if (brutal) {
    const stripe = `color-mix(in srgb, ${color} 34%, #fff)`;
    const icon =
      builtIn === "sleep" ? (
        <MoonStar className="h-3.5 w-3.5" strokeWidth={2.25} />
      ) : builtIn === "mood" ? (
        <Smile className="h-3.5 w-3.5" strokeWidth={2.25} />
      ) : goal.subcategory.icon || goal.category.icon ? (
        <SymbolIcon name={(goal.subcategory.icon || goal.category.icon)!} size={14} style={{ color: "#111" }} />
      ) : (
        <Target className="h-3.5 w-3.5" strokeWidth={2.25} />
      );
    return (
      <div
        {...root}
        className={cn(ENTRY_BLOCK_CLS, "cursor-pointer transition-transform active:scale-[0.99]", selection?.selected && selectedCardClass)}
      >
        <EntryBlockHead
          color={filled ? color : `repeating-linear-gradient(-45deg, ${stripe} 0 5px, #fff 5px 11px)`}
          icon={icon}
          title={name}
          sub={sub}
          right={
            <>
              {remind && <EntryBlockTime>{remind}</EntryBlockTime>}
              {check}
            </>
          }
        />
        {values.length > 0 && (
          <EntryBlockCell>
            <ValueCapsuleRow values={values} color={color} />
          </EntryBlockCell>
        )}
        {note && (
          <EntryBlockCell className="flex items-start gap-1.5">
            <NotebookPen className="mt-[1px] h-3 w-3 shrink-0" strokeWidth={2.25} />
            <p className="line-clamp-3 min-w-0 text-[11px] font-medium leading-snug text-[#111]/75">{note}</p>
          </EntryBlockCell>
        )}
        {week && <EntryBlockCell>{week}</EntryBlockCell>}
        {selectionLayer}
      </div>
    );
  }

  return (
    <div
      {...root}
      className={cn(
        "group relative w-full cursor-pointer select-none touch-manipulation overflow-hidden rounded-2xl border border-dashed px-2.5 py-2 text-left transition-transform active:scale-[0.99]",
        selection?.selected && selectedCardClass
      )}
      // Kenarlık satır içi: globals.css `*` kuralı sınıfla verilen rengi eziyor (bkz. sleep-card)
      style={{
        borderColor: `${color}8c`,
        background: filled
          ? `linear-gradient(135deg, ${color}24, ${color}0d 45%, transparent), var(--card)`
          : `repeating-linear-gradient(-45deg, ${color}12 0 5px, transparent 5px 11px), var(--card)`,
      }}
    >
      <div data-sel-head="" className="flex items-center gap-2">
        {builtIn ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}33` }}>
            {builtIn === "sleep" ? (
              <MoonStar className="h-[17px] w-[17px]" style={{ color }} strokeWidth={1.75} />
            ) : (
              <Smile className="h-[17px] w-[17px]" style={{ color }} strokeWidth={1.75} />
            )}
          </span>
        ) : (
          <EntryIcon category={goal.category} subcategory={goal.subcategory} />
        )}
        <div className="min-w-0 flex-1">
          {builtIn ? (
            <span className="text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
              {name}
            </span>
          ) : (
            <>
              <div className="break-words text-[13px] font-semibold leading-snug">{name}</div>
              {sub && (
                <div className="mt-0.5 truncate text-[9px] font-semibold uppercase leading-none tracking-[0.12em]" style={{ color: `${color}cc` }}>
                  {sub}
                </div>
              )}
            </>
          )}
        </div>
        {remind && <span className="shrink-0 whitespace-nowrap text-[10px] leading-none tabular-nums text-muted-foreground/70">{remind}</span>}
        {check}
      </div>
      {(values.length > 0 || note || week) && (
        <div className="mt-2 flex flex-col gap-2 border-t border-[var(--ln-1)] pt-2">
          {values.length > 0 && <ValueCapsuleRow values={values} color={color} />}
          {note && (
            <div className="flex items-start gap-1.5 text-muted-foreground">
              <NotebookPen className="mt-[1px] h-3 w-3 shrink-0" strokeWidth={2} />
              <p className="line-clamp-3 min-w-0 text-[11px] leading-snug">{note}</p>
            </div>
          )}
          {week}
        </div>
      )}
      {selectionLayer}
    </div>
  );
}

/**
 * Hedef kartı — günün bekleyen girdisi. Girdi kartlarıyla aynı boyda ve
 * aynı yerleşimde: bekleyen hedef girdi kartının iskeleti (bkz.
 * PendingCard), yapılmış hedef GİRDİNİN KENDİ KARTI (girdi, uyku, ruh hali)
 * — skala, duygular, uyku aralığı orada nasıl çiziliyorsa burada da öyle.
 * İkisinde de künyenin sağında Yaptım dairesi, tekrar ediyorsa en altta
 * haftanın şeridi.
 *
 * Daire "Yaptım": hedef o an girdiye dönüşür (planlanan değerlerle), ses ve
 * kıvılcımlar onu kutlar. Ruh hali ve saati verilmemiş uyku hedefinde daire
 * kendi penceresini açar; kaydedince yine kutlanır. Bekleyene dokunmak
 * hedefi düzenler, yapılmışa dokunmak girdinin kendisini açar (gerçekte
 * 12 km koştuysan düzelt).
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
  const brutal = useSkin() === "brutal";
  const { goal, entry, date } = occ;
  const color = colorOf(goal);
  const builtIn = builtInOf(goal);
  const done = !!entry;

  const [optimistic, setOptimistic] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheet, setSheet] = useState<"mood" | "sleep" | "goal" | null>(null);
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

  // Bildirimden gelindiyse kart görünüme gelsin (bir kez)
  const scrolled = useRef(false);
  const scrollIn = (el: HTMLDivElement | null) => {
    if (!el || !highlight || scrolled.current) return;
    scrolled.current = true;
    setTimeout(() => el.scrollIntoView({ block: "center", behavior: "smooth" }), 250);
  };
  const checkRef = useRef<HTMLButtonElement>(null);

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
      setSheet(builtIn === "mood" ? "mood" : "sleep");
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

  const check = (
    <GoalCheck
      ref={checkRef}
      done={shown}
      busy={busy}
      color={color}
      brutal={brutal}
      burst={burst}
      label={shown ? t("goal.completedUndo") : t("goal.markComplete")}
      onToggle={toggle}
    />
  );
  const week = goal.repeat ? <WeekRow occ={occ} color={color} brutal={brutal} /> : null;

  return (
    <>
      <div
        ref={scrollIn}
        data-goal-card=""
        data-done={shown ? "" : undefined}
        key={`card-${burst}`}
        className={cn("relative rounded-[14px]", burst > 0 && "goal-bounce", highlight && "goal-attn")}
        style={{ "--goal-c": color } as React.CSSProperties}
      >
        {entry ? (
          builtIn === "sleep" ? (
            <SleepCard entry={entry} selection={selection} headExtra={check} footer={week} />
          ) : builtIn === "mood" ? (
            <MoodCard entry={entry} selection={selection} headExtra={check} footer={week} />
          ) : (
            <EntryCard entry={entry} selection={selection} headExtra={check} footer={week} />
          )
        ) : (
          <PendingCard
            goal={goal}
            color={color}
            brutal={brutal}
            filled={shown}
            check={check}
            week={week}
            selection={selection}
            onOpen={() => setSheet("goal")}
          />
        )}
        {burst > 0 && <BurstAt key={burst} anchor={checkRef} color={color} />}
      </div>

      {sheet === "goal" && <DayEntrySheet date={date} open onClose={() => setSheet(null)} editGoal={goal} />}
      <MoodSheet date={date} open={sheet === "mood"} onClose={() => setSheet(null)} goal={{ id: goal.id, date }} />
      <SleepSheet date={date} open={sheet === "sleep"} onClose={() => setSheet(null)} goal={{ id: goal.id, date }} />
    </>
  );
}
