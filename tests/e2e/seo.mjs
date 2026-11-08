// Isolated integration checks against the built Worker: no network provider calls or live databases.
// Run after npm run build. Tests use the existing Miniflare version bundled with Wrangler.
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
const root = resolve(import.meta.dirname, '../..');
const base = 'https://lynto.store';
const types = { '.html':'text/html', '.json':'application/json', '.webmanifest':'application/manifest+json', '.js':'text/javascript', '.css':'text/css', '.jpg':'image/jpeg', '.png':'image/png' };
const mf = new Miniflare(convertV4MiniflareOptions({
  name:'lynto-seo-test', modules:true, scriptPath:resolve(root,'dist/lynto/index.js'), compatibilityDate:'2026-10-01',
  d1Databases:['DB'], r2Buckets:['FILES'], cf:false,
  bindings:{ APP_ENV:'production', PUBLIC_BASE_URL:base, DATA_KEY:'test-only', TOKEN_SECRET:'test-only' },
  serviceBindings:{ ASSETS:async (request) => {
    const path = new URL(request.url).pathname;
    const file = resolve(root,'dist/client','.'+(path==='/'?'/index.html':path));
    if (!file.startsWith(resolve(root,'dist/client')+'/') || !existsSync(file)) return new Response('Not found',{status:404});
    return new Response(readFileSync(file),{headers:{'content-type':types[extname(file)] || 'application/octet-stream'}});
  } },
}));
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('✓ '+name); }
const page = async (path) => { const r=await mf.dispatchFetch(base+path); return { status:r.status, headers:r.headers, text:await r.text() }; };
try {
  const fixture = new DatabaseSync(':memory:');
  for (const name of ['0001_init.sql','0002_seed_catalog.sql','0003_launch_catalog.sql','0007_product_details.sql']) fixture.exec(readFileSync(resolve(root,'migrations',name),'utf8'));
  const db=await mf.getD1Database('DB');
  for (const table of ['settings','categories','products','plans']) {
    const ddl=fixture.prepare('SELECT sql FROM sqlite_master WHERE type=\'table\' AND name=?').get(table).sql;
    await db.prepare(ddl).run();
    const rows=fixture.prepare('SELECT * FROM '+table).all();
    for (let start=0; start<rows.length; start+=100) {
      await db.batch(rows.slice(start,start+100).map((row)=>db.prepare(`INSERT INTO ${table} (${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(()=>'?').join(',')})`).bind(...Object.values(row))));
    }
  }
  fixture.close();
  await check('product initial HTML includes localized names, exact EGP offers, plan links and no aggregate merchant prices',async()=>{
    for (const prefix of ['', '/en']) {
      const r=await page(prefix+'/p/chatgpt-plus'); assert.equal(r.status,200);
      const schemas=[...r.text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m)=>JSON.parse(m[1]));
      const product=schemas.find((s)=>s['@type']==='Product'); assert.ok(product); assert.equal(product.offers[0]['@type'],'Offer');
      assert.ok(product.offers[0].url.includes('?plan=')); assert.equal(product.offers[0].priceCurrency,'EGP');
      assert.match(product.name,prefix ? /subscription/ : /اشتراك/);
      assert.ok(r.text.includes(`href="${base}${prefix}/p/chatgpt-plus"`));
    }
  });
  await check('policy and FAQ answers are present without JavaScript',async()=>{
    assert.match((await page('/support')).text,/إزاي بيتأكد الدفع/);
    assert.match((await page('/en/support')).text,/A receipt image alone is not confirmation/);
    assert.match((await page('/about')).text,/about|متجر رقمي مصري/);
    assert.match((await page('/en/terms')).text,/new order and payment/);
  });
  await check('guides render full bilingual articles and current source links',async()=>{
    for(const prefix of ['', '/en']) {
      const r=await page(prefix+'/guides/gift-card-region-checklist'); assert.equal(r.status,200);
      assert.match(r.text,/Google Play/); assert.match(r.text,/support.google.com/); assert.match(r.text,/"@type":"Article"/);
    }
  });
  await check('robots allows public render dependencies but excludes private APIs',async()=>{
    const r=await page('/robots.txt'); assert.match(r.text,/Allow: \/api\/public\/bootstrap/); assert.match(r.text,/Disallow: \/api\//);
  });
  await check('sitemap includes guide translations, approved products and real modification times',async()=>{
    const r=await page('/sitemap.xml'); assert.equal(r.status,200); assert.match(r.text,/<lastmod>/); assert.match(r.text,/\/en\/guides\/gift-card-region-checklist/); assert.ok(!r.text.includes('/cart'));
  });
  await check('llms.txt is real plain text, not an application shell',async()=>{
    const r=await page('/llms.txt'); assert.equal(r.status,200); assert.match(r.headers.get('content-type'),/text\/plain/); assert.ok(r.text.startsWith('# LYnto')); assert.ok(!r.text.includes('<html'));
  });
  await check('manifest works and unknown pages/assets return genuine 404s',async()=>{
    const manifest=await page('/manifest.webmanifest'); assert.equal(manifest.status,200); assert.equal(JSON.parse(manifest.text).name,'LYnto');
    assert.equal((await page('/not-a-real-page')).status,404); assert.equal((await page('/missing-asset.js')).status,404);
  });
  await check('cart and order pages remain private and unindexed',async()=>{
    for(const path of ['/cart','/en/checkout','/order/LY-ABC123']) {
      const r=await page(path); assert.match(r.headers.get('x-robots-tag'),/noindex/); assert.match(r.headers.get('cache-control'),/no-store/); assert.ok(!r.text.includes('"@type":"Product"'));
    }
  });
  await check('card API omits full descriptions and bootstrap avoids the full product payload',async()=>{
    const cards=JSON.parse((await page('/api/public/products?view=cards')).text); assert.ok(cards.products.length>0); assert.ok(!('description_ar' in cards.products[0]));
    const bootstrap=JSON.parse((await page('/api/public/bootstrap')).text); assert.ok(bootstrap.product_count>=bootstrap.featured.length); assert.ok(bootstrap.featured.length<=8); assert.ok(!('plans' in bootstrap.featured[0]));
  });
  await check('security policy permits the existing analytics beacon without unsafe script execution',async()=>{
    const r=await page('/'); const csp=r.headers.get('content-security-policy'); assert.match(csp,/script-src 'self' https:\/\/static.cloudflareinsights.com/); assert.ok(!csp.includes("script-src 'self' 'unsafe-inline'"));
  });
  console.log(`${passed} Worker integration checks passed; no production state touched.`);
} finally { await mf.dispose(); }
