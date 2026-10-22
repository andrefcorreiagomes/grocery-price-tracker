# Operations

How the nightly work runs. The site reads everything from the catalogue the
crawls build; there is no separate list of products to keep up to date.

## The night in one command

```bash
npm run nightly                   # the real thing: requests to all three stores
npm run nightly -- --plan         # print what would run, change nothing
npm run nightly -- --no-crawl     # everything except robots.txt and the crawls
npm run nightly -- --together     # the three crawls at the same time
```

In order (`src/scripts/nightly.ts`):

1. **Checks.** It runs only on the machine named in `NIGHTLY_HOST` in `.env`,
   because the database has one real copy and only that machine writes it.
   `CRAWLER_CONTACT` must be set too.
2. **robots.txt.** Each store's file is compared with the last saved copy in
   `logs/`. A store whose file changed is not crawled that night; the new copy
   is saved and the summary says so, for a person to read first.
3. **The crawls, one after another:** Auchan, Pingo Doce, Continente. About
   1½, 3 and 6 hours, so roughly ten hours in all.
4. **Afterwards:** pack sizes, kinds of food, then the groups of identical
   products: match candidates, the matcher, the barcodes of up to 300 Auchan
   products in groups not yet confirmed (the one step after the crawls that
   reads store pages, and only on a night Auchan was crawled), and the matcher
   again. Then the count of uncertain kinds, the automated checks
   (`verify:nightly`) and the comparison check. A group of identical products
   appears on the site only when no store has two unproven products in it and
   every barcode in it is known and agrees (`src/lib/grouping.ts`).
5. **A backup** of the database into `backups/`, keeping the last 7.
6. **A summary** in `logs/nightly-<date>/summary.md`, with each step's full
   output beside it. The command exits with an error when any step needs a
   look, so a scheduler can tell.

## After a night

Read the summary first. A crawl marked **FAIL** in its report means its data
may be wrong; **WARN** means something deserves a look. The full reports are in
`reports/`. To confirm nothing was lost, compare, for each store, the number
of catalogue rows seen that night with the number the crawl says it saved.

## Notes

- EAN (barcode) is captured when available, but coverage varies by store.
  Continente publishes it on every product page (as an `?ean=` value in the
  page HTML) and Auchan in its `ld+json` (`gtin`); Pingo Doce does not appear
  to expose it at all. A caveat when comparing across stores: weighed and
  counter goods carry GS1 restricted-circulation codes (prefix `2`) that each
  retailer mints for itself, so they identify a scale ticket rather than a
  product and must not be matched between stores.
- Until 21 October 2026 the site also showed 95 hand-picked products (274
  listings) with their own daily scrape. They were retired once the catalogue
  could do the same job and stay current by itself. Their tables (`Product`,
  `StoreListing`, `PriceSnapshot`, July to August 2026) are kept in the
  database; the matching scripts still use them as known pairs to measure how
  many the automatic matching finds.
