import {
  clearConnectionsForNote,
  listAllNotes,
  markNoteAnalyzed,
  upsertNoteConnection,
} from "@/lib/db/queries";
import { buildLexicalIndex, noteText, noteTitle } from "@/lib/notes-graph";
import { AiError, callClaude } from "./anthropic";
import type { Note } from "@/types";

// Küçük günce için tüm notları aday ver (anlamca bağları kelime örtüşmesi
// olmadan da bulsun); çok not varsa en benzer bu kadarıyla sınırla.
const MAX_CANDIDATES = 18;

const SYSTEM = `Sen bir kişisel günce analizcisisin. Kullanıcının notları arasında anlamlı örüntüleri bulursun: aynı düşünce kalıbı, tekrar eden his ya da ruh hâli, aynı kişi/ilişki, aynı kaygı ya da arzu, aynı planlama/uğraş, örtük bir tema. Amacın kullanıcının kendini daha iyi tanıması ve fark etmediği bağları görmesi.

Kurallar:
- Yüzeysel kelime benzerliğine DEĞİL, ALTTA YATAN ANLAMA bak. Farklı kelimelerle yazılmış ama aynı hissi/düşünceyi taşıyan notları da birbirine bağla.
- Aynı temayı, hissi ya da kişiyi paylaşan her aday için bir bağ kur. Emin olduğun gerçek örüntüleri kaçırma; ama tamamen alakasız notları da zorlama.
- "insight" alanı Türkçe, tek cümle, bağın NEDENİNİ açıklayan, kullanıcıya yeni bir ufuk açan bir gözlem olsun (klişe değil, spesifik).
- strength 0 ile 1 arası: zayıf çağrışım ~0.3, güçlü/net örüntü ~0.9.
- Yalnızca son yanıtın olarak geçerli bir JSON dizisi yaz; başka hiçbir metin, açıklama ya da kod bloğu işareti ekleme. Bağ yoksa: []`;

function noteBody(n: Note): string {
  const t = (n.title ?? "").trim();
  const body = n.blocks
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join("\n");
  return (t ? t + "\n" : "") + body;
}

function buildUserPrompt(target: Note, candidates: Note[]): string {
  const cand = candidates
    .map((c, i) => `[${i + 1}] ${noteBody(c)}`)
    .join("\n\n");
  return `HEDEF NOT (${target.date}):
${noteBody(target)}

ADAY NOTLAR:
${cand}

Hedef notla anlamlı biçimde bağlı olan adayları seç. Yanıtın YALNIZCA şu formatta bir JSON dizisi olsun:
[{"ref": <aday numarası>, "strength": <0..1 sayı>, "insight": "<tek cümle, neden bağlı>"}]
Bağ yoksa: []`;
}

type RawLink = { ref: number; strength: number; insight: string };

/** Modelin metninden JSON dizisini savunmacı biçimde çıkar. */
function parseLinks(text: string, maxRef: number): RawLink[] {
  if (!text) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(text);
  } catch {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start === -1 || end <= start) return [];
    try {
      arr = JSON.parse(text.slice(start, end + 1));
    } catch {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];
  const out: RawLink[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const ref = Number((item as RawLink).ref);
    const strength = Number((item as RawLink).strength);
    const insight = String((item as RawLink).insight ?? "").trim();
    if (!Number.isInteger(ref) || ref < 1 || ref > maxRef) continue;
    if (!insight) continue;
    out.push({
      ref,
      strength: Math.max(0, Math.min(1, isNaN(strength) ? 0.5 : strength)),
      insight,
    });
  }
  return out;
}

export type AnalyzeProgress = {
  done: number;
  total: number;
  current?: string;
};

export type AnalyzeResult = {
  analyzed: number;
  connections: number;
  skipped: number;
  errors: string[];
};

/**
 * Bekleyen (hiç çözülmemiş ya da değişmiş) notları çöz: her biri için en
 * benzer birkaç aday notu bulup Claude'a gönderir, dönen içgörülü bağları
 * kaydeder. `force` ile tüm notlar yeniden çözülür.
 */
export async function analyzeNotes(opts: {
  force?: boolean;
  onProgress?: (p: AnalyzeProgress) => void;
  signal?: AbortSignal;
}): Promise<AnalyzeResult> {
  const notes = await listAllNotes();
  if (notes.length < 2) return { analyzed: 0, connections: 0, skipped: 0, errors: [] };

  const targets = opts.force
    ? notes
    : notes.filter((n) => !n.aiAnalyzedAt || n.aiAnalyzedAt < n.updatedAt);
  if (!targets.length) return { analyzed: 0, connections: 0, skipped: 0, errors: [] };

  // Hedeflerin eski bağlarını en baştan temizle (batch içi kayıp olmasın)
  for (const t of targets) await clearConnectionsForNote(t.id);

  const index = buildLexicalIndex(notes);
  const seenPairs = new Set<string>();
  let analyzed = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < targets.length; i++) {
    if (opts.signal?.aborted) break;
    const target = targets[i];
    opts.onProgress?.({ done: i, total: targets.length, current: noteTitle(target) });

    // Küçük günce: tüm diğer notlar aday; büyükse en benzer MAX_CANDIDATES
    const others = notes.filter((n) => n.id !== target.id);
    const candidates =
      others.length <= MAX_CANDIDATES
        ? others
        : index.topK(target.id, MAX_CANDIDATES);
    if (!candidates.length) {
      await markNoteAnalyzed(target.id);
      analyzed++;
      skipped++;
      continue;
    }

    try {
      const text = await callClaude(SYSTEM, buildUserPrompt(target, candidates), {
        maxTokens: 2000,
        signal: opts.signal,
      });
      const links = parseLinks(text, candidates.length);
      for (const l of links) {
        const other = candidates[l.ref - 1];
        if (!other) continue;
        await upsertNoteConnection(target.id, other.id, l.strength, l.insight);
        const [a, b] = target.id < other.id
          ? [target.id, other.id]
          : [other.id, target.id];
        seenPairs.add(`${a}|${b}`);
      }
      await markNoteAnalyzed(target.id);
      analyzed++;
    } catch (e) {
      if (e instanceof AiError) {
        errors.push(e.message);
        // Anahtar/ağ hatasında devam etmenin anlamı yok — dur
        if (/anahtar|401|Ağ hatası/i.test(e.message)) break;
      } else {
        errors.push(e instanceof Error ? e.message : "Bilinmeyen hata");
      }
    }
  }

  opts.onProgress?.({ done: targets.length, total: targets.length });
  return { analyzed, connections: seenPairs.size, skipped, errors };
}

/** Kaç notun çözülmeyi beklediği (buton etiketleri için). */
export async function pendingNoteCount(): Promise<number> {
  const notes = await listAllNotes();
  if (notes.length < 2) return 0;
  return notes.filter((n) => !n.aiAnalyzedAt || n.aiAnalyzedAt < n.updatedAt)
    .length;
}
