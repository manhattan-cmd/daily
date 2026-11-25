"use client";

import { useState, type ReactNode } from "react";
import { CornerDownRight, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import {
  SummaryBlock,
  SummaryEmpty,
  SummaryTile,
  type SummaryLead,
  type SummaryLink,
  type SummaryStat,
} from "@/components/ui/summary-block";

/** Yapı'nın sarısı — şerit, sayfa başı ve sekmenin şekli */
export const YAPI = "#ffd23f";

/**
 * Yapı sayfalarının başı (Brütal) — Harita dışındaki bütün Yapı sayfalarında
 * ana sayfanın Bugün'ü ve gün sayfasının özetiyle AYNI blok (bkz.
 * SummaryBlock head): beyaz pencerenin tepesine kenardan kenara oturan
 * başlık; benekli ad hücresi, yanında adlı kare karolar, altında üç sayı,
 * en altta gidilecek yerin bandı.
 *
 *  - Liste sayfaları (Kategoriler, Özellikler, Nesneler, Girdiler, Notlar):
 *    ad hücresi Yapı sarısında "KATEGORİLER · 10 kategori"; karolar Ara
 *    (beyaz; açıkken Kapat) ve Ekle (yeşil, ne ekleneceği yazılı).
 *  - Kalem sayfaları (kategori, alt kategori, liste, nesne): ad hücresi
 *    kalemin kendi renginde, simgesi ve adı; karolar Düzenle ve Sil; altında
 *    "↳ Harcamalar › Ulaşım" (bunun içinde); en altta Analiz bandı.
 *  - Ara'ya basınca arama satırı başın içinde açılır; kapatınca silinir.
 *  - Hiç kayıt yoksa boş pencere başın altında ayrı durur.
 *
 * Önceki hali (2026-11-21) ince bir başlık çubuğuydu: sekmenin şekli, adı,
 * sayısı ve 40 px kare Ara / + düğmeleri. Kalem sayfalarında çubuk sekmenin
 * kökünü yazıyor, kalemin adı ve sayıları altındaki ikinci blokta
 * duruyordu — iki baş üst üste. Kullanıcı Yapı'nın da ana sayfa ve gün
 * sayfası gibi baştan başlamasını istedi (2026-11-25).
 */
export function StructureHead({
  lead,
  stats = [],
  add,
  edit,
  remove,
  search,
  searchRow,
  onCloseSearch,
  rows,
  link,
  empty,
}: {
  /** Ad hücresi — liste sayfasında sayı (count), kalem sayfasında kalem (thing) */
  lead: SummaryLead;
  /** Üç sayı; yüklenirken boş (satır çizilmez) */
  stats?: SummaryStat[];
  /** Ekle karosu — label karonun adı ("Kategori ekle") */
  add?: { label: string; onClick: () => void };
  /** Kalem sayfası: Düzenle karosu */
  edit?: () => void;
  /** Kalem sayfası: Sil karosu */
  remove?: () => void;
  /** Verilirse Ara karosu ve arama satırı */
  search?: { value: string; onChange: (q: string) => void; placeholder: string };
  /** Arama satırı yerine (Özellikler: tür süzgeçli arama) — autoFocus alır */
  searchRow?: (autoFocus: boolean) => ReactNode;
  /** Arama kapanınca (Özellikler: tür süzgeci de sıfırlanır — gizli kalmasın) */
  onCloseSearch?: () => void;
  /** Ad satırının altındaki satırlar (konum yolu, görünüm anahtarı) */
  rows?: ReactNode;
  /** En alttaki band (Analiz, Takvim) ve dağılım şeridi */
  link?: SummaryLink;
  /** Hiç kayıt yok — başın altında küçük boş pencere */
  empty?: { text: string; action: { label: string; onClick: () => void } };
}) {
  const t = useT();
  // Adresten aranmış gelindiyse (Ara'nın özellik sonucu) açık başlar
  const [open, setOpen] = useState(() => !!search?.value);
  // Düğmeyle açıldıysa kutuya odaklan; açılışta açıksa klavye kendiliğinden açılmasın
  const [focus, setFocus] = useState(false);
  const searching = !!search && (open || !!search.value);

  function toggleSearch() {
    if (searching) {
      setOpen(false);
      search?.onChange("");
      onCloseSearch?.();
    } else {
      setOpen(true);
      setFocus(true);
    }
  }

  const actions: ReactNode[] = [];
  if (search)
    actions.push(
      <SummaryTile
        color="#ffffff"
        icon={searching ? X : Search}
        label={searching ? t("action.close") : t("action.search")}
        pressed={searching}
        onClick={toggleSearch}
      />
    );
  if (add) actions.push(<SummaryTile color="#7ae582" icon={Plus} label={add.label} onClick={add.onClick} />);
  if (edit) actions.push(<SummaryTile color="#ffffff" icon={Pencil} label={t("action.edit")} onClick={edit} />);
  if (remove) actions.push(<SummaryTile color="#ff6b6b" icon={Trash2} label={t("action.delete")} onClick={remove} />);

  return (
    <>
      <SummaryBlock
        head
        className="mb-4"
        lead={lead}
        actions={actions}
        below={
          <>
            {rows}
            {searching &&
              (searchRow ? (
                searchRow(focus)
              ) : (
                <HeadSearch value={search.value} onChange={search.onChange} placeholder={search.placeholder} autoFocus={focus} />
              ))}
          </>
        }
        stats={stats}
        link={link}
      />
      {empty && (
        <div className="mb-4 overflow-hidden rounded-[18px] border-2 border-line shadow-[4px_4px_0_var(--shade)]">
          <SummaryEmpty text={empty.text} action={empty.action} />
        </div>
      )}
    </>
  );
}

/** Başın arama satırı — beyaz, çerçevesiz (çizgisi bloğun) */
function HeadSearch({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (q: string) => void;
  placeholder: string;
  autoFocus: boolean;
}) {
  const t = useT();
  return (
    <label data-structure-search="" className="relative flex h-11 items-center bg-paper">
      <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-ink/45" strokeWidth={2.4} />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="search"
        className="h-full w-full bg-transparent pl-10 pr-10 text-[14.5px] font-bold text-ink outline-none placeholder:font-semibold placeholder:text-ink/40"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 flex h-7 w-7 items-center justify-center rounded-full bg-ink/[0.07] text-ink/70"
          aria-label={t("features.clearSearch")}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.6} />
        </button>
      )}
    </label>
  );
}

/** Konum yolu satırı — ad satırının altında; önünde ↳: "bunun içinde" */
export function HeadTrailRow({ children }: { children: ReactNode }) {
  return (
    <div data-structure-trail-row="" className="flex min-w-0 items-center bg-paper pl-2.5">
      <CornerDownRight aria-hidden className="h-4 w-4 shrink-0 text-ink/45" strokeWidth={2.6} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Pazartesiden başlayan bu haftanın ve bu ayın ilk anı (yerel saat) */
export function periodStarts(now = new Date()): { today: number; week: number; month: number } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dow = (now.getDay() + 6) % 7;
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow).getTime();
  const month = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return { today, week, month };
}

/** Sayı — Türkçe biçimde, 3 basamağı aşan "999+" değil tam (başın sayıları) */
export const headNum = (n: number) => n.toLocaleString("tr-TR", { maximumFractionDigits: 0 });
