"use client";

/**
 * Analiz — tek ekran, bir cümle: NE (özellik ya da her şey) · NEREDE (yer
 * ya da her yer) · NE ZAMAN (dönem).
 *
 * İkisi de "her"ken açılış özeti ve raflar; bir boşluk seçilince cümlenin
 * cevabı. Eski dönem / kategori / alt kategori / özellik sayfaları buraya
 * yönleniyor (bkz. lib/routes). Adres: /analytics?p=…&ne=…&yer=…
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useLiveQuery } from "dexie-react-hooks";
import { ArrowLeft, Check, ChevronDown, Copy, Link2, Sparkles, X } from "lucide-react";
import { db } from "@/lib/db";
import { countByChoice, fmtNum, fmtPct } from "@/lib/analytics";
import { monthPeriod, parsePeriodKey, periodShortLabel, type Period } from "@/lib/period";
import { SymbolIcon } from "@/lib/icons";
import { useSkin } from "@/lib/skin";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Mod } from "@/types";
import { PageHeader } from "@/components/layout/page-header";
import { ModAtomCore, modAtomIcon } from "@/components/structure/mod-atom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PeriodNav, PeriodTabs } from "../period-switcher";
import { StatTile } from "../stat-tile";
import { ShareBars, type ShareRow } from "../share-bars";
import { DailyBarChart } from "../daily-bar-chart";
import { ChoiceDistribution } from "../choice-distribution";
import { EntryListSection, type EntryListRow } from "../entry-list";
import {
  aggregate,
  breakdown,
  changeText,
  dedupe,
  duplicateMods,
  EMPTY_PREFS,
  fmtValue,
  inPlace,
  insightsFor,
  inWin,
  levelPlaces,
  norm,
  pairKey,
  pathLabel,
  pathTo,
  placeKeys,
  prevWindow,
  sameNameGroups,
  seriesOf,
  windowOf,
  buildModel,
  type Model,
  type ModInfo,
  type Node,
  type Place,
  type Prefs,
  type Row,
  type Store,
} from "./model";

// ─── Tercihler (deneme aşamasında tarayıcıda) ────────────────────────────

const PREFS_KEY = "lab:feature-prefs";
function readPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...EMPTY_PREFS, ...JSON.parse(raw) };
  } catch {}
  return EMPTY_PREFS;
}
function usePrefs(): [Prefs, (p: Prefs) => void] {
  const [prefs, setPrefs] = useState<Prefs>(() => (typeof window === "undefined" ? EMPTY_PREFS : readPrefs()));
  const save = (p: Prefs) => {
    setPrefs(p);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(p));
    } catch {}
  };
  return [prefs, save];
}

const useBrutal = () => useSkin() === "brutal";

/** Analiz başlık bandının zemini (zaman + cümle); Brütal'de globals.css bu
 *  sınıflara göre ince çerçeveli kâğıt bant çiziyor */
const ANALYSIS_HEADER =
  "rounded-b-[24px] border-[var(--ln-2)] bg-card pb-0 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.75)]";

type Go = (q: { ne?: string; yer?: string; p?: string }, replace?: boolean) => void;

// ─── Sayfa ────────────────────────────────────────────────────────────────

