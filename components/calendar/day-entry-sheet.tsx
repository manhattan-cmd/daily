"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Boxes, Check, ChevronDown, ChevronRight, CornerDownRight, Link2, Pencil, Plus, Trash2, X } from "lucide-react";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  listModifiersForTarget,
  removeModifier,
  createEntry,
  deleteSubCategory,
  ensureActivity,
  getOrCreateCategoryRootSub,
  listActivityNameSuggestions,
  moveSubCategory,
  type CategoryModifierWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import { ParallelPickDialog } from "@/components/forms/parallel-pick-dialog";
import { CATEGORY_ICON_MAP, CategoryIcon } from "@/lib/category-icons";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { DateTimeRangeInput, formatDTRDisplay } from "@/components/forms/datetime-range-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Category, SubCategory } from "@/types";

/** Değer state anahtarı: global mod id (legacy atamalarda atama id'si) */
const valueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
/** Paralel perspektifler arası taşıma anahtarı: aynı atom = aynı anahtar */
const sharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId;

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
  const [showNotes, setShowNotes] = useState(false);
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
        setShowNotes(false);
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
  useEffect(() => {
    if (!open) return;
    if (presetActivity) {
      setActivity(presetActivity);
      setStep({ type: "pick" });
    } else if (activityMode) {
      setStep({ type: "activity-name" });
    }
  }, [open, activityMode, presetActivity]);

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

  // Yeni mod eklendiğinde values'a ilk değerini otomatik ekle
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

  function handleSubSelect(sub: SubCategory) {
    setValues({});
    setSelectedParallels([]);
    setParallelQueue([]);
    setStep({ type: "form", sub });
  }

  // Üst kategoriyi doğrudan seç — gizli kök alt kategorisi üzerinden forma geç
  async function handleCategorySelect(category: Category) {
    const rootSub = await getOrCreateCategoryRootSub(category.id);
    handleSubSelect(rootSub);
  }

  function makeOccurredAt(): number {
    const [y, mo, d] = date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const now = new Date();
    dt.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return dt.getTime();
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
    const occurredAt = makeOccurredAt();
    // Aktivite kaydı ilk girdiyle yazılır — isim verip vazgeçen iz bırakmaz
    if (activity) {
      await ensureActivity({ id: activity.id, name: activity.name, occurredAt });
    }
    await createEntry({
      subcategoryId: subId,
      typeValues,
      occurredAt,
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
    setShowNotes(false);
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
          setShowNotes(false);
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
    setShowNotes(false);
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

      {/* Sheet */}
      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-[390px]",
          "flex flex-col rounded-t-3xl bg-background border-t border-white/8",
          "shadow-[0_-8px_40px_rgba(0,0,0,0.6)]",
          "transition-transform duration-300 ease-out",
          "max-h-[80vh]",
          open ? "translate-y-0" : "translate-y-full"
        )}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
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
        ) : step.type === "pick" ? (
          <PickStep
            key={open ? "open" : "closed"}
            groups={groups}
            onSubSelect={handleSubSelect}
            onCategorySelect={handleCategorySelect}
            onClose={onClose}
            activity={activity ? { name: activity.name, count: activityCount } : null}
          />
        ) : (
          <FormStep
            sub={step.sub}
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
            showNotes={showNotes}
            onShowNotesChange={setShowNotes}
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
          aria-label="Kapat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
        <form onSubmit={submit} className="flex flex-col gap-4">
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">Son aktiviteler</p>
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
              <p className="text-xs text-muted-foreground mt-1">veya yenisini yaz</p>
            </div>
          )}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Aktivite adı (örn. Market alışverişi)"
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

/** Sürükleme sırasında bırakılabilecek hedef */
type DropTarget =
  | { kind: "sub"; id: string }
  | { kind: "cat"; id: string }
  | { kind: "trash" };

