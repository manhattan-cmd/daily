"use client";

import { CATEGORY_ICON_NAMES, CategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/** Alt kategoriler için emoji sembol seti — girdi akışlarında düz metin olarak render edilir. */
export const SUBCATEGORY_EMOJIS = [
  "😴", "😐", "😫", "😊", "😢", "😡", "🤒", "🧠",
  "🏃", "💪", "🏋️", "🚶", "🏊", "🚴", "⚽", "🧘",
  "🍽️", "🥗", "🍳", "☕", "🍺", "💧", "🍫", "🍎",
  "💊", "🩺", "🦷", "🌡️", "📚", "✍️", "💻", "📖",
  "💼", "📞", "🗓️", "🎯", "🎮", "🎬", "🎵", "🎨",
  "📷", "🎸", "✈️", "🏨", "🗺️", "🚗", "🛒", "💰",
  "💳", "🏠", "❤️", "👥", "👨‍👩‍👧", "🐶", "🐱", "🌱",
  "☀️", "🌙", "⚡", "🔥", "⭐", "🏆", "🧹", "🛁",
];

export function IconPicker({
  value,
  onChange,
  color,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
  color?: string;
}) {
  return (
    <div className="grid max-h-40 grid-cols-6 gap-1.5 overflow-y-auto pr-1">
      {CATEGORY_ICON_NAMES.map((n) => {
        const selected = value === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(selected ? undefined : n)}
            className={cn(
              "flex h-9 items-center justify-center rounded-lg border transition-all",
              selected
                ? "border-foreground scale-105"
                : "border-border bg-card hover:bg-muted"
            )}
            style={selected && color ? { backgroundColor: color } : undefined}
            aria-label={`Sembol ${n}`}
          >
            <CategoryIcon
              name={n}
              className={cn(
                "h-4 w-4",
                selected ? "text-white" : "text-muted-foreground"
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function EmojiPicker({
  value,
  onChange,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
}) {
  return (
    <div className="grid max-h-36 grid-cols-8 gap-1 overflow-y-auto pr-1">
      {SUBCATEGORY_EMOJIS.map((e) => {
        const selected = value === e;
        return (
          <button
            key={e}
            type="button"
            onClick={() => onChange(selected ? undefined : e)}
            className={cn(
              "flex h-8 items-center justify-center rounded-lg text-lg leading-none transition-all",
              selected ? "bg-primary/25 ring-2 ring-primary" : "hover:bg-muted"
            )}
            aria-label={`Sembol ${e}`}
          >
            {e}
          </button>
        );
      })}
    </div>
  );
}
