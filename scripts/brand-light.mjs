// Light-theme lockup: the supplied artwork has a white wordmark. We recolour only its near-white, low-saturation pixels
// to the brand navy; the coloured knot is untouched. Run: node scripts/brand-light.mjs
import sharp from 'sharp';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
for (const name of ['lynto-lockup', 'lynto-lockup-tagline']) {
  const { data, info } = await sharp(join(root, `${name}.png`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (data[i + 3] > 0 && sat < 0.22 && max > 150) { data[i] = 0x0b; data[i + 1] = 0x20; data[i + 2] = 0x3a; }
  }
  const img = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  await img.clone().png({ compressionLevel: 9 }).toFile(join(root, `${name}-light.png`));
  await img.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(join(root, `${name}-light.webp`));
  console.log('wrote', name + '-light');
}
