"use client";

import { useEffect } from "react";
import {
  ensureBuiltInDimensions,
  ensureBuiltInEntryTypes,
  ensureBuiltInCategories,
  ensureBuiltInMods,
  ensureDefaultModifiers,
} from "@/lib/db/queries";
import { BottomNav } from "./bottom-nav";
import { StatusBar } from "./status-bar";

export function AppShell({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    (async () => {
      await ensureBuiltInDimensions();
      await ensureBuiltInEntryTypes();
      await ensureBuiltInMods();
      await ensureBuiltInCategories();
      await ensureDefaultModifiers();
    })().catch((err) => console.error("Init error", err));
  }, []);

  // Service worker yalnızca production'da — dev'de Turbopack'in HMR'ıyla çakışır
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    };
    // 'load' zaten geçmiş olabilir (effect, mount sonrası tetiklenir) — o zaman hemen kaydet
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return (
    /* Desktop: dış alan */
    <div className="min-h-screen bg-[#050507] md:flex md:items-center md:justify-center md:p-8">
      {/* Telefon çerçevesi */}
      <div
        className="
          relative flex flex-col overflow-hidden bg-background
          /* Mobil: tam ekran */
          h-dvh w-full
          /* Masaüstü: telefon boyutu + çerçeve */
          md:h-[844px] md:w-[390px] md:rounded-[3rem] md:border md:border-white/10
          md:shadow-[0_0_0_10px_#111115,0_40px_80px_rgba(0,0,0,0.9)]
        "
      >
        {/* Masaüstünde status bar */}
        <StatusBar />

        {/* İçerik — kaydırılabilir */}
        <main className="flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          {children}
        </main>

        {/* Bottom nav — flex'in altına yapışık */}
        <BottomNav />
      </div>
    </div>
  );
}
