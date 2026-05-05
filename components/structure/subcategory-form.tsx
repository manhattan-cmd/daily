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
import { type SubCategory } from "@/types";
import { createSubCategory, updateSubCategory } from "@/lib/db/queries";

interface SubCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  subcategory?: SubCategory;
  onSaved?: () => void;
}

export function SubCategoryForm({
  open,
  onOpenChange,
  categoryId,
  subcategory,
  onSaved,
}: SubCategoryFormProps) {
  const isEdit = !!subcategory;
  const [name, setName] = useState(subcategory?.name ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (isEdit && subcategory) {
        await updateSubCategory(subcategory.id, { name: name.trim() });
      } else {
        await createSubCategory({ categoryId, name: name.trim() });
      }
      onSaved?.();
      onOpenChange(false);
      if (!isEdit) setName("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Alt kategoriyi düzenle" : "Yeni alt kategori"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="sub-name">İsim</Label>
            <Input
              id="sub-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Bira, Şarap, Koşu"
              autoFocus
            />
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
