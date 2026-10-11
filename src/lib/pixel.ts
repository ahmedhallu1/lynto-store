// Meta Pixel loader — only after explicit consent and only when a real Pixel ID is configured.
// Purchase is fired ONLY for verified payments (same event_id as the server CAPI event for dedup).
declare global {
  interface Window { fbq?: any; _fbq?: any }
}
const CONSENT_KEY = 'lynto_tracking_consent';

export function getConsent(): 'granted' | 'denied' | null {
  try { const v = localStorage.getItem(CONSENT_KEY); return v === 'granted' || v === 'denied' ? v : null; } catch { return null; }
}
export function setConsent(v: 'granted' | 'denied') {
  try { localStorage.setItem(CONSENT_KEY, v); } catch { /* ignore */ }
}

let loadedFor = '';
export function initPixel(pixelId: string) {
  if (!pixelId || getConsent() !== 'granted' || loadedFor === pixelId) return;
  loadedFor = pixelId;
  const n: any = function (...args: unknown[]) { n.callMethod ? n.callMethod(...args) : n.queue.push(args); };
  if (!window.fbq) {
    window.fbq = n; window._fbq = n; n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
    const s = document.createElement('script');
    s.async = true; s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
  }
  window.fbq('init', pixelId);
  window.fbq('track', 'PageView');
}

export function track(event: 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase', data: Record<string, unknown> = {}, eventId?: string) {
  if (!loadedFor || !window.fbq || getConsent() !== 'granted') return;
  window.fbq('track', event, data, eventId ? { eventID: eventId } : undefined);
}

export function trackPurchaseOnce(orderNumber: string, valueEGP: number) {
  const key = `lynto_purchase_${orderNumber}`;
  try { if (localStorage.getItem(key)) return; } catch { return; }
  if (!loadedFor) return;
  track('Purchase', { currency: 'EGP', value: valueEGP }, `purchase_${orderNumber}`);
  try { localStorage.setItem(key, '1'); } catch { /* ignore */ }
}
