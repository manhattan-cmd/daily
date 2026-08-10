import path from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Testlerin tek yapılandırması: "@" takma adı.
 *
 * Vitest tsconfig yollarını dosya importlarında kendiliğinden çözüyordu ama
 * DİZİN importlarını (`@/lib/i18n` → `lib/i18n/index.ts`) çözemiyor. Vite'ın
 * kendi çözümleyicisine bırakınca ikisi de çalışıyor.
 *
 * Uzantı .mts: paket CommonJS olduğu için .ts uyarı veriyor (Vite'ın native
 * config yükleyicisi ESM sözdizimini .ts'te CJS sanıyor).
 */
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, ".") },
  },
});
