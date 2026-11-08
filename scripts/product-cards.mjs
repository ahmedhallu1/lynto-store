// Generates branded product cards ("photos") for every published product → public/catalog/<slug>.jpg (+ -s thumbnail).
// Source of truth is the database (so new products can be added later by re-running this script).
//   node scripts/product-cards.mjs            # reads the PRODUCTION D1 (read-only)
//   node scripts/product-cards.mjs --local    # reads the local dev D1
//   node scripts/product-cards.mjs --catalog-json catalog.json --missing-only
//     Uses an exported public catalog and preserves every existing card; no production DB access.
// Cards show the platform's own logo (scripts/lib/logos.mjs) on a clean tile, with the product name and the LYnto lockup.
// Platforms without a known logo fall back to a monogram tile.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { logoInfo } from './lib/logos.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');
const out = join(root, 'public', 'catalog');
mkdirSync(out, { recursive: true });

function query(sql) {
  const args = [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'lynto-db', local ? '--local' : '--remote', '--json', '--command', sql];
  const raw = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(raw)[0].results;
}

const jsonIndex = process.argv.indexOf('--catalog-json');
const imported = jsonIndex >= 0 ? JSON.parse(readFileSync(process.argv[jsonIndex + 1], 'utf8')).products : null;
let rows = imported ? imported.map((p) => ({ ...p, cat_ar: p.category.name_ar, cat_en: p.category.name_en })) : query(`SELECT p.slug, p.title_ar, p.title_en, p.brand, p.icon_text, p.accent, c.name_ar AS cat_ar, c.name_en AS cat_en
  FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' ORDER BY p.sort`);