function PickStep({
  groups,
  onSubSelect,
  onCategorySelect,
  onClose,
  activity,
}: {
  groups:
    | { category: Category; topSubs: SubCategory[]; allSubs: SubCategory[] }[]
    | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onClose: () => void;
  /** Aktivite akışında başlık bandı + Bitti butonu */
  activity?: { name: string; count: number } | null;
}) {
  // Basılı tut + sürükle: daire başka bir dairenin (altına taşı), kategori
  // başlığının (o kategorinin ana seviyesine taşı) ya da çöp alanının (sil)
  // üzerine bırakılır. Analizler parentId zincirini canlı okuduğundan taşıma
  // sonrası kendiliğinden yeni hiyerarşiye uyar.
  const [drag, setDrag] = useState<{
    sub: SubCategory;
    color: string;
    /** Taşınanın kendisi + torunları — bunların üzerine bırakılamaz (döngü) */
    invalidIds: Set<string>;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const dropRef = useRef<DropTarget | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SubCategory | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Düzenleme modu: + rozetleri yalnızca bu moddayken görünür — normal
  // görünüm sade kalır (kafa karıştıran artılar gizli)
  const [editMode, setEditMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const subById = useMemo(() => {
    const m = new Map<string, SubCategory>();
    for (const g of groups ?? []) for (const s of g.allSubs) m.set(s.id, s);
    return m;
  }, [groups]);

  function startDrag(
    sub: SubCategory,
    color: string,
    pos: { x: number; y: number }
  ) {
    const invalid = new Set<string>([sub.id]);
    const all = groups?.flatMap((g) => g.allSubs) ?? [];
    const stack = [sub.id];
    while (stack.length) {
      const cur = stack.pop()!;
      for (const s of all)
        if (s.parentId === cur && !invalid.has(s.id)) {
          invalid.add(s.id);
          stack.push(s.id);
        }
    }
    setDrag({ sub, color, invalidIds: invalid });
    setDragPos(pos);
    navigator.vibrate?.(15);
  }

  useEffect(() => {
    if (!drag) return;
    const setTarget = (t: DropTarget | null) => {
      dropRef.current = t;
      setDropTarget(t);
    };
    const endDrag = () => {
      setDrag(null);
      setDragPos(null);
      setTarget(null);
    };
    const onMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
      // Kenara yaklaşınca liste kendiliğinden kayar
      const sc = scrollRef.current;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (e.clientY < r.top + 56) sc.scrollTop -= 10;
        else if (e.clientY > r.bottom - 84) sc.scrollTop += 10;
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const t = el?.closest?.(
        "[data-drop-sub],[data-drop-cat],[data-drop-trash]"
      ) as HTMLElement | null;
      if (!t) return setTarget(null);
      if (t.dataset.dropTrash !== undefined) return setTarget({ kind: "trash" });
      const subId = t.dataset.dropSub;
      if (subId) {
        // Kendi alt ağacına ya da zaten altında olduğu üste bırakılamaz
        if (drag.invalidIds.has(subId) || drag.sub.parentId === subId)
          return setTarget(null);
        return setTarget({ kind: "sub", id: subId });
      }
      const catId = t.dataset.dropCat;
      if (catId) {
        if (drag.sub.categoryId === catId && !drag.sub.parentId)
          return setTarget(null);
        return setTarget({ kind: "cat", id: catId });
      }
      setTarget(null);
    };
    const onUp = async () => {
      const t = dropRef.current;
      const moving = drag.sub;
      endDrag();
      if (!t) return;
      if (t.kind === "trash") {
        setConfirmDelete(moving);
      } else if (t.kind === "sub") {
        const parent = subById.get(t.id);
        if (parent)
          await moveSubCategory(moving.id, {
            categoryId: parent.categoryId,
            parentId: parent.id,
          });
      } else {
        await moveSubCategory(moving.id, { categoryId: t.id });
      }
    };
    const onCancel = () => endDrag();
    // Sürükleme boyunca dokunmatik kaydırmayı kilitle
    const prevent = (e: TouchEvent) => e.preventDefault();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("touchmove", prevent, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("touchmove", prevent);
    };
  }, [drag, subById]);

  return (
    <>
      <div className="flex items-center justify-between gap-2 px-5 pt-2 pb-3 shrink-0">
        <div className="min-w-0">
          {activity && !drag && (
            <div className="flex items-center gap-1.5 mb-0.5">
              <Boxes className="h-3 w-3 text-cyan-400" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80 truncate">
                {activity.name}
                {activity.count > 0 && ` · ${activity.count} girdi eklendi`}
              </span>
            </div>
          )}
          <h2 className="text-base font-semibold tracking-tight truncate">
            {drag
              ? `"${drag.sub.name}" taşınıyor`
              : activity
                ? "Aktiviteye girdi ekle"
                : "Ne eklemek istersin?"}
          </h2>
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            {drag
              ? "Bir dairenin ya da kategori adının üzerine bırak"
              : activity
                ? "İstediğin kadar ekle — bitince Bitti'ye bas"
                : editMode
                  ? "+ ile alt kategori ekle; daireyi basılı tutup sürükleyerek taşı"
                  : "Girdi eklemek istediğin yeri seç"}
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
            aria-label="Kapat"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10"
      >
        {!groups || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz kategori yok. Önce yapı oluştur.
            </p>
          </div>
        ) : (
          <>
            {/* Düzenleme modu anahtarı — + rozetlerini gösterir/gizler */}
            <button
              onClick={() => setEditMode((v) => !v)}
              className={cn(
                "mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                editMode
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-dashed border-border/60 text-muted-foreground hover:border-border hover:text-foreground"
              )}
            >
              {editMode ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Düzenlemeyi bitir
                </>
              ) : (
                <>
                  <Pencil className="h-3.5 w-3.5" />
                  Alt kategorileri düzenle / oluştur
                </>
              )}
            </button>

            <div className="flex flex-col gap-5">
              {groups.map(({ category, topSubs, allSubs }) => (
                <CategoryGroup
                  key={category.id}
                  category={category}
                  topSubs={topSubs}
                  allSubs={allSubs}
                  editMode={editMode}
                  onSubSelect={onSubSelect}
                  onCategorySelect={onCategorySelect}
                  onDragStart={startDrag}
                  draggingSubId={drag?.sub.id ?? null}
                  dropTarget={dropTarget}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Çöp alanı — sürükleme sırasında görünür; bırakınca onaylı silme */}
      {drag && (
        <div
          data-drop-trash
          className={cn(
            "absolute inset-x-4 bottom-4 z-[60] flex h-14 items-center justify-center gap-2 rounded-2xl border-2 border-dashed transition-colors",
            dropTarget?.kind === "trash"
              ? "border-red-500 bg-red-500/25 text-red-200"
              : "border-red-500/40 bg-background/95 text-red-400/80"
          )}
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-medium">Silmek için buraya bırak</span>
        </div>
      )}

      {/* Sürüklenen hayalet daire — parmağı izler */}
      {drag &&
        dragPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100]"
            style={{
              left: dragPos.x,
              top: dragPos.y,
              transform: "translate(-50%, -110%)",
            }}
          >
            <div
              className="h-[64px] w-[64px] rounded-full flex items-center justify-center shadow-2xl"
              style={{
                backgroundColor: `${drag.color}30`,
                outline: `2px solid ${drag.color}`,
                backdropFilter: "blur(4px)",
              }}
            >
              <SubGlyph sub={drag.sub} color={drag.color} />
            </div>
          </div>,
          document.body
        )}

      {/* Sürükle-sil onayı */}
      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmDelete(null);
        }}
      >
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>{`"${confirmDelete?.name ?? ""}" silinsin mi?`}</DialogTitle>
            <DialogDescription>
              Bu alt kategoriye (ve altlarına) ait tüm girdiler kalıcı olarak
              silinecek.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(null)}
              disabled={deleting}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                if (!confirmDelete) return;
                setDeleting(true);
                try {
                  await deleteSubCategory(confirmDelete.id);
                } finally {
                  setDeleting(false);
                  setConfirmDelete(null);
                }
              }}
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Category Group ───────────────────────────────────────────────────────────

