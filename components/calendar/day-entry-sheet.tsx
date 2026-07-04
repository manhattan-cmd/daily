"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Plus, X, ChevronDown, Trash2, Link2, Check } from "lucide-react";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import {
  listModifiersForTarget,
  listEntryTypes,
  assignModifier,
  removeModifier,
  createEntry,
  deleteCategory,
  deleteSubCategory,
  type CategoryModifierWithType,
  type ParallelSub,
} from "@/lib/db/queries";
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
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import type { Category, SubCategory, EntryType } from "@/types";

interface DayEntrySheetProps {
  date: string;
  open: boolean;
  onClose: () => void;
}

type Step =
  | { type: "pick" }
  | { type: "form"; sub: SubCategory }
  | { type: "parallel-form"; sub: SubCategory; catName: string; queueIndex: number; queueTotal: number; groupId: string; carryover: Record<string, string> };

export function DayEntrySheet({ date, open, onClose }: DayEntrySheetProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ type: "pick" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedParallels, setSelectedParallels] = useState<ParallelSub[]>([]);
  const [parallelQueue, setParallelQueue] = useState<ParallelSub[]>([]);
  const [lockedTypeIds, setLockedTypeIds] = useState<Set<string>>(new Set());

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
      }, 300);
    }
  }, [open]);

  const groups = useLiveQuery(async () => {
    const cats = await db.categories.orderBy("order").toArray();
    const subs = await db.subcategories.toArray();
    return cats.map((cat) => ({
      category: cat,
      topSubs: subs
        .filter((s) => s.categoryId === cat.id && !s.parentId)
        .sort((a, b) => a.order - b.order),
      allSubs: subs.filter((s) => s.categoryId === cat.id),
    }));
  }, []);

  const currentSubId = step.type !== "pick" ? step.sub.id : "";

  // Modifier'ları canlı izle — hem ana hem paralel form için
  const formMods = useLiveQuery(
    async () => {
      if (!currentSubId) return [];
      return listModifiersForTarget("subcategory", currentSubId);
    },
    [currentSubId]
  ) ?? [];

  // Yeni modifier eklendiğinde values'a ilk değerini otomatik ekle
  useEffect(() => {
    if (!currentSubId || !formMods.length) return;
    setValues((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of formMods) {
        if (!(m.entryTypeId in next)) {
          next[m.entryTypeId] = m.entryType.valueType === "boolean" ? "false" : "";
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

  function makeOccurredAt(): number {
    const [y, mo, d] = date.split("-").map(Number);
    const dt = new Date(y, mo - 1, d);
    const now = new Date();
    dt.setHours(now.getHours(), now.getMinutes(), 0, 0);
    return dt.getTime();
  }

  async function persistEntry(subId: string, vals: Record<string, string>, groupId?: string, entryNotes?: string) {
    const typeValues = Object.entries(vals)
      .filter(([, v]) => v !== "")
      .map(([entryTypeId, value]) => ({ entryTypeId, value }));
    await createEntry({
      subcategoryId: subId,
      typeValues,
      occurredAt: makeOccurredAt(),
      notes: (entryNotes ?? notes).trim() || undefined,
      linkedGroupId: groupId,
    });
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
      const carried = carryover[m.entryTypeId];
      if (carried !== undefined && carried !== "") {
        initial[m.entryTypeId] = carried;
        newLocked.add(m.entryTypeId);
      } else {
        initial[m.entryTypeId] = m.entryType.valueType === "boolean" ? "false" : "";
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
        await persistEntry(step.sub.id, values, groupId);
        if (selectedParallels.length > 0) {
          setSelectedParallels([]);
          await advanceToNextParallel(selectedParallels, groupId!, 0, selectedParallels.length, { ...values });
        } else {
          onClose();
          router.push(`/calendar/${date}`);
        }
      } else if (step.type === "parallel-form") {
        await persistEntry(step.sub.id, values, step.groupId, notes);
        const accumulated = { ...step.carryover, ...values };
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

        {step.type === "pick" ? (
          <PickStep
            groups={groups}
            onSubSelect={handleSubSelect}
            onClose={onClose}
          />
        ) : (
          <FormStep
            sub={step.sub}
            mods={formMods}
            currentCategoryId={step.sub.categoryId}
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

// ─── Pick Step ───────────────────────────────────────────────────────────────

function PickStep({
  groups,
  onSubSelect,
  onClose,
}: {
  groups:
    | { category: Category; topSubs: SubCategory[]; allSubs: SubCategory[] }[]
    | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-5 pt-2 pb-4 shrink-0">
        <h2 className="text-base font-semibold tracking-tight">
          Ne eklemek istersin?
        </h2>
        <button
          onClick={onClose}
          className="h-7 w-7 flex items-center justify-center rounded-full bg-white/8 text-muted-foreground hover:bg-white/12 transition-colors"
          aria-label="Kapat"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-10">
        {!groups || groups.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Henüz kategori yok. Önce yapı oluştur.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-7">
            {groups.map(({ category, topSubs, allSubs }) => (
              <CategoryGroup
                key={category.id}
                category={category}
                topSubs={topSubs}
                allSubs={allSubs}
                onSubSelect={onSubSelect}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Category Group ───────────────────────────────────────────────────────────

type DeleteTarget =
  | { type: "category" }
  | { type: "sub"; sub: SubCategory };

function CategoryGroup({
  category,
  topSubs,
  allSubs,
  onSubSelect,
}: {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
  onSubSelect: (sub: SubCategory) => void;
}) {
  // expansionPath[0] = expanded topSub id, expansionPath[1] = expanded child id, …
  const [expansionPath, setExpansionPath] = useState<string[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.type === "category") {
        await deleteCategory(category.id);
      } else {
        await deleteSubCategory(deleteTarget.sub.id);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

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
    const parentId = subs[0]?.parentId; // undefined for topSubs
    const expandedIdAtLevel = expansionPath[levelIndex];
    const nextLevelSubs = expandedIdAtLevel
      ? allSubs
          .filter((s) => s.parentId === expandedIdAtLevel)
          .sort((a, b) => a.order - b.order)
      : [];

    return (
      <div key={`level-${levelIndex}`}>
        <div
          className={cn(
            "flex flex-wrap gap-4",
            levelIndex > 0 && "mt-5 pt-4 pl-4 border-l-[2px]"
          )}
          style={
            levelIndex > 0
              ? { borderColor: `${category.color}35` }
              : undefined
          }
        >
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
                onTap={() => onSubSelect(sub)}
                onExpand={
                  hasChildren
                    ? () => handleExpand(sub.id, levelIndex)
                    : undefined
                }
                onAddChild={() => openAdd(sub.id)}
                onDelete={() => setDeleteTarget({ type: "sub", sub })}
              />
            );
          })}
          <AddCircle
            categoryColor={category.color}
            onTap={() => openAdd(parentId)}
          />
        </div>

        {nextLevelSubs.length > 0 &&
          renderLevel(nextLevelSubs, levelIndex + 1)}
      </div>
    );
  }

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <div
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground/70 flex-1">
          {category.name}
        </span>
        <button
          onClick={() => setDeleteTarget({ type: "category" })}
          className="h-6 w-6 rounded-full border border-border/40 flex items-center justify-center hover:border-red-500/50 hover:bg-red-500/10 active:scale-95 transition-all"
          aria-label={`${category.name} kategorisini sil`}
        >
          <Trash2 className="h-3 w-3 text-muted-foreground/50 hover:text-red-400" />
        </button>
        <button
          onClick={() => openAdd(undefined)}
          className="h-6 w-6 rounded-full border border-dashed border-border/60 flex items-center justify-center hover:border-foreground/30 hover:bg-muted/40 active:scale-95 transition-all"
          aria-label={`${category.name} altına alt kategori ekle`}
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
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

      {/* Delete confirmation dialog */}
      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}
      >
        <DialogContent className="max-w-[320px]">
          <DialogHeader>
            <DialogTitle>
              {deleteTarget?.type === "category"
                ? `"${category.name}" silinsin mi?`
                : `"${deleteTarget?.type === "sub" ? deleteTarget.sub.name : ""}" silinsin mi?`}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget?.type === "category"
                ? "Tüm alt kategoriler ve girdiler kalıcı olarak silinecek."
                : "Bu alt kategoriye ait tüm girdiler kalıcı olarak silinecek."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              İptal
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? "Siliniyor..." : "Sil"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub Circle ──────────────────────────────────────────────────────────────

function SubCircle({
  sub,
  categoryColor,
  hasChildren,
  isExpanded,
  onTap,
  onExpand,
  onAddChild,
  onDelete,
}: {
  sub: SubCategory;
  categoryColor: string;
  hasChildren: boolean;
  isExpanded: boolean;
  onTap: () => void;
  onExpand?: () => void;
  onAddChild?: () => void;
  onDelete?: () => void;
}) {
  const isLucideIcon = sub.icon && sub.icon in CATEGORY_ICON_MAP;

  return (
    <button
      onClick={onTap}
      className="flex flex-col items-center gap-2 active:scale-90 transition-transform"
    >
      <div
        className="relative h-[60px] w-[60px] rounded-full flex items-center justify-center transition-all duration-200"
        style={{
          backgroundColor: isExpanded
            ? `${categoryColor}35`
            : `${categoryColor}18`,
          outline: isExpanded ? `2px solid ${categoryColor}` : undefined,
          outlineOffset: isExpanded ? "2px" : undefined,
        }}
      >
        {isLucideIcon ? (
          <CategoryIcon
            name={sub.icon}
            className="h-6 w-6"
            style={{ color: categoryColor }}
          />
        ) : sub.icon ? (
          <span className="text-[26px] leading-none select-none">{sub.icon}</span>
        ) : (
          <span
            className="text-lg font-bold leading-none select-none"
            style={{ color: categoryColor }}
          >
            {sub.name[0].toUpperCase()}
          </span>
        )}

        {/* Expand/collapse badge — sağ-alt */}
        {hasChildren && (
          <div
            className="absolute -bottom-0.5 -right-0.5 h-[18px] w-[18px] rounded-full flex items-center justify-center border-[1.5px] border-background transition-colors"
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
                "h-2.5 w-2.5 text-white transition-transform duration-200",
                isExpanded && "rotate-180"
              )}
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

        {/* Sil rozeti — sağ-üst */}
        {onDelete && (
          <div
            className="absolute -top-0.5 -right-0.5 h-[18px] w-[18px] rounded-full flex items-center justify-center border-[1.5px] border-background bg-red-500/80 hover:bg-red-500 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            role="button"
            aria-label={`${sub.name} alt kategorisini sil`}
          >
            <X className="h-2.5 w-2.5 text-white" />
          </div>
        )}
      </div>

      <span className="text-[11px] leading-tight text-center text-muted-foreground max-w-[64px] line-clamp-2 select-none">
        {sub.name}
      </span>
    </button>
  );
}

// ─── Add Circle ──────────────────────────────────────────────────────────────

function AddCircle({
  categoryColor,
  onTap,
}: {
  categoryColor: string;
  onTap: () => void;
}) {
  return (
    <button
      onClick={onTap}
      className="flex flex-col items-center gap-2 active:scale-90 transition-transform group"
      aria-label="Yeni alt kategori ekle"
    >
      <div
        className="h-[60px] w-[60px] rounded-full flex items-center justify-center border-[1.5px] border-dashed transition-all duration-200 group-hover:bg-white/5"
        style={{ borderColor: `${categoryColor}50` }}
      >
        <Plus
          className="h-5 w-5 transition-colors"
          style={{ color: `${categoryColor}70` }}
        />
      </div>
      <span
        className="text-[11px] leading-tight text-center max-w-[64px] select-none"
        style={{ color: `${categoryColor}60` }}
      >
        Yeni
      </span>
    </button>
  );
}

// ─── Form Step ───────────────────────────────────────────────────────────────

function FormStep({
  sub,
  mods,
  currentCategoryId,
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

  const selectedIds = new Set(selectedParallels.map((p) => p.id));

  const allTypes = useLiveQuery(() => listEntryTypes(), []);
  const assignedIds = new Set(mods.map((m) => m.entryTypeId));
  const availableTypes = (allTypes ?? []).filter((t) => !assignedIds.has(t.id));

  const allGroupsForPicker = useLiveQuery(
    async () => {
      if (parallelContext !== null) return [];
      const cats = await db.categories.orderBy("order").toArray();
      const subs = await db.subcategories.toArray();
      return cats
        .filter((c) => c.id !== currentCategoryId)
        .map((cat) => ({
          category: cat,
          subs: subs
            .filter((s) => s.categoryId === cat.id && !s.parentId)
            .sort((a, b) => a.order - b.order),
        }))
        .filter((g) => g.subs.length > 0);
    },
    [currentCategoryId, parallelContext]
  ) ?? [];

  async function handleRemoveMod(mod: CategoryModifierWithType) {
    await removeModifier(mod.id);
    onValueChange(mod.entryTypeId, "");
  }

  async function handleAssignMod(type: EntryType) {
    await assignModifier("subcategory", sub.id, type.id);
    setModPickerOpen(false);
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
          <h2 className="text-base font-semibold tracking-tight truncate">{sub.name}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-6">
        <div className="flex flex-col gap-4">
          {mods.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 py-5 flex flex-col items-center gap-2.5 text-center">
              <p className="text-sm text-muted-foreground">
                Bu kategoride henüz mod yok
              </p>
              {availableTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModPickerOpen(true)}
                  className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Mod ekle
                </button>
              )}
            </div>
          ) : (
            <>
              {mods.map((mod) => (
                <ModInput
                  key={mod.id}
                  mod={mod}
                  value={values[mod.entryTypeId] ?? ""}
                  onChange={(v) => onValueChange(mod.entryTypeId, v)}
                  onRemove={lockedTypeIds.has(mod.entryTypeId) ? undefined : () => handleRemoveMod(mod)}
                  isLocked={lockedTypeIds.has(mod.entryTypeId)}
                  entryDate={entryDate}
                />
              ))}
              {availableTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModPickerOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Mod ekle
                </button>
              )}
            </>
          )}

          {/* Paralel perspektifler — sadece ana form adımında */}
          {!parallelContext && (
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

      {/* Paralel perspektif seçici */}
      <Dialog open={parallelPickerOpen} onOpenChange={setParallelPickerOpen}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>Paralel perspektif seç</DialogTitle>
            <DialogDescription>
              Bu girdiyi hangi kategoride de takip etmek istersin?
            </DialogDescription>
          </DialogHeader>

          {allGroupsForPicker.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Başka kategori yok.
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {allGroupsForPicker.map(({ category, subs }) => (
                <div key={category.id}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {category.name}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {subs.map((s) => {
                      const isSel = selectedIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() =>
                            isSel
                              ? onRemoveParallel(s.id)
                              : onAddParallel({ ...s, categoryName: category.name })
                          }
                          className={cn(
                            "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                            isSel
                              ? "border-violet-500/50 bg-violet-500/10 text-violet-300"
                              : "border-border bg-muted/20 text-foreground hover:bg-muted/40"
                          )}
                        >
                          {isSel && <Check className="h-3 w-3 shrink-0" />}
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setParallelPickerOpen(false)}>Tamam</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mod seçici */}
      <Dialog open={modPickerOpen} onOpenChange={setModPickerOpen}>
        <DialogContent className="max-h-[70dvh] overflow-y-auto gap-4">
          <DialogHeader>
            <DialogTitle>Mod ekle</DialogTitle>
            <DialogDescription>
              {sub.name} için bir mod seç — bu kategoriyi kaydederken sorulacak
            </DialogDescription>
          </DialogHeader>

          {availableTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Eklenebilecek mod kalmadı.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {availableTypes.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleAssignMod(t)}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {ENTRY_VALUE_TYPE_LABELS[t.valueType ?? "number"]}
                      {t.unit
                        ? ` · ${t.unit}`
                        : t.choices?.length
                        ? ` · ${t.choices.join(", ")}`
                        : null}
                    </div>
                  </div>
                  <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Mod Input ────────────────────────────────────────────────────────────────

function ModInput({
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

  const labelRow = (
    <div className="flex items-center justify-between">
      <label className="text-sm font-medium">
        {mod.entryType.name}
        {mod.entryType.unit && (
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            ({mod.entryType.unit})
          </span>
        )}
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
          aria-label={`${mod.entryType.name} modunu bu girdiden çıkar`}
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
