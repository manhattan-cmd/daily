"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Boxes, Check, Link2, ListPlus, MoonStar, PanelLeftClose, PenLine, Plus, Smile, Target, Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";
import {
  listModifiersForTarget,
  createEntry,
  ensureActivity,
  getOrCreateCategoryRootSub,
  listActivityNameSuggestions,
  listRecentModValues,
  createGoal,
  builtInTitle,
  getBuiltInTarget,
  updateGoal,
  deleteGoal,
  stopGoal,
  type CategoryModifierWithType,
  type ModWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import { useT } from "@/lib/i18n";
import { NoteEditorView } from "@/components/forms/note-editor";
import { LedgerField } from "@/components/forms/ledger-field";
import { SmartText } from "@/components/ui/smart-text";
import { EntryTime } from "@/components/forms/entry-time";
import { announceAdded } from "@/lib/added-toast";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { modAtomIcon } from "@/components/structure/mod-atom";
import { modColor } from "@/lib/mod-color";
import { ParallelPickDialog } from "@/components/forms/parallel-pick-dialog";
import { OptionsMenu, PanelBlock } from "@/components/forms/form-options";
import { EntryPicker, useEntryLayout } from "@/components/calendar/entry-picker";
import { EntryTreePicker } from "@/components/calendar/entry-tree-picker";
import { useSkin } from "@/lib/skin";
import { SideFormWindow } from "@/components/calendar/side-form-window";
import { CategoryForm } from "@/components/structure/category-form";
import {
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScaleSlider } from "@/components/ui/scale-slider";
import { SymbolIcon } from "@/lib/icons";
import { cn, toLocalDateTimeValue, toLocalDateValue } from "@/lib/utils";
import { isScaleChoices, type Category, type SubCategory } from "@/types";
import { routes } from "@/lib/routes";
import { useSheetPresence } from "@/lib/use-sheet-presence";
import {
  ENTRY_GROUPS_KEY,
  loadEntryGroups,
  useCachedLiveQuery,
} from "@/lib/db/live-cache";
import {
  GoalPlanFields,
  inkOn,
  planFromGoal,
  planToGoal,
  planValid,
  useModLabel,
  type GoalPlanState,
} from "@/components/goals/goal-plan";
import { daysBetween, shiftRange } from "@/lib/goals";
import { requestReminderPermission, invalidateReminderPlan, syncGoalReminders } from "@/lib/goal-reminders";
import { confirmDialog } from "@/components/ui/confirm";
import type { GoalWithContext } from "@/types";
import { ENTRY_SCREEN } from "@/components/ui/entry-window";
import type { AttachedThing } from "@/lib/db/queries";
import { entrySoundFor, playEntrySound } from "@/lib/sound";
import { collectThings, ThingValuesContext, type ThingVals } from "@/components/forms/thing-ui";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { SheetFrame, useEmbedded } from "@/components/ui/sheet-frame";

/** Değer state anahtarı: global mod id (legacy atamalarda atama id'si) */
/** Sabit boş liste — her çizimde yeni [] bağımlılıkları boşuna tazeliyordu */
const NO_MODS: CategoryModifierWithType[] = [];

const valueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
/** Paralel perspektifler arası taşıma anahtarı: aynı atom = aynı anahtar */
const sharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId ?? m.id;

/** Yalnız bu girdiye (ya da hedefe) eklenen özelliğin form satırı — yapıya bağlanmaz */
function entryModRow(m: ModWithType, subId: string): CategoryModifierWithType {
  return {
    id: `entry-${m.id}`,
    modId: m.id,
    name: m.name,
    targetType: "subcategory",
    targetId: subId,
    order: 9999,
    createdAt: 0,
    updatedAt: 0,
    mod: m,
    entryType: m.entryType,
  };
}

/** Hedefin özelliklerinin form anahtarları (bkz. valueKey) */
function goalKeysOf(goal?: GoalWithContext | null): Set<string> {
  return new Set(
    (goal?.targets ?? []).map((tg) => tg.modId ?? tg.entryTypeId ?? "").filter(Boolean)
  );
}

interface DayEntrySheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
  /** true: sheet aktivite akışıyla açılır — önce isim, sonra seri girdi ekleme */
  activityMode?: boolean;
  /** Var olan aktiviteye girdi eklerken: isim adımı atlanır, doğrudan seri giriş */
  presetActivity?: { id: string; name: string } | null;
  /** Doğrudan bu kalemin formuyla açıl (yapı sayfalarındaki "Girdi ekle") */
  presetSub?: SubCategory | null;
  /** Ekle ekranının sekmesinde (bkz. AddScreen, SheetFrame) */
  embedded?: boolean;
  /**
   * Seçicinin yerine çizilecek liste (Ekle › Hızlı, bkz. QuickPicker): kaleme
   * dokunmak formu açar, formdan dönünce yine bu liste
   */
  picker?: (onPick: (sub: SubCategory) => void) => ReactNode;
  /** Seçici bu kategoriyi açık getirsin (Hızlı'daki kategoriler); n her dokunuşta yeni */
  focusCategory?: { id: string; n: number } | null;
  /**
   * HEDEF: aynı seçici ve form, kayıt "yaptım" değil "yapacağım". Form
   * özelliklerin altında zamanı (bir gün / tekrar) ve hatırlatmayı sorar;
   * Ekle bir hedef kurar (bkz. lib/goals, components/goals).
   */
  goalMode?: boolean;
  /** Var olan hedefi düzenle: form onun değerleri ve zamanıyla açılır */
  editGoal?: GoalWithContext | null;
  /**
   * Hedefi YAP ("Yaptım"): form hedefin yalnız kendi özellikleriyle açılır,
   * planlanan değerler dolu, boş bırakılanlar o an sorulur. Kayıt hedefin
   * bu gününe bağlanır; düğmenin adı "Yaptım".
   */
  doneGoal?: { goal: GoalWithContext; date: string } | null;
}

type Step =
  | { type: "activity-name" }
  | { type: "pick" }
  | { type: "form"; sub: SubCategory }
  | { type: "parallel-form"; sub: SubCategory; catName: string; queueIndex: number; queueTotal: number; groupId: string; carryover: Record<string, string> };

/** Günün tarihi + şu anki saat ("YYYY-MM-DDTHH:mm") */
function nowOnDay(date: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const n = new Date();
  return toLocalDateTimeValue(new Date(y, mo - 1, d, n.getHours(), n.getMinutes(), 0, 0).getTime());
}

/**
 * Yalnız açıkken (ve kapanış animasyonu boyunca) DOM'da — kapalıyken
 * içerik ve canlı sorgular hiç kurulmaz (bkz. useSheetPresence).
 */