function CategoryGroup({
  category,
  topSubs,
  allSubs,
  editMode,
  onSubSelect,
  onCategorySelect,
  onDragStart,
  draggingSubId,
  dropTarget,
}: {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
  /** Düzenleme modunda + rozetleri görünür */
  editMode: boolean;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  onDragStart: (
    sub: SubCategory,
    color: string,
    pos: { x: number; y: number }
  ) => void;
  draggingSubId: string | null;
  dropTarget: DropTarget | null;
}) {
  // expansionPath[0] = expanded topSub id, expansionPath[1] = expanded child id, …
  const [expansionPath, setExpansionPath] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);

  const isCatDropTarget =
    dropTarget?.kind === "cat" && dropTarget.id === category.id;

  function handleExpand(subId: string, levelIndex: number) {
    setExpansionPath((prev) => {
      if (prev[levelIndex] === subId) {
        // Collapse this level and all deeper levels
        return prev.slice(0, levelIndex);
      }
      // Expand at this level, clear any deeper levels
      return [...prev.slice(0, levelIndex), subId];
    });
  }

  function openAdd(parentSubcategoryId?: string) {
    setAddParentId(parentSubcategoryId);
    setAddOpen(true);
  }

  // Calculate how many ancestor hops from category root to a sub
  function depthOf(subId: string): number {
    let depth = 0;
    let current = allSubs.find((s) => s.id === subId);
    while (current?.parentId) {
      depth++;
      current = allSubs.find((s) => s.id === current!.parentId);
    }
    return depth;
  }

  function renderLevel(subs: SubCategory[], levelIndex: number): React.ReactNode {
    const expandedIdAtLevel = expansionPath[levelIndex];
    const expandedSub = expandedIdAtLevel
      ? allSubs.find((s) => s.id === expandedIdAtLevel)
      : undefined;
    const nextLevelSubs = expandedIdAtLevel
      ? allSubs
          .filter((s) => s.parentId === expandedIdAtLevel)
          .sort((a, b) => a.order - b.order)
      : [];

    return (
      <div key={`level-${levelIndex}`}>
        <div className="flex flex-wrap gap-4">
          {subs.map((sub) => {
            const hasChildren = allSubs.some((s) => s.parentId === sub.id);
            const isExpanded = expansionPath[levelIndex] === sub.id;
            return (
              <SubCircle
                key={sub.id}
                sub={sub}
                categoryColor={category.color}
                hasChildren={hasChildren}
                isExpanded={isExpanded}
                isDragging={draggingSubId === sub.id}
                isDropTarget={
                  dropTarget?.kind === "sub" && dropTarget.id === sub.id
                }
                onTap={() => onSubSelect(sub)}
                onExpand={
                  hasChildren
                    ? () => handleExpand(sub.id, levelIndex)
                    : undefined
                }
                onAddChild={editMode ? () => openAdd(sub.id) : undefined}
                onDragStart={(pos) => onDragStart(sub, category.color, pos)}
              />
            );
          })}
        </div>

        {/* Açılan dal: ebeveyn adı etiketli, bağlantı çizgili yuva — iç içe
            render edildiğinden derinleştikçe girinti artar, aidiyet okunur */}
        {nextLevelSubs.length > 0 && expandedSub && (
          <div
            className="mt-3 ml-7 border-l-2 pl-3.5 pb-1"
            style={{ borderColor: `${category.color}40` }}
          >
            <div className="mb-2.5 flex items-center gap-1.5">
              <CornerDownRight
                className="h-3 w-3 shrink-0"
                style={{ color: `${category.color}90` }}
              />
              <span
                className="truncate text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: `${category.color}c0` }}
              >
                {expandedSub.name}
              </span>
            </div>
            {renderLevel(nextLevelSubs, levelIndex + 1)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* Section header — kutuya tıklayınca kategori doğrudan girdi olarak eklenir;
          sürüklemede üzerine bırakılan alt kategori bu kategorinin ana seviyesine taşınır */}
      <div className="flex items-center gap-2 mb-3">
        <button
          data-drop-cat={category.id}
          onClick={() => onCategorySelect(category)}
          className={cn(
            "flex items-center gap-2.5 flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-left transition-all hover:brightness-110 active:scale-[0.98]",
            isCatDropTarget && "ring-1 ring-inset scale-[1.02]"
          )}
          style={{
            borderColor: `${category.color}${isCatDropTarget ? "" : "30"}`,
            background: `linear-gradient(135deg, ${category.color}${isCatDropTarget ? "30" : "16"}, ${category.color}06)`,
            ...(isCatDropTarget
              ? ({ "--tw-ring-color": category.color } as React.CSSProperties)
              : {}),
          }}
          aria-label={`${category.name} kategorisine doğrudan girdi ekle`}
        >
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{ backgroundColor: category.color }}
          />
          <span className="flex-1 truncate text-sm font-semibold">
            {category.name}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </button>
        {editMode && (
          <button
            onClick={() => openAdd(undefined)}
            className="h-9 w-9 shrink-0 rounded-full border border-dashed border-border/60 flex items-center justify-center hover:border-foreground/30 hover:bg-muted/40 active:scale-95 transition-all"
            aria-label={`${category.name} altına alt kategori ekle`}
          >
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {renderLevel(topSubs, 0)}

      {/* Quick add dialog */}
      <SubCategoryForm
        open={addOpen}
        onOpenChange={setAddOpen}
        categoryId={category.id}
        parentSubcategoryId={addParentId}
        categoryName={category.name}
        onSaved={() => {
          if (addParentId) {
            const level = depthOf(addParentId);
            handleExpand(addParentId, level);
          }
        }}
      />

    </div>
  );
}

// ─── Sub Circle ──────────────────────────────────────────────────────────────

/** Dairenin içindeki sembol — SubCircle ve sürükleme hayaleti ortak kullanır */
function SubGlyph({ sub, color }: { sub: SubCategory; color: string }) {
  const isLucideIcon = sub.icon && sub.icon in CATEGORY_ICON_MAP;
  if (isLucideIcon) {
    return (
      <CategoryIcon name={sub.icon} className="h-6 w-6" style={{ color }} />
    );
  }
  if (sub.icon) {
    return (
      <span className="text-[26px] leading-none select-none">{sub.icon}</span>
    );
  }
  return (
    <span
      className="text-lg font-bold leading-none select-none"
      style={{ color }}
    >
      {sub.name[0].toUpperCase()}
    </span>
  );
}

function SubCircle({
  sub,
  categoryColor,
  hasChildren,
  isExpanded,
  isDragging,
  isDropTarget,
  onTap,
  onExpand,
  onAddChild,
  onDragStart,
}: {
  sub: SubCategory;
  categoryColor: string;
  hasChildren: boolean;
  isExpanded: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  onTap: () => void;
  onExpand?: () => void;
  onAddChild?: () => void;
  onDragStart: (pos: { x: number; y: number }) => void;
}) {
  // Basılı tutma → sürükleme: 350ms hareketsiz basış sürüklemeyi başlatır;
  // erken hareket kaydırma sayılır ve iptal eder. Sürükleme olduysa bırakıştaki
  // click bastırılır (yoksa form açılırdı).
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const downPos = useRef<{ x: number; y: number } | null>(null);
  const dragStarted = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  return (
    <button
      data-drop-sub={sub.id}
      onClick={() => {
        if (dragStarted.current) {
          dragStarted.current = false;
          return;
        }
        onTap();
      }}
      onPointerDown={(e) => {
        downPos.current = { x: e.clientX, y: e.clientY };
        dragStarted.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          dragStarted.current = true;
          onDragStart(downPos.current!);
        }, 350);
      }}
      onPointerMove={(e) => {
        if (!downPos.current || dragStarted.current) return;
        if (
          Math.abs(e.clientX - downPos.current.x) > 10 ||
          Math.abs(e.clientY - downPos.current.y) > 10
        )
          clearHold();
      }}
      onPointerUp={clearHold}
      onPointerCancel={clearHold}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "flex flex-col items-center gap-2 active:scale-90 transition-transform",
        isDragging && "opacity-30"
      )}
    >
      <div
        className={cn(
          "relative h-[60px] w-[60px] rounded-full flex items-center justify-center transition-all duration-200",
          isDropTarget && "scale-110"
        )}
        style={{
          backgroundColor: isDropTarget
            ? `${categoryColor}45`
            : isExpanded
              ? `${categoryColor}35`
              : `${categoryColor}18`,
          outline:
            isDropTarget || isExpanded
              ? `2px solid ${categoryColor}`
              : undefined,
          outlineOffset: isDropTarget || isExpanded ? "2px" : undefined,
        }}
      >
        <SubGlyph sub={sub} color={categoryColor} />

        {/* Expand/collapse badge — sağ-alt; belirgin olsun diye büyük */}
        {hasChildren && (
          <div
            className="absolute -bottom-1 -right-1 h-[24px] w-[24px] rounded-full flex items-center justify-center border-2 border-background shadow-md transition-colors"
            style={{ backgroundColor: categoryColor }}
            onClick={(e) => {
              e.stopPropagation();
              onExpand?.();
            }}
            role="button"
            aria-label={isExpanded ? `${sub.name} alt kategorilerini gizle` : `${sub.name} alt kategorilerini göster`}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 text-white transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
              strokeWidth={2.5}
            />
          </div>
        )}

        {/* Alt kategori ekle rozeti — sol-alt */}
        {onAddChild && (
          <div
            className="absolute -bottom-0.5 -left-0.5 h-[18px] w-[18px] rounded-full flex items-center justify-center border-[1.5px] border-background"
            style={{ backgroundColor: `${categoryColor}60` }}
            onClick={(e) => {
              e.stopPropagation();
              onAddChild();
            }}
            role="button"
            aria-label={`${sub.name} altına alt kategori ekle`}
          >
            <Plus className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      <span className="text-[11px] leading-tight text-center text-muted-foreground max-w-[64px] line-clamp-2 select-none">
        {sub.name}
      </span>
    </button>
  );
}

// ─── Form Step ───────────────────────────────────────────────────────────────

function FormStep({
  sub,
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
  showNotes,
  onShowNotesChange,
  onBack,
  onSave,
  saving,
  entryDate,
}: {
  sub: SubCategory;
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
  showNotes: boolean;
  onShowNotesChange: (v: boolean) => void;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  entryDate: string;
}) {
  const [modPickerOpen, setModPickerOpen] = useState(false);
  const [parallelPickerOpen, setParallelPickerOpen] = useState(false);

  async function handleRemoveMod(mod: CategoryModifierWithType) {
    await removeModifier(mod.id);
    onValueChange(valueKey(mod), "");
  }

  const hasParallelSelected = selectedParallels.length > 0;
  const saveLabel = saving
    ? "Kaydediliyor..."
    : parallelContext
    ? parallelContext.index < parallelContext.total
      ? "Kaydet ve devam →"
      : "Kaydet"
    : hasParallelSelected
    ? "Kaydet ve devam →"
    : "Kaydet";

  return (
    <>
      <div className="flex items-center gap-3 px-5 pt-2 pb-4 shrink-0">
        <button
          onClick={onBack}
          className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors shrink-0"
          aria-label={parallelContext ? "Geç" : "Geri"}
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
          <h2 className="text-base font-semibold tracking-tight truncate">{sub.name}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        <div className="flex flex-col gap-4">
          {mods.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 py-5 flex flex-col items-center gap-2.5 text-center">
              <p className="text-sm text-muted-foreground">
                Kaydını tutmak istediğin özellikleri ekle veya doğrudan kaydet.
              </p>
              <button
                type="button"
                onClick={() => setModPickerOpen(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Özellik ekle
              </button>
            </div>
          ) : (
            <>
              {mods.map((mod) => (
                <ModInput
                  key={mod.id}
                  mod={mod}
                  value={values[valueKey(mod)] ?? ""}
                  onChange={(v) => onValueChange(valueKey(mod), v)}
                  onRemove={lockedTypeIds.has(sharedKey(mod)) ? undefined : () => handleRemoveMod(mod)}
                  isLocked={lockedTypeIds.has(sharedKey(mod))}
                  entryDate={entryDate}
                />
              ))}
              <button
                type="button"
                onClick={() => setModPickerOpen(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                <Plus className="h-3.5 w-3.5" />
                Özellik ekle
              </button>
            </>
          )}

          {/* Paralel perspektifler — sadece ana form adımında (aktivite akışında gizli) */}
          {!parallelContext && !hideParallels && (
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-violet-400/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paralel perspektifler
                </span>
              </div>
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
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                <Plus className="h-3.5 w-3.5" />
                {selectedParallels.length > 0 ? "Başka perspektif ekle" : "Paralel perspektif ekle"}
              </button>
            </div>
          )}

          <div>
            <button
              type="button"
              onClick={() => onShowNotesChange(!showNotes)}
              className={cn(
                "flex items-center gap-1.5 text-sm transition-colors",
                showNotes
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Plus
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  showNotes && "rotate-45"
                )}
              />
              Not ekle
            </button>
            {showNotes && (
              <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="Bu girdiyle ilgili bir not..."
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
          </div>
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
}: {
  mod: CategoryModifierWithType;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isLocked?: boolean;
  entryDate?: string;
}) {
  const vt = mod.entryType.valueType ?? "number";
  const today = new Date().toISOString().split("T")[0];

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
      display = value === "true" ? "Evet" : "Hayır";
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
    <div className="flex flex-col gap-1.5">
      {labelRow}

      {vt === "number" && (
        <Input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="0"
          step="any"
        />
      )}

      {vt === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Metin gir..."
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
          {value === "true" ? "Evet" : "Hayır"}
        </button>
      )}

      {vt === "select" && (
        <div className="flex flex-wrap gap-2">
          {(mod.entryType.choices ?? []).map((choice) => (
            <button
              key={choice}
              type="button"
              onClick={() => onChange(choice)}
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
