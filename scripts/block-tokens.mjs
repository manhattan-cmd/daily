// Blok dilinin sabit renklerini tema değişkenlerine çevirir — Gece, Brütal'in
// gece hali olarak eşit kalsın diye.
//
//   node scripts/block-tokens.mjs           yalnız rapor (hangi dosyada kaç değişiklik)
//   node scripts/block-tokens.mjs --write   uygular
//
// Neden: Brütal ve Gece aynı yerleşimi çiziyor (bileşenlerdeki `brutal`
// dalları), ayrıldıkları yer renk değişkenleri (app/globals.css "Blok dili
// renkleri"). Yeni kod Brütal'in sabitleriyle yazılırsa (#111, bg-white,
// style={{ background: color }}) Brütal'de doğru görünür ama Gece'de
// açık zemin + açık yazı kalır. Bu betik sabitleri anlamına göre çevirir;
// Brütal'de değişkenlerin değeri sabitlerin aynısı olduğu için Brütal'de
// görüntü PİKSEL PİKSEL aynı kalır (doğrulandı, 2026-11-24).
//
// Eşleme:
//   text-[#111]            → text-ink          (yazı, simge)
//   border-[#111]          → border-line       (çerçeve; /opaklıklı → border-ink/N)
//   bg-[#111]              → bg-well           (ters etiket, seçili durum, simge kuyusu)
//                            bg-line           (gap-[2px] ızgaranın ortak çizgisi, 2px ayraç)
//   bg-[#111]/N            → bg-ink/N          (basılı hal örtüsü)
//   shadow-[…#111]         → shadow-[…var(--shade)]
//   bg-white               → bg-paper ;  bg-[#f5f1e8] → bg-paper-2 ;  bg-[#fff4dc] → bg-floor
//   JS "#111"              → var(--line) (border*/outline*), var(--shade) (shadow), yoksa var(--ink)
//   color-mix(…, N%, white) → kâğıda, gece ölçeğiyle
//   İçinde yazı/simge olan renkli yüzey (style background / bg-[#renk])
//                          → blockFill(renk) / bg-fill-[#renk]   (lib/fill.ts)
//   O yüzeyin içindeki simge (color var(--ink) ya da text-ink sınıfı)
//                          → blockInk(renk)  (Gece'de rengin yanan tonu)
//   style={{ background: blockFill(renk) }}
//                          → style={fillStyle(renk)}  (rengi --fc'de: Gece
//                            yüzeyi o renkle ışıtır, bkz. app/gece.css)
//   globals.css blok kurallarında 2px solid var(--line), inset 0 0 0 2px …,
//   translate(2px, 2px)    → var(--b2) …, translate(var(--p2), var(--p2))
//                            (Gece kıl çizgi, basınca kaymaz)
//   useSkin() === "brutal" → isBlockSkin(useSkin())
//   globals.css :root[data-skin="brutal"] kuralları → :root[data-ui="block"]
//
// Sonra: globals.css değiştiyse dev sunucusu (Turbopack) dosya yazımını
// görmeyebilir — Edit ile küçük bir gerçek değişiklik yap. Bkz. bellek
// "globals.css yansımıyor".
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRITE = process.argv.includes("--write");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

