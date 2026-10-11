# LYnto store

Bilingual (Egyptian Arabic / English) digital-subscription store for Egypt — https://lynto.store

- Manual transfers (InstaPay, bank, mobile wallets) verified by the owner; manual fulfilment within 2 working hours (Africa/Cairo).
- Cloudflare Workers + D1 + private R2, React/Vite/Tailwind front end, server-side SEO.
- Protected admin at `/admin`: payment review, delivery, catalog approval, pricing, setup, exports.

Docs: [Owner guide](docs/OWNER_GUIDE.md) · [Status checklist](docs/STATUS.md) · [Operations & backups](docs/OPERATIONS.md) ·
[Costs](docs/COSTS.md) · [Test results](docs/TEST_RESULTS.md) · [Developer notes](CLAUDE.md)

```
npm ci && npm run typecheck && npm test && npm run deploy:prod
```
Brand artwork: `brand-source/` (originals) → `npm run brand` generates `public/brand/` derivatives (crops only; the mark is not redrawn).
