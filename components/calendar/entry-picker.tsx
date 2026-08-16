"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Plus,
  Search,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { getEntryCountsBySubcategory } from "@/lib/db/queries";
import { MEASURE_KIND_META } from "@/lib/measure-kinds";
import { SubCategoryForm } from "@/components/structure/subcategory-form";
import { HScroll } from "@/components/ui/h-scroll";
import { SymbolIcon } from "@/lib/icons";
import { usageSince } from "@/lib/usage";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import type { Category, Mod, SubCategory } from "@/types";

export type NetGroup = {
  category: Category;
  topSubs: SubCategory[];
  allSubs: SubCategory[];
};

/** Odak — id tabanlı, veri güncellemesine dayanıklı */
type Focus =
  | null
  | { type: "cat"; cat: Category }
  | { type: "sub"; sub: SubCategory };

type FocusRef =
  | null
  | { type: "cat"; id: string }
  | { type: "sub"; id: string };

type Node =
  | { kind: "cat"; cat: Category }
  | { kind: "sub"; sub: SubCategory };

const NO_COUNTS: ReadonlyMap<string, number> = new Map();

/** Bu sayıdan sonra arama kutusu çıkıyor */
const SEARCH_FROM = 10;
/** Bu sayıdan sonra A–Z bölümlere ayrılıyor */
const SECTIONS_FROM = 14;
/** Sık girilen kategoriler çipleri bu sayıdan sonra anlamlı */
const FREQ_CATS_FROM = 5;
/** Hızlı ekle şeridinde en fazla bu kadar kart durur */
const QUICK_MAX = 10;

/**
 * Şeride elle sabitlenen kalemler (localStorage).
 *
 * Şerit kendiliğinden en çok kullanılanlarla doluyor ama bu her zaman
 * yetmiyor: yeni edinilen bir alışkanlık daha sayı biriktirmediği için
 * şeride giremiyor, oysa kullanıcının en çok gireceği yer tam da orası.
 * Sabitlenenler önde, kalan yerleri sıklık dolduruyor.
 *
 * Cihazda kalan bir görünüm tercihi olduğu için localStorage yetiyor —
 * Dexie'ye tablo açmak yedek/senkron yüzeyini de büyütürdü.
 */
const LS_PINS = "entrypicker:pins";

function readPins(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PINS) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
  } catch {
    return []; // okunamayan tercih sessizce boş sayılır
  }
}

/** Türkçe duyarlı bölüm başlığı — ada göre A–Z gruplaması */
function sectionKeyOf(name: string): string {
  const ch = name.trim().charAt(0).toLocaleUpperCase("tr");
  return /\p{L}/u.test(ch) ? ch : "#";
}
const norm = (s: string) => s.toLocaleLowerCase("tr").trim();