rows = rows.filter((p) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug));
if (process.argv.includes('--missing-only')) rows = rows.filter((p) => !existsSync(join(out, `${p.slug}.jpg`)) || !existsSync(join(out, `${p.slug}-s.jpg`)));
console.log(`Rendering ${rows.length} product cards…`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lockup = readFileSync(join(root, 'public/brand/lynto-lockup.png')).toString('base64');

// naive word-wrap by character budget (Arabic and Latin both OK for short product names)
function wrap(text, max) {
  // keep a whole run of Latin words (a brand like "Clash of Clans") on one line when the run fits
  const words = [];
  let run = [];
  const flush = () => { if (run.join(' ').length <= max) { if (run.length) words.push(run.join(' ')); } else words.push(...run); run = []; };
  for (const w of String(text).split(/\s+/)) {
    if (/[\u0600-\u06FF]/.test(w)) { flush(); words.push(w); } else run.push(w);
  }
  flush();
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
// resvg lays text out with an LTR base direction, so for Arabic lines that mix in Latin words (e.g. "اشتراك Netflix")
// we reverse the order of the Arabic/Latin runs ourselves; each run is shaped and ordered correctly internally.
function rtlVisual(line) {
  const groups = [];
  for (const w of line.split(/\s+/)) {
    const ar = /[\u0600-\u06FF]/.test(w);
    const last = groups[groups.length - 1];
    if (last && last.ar === ar) last.words.push(w); else groups.push({ ar, words: [w] });
  }
  return groups.reverse().map((g) => g.words.join(' ')).join(' ');
}
function shade(hex, f) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

function svg(p, logo) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : '#168CDD';
  const mono = esc((p.icon_text || p.brand || p.title_en).slice(0, 4).toUpperCase());
  const monoSize = mono.length <= 1 ? 250 : mono.length === 2 ? 210 : mono.length === 3 ? 160 : 125;
  const ar = wrap(p.title_ar, 18);
  const en = wrap(p.title_en, 28);
  const arY = 620;
  let tile;
  if (logo) {
    const box = 330; // logo fits in a box × box area, centred in the 440 tile
    const k = Math.min(box / logo.w, box / logo.h);
    const w = Math.round(logo.w * k), h = Math.round(logo.h * k);
    tile = `<rect x="320" y="110" width="440" height="440" rx="96" fill="${logo.dark ? '#0B1220' : '#FFFFFF'}"/>
  <rect x="320" y="110" width="440" height="440" rx="96" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="4"/>
  <image x="${540 - w / 2}" y="${330 - h / 2}" width="${w}" height="${h}" xlink:href="data:image/png;base64,${logo.png.toString('base64')}"/>`;
  } else {
    tile = `<rect x="320" y="110" width="440" height="440" rx="96" fill="url(#tile)"/>
  <rect x="320" y="110" width="440" height="440" rx="96" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>
  <text x="540" y="${330 + monoSize * 0.36}" font-family="Tajawal" font-weight="800" font-size="${monoSize}" fill="#ffffff" text-anchor="middle" direction="ltr">${mono}</text>`;
  }
  const arLines = ar.map((l, i) => `<text x="540" y="${arY + i * 78}" font-family="Tajawal" font-weight="800" font-size="${ar.length > 2 ? 64 : 74}" fill="#F5F8FF" text-anchor="middle" >${esc(rtlVisual(l))}</text>`).join('');
  const enY = arY + (ar.length - 1) * 78 + 58;
  const enLines = en.map((l, i) => `<text x="540" y="${enY + i * 42}" font-family="Tajawal" font-weight="500" font-size="34" fill="#A9BBD6" text-anchor="middle" direction="ltr">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B203A"/><stop offset="1" stop-color="#061326"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.28" r="0.55"><stop offset="0" stop-color="${accent}" stop-opacity="0.38"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, 0.45)}"/></linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#glow)"/>
  <rect x="24" y="24" width="1032" height="1032" rx="44" fill="none" stroke="#1C3A60" stroke-width="3"/>
  ${tile}
  ${arLines}
  ${enLines}
  <rect x="54" y="${1080 - 150}" width="972" height="2" fill="#1C3A60"/>
  <image x="60" y="${1080 - 128}" width="250" height="72" preserveAspectRatio="xMinYMid meet" xlink:href="data:image/png;base64,${lockup}"/>
  <text x="1020" y="${1080 - 78}" font-family="Tajawal" font-weight="700" font-size="34" fill="#20C7CF" text-anchor="end">${esc(p.cat_ar)}</text>
</svg>`;
}

const fontFiles = ['Tajawal-Bold.ttf', 'Tajawal-ExtraBold.ttf', 'Tajawal-Medium.ttf'].map((f) => join(root, 'brand-source/fonts', f));
for (const f of fontFiles) if (!existsSync(f)) throw new Error('Missing font ' + f);

let n = 0, logos = 0;
for (const p of rows) {
  const info = await logoInfo(p.slug, 640);
  let logo = null;
  if (info) { const m = await sharp(info.png).metadata(); logo = { png: info.png, dark: info.dark, w: m.width, h: m.height }; logos++; }
  const png = new Resvg(svg(p, logo), { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Tajawal' }, fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, `${p.slug}.jpg`));
  // thumbnail: logo only, large and readable at 56–96 px
  const T = 360;
  if (logo) {
    const k = Math.min((T * 0.74) / logo.w, (T * 0.74) / logo.h);
    const lw = Math.max(1, Math.round(logo.w * k)), lh = Math.max(1, Math.round(logo.h * k));
    const inner = await sharp(logo.png).resize(lw, lh, { fit: 'fill' }).png().toBuffer();
    await sharp({ create: { width: T, height: T, channels: 3, background: logo.dark ? '#0B1220' : '#FFFFFF' } })
      .composite([{ input: inner, left: Math.round((T - lw) / 2), top: Math.round((T - lh) / 2) }])
      .jpeg({ quality: 88, mozjpeg: true }).toFile(join(out, `${p.slug}-s.jpg`));
  } else {
    await sharp(png).extract({ left: 320, top: 110, width: 440, height: 440 }).resize(T, T).jpeg({ quality: 80, mozjpeg: true }).toFile(join(out, `${p.slug}-s.jpg`));
  }
  n++;
}
console.log(`Wrote ${n} cards (+ thumbnails) to public/catalog; ${logos} with real platform logos`);
