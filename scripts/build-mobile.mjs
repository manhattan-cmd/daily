// Mobil uygulama derlemesi: statik çıktı (out/) + Next 16 parça adı düzeltmesi.
//
//   npm run build:mobile
//
// Next.js 16 statik çıktıda sayfa geçişi parçalarını İÇ İÇE klasörlere yazıyor
// (calendar/day/__next.calendar/day/__PAGE__.txt), istemci ise onları NOKTALI
// tek adla istiyor (calendar/day/__next.calendar.day.__PAGE__.txt). Vercel'de
// sunucu bu çeviriyi kendisi yapıyor; uygulamanın içindeki düz dosya
// sunucusunda çeviren yok ve her geçişte istekler 404'e düşüyordu. Her
// parçanın noktalı adla bir kopyası da yanına yazılıyor.
import { spawnSync } from "node:child_process";
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const build = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, BUILD_TARGET: "mobile" },
});
if (build.status !== 0) process.exit(build.status ?? 1);

const OUT = "out";
let copied = 0;

/** dir altındaki bütün dosyalar */
function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* files(p);
    else yield p;
  }
}

/** Her "__next.X" klasörünün içindeki dosyaları klasörün yanına noktalı adla kopyala */
function* segmentDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) yield p;
    else yield* segmentDirs(p);
  }
}

for (const segDir of segmentDirs(OUT)) {
  const parent = join(segDir, "..");
  const base = segDir.slice(parent.length + 1); // "__next.calendar"
  for (const f of files(segDir)) {
    const rest = relative(segDir, f).split(sep).join("."); // "day.__PAGE__.txt"
    copyFileSync(f, join(parent, `${base}.${rest}`));
    copied++;
  }
}

console.log(`\n✓ Mobil derleme hazır (out/) — ${copied} parça dosyası noktalı adla kopyalandı`);
