"use client";

import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FIELD_TYPE_LABELS,
  type Field,
  type FieldType,
  type GlobalDimensionConfig,
  type MoneyClassification,
} from "@/types";
import { createField, updateField, listDimensions } from "@/lib/db/queries";
import { db } from "@/lib/db";

interface FieldFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subcategoryId: string;
  field?: Field;
  onSaved?: () => void;
}

const FIELD_TYPES: FieldType[] = [
  "number",
  "text",
  "rating",
  "time",
  "duration",
  "money",
  "select",
  "boolean",
];

export function FieldForm({
  open,
  onOpenChange,
  subcategoryId,
  field,
  onSaved,
}: FieldFormProps) {
  const isEdit = !!field;
  const [name, setName] = useState(field?.name ?? "");
  const [type, setType] = useState<FieldType>(field?.type ?? "number");
  const [unit, setUnit] = useState(field?.options?.unit ?? "");
  const [currency, setCurrency] = useState(field?.options?.currency ?? "TL");
  const [choicesText, setChoicesText] = useState(
    field?.options?.choices?.join(", ") ?? ""
  );
  const [required, setRequired] = useState(field?.required ?? false);
  const [linkToDimension, setLinkToDimension] = useState(
    !!field?.globalDimension
  );
  const [classification, setClassification] = useState<MoneyClassification>(
    field?.globalDimension?.classification ?? "expense"
  );
  const [label, setLabel] = useState(field?.globalDimension?.label ?? "");
  const [saving, setSaving] = useState(false);

  const dimensions = useLiveQuery(() => listDimensions(), []);
  const moneyDim = dimensions?.find((d) => d.type === "money");
  const timeDim = dimensions?.find((d) => d.type === "time");

  // Reset form when opening for new field
  useEffect(() => {
    if (open && !isEdit) {
      setName("");
      setType("number");
      setUnit("");
      setCurrency("TL");
      setChoicesText("");
      setRequired(false);
      setLinkToDimension(false);
      setClassification("expense");
      setLabel("");
    }
  }, [open, isEdit]);

  // Auto-detect default linkable dimension
  const linkableDim =
    type === "money" ? moneyDim : type === "duration" || type === "time" ? timeDim : null;

  // Auto-fill label from subcategory context if empty
  useEffect(() => {
    if (linkToDimension && !label) {
      // We'll fetch context lazily
      (async () => {
        const sub = await db.subcategories.get(subcategoryId);
        if (!sub) return;
        const cat = await db.categories.get(sub.categoryId);
        if (cat) setLabel(`${cat.name} / ${sub.name}`);
      })();
    }
  }, [linkToDimension, label, subcategoryId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const options: Field["options"] = {};
      if (type === "number" && unit) options.unit = unit;
      if (type === "money") options.currency = currency || "TL";
      if (type === "select") {
        options.choices = choicesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      }

      let globalDimension: GlobalDimensionConfig | undefined;
      if (linkToDimension && linkableDim) {
        globalDimension = {
          dimensionId: linkableDim.id,
          ...(type === "money" ? { classification } : {}),
          label: label.trim() || undefined,
        };
      }

      if (isEdit && field) {
        await updateField(field.id, {
          name: name.trim(),
          type,
          options,
          required,
          globalDimension,
        });
      } else {
        await createField({
          subcategoryId,
          name: name.trim(),
          type,
          options,
          required,
          globalDimension,
        });
      }
      onSaved?.();
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  const canLinkToDimension = type === "money" || type === "duration" || type === "time";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Alanı düzenle" : "Yeni alan"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="field-name">İsim</Label>
            <Input
              id="field-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. miktar, fiyat, kalite"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Tip</Label>
            <Select value={type} onValueChange={(v) => setType(v as FieldType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {FIELD_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "number" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="field-unit">Birim (opsiyonel)</Label>
              <Input
                id="field-unit"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="cl, kg, km..."
              />
            </div>
          ) : null}

          {type === "money" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="field-currency">Para birimi</Label>
              <Input
                id="field-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                placeholder="TL"
              />
            </div>
          ) : null}

          {type === "select" ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="field-choices">Seçenekler</Label>
              <Input
                id="field-choices"
                value={choicesText}
                onChange={(e) => setChoicesText(e.target.value)}
                placeholder="virgülle ayır: hafif, orta, ağır"
              />
            </div>
          ) : null}

          <div className="flex items-center justify-between rounded-lg border border-border bg-card/50 p-3">
            <div>
              <Label className="text-foreground">Zorunlu</Label>
              <p className="text-xs text-muted-foreground">
                Entry yaratırken doldurulması şart olsun
              </p>
            </div>
            <Switch checked={required} onCheckedChange={setRequired} />
          </div>

          {canLinkToDimension && linkableDim ? (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/50 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-foreground">
                    {linkableDim.name} boyutuna ekle
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Bu alan global analizde toplanır
                  </p>
                </div>
                <Switch
                  checked={linkToDimension}
                  onCheckedChange={setLinkToDimension}
                />
              </div>

              {linkToDimension ? (
                <>
                  {type === "money" ? (
                    <div className="flex flex-col gap-2">
                      <Label>Sınıflandırma</Label>
                      <Select
                        value={classification}
                        onValueChange={(v) =>
                          setClassification(v as MoneyClassification)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="expense">Gider</SelectItem>
                          <SelectItem value="income">Gelir</SelectItem>
                          <SelectItem value="investment">Yatırım</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="field-label">Etiket</Label>
                    <Input
                      id="field-label"
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      placeholder="Otomatik doldurulur"
                    />
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

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
