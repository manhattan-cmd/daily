"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
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

/** Notun gövdesi tek metin — eski notların paragraf blokları satırlarla birleşir */
const bodyOf = (n: Note) => n.blocks.map((b) => b.text).join("\n");

/**
 * Bir notun düzenleme durumu — not penceresi ve (eski bağlantılar için) not
 * sayfası aynı mantığı kullanıyor.
 *
 * - Not DB'den bir kez yüklenir: canlı sorgu yazarken imleci zıplatırdı.
 * - Yazdıkça 400 ms sessizlikten sonra kaydedilir.
 * - `finish()` kapatırken çağrılır: son hali yazar, boş kalan notu silme
 *   günlüğüne düşürmeden atar (yoksa "1 not silindi · Geri al" çıkıyordu).
 * - Veri modeli değişmedi: gövde tek blokta; eski notların blokları ve
 *   bağları, not DEĞİŞTİRİLMEDİKÇE olduğu gibi kalır.
 */
export function useNoteDraft(noteId: string) {
  const t = useT();
  // undefined: yükleniyor, null: bulunamadı
  const [loaded, setLoaded] = useState<Note | null | undefined>(undefined);
  const [title, setTitleState] = useState("");
  const [body, setBodyState] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    getNote(noteId).then((n) => {
      if (!alive) return;
      setLoaded(n ?? null);
      if (!n) return;
      setTitleState(n.title ?? "");
      setBodyState(bodyOf(n));
    });
    return () => {
      alive = false;
    };
  }, [noteId]);

  const blocksOf = (text: string) => [
    { id: loaded?.blocks[0]?.id ?? nanoid(12), text },
  ];

  useEffect(() => {
    if (!loaded || !dirty) return;
    const timer = setTimeout(() => {
      updateNote(noteId, { title, blocks: blocksOf(body) });
    }, 400);
    return () => clearTimeout(timer);
    // blocksOf yalnız loaded'a bağlı
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, loaded, dirty, title, body]);

  const setTitle = (v: string) => {
    setTitleState(v);
    setDirty(true);
  };
  const setBody = (v: string) => {
    setBodyState(v);
    setDirty(true);
  };

  /** Kapatırken: son hali yaz, boşsa at */
  async function finish() {
    if (!loaded) return;
    const current: Note = { ...loaded, title, blocks: blocksOf(body) };
    // Önce son hal: bekleyen otomatik kayıt notu doldurmuşken sonradan
    // boşaltılmışsa DB'deki eski dolu hali yüzünden atılmazdı
    if (dirty) await updateNote(noteId, { title, blocks: current.blocks });
    if (noteIsEmpty(current)) await discardEmptyNote(noteId);
  }

  /** Onay isteyip siler; silindiyse true */
  async function remove(): Promise<boolean> {
    if (!loaded) return false;
    const ok = await confirmDialog({
      title: t("confirm.deleteNote"),
      body: t("confirm.deleteNoteBody"),
      destructive: true,
    });
    if (!ok) return false;
    await deleteNote(noteId);
    return true;
  }

  return { loaded, title, setTitle, body, setBody, finish, remove };
}