// ── Gece tonu (lib/fill.ts nightTone ile aynı hesap) ──────────────────────
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
function nightTone(hex) {
  let h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex)?.[1];
  if (!h) return null;
  if (h.length === 3) h = h.replace(/./g, (x) => x + x);
  const [r, g, b] = [0, 2, 4].map((i) => toLinear(parseInt(h.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = (1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s) * 0.5;
  const B = (0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s) * 0.5;
  const L = 0.33;
  const l2 = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m2 = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return (
    "#" +
    [
      4.0767416621 * l2 - 3.3077115913 * m2 + 0.2309699292 * s2,
      -1.2684380046 * l2 + 2.6097574011 * m2 - 0.3413193965 * s2,
      -0.0041960863 * l2 - 0.7034186147 * m2 + 1.707614701 * s2,
    ]
      .map((c) => Math.round(Math.min(1, Math.max(0, toGamma(c))) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ── 1. Metin düzeyinde dönüşümler (sınıflar, JS sabitleri, tema denetimi) ──
const isLineCtx = (line) =>
  /\bgap-(\[2px\]|\[1\.5px\]|px)(?![\w-])|(^|[\s"'`])[hw]-(\[2px\]|\[1\.5px\]|\[3px\]|px)(?=[\s"'`])/.test(line);
const isDot = (line) => /rounded-full/.test(line) && /\bh-(1|1\.5|2)\b/.test(line);
function keyBefore(line, idx) {
  const re = /([A-Za-z_][\w]*)\s*(?::|=(?!=|>))/g;
  let m, last = null;
  const before = line.slice(0, idx);
  while ((m = re.exec(before))) last = m[1];
  return last;
}
const pct = (a) => `${Math.round(Number(a) * 100)}%`;

function textPass(src) {
  let s = src;
  s = s
    .replace(/\btext-\[#111\]/g, "text-ink")
    .replace(/\bbg-\[#111\]\//g, "bg-ink/")
    .replace(/\b(border(?:-[xytblr])?)-\[#111\]\//g, "$1-ink/")
    .replace(/\b(border(?:-[xytblr])?)-\[#111\]/g, "$1-line")
    .replace(/\boutline-\[#111\]\//g, "outline-ink/")
    .replace(/\boutline-\[#111\]/g, "outline-line")
    .replace(/\bring-\[#111\]/g, "ring-line")
    .replace(/\bdivide-\[#111\]/g, "divide-line")
    .replace(/\bdecoration-\[#111\]/g, "decoration-ink");
  for (let i = 0; i < 3; i++) s = s.replace(/\b((?:drop-)?shadow-\[[^\]\s"'`]*?)#111(?:111)?\b/g, "$1var(--shade)");
  s = s.replace(/\b((?:drop-)?shadow-\[[^\]\s"'`]*?)rgba\(17,17,17,([0-9.]+)\)/g, (m, p, a) => `${p}color-mix(in_srgb,var(--shade)_${pct(a)},transparent)`);
  s = s
    .replace(/\bbg-white(?![\w/-])/g, "bg-paper")
    .replace(/\bbg-\[#f5f1e8\]/gi, "bg-paper-2")
    .replace(/\bbg-\[#fff4dc\]/gi, "bg-floor")
    .replace(/radial-gradient\(rgba\(17, ?17, ?17, ?0\.16\)/g, "radial-gradient(var(--dot)");
  s = s
    .split("\n")
    .map((line) => {
      if (!/bg-\[#111\](?!\/)/.test(line)) return line;
      const to = isLineCtx(line) ? "bg-line" : isDot(line) ? "bg-ink" : "bg-well";
      return line.replace(/bg-\[#111\](?!\/)/g, to);
    })
    .join("\n");
  // JS sabitleri
  s = s
    .split("\n")
    .map((line) => {
      if (/0\.2126/.test(line)) return line; // parlaklıkla yazı rengi seçen yardımcılar
      let out = "";
      let pos = 0;
      const re = /#111(?:111)?\b(?!\])|rgba\(17, ?17, ?17, ?([0-9.]+)\)/g;
      let m;
      while ((m = re.exec(line))) {
        if (/\[[^\]\s"'`]*$/.test(line.slice(0, m.index))) continue; // sınıfın içinde
        const key = keyBefore(line, m.index) || "";
        const rgba = m[0].startsWith("rgba");
        let to;
        if (/shadow/i.test(key)) to = rgba ? `color-mix(in srgb, var(--shade) ${pct(m[1])}, transparent)` : "var(--shade)";
        else if (/border|outline|divide/i.test(key) && !rgba) to = "var(--line)";
        else to = rgba ? `color-mix(in srgb, var(--ink) ${pct(m[1])}, transparent)` : "var(--ink)";
        out += line.slice(pos, m.index) + to;
        pos = m.index + m[0].length;
      }
      return out + line.slice(pos);
    })
    .join("\n");
  s = s.replace(
    /color-mix\(in srgb, ([^,()]+?(?:\([^()]*\))?[^,()]*?) (\d+(?:\.\d+)?%|\$\{[^}]+\}%), (white|#fff(?:fff)?)\)/g,
    (m, c, p) => `color-mix(in srgb, ${c} calc(${p} * var(--fill-scale)), var(--paper))`
  );
  s = s
    .split("\n")
    .map((line) =>
      line.replace(/(["'])#(?:fff|ffffff)\1/gi, (m, q, idx) =>
        /^(background|backgroundColor|bg|fill|base|paper)$/i.test(keyBefore(line, idx) || "") ? `${q}var(--paper)${q}` : m
      )
    )
    .join("\n");
  s = s.replace(/useSkin\(\) === "brutal"/g, "isBlockSkin(useSkin())").replace(/\bskin === "brutal"/g, "isBlockSkin(skin)");
  return s;
}

// ── 2. Renkli yüzeyler ve üstlerindeki simgeler (sözdizimi ağacıyla) ───────
const KEEP_HEX = /^#(3a5bff|6366f1|ff5d5d|ff8a8a|050507|17171c|1c1c1f|111|111111|f5f1e8|fff4dc|4f6bff)$/i;
const SKIP_TEXT = /gradient|var\(--|color-mix|rgba|transparent|[Tt]int\(|blockFill|hsl/;
const SKIP_IDENT = /^(track|gray|grey|hatch|MARK\b|fillColor)/;

function astPass(src, file, stage) {
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits = [];
  const styleOf = (node) => {
    const a = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "style");
    return a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : null;
  };
  const wrapExpr = (e) => {
    if (ts.isParenthesizedExpression(e)) return wrapExpr(e.expression);
    if (ts.isConditionalExpression(e)) return wrapExpr(e.whenTrue), wrapExpr(e.whenFalse);
    const text = e.getText();
    if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) {
      if (/^(#fff|#ffffff|white)$/i.test(e.text)) edits.push({ start: e.getStart(), end: e.getEnd(), text: '"var(--paper)"' });
      else if (/^#[0-9a-f]{3,8}$/i.test(e.text) && !KEEP_HEX.test(e.text)) edits.push({ start: e.getStart(), end: e.getEnd(), text: `blockFill(${text})` });
      return;
    }
    if (ts.isIdentifier(e) && (e.text === "undefined" || SKIP_IDENT.test(e.text))) return;
    if (SKIP_TEXT.test(text) || /\bMARK\b|\bQUAD_COLOR\b/.test(text)) return;
    if (ts.isCallExpression(e) && /^(tint|blockTint|fillTint|colorOf|emotionLook)/.test(e.expression.getText())) return;
    edits.push({ start: e.getStart(), end: e.getEnd(), text: `blockFill(${text})` });
  };
  const fillColorOf = (expr) => {
    let found = null;
    const f = (n) => {
      if (found) return;
      if (ts.isCallExpression(n) && /^(blockFill|bandDots)$/.test(n.expression.getText()) && n.arguments.length === 1) found = n.arguments[0].getText();
      else ts.forEachChild(n, f);
    };
    f(expr);
    return found;
  };

  // a) yüzeyler
  const visitFill = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const el = ts.isJsxOpeningElement(node) ? node.parent : node;
      const hasContent = (ts.isJsxElement(el) ? el.children : []).some(
        (c) => (ts.isJsxText(c) && c.getText().trim()) || ts.isJsxExpression(c) || ts.isJsxElement(c) || ts.isJsxSelfClosingElement(c)
      );
      // renk seçicinin örnekleri gerçek rengi göstermeli
      const swatch =
        node.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText() === "data-swatch") ||
        (/backgroundColor: c \}/.test(node.getText()) && /rounded-full/.test(node.getText()));
      if (hasContent && !swatch) {
        for (const a of node.attributes.properties) {
          if (!ts.isJsxAttribute(a) || !a.initializer) continue;
          const name = a.name.getText();
          if (name === "style" && ts.isJsxExpression(a.initializer) && a.initializer.expression) {
            const objs = [];
            const collect = (n) => {
              if (ts.isObjectLiteralExpression(n)) objs.push(n);
              else if (ts.isConditionalExpression(n)) collect(n.whenTrue), collect(n.whenFalse);
              else if (ts.isParenthesizedExpression(n)) collect(n.expression);
            };
            collect(a.initializer.expression);
            for (const o of objs)
              for (const p of o.properties)
                if (ts.isPropertyAssignment(p) && /^(background|backgroundColor)$/.test(p.name.getText())) wrapExpr(p.initializer);
          }
          if (name === "className") {
            const scan = (n) => {
              if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
                const raw = n.getText();
                const out = raw.replace(/\bbg-\[(#[0-9a-fA-F]{3,8})\]/g, (mm, hex) => (KEEP_HEX.test(hex) ? mm : `bg-fill-[${hex}]`));
                if (out !== raw) edits.push({ start: n.getStart(), end: n.getEnd(), text: out });
              }
              ts.forEachChild(n, scan);
            };
            scan(a.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visitFill);
  };
  if (stage === "fill") visitFill(sf);

  // b) yüzeyin içindeki simgeler
  const visitInk = (node, color) => {
    if (ts.isJsxElement(node)) {
      const st = styleOf(node.openingElement);
      const c = st && fillColorOf(st);
      visitInk(node.openingElement, color);
      for (const ch of node.children) visitInk(ch, c || color);
      return;
    }
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && color) {
      const st = styleOf(node);
      if (st && !fillColorOf(st) && ts.isObjectLiteralExpression(st)) {
        for (const p of st.properties)
          if (ts.isPropertyAssignment(p) && p.name.getText() === "color" && p.initializer.getText() === '"var(--ink)"')
            edits.push({ start: p.initializer.getStart(), end: p.initializer.getEnd(), text: `blockInk(${color})` });
      }
      if (!st && ts.isJsxSelfClosingElement(node) && /^[A-Z]/.test(node.tagName.getText())) {
        const cls = node.attributes.properties.find((p) => ts.isJsxAttribute(p) && p.name.getText() === "className");
        if (cls && /(^|[\s"'`])text-ink(?=[\s"'`])/.test(cls.getText()))
          edits.push({ start: node.tagName.getEnd(), end: node.tagName.getEnd(), text: ` style={{ color: blockInk(${color}) }}` });
      }
    }
    ts.forEachChild(node, (n) => visitInk(n, color));
  };
  if (stage === "ink") visitInk(sf, null);

  if (!edits.length) return src;
  edits.sort((a, b) => b.start - a.start);
  let out = src;
  let lastStart = Infinity;
  for (const e of edits) {
    if (e.end > lastStart) continue; // iç içe düzenleme: dıştakini tut
    out = out.slice(0, e.start) + e.text + out.slice(e.end);
    lastStart = e.start;
  }
  return out;
}

// ── 2b. Renkli yüzeyin rengi Gece'ye (fillStyle) ─────────────────────────
function fillStylePass(src) {
  return src.replace(/\{ background: blockFill\(([^`(){}]*(?:\([^()]*\))?[^`(){}]*)\) \}/g, (m, arg) =>
    arg.includes("#c8d4ff") ? m : `fillStyle(${arg})`
  );
}

// ── İçe aktarmalar ──────────────────────────────────────────────────────────
function ensureImport(s, name, from) {
  if (!new RegExp(`\\b${name}\\(`).test(s)) return s;
  const re = new RegExp(`import \\{([^}]*)\\} from "${from.replace(/[/@]/g, "\\$&")}";`);
  const m = re.exec(s);
  if (m) {
    if (new RegExp(`\\b${name}\\b`).test(m[1])) return s;
    return s.replace(re, (all, names) => `import {${names.replace(/\s*$/, "")}, ${name} } from "${from}";`);
  }
  const lines = s.split("\n");
  let last = -1;
  for (let i = 0; i < lines.length; i++)
    if (/^import /.test(lines[i])) {
      while (i < lines.length && !/;\s*\r?$/.test(lines[i])) i++;
      last = i;
    }
  const eol = lines[0]?.endsWith("\r") ? "\r" : "";
  lines.splice(last + 1, 0, `import { ${name} } from "${from}";${eol}`);
  return lines.join("\n");
}

// ── 3. globals.css ────────────────────────────────────────────────────────
const INK = /#111(?:111)?\b/g;
const RGBA = /rgba\(17, ?17, ?17, ?([0-9.]+)\)/g;
function splitTop(v) {
  const out = [];
  let d = 0, cur = "";
  for (const ch of v) {
    if (ch === "(") d++;
    if (ch === ")") d--;
    if (ch === "," && d === 0) { out.push(cur); cur = ""; } else cur += ch;
  }
  return [...out, cur];
}
function cssValue(prop, v, sel, block) {
  const p = prop.trim().toLowerCase();
  if (p === "color" || p === "fill")
    return v.replace(INK, "var(--ink)").replace(RGBA, (m, a) => `color-mix(in srgb, var(--ink) ${pct(a)}, transparent)`).replace(/#b45309\b/gi, "var(--warn-ink)");
  if (/^(border|outline|stroke)/.test(p))
    return v.replace(INK, "var(--line)").replace(RGBA, (m, a) => `color-mix(in srgb, var(--ink) ${pct(a)}, transparent)`);
  if (p === "box-shadow")
    return splitTop(v)
      .map((part) => {
        const inset = /\binset\b/.test(part);
        return part.replace(INK, inset ? "var(--line)" : "var(--shade)").replace(/#fff(?:fff)?\b/gi, "var(--paper)").replace(RGBA, (m, a) => `color-mix(in srgb, var(--shade) ${pct(a)}, transparent)`);
      })
      .join(",");
  if (/^background(-color|-image)?$/.test(p)) {
    v = v.replace(/radial-gradient\(rgba\(17, ?17, ?17, ?0\.1[0-9]\)/g, "radial-gradient(var(--dot)");
    if (/radial-gradient\(circle/.test(v)) return v.replace(INK, "var(--line)").replace(/#fff(?:fff)?\b/gi, "var(--paper)");
    if (/^\s*#111(?:111)?\b/.test(v)) return v.replace(INK, /h-px/.test(sel) || /width:\s*2px|height:\s*2px/.test(block) ? "var(--line)" : "var(--well)");
    if (/^\s*#fff(?:fff)?\b/i.test(v)) return v.replace(/#fff(?:fff)?\b/i, "var(--paper)");
    v = v.replace(RGBA, (m, a) => `color-mix(in srgb, var(--ink) ${pct(a)}, transparent)`).replace(/#f5f1e8/gi, "var(--paper-2)");
    const m = v.match(/^\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3}|var\(--[a-z]+-c(?:,\s*#[0-9a-fA-F]+)?\))(\s*!important)?\s*$/);
    if (m && !/^#(fff4dc|3a5bff)$/i.test(m[1])) {
      const night = m[1].startsWith("#") ? nightTone(m[1]) : null;
      return night
        ? ` color-mix(in srgb, ${m[1]} var(--fill-k), ${night})${m[2] || ""}`
        : ` color-mix(in srgb, ${m[1]} var(--fill-k), var(--no-night, oklch(from ${m[1]} 0.33 calc(c * 0.5) h)))${m[2] || ""}`;
    }
  }
  return v;
}
const BW = { "1": "--b1", "1.5": "--b15", "2": "--b2", "2.5": "--b25", "3": "--b3" };
const PW = { "1.5": "--p15", "2": "--p2", "3": "--p3" };
function widthTokens(block) {
  return block
    .replace(/(\d+(?:\.\d+)?)px (solid|dashed) var\(--line\)/g, (m, w, st) => (BW[w] ? `var(${BW[w]}) ${st} var(--line)` : m))
    .replace(/inset 0 0 0 (\d+(?:\.\d+)?)px var\(--line\)/g, (m, w) => (BW[w] ? `inset 0 0 0 var(${BW[w]}) var(--line)` : m))
    .replace(/inset -(\d+(?:\.\d+)?)px 0 0 var\(--line\)/g, (m, w) => (BW[w] ? `inset calc(-1 * var(${BW[w]})) 0 0 var(--line)` : m))
    .replace(/translate\((\d+(?:\.\d+)?)px, ?(\d+(?:\.\d+)?)px\)/g, (m, a, b) => (PW[a] && PW[b] ? `translate(var(${PW[a]}), var(${PW[b]}))` : m))
    .replace(/(border(?:-[a-z]+)?-width:\s*)([^;!}]+)/g, (m, k, v) => k + v.replace(/\b(\d+(?:\.\d+)?)px\b/g, (mm, w) => (BW[w] ? `var(${BW[w]})` : mm)));
}
function cssPass(css) {
  const start = css.indexOf("/* ── Brütal (deneme)");
  if (start < 0) return css;
  const body = css.slice(start);
  let out = "", i = 0;
  while (i < body.length) {
    const open = body.indexOf("{", i);
    if (open < 0) { out += body.slice(i); break; }
    const sel = body.slice(i, open);
    if (/@(keyframes|media|supports|utility)/.test(sel)) {
      let d = 0, j = open;
      for (; j < body.length; j++) {
        if (body[j] === "{") d++;
        else if (body[j] === "}" && --d === 0) break;
      }
      out += body.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    const close = body.indexOf("}", open);
    const block = body.slice(open + 1, close);
    const isToken = /:root\[data-skin="brutal"\]\s*$/.test(sel.trim()) && /--background:/.test(block);
    const newSel = isToken ? sel : sel.replace(/:root\[data-skin="brutal"\]/g, ':root[data-ui="block"]');
    const newBlock = newSel.includes('[data-ui="block"]')
      ? block.replace(/(^|;|\{|\n)(\s*)([-a-zA-Z]+)\s*:([^;{}]*?)(?=;|$)/g, (m, lead, ws, prop, val) => `${lead}${ws}${prop}:${cssValue(prop, val, newSel, block)}`)
      : block;
    out += newSel + "{" + (newSel.includes('[data-ui="block"]') ? widthTokens(newBlock) : newBlock) + "}";
    i = close + 1;
  }
  return css.slice(0, start) + out;
}

// ── Çalıştır ────────────────────────────────────────────────────────────────
const files = [...walk(join(ROOT, "app")), ...walk(join(ROOT, "components"))];
let changed = 0;
for (const f of files) {
  const src = readFileSync(f, "utf8");
  let out = textPass(src);
  if (f.endsWith(".tsx")) out = fillStylePass(astPass(astPass(out, f, "fill"), f, "ink"));
  out = ensureImport(out, "isBlockSkin", "@/lib/skin");
  out = ensureImport(out, "blockFill", "@/lib/fill");
  out = ensureImport(out, "blockInk", "@/lib/fill");
  out = ensureImport(out, "fillStyle", "@/lib/fill");
  if (out !== src) {
    changed++;
    console.log((WRITE ? "yazıldı  " : "değişecek ") + relative(ROOT, f));
    if (WRITE) writeFileSync(f, out);
  }
}
const cssFile = join(ROOT, "app", "globals.css");
const css = readFileSync(cssFile, "utf8");
const cssOut = cssPass(css);
if (cssOut !== css) {
  changed++;
  console.log((WRITE ? "yazıldı  " : "değişecek ") + "app/globals.css  (dev sunucusu için Edit ile küçük bir dokunuş gerekebilir)");
  if (WRITE) writeFileSync(cssFile, cssOut);
}
console.log(changed ? `${changed} dosya${WRITE ? "" : " — uygulamak için --write"}` : "Her şey değişkenlerde, yapılacak bir şey yok.");
