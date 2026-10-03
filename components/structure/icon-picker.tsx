"use client";

import { ICON_GROUPS, LifeIcon } from "@/lib/icons";
import { useT, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/** Grup başlıkları — sıra gün nasıl geçiyorsa öyle (bkz. LIFE_ICON_GROUPS) */
const GROUP_LABEL: Record<string, MessageKey> = {
  time: "icons.time",
  body: "icons.body",
  sport: "icons.sport",
  mind: "icons.mind",
  food: "icons.food",
  shop: "icons.shop",
  edu: "icons.edu",
  work: "icons.work",
  hobby: "icons.hobby",
  people: "icons.people",
  home: "icons.home",
  travel: "icons.travel",
  money: "icons.money",
  nature: "icons.nature",
};

/**
 * Sembol seçici — kategoriler ve alt kategoriler aynı seti kullanır.
 *
 * Eskiden ikisi ayrıydı: kategoriler lucide, alt kategoriler ham emoji. Emoji
 * her cihazda başka çiziliyor ve kendi rengiyle geldiği için kategorinin
 * rengini dinlemiyordu; iki ayrı görsel dil aynı ağaçta yan yana duruyordu.
 * Artık ikisi de kendi setimizden seçiyor (bkz. lib/icons/life-icons).
 *
 * Kullanıcının önceden seçtiği lucide/emoji semboller bozulmaz — SymbolIcon
 * onları çizmeye devam eder, yalnız seçicide sunulmazlar.
 */
export function IconPicker({
  value,
  onChange,
  color,
  bare = false,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
  /** Seçili sembolün arkasına konan kategori rengi */
  color?: string;
  /** Kendi kaydırma kutusu olmadan — pencerenin kendisi kayıyorsa iç içe
   *  ikinci bir kaydırma alanı parmağı yutuyordu */
  bare?: boolean;
}) {
  const t = useT();
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        !bare && "max-h-56 overflow-y-auto pr-1"
      )}
    >
      {ICON_GROUPS.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <span className="px-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            {t(GROUP_LABEL[g.key])}
          </span>
          <div className="grid grid-cols-8 gap-1.5">
            {g.icons.map((n) => {
              const selected = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(selected ? undefined : n)}
                  aria-label={n}
                  aria-pressed={selected}
                  className={cn(
                    "flex h-9 items-center justify-center rounded-xl transition-all active:scale-90",
                    selected
                      ? "ring-2 ring-inset ring-white/60"
                      : "bg-[var(--sf-1)] ring-1 ring-inset ring-[var(--ln-1)] hover:bg-[var(--sf-2)]",
                    selected && !color && "bg-primary"
                  )}
                  style={
                    selected && color ? { backgroundColor: color } : undefined
                  }
                >
                  <LifeIcon
                    name={n}
                    style={{ width: 18, height: 18 }}
                    className={selected ? "text-white" : "text-muted-foreground"}
                  />
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

