"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { nanoid } from "nanoid";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useT } from "@/lib/i18n";
import { confirmDialog } from "@/components/ui/confirm";
import {
  deleteNote,
  discardEmptyNote,
  getNote,
  noteIsEmpty,
  updateNote,
} from "@/lib/db/queries";
import type { Note } from "@/types";

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

/** Notun gövdesi tek metin — eski notların paragraf blokları satırlarla birleşir */
const bodyOf = (n: Note) => n.blocks.map((b) => b.text).join("\n");

/**
 * Not editörü — başlık ve düz metin, o kadar.
 *
 * İlk aşama için sadeleştirildi: önceki sürüm bir wiki gibiydi (kelimeden
 * not/girdi bağı, bağ önerileri, takma adlar, geri bağlantılar, hayat
 * haritası). Kalabalık geldi; not artık günün yanına düşülen serbest yazı.
 *
 * Veri modeli değişmedi (Dexie göçü yok): gövde tek bir blokta saklanıyor.
 * Eski notların blokları ve bağları kayıtta durur; not yalnız DEĞİŞTİRİLİRSE
 * tek bloğa yazılır — açıp bakmak hiçbir şeyi silmez.
 */
export default function NoteEditorPage({
  params,
}: {
  params: Promise<{ noteId: string }>;
}) {
  const t = useT();
  const { noteId } = use(params);
  const router = useRouter();
  // undefined: yükleniyor, null: bulunamadı
  const [loaded, setLoaded] = useState<Note | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [dirty, setDirty] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // DB'den bir kez yüklenir — canlı sorgu yazarken imleci zıplatırdı
  useEffect(() => {
    getNote(noteId).then((n) => {
      setLoaded(n ?? null);
      if (!n) return;
      setTitle(n.title ?? "");
      setBody(bodyOf(n));
    });
  }, [noteId]);

  // Yeni (boş) not doğrudan yazmaya açılır
  useEffect(() => {
    if (loaded && noteIsEmpty(loaded)) bodyRef.current?.focus();
  }, [loaded]);

  const blocksOf = (text: string) => [
    { id: loaded?.blocks[0]?.id ?? nanoid(12), text },
  ];

  // Yazdıkça kaydedilir (400ms sessizlikten sonra)
  useEffect(() => {
    if (!loaded || !dirty) return;
    const timer = setTimeout(() => {
      updateNote(noteId, { title, blocks: blocksOf(body) });
    }, 400);
    return () => clearTimeout(timer);
    // blocksOf yalnız loaded'a bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, loaded, dirty, title, body]);

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
    const current: Note = { ...loaded, title, blocks: blocksOf(body) };
    // Boş bırakılan not saklanmaz. Önce son hali yazılır: bekleyen otomatik
    // kayıt notu doldurmuşken sonradan boşaltılmışsa DB'deki eski dolu hali
    // yüzünden atılmazdı.
    if (dirty) await updateNote(noteId, { title, blocks: current.blocks });
    if (noteIsEmpty(current)) await discardEmptyNote(noteId);
    router.back();
  }

  async function handleDelete() {
    if (!loaded) return;
    const ok = await confirmDialog({
      title: t("confirm.deleteNote"),
      body: t("confirm.deleteNoteBody"),
      destructive: true,
    });
    if (!ok) return;
    await deleteNote(noteId);
    router.push(`/calendar/${loaded.date}`);
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
        onChange={(e) => {
          setTitle(e.target.value);
          setDirty(true);
        }}
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
        onChange={(e) => {
          setBody(e.target.value);
          setDirty(true);
        }}
        placeholder={t("note.placeholder")}
        rows={6}
        className="mb-28 w-full resize-none overflow-hidden bg-transparent text-[15px] leading-relaxed text-foreground/90 outline-none placeholder:text-muted-foreground/40"
      />
    </>
  );
}
