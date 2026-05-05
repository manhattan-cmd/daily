"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Field } from "@/types";
import { cn } from "@/lib/utils";

interface DynamicFieldProps {
  field: Field;
  value: string;
  onChange: (value: string) => void;
}

export function DynamicField({ field, value, onChange }: DynamicFieldProps) {
  const id = `field-${field.id}`;

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="flex items-center gap-1.5">
        <span>{field.name}</span>
        {field.required ? <span className="text-destructive">*</span> : null}
        {field.options?.unit ? (
          <span className="text-muted-foreground">
            ({field.options.unit})
          </span>
        ) : null}
        {field.options?.currency && field.type === "money" ? (
          <span className="text-muted-foreground">
            ({field.options.currency})
          </span>
        ) : null}
      </Label>
      {renderInput(field, value, onChange, id)}
    </div>
  );
}

function renderInput(
  field: Field,
  value: string,
  onChange: (v: string) => void,
  id: string
) {
  switch (field.type) {
    case "number":
    case "money":
    case "duration":
      return (
        <Input
          id={id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            field.type === "duration" ? "dakika" : field.options?.unit ?? ""
          }
          step="any"
        />
      );

    case "rating":
      return <RatingInput value={value} onChange={onChange} />;

    case "time":
      return (
        <Input
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "text":
      return field.options?.multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "select": {
      const choices = field.options?.choices ?? [];
      return (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Seç" />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    case "boolean":
      return (
        <div className="flex h-11 items-center rounded-lg border border-border bg-input px-3">
          <Switch
            checked={value === "true"}
            onCheckedChange={(b) => onChange(b ? "true" : "false")}
          />
          <span className="ml-3 text-sm text-muted-foreground">
            {value === "true" ? "Evet" : "Hayır"}
          </span>
        </div>
      );
  }
}

function RatingInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const num = parseInt(value || "0", 10);
  return (
    <div className="grid grid-cols-10 gap-1">
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(String(n))}
          className={cn(
            "h-10 rounded-md border text-sm font-medium transition-colors",
            num === n
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-input text-muted-foreground hover:text-foreground"
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
