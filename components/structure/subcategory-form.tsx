"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type SubCategory } from "@/types";
import { createSubCategory, updateSubCategory } from "@/lib/db/queries";

const SUBCATEGORY_PRESETS: Record<string, string[]> = {
  "Uyku":          ["Gece Uykusu", "Şekerleme", "Uyku Kalitesi", "Gece Rutini", "Uyanış"],
  "Spor & Fitness":["Koşu", "Gym", "Yürüyüş", "Yüzme", "Bisiklet"],
  "Beslenme":      ["Yemek", "İçecek", "Ara Öğün", "Kahvaltı", "Akşam Yemeği"],
  "Harcamalar":    ["Market", "Fatura", "Yemek", "Ulaşım", "Eğlence"],
  "Ruh Hali":      ["Günlük Ruh Hali", "Motivasyon", "Stres", "Enerji", "Anksiyete"],
  "Sağlık":        ["İlaç", "Vitamin", "Doktor Ziyareti", "Semptom", "Su"],
  "Sosyal Hayat":  ["Arkadaşlar", "Aile", "Randevu", "Sosyal Etkinlik", "İlişki"],
  "Çalışma":       ["Proje", "Toplantı", "Odak Seansı", "Görev", "Mola"],
  "Öğrenme":       ["Kitap", "Kurs", "Dil Pratiği", "Podcast", "Araştırma"],
  "Eğlence":       ["Film", "Dizi", "Oyun", "Müzik", "Konser"],
  "Seyahat":       ["Uçuş", "Otel", "Aktivite", "Yemek Keşfi", "Ulaşım"],
  "Hobiler":       ["Fotoğrafçılık", "Müzik Aleti", "Resim", "Yazarlık", "Bahçe"],
  "Kişisel Bakım": ["Cilt Bakımı", "Saç Bakımı", "Meditasyon", "Egzersiz", "Spa"],
};

interface SubCategoryFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  parentSubcategoryId?: string;
  categoryName?: string;
  subcategory?: SubCategory;
  onSaved?: (sub?: import("@/types").SubCategory) => void;
}

export function SubCategoryForm({
  open,
  onOpenChange,
  categoryId,
  parentSubcategoryId,
  categoryName,
  subcategory,
  onSaved,
}: SubCategoryFormProps) {
  const isEdit = !!subcategory;
  const [name, setName] = useState(subcategory?.name ?? "");
  const [saving, setSaving] = useState(false);

  const presets = categoryName ? (SUBCATEGORY_PRESETS[categoryName] ?? []) : [];

  async function save(nameToSave: string) {
    if (!nameToSave.trim()) return;
    setSaving(true);
    try {
      if (isEdit && subcategory) {
        await updateSubCategory(subcategory.id, { name: nameToSave.trim() });
        onSaved?.();
      } else {
        const sub = await createSubCategory({ categoryId, parentId: parentSubcategoryId, name: nameToSave.trim() });
        onSaved?.(sub);
      }
      onOpenChange(false);
      if (!isEdit) setName("");
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save(name);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Alt kategoriyi düzenle" : "Yeni alt kategori"}
          </DialogTitle>
        </DialogHeader>

        {/* Edit mode: simple form */}
        {isEdit ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Alt kategori adı"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                İptal
              </Button>
              <Button type="submit" disabled={!name.trim() || saving}>
                Kaydet
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-5">
            {/* Presets */}
            {presets.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    onClick={() => setName(p)}
                    className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium transition-all hover:bg-muted active:scale-95"
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}

            {/* Dominant custom input */}
            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              {presets.length > 0 && (
                <p className="text-xs text-muted-foreground">veya kendin yaz</p>
              )}
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alt kategori adı..."
                autoFocus={presets.length === 0}
                className="h-12 text-base"
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={!name.trim() || saving}
              >
                Oluştur
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
