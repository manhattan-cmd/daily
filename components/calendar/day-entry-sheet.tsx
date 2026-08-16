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
import { EntryPicker } from "@/components/calendar/entry-picker";
import { AddEntryPanel } from "@/components/calendar/add-entry-panel";
import { CategoryForm } from "@/components/structure/category-form";
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
  // Standart ekleme yüzeyi — nereden gelinirse gelinsin aynı pencere
  | { type: "add"; sub: SubCategory }
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
    step.type === "form" || step.type === "parallel-form" || step.type === "add"
      ? step.sub.id
      : "";

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

  /** Kalemin okunur yolu — "Spor › Koşu" */
  function pathOf(sub: SubCategory): string {
    const all = (groups ?? []).flatMap((g) => g.allSubs);
    const byId = new Map(all.map((s) => [s.id, s]));
    const parts: string[] = [];
    let cur: SubCategory | undefined = sub.parentId ? byId.get(sub.parentId) : undefined;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    const cat = (groups ?? []).find((g) => g.category.id === sub.categoryId)?.category.name;
    return [cat, ...parts].filter(Boolean).join(" › ");
  }

  /** Varsayılan: sayfanın günü + şu anki saat ("YYYY-MM-DDTHH:mm") */
  function defaultOccurredAt(): string {
    const [y, mo, d] = date.split("-").map(Number);
    const n = new Date();
    return toLocalDateTimeValue(
      new Date(y, mo - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime()
    );
  }

  /**
   * Bir yere kayıt açmak. Nereden gelinirse gelinsin (hızlı ekle şeridi,
   * listeden yaprak, "buraya ekle") aynı yüzey açılıyor — eskiden kimi
   * yerde iki düğmeli bir modül, kimi yerde doğrudan uzun form vardı ve
   * aynı işi yapmanın yolu bulunduğun yere göre değişiyordu.
   */
  function handlePick(sub: SubCategory) {
    setValues({});
    setNotes("");
    setSelectedParallels([]);
    setParallelQueue([]);
    setLockedTypeIds(new Set());
    setOccurredAt(defaultOccurredAt());
    setStep({ type: "add", sub });
  }

  // Üst kategoriye kayıt — gizli kök alt kategorisi üzerinden
  async function handlePickCategory(category: Category) {
    const rootSub = await getOrCreateCategoryRootSub(category.id);
    handlePick(rootSub);
  }

  /** Ekleme yüzeyinden kaydet — girilen değerler varsa onlarla */
  async function handleAddSave() {
    if (saving || step.type !== "add") return;
    setSaving(true);
    try {
      await persistEntry(step.sub.id, formMods, values);
      if (activity) {
        // Aktivite modunda seri giriş: kaydet → seçim adımına dön
        setActivityCount((c) => c + 1);
        setValues({});
        setStep({ type: "pick" });
        return;
      }
      onClose();
      router.push(`/calendar/${date}`);
    } finally {
      setSaving(false);
    }
  }

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

      {/* Girdi yüzeyi — alttan açılan pencere.
          Bir ara tam pencereye çıkmıştı: içindeki ağ yarım sheet'e sığmıyordu,
          kökte ekranın üçte biri boş kalıyordu. Ağ Yapı > Harita'ya taşınınca
          o gerekçe kalmadı; geriye aranabilir bir liste kaldı ve liste
          ekranın tamamını istemiyor. Alttan açılan pencere gün sayfasını
          görünür bırakıyor — nereye kayıt yaptığın kaybolmuyor. */}
      <div
        className={cn(
          // `relative` EKLEME: tailwind-merge onu `fixed` ile çakıştırıp
          // sonuncuyu seçiyor. `fixed` zaten mutlak konumlu çocuklara
          // kapsayıcı blok oluşturur.
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px]",
          "flex flex-col rounded-t-2xl border-t border-white/10 bg-background",
          // Seçim adımında yükseklik İÇERİĞE göre (90vh tavanıyla): kısa bir
          // listede yarısı boş bir yüzey açmak gereksiz.
          //
          // Panel açan adımlarda (ekleme yüzeyi, uzun form) SABİT 90vh.
          // Panel yüzeyin içinde `max-h-[86%]` olarak açılıyor; yüzey
          // içeriğe göre küçükken o yüzde de küçülüyor, panel hem sıkışıyor
          // hem yüzeyin dışına taşıyordu. Yüzdenin anlamlı olması için
          // tabanın sabit olması gerekiyor.
          step.type === "pick" || step.type === "activity-name"
            ? "max-h-[90vh]"
            : "h-[90vh]",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.55)]",
          "transition-transform duration-300 ease-out",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Tutamaç — yüzeyin sürüklenebilir göründüğü yer */}
        <div className="flex shrink-0 justify-center pb-1 pt-2.5">
          <div className="h-[3px] w-10 rounded-full bg-white/15" />
        </div>

        {step.type === "activity-name" ? (
          <ActivityNameStep
            onConfirm={(name) => {
              setActivity({ id: nanoid(12), name });
              setStep({ type: "pick" });
            }}
            onClose={onClose}
          />
        ) : (
          <>
            {/* Liste hep ayakta kalır: "Detay ekle" seçimi değiştirmiyor,
                ÜSTÜNE bir panel açıyor. Böylece kullanıcı nereye kayıt
                yaptığını görmeye devam ediyor ve geri dönünce liste aynı
                yerde (odak EntryPicker'ın içinde tutuluyor). */}
            <PickStep
              key={open ? "open" : "closed"}
              groups={groups}
              onPick={handlePick}
              onPickCategory={handlePickCategory}
              onClose={onClose}
              activity={activity ? { name: activity.name, count: activityCount } : null}
            />

            {step.type !== "pick" && (
              <>
                <div
                  className="absolute inset-0 z-40 bg-black/55 backdrop-blur-[1px]"
                  onClick={handleBack}
                />
                {/* Seçimin üstüne açılan panel — hem ekleme yüzeyi hem
                    uzun form burada. Seçim listesi altta duruyor: kullanıcı
                    nereye kayıt yaptığını görmeye devam ediyor. */}
                <div className="animate-in absolute inset-x-0 bottom-0 z-50 flex max-h-[86%] flex-col rounded-t-3xl border-t border-white/10 bg-background shadow-[0_-8px_40px_rgba(0,0,0,0.6)]">
                  <div className="flex justify-center pt-2.5 pb-0.5 shrink-0">
                    <div className="h-[3px] w-10 rounded-full bg-white/15" />
                  </div>
                  {step.type === "add" ? (
                    <AddEntryPanel
                      key={step.sub.id}
                      name={step.sub.name}
                      icon={step.sub.icon}
                      color={
                        (groups ?? []).find(
                          (g) => g.category.id === step.sub.categoryId
                        )?.category.color ?? "#818cf8"
                      }
                      path={pathOf(step.sub)}
                      mods={formMods}
                      valueOf={(m) => values[valueKey(m)] ?? ""}
                      onChange={(m, v) =>
                        setValues((prev) => ({ ...prev, [valueKey(m)]: v }))
                      }
                      onSave={handleAddSave}
                      saving={saving}
                      onDetail={() => setStep({ type: "form", sub: step.sub })}
                      onClose={handleBack}
                      entryDate={date}
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
            )}
          </>
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
  onPick,
  onPickCategory,
  onClose,
  activity,
}: {
  groups:
    | { category: Category; topSubs: SubCategory[]; allSubs: SubCategory[] }[]
    | undefined;
  /** Bir kaleme kayıt aç — standart ekleme yüzeyi */
  onPick: (sub: SubCategory) => void;
  onPickCategory: (category: Category) => void;
  onClose: () => void;
  /** Aktivite akışında başlık bandı + Bitti butonu */
  activity?: { name: string; count: number } | null;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [addCatOpen, setAddCatOpen] = useState(false);

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
          {/* Başlık sayfanın sahibi: yanındaki eylem düğmesinden büyük
              durmalı, yoksa soru cümlesi yarım kalmış gibi görünüyor */}
          <h2 className="truncate text-lg font-semibold leading-8 tracking-tight">
            {activity ? t("entry.addToActivity") : t("entry.whatToAdd")}
          </h2>
          <p className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
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
          {/* Kategori yaratmak listenin içinde bir satırdı ve seçim alanından
              yer çalıyordu. Her kademede geçerli bir eylem olduğu için yeri
              başlık hizası — ve orada sönük bir çip olarak değil, uygulamanın
              kendi vurgu renginde dolu bir düğme olarak duruyor. */}
          <button
            onClick={() => setAddCatOpen(true)}
            className="flex h-7 shrink-0 items-center gap-0.5 rounded-full bg-primary pl-1.5 pr-2.5 text-[11px] font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-transform active:scale-[0.96]"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
            {t("entry.createCategory")}
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors"
            aria-label={t("action.close")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Kaydırmayı seçicinin kendisi yönetiyor: yol izi ve "buraya ekle"
          üstte sabit kalmalı, yalnız liste kaymalı */}
      {/* `flex-1` YOK: yüzeyin yüksekliği içeriğe göre (max-h ile sınırlı).
          flex-basis:0 veren bir flex-1 burada zinciri çökertiyor ve liste
          alttan kırpılıyordu. Doğru davranış küçülmeyle geliyor: içerik
          sığdığı sürece kutu kadar, taşınca min-h-0 sayesinde kısalıp
          kendi içinde kayıyor. */}
      <div ref={scrollRef} className="flex min-h-0 flex-col">
        {!groups || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-5 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t("tree.noCategoriesYet")}
            </p>
          </div>
        ) : (
          <EntryPicker
            groups={groups}
            onPick={onPick}
            onPickCategory={onPickCategory}
            onClose={onClose}
          />
        )}
      </div>

      <CategoryForm open={addCatOpen} onOpenChange={setAddCatOpen} />
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
