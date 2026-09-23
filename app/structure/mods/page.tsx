"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { db } from "@/lib/db";
import {
  listMods,
  createMod,
  renameMod,
  setModMeasure,
  setModColor,
  deleteMod,
  findModByName,
  type ModMeasure,
  type ModWithType,
} from "@/lib/db/queries";
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
} from "@/lib/measure-kinds";
import { MeasureEditor, isMeasureComplete } from "@/components/structure/measure-editor";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import {
  StructureAddButton,
  StructureHeader,
} from "@/components/structure/structure-header";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { modColor } from "@/lib/mod-color";
import { CATEGORY_COLORS } from "@/types";

/** Özelliğin bağlı olduğu bir yer — rengi kategorisinden gelir (alt kalemlerin
 *  kendi rengi yok, üstündeki kategorininkini taşırlar) */
type Place = { name: string; color: string };
type Usage = { count: number; places: Place[]; valueCount: number };

/**
 * Havuz her zaman ölçü türüne göre öbeklenir.
 *
 * Alfabetik ve "en çok kullanılan" dizilişleri de denendi ama havuzun üstüne
 * bir karar çubuğu koymak gerekiyordu; asıl soruya ("neyi ölçebiliyorum")
 * tek diziliş zaten cevap veriyor, aranan şeyi arayan yazıyor.
 */

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
  const [editColor, setEditColor] = useState<string>(CATEGORY_COLORS[0]);
  const [editError, setEditError] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  // Çok yere bağlı özellikte liste pencereyi taşırıyordu: ilk sekizi görünür,
  // gerisi "daha fazla" ile kaydırılabilir bir alanda açılıyor
  const [placesOpen, setPlacesOpen] = useState(false);
  // Havuzda arama — kutu hep açık. Büyütecin arkasına saklamak, 22 atomla
  // gelen bir havuzda aranan şeye giden yolu bir dokunuş uzatıyordu.
  const [search, setSearch] = useState("");

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
    const catColor = new Map(cats.map((c) => [c.id, c.color]));
    const asPlace = new Map<string, Place>([
      ...cats.map((c) => [c.id, { name: c.name, color: c.color }] as const),
      ...subs.map(
        (s) =>
          [
            s.id,
            { name: s.name, color: catColor.get(s.categoryId) ?? "" },
          ] as const
      ),
    ]);
    const map = new Map<string, Usage>();
    for (const a of attachments) {
      if (!a.modId) continue;
      const u = map.get(a.modId) ?? { count: 0, places: [], valueCount: 0 };
      u.count++;
      const place = asPlace.get(a.targetId);
      if (place) u.places.push(place);
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
    setPlacesOpen(false);
  }

  function openEdit(mod: ModWithType) {
    setEditName(mod.name);
    // Rengi yoksa adından türetileni göster: seçici boş başlamasın
    setEditColor(modColor(mod));
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
      await setModColor(selected.id, editColor);
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
  /**
   * Detayda gösterilen yer adları. Sıra atama sırasıydı — aynı özelliği iki
   * kez açınca liste başka türlü diziliyordu; alfabetik sıralayıp ilk sekizini
   * gösteriyoruz, kalanı "+N".
   */
  const allPlaces = [...(selectedUsage?.places ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, "tr")
  );
  const PLACE_PREVIEW = 8;
  const placeChips = placesOpen ? allPlaces : allPlaces.slice(0, PLACE_PREVIEW);
  /** Özelliğin rengi — detaydaki bütün yüzeyler bundan türüyor */
  const selectedColor = selected ? modColor(selected) : CATEGORY_COLORS[0];
  const SelectedKindIcon = selected
    ? MEASURE_KIND_META[uiKindOf(selected)].icon
    : MEASURE_KIND_META.number.icon;

  const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");
  const visibleMods = (mods ?? []).filter(
    (m) => !search || norm(m.name).includes(norm(search))
  );

  /** Havuzda gerçekten bulunan türler, sabit sırada — boş öbek başlığı yok */
  const groups = MEASURE_UI_KINDS.map((k) => ({
    kind: k,
    label: t(MEASURE_KIND_META[k].labelKey),
    icon: MEASURE_KIND_META[k].icon,
    items: visibleMods
      .filter((m) => uiKindOf(m) === k)
      .sort((x, y) => x.name.localeCompare(y.name, "tr")),
  })).filter((g) => g.items.length > 0);

  return (
    <>
      {/* Açıklama diğer Yapı sayfalarıyla aynı tek satırlık kalıpta: iki
          satıra taşınca başlık uzuyor ve sekme şeridi aşağı kayıyordu.
          Uzun anlatım sekmelerin altına indi. */}
      <StructureHeader
        action={
          <StructureAddButton
            labelKey="structure.addFeature"
            onClick={() => setCreateOpen(true)}
          />
        }
      />

      {/* Arama — hep açık; süzgeç çipleri kalktı, öbekleme zaten türe göre */}
      <div className="relative mb-5 mt-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/45" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("features.searchPlaceholder")}
          className="h-9 rounded-full pl-9 pr-8"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground/60 transition-colors hover:text-foreground"
            aria-label={t("features.clearSearch")}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* Tek havuz: uygulamayla gelen özellikle kullanıcının yarattığı
          arasında ayrım yok — ikisi de aynı şekilde düzenlenir ve silinir */}
      {mods === undefined ? null : (
        <section className="mb-6 flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.kind} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-0.5">
                <g.icon className="h-3 w-3 text-muted-foreground/45" />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/60">
                  {g.label}
                </span>
                <span className="h-px flex-1 bg-border/50" />
                <span className="text-[10.5px] tabular-nums text-muted-foreground/40">
                  {g.items.length}
                </span>
              </div>

              {/* Kartta YALNIZ ad. Birim, aralık ve seçenekler eskiden adın
                  altındaydı; iki sütunda yan yana gelince liste okunmuyordu —
                  hepsi atoma dokununca açılan detayda. */}
              <div className="grid grid-cols-2 gap-1.5">
                {g.items.map((mod) => (
                  <button
                    key={mod.id}
                    type="button"
                    onClick={() => openDetail(mod)}
                    className="flex items-center gap-2.5 rounded-xl border border-border/60 bg-card/50 px-2.5 py-2.5 text-left transition-colors hover:border-border hover:bg-[var(--sf-2)] active:scale-[0.99]"
                  >
                    <ModAtomCore
                      icon={modAtomIcon(mod)}
                      size="sm"
                      color={modColor(mod)}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium leading-tight">
                      {mod.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {!search && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 px-3 py-2.5 text-[12px] font-medium text-primary/70 transition-colors hover:border-primary/60 hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" />
              {mods.length ? t("features.createNew") : t("features.first")}
            </button>
          )}

          {visibleMods.length === 0 && search && (
            <p className="px-1 text-xs text-muted-foreground/70">
              {t("features.noMatch", { q: search })}
            </p>
          )}
        </section>
      )}

      {/* Atom detayı — bilgi + yeniden adlandırma tek diyalogda */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) setSelected(null); }}
      >
        <DialogContent className="max-w-[340px] gap-4 max-h-[85dvh] overflow-y-auto">
          {selected && detailView === "info" && (
            <>
              <DialogHeader className="items-center gap-1 text-center">
                <ModAtomCore
                  icon={modAtomIcon(selected)}
                  size="lg"
                  color={modColor(selected)}
                />
                <DialogTitle className="pt-1 text-base">
                  {selected.name}
                </DialogTitle>
                {/* Ölçü, özelliğin kimliği — rozet olarak kendi renginde */}
                <DialogDescription className="mt-0.5">
                  <span
                    className="mt-0.5 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{
                      color: modColor(selected),
                      borderColor: `${modColor(selected)}55`,
                      backgroundColor: `${modColor(selected)}14`,
                    }}
                  >
                    <SelectedKindIcon className="h-3 w-3" />
                    {measureSummary(selected)}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {/* Nerede kullanılıyor — düz virgüllü cümle yerine kalem kalem.
                  "Bu özelliği silersem ne gider" sorusunun cevabı burası.
                  Pencere özelliğin renginde hafifçe tonlanıyor; kapsüller ise
                  bağlı oldukları KATEGORİNİN renginde, böylece "Para nerelerde"
                  sorusu okumadan, renkten anlaşılıyor. */}
              <div
                className="flex flex-col gap-2 rounded-xl border px-3 py-3"
                style={{
                  borderColor: `${selectedColor}33`,
                  backgroundColor: `${selectedColor}0F`,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
                    {t("features.attachedTo")}
                  </span>
                  <span
                    className="h-px flex-1"
                    style={{ backgroundColor: `${selectedColor}2E` }}
                  />
                  <span className="text-[10px] tabular-nums text-muted-foreground/50">
                    {selectedUsage?.count ?? 0}
                  </span>
                </div>

                {allPlaces.length > 0 ? (
                  <>
                    <div
                      className={cn(
                        "flex flex-wrap gap-1",
                        placesOpen &&
                          "max-h-44 overflow-y-auto pr-0.5 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]"
                      )}
                    >
                      {placeChips.map((place, i) => (
                        <span
                          key={`${place.name}-${i}`}
                          className="rounded-md border px-2 py-0.5 text-[11px]"
                          style={{
                            color: place.color || undefined,
                            borderColor: place.color ? `${place.color}59` : undefined,
                            backgroundColor: place.color ? `${place.color}1A` : undefined,
                          }}
                        >
                          {place.name}
                        </span>
                      ))}
                    </div>
                    {allPlaces.length > PLACE_PREVIEW && (
                      <button
                        type="button"
                        onClick={() => setPlacesOpen((v) => !v)}
                        className="self-start text-[11px] font-medium text-muted-foreground/70 transition-colors hover:text-foreground"
                      >
                        {placesOpen
                          ? t("features.showLess")
                          : t("features.morePlaces", {
                              n: allPlaces.length - PLACE_PREVIEW,
                            })}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-[11.5px] text-muted-foreground/70">
                    {t("features.notUsedYet")}
                  </p>
                )}
              </div>

              {/* Kayıt sayısı kendi penceresinde: "kaç yere bağlı" ile
                  "kaç kez yazılmış" iki ayrı soru */}
              <div
                className="flex items-center justify-between rounded-xl border px-3 py-2.5"
                style={{
                  borderColor: `${selectedColor}33`,
                  backgroundColor: `${selectedColor}0F`,
                }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/70">
                  {t("features.recordsLabel")}
                </span>
                <span className="text-[12px] font-medium tabular-nums">
                  {t("features.recordCount", { n: selectedUsage?.valueCount ?? 0 })}
                </span>
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
                  {/* autoFocus yok — düzenlemeye girer girmez klavye açılıyordu */}
                  <Input
                    id="edit-mod-name"
                    value={editName}
                    onChange={(e) => { setEditName(e.target.value); setEditError(false); }}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(); }}
                  />
                  {editError && (
                    <p className="text-xs text-amber-300/90">
                      {t("features.nameClash")}
                    </p>
                  )}
              </div>

              {/* Renk — boşken addan türetiliyor, buradan sabitleniyor.
                  Girdi formunda özellikler yan yana duruyor ve hepsi aynı
                  renkteyken hangisi hangisi ancak okuyarak anlaşılıyordu. */}
              <div className="flex flex-col gap-2">
                <Label>{t("tree.colour")}</Label>
                <div className="grid grid-cols-5 gap-2">
                  {CATEGORY_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={cn(
                        "h-9 rounded-lg border-2 transition-all",
                        editColor === c ? "scale-105 border-foreground" : "border-transparent"
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={c}
                    />
                  ))}
                </div>
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

      {/* Yeni mod — başlıktaki çekirdek seçilen ölçüm türüyle birlikte
          değişir; yaratılan şeyin havuzdaki hâli daha ilk adımda görünür */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent
          className="gap-3.5 max-h-[85dvh] overflow-y-auto p-5"
          // Açıklama satırı kaldırıldı; Radix'in aria-describedby uyarısı
          // için bilinçli olarak yok deniyor
          aria-describedby={undefined}
          // Radix açılışta ilk odaklanabilir öğeye gider — o da ad alanı
          // olduğu için telefonda klavye daha ölçüm türü seçilmeden fırlıyordu.
          // Odağı panelin kendisinde bırakıyoruz (odak tuzağı korunur).
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLElement | null)?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base">
              <ModAtomCore
                icon={MEASURE_KIND_META[uiKindOf(measure)].icon}
                size="sm"
              />
              {t("features.createNew")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pool-mod-name">{t("features.name")}</Label>
            {/* autoFocus yok — diyalog açılır açılmaz telefon klavyesinin
                fırlaması ölçüm türünü seçmeden önce ekranı yarıya indiriyordu */}
            <Input
              id="pool-mod-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
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
