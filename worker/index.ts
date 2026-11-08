import { Hono } from 'hono';
import type { AppContext, Env } from './env';
import { HttpError, isProd } from './lib/util';
import { publicRoutes } from './routes/public';
import { adminAuth } from './routes/admin-auth';
import { admin } from './routes/admin';
import { webhooks } from './routes/webhooks';
import { renderPage, robots, sitemap, llms } from './lib/seo';
import { loadSettings } from './lib/settings';
import { runScheduled } from './services/cron';

const app = new Hono<AppContext>();

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.code, message: err.message === err.code ? undefined : err.message, details: err.details }, err.status as any);
  }
  // Log without request bodies or customer data.
  console.error(JSON.stringify({ level: 'error', path: new URL(c.req.url).pathname, method: c.req.method, message: String((err as any)?.message ?? err).slice(0, 300) }));
  return c.json({ error: 'server_error', message: 'Something went wrong. Please try again.' }, 500);
});

// Canonical host + security headers
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (url.hostname === 'www.lynto.store') return c.redirect(`https://lynto.store${url.pathname}${url.search}`, 301);
  // The zone's "Always Use HTTPS" is not guaranteed, so upgrade here (except local development).
  if (url.protocol === 'http:' && isProd(c.env)) return c.redirect(`https://${url.host}${url.pathname}${url.search}`, 301);
  await next();
  // Responses from the asset server have immutable headers; re-wrap before adding ours.
  c.res = new Response(c.res.body, c.res);
  const h = c.res.headers;
  h.set('x-content-type-options', 'nosniff');
  h.set('referrer-policy', 'strict-origin-when-cross-origin');
  h.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  h.set('cross-origin-opener-policy', 'same-origin');
  if (url.protocol === 'https:') h.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  if (!isProd(c.env)) h.set('x-robots-tag', 'noindex, nofollow');
  if ((h.get('content-type') ?? '').includes('text/html') && c.env.APP_ENV !== 'development') {
    let pixel = false;
    try { pixel = !!(c.get('businessSettings') ?? await loadSettings(c.env)).tracking.meta_pixel_id; } catch { /* settings unavailable */ }
    const fb = pixel ? ' https://connect.facebook.net' : '';
    const fbImg = pixel ? ' https://www.facebook.com' : '';
    h.set('content-security-policy', [
      "default-src 'self'", `script-src 'self' https://static.cloudflareinsights.com${fb}`, "style-src 'self' 'unsafe-inline'", `img-src 'self' data: blob:${fbImg}`, "font-src 'self'",
      `connect-src 'self'${fb}${fbImg}`, "frame-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'", "object-src 'none'", 'upgrade-insecure-requests',
    ].join('; '));
    h.set('x-frame-options', 'DENY');
  }
});

app.get('/healthz', async (c) => {
  const db = await c.env.DB.prepare('SELECT 1 AS ok').first<{ ok: number }>().then(() => true).catch(() => false);
  return c.json({ ok: db, env: c.env.APP_ENV, time: new Date().toISOString() }, db ? 200 : 503);
});

app.route('/api/public', publicRoutes);
app.route('/api/admin/auth', adminAuth);
app.route('/api/admin', admin);
app.route('/api/webhooks', webhooks);
app.all('/api/*', () => { throw new HttpError(404, 'not_found'); });

app.get('/media/:id', async (c) => {
  const id = c.req.param('id');
  if (!/^med_[a-z0-9]{16}$/.test(id)) return c.notFound();
  const obj = await c.env.FILES.get(`media/${id}`);
  if (!obj) return c.notFound();
  return new Response(obj.body, { headers: { 'content-type': obj.httpMetadata?.contentType ?? 'application/octet-stream', 'cache-control': 'public, max-age=86400', 'x-content-type-options': 'nosniff' } });
});

app.get('/robots.txt', robots);
app.get('/sitemap.xml', sitemap);
app.get('/llms.txt', llms);

// Static files that reached the Worker (e.g. /manifest.webmanifest) go to the asset server.
app.get('*', async (c, next) => {
  const p = new URL(c.req.url).pathname;
  if (/\.[a-z0-9]{2,16}$/i.test(p)) return c.env.ASSETS.fetch(c.req.raw);
  await next();
});
app.get('*', (c) => renderPage(c));

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env).then((r) => console.log(JSON.stringify({ level: 'info', job: 'scheduled', ...r }))).catch((e) => console.error(JSON.stringify({ level: 'error', job: 'scheduled', message: String(e?.message ?? e).slice(0, 300) }))));
  },
} satisfies ExportedHandler<Env>;
