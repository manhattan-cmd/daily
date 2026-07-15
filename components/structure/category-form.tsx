"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CATEGORY_COLORS, type Category } from "@/types";
import { createCategory, updateCategory } from "@/lib/db/queries";
import { IconPicker } from "@/components/structure/icon-picker";
import { cn } from "@/lib/utils";

interface CategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category;
  onSaved?: () => void;
}

export function CategoryForm({
  open,
  onOpenChange,
  category,
  onSaved,
}: CategoryFormProps) {
  const isEdit = !!category;
  const [name, setName] = useState(category?.name ?? "");
  const [color, setColor] = useState(category?.color ?? CATEGORY_COLORS[0]);
  const [icon, setIcon] = useState<string | undefined>(category?.icon);
  const [saving, setSaving] = useState(false);
  // Aynı adda kategori uyarısı
  const [duplicateName, setDuplicateName] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(category?.name ?? "");
      setColor(category?.color ?? CATEGORY_COLORS[0]);
      setIcon(category?.icon);
      setDuplicateName(null);
    }
  }, [open, category]);

  async function onSubmit(e: React.FormEvent, force = false) {
    e.preventDefault();
    if (!name.trim()) return;
    // Aynı adda kategori varsa uyar — bilerek isteniyorsa "Yine de oluştur"
    if (!isEdit && !force) {
      const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
      const cats = await db.categories.toArray();
      const clash = cats.find((c) => norm(c.name) === norm(name));
      if (clash) {
        setDuplicateName(clash.name);
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
      if (!isEdit) {
        setName("");
        setColor(CATEGORY_COLORS[0]);
        setIcon(undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Kategoriyi düzenle" : "Yeni kategori"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="cat-name">İsim</Label>
            <Input
              id="cat-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setDuplicateName(null);
              }}
              placeholder="Örn. Alkol, Uyku, Spor"
              autoFocus
            />
          </div>

          {duplicateName && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-relaxed text-amber-200/90">
              <span className="font-semibold">&bdquo;{duplicateName}&rdquo;</span>{" "}
              adında bir kategori zaten var. İkincisi karışıklık yaratabilir.
              <div className="mt-2">
                <button
                  type="button"
                  onClick={(e) =>
                    onSubmit(e as unknown as React.FormEvent, true)
                  }
                  className="text-amber-200/70 hover:text-amber-100 transition-colors"
                >
                  Yine de oluştur
                </button>
              </div>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label>Renk</Label>
            <div className="grid grid-cols-5 gap-2">
              {CATEGORY_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={cn(
                    "h-10 rounded-lg border-2 transition-all",
                    color === c
                      ? "border-foreground scale-105"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={`Renk ${c}`}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Sembol (isteğe bağlı)</Label>
            <IconPicker value={icon} onChange={setIcon} color={color} />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              İptal
            </Button>
            <Button type="submit" disabled={!name.trim() || saving}>
              {isEdit ? "Kaydet" : "Oluştur"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
