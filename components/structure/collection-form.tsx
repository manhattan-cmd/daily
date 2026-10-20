"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import {
  FormActions,
  FormSection,
  NAME_INPUT,
  StructureFormShell,
} from "@/components/structure/structure-form-shell";
import { IconGrid } from "@/components/structure/icon-picker";
import { createCollection, updateCollection } from "@/lib/db/things";
import { CATEGORY_COLORS, type Collection } from "@/types";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/** Liste (koleksiyon) aç / düzenle — kategori penceresiyle aynı iskelet */
export function CollectionForm({
  open,
  onOpenChange,
  collection,
  nextOrder = 0,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection?: Collection;
  /** Yeni listenin varsayılan rengi sıradan seçilir */
  nextOrder?: number;
  onSaved?: (c: Collection | undefined) => void;
}) {
  const t = useT();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<string | undefined>();
  const [color, setColor] = useState<string>(CATEGORY_COLORS[0]);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(collection?.name ?? "");
      setIcon(collection?.icon);
      setColor(collection?.color ?? CATEGORY_COLORS[nextOrder % CATEGORY_COLORS.length]);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    if (collection) {
      await updateCollection(collection.id, { name, icon, color });
      onSaved?.(undefined);
    } else {
      onSaved?.(await createCollection({ name, icon, color }));
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StructureFormShell
        color={color}
        icon={icon}
        title={name.trim() || (collection ? collection.name : t("objects.addCollection"))}
        eyebrow={t("objects.title")}
        onSubmit={onSubmit}
        footer={
          <FormActions
            submitLabel={collection ? t("action.save") : t("action.create")}
            cancelLabel={t("action.cancel")}
            disabled={!name.trim()}
            onCancel={() => onOpenChange(false)}
          />
        }
      >
        <FormSection label={t("objects.collectionName")}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("measure.collectionPlaceholder")}
            className={NAME_INPUT}
          />
        </FormSection>
        <FormSection label={t("tree.colour")}>
          <div className="flex flex-wrap gap-2">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className={cn(
                  "h-8 w-8 rounded-full border-2 transition-transform active:scale-90",
                  color === c ? "border-[#111] scale-110" : "border-transparent"
                )}
                style={{ background: c }}
              />
            ))}
          </div>
        </FormSection>
        <FormSection label={t("tree.icon")}>
          <IconGrid value={icon} onChange={setIcon} color={color} />
        </FormSection>
      </StructureFormShell>
    </Dialog>
  );
}
