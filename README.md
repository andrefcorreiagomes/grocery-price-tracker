# Grocery Price Tracker

Tracks prices for a curated list of grocery products across Continente,
Pingo Doce and Auchan, storing one price snapshot per product/store/day so
you can compare prices and see history over time.

## Things that turned out to be hard

Comparing supermarket prices sounds solved: fetch two numbers, print the smaller
one. Most of the work here went into cases where the obvious number is quietly
the wrong one.

### Every store prices tinned fish on drained weight

A tin has two weights: *peso líquido* (net — everything in the tin) and *peso
escorrido* (drained — just the food). All three stores compute the `€/kg` printed
on their own pages from the **drained** figure. This tracker originally used net,
which put its numbers roughly a third below every price tag in the country.

Net doesn't just shift the numbers, it hides the difference. The own-brand 120 g
tuna tin costs €1,12 at all three stores, so on net weight all three read
€9,33/kg — a perfect three-way tie. On drained weight, that same €1,12 buys 85 g
of fish at Pingo Doce against 78 g at the other two.

The fix is not simply "use drained", because drained weight isn't always
published or trustworthy. Two exceptions are encoded and commented in place in
`data/tracked-products.ts`:

- **Auchan publishes no drained figure at all** for the Origens Bio chickpeas. A
  group can't mix bases, so that group stays on net.
- **Continente and Auchan disagree about the same Compal tin** — 234 g drained
  versus 260 g. One of them is wrong, and using drained would invent a €0,64/kg
  gap between two identical tins both priced €1,49. That group stays on net too.

A related trap: never match `€/kg` across the whole page. These pages carry
related-product carousels, and a page-wide regex once returned a neighbour's
rate, making a tin look like it drained to 85 g when its own product-detail
element said 78 g. Always scope to the product element.

### Pack price or price per kilo? The suffix decides

Continente labels fixed-weight packs and variable-weight counter goods with the
same `emb.` field, meaning something different in each case. On a 500 g tray it
is the pack size. On a turkey leg it is how much *that particular leg* weighed,
while the displayed price is already the per-kilo rate. "Perna de Peru" comes
back as `price: 4.99, packageSize: 2.2` — treating 2.2 as a pack size computes
€2,27/kg and understates the product by half.

The reliable discriminator is the suffix on the headline price:

| Page shows | Meaning | `packageSize` |
|---|---|---|
| `19,99€/kg` then `3,00€/un` | headline is per kilo; `/un` is the minimum cut | `1` |
| `1,99€` then `9,95€/kg` | headline is the pack price; `/kg` is derived | pack weight |

Counter goods also swap `emb.` for a minimum-order label (`Quant. Mínima = 150
gr`), which is not a pack size and must never be used as one. It cross-checks:
€19,99/kg × 0,15 kg = €3,00, exactly the `/un` figure shown. Where a page is
still ambiguous, the method is to fetch a control listing whose mode is already
known and compare signatures.

### Three promotion mechanisms, and two decoys

Recording whether a price is a promotion needed three unrelated implementations,
because the stores share no convention:

| Store | Signal | What it gives |
|---|---|---|
| Continente | `pre_discount_price` in an HTML-escaped analytics `dataLayer` | pre-promotion price, no end date |
| Pingo Doce | a `.product-promo-end` element reading "Promoção até 17/08" | end date, no pre-promotion price |
| Auchan | `priceValidUntil` in the ld+json offer | end date, no pre-promotion price |

The part worth writing down is the two signals that look right and aren't:

- **Pingo Doce's `dataLayer` carries a `discount` field that reads `0` on
  discounted items.** The DOM element is the only truthful source.
- **Auchan's `promo-label` and `promo-badges` class names are byte-identical on
  promo and non-promo pages.** Matching on them flags everything.

Because no store publishes all of it, `regularPrice` and `promoEndsAt` are both
nullable by design, and `onPromotion: false` on rows written before the feature
existed means "never captured", not "verified not on promotion".

The feature corrected a wrong conclusion on its first run. A 58% price gap on
Nescafé had been read as Pingo Doce simply charging more; the promo data showed
Continente's €3,99 was a temporary discount against a €6,29 regular price, and
all three stores were within four cents of each other.

### A search result that looked perfect, and wasn't

Products are added in batches: search all three stores for a term, cluster the
results into comparable groups, review, then write the approved groups into
`data/tracked-products.ts`. During one batch three Auchan URLs came back with the
right product name, the right store ID and the right price — and slugs that had
been reconstructed rather than read. All three 404'd.

The fix was structural rather than a patch. Raw search results are now dumped to
a file first, and every proposed URL is checked back against that dump by store
and ID before it can reach the product list. A URL that isn't in the dump doesn't
exist, however plausible it reads.

The same process caps each store's search at 60 hits (`SEARCH_LIMIT` in
`src/scrapers/search/paginate.ts`) — by hit count rather than page count, because
the three stores return 35, 100 and 100 results per page, so "one page each"
would sample them at wildly different depths.

### A price that never changes again

Pingo Doce delisted a fish SKU. The URL 404s, and the nightly scrape logs one
failure and carries on, as designed — but the comparison table kept showing that
store's last known price, styled identically to prices captured that morning. A
stale price presented as current is worse than no price.

Every table now carries the date of the most recent successful scrape, and any
cell that has fallen behind it is marked with its own date. Those are
deliberately different comparisons: the caption asks *did the scraper run at
all*, the cell asks *did this one listing fail while the others succeeded*.

Diagnosing it is also a reminder that a 404 has more than one cause. Pingo Doce
URLs carry a zero-width space (`%E2%80%8B`) in some category segments, and the
store had separately renamed the product's size band — either would produce an
identical 404 on a product that still exists. Establishing that the SKU was
genuinely gone took testing every combination of old slug, renamed slug, with and
without the zero-width space, plus the store's own search.

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

- EAN (barcode) is captured when available, but not guaranteed for every
  store/listing (e.g. Continente only exposes it once a delivery store is
  selected in-session, and Pingo Doce doesn't appear to expose it at all on
  the product page). It's a nice-to-have sanity check, not required for
  price tracking to work.