export function LensPage() {
  const params = useSearchParams();
  const router = useRouter();
  const [prefs, savePrefs] = usePrefs();
  const [nowMs] = useState(() => Date.now());
  const [picker, setPicker] = useState<"ne" | "yer" | null>(null);

  const pKey = params.get("p") ?? params.get("key");
  const period = useMemo(() => (pKey && parsePeriodKey(pKey)) || monthPeriod(nowMs), [pKey, nowMs]);
  const ne = params.get("ne") ?? undefined;
  const yer = params.get("yer") ?? undefined;

  const store = useLiveQuery(async () => {
    const [cats, subs, mods, entries, values] = await Promise.all([
      db.categories.toArray(),
      db.subcategories.toArray(),
      db.mods.toArray(),
      db.entries.toArray(),
      db.entryValues.toArray(),
    ]);
    return { cats, subs, mods, entries, values } as Store;
  }, []);
  const model = useMemo(() => (store ? buildModel(store, prefs.merged) : null), [store, prefs.merged]);

  const go: Go = (q, replace) => {
    const u = new URLSearchParams();
    u.set("p", q.p ?? period.key);
    const nNe = "ne" in q ? q.ne : ne;
    const nYer = "yer" in q ? q.yer : yer;
    if (nNe) u.set("ne", nNe);
    if (nYer) u.set("yer", nYer);
    const url = `/analytics?${u.toString()}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url);
  };

  // Cümlenin boşlukları
  const place: Place = useMemo(() => {
    if (!yer) return { kind: "all" };
    if (yer.startsWith("t:")) {
      const t = prefs.things.find((x) => norm(x.name) === norm(yer.slice(2)));
      return t ? { kind: "thing", name: t.name, keys: t.keys } : { kind: "all" };
    }
    if (model && !model.nodes.has(yer)) return { kind: "all" };
    return { kind: "node", key: yer };
  }, [yer, prefs.things, model]);
  const mi = ne && model ? model.info.get(prefs.merged[ne] ?? ne) : undefined;
  const isHome = !mi && place.kind === "all";

  return (
    <>
      <LensHeader
        period={period}
        onPeriod={(p) => go({ p: p.key }, true)}
        model={model}
        mi={mi}
        place={place}
        onPick={setPicker}
        home={!isHome}
      />
      {!model ? null : isHome ? (
        <Home model={model} period={period} nowMs={nowMs} prefs={prefs} savePrefs={savePrefs} go={go} />
      ) : mi ? (
        <FeatureSentence model={model} mi={mi} place={place} period={period} nowMs={nowMs} prefs={prefs} savePrefs={savePrefs} go={go} />
      ) : (
        <PlaceSentence model={model} place={place} period={period} nowMs={nowMs} prefs={prefs} savePrefs={savePrefs} go={go} />
      )}
      {model && (
        <Picker
          open={picker}
          onClose={() => setPicker(null)}
          model={model}
          prefs={prefs}
          ne={mi?.mod.id}
          place={place}
          onNe={(id) => {
            setPicker(null);
            go({ ne: id });
          }}
          onYer={(key) => {
            setPicker(null);
            go({ yer: key });
          }}
        />
      )}
    </>
  );
}

// ─── Üst bant ─────────────────────────────────────────────────────────────

function placeLabel(model: Model | null, place: Place): string {
  if (place.kind === "all") return "Her yer";
  if (place.kind === "thing") return place.name;
  if (!model) return "…";
  const path = pathTo(model, place.key);
  // Uzun yolda son iki adım
  return path.slice(-2).map((k) => model.nodes.get(k)?.name ?? "?").join(" › ");
}

function LensHeader({
  period,
  onPeriod,
  model,
  mi,
  place,
  onPick,
  home,
}: {
  period: Period;
  onPeriod: (p: Period) => void;
  model: Model | null;
  mi?: ModInfo;
  place: Place;
  onPick: (w: "ne" | "yer") => void;
  home: boolean;
}) {
  const brutal = useBrutal();
  const t = useT();
  const placeNode = place.kind === "node" && model ? model.nodes.get(place.key) : undefined;
  const chip = cn(
    "flex h-8 min-w-0 items-center gap-1.5 px-2.5 text-[12.5px] font-bold",
    brutal
      ? "rounded-[9px] border-2 border-[#111] bg-white text-[#111] shadow-[2px_2px_0_#111]"
      : "rounded-lg bg-[var(--sf-2)] text-foreground ring-1 ring-inset ring-[var(--ln-1)]"
  );
  return (
    <PageHeader
      compact
      className={ANALYSIS_HEADER}
      title={t("insights.title")}
      titleSlot={
        <div className="flex items-center gap-1">
          {home ? (
            <Link
              href={`/analytics?p=${period.key}`}
              aria-label="Özet"
              className={cn(
                "flex shrink-0 items-center justify-center",
                brutal ? "h-[30px] w-[30px] rounded-[9px] border-[1.5px] border-[#111] text-[#111]" : "-ml-1.5 h-8 w-8 rounded-lg text-muted-foreground"
              )}
            >
              <ArrowLeft className="h-[18px] w-[18px]" />
            </Link>
          ) : (
            <span className="w-8 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <PeriodNav period={period} onPick={onPeriod} />
          </div>
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      }
      nav={
        <div className="flex flex-col">
          <PeriodTabs period={period} onPick={onPeriod} />
          {/* Cümle: ne · nerede — boşluğa dokununca seçici */}
          <div data-sentence="" className="flex items-center gap-1.5 py-2">
            <button type="button" onClick={() => onPick("ne")} className={cn(chip, "max-w-[45%]")} aria-label="Özellik seç">
              {mi ? (
                <span className="h-3.5 w-3.5 shrink-0 rounded-full border-[1.5px] border-[#111]" style={{ background: mi.color }} />
              ) : null}
              <span className="truncate">{mi ? mi.mod.name : "Her şey"}</span>
              <ChevronDown className="h-3 w-3 shrink-0 opacity-60" />
            </button>
            <span className="text-muted-foreground">·</span>
            <button type="button" onClick={() => onPick("yer")} className={cn(chip, "min-w-0 flex-1")} aria-label="Yer seç">
              {placeNode || place.kind === "thing" ? (
                <span
                  className="h-3.5 w-3.5 shrink-0 rounded-[4px] border-[1.5px] border-[#111]"
                  style={{ background: placeNode?.color ?? "#C9B8FF" }}
                />
              ) : null}
              <span className="truncate">{placeLabel(model, place)}</span>
              <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-60" />
            </button>
          </div>
        </div>
      }
    />
  );
}

// ─── Ortak parçalar ──────────────────────────────────────────────────────

function Card({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  const C = onClick ? "button" : "div";
  return (
    <C
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("block w-full rounded-2xl border border-border bg-card p-3.5 text-left", onClick && "transition-transform active:scale-[0.99]", className)}
    >
      {children}
    </C>
  );
}

function SectionHead({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="flex items-baseline gap-2 px-1">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {note && <span className="text-[11px] text-muted-foreground/70">{note}</span>}
    </div>
  );
}

function Atom({ mi, size = "sm" }: { mi: ModInfo; size?: "sm" | "md" | "lg" }) {
  return <ModAtomCore icon={modAtomIcon({ name: mi.mod.name, entryType: { valueType: mi.mod.valueType } as never })} size={size} color={mi.color} />;
}

function NodeIcon({ node, size = 40 }: { node?: Node; size?: number }) {
  const brutal = useBrutal();
  const color = node?.color ?? "#C9B8FF";
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", brutal ? "rounded-xl border-2 border-[#111] shadow-[2px_2px_0_#111]" : "rounded-xl")}
      style={{ width: size, height: size, background: brutal ? color : `${color}22` }}
    >
      {node?.icon && <SymbolIcon name={node.icon} size={size * 0.5} style={{ color: brutal ? "#111" : color }} />}
    </span>
  );
}

function Title({ kicker, name, icon }: { kicker: string; name: string; icon: React.ReactNode }) {
  const brutal = useBrutal();
  return (
    <div className="flex items-center gap-3 px-1">
      {icon}
      <div className="min-w-0">
        <div className={cn("truncate text-[12px]", brutal ? "font-extrabold uppercase tracking-wider" : "text-muted-foreground")}>{kicker}</div>
        <h2 className={cn("break-words leading-tight", brutal ? "text-[30px] font-black tracking-tight" : "text-[22px] font-semibold")}>{name}</h2>
      </div>
    </div>
  );
}

/** Bir özelliğin bir küme satırdaki başlık rakamı */
function headline(mi: ModInfo, rows: Row[], model: Model, a: number, b: number, allRows: Row[]): { value: string; sub?: string } {
  if (!rows.length && mi.reading !== "level") return { value: "—" };
  switch (mi.reading) {
    case "level": {
      const places = levelPlaces(model, allRows, a, b).filter((p) => p.inside.length);
      if (!places.length) return { value: "—" };
      if (places.length === 1) {
        const p = places[0];
        return p.delta ? { value: `${p.delta > 0 ? "+" : "−"}${fmtValue(Math.abs(p.delta), mi)}`, sub: `son ${fmtValue(p.last ?? 0, mi)}` } : { value: fmtValue(p.last ?? 0, mi), sub: "son ölçüm" };
      }
      return { value: `${places.length} yer`, sub: places.map((p) => `${p.node.name} ${fmtValue(p.last ?? 0, mi, { withUnit: false })}`).join(" · ") };
    }
    case "choice": {
      const top = countByChoice(rows.map((r) => r.label ?? ""))[0];
      return { value: top?.choice ?? "—", sub: `${new Set(rows.map((r) => r.entry.id)).size} kayıt` };
    }
    case "average":
      return { value: `${fmtNum(aggregate(rows, "average"))}${mi.scale ? ` / ${mi.scale.max}` : ""}`, sub: "ortalama" };
    case "rate":
      return { value: fmtPct(aggregate(rows, "rate")), sub: `${rows.filter((r) => r.value > 0).length}/${rows.length} evet` };
    case "peak":
      return { value: fmtValue(aggregate(rows, "peak"), mi), sub: "en yüksek" };
    default:
      return { value: fmtValue(aggregate(rows, "sum"), mi), sub: `${rows.length} kayıt` };
  }
}

// ─── Açılış ──────────────────────────────────────────────────────────────

function Home({ model, period, nowMs, prefs, savePrefs, go }: { model: Model; period: Period; nowMs: number; prefs: Prefs; savePrefs: (p: Prefs) => void; go: Go }) {
  const brutal = useBrutal();
  const insights = useMemo(() => insightsFor(model, period, nowMs), [model, period, nowMs]);
  const { a, b } = windowOf(period, model.rows, nowMs);
  const used = new Map<string, number>();
  for (const r of inWin(model.rows, a, b)) used.set(r.modId, (used.get(r.modId) ?? 0) + 1);
  const feats = [...used.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => model.info.get(id)!).filter(Boolean);
  const catCount = new Map<string, number>();
  for (const e of inWin(model.entryPaths, a, b)) catCount.set(e.path[0], (catCount.get(e.path[0]) ?? 0) + 1);
  const cats = [...catCount.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ node: model.nodes.get(k)!, n })).filter((x) => x.node);

  const shelf = "no-scrollbar -mx-1 flex gap-3 overflow-x-auto px-1 pb-1";
  const item = "flex w-[68px] shrink-0 flex-col items-center gap-1.5 text-center";

  return (
    <div className="flex flex-col gap-5 pb-6">
      {insights.length === 0 ? (
        <Card className="border-dashed text-center text-[13px] text-muted-foreground">Bu dönemde girdi yok. Dönemi değiştirmeyi dene.</Card>
      ) : (
        <div className="flex flex-col gap-2">
          {insights.map((ins) => (
            <Card
              key={ins.key}
              onClick={() => go({ ne: ins.ne, yer: ins.yer })}
              className={cn(
                ins.tone === "lead" && (brutal ? "!bg-[#FFD23F]" : "bg-[var(--sf-2)]"),
                ins.tone === "absent" && "border-dashed"
              )}
            >
              <div className={cn("text-[11.5px]", brutal ? "font-bold text-[#111]/70" : "text-muted-foreground")}>{ins.scope}</div>
              <div className={cn("tabular-nums tracking-tight", ins.tone === "lead" ? "text-[26px] font-black leading-tight" : "text-[16px] font-bold")}>{ins.title}</div>
              {ins.sub && <div className={cn("mt-0.5 text-[12.5px]", brutal ? "text-[#111]/80" : "text-muted-foreground")}>{ins.sub}</div>}
            </Card>
          ))}
        </div>
      )}

      {feats.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead note="her yerden">Özellikler</SectionHead>
          <div className={shelf}>
            {feats.map((f) => (
              <button key={f.mod.id} type="button" onClick={() => go({ ne: f.mod.id, yer: undefined })} className={item}>
                <span className={cn(brutal && "rounded-full shadow-[2px_2px_0_#111]")}>
                  <Atom mi={f} size="md" />
                </span>
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{f.mod.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {(cats.length > 0 || prefs.things.length > 0) && (
        <section className="flex flex-col gap-2">
          <SectionHead note="her şeyiyle">Yerler</SectionHead>
          <div className={shelf}>
            {prefs.things.map((t) => (
              <button key={t.name} type="button" onClick={() => go({ ne: undefined, yer: `t:${t.name}` })} className={item}>
                <NodeIcon node={{ ...model.nodes.get(t.keys[t.keys.length - 1])!, color: "#C9B8FF" }} size={44} />
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{t.name}</span>
              </button>
            ))}
            {cats.map(({ node }) => (
              <button key={node.key} type="button" onClick={() => go({ ne: undefined, yer: node.key })} className={item}>
                <NodeIcon node={node} size={44} />
                <span className="line-clamp-2 text-[11px] font-semibold leading-tight">{node.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <Suggestions model={model} prefs={prefs} savePrefs={savePrefs} go={go} />
    </div>
  );
}

function Suggestions({ model, prefs, savePrefs, go, only }: { model: Model; prefs: Prefs; savePrefs: (p: Prefs) => void; go: Go; only?: string }) {
  const brutal = useBrutal();
  const [showAll, setShowAll] = useState(false);
  let groups = sameNameGroups(model, prefs);
  if (only) groups = groups.filter((g) => g.nodes.some((n) => n.key === only));
  const dups = only ? [] : duplicateMods(model, prefs);
  if (!groups.length && !dups.length) return null;
  const btn = (kind: "yes" | "no" | "merge") =>
    cn(
      "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px]",
      kind === "no"
        ? brutal ? "border-2 border-[#111] bg-white font-semibold text-[#111]" : "bg-[var(--sf-2)] font-semibold text-muted-foreground"
        : kind === "yes"
          ? brutal ? "border-2 border-[#111] bg-[#7ae582] font-bold text-[#111] shadow-[2px_2px_0_#111]" : "bg-violet-500/90 font-bold text-white"
          : brutal ? "border-2 border-[#111] bg-[#ffd23f] font-bold text-[#111] shadow-[2px_2px_0_#111]" : "bg-amber-500/90 font-bold text-black"
    );
  return (
    <section className="flex flex-col gap-2">
      {!only && <SectionHead>Öneriler</SectionHead>}
      {groups.slice(0, showAll ? groups.length : 1).map((s) => (
        <Card key={s.name} className="border-dashed">
          <div className="flex items-start gap-3">
            <Sparkles className={cn("mt-0.5 h-4 w-4 shrink-0", brutal ? "text-[#111]" : "text-violet-400")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">“{s.name}” {s.nodes.length} yerde geçiyor. Aynı şey mi?</p>
              <ul className="mt-1 flex flex-col gap-0.5 text-[12px] text-muted-foreground">
                {s.nodes.map((n) => (
                  <li key={n.key} className="truncate">{pathLabel(model, pathTo(model, n.key))}</li>
                ))}
              </ul>
              <p className="mt-1 text-[11.5px] text-muted-foreground/80">Aynıysa bütün özellikleri tek yerde birleşir.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={btn("yes")}
                  onClick={() => {
                    savePrefs({ ...prefs, things: [...prefs.things, { name: s.name, keys: s.nodes.map((n) => n.key) }] });
                    go({ ne: undefined, yer: `t:${s.name}` });
                  }}
                >
                  <Check className="h-3.5 w-3.5" /> Evet, aynı
                </button>
                <button type="button" className={btn("no")} onClick={() => savePrefs({ ...prefs, dismissed: [...prefs.dismissed, norm(s.name)] })}>
                  <X className="h-3.5 w-3.5" /> Farklı
                </button>
              </div>
            </div>
          </div>
        </Card>
      ))}
      {groups.length > 1 && !showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="self-start px-1 text-[12px] font-semibold text-muted-foreground underline decoration-dotted underline-offset-4">
          +{groups.length - 1} öneri daha
        </button>
      )}
      {dups.map((d) => (
        <Card key={d.b.id} className="border-dashed">
          <div className="flex items-start gap-3">
            <Copy className={cn("mt-0.5 h-4 w-4 shrink-0", brutal ? "text-[#111]" : "text-amber-400")} />
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold">“{d.b.name}” ile “{d.a.name}” aynı şeyi mi ölçüyor?</p>
              <p className="mt-1 text-[12px] text-muted-foreground">{d.reason} Birlikte sayarsak toplam tek yerde görünür.</p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button type="button" className={btn("merge")} onClick={() => savePrefs({ ...prefs, merged: { ...prefs.merged, [d.b.id]: d.a.id } })}>
                  <Link2 className="h-3.5 w-3.5" /> “{d.a.name}” ile birlikte say
                </button>
                <button type="button" className={btn("no")} onClick={() => savePrefs({ ...prefs, distinct: [...prefs.distinct, pairKey(d.a.id, d.b.id)] })}>
                  <X className="h-3.5 w-3.5" /> Farklı
                </button>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}

// ─── Cümle: bir özellik ───────────────────────────────────────────────────

function entryRowsOf(model: Model, rows: Row[], mi: ModInfo | null, place: Place, limit = 40): EntryListRow[] {
  const keys = placeKeys(place);
  return [...rows]
    .sort((x, y) => y.entry.occurredAt - x.entry.occurredAt)
    .slice(0, limit)
    .map((r) => {
      // Yerin altındaki kısmı göster; her yerdeyse son iki adım
      const at = keys ? r.path.findIndex((k) => keys.includes(k)) : -1;
      const tail = at >= 0 ? r.path.slice(at + 1) : r.path.slice(-2);
      return {
        id: `${r.entry.id}-${r.origId}-${r.label ?? ""}`,
        occurredAt: r.entry.occurredAt,
        title: r.entry.title,
        notes: r.entry.notes,
        subLabel: tail.length ? pathLabel(model, tail) : undefined,
        valueLabel: !mi ? undefined : mi.reading === "choice" ? r.label : mi.reading === "rate" ? (r.value > 0 ? "Evet" : "Hayır") : fmtValue(r.value, mi),
      };
    });
}

function FeatureSentence({ model, mi, place, period, nowMs, prefs, savePrefs, go }: { model: Model; mi: ModInfo; place: Place; period: Period; nowMs: number; prefs: Prefs; savePrefs: (p: Prefs) => void; go: Go }) {
  const brutal = useBrutal();
  const all = model.rows.filter((r) => r.modId === mi.mod.id && inPlace(r.path, place));
  const { a, b, days } = windowOf(period, all, nowMs);
  const level = mi.reading === "level";
  const win = level ? { rows: inWin(all, a, b), dropped: 0 } : dedupe(inWin(all, a, b));
  const pw = prevWindow(period, nowMs);
  const prevRows = pw && !level ? dedupe(inWin(all, pw.a, pw.b)).rows : [];
  const series = seriesOf(period, win.rows, mi.reading, nowMs);
  const mergedIn = Object.entries(prefs.merged).filter(([, to]) => to === mi.mod.id).map(([from]) => model.info.get(from)?.mod).filter((m): m is Mod => !!m);

  // Burada ölçülen başka şeyler
  const others = new Map<string, number>();
  for (const r of inWin(model.rows, a, b)) if (r.modId !== mi.mod.id && inPlace(r.path, place)) others.set(r.modId, (others.get(r.modId) ?? 0) + 1);

  const placeNode = place.kind === "node" ? model.nodes.get(place.key) : undefined;
  const kicker = place.kind === "all" ? "Her yerde" : place.kind === "thing" ? `${place.name} · ${place.keys.length} yer` : pathLabel(model, pathTo(model, place.key));

  // Kutular
  const cur = aggregate(win.rows, mi.reading);
  const prev = aggregate(prevRows, mi.reading);
  const ch = pw && prevRows.length ? changeText(cur, prev, mi) : null;
  const vs = ch ? ch : pw ? "önceki boş" : undefined;
  const tiles: { label: string; value: string; unit?: string; sub?: string }[] =
    mi.reading === "sum"
      ? [
          { label: "Toplam", value: fmtNum(cur), unit: mi.unit || undefined, sub: vs },
          mi.isDuration
            ? { label: "Kayıt başına", value: fmtNum(win.rows.length ? cur / win.rows.length : 0), unit: mi.unit, sub: "ortalama" }
            : { label: "Günlük ort.", value: fmtNum(cur / days), unit: mi.unit || undefined, sub: `${days} gün` },
          { label: "Kayıt", value: fmtNum(win.rows.length), sub: pw ? `önceki ${prevRows.length}` : undefined },
        ]
      : mi.reading === "peak"
        ? [
            { label: "En yüksek", value: fmtNum(cur), unit: mi.unit || undefined, sub: vs },
            { label: "Ortalama", value: fmtNum(aggregate(win.rows, "average")), unit: mi.unit || undefined },
            { label: "Kayıt", value: fmtNum(win.rows.length) },
          ]
        : mi.reading === "average"
          ? [
              { label: "Ortalama", value: fmtNum(cur), unit: mi.scale ? `/ ${mi.scale.max}` : mi.unit, sub: vs },
              { label: "Aralık", value: win.rows.length ? `${fmtNum(Math.min(...win.rows.map((r) => r.value)))}–${fmtNum(Math.max(...win.rows.map((r) => r.value)))}` : "—" },
              { label: "Kayıt", value: fmtNum(win.rows.length) },
            ]
          : mi.reading === "rate"
            ? [
                { label: "Evet oranı", value: fmtPct(cur), sub: vs },
                { label: "Evet", value: fmtNum(win.rows.filter((r) => r.value > 0).length) },
                { label: "Kayıt", value: fmtNum(win.rows.length) },
              ]
            : [
                { label: "En sık", value: countByChoice(win.rows.map((r) => r.label ?? ""))[0]?.choice ?? "—" },
                { label: "Seçenek", value: fmtNum(new Set(win.rows.map((r) => r.label)).size) },
                { label: "Kayıt", value: fmtNum(new Set(win.rows.map((r) => r.entry.id)).size) },
              ];

  // Kırılım
  const groups = level ? [] : breakdown(win.rows, place);
  const maxPeak = Math.max(1, ...groups.map((g) => aggregate(g.rows, "peak")));
  const shareRows: ShareRow[] = groups.map((g) => {
    const n = g.key === "__self" ? placeNode : model.nodes.get(g.key);
    const v = mi.reading === "rate" ? g.rows.filter((r) => r.value > 0).length : aggregate(g.rows, mi.reading);
    return {
      id: g.key,
      name: g.key === "__self" ? `${n?.name ?? (place.kind === "thing" ? place.name : "")} (doğrudan)` : (n?.name ?? "?"),
      color: n?.color ?? mi.color,
      value: v,
      outOf: mi.reading === "rate" || mi.reading === "average" || mi.reading === "peak" ? g.rows.length : undefined,
      display:
        mi.reading === "choice" ? `${v} kayıt` : mi.reading === "rate" ? `${v}/${g.rows.length}` : mi.reading === "average" ? fmtNum(v) : fmtValue(v, mi),
      drillable: g.deeper,
    };
  });
  const shareMode = mi.reading === "rate" ? "rate" : mi.reading === "average" || mi.reading === "peak" ? "level" : "share";
  const shareRange = mi.reading === "average" ? (mi.scale ? { min: mi.scale.min, max: mi.scale.max } : { min: 0, max: Math.max(1, ...shareRows.map((r) => r.value)) }) : mi.reading === "peak" ? { min: 0, max: maxPeak } : undefined;
  const places = level ? levelPlaces(model, all, a, b) : [];

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Title
        kicker={kicker}
        name={mi.mod.name}
        icon={<span className={cn(brutal && "rounded-full border-2 border-[#111] shadow-[2px_2px_0_#111]")}><Atom mi={mi} size="lg" /></span>}
      />
      {mergedIn.length > 0 && (
        <div className="-mt-2 flex flex-wrap gap-2 px-1 text-[12px] text-muted-foreground">
          {mergedIn.map((m) => (
            <span key={m.id} className="flex items-center gap-1.5">
              “{m.name}” de birlikte sayılıyor
              <button
                type="button"
                className="font-semibold underline decoration-dotted underline-offset-4"
                onClick={() => {
                  const next = { ...prefs.merged };
                  delete next[m.id];
                  savePrefs({ ...prefs, merged: next });
                }}
              >
                Ayır
              </button>
            </span>
          ))}
        </div>
      )}

      {level ? (
        <section className="flex flex-col gap-2">
          <SectionHead note="her yerin kendi ölçümü, toplanmaz">Yerler</SectionHead>
          {places.length === 0 && <Card className="border-dashed text-center text-[13px] text-muted-foreground">Bu dönemde ölçüm yok</Card>}
          {places.map((p) => {
            const s = seriesOf(period, p.inside, "level", nowMs);
            return (
              <Card key={p.key} onClick={place.kind === "node" && place.key === p.key ? undefined : () => go({ yer: p.key })}>
                <div className="flex items-center gap-3">
                  <NodeIcon node={p.node} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{p.node.name}</div>
                    <div className="truncate text-[11.5px] text-muted-foreground">{pathLabel(model, p.path.slice(0, -1))}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[17px] font-bold tabular-nums">{fmtValue(p.last ?? 0, mi)}</div>
                    <div className="text-[11px] text-muted-foreground">{p.delta ? `bu dönemde ${p.delta > 0 ? "+" : "−"}${fmtNum(Math.abs(p.delta))}` : p.inside.length ? "son ölçüm" : "bu dönemde ölçüm yok"}</div>
                  </div>
                </div>
                {s && p.inside.length > 1 && (
                  <div className="mt-2">
                    <DailyBarChart data={s.buckets} color={p.node.color} unit={mi.unit} variant="line" caption={s.frame?.caption} showAllTicks={s.frame?.showAllTicks} />
                  </div>
                )}
              </Card>
            );
          })}
        </section>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {tiles.map((t) => (
              <StatTile key={t.label} color={mi.color} label={t.label} value={t.value} unit={t.unit} sub={t.sub} wordValue={mi.reading === "choice" && t.label === "En sık"} />
            ))}
          </div>
          {pw && (
            <p className="-mt-2 px-1 text-[11px] text-muted-foreground">
              Karşılaştırma: {pw.label}{pw.partial ? " (aynı gün sayısı)" : ""}
              {win.dropped > 0 ? ` · paralel perspektifli ${win.dropped} girdi bir kez sayıldı` : ""}
            </p>
          )}
          {!pw && win.dropped > 0 && <p className="-mt-2 px-1 text-[11px] text-muted-foreground">Paralel perspektifli {win.dropped} girdi bir kez sayıldı.</p>}

          {mi.reading === "choice" && (
            <ChoiceDistribution rows={countByChoice(win.rows.map((r) => r.label ?? ""))} color={mi.color} selected={null} onSelect={() => {}} />
          )}

          {shareRows.length > 0 && !(shareRows.length === 1 && !shareRows[0].drillable) && (
            <section className="flex flex-col gap-2">
              <SectionHead note="dokununca bir kademe iner">Nereden</SectionHead>
              <div className="rounded-2xl border border-border bg-card p-4">
                <ShareBars rows={shareRows} mode={shareMode} range={shareRange} onSelect={(id) => id !== "__self" && go({ yer: id })} emptyText="Bu dönemde veri yok" />
              </div>
            </section>
          )}

          {series && mi.reading !== "choice" && (
            <section className="flex flex-col gap-2">
              <SectionHead note={periodShortLabel(period)}>Zaman içinde</SectionHead>
              <div className="rounded-2xl border border-border bg-card p-4">
                <DailyBarChart
                  data={series.buckets}
                  color={mi.color}
                  unit={mi.reading === "rate" ? undefined : mi.unit}
                  caption={series.frame?.caption}
                  showAllTicks={series.frame?.showAllTicks}
                  scale={mi.reading === "average" ? shareRange : undefined}
                  stack={mi.reading === "rate" ? { valueLabel: "Evet", restLabel: "Hayır" } : undefined}
                />
              </div>
            </section>
          )}
        </>
      )}

      {place.kind !== "all" && others.size > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead note="dokununca özellik değişir">Burada ölçülen başka şeyler</SectionHead>
          <div className="flex flex-wrap gap-2">
            {[...others.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => {
              const o = model.info.get(id)!;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => go({ ne: id })}
                  className={cn(
                    "flex h-8 items-center gap-1.5 px-2.5 text-[12.5px] font-semibold",
                    brutal ? "rounded-[9px] border-2 border-[#111] bg-white text-[#111]" : "rounded-lg bg-[var(--sf-2)]"
                  )}
                >
                  <span className="h-3 w-3 rounded-full border-[1.5px] border-[#111]" style={{ background: o.color }} />
                  {o.mod.name}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {place.kind === "thing" && <ThingFooter model={model} place={place} prefs={prefs} savePrefs={savePrefs} go={go} />}

      <EntryListSection title="Kayıtlar" accent={mi.color} rows={entryRowsOf(model, win.rows, mi, place)} emptyText="Bu dönemde kayıt yok" />
    </div>
  );
}

// ─── Cümle: bir yer, her şeyiyle ──────────────────────────────────────────

function PlaceSentence({ model, place, period, nowMs, prefs, savePrefs, go }: { model: Model; place: Place; period: Period; nowMs: number; prefs: Prefs; savePrefs: (p: Prefs) => void; go: Go }) {
  const brutal = useBrutal();
  const rows = model.rows.filter((r) => inPlace(r.path, place));
  const entries = model.entryPaths.filter((e) => inPlace(e.path, place));
  const { a, b } = windowOf(period, entries, nowMs);
  const pw = prevWindow(period, nowMs);
  const winEntries = inWin(entries, a, b);
  const prevEntries = pw ? inWin(entries, pw.a, pw.b) : [];
  const node = place.kind === "node" ? model.nodes.get(place.key) : model.nodes.get((placeKeys(place) ?? [])[0]);

  // Özellikler, her biri kendi okumasıyla
  const byMod = new Map<string, Row[]>();
  for (const r of rows) {
    const l = byMod.get(r.modId) ?? [];
    l.push(r);
    byMod.set(r.modId, l);
  }
  const feats = [...byMod.entries()]
    .map(([id, list]) => {
      const mi = model.info.get(id)!;
      const level = mi.reading === "level";
      const cur = level ? inWin(list, a, b) : dedupe(inWin(list, a, b)).rows;
      const prev = pw && !level ? dedupe(inWin(list, pw.a, pw.b)).rows : [];
      const h = headline(mi, cur, model, a, b, list);
      const ch = !level && mi.reading !== "choice" && prev.length ? changeText(aggregate(cur, mi.reading), aggregate(prev, mi.reading), mi) : null;
      return { mi, cur, list, h, ch };
    })
    .filter((f) => f.cur.length > 0)
    .sort((x, y) => y.cur.length - x.cur.length);

  // Hesaplananlar: biriken / sayacın artışı (₺/km, L/100 km)
  const counter = feats
    .filter((f) => f.mi.reading === "level")
    .map((f) => ({ f, places: levelPlaces(model, f.list, a, b).filter((p) => p.counter && p.delta > 0) }))
    .find((x) => x.places.length > 0);
  const distance = counter ? counter.places.reduce((s, p) => s + p.delta, 0) : 0;
  const derived = counter
    ? feats
        .filter((f) => f.mi.reading === "sum" && f.mi.unit && !f.mi.isDuration)
        .map((f) => {
          const total = aggregate(f.cur, "sum");
          return f.mi.unit === "L"
            ? { label: `L/100 ${counter.f.mi.unit}`, name: "Tüketim", value: (total / distance) * 100, from: f.mi.mod.name }
            : { label: `${f.mi.unit}/${counter.f.mi.unit}`, name: `${counter.f.mi.unit} başına`, value: total / distance, from: f.mi.mod.name };
        })
    : [];

  // Alt yerler
  const subs = new Map<string, number>();
  for (const e of winEntries) {
    const keys = placeKeys(place)!;
    const at = e.path.findIndex((k) => keys.includes(k));
    const child = at >= 0 ? e.path[at + 1] : undefined;
    if (child) subs.set(child, (subs.get(child) ?? 0) + 1);
  }
  const subRows: ShareRow[] = [...subs.entries()].map(([k, n]) => {
    const nd = model.nodes.get(k);
    return { id: k, name: nd?.name ?? "?", color: nd?.color ?? "#888", value: n, display: `${n} kayıt` };
  });

  // Kayıt satırında gösterilecek ilk değer (km, ₺…)
  const firstValue = new Map<string, string>();
  for (const r of rows) {
    if (firstValue.has(r.entry.id)) continue;
    const info = model.info.get(r.modId);
    if (!info) continue;
    firstValue.set(r.entry.id, info.reading === "choice" ? (r.label ?? "") : info.reading === "rate" ? (r.value > 0 ? "Evet" : "Hayır") : fmtValue(r.value, info));
  }
  const kicker = place.kind === "thing" ? `${place.keys.length} yer birleşik` : node ? (node.isCat ? "Kategori" : pathLabel(model, pathTo(model, node.key).slice(0, -1))) : "";
  const countCh = pw && prevEntries.length ? changeText(winEntries.length, prevEntries.length, null) : null;

  return (
    <div className="flex flex-col gap-4 pb-6">
      <Title kicker={kicker} name={place.kind === "thing" ? place.name : (node?.name ?? "")} icon={<NodeIcon node={place.kind === "thing" && node ? { ...node, color: "#C9B8FF" } : node} size={brutal ? 56 : 48} />} />
      <p className="-mt-2 px-1 text-[12.5px] text-muted-foreground">
        {periodShortLabel(period)}: {winEntries.length} kayıt{countCh && countCh !== "aynı" ? ` · öncekine göre ${countCh}` : ""}
      </p>

      {feats.length === 0 ? (
        <Card className="border-dashed text-center text-[13px] text-muted-foreground">Bu dönemde burada ölçülmüş bir özellik yok</Card>
      ) : (
        <section className="flex flex-col gap-2">
          <SectionHead note="dokununca o özelliğe bakar">Özellikler</SectionHead>
          {feats.map((f) => (
            <Card key={f.mi.mod.id} onClick={() => go({ ne: f.mi.mod.id })}>
              <div className="flex items-center gap-3">
                <Atom mi={f.mi} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-semibold">{f.mi.mod.name}</div>
                  <div className="truncate text-[11.5px] text-muted-foreground">
                    {f.ch ? (f.ch === "aynı" ? "öncekiyle aynı" : `öncekine göre ${f.ch}`) : f.h.sub}
                  </div>
                </div>
                <div className="shrink-0 text-right text-[16px] font-bold tabular-nums">{f.h.value}</div>
              </div>
            </Card>
          ))}
        </section>
      )}

      {derived.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead note="yaklaşık · dönemdeki sayaç artışına göre">Hesaplananlar</SectionHead>
          <div className="grid grid-cols-2 gap-2">
            {derived.map((d) => (
              <StatTile key={d.label} color="#8b5cf6" label={d.name} value={fmtNum(d.value)} unit={d.label} sub={d.from} />
            ))}
          </div>
        </section>
      )}

      {subRows.length > 0 && (
        <section className="flex flex-col gap-2">
          <SectionHead note="dokununca içine girer">İçindekiler</SectionHead>
          <div className="rounded-2xl border border-border bg-card p-4">
            <ShareBars rows={subRows} onSelect={(id) => go({ yer: id })} />
          </div>
        </section>
      )}

      {place.kind === "node" && <Suggestions model={model} prefs={prefs} savePrefs={savePrefs} go={go} only={place.key} />}
      {place.kind === "thing" && <ThingFooter model={model} place={place} prefs={prefs} savePrefs={savePrefs} go={go} />}

      <EntryListSection
        title="Kayıtlar"
        accent={node?.color ?? "#8b5cf6"}
        rows={[...winEntries]
          .sort((x, y) => y.entry.occurredAt - x.entry.occurredAt)
          .slice(0, 40)
          .map((e) => {
            const keys = placeKeys(place)!;
            const at = e.path.findIndex((k) => keys.includes(k));
            const tail = e.path.slice(at + 1);
            const first = firstValue.get(e.entry.id);
            return {
              id: e.entry.id,
              occurredAt: e.entry.occurredAt,
              title: e.entry.title,
              notes: e.entry.notes,
              subLabel: tail.length ? pathLabel(model, tail) : model.nodes.get(e.path[e.path.length - 1])?.name,
              valueLabel: first,
            };
          })}
        emptyText="Bu dönemde kayıt yok"
      />
    </div>
  );
}

function ThingFooter({ model, place, prefs, savePrefs, go }: { model: Model; place: Extract<Place, { kind: "thing" }>; prefs: Prefs; savePrefs: (p: Prefs) => void; go: Go }) {
  return (
    <div className="flex flex-col gap-0.5 px-1 text-[11.5px] text-muted-foreground">
      {place.keys.map((k) => (
        <span key={k} className="truncate">• {pathLabel(model, pathTo(model, k))}</span>
      ))}
      <button
        type="button"
        onClick={() => {
          savePrefs({ ...prefs, things: prefs.things.filter((t) => norm(t.name) !== norm(place.name)) });
          go({ yer: undefined });
        }}
        className="mt-1 self-start font-semibold underline decoration-dotted underline-offset-4"
      >
        Aynı değil — birleştirmeyi kaldır
      </button>
    </div>
  );
}

// ─── Boşluk seçici ───────────────────────────────────────────────────────

function Picker({
  open,
  onClose,
  model,
  prefs,
  ne,
  place,
  onNe,
  onYer,
}: {
  open: "ne" | "yer" | null;
  onClose: () => void;
  model: Model;
  prefs: Prefs;
  ne?: string;
  place: Place;
  onNe: (id: string | undefined) => void;
  onYer: (key: string | undefined) => void;
}) {
  const brutal = useBrutal();
  const row = (on: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[14px]",
      on ? (brutal ? "bg-[#111] font-bold text-[#FFF4DC]" : "bg-[var(--sf-3)] font-semibold") : "hover:bg-[var(--sf-2)]"
    );
  // Kullanılan özellikler, çoktan aza
  const counts = new Map<string, number>();
  for (const r of model.rows) counts.set(r.modId, (counts.get(r.modId) ?? 0) + 1);
  const mods = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([id]) => model.info.get(id)!).filter(Boolean);
  // Kayıt olan yerler, ağaç sırasıyla
  const usedKeys = new Set(model.entryPaths.flatMap((e) => e.path));
  const tree: { node: Node; depth: number }[] = [];
  const walk = (parentKey: string | undefined, depth: number) => {
    for (const n of model.nodes.values()) {
      if (n.parentKey !== parentKey || !usedKeys.has(n.key)) continue;
      if (parentKey === undefined && !n.isCat) continue;
      tree.push({ node: n, depth });
      walk(n.key, depth + 1);
    }
  };
  walk(undefined, 0);
  const curYer = place.kind === "node" ? place.key : place.kind === "thing" ? `t:${place.name}` : undefined;

  return (
    <Dialog open={open !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[80vh] max-w-[360px] gap-2 overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base">{open === "ne" ? "Neye bakılsın?" : "Nerede?"}</DialogTitle>
        </DialogHeader>
        {open === "ne" ? (
          <div className="flex flex-col gap-0.5">
            <button type="button" className={row(!ne)} onClick={() => onNe(undefined)}>
              Her şey <span className="ml-auto text-[12px] opacity-70">yerin bütün özellikleri</span>
            </button>
            {mods.map((m) => (
              <button key={m.mod.id} type="button" className={row(ne === m.mod.id)} onClick={() => onNe(m.mod.id)}>
                <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-[#111]" style={{ background: m.color }} />
                <span className="truncate">{m.mod.name}</span>
                <span className="ml-auto shrink-0 text-[11.5px] opacity-60">{m.unit || (m.reading === "choice" ? "seçenek" : m.reading === "rate" ? "evet/hayır" : "")}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            <button type="button" className={row(!curYer)} onClick={() => onYer(undefined)}>
              Her yer
            </button>
            {prefs.things.map((t) => (
              <button key={t.name} type="button" className={row(curYer === `t:${t.name}`)} onClick={() => onYer(`t:${t.name}`)}>
                <span className="h-4 w-4 shrink-0 rounded-[4px] border-[1.5px] border-[#111] bg-[#C9B8FF]" />
                {t.name} <span className="ml-auto text-[11.5px] opacity-60">{t.keys.length} yer birleşik</span>
              </button>
            ))}
            {tree.map(({ node, depth }) => (
              <button key={node.key} type="button" className={row(curYer === node.key)} style={{ paddingLeft: 10 + depth * 18 }} onClick={() => onYer(node.key)}>
                <span className={cn("h-4 w-4 shrink-0 border-[1.5px] border-[#111]", node.isCat ? "rounded-[4px]" : "rounded-[3px] opacity-80")} style={{ background: node.color }} />
                <span className={cn("truncate", node.isCat && "font-semibold")}>{node.name}</span>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

