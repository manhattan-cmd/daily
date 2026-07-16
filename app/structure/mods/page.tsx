"use client";

import { useState } from "react";
import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import {
  ArrowLeft,
  ChevronRight,
  Pencil,
  Plus,
  Ruler,
  Trash2,
} from "lucide-react";
import { db } from "@/lib/db";
import {
  listMods,
  createMod,
  renameMod,
  deleteMod,
  findModByName,
  listEntryTypes,
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
import { MEASURE_KIND_META, measureSummary } from "@/lib/measure-kinds";
import {
  ModAtom,
  ModAtomAdd,
  ModAtomCore,
  modAtomIcon,
} from "@/components/structure/mod-atom";
import { cn } from "@/lib/utils";

type Usage = { count: number; places: string[]; valueCount: number };

export default function ModsHomePage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [measureId, setMeasureId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Atom detayı — dokununca açılır; yeniden adlandırma aynı diyalog içinde
  // görünüm geçişiyle yapılır (üst üste dialog açmak kırılgan)
  const [selected, setSelected] = useState<ModWithType | null>(null);
  const [detailView, setDetailView] = useState<"info" | "rename">("info");
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState(false);

  const mods = useLiveQuery(() => listMods(), []);
  const measures = useLiveQuery(() => listEntryTypes(), []);

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
    setRenameError(false);
  }

  async function handleCreate() {
    if (!name.trim() || !measureId) return;
    setSaving(true);
    setError(null);
    try {
      const clash = await findModByName(name);
      if (clash) {
        setError(`"${clash.name}" adında bir özellik zaten var — özellik adları tekildir.`);
        return;
      }
      await createMod(name, measureId);
      setCreateOpen(false);
      setName("");
      setMeasureId(null);
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    if (!selected || !renameValue.trim()) return;
    const ok = await renameMod(selected.id, renameValue);
    if (!ok) {
      setRenameError(true);
      return;
    }
    setSelected(null);
  }

  async function handleDelete(mod: ModWithType) {
    const u = usage?.get(mod.id);
    const detail =
      u && (u.count > 0 || u.valueCount > 0)
        ? ` ${u.count} yerden kaldırılacak; ${u.valueCount} kayıt değeri ölçü adıyla kalacak.`
        : "";
    if (!confirm(`"${mod.name}" özelliği havuzdan silinsin mi?${detail}`)) return;
    await deleteMod(mod.id);
    setSelected(null);
  }

  const selectedUsage = selected ? usage?.get(selected.id) : undefined;

  return (
    <>
      <PageHeader
        title="Özellikler"
        description="Ölçülebilir en küçük birimler — her ad tekildir"
        back="/structure"
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Yeni Özellik
          </Button>
        }
      />

      {/* Ölçüler alt sayfası */}
      <Link
        href="/structure/mods/olculer"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 mb-6 transition-colors hover:bg-card/80 active:scale-[0.99]"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <Ruler className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium">Ölçüler</div>
          <div className="text-xs text-muted-foreground">
            Özelliklerin kullandığı ölçü türleri (Süre, Mesafe, Para...)
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </Link>

      {mods === undefined ? null : (
        <>
          {/* Yerleşik atomlar — dairesel, sık ızgara */}
          {mods.some((m) => m.isBuiltIn) && (
            <section className="mb-6">
              <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Yerleşik Özellikler
              </h2>
              <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
                {mods
                  .filter((m) => m.isBuiltIn)
                  .map((mod) => (
                    <ModAtom
                      key={mod.id}
                      icon={modAtomIcon(mod)}
                      name={mod.name}
                      onClick={() => openDetail(mod)}
                    />
                  ))}
              </div>
            </section>
          )}

          {/* Kullanıcı atomları */}
          <section className="mb-6">
            <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Senin Özelliklerin
            </h2>
            <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
              {mods
                .filter((m) => !m.isBuiltIn)
                .map((mod) => (
                  <ModAtom
                    key={mod.id}
                    icon={modAtomIcon(mod)}
                    name={mod.name}
                    onClick={() => openDetail(mod)}
                  />
                ))}
              <ModAtomAdd
                label={
                  mods.some((m) => !m.isBuiltIn) ? "Yeni yarat" : "İlk özelliğin"
                }
                onClick={() => setCreateOpen(true)}
              />
            </div>
          </section>
        </>
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
                  {measureSummary(selected.entryType)}
                  {selected.isBuiltIn && " · yerleşik"}
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
                    {selectedUsage.valueCount} kayıt
                  </>
                ) : (
                  "henüz kullanılmadı"
                )}
              </div>
              {!selected.isBuiltIn && (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5"
                    onClick={() => {
                      setRenameValue(selected.name);
                      setRenameError(false);
                      setDetailView("rename");
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Yeniden adlandır
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(selected)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sil
                  </Button>
                </div>
              )}
            </>
          )}
          {selected && detailView === "rename" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base flex items-center gap-2">
                  <button
                    onClick={() => setDetailView("info")}
                    className="h-6 w-6 -ml-1 flex items-center justify-center rounded-full text-muted-foreground hover:text-foreground transition-colors"
                    aria-label="Detaya dön"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                  </button>
                  Özelliği yeniden adlandır
                </DialogTitle>
                <DialogDescription>
                  Ad her yerde değişir — özellik tektir
                </DialogDescription>
              </DialogHeader>
              <Input
                value={renameValue}
                onChange={(e) => { setRenameValue(e.target.value); setRenameError(false); }}
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") handleRename(); }}
              />
              {renameError && (
                <p className="text-xs text-amber-300/90">
                  Bu adda başka bir özellik var — özellik adları tekildir.
                </p>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailView("info")}>
                  İptal
                </Button>
                <Button onClick={handleRename} disabled={!renameValue.trim()}>
                  Kaydet
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
            <DialogTitle className="text-base">Yeni özellik yarat</DialogTitle>
            <DialogDescription>
              Havuza eklenir; kategorilere Yapı sayfasından ya da girdi
              formundan bağlanır
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="pool-mod-name">Özellik adı</Label>
            <Input
              id="pool-mod-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setError(null); }}
              placeholder="örn. Yürüyüş süresi"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Ölçüsü</Label>
            <div className="flex flex-wrap gap-2">
              {(measures ?? []).map((t) => {
                const KindIcon = MEASURE_KIND_META[t.valueType ?? "number"].icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMeasureId(t.id)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-sm transition-colors",
                      measureId === t.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <KindIcon className="h-3.5 w-3.5 opacity-60" />
                    {t.name}
                    {t.unit && (
                      <span className="text-xs opacity-60">({t.unit})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
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
              İptal
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !name.trim() || !measureId}
            >
              Yarat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
