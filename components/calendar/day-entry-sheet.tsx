"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Boxes, Clock, Link2, NotebookPen, Plus, X } from "lucide-react";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  listModifiersForTarget,
  removeModifier,
  createEntry,
  ensureActivity,
  getOrCreateCategoryRootSub,
  listActivityNameSuggestions,
  type CategoryModifierWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { ParallelPickDialog } from "@/components/forms/parallel-pick-dialog";
import { OptionsMenu, PanelBlock } from "@/components/forms/form-options";
import { EntryNetwork } from "@/components/calendar/entry-network";
import {
  DateTimeInput,
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SHORT_MONTHS } from "@/lib/analytics";
import { ScaleInput } from "@/components/ui/scale-input";
import { cn, toLocalDateTimeValue, toLocalDateValue } from "@/lib/utils";
import { isScaleChoices, type Category, type SubCategory } from "@/types";

/** Değer state anahtarı: global mod id (legacy atamalarda atama id'si) */
const valueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
/** Paralel perspektifler arası taşıma anahtarı: aynı atom = aynı anahtar */
const sharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId ?? m.id;

interface DayEntrySheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
  /** true: sheet aktivite akışıyla açılır — önce isim, sonra seri girdi ekleme */
  activityMode?: boolean;
  /** Var olan aktiviteye girdi eklerken: isim adımı atlanır, doğrudan seri giriş */
  presetActivity?: { id: string; name: string } | null;
}

type Step =
  | { type: "activity-name" }
  | { type: "pick" }
  | { type: "form"; sub: SubCategory }
  | { type: "parallel-form"; sub: SubCategory; catName: string; queueIndex: number; queueTotal: number; groupId: string; carryover: Record<string, string> };

