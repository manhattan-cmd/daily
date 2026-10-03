"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check } from "lucide-react";
import { db } from "@/lib/db";
import { Dialog } from "@/components/ui/dialog";
import { CATEGORY_COLORS, type Category } from "@/types";
import { createCategory, updateCategory } from "@/lib/db/queries";
import { IconPicker } from "@/components/structure/icon-picker";
import {
  FormActions,
  FormSection,
  NAME_INPUT,
  PreviewTile,
  StructureFormShell,
  SUGGESTION_CHIP,
} from "@/components/structure/structure-form-shell";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Hazır kategori önerileri. Bunlar KAYIT olur (kullanıcının verisi), o yüzden
 * arayüz dilinden bağımsız tek bir dilde durur — örnek yapıyla aynı dilde.
 * Eskiden Yapı sayfasındaki açılır menüdeydi ve dokununca sormadan kategori
 * açıyordu; artık formu dolduruyor, kullanıcı rengi/sembolü değiştirip öyle
 * oluşturuyor.
 */
const PRESETS: { name: string; color: string; icon: string }[] = [
  { name: "Sleep", color: "#6366f1", icon: "moon" },
  { name: "Fitness", color: "#10b981", icon: "lift" },
  { name: "Food", color: "#f97316", icon: "meal" },
  { name: "Expenses", color: "#f59e0b", icon: "money" },
  { name: "Mood", color: "#ec4899", icon: "mood-ok" },
  { name: "Health", color: "#ef4444", icon: "pulse" },
  { name: "Social", color: "#ec4899", icon: "people" },
  { name: "Work", color: "#3b82f6", icon: "work" },
  { name: "Study", color: "#84cc16", icon: "book" },
  { name: "Fun", color: "#8b5cf6", icon: "game" },
  { name: "Travel", color: "#06b6d4", icon: "plane" },
  { name: "Hobbies", color: "#f59e0b", icon: "art" },
  { name: "Self-care", color: "#10b981", icon: "bath" },
];

const norm = (s: string) => s.trim().toLocaleLowerCase("en-US");

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  onSaved?: () => void;
}

/** Kategori oluşturma ve düzenleme — Yapı'dan da girdi eklerken de bu pencere */
export function CategoryForm({
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryFormProps) {
  const isEdit = !!category;
  const t = useT();
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState<string>(category?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>(category?.icon);
  const [saving, setSaving] = useState(false);
  // Aynı adda kategori uyarısı
  const [duplicateName, setDuplicateName] = useState<string | null>(null);

  // Açılışta formu prop'lardan tazele. Effect + setState yerine render
  // sırasında ayarlama: React'in "prop değişince state'i düzelt" kalıbı —
  // effect'te setState kademeli render tetikliyor ve bir kare eski değer çiziliyor.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? CATEGORY_COLORS[0]);
      setIcon(category?.icon);
      setDuplicateName(null);
    }
  }

  // Var olan adlar — öneriler bunları göstermez, aynı ad uyarısı bunlara bakar
  const existing = useLiveQuery(
    async () => (open ? (await db.categories.toArray()).map((c) => c.name) : []),
    [open]
  );
  const presets = isEdit
    ? []
    : PRESETS.filter(
        (p) => !(existing ?? []).some((n) => norm(n) === norm(p.name))
      );

  async function save(force = false) {
    if (!name.trim()) return;
    // Aynı adda kategori varsa uyar — bilerek isteniyorsa "Yine de oluştur"
    if (!isEdit && !force) {
      const clash = (existing ?? []).find((n) => norm(n) === norm(name));
      if (clash) {
        setDuplicateName(clash);
        return;
      }
    }
    setSaving(true);
    try {
      if (isEdit && category) {
        await updateCategory(category.id, { name: name.trim(), color, icon });
      } else {
        await createCategory({ name: name.trim(), color, icon });
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <StructureFormShell
        color={color}
        icon={icon}
        title={name.trim() || (isEdit ? t("tree.editCategory") : t("tree.newCategory"))}
        eyebrow={isEdit ? t("tree.editCategory") : t("structure.categories")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        footer={
          <FormActions
            submitLabel={isEdit ? t("action.save") : t("action.create")}
            cancelLabel={t("action.cancel")}
            disabled={!name.trim() || saving}
            onCancel={() => onOpenChange(false)}
          />
        }
      >
        <FormSection label={t("tree.name")}>
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDuplicateName(null);
            }}
            placeholder={t("form.categoryPlaceholder")}
            autoFocus={isEdit}
            className={NAME_INPUT}
          />
          {duplicateName && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200/90">
              <span className="font-semibold">&bdquo;{duplicateName}&rdquo;</span>{" "}
              adında bir kategori zaten var. İkincisi karışıklık yaratabilir.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => void save(true)}
                  className="text-amber-200/70 transition-colors hover:text-amber-100"
                >
                  Yine de oluştur
                </button>
              </div>
            </div>
          )}
        </FormSection>

        {/* Öneriler — dokununca ad, renk ve sembol birlikte dolar */}
        {presets.length > 0 && (
          <FormSection label={t("form.suggestions")}>
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setName(p.name);
                    setColor(p.color);
                    setIcon(p.icon);
                    setDuplicateName(null);
                  }}
                  className={SUGGESTION_CHIP}
                >
                  <PreviewTile color={p.color} icon={p.icon} size={22} />
                  {p.name}
                </button>
              ))}
            </div>
          </FormSection>
        )}

        <FormSection label={t("tree.colour")}>
          <div className="flex items-center justify-between px-1">
            {CATEGORY_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                aria-label={`Renk ${c}`}
                aria-pressed={color === c}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full transition-transform active:scale-90",
                  color === c && "scale-110 ring-2 ring-white/70 ring-offset-2 ring-offset-card"
                )}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </FormSection>

        <FormSection label={t("tree.icon")}>
          <IconPicker value={icon} onChange={setIcon} color={color} bare />
        </FormSection>
      </StructureFormShell>
    </Dialog>
  );
}
