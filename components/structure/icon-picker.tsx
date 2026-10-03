"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ICON_GROUPS, LifeIcon } from "@/lib/icons";
import { iconGroupKey, suggestIcons } from "@/lib/icons/suggest";
import type { IconName } from "@/lib/icons/vocabulary";
import { HScroll } from "@/components/ui/h-scroll";
import { FormSection } from "@/components/structure/structure-form-shell";
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
 * Sembol seçimi — iki bölme: ÖNERİLEN SEMBOLLER ve SEMBOL KATEGORİLERİ.
 *
 * Eskiden bütün set (14 grup, ~160 sembol) tek uzun bir ızgaraydı; aradığını
 * bulmak için pencereyi baştan sona kaydırmak gerekiyordu. Artık:
 *  - öneriler yazılan ada göre geliyor ("Kahve" → fincan; bkz. suggestIcons),
 *    çoğu zaman aranan sembol daha ilk satırda;
 *  - kalan set gruplara bölünmüş: bir grup çipine dokununca yalnız o grubun
 *    sembolleri görünüyor.
 *
 * Kategoriler ve alt kategoriler aynı seti kullanır (lib/icons). Kullanıcının
 * önceden seçtiği lucide/emoji semboller bozulmaz — SymbolIcon onları çizmeye
 * devam eder, yalnız burada sunulmazlar.
 */
export function IconChooser({
  value,
  onChange,
  color,
  name,
  contextIcon,
}: {
  value?: string;
  onChange: (icon: string | undefined) => void;
  /** Seçili sembolün arkasına konan kategori rengi */
  color: string;
  /** Yazılan ad — öneriler buna göre */
  name: string;
  /** Bağlamın sembolü (alt kategoride üst kategorininki) — öneriye katkı */
  contextIcon?: string;
}) {
  const t = useT();
  const suggested = useMemo(
    () => suggestIcons(name, contextIcon),
    [name, contextIcon]
  );
  // Açılışta seçili sembolün, yoksa bağlamın, yoksa ilk önerinin grubu
  const [groupKey, setGroupKey] = useState<string>(
    () =>
      iconGroupKey(value) ??
      iconGroupKey(contextIcon) ??
      iconGroupKey(suggested[0]) ??
      ICON_GROUPS[0].key
  );
  const group = ICON_GROUPS.find((g) => g.key === groupKey) ?? ICON_GROUPS[0];

  // Seçili grup çipi satırın dışında kalmasın — yalnız YATAYDA kaydırılır
  // (scrollIntoView pencereyi de dikeyde kaydırıyordu)
  const rowRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    const sc = rowRef.current;
    const el = activeRef.current;
    if (!sc || !el) return;
    const a = el.getBoundingClientRect();
    const b = sc.getBoundingClientRect();
    sc.scrollTo({
      left: sc.scrollLeft + (a.left - b.left) - (sc.clientWidth - a.width) / 2,
      behavior: "smooth",
    });
  }, [groupKey]);

  const cell = (n: IconName) => (
    <IconCell
      key={n}
      name={n}
      selected={value === n}
      color={color}
      onClick={() => {
        onChange(value === n ? undefined : n);
        // Önerilerden seçilince kategoriler de onun grubuna geçer —
        // komşu sembollere bakmak isteyen tek dokunuşla oradadır
        setGroupKey(iconGroupKey(n) ?? groupKey);
      }}
    />
  );

  return (
    <>
      <FormSection label={t("form.suggestedIcons")}>
        <div className="grid grid-cols-8 gap-1.5">{suggested.map(cell)}</div>
      </FormSection>

      <FormSection label={t("form.iconGroups")}>
        <HScroll className="gap-1.5" scrollRef={rowRef}>
          {ICON_GROUPS.map((g) => {
            const on = g.key === group.key;
            return (
              <button
                key={g.key}
                ref={on ? activeRef : undefined}
                type="button"
                onClick={() => setGroupKey(g.key)}
                aria-pressed={on}
                className={cn(
                  "shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
                  !on && "bg-[var(--sf-2)] text-muted-foreground hover:text-foreground"
                )}
                style={
                  on
                    ? { background: `${color}2e`, color, boxShadow: `inset 0 0 0 1px ${color}66` }
                    : undefined
                }
              >
                {t(GROUP_LABEL[g.key])}
              </button>
            );
          })}
        </HScroll>
        {/* İki satırlık sabit yer: grup değişince bölme zıplamasın */}
        <div
          key={group.key}
          className="animate-in grid min-h-[78px] grid-cols-8 content-start gap-1.5"
        >
          {(group.icons as readonly IconName[]).map(cell)}
        </div>
      </FormSection>
    </>
  );
}

function IconCell({
  name,
  selected,
  color,
  onClick,
}: {
  name: IconName;
  selected: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      aria-pressed={selected}
      className={cn(
        "flex h-9 items-center justify-center rounded-xl transition-all active:scale-90",
        selected
          ? "ring-2 ring-inset ring-white/60"
          : "bg-[var(--sf-2)] hover:bg-[var(--sf-3)]"
      )}
      style={selected ? { backgroundColor: color } : undefined}
    >
      <LifeIcon
        name={name}
        style={{ width: 18, height: 18 }}
        className={selected ? "text-white" : "text-muted-foreground"}
      />
    </button>
  );
}
