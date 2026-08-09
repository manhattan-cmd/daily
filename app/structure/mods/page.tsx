"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  listMods,
  createMod,
  renameMod,
  setModMeasure,
  deleteMod,
  findModByName,
  type ModMeasure,
  type ModWithType,
} from "@/lib/db/queries";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  MEASURE_KIND_META,
  MEASURE_UI_KINDS,
  measureSummary,
  uiKindOf,
  type MeasureUiKind,
} from "@/lib/measure-kinds";
import { chipClass } from "@/components/ui/section-nav";
import { MeasureEditor, isMeasureComplete } from "@/components/structure/measure-editor";
import {
  ModAtom,
  ModAtomAdd,
  ModAtomCore,
  modAtomIcon,
} from "@/components/structure/mod-atom";
import { StructureTabs } from "@/components/structure/structure-tabs";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

type Usage = { count: number; places: string[]; valueCount: number };

export default function ModsHomePage() {
  const t = useT();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [measure, setMeasure] = useState<ModMeasure>({ valueType: "number" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Atom detayı — dokununca açılır; düzenleme aynı diyalog içinde görünüm
  // geçişiyle yapılır (üst üste dialog açmak kırılgan)
  const [selected, setSelected] = useState<ModWithType | null>(null);
  const [detailView, setDetailView] = useState<"info" | "edit">("info");
  const [editName, setEditName] = useState("");
  const [editMeasure, setEditMeasure] = useState<ModMeasure>({ valueType: "number" });
  const [editError, setEditError] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Havuzda arama — büyüteç açar, yazdıkça iki bölüm birden süzülür
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  // Ölçüm türü süzgeci — "hangileri skala" sorusu havuz büyüdükçe soruluyor
  const [kindFilter, setKindFilter] = useState<MeasureUiKind | null>(null);

  const mods = useLiveQuery(() => listMods(), []);
  // Havuzda kullanılan birimler — yeni özellikte önce bunlar önerilir ki
  // "adet / Adet / tane" diye ayrışıp toplanamaz hale gelmesin
  const knownUnits = [
    ...new Set((mods ?? []).map((m) => m.unit?.trim()).filter((u): u is string => !!u)),
  ].sort((a, b) => a.localeCompare(b, "en"));

  const usage = useLiveQuery(async () => {
    const [attachments, cats, subs, values] = await Promise.all([
      db.categoryModifiers.toArray(),
      db.categories.toArray(),
      db.subcategories.toArray(),
      db.entryValues.toArray(),
    ]);
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const subName = new Map(subs.map((s) => [s.id, s.name]));
    const map = new Map<string, Usage>();
    for (const a of attachments) {
      if (!a.modId) continue;
      const u = map.get(a.modId) ?? { count: 0, places: [], valueCount: 0 };
      u.count++;
      const place =
        a.targetType === "category"
          ? catName.get(a.targetId)
          : subName.get(a.targetId);
      if (place && u.places.length < 4) u.places.push(place);
      map.set(a.modId, u);
    }
    for (const v of values) {
      if (!v.modId) continue;
      const u = map.get(v.modId) ?? { count: 0, places: [], valueCount: 0 };
      u.valueCount++;
      map.set(v.modId, u);
    }
    return map;
  }, []);

  function openDetail(mod: ModWithType) {
    setSelected(mod);
    setDetailView("info");
    setEditError(false);
  }

  function openEdit(mod: ModWithType) {
    setEditName(mod.name);
    setEditMeasure({
      valueType: mod.valueType ?? "number",
      unit: mod.unit,
      choices: mod.choices,
      scaleLabels: mod.scaleLabels,
    });
    setEditError(false);
    setDetailView("edit");
  }

  async function handleCreate() {
    if (!name.trim() || !isMeasureComplete(measure)) return;
    setSaving(true);
    setError(null);
    try {
      const clash = await findModByName(name);
      if (clash) {
        setError(t("features.nameClashOf", { name: clash.name }));
        return;
      }
      await createMod(name, measure);
      setCreateOpen(false);
      setName("");
      setMeasure({ valueType: "number" });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit() {
    if (!selected) return;
    setEditSaving(true);
    try {
      const trimmed = editName.trim();
      if (!trimmed) return;
      if (trimmed !== selected.name) {
        const ok = await renameMod(selected.id, trimmed);
        if (!ok) {
          setEditError(true);
          return;
        }
      }
      // Ölçü değişikliği — mod + tüm atamaları senkronlanır
      await setModMeasure(selected.id, editMeasure);
      setSelected(null);
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(mod: ModWithType) {
    const u = usage?.get(mod.id);
    const ok = await confirmDialog({
      title: t("confirm.deleteFeature", { name: mod.name }),
      body:
        u && (u.count > 0 || u.valueCount > 0)
          ? t("confirm.deleteFeatureUsage", {
              places: u.count,
              values: u.valueCount,
            })
          : undefined,
      destructive: true,
    });
    if (!ok) return;
    await deleteMod(mod.id);
    setSelected(null);
  }

  const selectedUsage = selected ? usage?.get(selected.id) : undefined;

  const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
  const visibleMods = (mods ?? []).filter(
    (m) =>
      (!search || norm(m.name).includes(norm(search))) &&
      (!kindFilter || uiKindOf(m) === kindFilter)
  );
  // Havuzda gerçekten bulunan türler, sabit sırada
  const presentKinds = MEASURE_UI_KINDS.filter((k) =>
    (mods ?? []).some((m) => uiKindOf(m) === k)
  );

  return (
    <>
      {/* Açıklama diğer Yapı sayfalarıyla aynı tek satırlık kalıpta: iki
          satıra taşınca başlık uzuyor ve sekme şeridi aşağı kayıyordu.
          Uzun anlatım sekmelerin altına indi. */}
      <PageHeader
        title={t("structure.title")}
        description={t("features.lead")}
        action={
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                setSearchOpen((v) => !v);
                if (searchOpen) {
                  setSearch("");
                  setKindFilter(null);
                }
              }}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full transition-colors",
                searchOpen
                  ? "bg-primary/15 text-primary"
                  : "bg-white/8 text-muted-foreground hover:bg-white/12 hover:text-foreground"
              )}
              aria-label={searchOpen ? t("features.closeSearch") : t("features.search")}
            >
              <Search className="h-3.5 w-3.5" />
            </button>
            <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("features.new")}
            </Button>
          </div>
        }
      />

      <StructureTabs />

      <p className="mb-5 -mt-2 px-1 text-[11px] leading-snug text-muted-foreground/70">
        {t("features.blurb")}
      </p>

      {searchOpen && (
        <div className="mb-5 flex flex-col gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("features.searchPlaceholder")}
              autoFocus
              className="h-9 pl-9 pr-8"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 hover:text-foreground transition-colors"
                aria-label={t("features.clearSearch")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Ölçüm türüne göre süzme — yalnız havuzda GERÇEKTEN bulunan
              türler çipe dönüşür; boş süzgeç sunmak kalabalıktan ibaret */}
          {presentKinds.length > 1 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setKindFilter(null)}
                className={chipClass(kindFilter === null)}
              >
                {t("features.allKinds")}
              </button>
              {presentKinds.map((k) => {
                const meta = MEASURE_KIND_META[k];
                const Icon = meta.icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKindFilter(kindFilter === k ? null : k)}
                    className={cn(chipClass(kindFilter === k), "gap-1.5")}
                  >
                    <Icon className="h-3 w-3 opacity-70" />
                    {t(meta.labelKey)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tek havuz: uygulamayla gelen özellikle kullanıcının yarattığı
          arasında ayrım yok — ikisi de aynı şekilde düzenlenir ve silinir */}
      {mods === undefined ? null : (
        <section className="mb-6">
          <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
            {visibleMods.map((mod) => (
              <ModAtom
                key={mod.id}
                icon={modAtomIcon(mod)}
                name={mod.name}
                onClick={() => openDetail(mod)}
              />
            ))}
            {!search && !kindFilter && (
              <ModAtomAdd
                label={mods.length ? t("features.createNew") : t("features.first")}
                onClick={() => setCreateOpen(true)}
              />
            )}
          </div>

          {visibleMods.length === 0 && (search || kindFilter) && (
            <p className="mt-3 px-1 text-xs text-muted-foreground/70">
              {search
                ? t("features.noMatch", { q: search })
                : t("features.noneOfKind")}
            </p>
          )}
        </section>
      )}

      {/* Atom detayı — bilgi + yeniden adlandırma tek diyalogda */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          {selected && detailView === "info" && (
            <>
              <DialogHeader className="items-center text-center">
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" />
                <DialogTitle className="text-base pt-1">
                  {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {measureSummary(selected)}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground text-center">
                {selectedUsage &&
                (selectedUsage.count > 0 || selectedUsage.valueCount > 0) ? (
                  <>
                    {selectedUsage.places.length > 0 && (
                      <>
                        {selectedUsage.places.join(", ")}
                        {selectedUsage.count > selectedUsage.places.length &&
                          ` +${selectedUsage.count - selectedUsage.places.length}`}
                        {" · "}
                      </>
                    )}
                    {t("features.recordCount", { n: selectedUsage.valueCount })}
                  </>
                ) : (
                  t("features.notUsedYet")
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5"
                  onClick={() => openEdit(selected)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  {t("action.edit")}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(selected)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("action.delete")}
                </Button>
              </div>
            </>
          )}
          {selected && detailView === "edit" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <button
                    onClick={() => setDetailView("info")}
                    className="h-6 w-6 -ml-1 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    aria-label={t("features.backToDetail")}
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  {t("features.edit")}
                </DialogTitle>
                <DialogDescription>{t("features.renameHint")}</DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-2">
                  <Label htmlFor="edit-mod-name">{t("features.name")}</Label>
                  <Input
                    id="edit-mod-name"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setEditError(false); }}
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); }}
                  />
                  {editError && (
                    <p className="text-xs text-amber-300/90">
                      {t("features.nameClash")}
                    </p>
                  )}
              </div>

              {/* Nasıl ölçülüyor — ölçü artık ayrı bir nesne değil */}
              <MeasureEditor
                value={editMeasure}
                onChange={setEditMeasure}
                knownUnits={knownUnits}
              />
              {selectedUsage && selectedUsage.valueCount > 0 && (
                <p className="text-xs text-amber-300/90">
                  {t("measure.changeWarning", { n: selectedUsage.valueCount })}
                </p>
              )}

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDetailView("info")}
                  disabled={editSaving}
                >
                  {t("action.cancel")}
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={
                    editSaving ||
                    !isMeasureComplete(editMeasure) ||
                    !editName.trim()
                  }
                >
                  {t("action.save")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Yeni mod */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="gap-4 max-h-[80dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{t("features.createNew")}</DialogTitle>
            <DialogDescription>
              {t("features.createHint")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pool-mod-name">{t("features.name")}</Label>
            <Input
              id="pool-mod-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder={t("features.namePlaceholder")}
              autoFocus
            />
          </div>
          <MeasureEditor
            value={measure}
            onChange={setMeasure}
            knownUnits={knownUnits}
          />
          {error && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200/90">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={saving}
            >
              {t("action.cancel")}
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !isMeasureComplete(measure)}
            >
              {t("action.create")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
