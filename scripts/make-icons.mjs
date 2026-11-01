// Logbit ikonlarını üretir: web (favicon, PWA, Apple), Android (başlatıcı,
// uyarlanabilir katmanlar, temalı tek renk, açılış ekranı).
// Geometri lib/brand.ts'den — logo değişirse: node scripts/make-icons.mjs
// (--profil <yol.png> verilirse 1080 px sosyal medya profil fotoğrafı da yazılır)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MARK } from "../lib/brand.ts";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Android'in daire maskesi ızgaranın köşelerini kesiyor: içerik 66 dp'lik güvenli daireye sığsın */
const ADAPTIVE_SCALE = 0.72;
/** PWA maskelenebilir ikonun güvenli dairesi (yarıçap %40) */
const MASKABLE_SCALE = 0.92;
const PAPER = "#faf7f0";

const st = (w = MARK.stroke, c = MARK.ink) => ` stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`;
const sqEl = (q, fill, extra = "") => `<rect x="${q.x}" y="${q.y}" width="${q.size}" height="${q.size}" rx="${q.r}" fill="${fill}"${extra}/>`;
const bitEl = (b, fill, extra = "") => `<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="${fill}"${extra}/>`;

/** Logonun kendisi (zeminsiz): gölgeler, dolgular, yeşil kesişimler, çerçeveler — bkz. components/ui/logbit-mark */
function markParts() {
  const b = MARK.bit, sh = ` transform="translate(${MARK.shadow} ${MARK.shadow})"`;
  return [
    MARK.squares.map((q, i) => `<clipPath id="k${i}">${sqEl(q, "#000")}</clipPath>`).join(""),
    ...MARK.squares.map((q) => sqEl(q, MARK.ink, st() + sh)),
    bitEl(b, MARK.ink, st() + sh),
    ...MARK.squares.map((q) => sqEl(q, q.fill)),
    bitEl(b, b.fill),
    ...MARK.squares.map((_, i) => bitEl(b, MARK.meet, ` clip-path="url(#k${i})"`)),
    ...MARK.squares.map((q) => sqEl(q, "none", st())),
    bitEl(b, "none", st()),
  ].join("");
}

/** Tek renk siluet (temalı ikon): şekiller dolu, aralarındaki sınırlar şeffaf boşluk (maske) */
function monoParts(color) {
  const b = MARK.bit, gap = st(14, "#000");
  return `<mask id="m" maskUnits="userSpaceOnUse" x="0" y="0" width="512" height="512">
    ${MARK.squares.map((q) => sqEl(q, "#fff")).join("")}${bitEl(b, "#fff")}
    ${MARK.squares.map((q) => sqEl(q, "none", gap)).join("")}${bitEl(b, "none", gap)}</mask>
    <rect width="512" height="512" fill="${color}" mask="url(#m)"/>`;
}

/**
 * radius: köşe yuvarlaklığı (kenara oranı; 0 = kare), circle: daire kırp,
 * bg: zemin rengi (false = şeffaf), scale: içeriği merkezden küçült,
 * mono: tek renk siluet (çerçeve ve gölge yok)
 */
function markSvg({ radius = 0, circle = false, bg = true, scale = 1, mono = null } = {}) {
  const clip = circle
    ? `<clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath>`
    : radius
      ? `<clipPath id="c"><rect width="512" height="512" rx="${512 * radius}"/></clipPath>`
      : "";
  const body =
    (bg && !mono ? `<rect width="512" height="512" fill="${MARK.bg}"/>` : "") +
    `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${mono ? monoParts(mono) : markParts()}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%"><defs>${clip}</defs><g${clip ? ' clip-path="url(#c)"' : ""}>${body}</g></svg>`;
}

/** Açılış ekranı: kâğıt zeminde, sert gölgeli yuvarlak ikon */
function splashHtml(w, h) {
  const s = Math.round(Math.min(w, h) * 0.3);
  const off = Math.max(2, Math.round(s * 0.04));
  const r = Math.round(s * 0.22);
  return `<div style="width:${w}px;height:${h}px;background:${PAPER};display:grid;place-items:center">
    <div style="position:relative;width:${s}px;height:${s}px">
      <div style="position:absolute;inset:0;transform:translate(${off}px,${off}px);background:${MARK.ink};border-radius:${r}px"></div>
      <div style="position:absolute;inset:0;border-radius:${r}px;overflow:hidden;outline:${off}px solid ${MARK.ink}">${markSvg()}</div>
    </div></div>`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function png(w, h, html, transparent) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><div style="width:${w}px;height:${h}px">${html}</div>`);
  return page.screenshot({ omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}

function save(rel, buf) {
  const file = join(ROOT, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, buf);
  console.log("  ", rel);
}

/** PNG'leri tek .ico'da toplar (PNG gömülü ICO, Vista ve sonrası) */
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + i * 16;
    head.writeUInt8(size >= 256 ? 0 : size, e);
    head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

console.log("web");
const rounded = (n) => png(n, n, markSvg({ radius: 0.22 }), true);
save("app/icon.png", await rounded(512));
save("app/apple-icon.png", await png(180, 180, markSvg(), false));
save("app/favicon.ico", ico(await Promise.all([16, 32, 48].map(async (size) => ({ size, buf: await rounded(size) })))));
save("public/icons/icon-192.png", await rounded(192));
save("public/icons/icon-512.png", await rounded(512));
save("public/icons/icon-maskable-512.png", await png(512, 512, markSvg({ scale: MASKABLE_SCALE }), false));

console.log("android");
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITIES)) {
  const legacy = Math.round(48 * k);
  const layer = Math.round(108 * k);
  save(`android/app/src/main/res/mipmap-${d}/ic_launcher.png`, await png(legacy, legacy, markSvg({ radius: 0.18 }), true));
  save(`android/app/src/main/res/mipmap-${d}/ic_launcher_round.png`, await png(legacy, legacy, markSvg({ circle: true, scale: MASKABLE_SCALE }), true));
  save(`android/app/src/main/res/mipmap-${d}/ic_launcher_foreground.png`, await png(layer, layer, markSvg({ bg: false, scale: ADAPTIVE_SCALE }), true));
  save(`android/app/src/main/res/mipmap-${d}/ic_launcher_monochrome.png`, await png(layer, layer, markSvg({ mono: "#ffffff", scale: ADAPTIVE_SCALE }), true));
}

console.log("açılış ekranı");
const SPLASH = {
  drawable: [480, 320],
  "drawable-land-mdpi": [480, 320], "drawable-land-hdpi": [800, 480], "drawable-land-xhdpi": [1280, 720],
  "drawable-land-xxhdpi": [1600, 960], "drawable-land-xxxhdpi": [1920, 1280],
  "drawable-port-mdpi": [320, 480], "drawable-port-hdpi": [480, 800], "drawable-port-xhdpi": [720, 1280],
  "drawable-port-xxhdpi": [960, 1600], "drawable-port-xxxhdpi": [1280, 1920],
};
for (const [dir, [w, h]] of Object.entries(SPLASH)) {
  save(`android/app/src/main/res/${dir}/splash.png`, await png(w, h, splashHtml(w, h), false));
}

const profil = process.argv.indexOf("--profil");
if (profil > 0 && process.argv[profil + 1]) {
  writeFileSync(process.argv[profil + 1], await png(1080, 1080, markSvg({ scale: 0.8 }), false));
  console.log("   profil:", process.argv[profil + 1]);
}

await browser.close();
