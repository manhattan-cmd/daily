"use client";

import { useT } from "@/lib/i18n";
import { useState } from "react";
import { Plus, Unlink } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import {
  countDescendantModAttachments,
  listModifiersForTarget,
  removeModifier,
  removeModifierCascade,
  type CategoryModifierWithType,
} from "@/lib/db/queries";
import { ModPickDialog } from "@/components/structure/mod-pick-dialog";
import {
  ModAtom,
  ModAtomAdd,
  ModAtomCore,
  modAtomIcon,
} from "@/components/structure/mod-atom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Layer } from "@/components/ui/layer";
import { SummaryBlock, SummaryTile } from "@/components/ui/summary-block";
import { useIsBrutal } from "@/components/structure/brutal";
import { measureSummary } from "@/lib/measure-kinds";
import { modColor } from "@/lib/mod-color";

interface ModifierSectionProps {
  targetType: "category" | "subcategory";
  targetId: string;
  targetName: string;
}

export function ModifierSection({
  targetType,
  targetId,
  targetName,
}: ModifierSectionProps) {
  const t = useT();
  const brutal = useIsBrutal();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Atoma dokununca açılan detay — çıkarma da buradan
  const [selected, setSelected] = useState<CategoryModifierWithType | null>(
    null
  );
  // null: detay görünümü; 0: "çıkarılsın mı?" onayı; >0: "altlardan da?" sorusu
  const [cascadeCount, setCascadeCount] = useState<number | null>(null);

  const mods = useLiveQuery(
    () => listModifiersForTarget(targetType, targetId),
    [targetType, targetId]
  );

  const selectedColor = selected
    ? modColor(selected.mod ?? { name: selected.name ?? selected.entryType.name })
    : "#818cf8";

  function closeDetail() {
    setSelected(null);
    setCascadeCount(null);
  }

  async function handleDetach() {
    if (!selected) return;
    const count = selected.modId
      ? await countDescendantModAttachments(targetType, targetId, selected.modId)
      : 0;
    // Aynı dialog içinde onaya geç (altlarda da ekliyse kapsam sorusuyla)
    setCascadeCount(count);
  }

  async function handleDetachOnlyHere() {
    if (!selected) return;
    await removeModifier(selected.id);
    closeDetail();
  }

  async function handleDetachCascade() {
    if (!selected) return;
    await removeModifierCascade(selected.id);
    closeDetail();
  }

  const atoms = (mods ?? []).map((mod) => (
    <ModAtom
      key={mod.id}
      icon={modAtomIcon(mod)}
      name={mod.name ?? mod.entryType.name}
      // Özelliğin kendi rengi — girdi formu ve özellikler sayfasıyla aynı
      color={modColor(mod.mod ?? { name: mod.name ?? mod.entryType.name })}
      onClick={() => setSelected(mod)}
    />
  ));

  const dialogs = (
    <>
      {/* Atom detayı — ölçüsü + buradan çıkarma */}
      <Dialog
        open={selected !== null}
        onOpenChange={(o) => { if (!o) closeDetail(); }}
      >
        <DialogContent className="max-w-[340px] gap-4">
          {selected && cascadeCount === null && (
            <>
              <DialogHeader className="items-center gap-1 text-center">
                {/* Özellikler sayfasındaki pencereyle aynı: kendi renginde atom,
                    ölçüsü kendi renginde rozet */}
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" color={selectedColor} />
                <DialogTitle className="pt-1 text-base">
                  {selected.name ?? selected.entryType.name}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  <span
                    data-kind-badge=""
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{ color: selectedColor, borderColor: `${selectedColor}55`, backgroundColor: `${selectedColor}14` }}
                  >
                    {measureSummary(selected.entryType)}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDetach}
              >
                <Unlink className="h-3.5 w-3.5" />
                {t(targetType === "category" ? "mods.detachFromCat" : "mods.detachFromSub")}
              </Button>
            </>
          )}

          {/* Çıkarma onayı — uyarı burada */}
          {selected && cascadeCount === 0 && (
            <>
              <DialogHeader className="items-center gap-1 text-center">
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" color={selectedColor} />
                <DialogTitle className="pt-1 text-base">{t("mods.detachConfirm")}</DialogTitle>
                <DialogDescription>
                  {t("mods.detachWarn", { name: selected.name ?? selected.entryType.name, target: targetName })}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDetachOnlyHere}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  {t("mods.detach")}
                </Button>
                <Button variant="ghost" className="text-muted-foreground" onClick={() => setCascadeCount(null)}>
                  {t("action.cancel")}
                </Button>
              </div>
            </>
          )}

          {/* Altlarda da ekliyse: aynı dialogda kapsam sorusu */}
          {selected && cascadeCount !== null && cascadeCount > 0 && (
            <>
              <DialogHeader className="items-center text-center">
                <ModAtomCore icon={modAtomIcon(selected)} size="lg" color={selectedColor} />
                <DialogTitle className="text-base pt-1">
                  Alt kategorilerden de çıkarılsın mı?
                </DialogTitle>
                <DialogDescription>
                  &bdquo;{selected.name ?? selected.entryType.name}&rdquo;{" "}
                  bunun altındaki {cascadeCount} alt kategoriye de ekli.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDetachCascade}
                >
                  <Unlink className="h-3.5 w-3.5" />
                  Hepsinden çıkar ({cascadeCount + 1})
                </Button>
                <Button variant="outline" onClick={handleDetachOnlyHere}>
                  {t("mods.detachOnlyHere")}
                </Button>
                <Button
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setCascadeCount(null)}
                >
                  Vazgeç
                </Button>
              </div>
              <p className="text-center text-[11px] text-muted-foreground/60 -mt-2">
                Bu özellikle girilmiş kayıtlara dokunulmaz
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ModPickDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        targetType={targetType}
        targetId={targetId}
        targetName={targetName}
      />
    </>
  );

  // Brütal: ana sayfanın blok dili (bkz. SummaryBlock) — solda menekşe
  // "ÖZELLİKLER · 3 özellik · girdi formunda sorulanlar", yanında yeşil
  // Özellik ekle karosu (ızgaranın sonundaki kesik daire yerine), altında
  // atomlar beyaz hücrede. Hiç yoksa ne işe yaradıkları yazıyor.
  if (brutal) {
    return (
      <>
        <SummaryBlock
          className="mb-4"
          lead={{
            kind: "count",
            color: "#c9b8ff",
            overline: t("structure.features"),
            value: mods ? String(mods.length) : "–",
            unit: t("struct.features.unit"),
            hint: t("struct.features.hint"),
          }}
          action={<SummaryTile color="#7ae582" icon={Plus} label={t("entry.addFeature")} onClick={() => setPickerOpen(true)} />}
          stats={[]}
        >
          {mods && mods.length > 0 ? (
            <div data-feature-cell="" className="grid grid-cols-4 gap-x-1.5 gap-y-1 bg-white p-2">
              {atoms}
            </div>
          ) : mods ? (
            <p className="bg-white px-3.5 py-3 text-[12.5px] font-semibold leading-snug text-[#111]/65">
              {t("struct.features.empty")}
            </p>
          ) : null}
        </SummaryBlock>
        {dialogs}
      </>
    );
  }

  // Bölüm kendi katmanında (gün sayfasındaki gibi)
  return (
    <Layer label={t("structure.features")} className="mb-6">
    <section>
      <h2 className="px-1 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t("structure.features")}
      </h2>
      <div className="grid grid-cols-4 gap-x-1.5 gap-y-1">
        {atoms}
        <ModAtomAdd label={t("entry.addFeature")} onClick={() => setPickerOpen(true)} />
      </div>

      {dialogs}
    </section>
    </Layer>
  );
}
