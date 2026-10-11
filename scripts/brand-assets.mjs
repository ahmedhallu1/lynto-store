// Generates web derivatives from the supplied LYnto artwork without redrawing the mark.
// Source: brand-source/LYnto.png (1408x768, navy background).
// Crops are taken from measured bounds; transparent variants use colour-to-alpha
// against the artwork's own local background so they composite identically on navy.
import sharp from 'sharp';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'brand-source', 'LYnto.png');
if (!existsSync(src)) copyFileSync(join(root, 'LYnto.png'), src);
const out = join(root, 'public', 'brand');
mkdirSync(out, { recursive: true });

// Measured bounds (see docs/BRAND.md)
const SYMBOL = { left: 205, top: 240, width: 358, height: 288 }; // knot incl. padding
const LOCKUP = { left: 205, top: 240, width: 998, height: 288 }; // knot + wordmark; tagline row cleared below
const TAGLINE_CLEAR = { x: 585 - 205, y: 478 - 240 }; // region (relative) holding the tagline
const FULL = { left: 196, top: 232, width: 1010, height: 290 + 50 }; // incl. tagline

async function colorToAlpha(region, file, width, clear) {
  const { data, info } = await sharp(src).extract(region).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  // Estimate local background from the region border.
  let br = 0, bg = 0, bb = 0, n = 0;
  for (let x = 0; x < info.width; x++) for (const y of [0, 1, info.height - 2, info.height - 1]) {
    const i = (y * info.width + x) * ch; br += data[i]; bg += data[i + 1]; bb += data[i + 2]; n++;
  }
  const B = [br / n, bg / n, bb / n];
  const outBuf = Buffer.alloc(info.width * info.height * 4);
  for (let p = 0; p < info.width * info.height; p++) {
    const c = [data[p * ch], data[p * ch + 1], data[p * ch + 2]];
    let a = 0;
    for (let k = 0; k < 3; k++) {
      const d = c[k] - B[k];
      const t = d > 0 ? d / (255 - B[k]) : 0; // only lift pixels brighter than the navy
      if (t > a) a = t;
    }
    if (a < 0.1) a = 0; // drop background noise / vignette grain
    if (clear) { const x = p % info.width, y = Math.floor(p / info.width); if (x >= clear.x && y >= clear.y) a = 0; }
    for (let k = 0; k < 3; k++) {
      outBuf[p * 4 + k] = a === 0 ? 0 : Math.max(0, Math.min(255, Math.round(B[k] + (c[k] - B[k]) / a)));
    }
    outBuf[p * 4 + 3] = Math.round(Math.min(1, a) * 255);
  }
  let img = sharp(outBuf, { raw: { width: info.width, height: info.height, channels: 4 } });
  if (width) img = img.resize({ width });
  await img.clone().png({ compressionLevel: 9 }).toFile(join(out, `${file}.png`));
  await img.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(join(out, `${file}.webp`));
}

async function main() {
  // Transparent lockup for header/footer (2x of ~40px height display)
  await colorToAlpha(LOCKUP, 'lynto-lockup', 640, TAGLINE_CLEAR);
  await colorToAlpha(FULL, 'lynto-lockup-tagline', 960);
  await colorToAlpha(SYMBOL, 'lynto-symbol', 512);

  // Hero artwork (original framing, responsive sizes)
  for (const w of [640, 960, 1408]) {
    await sharp(src).resize({ width: w }).webp({ quality: 86 }).toFile(join(out, `lynto-hero-${w}.webp`));
  }
  await sharp(src).resize({ width: 1408 }).jpeg({ quality: 86, mozjpeg: true }).toFile(join(out, 'lynto-hero-1408.jpg'));

  // Open Graph 1200x630 (centre crop of original artwork)
  await sharp(src).resize({ width: 1200, height: 630, fit: 'cover', position: 'centre' })
    .jpeg({ quality: 88, mozjpeg: true }).toFile(join(out, 'og-image.jpg'));

  // App icons / favicons: symbol on the artwork's own navy, square
  const symSquare = { left: 205 - 35, top: 240 - 70, width: 358 + 70, height: 358 + 70 };
  const sq = sharp(src).extract(symSquare);
  for (const s of [512, 192, 180, 64, 32]) {
    await sq.clone().resize(s, s).png({ compressionLevel: 9 }).toFile(join(out, `icon-${s}.png`));
  }
  copyFileSync(join(out, 'icon-32.png'), join(root, 'public', 'favicon.png'));
  console.log('Brand derivatives written to public/brand');
}
main().catch((e) => { console.error(e); process.exit(1); });
