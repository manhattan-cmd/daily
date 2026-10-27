"use client";

import Link from "next/link";
import { ArrowRight, Check, Layers, Plus, ShieldCheck, Target, X, type LucideIcon } from "lucide-react";
import { useT, type MessageKey } from "@/lib/i18n";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { SummaryBlock } from "@/components/ui/summary-block";

/** Kapatılınca bir daha çıkmaz; Ayarlar → "Karşılamayı tekrar göster" geri getirir */
export const WELCOME_DISMISSED = "routine:welcomeDismissed";

export type StartStepKey = "category" | "entry" | "goal" | "backup";
export type StartStep = { key: StartStepKey; done: boolean };

const TITLE: Record<StartStepKey, MessageKey> = {
  category: "home.start.category.title",
  entry: "home.start.entry.title",
  goal: "home.start.goal.title",
  backup: "home.start.backup.title",
};
const HINT: Record<StartStepKey, MessageKey> = {
  category: "home.start.category.hint",
  entry: "home.start.entry.hint",
  goal: "home.start.goal.hint",
  backup: "home.start.backup.hint",
};

const SHORT: Record<StartStepKey, MessageKey> = {
  category: "home.start.short.category",
  entry: "home.start.short.entry",
  goal: "home.start.short.goal",
  backup: "home.start.short.backup",
};

/** Sıradaki adımın karosu — Ekle karosunun eşi, adımın kendi renginde */
const TILE: Record<StartStepKey, { color: string; icon: LucideIcon; label: MessageKey }> = {
  category: { color: "#ffd23f", icon: Plus, label: "home.cats.create" },
  entry: { color: "#7ae582", icon: Plus, label: "home.addEntry" },
  goal: { color: "#ff9ecd", icon: Target, label: "home.start.goal.action" },
  backup: { color: "#8ea6ff", icon: ShieldCheck, label: "backup.reminder.action" },
};

type StartProps = {
  steps: StartStep[];
  onDismiss: () => void;
  onCreateCategory: () => void;
  onAddEntry: () => void;
  onAddGoal: () => void;
};

/**
 * Başlarken — yeni kullanıcının ana sayfadaki ilk kartı. Brütalde ana
 * sayfanın öteki bloklarıyla aynı dilde (bkz. BrutGettingStarted); sade
 * temalarda aşağıdaki liste.
 */
export function GettingStarted(props: StartProps) {
  const brutal = useSkin() === "brutal";
  return brutal ? <BrutGettingStarted {...props} /> : <ListGettingStarted {...props} />;
}

/**
 * Brütal Başlarken — Bugün, Kategorilerin, Yine ekle ve Son 7 gün'le aynı
 * birleşik blok (bkz. SummaryBlock): solda "BAŞLARKEN · 1/4 adım" ve köşede
 * kapatma; sağda sıradaki adımın işi Ekle karosu gibi kendi renginde
 * (kategori sarı, girdi yeşil, hedef pembe, yedek mavi); altında dört adım
 * Bugün'ün sayıları gibi hücrelerde (tepedeki bant: yapıldı yeşil, sıradaki
 * kendi renginde; dokununca o adımın işi); ortada sıradaki adımın ne işe
 * yaradığı; kategori adımında en altta Yapı'nın sarısında Örnekleri gez.
 */
