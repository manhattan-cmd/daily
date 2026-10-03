"use client";

import { ICON_GROUPS, LifeIcon } from "@/lib/icons";
import type { IconName } from "@/lib/icons/vocabulary";
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
 * Sembol seçici — bütün set, gruplar başlıklarıyla ALT ALTA.
 *
 * Bir ara gruplar çiplere bölünmüş, üstüne ada göre öneri satırı konmuştu;
 * kullanıcı eski düzeni istedi: hepsi göz önünde, kaydırarak bakılıyor.
 * Kendi kaydırma kutusu yok — pencereyle birlikte kayar (iç içe ikinci bir
 * kaydırma alanı parmağı yutuyordu).
 *
 * Kategoriler ve alt kategoriler aynı seti kullanır (lib/icons). Kullanıcının
 * önceden seçtiği lucide/emoji semboller bozulmaz — SymbolIcon onları çizmeye
 * devam eder, yalnız burada sunulmazlar.
 */
export function IconGrid({
  value,
  onChange,
  color,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
  /** Seçili sembolün arkasına konan kategori rengi */
  color: string;
}) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      {ICON_GROUPS.map((g) => (
        <div key={g.key} className="flex flex-col gap-1.5">
          <span className="px-0.5 text-[10px] font-medium text-muted-foreground/60">
            {t(GROUP_LABEL[g.key])}
          </span>
          <div className="grid grid-cols-8 gap-1.5">
            {(g.icons as readonly IconName[]).map((n) => {
              const selected = value === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(selected ? undefined : n)}
                  aria-label={n}
                  aria-pressed={selected}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-lg transition-all active:scale-90",
                    selected
                      ? "ring-2 ring-inset ring-white/60"
                      : "bg-[var(--sf-2)] hover:bg-[var(--sf-3)]"
                  )}
                  style={selected ? { backgroundColor: color } : undefined}
                >
                  <LifeIcon
                    name={n}
                    style={{ width: 16, height: 16 }}
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
