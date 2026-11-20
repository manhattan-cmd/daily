// Sembollerin 24×24 kutudaki kaçıklığını ölçer ve lib/icons/sets/set-1-centers.ts
// dosyasını yazar. LifeIcon bu tabloyla çizimi kutunun ortasına oturtur.
//
// Neden ölçüm: çizimler ızgaraya elle yerleştirilmiş, 160 sembolün 69'u
// kutunun ortasından en az yarım birim kaçıktı (paten 2,8 birim aşağıda,
// bahçe 2,8 birim solda). Karo içinde bazı semboller ortada, bazıları kenarda
// duruyordu. Merkez, çizimin mürekkep kutusundan (piksel taraması: evenodd
// delikleri ve döndürmeler dahil); kütle merkezi değil, çünkü hilal gibi
// biçimlerde kütle kutudan çok sapıyor ve göz kutuyu ortalıyor.
//
// Bir sembol eklenince ya da değişince: node scripts/icon-centers.mjs
// (Set 1 TSX olduğu için jiti ile okunur; tarama playwright'la)
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { chromium } = require("playwright");
const { createJiti } = require("jiti");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

/** Bu kadarın altındaki kaçıklık görünmüyor (17 px'te 0,2 px) — tabloya girmez */
const MIN_OFFSET = 0.3;

// Set 1 klasik JSX dönüşümüyle derleniyor: React küresel olmalı
globalThis.React = React;
const jiti = createJiti(ROOT + "/", { jsx: true });
const { SET_1 } = await jiti.import(join(ROOT, "lib/icons/sets/set-1.tsx"));

const markup = Object.fromEntries(
  Object.entries(SET_1).map(([name, glyph]) => [
    name,
    renderToStaticMarkup(React.createElement(React.Fragment, null, glyph)),
  ])
);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent("<html><body></body></html>");
const measured = await page.evaluate(async (glyphs) => {
  const S = 240; // 24 birim × 10: 0,1 birim çözünürlük
  const out = {};
  for (const [name, inner] of Object.entries(glyphs)) {
    const img = new Image();
    img.src =
      "data:image/svg+xml;charset=utf-8," +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${S}" height="${S}" fill="#000">${inner}</svg>`
      );
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = S;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, S, S).data;
    let x0 = S, y0 = S, x1 = -1, y1 = -1;
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++)
        if (data[(y * S + x) * 4 + 3] > 40) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    out[name] = [(x0 + x1 + 1) / 20 - 12, (y0 + y1 + 1) / 20 - 12];
  }
  return out;
}, markup);
await browser.close();

/** 0,05 birime yuvarla — taramanın çözünürlüğü bundan kaba */
const round = (v) => Math.round(v * 20) / 20;
const rows = Object.entries(measured)
  .map(([name, [dx, dy]]) => [name, round(dx), round(dy)])
  .filter(([, dx, dy]) => Math.abs(dx) >= MIN_OFFSET || Math.abs(dy) >= MIN_OFFSET)
  .sort(([a], [b]) => a.localeCompare(b));

const body = rows.map(([name, dx, dy]) => `  ${JSON.stringify(name)}: [${dx}, ${dy}],`).join("\n");
const file = `// scripts/icon-centers.mjs yazar, elle düzenlenmez — sembol değişince betiği çalıştır.
import type { IconName } from "../vocabulary";

/**
 * Set 1 çizimlerinin mürekkep kutusunun 24×24 kutunun ortasından kaçıklığı
 * (birim, [x, y]; artı = sağa / aşağı). LifeIcon viewBox'ı bu kadar kaydırır,
 * çizim kutunun ortasına oturur. ${MIN_OFFSET} birimin altı yazılmaz.
 */
export const SET_1_CENTERS: Partial<Record<IconName, readonly [number, number]>> = {
${body}
};
`;
writeFileSync(join(ROOT, "lib/icons/sets/set-1-centers.ts"), file);
console.log(`${rows.length}/${Object.keys(measured).length} sembol kaçık — lib/icons/sets/set-1-centers.ts yazıldı`);