function BrutGettingStarted({ steps, onDismiss, onCreateCategory, onAddEntry, onAddGoal }: StartProps) {
  const t = useT();
  const done = steps.filter((s) => s.done).length;
  const cur = steps.find((s) => !s.done)?.key ?? "backup";
  const act = (key: StartStepKey) =>
    key === "category" ? onCreateCategory : key === "entry" ? onAddEntry : key === "goal" ? onAddGoal : undefined;
  const tile = TILE[cur];
  const tileBody = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#111]" style={{ color: tile.color }}>
        <tile.icon className="h-6 w-6" strokeWidth={3} />
      </span>
      <span className="text-center text-[12px] font-black leading-[1.05]">{t(tile.label)}</span>
    </>
  );
  const tileCls = "flex h-full w-full flex-col items-center justify-center gap-1.5 px-1 text-[#111] active:brightness-95";
  return (
    <div data-getting-started="">
      <SummaryBlock
        className="mb-4"
        lead={{
          kind: "count",
          color: "#c9b8ff",
          overline: t("home.start.title"),
          value: `${done}/${steps.length}`,
          unit: t("home.start.unit"),
          close: { label: t("home.start.dismiss"), onClick: onDismiss },
        }}
        action={
          cur === "backup" ? (
            <Link href="/structure/backup" className={tileCls} style={{ background: tile.color }}>
              {tileBody}
            </Link>
          ) : (
            <button type="button" onClick={act(cur)} className={tileCls} style={{ background: tile.color }}>
              {tileBody}
            </button>
          )
        }
        stats={steps.map((s, i) => ({
          label: `${i + 1} · ${t(SHORT[s.key])}`,
          value: s.done ? "✓" : s.key === cur ? "→" : "–",
          // Yapıldı yeşil, sıradaki kendi renginde, ötekiler sönük
          color: s.done ? "#7ae582" : s.key === cur ? TILE[s.key].color : "#e7e1d4",
          onClick: s.done ? undefined : act(s.key),
        }))}
        link={
          cur === "category"
            ? { href: "/structure", label: t("home.start.category.explore"), color: "#ffd23f", icon: Layers }
            : undefined
        }
      >
        <div className="bg-white px-3.5 py-3 text-[#111]">
          <p className="text-[15px] font-black leading-tight">{t(TITLE[cur])}</p>
          <p className="mt-1 text-[12.5px] font-semibold leading-snug text-[#111]/70">{t(HINT[cur])}</p>
          {/* Yapının üç halkası, şekil diliyle: kare kategori, daire özellik */}
          {cur === "category" && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11.5px] font-extrabold">
              {(["welcome.category", "welcome.subcategory", "welcome.feature"] as const).map((k, j) => (
                <span key={k} className="flex items-center gap-1.5">
                  {j > 0 && <span className="opacity-40">›</span>}
                  <span className="flex items-center gap-1 rounded-md border-[1.5px] border-[#111] bg-white px-1.5 py-0.5">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 border-[1.5px] border-current",
                        k === "welcome.feature" ? "rounded-full" : "rounded-[3px]"
                      )}
                    />
                    {t(k)}
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      </SummaryBlock>
    </div>
  );
}

/**
 * Başlarken (sade temalar) — yeni kullanıcının ana sayfadaki ilk kartı. Eskiden yerinde
 * "Hoş geldin" vardı: kategori › alt kategori › özellik zincirini anlatıp
 * örnek yapıya gönderiyordu, ilk girdiyle de kayboluyordu. Kullanıcıyı yapı
 * kurmaya, ilk girdiye, hedefe ve yedeğe tek tek götüren bir liste daha
 * işe yarıyor: sıradaki adım açık (ne işe yaradığı ve düğmesi), yapılanlar
 * işaretli, ötekiler tek satır — dokununca o adımın işi açılır.
 *
 * Adımların durumu verinin kendisinden okunur (kendi kategorisi var mı,
 * girdi, hedef, yedek), hepsi bitince kart kendiliğinden kalkar.
 */
