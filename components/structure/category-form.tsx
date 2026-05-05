"use client";

import { useState } from "react";
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
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && category) {
        await updateCategory(category.id, { name: name.trim(), color });
      } else {
        await createCategory({ name: name.trim(), color });
      }
      onSaved?.();
      onOpenChange(false);
      if (!isEdit) {
        setName("");
        setColor(CATEGORY_COLORS[0]);
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
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Alkol, Uyku, Spor"
              autoFocus
            />
          </div>
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
