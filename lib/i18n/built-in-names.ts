import type { MessageKey } from "./messages";

/**
 * Yerleşik özelliklerin ekrandaki adı. Kayıtta İngilizce kanonik adla
 * duruyorlar (bkz. BUILT_IN_CATEGORIES); Türkçe arayüzde kapsüllerde ve
 * formlarda "SLEEP DURATION" yazıyordu. Kullanıcı yeniden adlandırdıysa ya
 * da kendi özelliğiyse ad olduğu gibi kalır.
 */
const NAMES: Record<string, MessageKey> = {
  "Sleep Duration": "sleep.duration",
  "Sleep Quality": "sleep.quality",
  Happiness: "mood.level",
  Emotions: "mood.emotions",
};

export function builtInName(name: string, t: (key: MessageKey) => string): string {
  const key = NAMES[name];
  return key ? t(key) : name;
}