export function DayEntrySheet(props: DayEntrySheetProps) {
  const { mounted, visible } = useSheetPresence(props.open);
  return mounted ? <DayEntrySheetBody {...props} open={visible} /> : null;
}

function DayEntrySheetBody({
  date,
  open,
  onClose,
  activityMode,
  presetActivity,
  presetSub,
  embedded,
  picker,
  focusCategory,
  goalMode: goalModeProp,
  editGoal,
  doneGoal,
}: DayEntrySheetProps) {
  const router = useRouter();
  const goalMode = !!goalModeProp || !!editGoal;
  // Hedefin zamanı — bir gün / tekrar ve hatırlatma (bkz. GoalPlanFields)
  const [plan, setPlan] = useState<GoalPlanState>(() =>
    planFromGoal(editGoal ?? undefined, date < toLocalDateValue() ? toLocalDateValue() : date)
  );
  const t = useT();
  // Raf görünümünde form eskisi gibi bütün yüzeyi kaplar; rayda soldan pencere
  const layout = useEntryLayout();
  const [step, setStep] = useState<Step>({ type: "pick" });
  const [values, setValues] = useState<Record<string, string>>({});
  // "Hangi araba"da seçilen nesnelerin formda yazılan özellikleri (Mevcut km)
  const [thingVals, setThingVals] = useState<ThingVals>({});
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
      // Temizlenmeli: pencere artık ilk karede kapalı konumda kuruluyor
      // (useSheetPresence); temizlenmeyen zamanlayıcı açılıştan 300 ms sonra
      // formu — ör. aktivite akışının ilk adımını — sıfırlıyordu
      const t = setTimeout(() => {
        setStep({ type: "pick" });
        setValues({});
        setNotes("");
        setSelectedParallels([]);
        setParallelQueue([]);
        setLockedTypeIds(new Set());
        setActivity(null);
        setActivityCount(0);
      }, 300);
      return () => clearTimeout(t);
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
      } else if (editGoal) {
        openGoalForEdit(editGoal);
      } else if (doneGoal) {
        openGoalForDone(doneGoal.goal);
      } else if (presetSub) {
        setOccurredAt(nowOnDay(date));
        setStep({ type: "form", sub: presetSub });
      }
    }
  }

  // Başka sekmeden bir kategori istendi: açık form kapanır, seçici o kategoride
  const [seenFocus, setSeenFocus] = useState(focusCategory);
  if (focusCategory !== seenFocus) {
    setSeenFocus(focusCategory);
    if (focusCategory && step.type !== "pick" && step.type !== "activity-name") leaveForm();
  }

  // Önbellekli: pencere açılır açılmaz liste dolu gelsin (bkz. live-cache)
  const groups = useCachedLiveQuery(ENTRY_GROUPS_KEY, loadEntryGroups);
  // Hedefte uyku ve ruh hali de kurulabilir ("her sabah uykunu gir"); onlar
  // seçicinin listesinde değil, bandın üstünde kendi düğmeleriyle
  const builtIns =
    useLiveQuery(async () => {
      if (!goalMode) return [];
      const found = await Promise.all(
        (["sleep", "mood"] as const).map(async (key) => {
          const f = await getBuiltInTarget(key);
          return f ? { key, sub: f.sub, category: f.category } : null;
        })
      );
      return found.filter((x): x is NonNullable<typeof x> => !!x);
    }, [goalMode]) ?? [];
  const categoryOf = (sub: SubCategory) =>
    (groups ?? []).find((g) => g.category.id === sub.categoryId)?.category ??
    builtIns.find((b) => b.category.id === sub.categoryId)?.category;

  const currentSubId =
    step.type === "form" || step.type === "parallel-form" ? step.sub.id : "";

  // Modifier'ları canlı izle — hem ana hem paralel form için
  const formMods = useLiveQuery(
    async () => {
      if (!currentSubId) return [];
      return listModifiersForTarget("subcategory", currentSubId);
    },
    [currentSubId]
  ) ?? NO_MODS;

  /*
   * GİRDİYE ÖZEL özellikler. Girdi eklerken "Özellik ekle" yapıya dokunmuyor:
   * seçilenler yalnız bu formda durur, değerleri kayda yazılır (havuz
   * modunun kimliğiyle — analiz onları yine tanır), kalem bir dahaki açılışta
   * yapıdaki haliyle gelir. Çarpı da aynı ölçüde: kalemin bir özelliğini
   * yalnız bu girdi için gizler. Kalıcı değişiklik Yapı'dan yapılır.
   * Kalem değişince (başka kalem, sıradaki perspektif, seçime dönüş) sıfırlanır.
   */
  const [extraMods, setExtraMods] = useState<CategoryModifierWithType[]>([]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  /*
   * Hedefi YAPARKEN form yalnız hedefin kendi özellikleriyle açılır (kalemin
   * öteki özellikleri gelmez; istenirse "Özellik ekle" ile eklenir). Seçili
   * olanlar burada. Hedef kurarken form girdi formunun aynısı.
   */
  const planGoal = editGoal ?? doneGoal?.goal ?? null;
  const pickFeatures = !!doneGoal;
  const [goalPicked, setGoalPicked] = useState<Set<string>>(() => goalKeysOf(planGoal));
  const [extrasFor, setExtrasFor] = useState(currentSubId);
  if (extrasFor !== currentSubId) {
    setExtrasFor(currentSubId);
    setExtraMods([]);
    setHiddenKeys(new Set());
    setGoalPicked(planGoal && planGoal.subcategoryId === currentSubId ? goalKeysOf(planGoal) : new Set());
  }
  // Hedefin, kaleme takılı olmayan özellikleri (hedefe özel eklenmiş)
  const goalExtras = useMemo(() => {
    if (!planGoal || planGoal.subcategoryId !== currentSubId) return [];
    return planGoal.targets
      .filter((tg) => tg.mod)
      .map((tg) => entryModRow({ ...tg.mod!, entryType: tg.entryType }, currentSubId));
  }, [planGoal, currentSubId]);
  const activeMods = useMemo(() => {
    const picked = (m: CategoryModifierWithType) => !pickFeatures || goalPicked.has(valueKey(m));
    const base = formMods.filter((m) => !hiddenKeys.has(valueKey(m)) && picked(m));
    const seen = new Set(base.map(valueKey));
    const extras = [...goalExtras.filter(picked), ...extraMods].filter((m) => {
      if (seen.has(valueKey(m)) || hiddenKeys.has(valueKey(m))) return false;
      seen.add(valueKey(m));
      return true;
    });
    return [...base, ...extras];
  }, [formMods, extraMods, goalExtras, hiddenKeys, pickFeatures, goalPicked]);
  function addEntryMods(picked: ModWithType[]) {
    if (pickFeatures)
      setGoalPicked((prev) => {
        const next = new Set(prev);
        picked.forEach((m) => next.add(m.id));
        return next;
      });
    const attachedIds = new Set(formMods.map((m) => m.modId));
    const unhide: string[] = [];
    const extras: CategoryModifierWithType[] = [];
    for (const m of picked) {
      // Kalemin kendi özelliği gizlenmişse geri gelir, kopyası açılmaz
      if (attachedIds.has(m.id)) unhide.push(m.id);
      else extras.push(entryModRow(m, currentSubId));
    }
    if (unhide.length)
      setHiddenKeys((prev) => {
        const next = new Set(prev);
        unhide.forEach((id) => next.delete(id));
        return next;
      });
    if (extras.length) setExtraMods((prev) => [...prev, ...extras]);
    setValues((prev) => {
      const next = { ...prev };
      for (const m of picked)
        if (!(m.id in next))
          next[m.id] = m.entryType.valueType === "boolean" ? "false" : "";
      return next;
    });
  }

  function removeEntryMod(mod: CategoryModifierWithType) {
    const key = valueKey(mod);
    if (mod.id.startsWith("entry-") && extraMods.some((m) => m.id === mod.id))
      setExtraMods((prev) => prev.filter((m) => m.id !== mod.id));
    // Hedefi yaparken: hedefin özelliğini bu kayıttan çıkar
    else if (pickFeatures && goalPicked.has(key))
      setGoalPicked((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    else setHiddenKeys((prev) => new Set(prev).add(key));
    // Değeri de bırakma — gizlenen özellik kayda yazılmasın
    setValues((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

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

  /** Var olan hedefin formu: değerleri, notu ve zamanıyla */
  function openGoalForEdit(goal: GoalWithContext) {
    const vals: Record<string, string> = {};
    for (const tg of goal.targets) {
      const key = tg.modId ?? tg.entryTypeId;
      if (key) vals[key] = tg.targetValue;
    }
    setValues(vals);
    setThingVals({});
    setNotes(goal.note ?? "");
    setPlan(planFromGoal(goal, goal.date));
    setOccurredAt(nowOnDay(goal.date));
    setStep({ type: "form", sub: goal.subcategory });
  }

  /**
   * Hedefi yap: formda hedefin özellikleri planlanan değerleriyle, zaman
   * şimdi (hedefin gününde). Tekrar eden hedefte saat aralıkları o güne taşınır.
   */
  function openGoalForDone(goal: GoalWithContext) {
    const vals: Record<string, string> = {};
    for (const tg of goal.targets) {
      const key = tg.modId ?? tg.entryTypeId;
      if (!key) continue;
      vals[key] =
        goal.repeat && tg.targetValue && tg.entryType.valueType === "datetime-range"
          ? shiftRange(tg.targetValue, daysBetween(goal.date, date))
          : tg.targetValue;
    }
    setValues(vals);
    setThingVals({});
    setNotes(goal.note ?? "");
    setOccurredAt(nowOnDay(date));
    setStep({ type: "form", sub: goal.subcategory });
  }

  /** Hedefi kur ya da düzenlemeyi kaydet */
  async function saveGoal(sub: SubCategory) {
    const targets = activeMods
      .map((m) => ({ modId: m.modId, entryTypeId: m.modId ? undefined : m.entryTypeId, targetValue: values[valueKey(m)] ?? "" }))
      // Evet/hayır özelliğinin boş hali "false" — hedefte "seçilmedi" demek
      .filter((tg) => tg.targetValue !== "" && tg.targetValue !== "false");
    const when = planToGoal(plan);
    const patch = {
      date: when.date,
      repeat: when.repeat,
      remindAt: when.remindAt,
      targets,
      note: notes.trim() || undefined,
    };
    if (editGoal) await updateGoal(editGoal.id, patch);
    else await createGoal({ subcategoryId: sub.id, ...patch });
    playEntrySound("plan");
    // Hatırlatma açıldıysa izin tam şimdi istenir; verilince plan kurulur
    if (when.remindAt) {
      void requestReminderPermission().then(() => {
        invalidateReminderPlan();
        void syncGoalReminders();
      });
    }
    onClose();
    if (!editGoal) router.push(routes.day(when.date));
  }

  async function handleGoalDelete() {
    if (!editGoal) return;
    const recurring = !!editGoal.repeat;
    const ok = await confirmDialog({
      title: t(recurring ? "goal.stopConfirm" : "confirm.deleteGoal"),
      body: t(recurring ? "goal.stopConfirmBody" : "goal.deleteKeepsEntries"),
      confirmLabel: t(recurring ? "goal.stop" : "goal.delete"),
      destructive: !recurring,
    });
    if (!ok) return;
    if (recurring) await stopGoal(editGoal.id);
    else await deleteGoal(editGoal.id);
    onClose();
  }

  async function handleGoalDeleteAll() {
    if (!editGoal) return;
    const ok = await confirmDialog({
      title: t("confirm.deleteGoal"),
      body: t("goal.deleteKeepsEntries"),
      confirmLabel: t("goal.delete"),
      destructive: true,
    });
    if (!ok) return;
    await deleteGoal(editGoal.id);
    onClose();
  }

  /**
   * Bir yere kayıt açmak. Nereden gelinirse gelinsin (hızlı ekle şeridi,
   * listeden yaprak, "buraya ekle") aynı yüzey açılıyor — eskiden kimi
   * yerde iki düğmeli bir modül, kimi yerde doğrudan uzun form vardı ve
   * aynı işi yapmanın yolu bulunduğun yere göre değişiyordu. Yüzey uzun
   * formun kendisi: atomlu ayrı bir pencere denendi ve neyin ne olduğu
   * anlaşılmıyordu — formda her ölçü kendi başlığı ve alanıyla duruyor.
   */
  function handlePick(sub: SubCategory) {
    setValues({});
    setThingVals({});
    setNotes("");
    setSelectedParallels([]);
    setParallelQueue([]);
    setLockedTypeIds(new Set());
    setOccurredAt(defaultOccurredAt());
    setStep({ type: "form", sub });
  }

  // Üst kategoriye kayıt — gizli kök alt kategorisi üzerinden
  async function handlePickCategory(category: Category) {
    const rootSub = await getOrCreateCategoryRootSub(category.id);
    handlePick(rootSub);
  }


  async function persistEntry(
    subId: string,
    mods: CategoryModifierWithType[],
    vals: Record<string, string>,
    groupId?: string,
    entryNotes?: string,
    withThings?: AttachedThing[],
    goalId?: string
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
    return createEntry({
      subcategoryId: subId,
      typeValues,
      occurredAt: ts,
      notes: (entryNotes ?? notes).trim() || undefined,
      linkedGroupId: groupId,
      activityId: activity?.id,
      things: withThings,
      goalId,
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
      router.push(routes.day(date));
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

  /** Kayıttan sonra pencerenin altında kısa bir "eklendi" bandı */
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    if (!toast) return;
    const tm = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(tm);
  }, [toast]);

  /** Girdi sesi kategoriye göre: ruh hali ve uyku kendi sesiyle, gerisi ortak */
  const soundFor = (categoryId: string) =>
    entrySoundFor((groups ?? []).find((g) => g.category.id === categoryId)?.category.builtInKey);

  /** stay: kaydet ve seçiciye dön, pencere kapanmasın (seri giriş) */
  async function handleFormSave(stay = false) {
    setSaving(true);
    try {
      if (goalMode && step.type === "form") {
        await saveGoal(step.sub);
        return;
      }
      // Hedef yapıldı: kayıt hedefin bu gününe bağlanır; kart kutlar, sayfa değişmez
      if (doneGoal && step.type === "form") {
        const things = collectThings(
          activeMods.map((m) => ({ valueType: m.entryType.valueType, value: values[valueKey(m)] })),
          thingVals
        );
        await persistEntry(step.sub.id, activeMods, values, undefined, undefined, things, doneGoal.goal.id);
        playEntrySound("goal");
        onClose();
        return;
      }
      if (step.type === "form") {
        const groupId = selectedParallels.length > 0 ? nanoid(12) : undefined;
        const things = collectThings(
          activeMods.map((m) => ({ valueType: m.entryType.valueType, value: values[valueKey(m)] })),
          thingVals
        );
        const created = await persistEntry(step.sub.id, activeMods, values, groupId, undefined, things);
        // O günün bekleyen hedefine bağlandıysa hedefin sesi (bkz. autoLinkGoal)
        playEntrySound(created.goalId ? "goal" : soundFor(step.sub.categoryId));
        setThingVals({});
        if (stay && !activity && selectedParallels.length === 0) {
          const group = (groups ?? []).find((g) => g.category.id === step.sub.categoryId);
          setToast(
            t("entry.added", {
              name: step.sub.isCategoryRoot ? (group?.category.name ?? step.sub.name) : step.sub.name,
            })
          );
          setValues({});
          setNotes("");
          setStep({ type: "pick" });
          return;
        }
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
            toSharedKeyed(activeMods, values)
          );
        } else {
          // Sayfada "Eklendi · Geri al" (yalnız Brütal temada çizilir)
          const group = (groups ?? []).find((g) => g.category.id === step.sub.categoryId);
          announceAdded(
            created.id,
            step.sub.isCategoryRoot ? (group?.category.name ?? step.sub.name) : step.sub.name,
            Date.now()
          );
          onClose();
          router.push(routes.day(date));
        }
      } else if (step.type === "parallel-form") {
        await persistEntry(step.sub.id, activeMods, values, step.groupId, notes);
        playEntrySound(soundFor(step.sub.categoryId));
        const accumulated = { ...step.carryover, ...toSharedKeyed(activeMods, values) };
        await advanceToNextParallel(parallelQueue, step.groupId, step.queueIndex, step.queueTotal, accumulated);
      }
    } finally {
      setSaving(false);
    }
  }

  /** Kalemin üstündeki yol: kategori › üst dallar (kalemin kendisi hariç) */
  function pathLabelFor(sub: SubCategory): string {
    const group = (groups ?? []).find((g) => g.category.id === sub.categoryId);
    if (!group) return "";
    if (sub.isCategoryRoot) return t("entry.general");
    const byId = new Map(group.allSubs.map((x) => [x.id, x]));
    const parts: string[] = [];
    let cur = sub.parentId ? byId.get(sub.parentId) : undefined;
    while (cur) {
      parts.unshift(cur.name);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return [group.category.name, ...parts].join(" › ");
  }

  function handleBack() {
    if (editGoal || doneGoal) {
      onClose();
      return;
    }
    if (step.type === "parallel-form") {
      advanceToNextParallel(parallelQueue, step.groupId, step.queueIndex, step.queueTotal, step.carryover);
      return;
    }
    leaveForm();
  }

  /** Formu kapatıp seçiciye dön (raya dokunmak da bunu yapar) */
  function leaveForm() {
    setStep({ type: "pick" });
    setValues({});
    setNotes("");
    setLockedTypeIds(new Set());
    setSelectedParallels([]);
    setParallelQueue([]);
  }

  const surface = (
        /* Yüzey aşağıdan yaylanarak gelir. Üst güvenli alan (durum çubuğu)
           burada; içteki katmanlar (form, not) bunun altında kalır. Ekle
           ekranının sekmesindeyken yüzey ekranın gövdesi: animasyon, güvenli
           alan ve köşeler ekranın kendisinde. */
        <div
          className={
            embedded
              ? "relative flex h-full min-h-0 flex-1 flex-col overflow-hidden"
              : "entry-screen-in flex h-full min-h-0 flex-col overflow-hidden bg-background md:rounded-[3rem]"
          }
          style={embedded ? undefined : { paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
        <div className="relative flex min-h-0 flex-1 flex-col">
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
            {goalMode && !editGoal && (
              <GoalPickBand
                builtIns={builtIns.map((b) => ({ key: b.key, label: builtInTitle(b.category) ?? b.sub.name, onPick: () => handlePick(b.sub) }))}
              />
            )}
            {editGoal || doneGoal ? null : picker ? (
              picker(handlePick)
            ) : (
            <PickStep
              key={open ? "open" : "closed"}
              groups={groups}
              onPick={handlePick}
              onPickCategory={handlePickCategory}
              onClose={onClose}
              activity={activity ? { name: activity.name, count: activityCount } : null}
              compact={layout === "ray" && step.type !== "pick"}
              onRailNavigate={leaveForm}
              focus={focusCategory}
              goalMode={goalMode}
            />
            )}

            {step.type !== "pick" && (
              <>
                {/* Form SOLDAN bir pencere olarak gelir ve rayın yanında
                    durur: ray simgelere daralıp sağda kalır, nereden
                    geldiğin görünür; raya dokunmak formu kapatıp oraya
                    gider. Sola kaydır: kapat, yukarı çek: tam ekran. */}
                <ThingValuesContext.Provider
                  value={{
                    get: (tid, mid) => thingVals[tid]?.[mid],
                    set: (tid, mid, v) =>
                      setThingVals((prev) => ({ ...prev, [tid]: { ...prev[tid], [mid]: v } })),
                    entryDate: date,
                  }}
                >
                <FormFrame
                  layout={picker || editGoal || doneGoal ? "raf" : layout}
                  key={step.sub.id}
                  onDismiss={editGoal || doneGoal ? onClose : leaveForm}
                >
                  <FormStep
            key={step.sub.id}
            sub={step.sub}
            category={categoryOf(step.sub)}
            pathLabel={pathLabelFor(step.sub)}
            mods={activeMods}
            onAddMods={addEntryMods}
            onRemoveMod={removeEntryMod}
            currentCategoryId={step.sub.categoryId}
            hideParallels={!!activity || goalMode || !!doneGoal}
            confirmGoal={!!doneGoal}
            goal={
              goalMode
                ? {
                    plan,
                    onPlanChange: setPlan,
                    editing: !!editGoal,
                    recurring: !!editGoal?.repeat,
                    onDelete: handleGoalDelete,
                    onDeleteAll: handleGoalDeleteAll,
                  }
                : undefined
            }
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
            onSave={() => handleFormSave()}
            onSaveStay={() => handleFormSave(true)}
            saving={saving}
            entryDate={date}
                  />
                </FormFrame>
                </ThingValuesContext.Provider>
              </>
            )}
          </>
        )}
        </div>
        {toast && (
          <div
            role="status"
            className="animate-in fade-in slide-in-from-bottom-2 pointer-events-none absolute inset-x-0 bottom-0 z-[60] flex justify-center px-4"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <span data-stay-toast="" className="flex items-center gap-2 rounded-full bg-foreground px-4 py-2.5 text-[13px] font-semibold text-background shadow-lg">
              <Check className="h-4 w-4" strokeWidth={3} />
              {toast}
            </span>
          </div>
        )}
        </div>
  );

  if (embedded) {
    return (
      <SheetFrame embedded open={open} onClose={onClose}>
        {surface}
      </SheetFrame>
    );
  }
  return (
    /* Tam ekran girdi ekleme (bkz. ENTRY_SCREEN). Kendi kapatma düğmesi üst
       çubukta — standart çarpı gizli. */
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent hideClose aria-describedby={undefined} className={ENTRY_SCREEN}>
        <DialogTitle className="sr-only">
          {t(doneGoal ? "goal.markComplete" : goalMode ? (editGoal ? "goal.edit" : "goal.add") : "home.addEntry")}
        </DialogTitle>
        {surface}
      </DialogContent>
    </Dialog>
  );
}

/** Formun kabı: rayda soldan kayan pencere, rafta bütün yüzeyi kaplayan sayfa */
function FormFrame({
  layout,
  onDismiss,
  children,
}: {
  layout: "ray" | "raf";
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  if (layout === "ray")
    return <SideFormWindow onDismiss={onDismiss}>{children}</SideFormWindow>;
  return (
    <div data-form-page="" className="entry-push absolute inset-0 z-50 flex flex-col bg-background">
      {children}
    </div>
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
  const embedded = useEmbedded();
  const [name, setName] = useState("");
  const suggestions = useLiveQuery(() => listActivityNameSuggestions(), []) ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) onConfirm(name.trim());
  }

  return (
    <>
      {/* Seçicinin üst çubuğu ve büyük başlığıyla aynı düzen */}
      {!embedded && (
      <div className="flex shrink-0 items-center px-4 pb-1 pt-3">
        <button
          onClick={onClose}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--sf-2)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95"
          aria-label={t("action.close")}
        >
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
      )}
      <div className={cn("entry-stagger shrink-0 px-5 pb-5", embedded ? "pt-5" : "pt-2")}>
        <h2 className="text-[28px] font-bold leading-tight tracking-tight">
          Yeni Aktivite
        </h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Farklı kategorilerden girdileri tek çatı altında topla
        </p>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10 pt-1">
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
            className="h-12 rounded-2xl text-base"
          />
          <Button type="submit" size="lg" className="h-12 rounded-2xl" disabled={!name.trim()}>
            Devam →
          </Button>
        </form>
      </div>
    </>
  );
}

// ─── Goal Pick Band ──────────────────────────────────────────────────────────

/**
 * Hedef kurarken seçicinin üstü: burada seçilen şey yapılacak olan. Seçici
 * girdininkiyle aynı; tek fark bu soru.
 */
function GoalPickBand({
  builtIns,
}: {
  /** Uyku ve ruh hali: seçicinin listesinde yoklar, burada kendi düğmeleri */
  builtIns: { key: "sleep" | "mood"; label: string; onPick: () => void }[];
}) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  return (
    <div
      data-goal-band=""
      className={cn(
        "flex shrink-0 flex-col gap-2.5 px-4 py-3",
        brutal ? "border-b-[3px] border-[#111] bg-[#ffd23f] text-[#111]" : "border-b border-[var(--ln-1)]"
      )}
    >
    <div className="flex items-center gap-3">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          brutal ? "border-2 border-[#111] bg-white" : "bg-amber-400/15 text-amber-400"
        )}
      >
        <Target className="h-[18px] w-[18px]" strokeWidth={2.4} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-[16px] font-bold tracking-tight">{t("goal.pickTitle")}</div>
        <div className={cn("text-[12px]", brutal ? "text-[#111]/70" : "text-muted-foreground")}>{t("goal.pickHint")}</div>
      </div>
    </div>
      {builtIns.length > 0 && (
        <div className="flex gap-2">
          {builtIns.map((b) => {
            const Icon = b.key === "sleep" ? MoonStar : Smile;
            const color = b.key === "sleep" ? "#c9b8ff" : "#ff8fab";
            return (
              <button
                key={b.key}
                type="button"
                data-goal-builtin={b.key}
                onClick={b.onPick}
                className={cn(
                  "flex h-10 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-bold transition-transform active:scale-[0.97]",
                  brutal ? "border-2 border-[#111] text-[#111] shadow-[2px_2px_0_#111]" : "bg-[var(--sf-2)]"
                )}
                style={brutal ? { background: color } : undefined}
              >
                <Icon className="h-4 w-4" strokeWidth={2.4} style={brutal ? undefined : { color }} />
                {b.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pick Step ───────────────────────────────────────────────────────────────

function PickStep({
  groups,
  onPick,
  onPickCategory,
  onClose,
  activity,
  compact,
  onRailNavigate,
  focus,
  goalMode,
}: {
  /** Hedef kuruluyor: seçicinin başlığı ve arama yazısı ona göre */
  goalMode?: boolean;
  groups:
    | { category: Category; topSubs: SubCategory[]; allSubs: SubCategory[] }[]
    | undefined;
  /** Bu kategori açık gelsin (bkz. DayEntrySheet focusCategory) */
  focus?: { id: string; n: number } | null;
  /** Form yandan açık — seçici rayı daraltır */
  compact?: boolean;
  onRailNavigate?: () => void;
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
  // Brütalde raf düzeni Yapı'nın ağacıyla (bkz. EntryTreePicker); ray ve sade temalar eskisi
  const skin = useSkin();
  const layout = useEntryLayout();
  const tree = skin === "brutal" && layout === "raf";

  return (
    <>
      {/* Yüzeyin kendi başlık satırı YOK: sayfanın başlığı bulunulan yerin
          adı ve onu seçici biliyor — kapatma düğmesi de oraya taşındı ki
          başlıkla aynı hizada dursun. Burada kalan tek şey aktivite bandı:
          o akışta hangi aktiviteye eklendiğini ve bitirme yolunu söylüyor. */}
      {activity && (
        <div className="flex shrink-0 items-center justify-between gap-2 px-5 pb-1.5 pt-4">
          <div className="flex min-w-0 items-center gap-1.5">
            <Boxes className="h-3 w-3 shrink-0 text-cyan-400" />
            <span className="truncate text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80">
              {activity.name}
              {activity.count > 0 && ` · ${activity.count} girdi eklendi`}
            </span>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 shrink-0 items-center rounded-full border border-cyan-500/40 bg-cyan-500/15 px-3 text-xs font-semibold text-cyan-300 transition-colors hover:bg-cyan-500/25"
          >
            Bitti
          </button>
        </div>
      )}

      {/* Gövdenin penceresi seçicinin İÇİNDE kuruluyor: yol izi pencerenin
          üstünde durmalı ve her kademede aynı yerde kalmalı.

          Kaydırmayı seçicinin kendisi yönetiyor: yol izi ve "buraya ekle"
          üstte sabit kalmalı, yalnız liste kaymalı.

          `flex-1` VAR: yüzey artık sabit 90vh, o yüzden kalan boşluğu
          doldurmak doğru — pencere kısa listede de aynı boyda duruyor.
          (İçeriğe göre büyüyen bir yüzeyde bu yanlıştı: flex-basis:0
          zinciri çökertip listeyi alttan kırpıyordu.) */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col">
        {/* Kategori yokken de seçici çiziliyor: "hiç kategori yok" mesajı
            zaten onun içinde ve asıl önemlisi başlık satırı orada — kapatma
            ve "Kategori yarat" düğmeleri o satırda. Ayrı bir boş-durum
            bloğu koyunca sıfır kategorili kullanıcı çıkışsız kalıyordu. */}
        {tree ? (
          <EntryTreePicker
            groups={groups}
            onPick={onPick}
            onPickCategory={onPickCategory}
            onClose={onClose}
            focus={focus}
            searchPlaceholder={goalMode ? t("goal.searchPlaceholder") : undefined}
          />
        ) : (
          <EntryPicker
            title={goalMode ? t("goal.listTitle") : undefined}
            groups={groups}
            onPick={onPick}
            onPickCategory={onPickCategory}
            onClose={onClose}
            onCreateCategory={() => setAddCatOpen(true)}
            compact={compact}
            onRailNavigate={onRailNavigate}
            focus={focus}
          />
        )}
      </div>

      <CategoryForm open={addCatOpen} onOpenChange={setAddCatOpen} />
    </>
  );
}

// ─── Form Step ───────────────────────────────────────────────────────────────



/** Menüden açılan bölümler — aynı anda yalnız biri açık kalır */
type Panel = "parallel";

const NO_RECENT: Record<string, string[]> = {};

/**
 * Girdi formu — AÇIK DEFTER.
 *
 * Başlık seçicinin diliyle: kategorinin renginde karo, kalemin adı, üstte
 * yolu. Altında zaman çipleri. Gövde kalemin özellikleri: hepsi açık, alt
 * alta; başlık karosundan inen bir ip onları kaleme bağlar (raydaki ipin
 * aynısı). Not ve "özellik ekle" ikinci planda, küçük. Altta kategorinin
 * renginde Ekle ve yanında "ekle ve devam et" (pencere kapanmadan seçiciye
 * döner — akşam üç harcamayı peş peşe girmek için).
 */
function FormStep({
  sub,
  category,
  pathLabel,
  mods,
  onAddMods,
  onRemoveMod,
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
  onSaveStay,
  saving,
  entryDate,
  goal,
  confirmGoal,
}: {
  /** Hedef yapılıyor: düğmenin adı "Yaptım", seri kayıt yok */
  confirmGoal?: boolean;
  /** Hedef hali: zaman çipi yerine "Hedef" işareti, özelliklerin altında
   *  Ne zaman / Hatırlat, Ekle yerine "Hedefi kur" */
  goal?: {
    plan: GoalPlanState;
    onPlanChange: (p: GoalPlanState) => void;
    editing: boolean;
    recurring: boolean;
    onDelete: () => void;
    onDeleteAll: () => void;
  };
  sub: SubCategory;
  category?: Category;
  /** Kalemin üstündeki yol — "Harcamalar › Yemek" */
  pathLabel?: string;
  mods: CategoryModifierWithType[];
  /** Girdiye özel özellik ekle — yapıya bağlanmaz */
  onAddMods: (mods: ModWithType[]) => void;
  /** Özelliği yalnız bu girdi için kaldır */
  onRemoveMod: (mod: CategoryModifierWithType) => void;
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
  /** Kaydet ve seçiciye dön — pencere açık kalır */
  onSaveStay?: () => void;
  saving: boolean;
  entryDate: string;
}) {
  const t = useT();
  const modLabel = useModLabel();
  const [modPickerOpen, setModPickerOpen] = useState(false);
  const [parallelPickerOpen, setParallelPickerOpen] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  // Seçiciden yeni eklenen özellik — alanı görünüme kaydırıp odaklarız
  const [focusModId, setFocusModId] = useState<string | null>(null);
  const togglePanel = (p: Panel) => setPanel((cur) => (cur === p ? null : p));
  const recent = useLiveQuery(() => listRecentModValues(sub.id), [sub.id]) ?? NO_RECENT;

  const showParallelOption = !parallelContext && !hideParallels;
  const hasParallelSelected = selectedParallels.length > 0;

  /** Bu sayfanın rengi — paralel perspektifte mor, yoksa kalemin kategorisi */
  const accent = parallelContext ? "#7c3aed" : category?.color ?? "#6366f1";
  const itemName =
    (category && builtInTitle(category)) ?? (sub.isCategoryRoot ? (category?.name ?? sub.name) : sub.name);
  const topLine = category?.isBuiltIn
    ? ""
    : parallelContext
    ? `${parallelContext.catName}${parallelContext.total > 1 ? ` · ${parallelContext.index}/${parallelContext.total}` : ""}`
    : activityName ?? pathLabel ?? category?.name ?? "";

  const builtInKey = category?.isBuiltIn ? category.builtInKey ?? "sleep" : undefined;
  const skin = useSkin();
  // Ruh hali hedefinde değer önceden kurulmaz: nasıl hissettiğin o an sorulur
  const moodGoal = !!goal && builtInKey === "mood";
  const saveLabel = saving
    ? t("entry.saving")
    : confirmGoal
      ? t("goal.confirm")
      : goal
      ? t(goal.editing ? "action.save" : "goal.create")
      : parallelContext
      ? parallelContext.index < parallelContext.total
        ? t("action.saveAndContinue")
        : t("entry.addNow")
      : hasParallelSelected
        ? t("action.saveAndContinue")
        : t("entry.addNow");
  const canStay = !goal && !confirmGoal && !!onSaveStay && !parallelContext && !hasParallelSelected && !activityName;
  const saveDisabled = saving || (!!goal && !planValid(goal.plan));

  /** Özellik alanları — başlık karosundan inen iple, sonunda "Özellik ekle" */
  const ledgerStack = () => (
    <div data-ledger-stack="" className="relative ml-[20px] flex flex-col gap-2 pl-3">
      {/* İp — başlık karosundan iner, özellikleri kaleme bağlar */}
      <span
        aria-hidden
        data-rope=""
        className="absolute -top-14 bottom-4 left-0 w-[2px] -translate-x-1/2 rounded-full"
        style={{ background: `${accent}59` }}
      />
      {mods.map((mod) => (
        <LedgerField
          key={mod.id}
          mod={mod}
          label={modLabel(mod.name ?? mod.entryType.name)}
          icon={modAtomIcon(mod)}
          color={modColor(mod.mod ?? { name: mod.name ?? mod.entryType.name })}
          value={values[valueKey(mod)] ?? ""}
          onChange={(v) => onValueChange(valueKey(mod), v)}
          recent={recent[mod.modId ?? mod.entryTypeId ?? ""] ?? []}
          isLocked={lockedTypeIds.has(sharedKey(mod))}
          entryDate={entryDate}
          entryOnly={mod.id.startsWith("entry-")}
          dense={mods.length >= 5}
          onRemove={() => onRemoveMod(mod)}
          autoFocus={mod.modId === focusModId}
        />
      ))}
      {/* Bu girdiye özellik ekle — alanların sonunda, sessiz */}
      <button
        type="button"
        data-add-feature=""
        onClick={() => setModPickerOpen(true)}
        className="flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-[var(--sf-2)] hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        {t("entry.addFeature")}
      </button>
    </div>
  );

  return (
    <>
      {/* Pencerenin tepesinde kategorinin renginde ışık — form kalemin
          rengini taşısın; düz siyah zemin "karanlık, renksiz" duruyordu.
          z -1: pencerenin zemininin üstünde, içeriğin altında. */}
      <div
        aria-hidden
        data-glow=""
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72"
        style={{
          background: `radial-gradient(120% 90% at 15% 0%, ${accent}40 0%, ${accent}14 45%, transparent 75%)`,
        }}
      />
      {/* Başlık bandı — Brütal temada kalemin renginde dolu bant (bkz. globals.css) */}
      <div data-entry-hero="" className="shrink-0 pt-3" style={{ ["--hero-c" as string]: accent }}>
      {/* Başlık — kalemin karosu, yolu ve adı; bütün genişlik onun */}
      {/* items-start: zaman seçenekleri açılınca sütun uzar, karo yerinde kalsın */}
      <div className="flex shrink-0 items-start gap-3 px-3 pb-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]"
          style={{
            backgroundColor: accent,
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
          }}
        >
          {parallelContext ? (
            <Link2 className="h-5 w-5 text-white" />
          ) : activityName ? (
            <Boxes className="h-5 w-5 text-white" />
          ) : (
            <SymbolIcon
              name={sub.isCategoryRoot ? (category?.icon ?? sub.icon) : sub.icon}
              size={22}
              style={{ color: "#fff" }}
            />
          )}
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          {topLine && (
            <SmartText text={topLine} className="text-[12px] font-medium text-muted-foreground" />
          )}
          <h2>
            <SmartText text={itemName} lines={2} className="text-[19px] font-bold leading-6 tracking-tight" />
          </h2>
          {/*
            Zaman hapı (Dün · Şimdi · Yarın · Özel, bkz. EntryTime), sağında ⋯
            (paralel) ve kapat. Eskiden ikisi bandın tepesinde kendi şeridindeydi
            — bant boşuna uzundu; ondan önce de başlık satırında kalemin adını
            kesiyorlardı ("Ağırlık antrenma…"). Hapın satırının sağı boş. Hap
            daralmaz; dar pencerede (ray) düğmeler alta, sağa iner — saat
            kesilmesin.
          */}
          <div className="flex flex-wrap items-end gap-x-2 gap-y-1.5">
            <div className="flex-[1_0_auto]">
              {goal ? (
                <span
                  data-goal-badge=""
                  className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold"
                  style={{ background: accent, color: skin === "brutal" ? "#111" : inkOn(accent) }}
                >
                  <Target className="h-4 w-4" strokeWidth={2.5} />
                  {t(goal.editing ? "goal.edit" : "goal.badge")}
                </span>
              ) : (
                <EntryTime
                  occurredAt={occurredAt}
                  onChange={onOccurredAtChange}
                  baseDate={entryDate}
                  accent={accent}
                />
              )}
            </div>
            <div data-hero-actions="" className="ml-auto flex shrink-0 items-center gap-1.5">
              {showParallelOption && (
                <OptionsMenu
                  touched={hasParallelSelected}
                  items={[
                    {
                      key: "parallel",
                      icon: Link2,
                      title: t("entry.parallel"),
                      subtitle: hasParallelSelected
                        ? `${selectedParallels.length} seçili`
                        : t("entry.alsoLog"),
                      active: panel === "parallel",
                      onSelect: () => togglePanel("parallel"),
                    },
                  ]}
                />
              )}
              {/* Kapat — pencereyi kapatıp seçiciye döner (sola kaydırmak da) */}
              <button
                type="button"
                onClick={onBack}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sf-3)] text-foreground/80 transition-[background-color,transform] hover:bg-[var(--sf-4)] active:scale-95"
                aria-label={parallelContext ? t("action.skip") : t("action.close")}
              >
                {parallelContext ? <ArrowLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      </div>

      {/* Gövde — açık defter; Brütal temada sayfa zemini (beyaz yüzey, bkz. globals.css) */}
      <div data-entry-sheet="" className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-3 pb-4">
        {moodGoal ? (
          <div
            data-goal-mood=""
            className="flex items-start gap-3 rounded-2xl border border-[var(--ln-2)] bg-[var(--sf-1)] px-4 py-3.5"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `${accent}26`, color: accent }}>
              <Smile className="h-5 w-5" />
            </span>
            <p className="text-[13px] leading-5 text-muted-foreground">{t("goal.moodHint")}</p>
          </div>
        ) : mods.length === 0 ? (
          <button
            type="button"
            onClick={() => setModPickerOpen(true)}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--ln-2)] px-5 py-6 text-center transition-colors hover:bg-[var(--sf-1)]"
          >
            <span
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: `${accent}26`, color: accent }}
            >
              <Plus className="h-5 w-5" strokeWidth={2.5} />
            </span>
            <span className="text-sm font-semibold leading-5">{t("entry.addFeature")}</span>
            <span className="max-w-[240px] text-[11px] leading-4 text-muted-foreground">
              {t(goal ? "goal.featuresHint" : "entry.featuresHint")}
            </span>
          </button>
        ) : (
          ledgerStack()
        )}

        {panel === "parallel" && showParallelOption && (
          <div className="mt-4">
            <PanelBlock icon={Link2} title={t("entry.parallel")} onClose={() => setPanel(null)}>
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
                    <div className="min-w-0 flex-1 leading-tight">
                      <span className="text-xs text-muted-foreground">{ps.categoryName}</span>
                      <span className="mx-1 text-xs text-muted-foreground">/</span>
                      <span className="text-sm font-medium">{ps.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveParallel(ps.id)}
                      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:text-muted-foreground"
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

        {goal && (
          <GoalPlanFields plan={goal.plan} onChange={goal.onPlanChange} accent={accent} />
        )}

        {/*
          Not — tam genişlik, başlıklı; yazılanın ilk üç satırı okunur.
          Basınca not penceresi açılır. Tek satırlık kutuda yazı
          okunmuyordu.
        */}
        <div className="mt-4 flex shrink-0 flex-col gap-1.5">
          <div className="px-1 text-[12px] font-semibold text-muted-foreground">
            {t("entry.note")}
          </div>
          <button
            type="button"
            data-note-box=""
            onClick={() => setNoteOpen(true)}
            className="flex min-h-[76px] w-full items-start gap-2.5 rounded-2xl bg-[var(--sf-1)] px-3.5 py-3 text-left ring-1 ring-inset ring-[var(--ln-1)] transition-colors hover:bg-[var(--sf-2)]"
          >
            <PenLine className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <span
              className={cn(
                "line-clamp-3 min-w-0 whitespace-pre-wrap break-words text-[14px] leading-5",
                notes ? "text-foreground" : "text-muted-foreground/70"
              )}
            >
              {notes || t(goal ? "goal.notePlaceholder" : "entry.notePlaceholder")}
            </span>
          </button>
        </div>

        {goal?.editing && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              data-goal-stop=""
              onClick={goal.onDelete}
              className={cn(
                "flex h-10 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold",
                goal.recurring ? "bg-[var(--sf-2)] text-foreground/85" : "bg-destructive/10 text-destructive"
              )}
            >
              <Trash2 className="h-4 w-4" />
              {t(goal.recurring ? "goal.stop" : "goal.delete")}
            </button>
            {goal.recurring && (
              <button
                type="button"
                data-goal-delete=""
                onClick={goal.onDeleteAll}
                className="flex h-10 items-center gap-1.5 rounded-full bg-destructive/10 px-4 text-[13px] font-semibold text-destructive"
              >
                {t("goal.delete")}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Asli eylem: kalemin renginde; yanında ekle ve devam et */}
      <div
        data-entry-foot=""
        className="flex shrink-0 gap-2 border-t border-[var(--ln-1)] px-3 pt-2.5"
        style={{ paddingBottom: "max(0.75rem, calc(env(safe-area-inset-bottom, 0px) + 0.5rem))" }}
      >
        <button
          type="button"
          onClick={onSave}
          disabled={saveDisabled}
          data-save=""
          className="flex h-12 min-w-0 flex-1 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-white transition-opacity active:opacity-85 disabled:opacity-60"
          style={{ backgroundColor: accent }}
        >
          {!saving && (goal ? <Target className="h-5 w-5" strokeWidth={2.5} /> : <Check className="h-5 w-5" strokeWidth={2.75} />)}
          {saveLabel}
        </button>
        {canStay && (
          <button
            type="button"
            onClick={onSaveStay}
            disabled={saving}
            aria-label={t("entry.addAndNext")}
            title={t("entry.addAndNext")}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--sf-2)] text-foreground/85 transition-[background-color,transform] hover:bg-[var(--sf-3)] active:scale-95 disabled:opacity-60"
          >
            <ListPlus className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Not yazma görünümü formun üstünü kaplar */}
      {noteOpen && (
        <NoteEditorView
          value={notes}
          onChange={onNotesChange}
          onDone={() => setNoteOpen(false)}
          subtitle={itemName}
          accent={accent}
          className="absolute inset-0 z-20 bg-background px-5 pb-6 pt-5"
        />
      )}

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
        persist={false}
        excludeModIds={mods.map((m) => m.modId).filter((x): x is string => !!x)}
        onPicked={(picked) => {
          onAddMods(picked);
          if (picked[0]) setFocusModId(picked[0].id);
        }}
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
  hideLabel = false,
  compact = false,
  color,
}: {
  mod: CategoryModifierWithType;
  /** Özelliğin rengi — skala şeridi bununla dolar */
  color?: string;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isLocked?: boolean;
  entryDate?: string;
  /** Yeni eklenen özellik: alan görünüme kaydırılır, yazı alanları odaklanır */
  autoFocus?: boolean;
  /** Katlanır satırın içinde: adı satır zaten yazıyor, tekrar etmesin */
  hideLabel?: boolean;
  /** Çekmecenin içinde: alan bir tık kısalıyor, yanına düğme sığsın */
  compact?: boolean;
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

  const label = hideLabel ? null : labelRow;

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
        {label}
        <div className="flex h-10 items-center rounded-xl border border-violet-500/30 bg-violet-500/8 px-3 text-sm text-muted-foreground/80 select-none">
          {display}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5" ref={scrollOnMount}>
      {label}

      {vt === "number" && (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
          autoFocus={autoFocus}
          className={cn(compact && "h-10 text-[15px]")}
        />
      )}

      {vt === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("entry.textPlaceholder")}
          autoFocus={autoFocus}
          className={cn(compact && "h-10 text-[15px]")}
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

      {/* Skala: girdi formundakiyle aynı kaydırılan ray (bkz. ScaleSlider) */}
      {vt === "select" && isScaleChoices(mod.entryType.choices) && (
        <ScaleSlider
          choices={mod.entryType.choices ?? []}
          labels={mod.mod?.scaleLabels}
          value={value}
          onChange={onChange}
          color={color}
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