function ListGettingStarted({
  steps,
  onDismiss,
  onCreateCategory,
  onAddEntry,
  onAddGoal,
}: StartProps) {
  const t = useT();
  const brutal = useSkin() === "brutal";
  const done = steps.filter((s) => s.done).length;
  const current = steps.findIndex((s) => !s.done);

  // Adımın asıl işi: düğme ya da bağlantı
  const primary = (key: StartStepKey) => {
    const label =
      key === "category"
        ? t("home.start.category.action")
        : key === "entry"
          ? t("home.addEntry")
          : key === "goal"
            ? t("home.start.goal.action")
            : t("backup.reminder.action");
    const cls = brutal
      ? "flex h-10 items-center gap-1.5 rounded-xl border-2 border-[#111] bg-[#ffd23f] px-2.5 text-[13px] font-black text-[#111] shadow-[3px_3px_0_#111] transition-transform active:translate-x-[2px] active:translate-y-[2px] active:shadow-none"
      : "flex h-9 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground";
    const body = (
      <>
        {key !== "backup" && <Plus className="h-4 w-4" strokeWidth={3} />}
        {label}
        {key === "backup" && <ArrowRight className="h-4 w-4" strokeWidth={2.75} />}
      </>
    );
    if (key === "backup") {
      return (
        <Link href="/structure/backup" className={cls}>
          {body}
        </Link>
      );
    }
    const onClick = key === "category" ? onCreateCategory : key === "entry" ? onAddEntry : onAddGoal;
    return (
      <button type="button" onClick={onClick} className={cls}>
        {body}
      </button>
    );
  };

  // Kapalı satıra dokunmak da o adımın işini açar
  const rowAction = (key: StartStepKey) =>
    key === "category" ? onCreateCategory : key === "entry" ? onAddEntry : key === "goal" ? onAddGoal : undefined;

  return (
    <section
      data-getting-started=""
      className={cn(
        "mb-4 overflow-hidden",
        brutal
          ? "rounded-[18px] border-2 border-[#111] bg-white text-[#111] shadow-[4px_4px_0_#111]"
          : "rounded-2xl border border-primary/25 bg-card"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2 px-3.5 py-2.5",
          brutal ? "border-b-2 border-[#111] bg-[#8ea6ff]" : "border-b border-border"
        )}
      >
        <span className={cn(brutal ? "text-[12px] font-black uppercase tracking-[0.09em]" : "text-sm font-semibold")}>
          {t("home.start.title")}
        </span>
        <b
          className={cn(
            "font-mono text-[11px] font-bold tabular-nums",
            brutal ? "rounded-full border-[1.5px] border-[#111] bg-white px-2 py-px" : "text-muted-foreground"
          )}
        >
          {done}/{steps.length}
        </b>
        {/* İlerleme — adım başına bir parça */}
        <span className="ml-auto flex gap-1" aria-hidden>
          {steps.map((s) => (
            <span
              key={s.key}
              className={cn(
                "h-2 w-5 rounded-full",
                brutal ? "border-[1.5px] border-[#111]" : "",
                s.done ? (brutal ? "bg-[#7ae582]" : "bg-primary") : brutal ? "bg-white" : "bg-[var(--sf-3)]"
              )}
            />
          ))}
        </span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("home.start.dismiss")}
          className={cn(
            "-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
            brutal ? "text-[#111] active:bg-[#111]/10" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <X className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      <ol>
        {steps.map((s, i) => {
          const open = i === current;
          const mark = (
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold",
                brutal ? "border-[1.5px] border-[#111]" : "",
                s.done
                  ? brutal
                    ? "bg-[#7ae582]"
                    : "bg-primary text-primary-foreground"
                  : open
                    ? brutal
                      ? "bg-[#ffd23f]"
                      : "bg-primary/15 text-primary"
                    : brutal
                      ? "bg-white"
                      : "bg-[var(--sf-2)] text-muted-foreground"
              )}
            >
              {s.done ? <Check className="h-3.5 w-3.5" strokeWidth={3.25} /> : i + 1}
            </span>
          );
          const divider = i > 0 && (brutal ? "border-t-2 border-[#111]" : "border-t border-border");
          if (open) {
            return (
              <li key={s.key} className={cn("px-3.5 pb-3.5 pt-3", divider, brutal && "bg-[#fff4dc]")}>
                <div className="flex items-center gap-2.5">
                  {mark}
                  <span className={cn(brutal ? "text-[15px] font-black" : "text-sm font-semibold")}>{t(TITLE[s.key])}</span>
                </div>
                <p className={cn("mt-1.5 pl-[34px] text-[12.5px] leading-snug", brutal ? "font-semibold text-[#111]/70" : "text-muted-foreground")}>
                  {t(HINT[s.key])}
                </p>
                {/* Yapının üç halkası, şekil diliyle: kare kategori, daire özellik */}
                {s.key === "category" && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-[34px] text-[11.5px] font-extrabold">
                    {(["welcome.category", "welcome.subcategory", "welcome.feature"] as const).map((k, j) => (
                      <span key={k} className="flex items-center gap-1.5">
                        {j > 0 && <span className="opacity-40">›</span>}
                        <span
                          className={cn(
                            "flex items-center gap-1 rounded-md px-1.5 py-0.5",
                            brutal ? "border-[1.5px] border-[#111] bg-white" : "bg-[var(--sf-2)]"
                          )}
                        >
                          <span
                            className={cn(
                              "h-2.5 w-2.5 border-[1.5px] border-current",
                              k === "welcome.feature" ? "rounded-full" : "rounded-[3px]"
                            )}
                          />
                          {t(k)}
                        </span>
                      </span>
                    ))}
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-2 pl-[34px]">
                  {primary(s.key)}
                  {s.key === "category" && (
                    <Link
                      href="/structure"
                      className={cn(
                        "flex h-10 items-center gap-1 px-1 text-[12.5px] font-extrabold",
                        brutal ? "text-[#111] underline decoration-2 underline-offset-4" : "text-primary"
                      )}
                    >
                      {t("home.start.category.explore")}
                      <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.75} />
                    </Link>
                  )}
                </div>
              </li>
            );
          }
          const act = rowAction(s.key);
          const inner = (
            <>
              {mark}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-left",
                  brutal ? "text-[13.5px] font-extrabold" : "text-sm",
                  s.done && "line-through decoration-2 opacity-45"
                )}
              >
                {t(TITLE[s.key])}
              </span>
              {!s.done && <ArrowRight className="h-4 w-4 shrink-0 opacity-50" strokeWidth={2.5} />}
            </>
          );
          const rowCls = cn("flex w-full items-center gap-2.5 px-3.5 py-2.5", divider);
          return (
            <li key={s.key}>
              {s.done ? (
                <div className={rowCls}>{inner}</div>
              ) : act ? (
                <button type="button" onClick={act} className={cn(rowCls, brutal ? "active:bg-[#111]/5" : "hover:bg-[var(--sf-1)]")}>
                  {inner}
                </button>
              ) : (
                <Link href="/structure/backup" className={cn(rowCls, brutal ? "active:bg-[#111]/5" : "hover:bg-[var(--sf-1)]")}>
                  {inner}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
