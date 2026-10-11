const enc = new TextEncoder();
const dec = new TextDecoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function fromB64(s: string): Uint8Array {
  const n = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(n + '==='.slice((n.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function hex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}
export function randomToken(n = 32): string {
  return b64url(randomBytes(n));
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function randomCode(len: number): string {
  const bytes = randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += ALPHABET[bytes[i] % 32];
  return s;
}
export function newId(prefix: string): string {
  return `${prefix}_${randomCode(16).toLowerCase()}`;
}

export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = typeof data === 'string' ? enc.encode(data) : data;
  return hex(await crypto.subtle.digest('SHA-256', bytes));
}

async function hmacKey(secret: string, usage: Array<'sign' | 'verify'> = ['sign']) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, usage);
}
export async function hmacB64(secret: string, msg: string): Promise<string> {
  return b64url(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(msg)));
}
export async function hmacHex(secret: string, msg: string | Uint8Array): Promise<string> {
  return hex(await crypto.subtle.sign('HMAC', await hmacKey(secret), typeof msg === 'string' ? enc.encode(msg) : msg));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const ab = enc.encode(a), bb = enc.encode(b);
  let diff = ab.length ^ bb.length;
  const len = Math.max(ab.length, bb.length);
  for (let i = 0; i < len; i++) diff |= (ab[i % ab.length] ?? 0) ^ (bb[i % bb.length] ?? 0);
  return diff === 0;
}

// ---- AES-GCM for data at rest ----
let keyCache: { raw: string; key: CryptoKey } | null = null;
async function dataKey(raw: string): Promise<CryptoKey> {
  if (keyCache?.raw === raw) return keyCache.key;
  const bytes = fromB64(raw);
  if (bytes.length !== 32) throw new Error('DATA_KEY must be 32 bytes base64');
  const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  keyCache = { raw, key };
  return key;
}
export async function encryptText(rawKey: string, plaintext: string, aad = ''): Promise<string> {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(aad) }, await dataKey(rawKey), enc.encode(plaintext));
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), 12);
  return 'v1:' + b64url(out);
}
export async function decryptText(rawKey: string, payload: string, aad = ''): Promise<string> {
  if (!payload.startsWith('v1:')) throw new Error('unknown ciphertext version');
  const bytes = fromB64(payload.slice(3));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: enc.encode(aad) }, await dataKey(rawKey), bytes.slice(12));
  return dec.decode(pt);
}

// ---- Password hashing (PBKDF2-SHA256) ----
// Sized for the Workers Free plan CPU budget (~10 ms per request); stored per hash so it can be raised later.
export const PBKDF2_ITERATIONS = 40_000;
export async function hashPassword(password: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return `pbkdf2$sha256$${iterations}$${b64url(salt)}$${b64url(bits)}`;
}
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, hash, iterStr, saltB64, hashB64] = stored.split('$');
  if (scheme !== 'pbkdf2' || hash !== 'sha256') return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromB64(saltB64), iterations: Number(iterStr) }, key, 256);
  return timingSafeEqual(b64url(bits), hashB64);
}

// ---- TOTP (RFC 6238, SHA-1, 6 digits, 30 s) ----
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(s: string): Uint8Array {
  const clean = s.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function hotp(secret: Uint8Array, counter: number): Promise<string> {
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const off = mac[mac.length - 1] & 0xf;
  const code = ((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}
export async function verifyTotp(secretB32: string, code: string, now = Date.now()): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const secret = base32Decode(secretB32);
  const counter = Math.floor(now / 30_000);
  for (const w of [-1, 0, 1]) if (timingSafeEqual(await hotp(secret, counter + w), code)) return true;
  return false;
}
export async function totpNow(secretB32: string, now = Date.now()): Promise<string> {
  return hotp(base32Decode(secretB32), Math.floor(now / 30_000));
}
