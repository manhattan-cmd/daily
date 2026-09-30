import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { CSP_META } from "@/lib/security-policy";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Routine",
  description:
    "Track your life with a structure you define yourself. Everything stays on your device.",
  applicationName: "Routine",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Routine",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#09090b",
  // Mobil uygulamada Android içeriği durum çubuğunun altına kadar uzatıyor;
  // "cover" ile telefon kenar boşluklarını bildiriyor ve pt-safe/pb-safe
  // sınıfları başlığı ve alt menüyü saatin, çentiğin ve jest çubuğunun
  // dışında tutuyor. Web'de değişiklik yok.
  ...(process.env.BUILD_TARGET === "mobile" ? { viewportFit: "cover" as const } : {}),
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
      suppressHydrationWarning
    >
      {/* Mobil uygulamada sunucu yok, başlık gönderilemiyor — güvenlik politikası
          sayfaya gömülü (bkz. lib/security-policy). Web'de başlık olarak gidiyor. */}
      {process.env.BUILD_TARGET === "mobile" && (
        <head>
          <meta httpEquiv="Content-Security-Policy" content={CSP_META} />
        </head>
      )}
      <body className="min-h-dvh bg-background text-foreground">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
