"use client";

import type { ScaleLabels } from "@/types";

/**
 * Skala girişi — TEK PARÇA bir şerit.
 *
 * Skala SIRALI: "3", "4"ten küçüktür ve uçların bir anlamı vardır. Eskiden
 * ayrı ayrı sayı kutularıydı; 10'luk skalada iki satıra kırılıyor, kutunun
 * içinde dağınık düğmeler gibi duruyordu, sıra okunmuyordu. Şimdi basamaklar
 * tek bir rayın dilimleri: seçilen değere kadar olan kısım özelliğin renginde
 * dolar (ne kadar yüksek olduğu bir bakışta), seçilen dilim en koyu. Seçili
 * dilime tekrar dokunmak seçimi kaldırır. Uç etiketleri (kötü → harika) varsa
 * altta.
 */
export function ScaleInput({
  choices,
  labels,
  value,
  onChange,
  color = "#6366f1",
}: {
  choices: string[];
  labels?: ScaleLabels;
  value: string;
  onChange: (v: string) => void;
  /** Dolgunun rengi — özelliğin ya da akışın rengi */
  color?: string;
}) {
  if (!choices.length) return null;
  const sel = choices.indexOf(value);

  return (
    <div className="flex flex-col gap-1.5">
      <div
        // Testler biçime değil bu kancaya baksın
        data-scale-strip=""
        className="flex h-11 overflow-hidden rounded-xl"
        style={{ boxShadow: `inset 0 0 0 1px ${color}40`, background: `${color}0f` }}
      >
        {choices.map((c, i) => {
          const active = i === sel;
          const filled = sel >= 0 && i < sel;
          return (
            <button
              key={c}
              type="button"
              onClick={() => onChange(active ? "" : c)}
              aria-pressed={active}
              aria-label={c}
              className="relative flex min-w-0 flex-1 items-center justify-center text-[13px] font-semibold tabular-nums transition-colors duration-200"
              style={{
                background: active ? color : filled ? `${color}38` : undefined,
                color: active ? "#fff" : filled ? color : "var(--muted-foreground)",
                // İnce ayraç — dilimler ayrı okunsun ama tek ray kalsın
                boxShadow:
                  i > 0 && !active && i !== sel + 1
                    ? `inset 1px 0 0 ${color}26`
                    : undefined,
              }}
            >
              {c}
            </button>
          );
        })}
      </div>

      {(labels?.low || labels?.high) && (
        <div className="flex items-start justify-between gap-3 px-0.5 text-[10px] leading-tight text-muted-foreground/70">
          <span className="truncate">{labels.low}</span>
          <span className="truncate text-right">{labels.high}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Evet/hayır anahtarı. Eskiden tam genişlikte "Evet"/"Hayır" yazan bir
 * düğmeydi; birkaç evet/hayır özelliği alt alta gelince form özellik değil
 * dağınık düğme yığını gibi duruyordu. Anahtar bir satırın sağında durur,
 * satırın kendisi özelliğin adıdır.
 */
export function ToggleSwitch({
  checked,
  onChange,
  color = "#6366f1",
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  color?: string;
  /** Erişilebilirlik adı — görünen ad satırda */
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200"
      style={{ background: checked ? color : "var(--sf-3)" }}
    >
      <span
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-[left] duration-200"
        style={{ left: checked ? 22 : 2 }}
      />
    </button>
  );
}