/** Rengi ton çemberinde kaydır — aynı ailenin komşu tonları */
function shiftHue(hex: string, deg: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const num = parseInt(m[1], 16);
  const r = (num >> 16) / 255;
  const g = ((num >> 8) & 255) / 255;
  const b = (num & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const mm = l - c / 2;
  const [rr, gg, bb] =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const hx = (v: number) =>
    Math.round((v + mm) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hx(rr)}${hx(gg)}${hx(bb)}`;
}

type Row = {
  node: Node;
  id: string;
  name: string;
  icon?: string;
  color: string;
  /** Kaç alt kalemi var */
  kids: number;
};

/**
 * Girdi eklerken "nereye" sorusunun cevabı — aranabilir, kademeli bir liste.
 *
 * Bir süre burada bir sinir ağı vardı: kategoriler daireler, aralarında ışıyan
 * bağlar, sürüklenip yakınlaştırılan bir tuval. Harita olarak güzeldi ama
 * girdi eklemek SERİ bir iş — "koştum" demek için haritada gezinmek istemiyor
 * insan. Ağ Yapı > Harita'ya taşındı; burada kalan şey en kısa yol: dokun, in,
 * ekle.
 */
export function EntryPicker({
  groups,
  onSubSelect,
  onCategorySelect,
  onQuickAdd,
  onQuickAddCategory,
  onClose,
}: {
  groups: NetGroup[] | undefined;
  onSubSelect: (sub: SubCategory) => void;
  onCategorySelect: (category: Category) => void;
  /** Formu açmadan kaydet — "koştum" demek için detay şart değil */
  onQuickAdd: (sub: SubCategory) => void;
  onQuickAddCategory: (category: Category) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [focus, setFocus] = useState<FocusRef>(null);
  const [addSub, setAddSub] = useState<{
    categoryId: string;
    parentId?: string;
  } | null>(null);
  // Bir kaleme varınca açılan ekle modülü — hızlı kayıt mı, detaylı mı
  const [commitOpen, setCommitOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Şeride elle eklenenler + onları seçtiren panel
  const [pins, setPins] = useState<string[]>(readPins);
  const [pinOpen, setPinOpen] = useState(false);

  function togglePin(id: string) {
    setPins((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : [...prev, id];
      try {
        localStorage.setItem(LS_PINS, JSON.stringify(next));
      } catch {
        /* kalıcı yazılamazsa oturum boyunca geçerli */
      }
      return next;
    });
  }

  const categories = useMemo(
    () => (groups ?? []).map((g) => g.category),
    [groups]
  );
  const visibleSubs = useMemo(
    () =>
      (groups ?? []).flatMap((g) => g.allSubs).filter((s) => !s.isCategoryRoot),
    [groups]
  );
  const childrenMap = useMemo(() => {
    const m = new Map<string, SubCategory[]>();
    for (const s of visibleSubs) {
      if (!s.parentId) continue;
      const arr = m.get(s.parentId) ?? [];
      arr.push(s);
      m.set(s.parentId, arr);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.order - b.order);
    return m;
  }, [visibleSubs]);
  const subById = useMemo(
    () => new Map(visibleSubs.map((s) => [s.id, s])),
    [visibleSubs]
  );
  const catById = useMemo(
    () => new Map(categories.map((c) => [c.id, c])),
    [categories]
  );
  const topSubsByCat = useMemo(
    () => new Map((groups ?? []).map((g) => [g.category.id, g.topSubs])),
    [groups]
  );

  // Sayım son 30 güne bakıyor (lib/usage): "sık kullanılanlar" şu anki
  // hayatı göstermeli, arşivi değil.
  const entryCounts =
    useLiveQuery(() => getEntryCountsBySubcategory(usageSince()), []) ??
    NO_COUNTS;

  const focusObj: Focus = useMemo(() => {
    if (focus == null) return null;
    if (focus.type === "cat") {
      const c = catById.get(focus.id);
      return c ? { type: "cat", cat: c } : null;
    }
    const s = subById.get(focus.id);
    return s ? { type: "sub", sub: s } : null;
  }, [focus, catById, subById]);

  const centerColor =
    focusObj == null
      ? "#818cf8"
      : focusObj.type === "cat"
        ? focusObj.cat.color
        : catById.get(focusObj.sub.categoryId)?.color ?? "#818cf8";

  const nodes: Node[] = useMemo(() => {
    if (focusObj == null)
      return categories.map((cat) => ({ kind: "cat", cat }));
    if (focusObj.type === "cat")
      return (topSubsByCat.get(focusObj.cat.id) ?? []).map((sub) => ({
        kind: "sub",
        sub,
      }));
    return (childrenMap.get(focusObj.sub.id) ?? []).map((sub) => ({
      kind: "sub",
      sub,
    }));
  }, [focusObj, categories, topSubsByCat, childrenMap]);

  /** Odaktaki kalemde ölçülen özellikler — ekle modülü bunları gösteriyor */
  const modsByTarget = useLiveQuery(async () => {
    const [atts, mods] = await Promise.all([
      db.categoryModifiers.toArray(),
      db.mods.toArray(),
    ]);
    const modById = new Map(mods.map((m) => [m.id, m]));
    const map = new Map<string, Mod[]>();
    for (const a of atts.sort((x, y) => x.order - y.order)) {
      const m = a.modId ? modById.get(a.modId) : undefined;
      if (!m) continue;
      const arr = map.get(a.targetId) ?? [];
      if (!arr.some((x) => x.id === m.id)) arr.push(m);
      map.set(a.targetId, arr);
    }
    return map;
  }, []);

  /**
   * Kardeşlerin tonu. Bir kategorinin içinde bütün kalemler dalın rengini
   * alıyordu ve sayfa tek renge boyanıyordu — dört turuncu karo üst üste.
   * Şimdi her kardeş o rengin komşu tonunu alıyor: aile belli, kalemler
   * ayrı. Harita da aynı dili konuşuyor (neural-map).
   */
  const rows: Row[] = useMemo(() => {
    const n = nodes.length;
    const spread = Math.max(28, Math.min(72, 18 * (n - 1)));
    return nodes.map((node, i) => {
      const isCat = node.kind === "cat";
      return {
        node,
        id: isCat ? node.cat.id : node.sub.id,
        name: isCat ? node.cat.name : node.sub.name,
        icon: isCat ? node.cat.icon : node.sub.icon,
        color: isCat
          ? node.cat.color
          : n <= 1
            ? centerColor
            : shiftHue(centerColor, (i / (n - 1) - 0.5) * spread),
        kids: isCat
          ? topSubsByCat.get(node.cat.id)?.length ?? 0
          : childrenMap.get(node.sub.id)?.length ?? 0,
      };
    });
  }, [nodes, centerColor, topSubsByCat, childrenMap]);

  const q = norm(query);
  /** Bulunulan yerin altı var mı — sayfanın düzeni buna göre değişiyor */
  const hasKids = rows.length > 0;
  const filtered = q ? rows.filter((r) => norm(r.name).includes(q)) : rows;

  /**
   * Hızlı ekle — ağacın HER YERİNDEN, en çok kayıt alan kalemler.
   *
   * Bulunulan kademenin çocukları değil: kayıt "Sağlık > Su"ya giriliyor,
   * "Sağlık"a değil. Kökte gezinmeden oraya atlamak iki üç dokunuş
   * kazandırıyor — seçicinin bütün ölçüsü bu. Sayım kalemin KENDİ girdisi
   * (alt ağaç toplamı değil): dokunulunca kayıt oraya gidecek.
   *
   * Yalnız kökte ve arama yokken: bir dalın içine girmiş kullanıcı zaten
   * daraltmış oluyor.
   */
  const quick = useMemo(() => {
    if (q || focus != null) return [];
    // Önce elle sabitlenenler (kullanıcının sırasıyla), sonra sıklık
    const pinned = pins
      .map((id) => subById.get(id))
      .filter((s): s is SubCategory => !!s);
    const seen = new Set(pinned.map((s) => s.id));
    const byUse = visibleSubs
      .filter((s) => !seen.has(s.id))
      .map((sub) => ({ sub, n: entryCounts.get(sub.id) ?? 0 }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .map((x) => x.sub);
    return [...pinned, ...byUse].slice(0, QUICK_MAX).map((sub) => ({
      id: sub.id,
      name: sub.name,
      icon: sub.icon,
      color: catById.get(sub.categoryId)?.color ?? "#818cf8",
      parent: catById.get(sub.categoryId)?.name ?? "",
      sub,
    }));
  }, [visibleSubs, subById, entryCounts, catById, q, focus, pins]);

  /**
   * Sık girilen kategoriler — uzun kategori listesinde aşağıda kalanlara
   * kısayol. Hızlı ekle şeridiyle karışmıyor çünkü işi başka: o doğrudan
   * KAYIT açıyor, bu kategorinin İÇİNE giriyor. Biçimi de ayrı (çip), yani
   * altındaki tam listenin tekrarı gibi okunmuyor.
   *
   * Sayım kategorinin bütün alt ağacı. Kısa listede çıkmıyor: beş kalemlik
   * bir listeye kısayol koymak yer kaybı.
   */
  const hotCats = useMemo(() => {
    if (q || focus != null || rows.length < FREQ_CATS_FROM) return [];
    const weight = new Map<string, number>();
    for (const g of groups ?? [])
      weight.set(
        g.category.id,
        g.allSubs.reduce((n, s) => n + (entryCounts.get(s.id) ?? 0), 0)
      );
    const hot = rows
      .filter((r) => (weight.get(r.id) ?? 0) > 0)
      .sort((a, b) => (weight.get(b.id) ?? 0) - (weight.get(a.id) ?? 0))
      .slice(0, 6);
    return hot.length >= 2 ? hot : [];
  }, [rows, groups, entryCounts, q, focus]);

  /**
   * Şeride eklenebilecekler: bütün kalemler, sabitlenmişler en üstte.
   * Yol yazısı ("Spor › Koşu") aynı adı taşıyan iki kalemi ayırt ettiriyor.
   */
  const pinCandidates = useMemo(() => {
    const pathOf = (s: SubCategory) => {
      const parts: string[] = [];
      let cur = s.parentId ? subById.get(s.parentId) : undefined;
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parentId ? subById.get(cur.parentId) : undefined;
      }
      const cat = catById.get(s.categoryId)?.name;
      return [cat, ...parts].filter(Boolean).join(" › ");
    };
    return visibleSubs
      .map((sub) => ({
        id: sub.id,
        name: sub.name,
        icon: sub.icon,
        color: catById.get(sub.categoryId)?.color ?? "#818cf8",
        path: pathOf(sub),
      }))
      .sort((a, b) => {
        const pa = pins.indexOf(a.id);
        const pb = pins.indexOf(b.id);
        if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
        return a.path.localeCompare(b.path, "en") || a.name.localeCompare(b.name, "en");
      });
  }, [visibleSubs, subById, catById, pins]);

  /**
   * A–Z bölümleri YALNIZ kökte. Bir kategorinin içinde kalemlerin sırası
   * kullanıcının kendi sırası (haritada sürükleyerek dizdiği sıra) ve o sıra
   * anlam taşıyor — alfabeye bölmek onu bozuyordu. Kökte ise kategori sayısı
   * arttıkça harfe göre aramak işe yarıyor.
   */
  const sections = useMemo(() => {
    if (q || focus != null || filtered.length < SECTIONS_FROM)
      return [{ key: "", items: filtered }];
    const m = new Map<string, Row[]>();
    for (const r of filtered) {
      const k = sectionKeyOf(r.name);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    return [...m.entries()]
      .sort((a, b) =>
        a[0] === "#" ? 1 : b[0] === "#" ? -1 : a[0].localeCompare(b[0], "en")
      )
      .map(([key, items]) => ({
        key,
        items: items.sort((x, y) => x.name.localeCompare(y.name, "en")),
      }));
  }, [filtered, q, focus]);

  const trail = useMemo(() => {
    const list: { label: string; focus: FocusRef }[] = [
      { label: t("structure.categories"), focus: null },
    ];
    if (focusObj == null) return list;
    if (focusObj.type === "cat") {
      list.push({
        label: focusObj.cat.name,
        focus: { type: "cat", id: focusObj.cat.id },
      });
      return list;
    }
    const chain: SubCategory[] = [];
    let cur: SubCategory | undefined = focusObj.sub;
    while (cur) {
      chain.unshift(cur);
      cur = cur.parentId ? subById.get(cur.parentId) : undefined;
    }
    const cat = catById.get(focusObj.sub.categoryId);
    if (cat) list.push({ label: cat.name, focus: { type: "cat", id: cat.id } });
    for (const s of chain)
      list.push({ label: s.name, focus: { type: "sub", id: s.id } });
    return list;
  }, [focusObj, subById, catById, t]);

  function drill(node: Node) {
    setQuery("");
    setFocus(
      node.kind === "cat"
        ? { type: "cat", id: node.cat.id }
        : { type: "sub", id: node.sub.id }
    );
  }
  /** Şeritten seçim: o kaleme geç ve ekle modülünü aç — gezinme yok */
  function pickQuick(sub: SubCategory) {
    setQuery("");
    setFocus({ type: "sub", id: sub.id });
    setCommitOpen(true);
  }
  function commitQuick() {
    if (focusObj == null) return;
    setCommitOpen(false);
    if (focusObj.type === "cat") onQuickAddCategory(focusObj.cat);
    else onQuickAdd(focusObj.sub);
  }
  function commitDetailed() {
    if (focusObj == null) return;
    setCommitOpen(false);
    if (focusObj.type === "cat") onCategorySelect(focusObj.cat);
    else onSubSelect(focusObj.sub);
  }
  function openAddSub() {
    if (focusObj == null) return;
    if (focusObj.type === "cat") setAddSub({ categoryId: focusObj.cat.id });
    else
      setAddSub({
        categoryId: focusObj.sub.categoryId,
        parentId: focusObj.sub.id,
      });
  }

  const focusName =
    focusObj == null
      ? t("structure.categories")
      : focusObj.type === "cat"
        ? focusObj.cat.name
        : focusObj.sub.name;
  const focusIcon =
    focusObj == null
      ? undefined
      : focusObj.type === "cat"
        ? focusObj.cat.icon
        : focusObj.sub.icon;
  const focusMods =
    focusObj == null
      ? []
      : modsByTarget?.get(
          focusObj.type === "cat" ? focusObj.cat.id : focusObj.sub.id
        ) ?? [];
  const structureHref =
    focusObj == null
      ? ""
      : focusObj.type === "cat"
        ? `/structure/${focusObj.cat.id}`
        : `/structure/${focusObj.sub.categoryId}/${focusObj.sub.id}`;

  return (
    <div className="relative flex min-h-0 flex-col">
      {/* Yol izi — nerede olduğun ve geri dönüş.
          Her basamak bir çip: ataları düz metin bırakmak satırı yarım
          bırakıyordu, çip olunca dokunulabilir oldukları da görünüyor.
          Bulunulan yer kaleminin renginde ve önünde bir nokta var.
          Yol derinleşince satır SONA kayıyor (HScroll followEnd) — son
          basamak ekrandan çıkınca kullanıcı nerede olduğunu göremiyordu.
          Kökte hiç yazılmıyor: tek basamaklı bir yol iz değil, başlığın
          tekrarı. */}
      {focusObj != null && (
        <div className="shrink-0 px-4 pb-2.5">
          <HScroll className="items-center gap-1" followEnd={focusName}>
            {trail.map((tr, i) => {
              const last = i === trail.length - 1;
              return (
                <span key={i} className="flex shrink-0 items-center gap-1">
                  {i > 0 && (
                    <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/35" />
                  )}
                  <button
                    onClick={() => {
                      setQuery("");
                      setFocus(tr.focus);
                    }}
                    aria-current={last ? "page" : undefined}
                    className={cn(
                      "flex max-w-[150px] shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] transition-colors",
                      last
                        ? "font-semibold text-foreground"
                        : "border border-white/[0.09] bg-white/[0.04] font-medium text-muted-foreground hover:bg-white/[0.07] hover:text-foreground"
                    )}
                    style={
                      last
                        ? {
                            background: `${centerColor}26`,
                            boxShadow: `inset 0 0 0 1px ${centerColor}59`,
                          }
                        : undefined
                    }
                  >
                    {last && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: centerColor }}
                      />
                    )}
                    <span className="truncate leading-5">{tr.label}</span>
                  </button>
                </span>
              );
            })}
          </HScroll>
        </div>
      )}

      {/* Sabit üst bölüm: asli eylem, kısayollar ve arama listeyle birlikte
          kaymamalı — uzun listede aşağı inince arama kutusu kayboluyordu ve
          kullanıcı onu geri getirmek için başa dönüyordu. */}
      <div className="flex shrink-0 flex-col gap-3 px-4 pb-3">
        {/* Çocuğu olmayan kalemde yapılacak tek şey kayıt eklemek: orada
            asli eylem koca bir bant olarak duruyor. Çocuğu VARSA aynı bant
            "buraya mı ekleyeyim, aşağıdan mı seçeyim" ikilemini büyütüyordu
            — orada küçük bir düğmeye iniyor, sayfanın işi listeyi seçtirmek
            oluyor. */}
        {focusObj != null && !hasKids && (
          <button
            onClick={() => setCommitOpen(true)}
            className="flex shrink-0 items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors active:opacity-80"
            style={{
              background: `${centerColor}14`,
              boxShadow: `inset 0 0 0 1px ${centerColor}33`,
            }}
          >
            <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-semibold leading-6">
                {focusName}
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                {t("tree.addRecordHere")}
              </span>
            </span>
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: centerColor }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </span>
          </button>
        )}

        {/* Hızlı ekle en üstte ve sabit: en kısa yol o, listeyle birlikte
            kaymamalı. Kökte var — bir dalın içine girmiş kullanıcı zaten
            daraltmış oluyor. */}
        {focusObj == null && (
          <QuickRail
            items={quick}
            onPick={pickQuick}
            onAdd={() => setPinOpen(true)}
          />
        )}

        {/* Eylemler — yalnız bir dalın içinde. Kategori yaratmak sheet
            başlığına taşındı: her kademede duran bir eylem oraya ait.
            "Buraya ekle" burada kalemin renginde duruyor ki üç düğme
            arasında hangisinin asli olduğu belli olsun. Yapı sayfası
            yalnız simge: adı yazınca satır üç düğmeye yetmiyordu. */}
        {focusObj != null && (
          <div className="flex shrink-0 items-center gap-2">
            {hasKids && (
              <QuietButton
                icon={Plus}
                color={centerColor}
                onClick={() => setCommitOpen(true)}
              >
                {t("entry.addHere")}
              </QuietButton>
            )}
            <QuietButton icon={FolderPlus} onClick={openAddSub}>
              {t("tree.createSubcategory")}
            </QuietButton>
            <QuietButton
              icon={Layers}
              href={structureHref}
              onClick={onClose}
              label={t("tree.structurePage")}
            />
          </div>
        )}

        {rows.length >= SEARCH_FROM && (
          <div className="relative shrink-0">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("action.search")}
              className="h-10 w-full rounded-xl border border-white/8 bg-white/[0.03] pl-9 pr-3 text-sm placeholder:text-muted-foreground/50 focus:border-white/15 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Kayan bölüm: sık girilen kategoriler + gezinme listesi */}
      <div className="flex min-h-0 flex-col gap-4 overflow-y-auto overscroll-contain px-4 pb-6">
        {/* Sık kullanılan kategoriler — ALTINDAKİ listenin aynı yapısında.
            Bir ara çipe çevrilmişti (tekrar gibi okunmasın diye); ama bu
            iki blok aynı şeyi seçtiriyor ve aynı görünmeleri doğru. Ayrımı
            başlık yapıyor, biçim değil. */}
        {hotCats.length > 0 && (
          <Section label={t("entry.frequentCategories")}>
            {hotCats.map((r) => (
              <PickRow key={`hot${r.id}`} row={r} onOpen={drill} />
            ))}
          </Section>
        )}

        {filtered.length === 0 ? (
          // Arama boş dönerse söylenecek bir şey var; alt kategorisi
          // olmayan bir kalemde ise söylenecek bir şey YOK — orada
          // "Eşleşen bir şey yok" demek uydurma bir eksiklik yaratıyordu.
          q ? (
            <p className="px-1 py-8 text-center text-sm text-muted-foreground">
              {t("entry.noMatch")}
            </p>
          ) : null
        ) : (
          sections.map((sec) => (
            // Bir dalın içindeyken listenin başlığı KİMİN listesi olduğunu
            // söylüyor. Başlıksızken "Harcamalar" sayfasındaki satırların
            // Harcamalar'ın altı mı yoksa başka bir şey mi olduğu belli
            // değildi — üstteki "buraya ekle" ile birlikte kafa karıştırıyordu.
            <Section
              key={sec.key}
              label={
                sec.key ||
                (focusObj != null && !q
                  ? t("entry.childrenOf", { name: focusName })
                  : "")
              }
            >
              {sec.items.map((r) => (
                <PickRow key={r.id} row={r} onOpen={drill} />
              ))}
            </Section>
          ))
        )}

        {focusObj == null && rows.length === 0 && (
          <p className="px-1 py-8 text-center text-sm text-muted-foreground">
            {t("tree.noCategoriesYet")}
          </p>
        )}
      </div>

      {/* ── Ekle modülü ────────────────────────────────────────────────
          Asli eylem TEK ve belirgin: "Ekle". Ölçmek isteyen "Detay ekle"ye
          gidiyor — orada değerler, özellik ekleme ve yeni özellik yaratma
          birlikte duruyor. */}
      {commitOpen && focusObj != null && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setCommitOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 rounded-t-2xl border-t border-white/10 bg-background px-5 pb-6 pt-4">
            <div className="mb-4 flex items-center gap-3">
              <Tile color={centerColor} icon={focusIcon} fallback={FolderOpen} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-semibold leading-6">
                  {focusName}
                </div>
                <div className="mt-0.5 truncate text-xs leading-5 text-muted-foreground">
                  {focusMods.length > 0
                    ? focusMods.map((m) => m.name).join(" · ")
                    : t("entry.noFeaturesYet")}
                </div>
              </div>
              <button
                onClick={() => setCommitOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {focusMods.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-1.5">
                {focusMods.map((m) => {
                  const Icon = MEASURE_KIND_META[m.valueType ?? "number"].icon;
                  return (
                    <span
                      key={m.id}
                      className="flex items-center gap-1.5 rounded-lg border border-white/8 px-2 py-1 text-[11px] text-muted-foreground"
                    >
                      <Icon className="h-3 w-3" style={{ color: centerColor }} />
                      {m.name}
                      {m.unit ? (
                        <span className="text-muted-foreground/50">{m.unit}</span>
                      ) : null}
                    </span>
                  );
                })}
              </div>
            )}

            <button
              onClick={commitQuick}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold text-white transition-opacity active:opacity-85"
              style={{ backgroundColor: centerColor }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              {t("entry.addNow")}
            </button>
            <button
              onClick={commitDetailed}
              className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-white/8 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Sparkles className="h-3.5 w-3.5" />
              {t("entry.addWithDetail")}
            </button>
          </div>
        </>
      )}

      {/* ── Şeride ekle ────────────────────────────────────────────────
          Ayrı bir diyalog değil, aynı yüzeyin üstünde bir panel: üst üste
          açılan diyaloglar bu uygulamada kırılgan. Seçilen kalem şeritte
          en öne geçiyor, tekrar dokunmak çıkarıyor. */}
      {pinOpen && (
        <>
          <div
            className="absolute inset-0 z-30 bg-black/50"
            onClick={() => setPinOpen(false)}
          />
          <div className="animate-in absolute inset-x-0 bottom-0 z-40 flex max-h-[85%] flex-col rounded-t-2xl border-t border-white/10 bg-background">
            <div className="flex shrink-0 items-start gap-3 px-5 pb-3 pt-4">
              <div className="min-w-0 flex-1">
                <div className="text-base font-semibold leading-tight">
                  {t("entry.pinTitle")}
                </div>
                <div className="mt-1 text-xs leading-snug text-muted-foreground">
                  {t("entry.pinHint")}
                </div>
              </div>
              <button
                onClick={() => setPinOpen(false)}
                aria-label={t("action.close")}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/6 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 overflow-y-auto overscroll-contain px-4 pb-6">
              <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
                {pinCandidates.map((c) => {
                  const on = pins.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      onClick={() => togglePin(c.id)}
                      aria-pressed={on}
                      className="flex min-h-[56px] w-full items-center gap-3 border-t border-white/[0.06] px-3 py-2 text-left transition-colors first:border-t-0 hover:bg-white/[0.05] active:bg-white/[0.08]"
                    >
                      <Tile color={c.color} icon={c.icon} size={34} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium leading-5 text-foreground">
                          {c.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs leading-5 text-muted-foreground">
                          {c.path}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors",
                          on ? "text-white" : "bg-white/[0.06] text-muted-foreground/50"
                        )}
                        style={on ? { backgroundColor: c.color } : undefined}
                      >
                        {on ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        ) : (
                          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      <SubCategoryForm
        open={addSub !== null}
        onOpenChange={(o) => {
          if (!o) setAddSub(null);
        }}
        categoryId={addSub?.categoryId ?? ""}
        parentSubcategoryId={addSub?.parentId}
        categoryName={addSub ? catById.get(addSub.categoryId)?.name : undefined}
      />
    </div>
  );
}

/**
 * Karonun üstünde okunacak mürekkep. Sarı, limon, açık turkuaz gibi
 * renklerde beyaz simge kayboluyor; parlaklığa göre siyaha dönüyor.
 */
function inkOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const n = parseInt(m[1], 16);
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * lin((n >> 16) & 255) +
    0.7152 * lin((n >> 8) & 255) +
    0.0722 * lin(n & 255);
  return L > 0.45 ? "#0b0c10" : "#ffffff";
}

/**
 * Kalemin karosu — DOLU renk, üstünde okunur bir simge.
 *
 * İki uçtan da dönüldü. Önce dışa ışıyan bir haleydi ve liste boyunca
 * tekrarlayınca sayfa uzay boşluğuna dönüyordu; sonra rengi %16 alfaya
 * indirdik ve bu sefer her şey soldu. Doğrusu ortada değil, başka bir
 * yerde: renk TAM doygun ama ışımıyor. Karo listenin renk çıpası,
 * gerisi nötr kalıyor.
 */
function Tile({
  color,
  icon,
  fallback: Fallback = Folder,
  size = 40,
}: {
  color: string;
  icon?: string;
  fallback?: typeof Folder;
  size?: number;
}) {
  const ink = inkOn(color);
  const glyph = Math.round(size * 0.5);
  return (
    <span
      className="flex shrink-0 items-center justify-center"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.28),
        backgroundColor: color,
        // Üstten gelen ince ışık + koyu çeper: dolu renk yassı durmasın
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 0 1px rgba(0,0,0,0.14)",
      }}
    >
      {icon ? (
        <SymbolIcon name={icon} size={glyph} style={{ color: ink }} />
      ) : (
        <Fallback
          style={{ color: ink, width: glyph, height: glyph }}
          strokeWidth={2}
        />
      )}
    </span>
  );
}

/** Bölüm — başlık dışarıda, satırlar tek bir yüzeyde */
function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0">
      {label && (
        <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground/60">
          {Icon && <Icon className="h-3 w-3" />}
          {label}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border border-white/[0.07] bg-white/[0.015]">
        {children}
      </div>
    </div>
  );
}

/**
 * Liste satırı. Kullanım sıklığı SATIRDA anlatılmıyor — bir ara sönük
 * kalemleri soluklaştırıyorduk ve liste bütün olarak cansız görünüyordu.
 * Sıklığın yeri "Hızlı ekle" şeridi; gezinme listesi net ve eşit duruyor.
 */
function PickRow({ row: r, onOpen }: { row: Row; onOpen: (node: Node) => void }) {
  const t = useT();
  return (
    <button
      onClick={() => onOpen(r.node)}
      // Sabit en az yükseklik: alt kalemi olmayan satır tek satırlık kalıp
      // listeyi tırtıklı gösteriyordu
      className="flex min-h-[60px] w-full items-center gap-3 border-t border-white/[0.06] px-3 py-2.5 text-left transition-colors first:border-t-0 hover:bg-white/[0.05] active:bg-white/[0.08]"
    >
      <Tile
        color={r.color}
        icon={r.icon}
        fallback={r.kids > 0 ? FolderOpen : Folder}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium leading-6 text-foreground">
          {r.name}
        </span>
        {r.kids > 0 && (
          <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
            {t("tree.subItemCount", { count: r.kids })}
          </span>
        )}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </button>
  );
}

/**
 * Hızlı ekle — en çok kayıt aldığın kalemler, gezinmeden.
 *
 * Bir ara bunlar listenin başına ikinci bir liste olarak konuyordu ve aynı
 * kalem iki kez görünüyordu; hataya benziyordu, sonra da eşiğin arkasına
 * saklandı ve büsbütün kayboldu. Doğru yer burası ve doğru biçim ŞERİT:
 * listeden farklı bir şekli olduğu için tekrar gibi okunmuyor, kendi işini
 * söylüyor. İçindekiler ağacın HER YERİNDEN gelen yapraklar — dokununca
 * doğrudan ekle modülü açılıyor, iki üç dokunuş birden kalkıyor.
 */
function QuickRail({
  items,
  onPick,
  onAdd,
}: {
  items: { id: string; name: string; icon?: string; color: string; parent: string; sub: SubCategory }[];
  onPick: (sub: SubCategory) => void;
  /** Şeride elle kalem eklemek — sıklık her zaman doğru tahmin etmiyor */
  onAdd: () => void;
}) {
  const t = useT();
  return (
    <div className="shrink-0">
      {/* Ekleme düğmesi BAŞLIK satırında: şeridin sonuna konunca kartların
          arkasında kalıyor ve yatay kaydırmadan görünmüyordu. */}
      <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Zap className="h-3 w-3" />
        {t("entry.quickAdd")}
        <button
          onClick={onAdd}
          className="ml-auto flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.05] py-1 pl-1.5 pr-2.5 text-[10px] font-medium normal-case tracking-normal text-muted-foreground transition-colors hover:text-foreground active:bg-white/[0.09]"
        >
          <Plus className="h-3 w-3" strokeWidth={2.5} />
          {t("action.add")}
        </button>
      </div>
      {/* Kart nötr, karo renkli: kartı da renge boyamak renkli dikdörtgen
          yığını demekti ve şerit listeden gürültülü oluyordu. Renk çıpası
          tek yerde dursun. */}
      <HScroll className="gap-1.5 px-0.5 pb-0.5">
        {items.map((it) => (
          <button
            key={it.id}
            onClick={() => onPick(it.sub)}
            className="flex w-[66px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.045] px-1 py-2 text-center transition-colors hover:bg-white/[0.07] active:bg-white/[0.09]"
          >
            <Tile color={it.color} icon={it.icon} size={30} />
            <span className="w-full">
              <span className="block truncate text-[11px] font-semibold leading-4 text-foreground">
                {it.name}
              </span>
              <span className="block truncate text-[9px] leading-[14px] text-muted-foreground">
                {it.parent}
              </span>
            </span>
          </button>
        ))}
      </HScroll>
    </div>
  );
}

/**
 * Küçük eylem düğmesi — bağlantı ya da düğme olarak.
 * `color` verilirse kalemin renginde durur: aynı satırdaki üç düğmeden
 * hangisinin asli olduğu böyle anlaşılıyor. Yazısı yoksa yalnız simge
 * (o zaman `label` erişilebilirlik için şart).
 */
function QuietButton({
  icon: Icon,
  children,
  onClick,
  href,
  color,
  label,
}: {
  icon: typeof Plus;
  children?: React.ReactNode;
  onClick: () => void;
  href?: string;
  /** Asli eylem — kalemin renginde */
  color?: string;
  /** Yalnız simgeli düğmenin adı */
  label?: string;
}) {
  const cls = cn(
    "flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors",
    color
      ? "border-transparent text-foreground"
      : "border-white/8 text-muted-foreground hover:text-foreground active:bg-white/5",
    !children && "px-2"
  );
  const style = color
    ? { background: `${color}26`, boxShadow: `inset 0 0 0 1px ${color}59` }
    : undefined;
  const body = (
    <>
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
      {children && <span className="truncate leading-5">{children}</span>}
    </>
  );
  // prefetch açıkça: sheet içindeki bağlantıda görünürlük tabanlı varsayılan
  // önden çekme tetiklenmiyor ve tıklamada bekleme oluyordu
  return href ? (
    <Link
      href={href}
      prefetch
      onClick={onClick}
      className={cls}
      style={style}
      aria-label={label}
      title={label}
    >
      {body}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cls}
      style={style}
      aria-label={label}
      title={label}
    >
      {body}
    </button>
  );
}
