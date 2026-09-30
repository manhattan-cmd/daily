// Android APK: statik derleme → Capacitor'a aktar → Gradle ile APK.
//
//   npm run apk             APK üretir (android/app/build/outputs/apk/debug/)
//   npm run apk -- --install  üretir ve USB ile bağlı telefona kurar
//
// Java ve Android SDK yollarını ortam değişkeninden, yoksa Android Studio'nun
// varsayılan kurulum yerlerinden bulur — elle ayar gerekmesin.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const win = process.platform === "win32";
const install = process.argv.includes("--install");

function firstExisting(paths) {
  return paths.filter(Boolean).find((p) => existsSync(p));
}

/**
 * Java 21 — Capacitor 8'in istediği sürüm. Android Studio içinde Java 25
 * geliyor, projenin Gradle'ı (8.14) onu tanımıyor ("class file major version
 * 69"). Önce ~/.jdks altındaki JDK 21 aranır (Android Studio'nun indirdiği
 * JDK'ların yeri), sonra ortam değişkeni, en son Android Studio'nunki.
 */
function jdk21() {
  const dir = process.env.USERPROFILE && join(process.env.USERPROFILE, ".jdks");
  if (!dir || !existsSync(dir)) return undefined;
  const hit = readdirSync(dir).find((n) => /(^|-)21[.-]|jdk-21/.test(n));
  return hit ? join(dir, hit) : undefined;
}

const javaHome =
  jdk21() ||
  process.env.JAVA_HOME ||
  firstExisting([
    "C:/Program Files/Android/Android Studio/jbr",
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Programs/Android Studio/jbr"),
    "/Applications/Android Studio.app/Contents/jbr/Contents/Home",
  ]);
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  firstExisting([
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Android/Sdk"),
    process.env.HOME && join(process.env.HOME, "Library/Android/sdk"),
    process.env.HOME && join(process.env.HOME, "Android/Sdk"),
  ]);

if (!javaHome || !sdk) {
  console.error(
    "\n✗ Android Studio bulunamadı.\n" +
      `  Java: ${javaHome ?? "yok"}\n  Android SDK: ${sdk ?? "yok"}\n` +
      "  Android Studio'yu kurup ilk açılıştaki kurulum sihirbazını (Standard) tamamla.\n"
  );
  process.exit(1);
}

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdk,
  ANDROID_SDK_ROOT: sdk,
  PATH: [join(javaHome, "bin"), join(sdk, "platform-tools"), process.env.PATH].join(win ? ";" : ":"),
};

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: true, env, ...opts });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run("node", ["scripts/build-mobile.mjs"]);
run("npx", ["cap", "sync", "android"]);
// Tam yol: Windows komut istemi çalışma klasöründeki .bat'ı adıyla bulmuyor
const gradlew = resolve("android", win ? "gradlew.bat" : "gradlew");
run(`"${gradlew}"`, ["assembleDebug"], { cwd: "android" });

const apk = "android/app/build/outputs/apk/debug/app-debug.apk";
console.log(`\n✓ APK hazır: ${apk}`);

if (install) {
  console.log("\nTelefona kuruluyor (USB hata ayıklama açık olmalı)…");
  run("adb", ["install", "-r", apk]);
  console.log("✓ Kuruldu — telefonda Routine'i açabilirsin.");
}
