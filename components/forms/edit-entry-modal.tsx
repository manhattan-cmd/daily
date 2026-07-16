"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { nanoid } from "nanoid";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Link2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { db } from "@/lib/db";
import {
  createEntry,
  deleteEntry,
  linkEntryToGroup,
  listModifiersForTarget,
  updateEntry,
  getLinkedSiblingModIds,
  listEntryTypes,
  listMods,
  type CategoryModifierWithType,
  type ModWithType,
  type ParallelSub,
} from "@/lib/db/queries";
import {
  DateTimeRangeInput,
  formatDTRDisplay,
} from "@/components/forms/datetime-range-input";
import { ParallelPickList } from "@/components/forms/parallel-pick-dialog";
import { cn } from "@/lib/utils";
import { ENTRY_VALUE_TYPE_LABELS } from "@/types";
import type { EntryWithContext, EntryType } from "@/types";

interface EditEntryModalProps {
  entry: EntryWithContext;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditEntryModal({
  entry,
  open,
  onOpenChange,
}: EditEntryModalProps) {
  const mods = useLiveQuery(
    () => listModifiersForTarget("subcategory", entry.subcategoryId),
    [entry.subcategoryId]
  );
  const siblingModIds =
    (useLiveQuery(() => getLinkedSiblingModIds(entry.id), [entry.id]) ??
      new Set<string>());
  const allEntryTypes = useLiveQuery(() => listEntryTypes(), []);
  const poolMods = useLiveQuery(() => listMods(), []);

  // Satır anahtarı: isimli mod değerleri için modId, girdiye özel ölçüler için "t:<typeId>"
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of entry.values) {
      if (v.entryTypeId) init[v.modId ?? `t:${v.entryTypeId}`] = v.value;
    }
    return init;
  });

  // Bu girdiden çıkarılan satırlar (kategoriden değil)
  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  // Girdiye özel eklenen havuz modları (bu oturumda)
  const [extraModIds, setExtraModIds] = useState<string[]>([]);
  // Yeni eklenen özelliğin alanı — görünüme kaydırılıp odaklanır
  const [focusKey, setFocusKey] = useState<string | null>(null);

  // Modsuz eski değerler (migrasyon öncesi kalıntı) — ölçüyle gösterilir
  const [extraTypeIds] = useState<string[]>(() =>
    entry.values
      .filter((v) => v.entryTypeId && !v.modId && v.value)
      .map((v) => v.entryTypeId!)
  );

  // Paralel perspektifler: mevcut kardeşler (linkedGroup) + bu oturumda eklenenler.
  // Seçici ayrı bir dialog DEĞİL, bu dialog'un içinde bir görünüm — üst üste iki
  // Radix dialog'u kırılgandı (alttaki kendini kapatıp akışı limboda bırakıyordu)
  const [newParallels, setNewParallels] = useState<ParallelSub[]>([]);
  const [pickerView, setPickerView] = useState(false);

  // Kaydet sonrası adım adım perspektif formu — ekleme akışıyla aynı davranış:
  // her yeni perspektifin kendi modları sorulur, ana girdiden taşınan ortak
  // atomlar kilitli gösterilir
  const [pStep, setPStep] = useState<{
    sub: ParallelSub;
    index: number;
    total: number;
    groupId: string;
    carry: Record<string, string>;
  } | null>(null);
  const [pQueue, setPQueue] = useState<ParallelSub[]>([]);
  const [pValues, setPValues] = useState<Record<string, string>>({});
  const [pSaving, setPSaving] = useState(false);
  // Akışta en az bir perspektif girdisi yaratıldı mı — ana girdi ancak o zaman
  // (ve akışın SONUNDA) gruba bağlanır; erken bağlamak kartı LinkedEntryCard'a
  // çevirip bu modalı unmount ediyor
  const pCreated = useRef(false);
  const pStepSubId = pStep?.sub.id ?? "";
  const stepMods =
    useLiveQuery(
      async () =>
        pStepSubId
          ? listModifiersForTarget("subcategory", pStepSubId)
          : ([] as CategoryModifierWithType[]),
      [pStepSubId]
    ) ?? [];

  // Modal kapanınca adım akışı sıfırlanır (component EntryCard'da hep mount)
  useEffect(() => {
    if (!open) {
      setPStep(null);
      setPQueue([]);
      setPValues({});
      setNewParallels([]);
      setPickerView(false);
    }
  }, [open]);

  const pValueKey = (m: CategoryModifierWithType) => m.modId ?? m.id;
  const pSharedKey = (m: CategoryModifierWithType) => m.modId ?? m.entryTypeId;

  async function advanceParallel(
    queue: ParallelSub[],
    groupId: string,
    index: number,
    total: number,
    carry: Record<string, string>
  ) {
    if (!queue.length) {
      setPStep(null);
      setPQueue([]);
      setPValues({});
      onOpenChange(false);
      // Ana girdi en son bağlanır (yalnızca gerçekten perspektif yaratıldıysa)
      if (pCreated.current && !entry.linkedGroupId) {
        await linkEntryToGroup(entry.id, groupId);
      }
      return;
    }
    setPQueue(queue.slice(1));
    setPValues({});
    setPStep({ sub: queue[0], index: index + 1, total, groupId, carry });
  }

  async function handleParallelStepSave() {
    if (!pStep) return;
    setPSaving(true);
    try {
      const typeValues: { entryTypeId: string; value: string; modId?: string }[] = [];
      const carryNext = { ...pStep.carry };
      const used = new Set<string>();
      for (const m of stepMods) {
        const key = pSharedKey(m);
        if (used.has(key)) continue;
        const v = pStep.carry[key] ?? pValues[pValueKey(m)] ?? "";
        if (v === "") continue;
        typeValues.push({ entryTypeId: m.entryTypeId, modId: m.modId, value: v });
        carryNext[key] = v;
        used.add(key);
      }
      await createEntry({
        subcategoryId: pStep.sub.id,
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        linkedGroupId: pStep.groupId,
      });
      pCreated.current = true;
      await advanceParallel(
        pQueue,
        pStep.groupId,
        pStep.index,
        pStep.total,
        carryNext
      );
    } finally {
      setPSaving(false);
    }
  }
  const siblings =
    useLiveQuery(async () => {
      if (!entry.linkedGroupId) return [];
      const sibs = await db.entries
        .where("linkedGroupId")
        .equals(entry.linkedGroupId)
        .filter((e) => e.id !== entry.id)
        .toArray();
      const out: { id: string; subcategoryId: string; catName: string; subName: string }[] = [];
      for (const s of sibs) {
        const sub = await db.subcategories.get(s.subcategoryId);
        const cat = sub ? await db.categories.get(sub.categoryId) : undefined;
        out.push({
          id: s.id,
          subcategoryId: s.subcategoryId,
          catName: cat?.name ?? "—",
          subName: sub?.isCategoryRoot ? (cat?.name ?? "—") : (sub?.name ?? "—"),
        });
      }
      return out;
    }, [entry.id, entry.linkedGroupId]) ?? [];

  // Seçicide gizlenecekler: girdinin kendisi + zaten perspektifi olan altlar
  const hiddenSubIds = new Set([
    entry.subcategoryId,
    ...siblings.map((s) => s.subcategoryId),
  ]);

  async function removeSibling(sib: { id: string; subName: string }) {
    if (!confirm(`"${sib.subName}" perspektifi ve girdisi silinsin mi?`)) return;
    await deleteEntry(sib.id);
  }

  const [addModOpen, setAddModOpen] = useState(false);
  const [notes, setNotes] = useState(entry.notes ?? "");
  const [showNotes, setShowNotes] = useState(!!entry.notes);
  const [occurredAt, setOccurredAt] = useState(() => {
    const d = new Date(entry.occurredAt);
    d.setSeconds(0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [saving, setSaving] = useState(false);

  const entryTypeMap = useMemo(() => {
    const map = new Map<string, EntryType>();
    for (const t of allEntryTypes ?? []) map.set(t.id, t);
    return map;
  }, [allEntryTypes]);

  // Sıralı satır listesi: alt kategorinin isimli modları, sonra girdiye özel ölçüler
  type Row = {
    key: string;
    modId?: string;
    entryTypeId: string;
    label: string;
    entryType: EntryType;
  };
  const poolModMap = useMemo(() => {
    const map = new Map<string, ModWithType>();
    for (const m of poolMods ?? []) map.set(m.id, m);
    return map;
  }, [poolMods]);

  const rows = useMemo<Row[]>(() => {
    const seen = new Set<string>();
    const result: Row[] = [];
    // Alt kategoriye atanmış modlar
    for (const a of mods ?? []) {
      const key = a.modId ?? a.id;
      if (removedKeys.has(key) || seen.has(key)) continue;
      result.push({
        key,
        modId: a.modId,
        entryTypeId: a.entryTypeId,
        label: a.name ?? a.entryType.name,
        entryType: a.entryType,
      });
      seen.add(key);
    }
    // Atanmamış ama bu girdide değeri olan havuz modları
    for (const v of entry.values) {
      if (!v.modId || !v.entryTypeId) continue;
      if (removedKeys.has(v.modId) || seen.has(v.modId)) continue;
      const t = v.entryType ?? entryTypeMap.get(v.entryTypeId);
      if (!t) continue;
      result.push({
        key: v.modId,
        modId: v.modId,
        entryTypeId: v.entryTypeId,
        label: v.mod?.name ?? poolModMap.get(v.modId)?.name ?? t.name,
        entryType: t,
      });
      seen.add(v.modId);
    }
    // Bu oturumda girdiye özel eklenen havuz modları
    for (const modId of extraModIds) {
      if (removedKeys.has(modId) || seen.has(modId)) continue;
      const m = poolModMap.get(modId);
      if (!m) continue;
      result.push({
        key: modId,
        modId,
        entryTypeId: m.entryTypeId,
        label: m.name,
        entryType: m.entryType,
      });
      seen.add(modId);
    }
    // Migrasyon öncesi modsuz değerler
    for (const typeId of extraTypeIds) {
      const key = `t:${typeId}`;
      if (removedKeys.has(key) || seen.has(key)) continue;
      const t = entryTypeMap.get(typeId);
      if (!t) continue;
      result.push({ key, entryTypeId: typeId, label: t.name, entryType: t });
      seen.add(key);
    }
    return result;
  }, [mods, extraModIds, extraTypeIds, removedKeys, entry.values, entryTypeMap, poolModMap]);

  // Girdiye özel eklenebilecek havuz modları
  const availableToAdd = useMemo(() => {
    const visibleModIds = new Set(rows.map((r) => r.modId).filter(Boolean));
    return (poolMods ?? []).filter((m) => !visibleModIds.has(m.id));
  }, [poolMods, rows]);

  const entryDate = new Date(entry.occurredAt).toISOString().split("T")[0];

  function handleRemove(key: string) {
    setRemovedKeys((prev) => new Set([...prev, key]));
  }

  function handleAddMod(modId: string) {
    setRemovedKeys((prev) => {
      const next = new Set(prev);
      next.delete(modId);
      return next;
    });
    setExtraModIds((prev) =>
      prev.includes(modId) ? prev : [...prev, modId]
    );
    setFocusKey(modId);
    setAddModOpen(false);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const typeValues = rows
        .filter((r) => (values[r.key] ?? "") !== "")
        .map((r) => ({
          entryTypeId: r.entryTypeId,
          modId: r.modId,
          value: values[r.key],
        }));
      await updateEntry(entry.id, {
        typeValues,
        occurredAt: new Date(occurredAt).getTime(),
        notes: notes.trim() || undefined,
      });
      // Yeni perspektifler — ekleme akışındaki gibi her biri için form açılır;
      // güncellenen değerler ortak atomlara kilitli taşınır. Grup id'si bellekte
      // üretilir, ana girdiye akışın sonunda yazılır (advanceParallel).
      if (newParallels.length) {
        const groupId = entry.linkedGroupId ?? nanoid(12);
        pCreated.current = false;
        const carry: Record<string, string> = {};
        for (const tv of typeValues) carry[tv.modId ?? tv.entryTypeId] = tv.value;
        const queue = [...newParallels];
        setNewParallels([]);
        setPQueue(queue.slice(1));
        setPValues({});
        setPStep({
          sub: queue[0],
          index: 1,
          total: queue.length,
          groupId,
          carry,
        });
        return; // modal açık kalır, perspektif adımına geçilir
      }
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto gap-5">
          {pStep ? (
            /* Perspektif adımı — ekleme akışındaki "Kaydet ve devam" davranışı */
            <>
              <DialogHeader>
                <div className="flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-violet-400" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-violet-400/80">
                    {pStep.sub.categoryName}
                    {pStep.total > 1 && ` · ${pStep.index}/${pStep.total}`}
                  </span>
                </div>
                <DialogTitle>
                  {pStep.sub.isCategoryRoot
                    ? pStep.sub.categoryName
                    : pStep.sub.name}
                </DialogTitle>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {stepMods.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/50 bg-muted/20 px-4 py-4 text-center text-sm text-muted-foreground">
                    Bu perspektifte mod yok — doğrudan kaydedebilirsin
                  </p>
                ) : (
                  stepMods.map((m) => {
                    const carried = pStep.carry[pSharedKey(m)];
                    const label = m.name ?? m.entryType.name;
                    if (carried !== undefined && carried !== "") {
                      const vt = m.entryType.valueType ?? "number";
                      const display =
                        vt === "boolean"
                          ? carried === "true"
                            ? "Evet"
                            : "Hayır"
                          : vt === "datetime-range"
                            ? formatDTRDisplay(carried)
                            : carried;
                      return (
                        <div key={m.id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium">
                              {label}
                              {m.entryType.unit && (
                                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                                  ({m.entryType.unit})
                                </span>
                              )}
                            </label>
                            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
                              <Link2 className="h-3 w-3" />
                              ana girdiden
                            </span>
                          </div>
                          <div className="flex h-10 items-center rounded-xl border border-violet-500/30 bg-violet-500/8 px-3 text-sm text-muted-foreground/80 select-none">
                            {display}
                          </div>
                        </div>
                      );
                    }
                    return (
                      <ModInput
                        key={m.id}
                        label={label}
                        entryType={m.entryType}
                        value={pValues[pValueKey(m)] ?? ""}
                        onChange={(v) =>
                          setPValues((prev) => ({
                            ...prev,
                            [pValueKey(m)]: v,
                          }))
                        }
                        entryDate={entryDate}
                      />
                    );
                  })
                )}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={pSaving}
                  onClick={() =>
                    advanceParallel(
                      pQueue,
                      pStep.groupId,
                      pStep.index,
                      pStep.total,
                      pStep.carry
                    )
                  }
                >
                  Geç
                </Button>
                <Button
                  onClick={handleParallelStepSave}
                  disabled={pSaving}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  {pSaving
                    ? "Kaydediliyor..."
                    : pStep.index < pStep.total
                      ? "Kaydet ve devam →"
                      : "Kaydet"}
                </Button>
              </DialogFooter>
            </>
          ) : pickerView ? (
            /* Perspektif seçici görünümü — aynı dialog içinde, üst üste dialog yok */
            <>
              <DialogHeader>
                <DialogTitle>Paralel perspektif seç</DialogTitle>
                <DialogDescription>
                  Bu girdiyi hangi kategoride de takip etmek istersin?
                </DialogDescription>
              </DialogHeader>

              <ParallelPickList
                excludeCategoryId={entry.category.id}
                hiddenSubIds={hiddenSubIds}
                selected={newParallels}
                onAdd={(ps) => setNewParallels((prev) => [...prev, ps])}
                onRemove={(id) =>
                  setNewParallels((prev) => prev.filter((p) => p.id !== id))
                }
              />

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setPickerView(false)}
                  disabled={saving}
                >
                  Geri
                </Button>
                <Button
                  disabled={saving}
                  onClick={() => {
                    setPickerView(false);
                    // Seçim varsa akış hemen başlar: düzenlemeler kaydedilir,
                    // her perspektif için adım formu açılır
                    if (newParallels.length) void handleSave();
                  }}
                >
                  {saving
                    ? "Kaydediliyor..."
                    : newParallels.length
                      ? "Devam →"
                      : "Tamam"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
          <DialogHeader>
            <DialogTitle>{entry.subcategory.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            {/* Mod inputs */}
            {rows.map((row) => (
              <ModInput
                key={row.key}
                label={row.label}
                entryType={row.entryType}
                value={values[row.key] ?? ""}
                onChange={(v) =>
                  setValues((prev) => ({ ...prev, [row.key]: v }))
                }
                onRemove={() => handleRemove(row.key)}
                isShared={!!row.modId && siblingModIds.has(row.modId)}
                entryDate={entryDate}
                autoFocus={row.key === focusKey}
              />
            ))}

            {/* Add mod to this entry only */}
            {availableToAdd.length > 0 && (
              <button
                type="button"
                onClick={() => setAddModOpen(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Bu girdiye özellik ekle
              </button>
            )}

            {/* Paralel perspektifler — mevcutlar + bu oturumda eklenenler */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-violet-400/70" />
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Paralel perspektifler
                </span>
              </div>
              {siblings.map((sib) => (
                <div
                  key={sib.id}
                  className="flex items-center gap-3 rounded-xl border border-violet-500/50 bg-violet-500/10 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0 leading-tight">
                    <span className="text-xs text-muted-foreground">
                      {sib.catName}
                    </span>
                    <span className="text-xs text-muted-foreground mx-1">/</span>
                    <span className="text-sm font-medium">{sib.subName}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSibling(sib)}
                    className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-destructive transition-colors shrink-0"
                    aria-label={`${sib.subName} perspektifini sil`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {newParallels.map((ps) => (
                <div
                  key={ps.id}
                  className="flex items-center gap-3 rounded-xl border border-dashed border-violet-500/40 bg-violet-500/5 px-3 py-2.5"
                >
                  <div className="flex-1 min-w-0 leading-tight">
                    <span className="text-xs text-muted-foreground">
                      {ps.categoryName}
                    </span>
                    <span className="text-xs text-muted-foreground mx-1">/</span>
                    <span className="text-sm font-medium">
                      {ps.isCategoryRoot ? ps.categoryName : ps.name}
                    </span>
                    <span className="ml-1.5 text-[10px] text-violet-300/60">
                      kaydedince detayları sorulacak
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setNewParallels((prev) =>
                        prev.filter((p) => p.id !== ps.id)
                      )
                    }
                    className="h-5 w-5 flex items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground transition-colors shrink-0"
                    aria-label={`${ps.name} paralel perspektifini kaldır`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPickerView(true)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors self-start"
              >
                <Plus className="h-3.5 w-3.5" />
                {siblings.length > 0 || newParallels.length > 0
                  ? "Başka perspektif ekle"
                  : "Paralel perspektif ekle"}
              </button>
            </div>

            {/* Date */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Tarih & Saat</label>
              <Input
                type="datetime-local"
                value={occurredAt}
                onChange={(e) => setOccurredAt(e.target.value)}
              />
            </div>

            {/* Notes */}
            <div>
              <button
                type="button"
                onClick={() => setShowNotes(!showNotes)}
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
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Bu girdiyle ilgili bir not..."
                  rows={3}
                  className="mt-2 w-full resize-none rounded-xl border border-border bg-input px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              İptal
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? "Kaydediliyor..."
                : newParallels.length > 0
                  ? "Kaydet ve devam →"
                  : "Kaydet"}
            </Button>
          </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Add-mod picker — sibling dialog to avoid nesting issues */}
      <Dialog open={addModOpen} onOpenChange={setAddModOpen}>
        <DialogContent className="gap-4 max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              Bu girdiye özellik ekle
              <span className="block text-xs font-normal text-muted-foreground mt-0.5">
                Yalnızca bu girdi için geçerli olacak
              </span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {availableToAdd.map((m) => (
              <button
                key={m.id}
                onClick={() => handleAddMod(m.id)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted active:scale-[0.99]"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{m.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {m.entryType.name !== m.name && `${m.entryType.name} · `}
                    {ENTRY_VALUE_TYPE_LABELS[m.entryType.valueType ?? "number"]}
                    {m.entryType.unit
                      ? ` · ${m.entryType.unit}`
                      : m.entryType.choices?.length
                      ? ` · ${m.entryType.choices.join(", ")}`
                      : null}
                  </div>
                </div>
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ModInput({
  label,
  entryType,
  value,
  onChange,
  onRemove,
  isShared = false,
  entryDate,
  autoFocus = false,
}: {
  label: string;
  entryType: EntryType;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  isShared?: boolean;
  entryDate?: string;
  /** Yeni eklenen özellik: alan görünüme kaydırılır, yazı alanları odaklanır */
  autoFocus?: boolean;
}) {
  const vt = entryType.valueType ?? "number";
  const today = new Date().toISOString().split("T")[0];
  const scrolledRef = useRef(false);
  const scrollOnMount = (el: HTMLDivElement | null) => {
    if (el && autoFocus && !scrolledRef.current) {
      scrolledRef.current = true;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  };

  return (
    <div className="flex flex-col gap-1.5" ref={scrollOnMount}>
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">
          {label}
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
            {label !== entryType.name && `${entryType.name} `}
            {entryType.unit && `(${entryType.unit})`}
          </span>
        </label>
        <div className="flex items-center gap-2">
          {isShared && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-violet-400/70">
              <Link2 className="h-3 w-3" />
              tüm perspektifler
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-md p-0.5 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              aria-label="Bu girdiden kaldır"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

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
          placeholder="Metin gir..."
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
          {value === "true" ? "Evet" : "Hayır"}
        </button>
      )}

      {vt === "select" && (
        <div className="flex flex-wrap gap-2">
          {(entryType.choices ?? []).map((choice) => (
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