export function DayEntrySheet({
  date,
  open,
  onClose,
  activityMode,
  presetActivity,
}: DayEntrySheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ type: "pick" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  // Girdinin zamanı — formdaki "Zaman" seçeneğinden değiştirilebilir
  const [occurredAt, setOccurredAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedParallels, setSelectedParallels] = useState<ParallelSub[]>([]);
  const [parallelQueue, setParallelQueue] = useState<ParallelSub[]>([]);
  const [lockedTypeIds, setLockedTypeIds] = useState<Set<string>>(new Set());
  // Aktivite akışı: id bellekte üretilir, DB kaydı ilk girdiyle yazılır (ensureActivity)
  const [activity, setActivity] = useState<{ id: string; name: string } | null>(null);
  const [activityCount, setActivityCount] = useState(0);

  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep({ type: "pick" });
        setValues({});
        setNotes("");
        setSelectedParallels([]);
        setParallelQueue([]);
        setLockedTypeIds(new Set());
        setActivity(null);
        setActivityCount(0);
      }, 300);
    }
  }, [open]);

  // Aktivite modunda açılış isim adımından başlar; var olan aktiviteye
  // eklerken isim adımı atlanıp doğrudan seçim adımına geçilir
  // Render sırasında ayarlama: açılış anında adımı seçmek bir effect turu
  // beklemesin, yoksa sheet bir kare yanlış adımı çiziyor
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      if (presetActivity) {
        setActivity(presetActivity);
        setStep({ type: "pick" });
      } else if (activityMode) {
        setStep({ type: "activity-name" });
      }
    }
  }

  const groups = useLiveQuery(async () => {
    const cats = await db.categories.orderBy("order").toArray();
    const subs = await db.subcategories.toArray();
    return cats
      .filter((cat) => !cat.isBuiltIn) // Uyku'nun kendi akışı var (Ekle → Uyku)
      .map((cat) => ({
        category: cat,
        topSubs: subs
          .filter((s) => s.categoryId === cat.id && !s.parentId && !s.isCategoryRoot)
          .sort((a, b) => a.order - b.order),
        allSubs: subs.filter((s) => s.categoryId === cat.id),
      }));
  }, []);

  const currentSubId =
    step.type === "form" || step.type === "parallel-form" ? step.sub.id : "";

  // Modifier'ları canlı izle — hem ana hem paralel form için
  const formMods = useLiveQuery(
    async () => {
      if (!currentSubId) return [];
      return listModifiersForTarget("subcategory", currentSubId);
    },
    [currentSubId]
  ) ?? [];

  // Yeni özellik eklendiğinde values'a ilk değerini otomatik ekle.
  // NOT: Bu bilerek effect olarak kaldı. Türetilmiş değere çevirmek denendi
  // ama varsayılanlar (boolean için "false") kaydetme yoluna girmiyor ve
  // sessizce kayboluyorlar; girdi kaydetme akışının testi olmadan bu riski
  // almak doğru değil. Lint bu satırı işaretliyor — bilinçli borç.
  useEffect(() => {
    if (!currentSubId || !formMods.length) return;
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of formMods) {
        if (!(valueKey(m) in next)) {
          next[valueKey(m)] = m.entryType.valueType === "boolean" ? "false" : "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [formMods, currentSubId]);

  /** Varsayılan: sayfanın günü + şu anki saat ("YYYY-MM-DDTHH:mm") */
  function defaultOccurredAt(): string {
    const [y, mo, d] = date.split("-").map(Number);
    const n = new Date();
    return toLocalDateTimeValue(
      new Date(y, mo - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime()
    );
  }

  function handleSubSelect(sub: SubCategory) {
    setValues({});
    setSelectedParallels([]);
    setParallelQueue([]);
    setOccurredAt(defaultOccurredAt());
    setStep({ type: "form", sub });
  }

  // Üst kategoriyi doğrudan seç — gizli kök alt kategorisi üzerinden forma geç
  async function handleCategorySelect(category: Category) {
    const rootSub = await getOrCreateCategoryRootSub(category.id);
    handleSubSelect(rootSub);
  }

  /**
   * Değersiz kayıt — "koştum" demek için form açmaya gerek yok.
   * Uygulamanın vaadi ölçmek ama ölçmeyi ZORUNLU kılmak girdi eklemeyi
   * yavaşlatıyordu: kullanıcı önce üç boş alan görüyor, sonra kaydediyordu.
   * Özellik doldurmak isteyen "Detay ekle"ye gidiyor.
   */
  async function handleQuickAdd(sub: SubCategory) {
    if (saving) return;
    setSaving(true);
    try {
      const ts = new Date(defaultOccurredAt()).getTime();
      if (activity) {
        await ensureActivity({ id: activity.id, name: activity.name, occurredAt: ts });
      }
      await createEntry({
        subcategoryId: sub.id,
        typeValues: [],
        occurredAt: ts,
        activityId: activity?.id,
      });
      onClose();
      router.push(`/calendar/${date}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleQuickAddCategory(category: Category) {
    const rootSub = await getOrCreateCategoryRootSub(category.id);
    await handleQuickAdd(rootSub);
  }

  // vals: valueKey(mod) → değer. Değerler havuzdaki atoma (modId) bağlanır.
  async function persistEntry(
    subId: string,
    mods: CategoryModifierWithType[],
    vals: Record<string, string>,
    groupId?: string,
    entryNotes?: string
  ) {
    const typeValues = mods
      .filter((m) => (vals[valueKey(m)] ?? "") !== "")
      .map((m) => ({
        entryTypeId: m.entryTypeId,
        modId: m.modId,
        value: vals[valueKey(m)],
      }));
    // Kullanıcı formdan değiştirmiş olabilir; paralel perspektifler de aynı anı
    // paylaşsın diye tek kaynak
    const ts = new Date(occurredAt).getTime();
    // Aktivite kaydı ilk girdiyle yazılır — isim verip vazgeçen iz bırakmaz
    if (activity) {
      await ensureActivity({ id: activity.id, name: activity.name, occurredAt: ts });
    }
    await createEntry({
      subcategoryId: subId,
      typeValues,
      occurredAt: ts,
      notes: (entryNotes ?? notes).trim() || undefined,
      linkedGroupId: groupId,
      activityId: activity?.id,
    });
  }

  // Paralel perspektifler arası taşıma: aynı atom (mod) aynı anahtar
  function toSharedKeyed(
    mods: CategoryModifierWithType[],
    vals: Record<string, string>
  ): Record<string, string> {
    const out: Record<string, string> = {};
    for (const m of mods) {
      const v = vals[valueKey(m)];
      if (v !== undefined && v !== "") out[sharedKey(m)] = v;
    }
    return out;
  }

  async function advanceToNextParallel(
    queue: ParallelSub[],
    groupId: string,
    currentIndex: number,
    totalCount: number,
    carryover: Record<string, string> = {}
  ) {
    if (queue.length === 0) {
      onClose();
      router.push(`/calendar/${date}`);
      return;
    }
    const next = queue[0];
    const nextMods = await listModifiersForTarget("subcategory", next.id);
    const initial: Record<string, string> = {};
    const newLocked = new Set<string>();
    for (const m of nextMods) {
      const carried = carryover[sharedKey(m)];
      if (carried !== undefined && carried !== "") {
        initial[valueKey(m)] = carried;
        newLocked.add(sharedKey(m));
      } else {
        initial[valueKey(m)] = m.entryType.valueType === "boolean" ? "false" : "";
      }
    }
    setValues(initial);
    setLockedTypeIds(newLocked);
    setNotes("");
    setParallelQueue(queue.slice(1));
    setStep({
      type: "parallel-form",
      sub: next,
      catName: next.categoryName,
      queueIndex: currentIndex + 1,
      queueTotal: totalCount,
      groupId,
      carryover,
    });
  }

  async function handleFormSave() {
    setSaving(true);
    try {
      if (step.type === "form") {
        const groupId = selectedParallels.length > 0 ? nanoid(12) : undefined;
        await persistEntry(step.sub.id, formMods, values, groupId);
        // Aktivite modunda seri giriş: kaydet → seçim adımına dön, sheet açık kalır
        if (activity) {
          setActivityCount((c) => c + 1);
          setValues({});
          setNotes("");
          setStep({ type: "pick" });
          return;
        }
        if (selectedParallels.length > 0) {
          setSelectedParallels([]);
          await advanceToNextParallel(
            selectedParallels, groupId!, 0, selectedParallels.length,
            toSharedKeyed(formMods, values)
          );
        } else {
          onClose();
          router.push(`/calendar/${date}`);
        }
      } else if (step.type === "parallel-form") {
        await persistEntry(step.sub.id, formMods, values, step.groupId, notes);
        const accumulated = { ...step.carryover, ...toSharedKeyed(formMods, values) };
        await advanceToNextParallel(parallelQueue, step.groupId, step.queueIndex, step.queueTotal, accumulated);
      }
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    if (step.type === "parallel-form") {
      advanceToNextParallel(parallelQueue, step.groupId, step.queueIndex, step.queueTotal, step.carryover);
      return;
    }
    setStep({ type: "pick" });
    setValues({});
    setNotes("");
    setLockedTypeIds(new Set());
    setSelectedParallels([]);
    setParallelQueue([]);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-[2px] transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={onClose}
      />

      {/* Girdi yüzeyi — TAM pencere.
          Yarım sheet'te ağ kendi kutusuna sığmıyordu: kökte ekranın üçte biri
          boş kalıyor, yaprakta tek bir altıgen koca siyah alanda yüzüyordu.
          Girdi eklemek uygulamanın asli eylemi; en çok yeri o hak ediyor. */}
      <div
        className={cn(
          "fixed inset-y-0 z-50 left-1/2 -translate-x-1/2 w-full max-w-[390px]",
          "flex flex-col bg-background",
          "transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        <div className="pt-safe shrink-0" />

        {step.type === "activity-name" ? (
          <ActivityNameStep
            onConfirm={(name) => {
              setActivity({ id: nanoid(12), name });
              setStep({ type: "pick" });
            }}
            onClose={onClose}
          />
        ) : step.type === "pick" ? (
          <PickStep
            key={open ? "open" : "closed"}
            groups={groups}
            onSubSelect={handleSubSelect}
            onCategorySelect={handleCategorySelect}
            onQuickAdd={handleQuickAdd}
            onQuickAddCategory={handleQuickAddCategory}
            onClose={onClose}
            activity={activity ? { name: activity.name, count: activityCount } : null}
          />
        ) : (
          <FormStep
            key={step.sub.id}
            sub={step.sub}
            category={
              (groups ?? []).find((g) => g.category.id === step.sub.categoryId)
                ?.category
            }
            mods={formMods}
            currentCategoryId={step.sub.categoryId}
            hideParallels={!!activity}
            activityName={activity?.name}
            selectedParallels={step.type === "form" ? selectedParallels : []}
            onAddParallel={(ps) => setSelectedParallels((prev) => [...prev, ps])}
            onRemoveParallel={(id) => setSelectedParallels((prev) => prev.filter((p) => p.id !== id))}
            parallelContext={
              step.type === "parallel-form"
                ? { catName: step.catName, index: step.queueIndex, total: step.queueTotal }
                : null
            }
            lockedTypeIds={lockedTypeIds}
            values={values}
            onValueChange={(typeId, val) =>
              setValues((prev) => ({ ...prev, [typeId]: val }))
            }
            notes={notes}
            onNotesChange={setNotes}
            occurredAt={occurredAt}
            onOccurredAtChange={setOccurredAt}
            onBack={handleBack}
            onSave={handleFormSave}
            saving={saving}
            entryDate={date}
          />
        )}
      </div>
    </>
  );
}

// ─── Activity Name Step ──────────────────────────────────────────────────────

/** Aktivite akışının ilk adımı — isim + geçmiş adlardan öneri çipleri */
function ActivityNameStep({
  onConfirm,
  onClose,
}: {
  onConfirm: (name: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const suggestions = useLiveQuery(() => listActivityNameSuggestions(), []) ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) onConfirm(name.trim());
  }

  return (
    <>
      <div className="flex items-center justify-between px-5 pt-2 pb-3 shrink-0">
        <div className="min-w-0">
          <h2 className="text-base font-semibold tracking-tight">
            Yeni Aktivite
          </h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Farklı kategorilerden girdileri tek çatı altında topla
          </p>
        </div>
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors shrink-0"
          aria-label={t("action.close")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
        <form onSubmit={submit} className="flex flex-col gap-4">
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">{t("entry.recentActivities")}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onConfirm(s)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-all hover:bg-muted active:scale-95"
                  >
                    <Boxes className="h-3 w-3 text-cyan-400/70" />
                    {s}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t("tree.orTypeNew")}</p>
            </div>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("entry.activityName")}
            autoFocus={suggestions.length === 0}
            className="h-12 text-base"
          />
          <Button type="submit" size="lg" disabled={!name.trim()}>
            Devam →
          </Button>
        </form>
      </div>
    </>
  );
}

// ─── Pick Step ───────────────────────────────────────────────────────────────

function PickStep({
  groups,
  onSubSelect,
  onCategorySelect,
  onQuickAdd,
  onQuickAddCategory,
  onClose,
  activity,
}: {
  groups:
    | { category: Category; topSubs: SubCategory[]; allSubs: SubCategory[] }[]
    | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  /** Formu hiç açmadan değersiz kayıt */
  onQuickAdd: (sub: SubCategory) => void;
  onQuickAddCategory: (category: Category) => void;
  onClose: () => void;
  /** Aktivite akışında başlık bandı + Bitti butonu */
  activity?: { name: string; count: number } | null;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-5 pt-2 pb-3 shrink-0">
        <div className="min-w-0">
          {activity && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <Boxes className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80 truncate">
                {activity.name}
                {activity.count > 0 && ` · ${activity.count} girdi eklendi`}
              </span>
            </div>
          )}
          <h2 className="text-base font-semibold tracking-tight truncate">
            {activity ? t("entry.addToActivity") : t("entry.whatToAdd")}
          </h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {activity
              ? "Add as many as you like — tap Done when finished"
              : t("entry.pickPlace")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {activity && (
            <button
              onClick={onClose}
              className="flex h-7 items-center rounded-full bg-cyan-500/15 border border-cyan-500/40 px-3 text-xs font-semibold text-cyan-300 hover:bg-cyan-500/25 transition-colors"
            >
              Bitti
            </button>
          )}
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors"
            aria-label={t("action.close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-5 pb-6"
      >
        {!groups || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz kategori yok. Önce yapı oluştur.
            </p>
          </div>
        ) : (
          <EntryNetwork
            groups={groups}
            onSubSelect={onSubSelect}
            onCategorySelect={onCategorySelect}
            onQuickAdd={onQuickAdd}
            onQuickAddCategory={onQuickAddCategory}
            onClose={onClose}
          />
        )}
      </div>
    </>
  );
}

// ─── Form Step ───────────────────────────────────────────────────────────────

/** Zaman çipinin etiketi — gün formun günüyse yalnız saat, değilse gün de */
function occurredAtLabel(
  occurredAt: string,
  entryDate: string,
  emptyLabel: string
): string {
  const [d = "", t = ""] = occurredAt.split("T");
  if (!t) return emptyLabel;
  if (d === entryDate) return t;
  const dt = new Date(d + "T00:00:00");
  return `${SHORT_MONTHS[dt.getMonth()]} ${dt.getDate()} · ${t}`;
}


/** Menüden açılan bölümler — aynı anda yalnız biri açık kalır */
type Panel = "time" | "parallel";

/**
 * Girdi formu. Ana gövde yalnız ÖZELLİKLERdir (sorulan değerler + "özellik
 * ekle"), hemen altında her zaman görünen not alanı. Zaman ve paralel
 * perspektif ortada durup akışı karıştırmasın diye başlıktaki küçük seçenek
 * menüsüne alındı; seçilince özelliklerin altında yerinde açılırlar.
 */
function FormStep({
  sub,
  category,
  mods,
  currentCategoryId,
  hideParallels,
  activityName,
  selectedParallels,
  onAddParallel,
  onRemoveParallel,
  parallelContext,
  lockedTypeIds,
  values,
  onValueChange,
  notes,
  onNotesChange,
  occurredAt,
  onOccurredAtChange,
  onBack,
  onSave,
  saving,
  entryDate,
}: {
  sub: SubCategory;
  category?: Category;
  mods: CategoryModifierWithType[];
  currentCategoryId: string;
  /** Aktivite akışında paralel perspektif bölümü gizlenir (seri giriş sade kalsın) */
  hideParallels?: boolean;
  activityName?: string;
  selectedParallels: ParallelSub[];
  onAddParallel: (ps: ParallelSub) => void;
  onRemoveParallel: (id: string) => void;
  parallelContext: { catName: string; index: number; total: number } | null;
  lockedTypeIds: Set<string>;
  values: Record<string, string>;
  onValueChange: (typeId: string, val: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  occurredAt: string;
  onOccurredAtChange: (v: string) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  entryDate: string;
}) {
  const t = useT();
  const [modPickerOpen, setModPickerOpen] = useState(false);
  const [parallelPickerOpen, setParallelPickerOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  // Seçiciden yeni eklenen özellik — alanı görünüme kaydırıp odaklarız
  const [focusModId, setFocusModId] = useState<string | null>(null);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));

  const timeChanged = occurredAt.split("T")[0] !== entryDate;
  const showParallelOption = !parallelContext && !hideParallels;
  // Menüde bir şey ayarlanmışsa düğmede nokta belirir
  const optionsTouched = timeChanged || selectedParallels.length > 0;

  async function handleRemoveMod(mod: CategoryModifierWithType) {
    await removeModifier(mod.id);
    onValueChange(valueKey(mod), "");
  }

  const hasParallelSelected = selectedParallels.length > 0;
  const saveLabel = saving
    ? t("entry.saving")
    : parallelContext
    ? parallelContext.index < parallelContext.total
      ? t("action.saveAndContinue")
      : t("action.save")
    : hasParallelSelected
    ? t("action.saveAndContinue")
    : t("action.save");

  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-2 pb-4 shrink-0">
        <button
          onClick={onBack}
          className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors shrink-0"
          aria-label={parallelContext ? t("action.skip") : t("action.back")}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 min-w-0">
          {parallelContext && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <Link2 className="h-3 w-3 text-violet-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
                {parallelContext.catName}
                {parallelContext.total > 1 && ` · ${parallelContext.index}/${parallelContext.total}`}
              </span>
            </div>
          )}
          {activityName && !parallelContext && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <Boxes className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80 truncate">
                {activityName}
              </span>
            </div>
          )}
          {!parallelContext && !activityName && category && (
            <span
              className="block truncate text-[10px] font-semibold uppercase tracking-[0.14em]"
              style={{ color: `${category.color}cc` }}
            >
              {category.name}
            </span>
          )}
          <h2 className="text-base font-semibold tracking-tight truncate">
            {sub.isCategoryRoot ? (category?.name ?? sub.name) : sub.name}
          </h2>
        </div>

        {/* Zaman ve paralel perspektif ortada durup akışı karıştırmasın */}
        <OptionsMenu
          touched={optionsTouched}
          items={[
            {
              key: "time",
              icon: Clock,
              title: t("entry.time"),
              subtitle: occurredAtLabel(occurredAt, entryDate, t("entry.time")),
              active: panel === "time",
              onSelect: () => togglePanel("time"),
            },
            ...(showParallelOption
              ? [
                  {
                    key: "parallel",
                    icon: Link2,
                    title: t("entry.parallel"),
                    subtitle: selectedParallels.length
                      ? `${selectedParallels.length} seçili`
                      : t("entry.alsoLog"),
                    active: panel === "parallel",
                    onSelect: () => togglePanel("parallel"),
                  },
                ]
              : []),
          ]}
        />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        {/* ── Özellikler: formun tek ana gövdesi ── */}
        {mods.length === 0 ? (
          <button
            type="button"
            onClick={() => setModPickerOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-primary/25 bg-primary/[0.04] px-5 py-7 text-center transition-colors hover:border-primary/45 hover:bg-primary/[0.07]"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Plus className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-sm font-semibold">{t("entry.addFeature")}</span>
            <span className="text-[11px] leading-snug text-muted-foreground">
              Neyin kaydını tutmak istersin? Boş da kaydedebilirsin.
            </span>
          </button>
        ) : (
          <div className="flex flex-col gap-4">
            {mods.map((mod) => (
              <ModInput
                key={mod.id}
                mod={mod}
                value={values[valueKey(mod)] ?? ""}
                onChange={(v) => onValueChange(valueKey(mod), v)}
                onRemove={lockedTypeIds.has(sharedKey(mod)) ? undefined : () => handleRemoveMod(mod)}
                isLocked={lockedTypeIds.has(sharedKey(mod))}
                entryDate={entryDate}
                autoFocus={mod.modId === focusModId}
              />
            ))}
            <button
              type="button"
              onClick={() => setModPickerOpen(true)}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" />
              Add feature
            </button>
          </div>
        )}

        {/* ── Menüden açılan bölümler ── */}
        {panel === "time" && (
          <div className="mt-5">
            <PanelBlock
              icon={Clock}
              title={t("entry.time")}
              onClose={() => setPanel(null)}
            >
              <DateTimeInput value={occurredAt} onChange={onOccurredAtChange} />
            </PanelBlock>
          </div>
        )}

        {panel === "parallel" && showParallelOption && (
          <div className="mt-5">
          <PanelBlock
            icon={Link2}
            title={t("entry.parallel")}
            onClose={() => setPanel(null)}
          >
            <div className="flex flex-col gap-2">
              <p className="text-[11px] leading-snug text-muted-foreground/70">
                Aynı olayı başka bir kategoride de kaydet — kaydettikten sonra
                her biri için detaylar sorulur.
              </p>
              {selectedParallels.map((ps) => (
                <div
                  key={ps.id}
                  className="flex items-center gap-3 rounded-xl border border-violet-500/50 bg-violet-500/10 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0 leading-tight">
                    <span className="text-xs text-muted-foreground">{ps.categoryName}</span>
                    <span className="text-xs text-muted-foreground mx-1">/</span>
                    <span className="text-sm font-medium">{ps.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveParallel(ps.id)}
                    className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                    aria-label={`${ps.name} paralel perspektifini kaldır`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setParallelPickerOpen(true)}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-violet-500/30 py-2.5 text-sm font-medium text-violet-300/80 transition-colors hover:border-violet-500/50 hover:text-violet-200"
              >
                <Plus className="h-3.5 w-3.5" />
                {selectedParallels.length > 0 ? t("entry.anotherPerspective") : t("entry.pickPerspective")}
              </button>
            </div>
          </PanelBlock>
          </div>
        )}

        {/* ── Not — her zaman altta, doğrudan yazılabilir ── */}
        <div className="mt-6 border-t border-white/[0.06] pt-3">
          <label
            htmlFor="entry-note"
            className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/50"
          >
            <NotebookPen className="h-3 w-3" />
            Not
          </label>
          <textarea
            id="entry-note"
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            placeholder={t("entry.notePlaceholder")}
            rows={2}
            className="w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <div className="px-5 pb-8 pt-2 shrink-0 border-t border-white/8">
        <Button
          className={cn("w-full", parallelContext && "bg-violet-600 hover:bg-violet-700")}
          size="lg"
          onClick={onSave}
          disabled={saving}
        >
          {saveLabel}
        </Button>
      </div>

      {/* Paralel perspektif seçici — düzenleme modalıyla ortak bileşen */}
      {!parallelContext && (
        <ParallelPickDialog
          open={parallelPickerOpen}
          onOpenChange={setParallelPickerOpen}
          excludeCategoryId={currentCategoryId}
          selected={selectedParallels}
          onAdd={onAddParallel}
          onRemove={onRemoveParallel}
        />
      )}

      {/* Mod ekleyici — havuzdan seç ya da yeni yarat */}
      <ModPickDialog
        open={modPickerOpen}
        onOpenChange={setModPickerOpen}
        targetType="subcategory"
        targetId={sub.id}
        targetName={sub.name}
        onAttached={(m) => setFocusModId(m.id)}
      />
    </>
  );
}

// ─── Mod Input ────────────────────────────────────────────────────────────────

/** Tek özelliğin değer girişi — girdi formu ve kart üstü hızlı değer sorma
 * (QuickModAdd) ortak kullanır */
export function ModInput({
  mod,
  value,
  onChange,
  onRemove,
  isLocked = false,
  entryDate,
  autoFocus = false,
}: {
  mod: CategoryModifierWithType;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isLocked?: boolean;
  entryDate?: string;
  /** Yeni eklenen özellik: alan görünüme kaydırılır, yazı alanları odaklanır */
  autoFocus?: boolean;
}) {
  const t = useT();
  const vt = mod.entryType.valueType ?? "number";
  const today = toLocalDateValue();
  const scrolledRef = useRef(false);
  const scrollOnMount = (el: HTMLDivElement | null) => {
    if (el && autoFocus && !scrolledRef.current) {
      scrolledRef.current = true;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      // Alan, seçici dialog kapanmadan mount olabiliyor — Radix'in odak
      // tuzağı autoFocus'u yutuyor; dialog söküldükten sonra tekrar odakla
      const input = el.querySelector("input");
      if (input) setTimeout(() => input.focus(), 300);
    }
  };

  const modLabel = mod.name ?? mod.entryType.name;
  const labelRow = (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium">
        {modLabel}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          {modLabel !== mod.entryType.name && `${mod.entryType.name} `}
          {mod.entryType.unit && `(${mod.entryType.unit})`}
        </span>
      </label>
      {isLocked ? (
        <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
          <Link2 className="h-3 w-3" />
          önceki perspektiften
        </span>
      ) : onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted transition-colors"
          aria-label={`${mod.entryType.name} özelliğini bu girdiden çıkar`}
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );

  if (isLocked) {
    let display: string;
    if (vt === "boolean") {
      display = value === "true" ? "Yes" : "No";
    } else if (vt === "datetime-range") {
      display = formatDTRDisplay(value);
    } else {
      display = value || "—";
    }
    return (
      <div className="flex flex-col gap-1.5">
        {labelRow}
        <div className="flex h-10 items-center rounded-xl border border-violet-500/30 bg-violet-500/8 px-3 text-sm text-muted-foreground/80 select-none">
          {display}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" ref={scrollOnMount}>
      {labelRow}

      {vt === "number" && (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
          autoFocus={autoFocus}
        />
      )}

      {vt === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("entry.textPlaceholder")}
          autoFocus={autoFocus}
        />
      )}

      {vt === "boolean" && (
        <button
          type="button"
          onClick={() => onChange(value === "true" ? "false" : "true")}
          className={cn(
            "flex h-10 w-full items-center justify-center rounded-xl border text-sm font-medium transition-colors",
            value === "true"
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-input text-muted-foreground"
          )}
        >
          {value === "true" ? "Yes" : "No"}
        </button>
      )}

      {/* Skala sıralıdır: basamaklar eşit genişlikte tek şeritte, uçlarının
          anlamı altında. Serbest çip bulutu bu sırayı göstermiyordu. */}
      {vt === "select" && isScaleChoices(mod.entryType.choices) && (
        <ScaleInput
          choices={mod.entryType.choices ?? []}
          labels={mod.mod?.scaleLabels}
          value={value}
          onChange={onChange}
        />
      )}

      {vt === "select" && !isScaleChoices(mod.entryType.choices) && (
        <div className="flex flex-wrap gap-2">
          {(mod.entryType.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(value === choice ? "" : choice)}
              className={cn(
                "rounded-xl border px-4 py-2 text-sm font-medium transition-colors",
                value === choice
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-input text-muted-foreground hover:text-foreground"
              )}
            >
              {choice}
            </button>
          ))}
        </div>
      )}

      {vt === "datetime-range" && (
        <DateTimeRangeInput
          value={value}
          onChange={onChange}
          entryDate={entryDate ?? today}
        />
      )}
    </div>
  );
}
