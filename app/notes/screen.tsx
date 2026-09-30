"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { routes } from "@/lib/routes";
import { useNoteDraft } from "@/components/notes/use-note-draft";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS_LONG = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${WEEKDAYS_LONG[dt.getDay()]}`;
}


/**
 * Not sayfası — eski bağlantılar için duruyor. Notlar artık pencerede
 * açılıyor (NoteWindow); ikisi aynı mantığı kullanıyor (useNoteDraft).
 *
 * İlk aşama için sadeleştirildi: önceki sürüm bir wiki gibiydi (kelimeden
 * not/girdi bağı, bağ önerileri, takma adlar, geri bağlantılar, hayat
 * haritası). Kalabalık geldi; not artık günün yanına düşülen serbest yazı.
 *
 * Veri modeli değişmedi (Dexie göçü yok): gövde tek bir blokta saklanıyor.
 * Eski notların blokları ve bağları kayıtta durur; not yalnız DEĞİŞTİRİLİRSE
 * tek bloğa yazılır — açıp bakmak hiçbir şeyi silmez.
 */
export function NoteEditorPage({
  params,
}: {
  params: { noteId: string };
}) {
  const t = useT();
  const { noteId } = params;
  const router = useRouter();
  const { loaded, title, setTitle, body, setBody, finish, remove } =
    useNoteDraft(noteId);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // Yeni (boş) not doğrudan yazmaya açılır
  const isEmpty = !!loaded && !title && !body;
  useEffect(() => {
    if (isEmpty) bodyRef.current?.focus();
    // yalnız yüklendiği an
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  // Gövde yazdıkça uzar — sayfa kayar, kutunun içi değil
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, loaded]);

  async function handleBack() {
    if (!loaded) {
      router.push("/calendar");
      return;
    }
    await finish();
    router.back();
  }

  async function handleDelete() {
    if (!loaded) return;
    if (await remove()) router.push(routes.day(loaded.date));
  }

  if (loaded === undefined) return null;
  if (loaded === null) {
    return (
      <div className="pt-10">
        <p className="text-sm text-muted-foreground">
          Not bulunamadı.{" "}
          <Link href="/calendar" className="text-primary">
            Takvime dön
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Başlık çubuğu */}
      <div className="flex items-center justify-between pb-4 pt-10">
        <button
          onClick={handleBack}
          className="-ml-0.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          aria-label={t("note.backSaved")}
        >
          <ArrowLeft className="h-4 w-4" />
          <span>{dateLabel(loaded.date)}</span>
        </button>
        <button
          onClick={handleDelete}
          className="rounded-lg p-1.5 text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("note.delete")}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("note.title")}
        className="mb-3 w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30"
        onKeyDown={(e) => {
          // Başlıkta Enter gövdeye geçer
          if (e.key === "Enter") {
            e.preventDefault();
            bodyRef.current?.focus();
          }
        }}
      />

      <textarea
        ref={bodyRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("note.placeholder")}
        rows={6}
        className="mb-28 w-full resize-none overflow-hidden bg-transparent text-[15px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/40"
      />
    </>
  );
}
