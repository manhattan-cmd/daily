"use client";

import { useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, ChevronDown, CornerDownRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { type Category, type SubCategory } from "@/types";
import { db } from "@/lib/db";
import {
  createSubCategory,
  moveSubCategory,
  updateSubCategory,
} from "@/lib/db/queries";
import { EmojiPicker } from "@/components/structure/icon-picker";
import { cn } from "@/lib/utils";

/** Bilinen üst alt kategorilere özel öneriler — "Market altına ne açılır?" */
const NESTED_PRESETS: Record<string, string[]> = {
  // Harcamalar
  "Market":        ["Manav", "Şarküteri", "Temizlik", "Atıştırmalık", "İçecek"],
  "Fatura":        ["Elektrik", "Su", "Doğalgaz", "İnternet", "Telefon"],
  "Ulaşım":        ["Toplu Taşıma", "Taksi", "Yakıt", "Otopark"],
  "Yemek":         ["Restoran", "Kafe", "Sipariş", "Tatlı"],
  "Eğlence":       ["Sinema", "Konser", "Oyun", "Abonelik"],
  // Spor & Fitness
  "Gym":           ["Göğüs", "Sırt", "Bacak", "Omuz", "Kol"],
  "Koşu":          ["Tempo Koşusu", "Uzun Koşu", "İnterval"],
  // Beslenme
  "İçecek":        ["Su", "Kahve", "Çay"],
  "Ara Öğün":      ["Meyve", "Kuruyemiş", "Tatlı"],
  // Sağlık
  "İlaç":          ["Sabah", "Akşam", "Ağrı Kesici"],
  "Vitamin":       ["D Vitamini", "B12", "Omega 3", "Magnezyum"],
  // Çalışma
  "Proje":         ["Planlama", "Geliştirme", "Revizyon"],
  // Öğrenme
  "Kitap":         ["Roman", "Kişisel Gelişim", "Mesleki"],
  "Dil Pratiği":   ["Kelime", "Dinleme", "Konuşma", "Gramer"],
  // Eğlence (kategori)
  "Dizi":          ["Yeni Bölüm", "Tekrar İzleme"],
  "Oyun":          ["PC", "Konsol", "Mobil"],
};

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
  const [icon, setIcon] = useState<string | undefined>(subcategory?.icon);
  const [isRegular, setIsRegular] = useState(!!subcategory?.isRegular);
  const [saving, setSaving] = useState(false);
  // Konum (yalnız düzenlemede): hedef üst — kategori ana seviyesi ya da bir alt kategori
  const [location, setLocation] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  const [locationOpen, setLocationOpen] = useState(false);

  useEffect(() => {
    if (open) {
      setName(subcategory?.name ?? "");
      setIcon(subcategory?.icon);
      setIsRegular(!!subcategory?.isRegular);
      setLocation(
        subcategory
          ? { categoryId: subcategory.categoryId, parentId: subcategory.parentId }
          : null
      );
      setLocationOpen(false);
    }
  }, [open, subcategory]);

  // Konum seçici verisi — yalnız düzenleme diyaloğu açıkken çekilir
  const tree = useLiveQuery(async () => {
    if (!isEdit || !open) return undefined;
    const [cats, subs] = await Promise.all([
      db.categories.orderBy("order").toArray(),
      db.subcategories.toArray(),
    ]);
    return { cats, subs };
  }, [isEdit, open]);

  // Oluşturma bağlamı — hedef kategori + alt kategorileri (yol ve öneriler için)
  const context = useLiveQuery(async () => {
    if (isEdit || !open) return undefined;
    const [cat, subs] = await Promise.all([
      db.categories.get(categoryId),
      db.subcategories.where("categoryId").equals(categoryId).toArray(),
    ]);
    return { cat, subs };
  }, [isEdit, open, categoryId]);

  // Nereye ekleniyor: kategori › (varsa) üst alt kategori zinciri
  const parentSub = parentSubcategoryId
    ? context?.subs.find((s) => s.id === parentSubcategoryId)
    : undefined;
  const targetPath = useMemo(() => {
    const catName = context?.cat?.name ?? categoryName;
    if (!catName) return null;
    const chain: string[] = [];
    let cur = parentSub;
    let hops = 0;
    while (cur && hops++ < 20) {
      chain.unshift(cur.name);
      cur = cur.parentId
        ? context?.subs.find((s) => s.id === cur!.parentId)
        : undefined;
    }
    return [catName, ...chain].join(" › ");
  }, [context, categoryName, parentSub]);

  // Taşınanın kendisi ve torunları hedef olamaz (döngü)
  const excludedIds = useMemo(() => {
    const set = new Set<string>();
    if (!subcategory || !tree) return set;
    const stack = [subcategory.id];
    while (stack.length) {
      const cur = stack.pop()!;
      set.add(cur);
      for (const s of tree.subs) if (s.parentId === cur) stack.push(s.id);
    }
    return set;
  }, [subcategory, tree]);

  const locationChanged =
    !!subcategory &&
    !!location &&
    (location.categoryId !== subcategory.categoryId ||
      (location.parentId ?? undefined) !== (subcategory.parentId ?? undefined));

  // Öneriler bağlama göre: bir alt kategorinin altına ekleniyorsa o ebeveyne
  // özel liste (yoksa öneri yok — kategori önerileri orada yanıltıcı olur),
  // ana seviyedeyse kategoriye özel liste. Zaten var olan kardeşler düşülür.
  const presets = useMemo(() => {
    const norm = (s: string) => s.trim().toLocaleLowerCase("tr-TR");
    const base = parentSubcategoryId
      ? parentSub
        ? NESTED_PRESETS[parentSub.name] ?? []
        : []
      : (() => {
          const catName = context?.cat?.name ?? categoryName;
          return catName ? SUBCATEGORY_PRESETS[catName] ?? [] : [];
        })();
    const siblings = new Set(
      (context?.subs ?? [])
        .filter(
          (s) =>
            !s.isCategoryRoot &&
            (s.parentId ?? undefined) === (parentSubcategoryId ?? undefined)
        )
        .map((s) => norm(s.name))
    );
    return base.filter((p) => !siblings.has(norm(p)));
  }, [parentSubcategoryId, parentSub, context, categoryName]);

  async function save(nameToSave: string) {
    if (!nameToSave.trim()) return;
    setSaving(true);
    try {
      if (isEdit && subcategory) {
        await updateSubCategory(subcategory.id, {
          name: nameToSave.trim(),
          icon,
          isRegular,
        });
        if (locationChanged && location) {
          await moveSubCategory(subcategory.id, location);
        }
        onSaved?.();
      } else {
        const sub = await createSubCategory({
          categoryId,
          parentId: parentSubcategoryId,
          name: nameToSave.trim(),
          icon,
        });
        onSaved?.(sub);
      }
      onOpenChange(false);
      if (!isEdit) {
        setName("");
        setIcon(undefined);
      }
    } finally {
      setSaving(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await save(name);
  }

  const iconSection = (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Sembol (isteğe bağlı)</p>
      <EmojiPicker value={icon} onChange={setIcon} />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Alt kategoriyi düzenle" : "Yeni alt kategori"}
          </DialogTitle>
          {/* Nereye eklendiği — kategori renk noktası + yol */}
          {!isEdit && targetPath && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: context?.cat?.color ?? "#6366f1" }}
              />
              <span className="truncate font-medium text-foreground/80">
                {targetPath}
              </span>
              <span className="shrink-0 text-muted-foreground/60">altına</span>
            </div>
          )}
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
            {iconSection}

            {/* Düzenli/sabit işareti — analizlerde tek dokunuşla hariç tutulabilir */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-input px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">Düzenli / sabit</p>
                <p className="text-[11px] text-muted-foreground">
                  Kira, fatura gibi düzenli kalemler — analizlerde tek dokunuşla
                  hariç tutulabilir
                </p>
              </div>
              <Switch checked={isRegular} onCheckedChange={setIsRegular} />
            </div>

            {/* Konum — başka bir kategorinin/alt kategorinin altına taşı */}
            {location && tree && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">Konum</p>
                <button
                  type="button"
                  onClick={() => setLocationOpen((v) => !v)}
                  className="flex items-center justify-between gap-2 rounded-xl border border-border bg-input px-3 py-2.5 text-sm text-left"
                >
                  <span className="truncate">
                    {locationLabel(location, tree.cats, tree.subs)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      locationOpen && "rotate-180"
                    )}
                  />
                </button>
                {locationOpen && (
                  <div className="max-h-48 overflow-y-auto rounded-xl border border-border divide-y divide-border/50">
                    {tree.cats
                      .filter(
                        (c) => !c.isBuiltIn || c.id === subcategory!.categoryId
                      )
                      .map((cat) => (
                        <LocationGroup
                          key={cat.id}
                          category={cat}
                          subs={tree.subs}
                          excludedIds={excludedIds}
                          selected={location}
                          onPick={(loc) => {
                            setLocation(loc);
                            setLocationOpen(false);
                          }}
                        />
                      ))}
                  </div>
                )}
                {locationChanged && (
                  <p className="text-[11px] text-muted-foreground">
                    Alt kategorileri ve girdileriyle birlikte taşınır; analizler
                    yeni konuma göre kendiliğinden güncellenir.
                  </p>
                )}
              </div>
            )}

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
              {iconSection}
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

