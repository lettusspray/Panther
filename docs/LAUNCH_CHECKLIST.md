# Launch Checklist

Run this top-to-bottom before and immediately after going live on `panther.ng`.

> **Deployment model: Cloudflare Workers with static assets** (not Pages). Astro v7 + `@astrojs/cloudflare` v14 use the Cloudflare Vite plugin, which deploys via `wrangler deploy` and serves `dist/client` as static assets behind the worker. Pages mode is legacy and errors on the reserved `ASSETS` binding — do not set `pages_build_output_dir`.

## 1. Cloudflare dashboard — secrets

Set these as **secrets** on the app Worker (Workers & Pages → panther → Settings → Variables and Secrets). Secrets must **not** go in `wrangler.toml`.

| Variable | Notes |
|---|---|
| `BETTER_AUTH_SECRET` | Real random value, 32+ chars. `openssl rand -base64 48`. |
| `PAYSTACK_SECRET_KEY` | Live key (not test). |
| `DATABASE_URL` | Direct Postgres URL, **or** a Hyperdrive binding (see §3). |
| `AUTO_DEV_API_KEY` | Vehicle data API (nightly pipeline). |
| `GROQ_API_KEY` | Offline Knowledge Hub ETL only. |
| `CRAWL4AI_API_KEY` | Removed from `wrangler.toml` — must be set here or crawling 401s. |
| `IROYAL_PROXY` | iRoyal residential proxy credential string. If unset, proxy paths skip proxying with a warning. |
| `CF_IMAGES_ACCOUNT` / `CF_IMAGES_API_TOKEN` | Cloudflare Images. |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Presigned upload URLs. |

Non-secret vars stay in `wrangler.toml [vars]` (`ENVIRONMENT`, `CRAWL4AI_API_URL`, `BETTER_AUTH_URL`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`).

## 2. Connect the repo (Git integration)

Cloudflare **Workers Builds** (Compute → Workers & Pages → **Create application** → **Import a repository**):

- **Build command:** `npx astro build`
- **Deploy command:** `npx wrangler deploy`

`astro build` emits `dist/client` + `dist/server/wrangler.json`; `wrangler deploy` auto-reads the generated config (assets + bindings + vars). Preview locally first with `npm run dev:worker` (`astro build && wrangler dev`).

## 3. DNS

- `panther.ng` (apex) → add a **custom domain** on the app Worker.
- Wildcard `*.panther.ng` → the same Worker (dealer storefronts depend on it; unknown subdomains 404 via `src/middleware.ts`).

## 4. Nightly pipeline (separate Worker)

The pipeline (ontology, pricing, knowledge, crawl4ai) runs as its own Worker — config `wrangler.workers.toml`.

1. Create the four queues: `ingestion-ontology`, `ingestion-pricing`, `etl-knowledge`, `dead-letter`.
2. Create a Hyperdrive instance and bind it to the pipeline worker as `HYPERDRIVE`.
3. Set worker secrets: `AUTO_DEV_API_KEY`, `GROQ_API_KEY`, `CRAWL4AI_API_KEY`, `SCRAPER_API_KEYS`, `IROYAL_PROXY`, `DATABASE_URL` (fallback if Hyperdrive unset).
4. Deploy: `npm run worker:deploy` (`wrangler deploy -c wrangler.workers.toml`). Cron `0 2 * * *` is declared in the config.
5. Sanity: `npm run worker:build` runs a dry-run bundle; the deployed worker answers `panther-pipeline-ok` at its route.

If the pipeline never runs, `cohort_pricing` stays empty and the freshness kill-switch 503s all pricing 24h after the last fresh `System_Config` timestamp.

## 5. Launch data (demo marketplace)

Before going live, seed the showcase inventory so the marketplace isn't an empty shell:

```
npm run db:seed        # GVO + System_Config (idempotent)
npm run db:seed:launch # demo dealer + ~24 active listings (idempotent)
```

Both require `DATABASE_URL` in the shell. The launch seed fetches real vehicle photos via `UNSPLASH_ACCESS_KEY`/`PEXELS_API_KEY` (falls back to placeholders) and creates the `panther-demo-lot` dealer at `demo.panther.ng`.

## 6. Migrations (before deploy)

```
npm run db:migrate
```

Requires a shell `DATABASE_URL`. Never skip — schema drift will break the queues and pricing engine. `db:migrate` stays a manual step; `deploy` does not run it.

## 7. Deploy

```
npm run deploy
```

(`astro build && wrangler deploy`.)

Full release incl. migrations in one shot (needs `DATABASE_URL` exported in the shell):

```
npm run deploy:all
```

## 8. Post-launch verification

- [ ] `https://panther.ng/` → 200, dark marketing hero renders (no DB dependency — see middleware).
- [ ] `https://panther.ng/vehicles` → 200, GVO cascade works.
- [ ] `https://panther.ng/listings` → 200, active listings show (launch seed).
- [ ] `https://panther.ng/pricing/car/toyota/camry/le` → 200, 13-step landed cost renders **or** the freshness kill-switch message ("Live market data temporarily unavailable") — never a silent stale number.
- [ ] Dealer subdomain e.g. `https://demo.panther.ng/` → resolves to the demo storefront (wildcard DNS + middleware rewrite); unknown subdomains 404.
- [ ] `https://panther.ng/sitemap.xml` → serves well-formed XML (dynamic `src/pages/sitemap.xml.ts`).
- [ ] Security headers on static assets (`public/_headers`, honored by Workers static assets): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`. HSTS: enable as an edge setting scoped to `panther.ng` only. CSP is intentionally deferred.
- [ ] Nightly pipeline: check the 02:00 UTC cron ran on the pipeline worker, the 4 queues drained, and the dead-letter queue is empty the morning after launch.

## Rollback

- Static assets + worker roll back together: Pages → Deployments → redeploy the previous production deployment.
- Queue/cron bindings are dashboard state — re-verify after any rollback.
