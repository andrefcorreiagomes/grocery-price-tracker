# Operations

Running notes for the original part of the app: the 275 hand-picked products
in `data/tracked-products.ts` and their daily price snapshots. Moved here from
the front page, which now describes the project as a whole.

## Setup

```bash
npm install
npx prisma migrate dev   # creates dev.db with the schema
npm run seed              # loads data/tracked-products.ts into the database
npm run scrape             # scrapes current prices for all tracked products
npm run dev                 # starts the web app at http://localhost:3000
```

## How it works

- **`src/scrapers/`** — one file per store. Each fetches a product page with
  a plain HTTP request (no headless browser needed) and extracts price/name/
  brand/EAN from structured data already embedded in the page
  (`application/ld+json` or a GTM `dataLayer`, depending on the store).
- **`data/tracked-products.ts`** — the curated list of products to track.
  Each entry gives the canonical product name/category/subcategory/unit and,
  per store, the exact product page URL/ID plus that store's package size
  (`packageSize`, expressed in the product's `unit` - e.g. `0.75` for a
  750ml bottle when `unit` is `"L"`). Prices are normalized to
  `price / packageSize` for fair comparison when stores sell different pack
  sizes. **Edit this file to add more products**, then run `npm run seed`
  again. A single store can have more than one listing for the same
  product (e.g. a promo SKU alongside a regular one, or different pack
  sizes) - just add multiple entries with that `store` under the same
  product; the comparison always shows whichever tracked SKU is currently
  cheapest per unit at that store, so it automatically follows promotions
  rotating between sibling SKUs instead of being locked onto one.
- **`npm run scrape`** (`src/scripts/scrape-daily.ts`) — scrapes every
  tracked listing and upserts one `PriceSnapshot` per listing for today's
  date. Safe to re-run the same day (idempotent via a unique constraint).
- The web app reads directly from the SQLite database:
  - `/` — category menu (derived from the distinct `category` values on
    tracked products).
  - `/categoria/[category]` — subcategory filter chips (when a category has
    more than one) plus the comparison table for that category/subcategory,
    cheapest **unit price** (not raw price) highlighted per product.
  - `/produtos/[id]` — price history chart per store, normalized to
    price-per-unit.

## Scheduling the daily scrape

The scraper is just a script (`npm run scrape`) - nothing runs automatically
on its own. To collect a price every day, set up a Windows Task Scheduler
task yourself:

1. Open **Task Scheduler** → **Create Basic Task…**
2. Name it e.g. "Grocery Price Scrape", trigger **Daily** at a time of your
   choosing.
3. Action: **Start a program**
   - Program/script: `npm.cmd`
   - Add arguments: `run scrape`
   - Start in: the full path to this project folder, e.g.
     `C:\Users\andre\Claude projects\grocery-price-tracker`
4. Finish. You can test it immediately via **Run** in Task Scheduler, and
   check `npx prisma studio` afterwards to confirm a new row appeared in
   `PriceSnapshot`.

## Checking for scrape failures

Sites occasionally change their HTML/structured data, which breaks a
scraper for that one listing. `npm run scrape` never stops for this - it
logs the failure and moves on to the rest. Failures are written to
**`logs/scrape.log`** (created on first failure, gitignored - it's a local
runtime file, not source), one timestamped line per failure plus a run
summary line, e.g.:

```
[2026-08-06T09:00:03.412Z] FAIL CONTINENTE Peito de Frango (https://www.continente.pt/...): Continente: could not find product/price data at ...
[2026-08-06T09:00:04.500Z] Run summary: 20 succeeded, 1 failed.
```

Nothing is written on a clean run, so an empty (or unchanged) file means
nothing needs attention - check it after each scrape, or make checking it
part of whatever schedules the scrape. The error message usually points at
what changed on the store's site; the fix is normally re-finding the
product's current URL and updating `data/tracked-products.ts`.

## Notes

- EAN (barcode) is captured when available, but coverage varies by store.
  Continente publishes it on every product page (as an `?ean=` value in the
  page HTML) and Auchan in its `ld+json` (`gtin`); Pingo Doce does not appear
  to expose it at all. A caveat when comparing across stores: weighed and
  counter goods carry GS1 restricted-circulation codes (prefix `2`) that each
  retailer mints for itself, so they identify a scale ticket rather than a
  product and must not be matched between stores. EAN is a sanity check and a
  cross-store match signal, not required for price tracking to work.