/** Seçili konumun okunur yolu: "Harcamalar" ya da "Harcamalar › Yemek" */
function locationLabel(
  loc: { categoryId: string; parentId?: string },
  cats: Category[],
  subs: SubCategory[]
): string {
  const catName = cats.find((c) => c.id === loc.categoryId)?.name ?? "—";
  const chain: string[] = [];
  let cur = loc.parentId ? subs.find((s) => s.id === loc.parentId) : undefined;
  let hops = 0;
  while (cur && hops++ < 20) {
    chain.unshift(cur.name);
    cur = cur.parentId ? subs.find((s) => s.id === cur!.parentId) : undefined;
  }
  return [catName, ...chain].join(" › ");
}

/** Konum seçicide bir kategori bloğu: ana seviye satırı + iç içe alt kategori ağacı */
function LocationGroup({
  category,
  subs,
  excludedIds,
  selected,
  onPick,
}: {
  category: Category;
  subs: SubCategory[];
  excludedIds: Set<string>;
  selected: { categoryId: string; parentId?: string };
  onPick: (loc: { categoryId: string; parentId?: string }) => void;
}) {
  const isSelected = (parentId?: string) =>
    selected.categoryId === category.id &&
    (selected.parentId ?? undefined) === parentId;

  const row = (
    label: string,
    depth: number,
    parentId: string | undefined,
    key: string
  ) => (
    <button
      key={key}
      type="button"
      onClick={() => onPick({ categoryId: category.id, parentId })}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-muted/50",
        isSelected(parentId) && "bg-muted/40"
      )}
      style={{ paddingLeft: 12 + depth * 16 }}
    >
      {depth > 0 && (
        <CornerDownRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
      )}
      {depth === 0 && (
        <span
          className="h-2 w-2 rounded-full shrink-0"
          style={{ backgroundColor: category.color }}
        />
      )}
      <span className="truncate flex-1">{label}</span>
      {isSelected(parentId) && (
        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
      )}
    </button>
  );

  const renderChildren = (parentId: string | undefined, depth: number) =>
    subs
      .filter(
        (s) =>
          s.categoryId === category.id &&
          !s.isCategoryRoot &&
          (s.parentId ?? undefined) === parentId &&
          !excludedIds.has(s.id)
      )
      .sort((a, b) => a.order - b.order)
      .flatMap((s): React.ReactNode[] => [
        row(s.name, depth, s.id, s.id),
        ...renderChildren(s.id, depth + 1),
      ]);

  return (
    <div>
      {row(category.name, 0, undefined, `cat-${category.id}`)}
      {renderChildren(undefined, 1)}
    </div>
  );
}
