import { getSetting } from "@/lib/db/queries";
import type { AiModelId } from "@/types";

export const AI_KEY_SETTING = "anthropicApiKey";
export const AI_MODEL_SETTING = "aiModel";
export const DEFAULT_AI_MODEL: AiModelId = "claude-opus-4-8";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export async function getApiKey(): Promise<string | undefined> {
  const k = await getSetting(AI_KEY_SETTING);
  return k?.trim() || undefined;
}

export async function getAiModel(): Promise<AiModelId> {
  return ((await getSetting(AI_MODEL_SETTING)) as AiModelId) || DEFAULT_AI_MODEL;
}

export class AiError extends Error {}

/**
 * Tek bir Claude çağrısı — kullanıcının kendi anahtarıyla, tarayıcıdan
 * doğrudan (BYOK). Modelin son metin bloğunu döndürür.
 */
export async function callClaude(
  system: string,
  userText: string,
  opts: { maxTokens?: number; signal?: AbortSignal } = {}
): Promise<string> {
  const key = await getApiKey();
  if (!key) throw new AiError("API anahtarı ayarlı değil.");
  const model = await getAiModel();

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      signal: opts.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 2000,
        system,
        messages: [{ role: "user", content: userText }],
      }),
    });
  } catch (e) {
    throw new AiError(
      "Ağ hatası — internet bağlantını kontrol et. " +
        (e instanceof Error ? e.message : "")
    );
  }

  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body?.error?.message ?? msg;
    } catch {
      /* yut */
    }
    if (res.status === 401) throw new AiError("API anahtarı geçersiz (401).");
    if (res.status === 429)
      throw new AiError("Hız sınırı — biraz sonra tekrar dene (429).");
    throw new AiError(`Anthropic hatası: ${msg}`);
  }

  const data = await res.json();
  if (data?.stop_reason === "refusal") return "";
  const text = (data?.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("")
    .trim();
  return text;
}

/** Anahtarın çalıştığını doğrula — minik bir çağrı. */
export async function testApiKey(): Promise<{ ok: boolean; error?: string }> {
  try {
    await callClaude("Yalnızca 'ok' yaz.", "ping", { maxTokens: 16 });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bilinmeyen hata" };
  }
}
