// Platform logo resolver for product cards.
// Sources (in order): simple-icons (CC0 vector glyphs) → files cached in brand-source/logos (official site / Wikimedia Commons).
// Logos identify the platform a customer is buying for; they remain the property of their owners (see footer notice).
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import * as SI from 'simple-icons';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = join(root, 'brand-source', 'logos');

// slug → simple-icons key (without "si") OR file in brand-source/logos
const MAP = {
  'chatgpt-plus': 'file:chatgpt.png', 'chatgpt-pro': 'file:chatgpt.png',
  'claude-pro': 'si:Claude', 'claude-max': 'si:Claude',
  'google-ai-pro': 'si:Googlegemini', 'google-ai-ultra': 'si:Googlegemini',
  'perplexity-pro': 'si:Perplexity', 'midjourney': 'file:midjourney.png', 'github-copilot': 'si:Githubcopilot', 'cursor': 'si:Cursor',
  'supergrok': 'file:grok.png', 'elevenlabs': 'si:Elevenlabs', 'runway': 'file:runway.png', 'suno': 'si:Suno', 'deepl': 'si:Deepl',
  'canva-pro': 'file:canva.png', 'microsoft-365': 'file:microsoft365.svg', 'office-2024': 'ms-squares', 'windows-11': 'win-squares',
  'adobe-creative-cloud': 'file:adobe.png', 'adobe-photoshop': 'file:adobe.png', 'adobe-premiere-pro': 'file:adobe.png', 'adobe-acrobat-pro': 'file:adobe.png',
  'figma': 'si:Figma', 'notion': 'si:Notion', 'grammarly': 'si:Grammarly', 'google-one': 'file:googleone.svg', 'icloud-plus': 'si:Icloud',
  'dropbox': 'si:Dropbox', 'nordvpn': 'si:Nordvpn', 'expressvpn': 'si:Expressvpn', 'surfshark': 'si:Surfshark', '1password': 'si:1password',
  'jetbrains': 'si:Jetbrains', 'autodesk-fusion': 'si:Autodesk', 'coursera-plus': 'si:Coursera', 'duolingo-super': 'si:Duolingo', 'zoom-pro': 'si:Zoom',
  'netflix': 'si:Netflix', 'spotify-premium': 'si:Spotify', 'youtube-premium': 'si:Youtube', 'shahid-vip': 'file:shahid.png', 'disney-plus': 'file:disneyplus.svg',
  'hbo-max': 'si:Hbomax', 'amazon-prime': 'file:primevideo.svg', 'apple-music': 'si:Applemusic', 'apple-tv-plus': 'si:Appletv', 'anghami-plus': 'file:anghami.png',
  'osn-plus': 'file:osnplus.png', 'crunchyroll': 'si:Crunchyroll', 'xbox-game-pass': 'file:xbox.svg', 'playstation-plus': 'si:Playstation',
  'nintendo-switch-online': 'file:nintendo.svg', 'discord-nitro': 'si:Discord', 'telegram-premium': 'si:Telegram',
  'google-play-card': 'si:Googleplay', 'apple-gift-card': 'si:Apple', 'psn-card': 'si:Playstation', 'xbox-gift-card': 'file:xbox.svg', 'steam-wallet': 'si:Steam',
  'nintendo-eshop': 'file:nintendo.svg', 'amazon-gift-card': 'file:amazon.svg', 'netflix-gift-card': 'si:Netflix', 'roblox-gift-card': 'si:Roblox', 'razer-gold': 'si:Razer',
  'pubg-mobile-uc': 'file:pubgmobile.png', 'free-fire-diamonds': 'file:freefire.png', 'fortnite-vbucks': 'si:Fortnite', 'valorant-points': 'si:Valorant',
  'cod-mobile-cp': 'file:codmobile.png', 'mobile-legends-diamonds': 'file:mobilelegends.png', 'genshin-impact': 'file:genshin.png', 'ea-fc-points': 'si:Ea', 'tiktok-coins': 'si:Tiktok',
};

const lum = (hex) => { const n = parseInt(hex, 16); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f((n >> 16) & 255) + 0.7152 * f((n >> 8) & 255) + 0.0722 * f(n & 255); };

const WIN_SQUARES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23"><path fill="#0a8ff0" d="M1 3.2 10 2v8.4H1zM11 1.8 22 .3v10.1H11zM1 11.6h9V20l-9-1.3zM11 11.6h11v11.1L11 21.2z"/></svg>`;
const MS_SQUARES = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23"><path fill="#f25022" d="M1 1h10v10H1z"/><path fill="#7fba00" d="M12 1h10v10H12z"/><path fill="#00a4ef" d="M1 12h10v10H1z"/><path fill="#ffb900" d="M12 12h10v10H12z"/></svg>`;

function renderSvg(svg, size) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' }).render().asPng();
}

/** @returns {Promise<Buffer|null>} transparent PNG, at most `size` px on the long side, or null if unknown. */
export async function logoInfo(slug, size = 640) {
  const spec = MAP[slug];
  if (!spec) return null;
  let png;
  if (spec === 'ms-squares') png = renderSvg(MS_SQUARES, size);
  else if (spec === 'win-squares') png = renderSvg(WIN_SQUARES, size);
  else if (spec.startsWith('si:')) {
    const icon = SI['si' + spec.slice(3)];
    if (!icon) return null;
    let hex = icon.hex;
    if (lum(hex) > 0.75) hex = '1B2A41';
    png = renderSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#${hex}" d="${icon.path}"/></svg>`, size);
  } else {
    const file = join(dir, spec.slice(5));
    if (!existsSync(file)) return null;
    const buf = readFileSync(file);
    png = file.endsWith('.svg') ? renderSvg(buf.toString('utf8'), size) : buf;
  }
  // trim transparent margins so every logo fills its box consistently
  png = await sharp(png).ensureAlpha().trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 }).toBuffer().catch(() => png);
  // mostly-white marks (designed for dark backgrounds) get a dark tile instead of a white one
  const { data, info } = await sharp(png).ensureAlpha().resize(64, 64, { fit: 'inside' }).raw().toBuffer({ resolveWithObject: true });
  let sum = 0, n = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i + 3] > 128) { sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n++; }
  return { png, dark: n > 0 && sum / n > 225 };
}
export const logoPng = async (slug, size) => (await logoInfo(slug, size))?.png ?? null;

export const hasLogo = (slug) => slug in MAP;
