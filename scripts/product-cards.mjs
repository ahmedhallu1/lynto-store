// Generates branded product cards ("photos") for every published product → public/catalog/<slug>.jpg (+ -s thumbnail).
// Source of truth is the database (so new products can be added later by re-running this script).
//   node scripts/product-cards.mjs            # reads the PRODUCTION D1 (read-only)
//   node scripts/product-cards.mjs --local    # reads the local dev D1
// Cards use the owner's brand artwork + a monogram tile; third-party logos are never used.
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');
const out = join(root, 'public', 'catalog');
mkdirSync(out, { recursive: true });

function query(sql) {
  const args = [join(root, 'node_modules/wrangler/bin/wrangler.js'), 'd1', 'execute', 'lynto-db', local ? '--local' : '--remote', '--json', '--command', sql];
  const raw = execFileSync(process.execPath, args, { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
  return JSON.parse(raw)[0].results;
}

const rows = query(`SELECT p.slug, p.title_ar, p.title_en, p.brand, p.icon_text, p.accent, c.name_ar AS cat_ar, c.name_en AS cat_en
  FROM products p JOIN categories c ON c.id = p.category_id WHERE p.status = 'published' ORDER BY p.sort`);
console.log(`Rendering ${rows.length} product cards…`);

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const lockup = readFileSync(join(root, 'public/brand/lynto-lockup.png')).toString('base64');

// naive word-wrap by character budget (Arabic and Latin both OK for short product names)
function wrap(text, max) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).trim().length > max && cur) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3);
}
function shade(hex, f) {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, '0')).join('')}`;
}

function svg(p) {
  const accent = /^#[0-9a-fA-F]{6}$/.test(p.accent) ? p.accent : '#168CDD';
  const mono = esc((p.icon_text || p.brand || p.title_en).slice(0, 4).toUpperCase());
  const monoSize = mono.length <= 1 ? 250 : mono.length === 2 ? 210 : mono.length === 3 ? 160 : 125;
  const ar = wrap(p.title_ar, 18);
  const en = wrap(p.title_en, 28);
  const arY = 700;
  const arLines = ar.map((l, i) => `<text x="540" y="${arY + i * 92}" font-family="Tajawal" font-weight="800" font-size="78" fill="#F5F8FF" text-anchor="middle">${esc(l)}</text>`).join('');
  const enY = arY + ar.length * 92 + 20;
  const enLines = en.map((l, i) => `<text x="540" y="${enY + i * 54}" font-family="Tajawal" font-weight="500" font-size="42" fill="#A9BBD6" text-anchor="middle" direction="ltr">${esc(l)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1080" height="1080" viewBox="0 0 1080 1080">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0B203A"/><stop offset="1" stop-color="#061326"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.28" r="0.55"><stop offset="0" stop-color="${accent}" stop-opacity="0.38"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
    <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${accent}"/><stop offset="1" stop-color="${shade(accent, 0.45)}"/></linearGradient>
  </defs>
  <rect width="1080" height="1080" fill="url(#bg)"/>
  <rect width="1080" height="1080" fill="url(#glow)"/>
  <rect x="24" y="24" width="1032" height="1032" rx="44" fill="none" stroke="#1C3A60" stroke-width="3"/>
  <rect x="320" y="110" width="440" height="440" rx="96" fill="url(#tile)"/>
  <rect x="320" y="110" width="440" height="440" rx="96" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="3"/>
  <text x="540" y="${330 + monoSize * 0.36}" font-family="Tajawal" font-weight="800" font-size="${monoSize}" fill="#ffffff" text-anchor="middle" direction="ltr">${mono}</text>
  ${arLines}
  ${enLines}
  <rect x="54" y="${1080 - 150}" width="972" height="2" fill="#1C3A60"/>
  <image x="60" y="${1080 - 128}" width="250" height="72" preserveAspectRatio="xMinYMid meet" xlink:href="data:image/png;base64,${lockup}"/>
  <text x="1020" y="${1080 - 78}" font-family="Tajawal" font-weight="700" font-size="34" fill="#20C7CF" text-anchor="end">${esc(p.cat_ar)}</text>
</svg>`;
}

const fontFiles = ['Tajawal-Bold.ttf', 'Tajawal-ExtraBold.ttf', 'Tajawal-Medium.ttf'].map((f) => join(root, 'brand-source/fonts', f));
for (const f of fontFiles) if (!existsSync(f)) throw new Error('Missing font ' + f);

let n = 0;
for (const p of rows) {
  const png = new Resvg(svg(p), { font: { fontFiles, loadSystemFonts: false, defaultFontFamily: 'Tajawal' }, fitTo: { mode: 'width', value: 1080 } }).render().asPng();
  await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toFile(join(out, `${p.slug}.jpg`));
  await sharp(png).resize(360, 360).jpeg({ quality: 80, mozjpeg: true }).toFile(join(out, `${p.slug}-s.jpg`));
  n++;
}
console.log(`Wrote ${n} cards (+ thumbnails) to public/catalog`);
