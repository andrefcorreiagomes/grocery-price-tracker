import { parseContinenteTiles, parseContinenteTotal } from "../search/continente";
import type { SearchHit } from "../search/types";
import { CONTINENTE_FOOD_CATEGORIES } from "./continente-categories";
import type { CategoryResult, CrawlCategory, CrawlProgress } from "./types";

/**
 * The FAST Continente crawler: a whole category grid per request.
 *
 * DISALLOWED, AND DISABLED. Continente's robots.txt forbids the URL this
 * builds, twice over - confirmed against the live file:
 *
 *     Disallow: /*?cgid      the category
 *     Disallow: /*&sz        the page size
 *
 * This was KNOWN, and the note here used to say so: the route was kept because
 * it is ~30x cheaper (562 requests and 14 minutes, against ~17,000 requests and
 * about five hours for `continente-products.ts`), with the instruction to
 * "choose between them deliberately".
 *
 * That is why it is now refused rather than merely documented. The choosing
 * stopped happening: `npm run crawl:all` called this with no flag and no
 * warning, so the default "crawl everything" command took the disallowed route
 * every time, and it is where the catalogue's Continente rows came from. A
 * comment cannot enforce a decision that the default quietly makes for you.
 *
 * The compliant routes, both already built:
 *
 *     crawl:continente:products   one product page at a time, ~5 h, and it
 *                                 returns the barcode and pack size too
 *     crawl:continente:nightly    the same, orchestrated, with the sitemap and
 *                                 the section landing pages robots.txt invites
 *
 * Kept rather than deleted, because the pagination lesson recorded below is
 * worth keeping and the tile parsers are still used elsewhere. Only the request
 * path is refused.
 */

const DISALLOWED =
  "Continente's robots.txt disallows ?cgid and &sz - the category and page-size " +
  "parameters this request paginates with. Use `npm run crawl:continente:products` " +
  "or `npm run crawl:continente:nightly`, which read one product page at a time.";

/**
 * Stands in for the `fetchHtml` this crawler used to call. Declared as
 * returning the HTML it will never return, so the code below still typechecks
 * against a real string.
 */
function refuseDisallowed(url: string): string {
  throw new Error(`${DISALLOWED}\n  refused: ${url}`);
}

const GRID_URL =
  "https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid";
const PAGE_SIZE = 35; // Continente clamps `sz` to 35 whatever we ask; walk `start`

export interface CategoryCrawl {
  products: SearchHit[];
  /** the store's own product count for the category, when published */
  expected: number | null;
}

/**
 * Fetch every product in one category. Pages `start` by 35 until the store's own
 * product count is covered, or a page brings nothing new (wrapped onto
 * already-seen results). `maxPages` caps the walk - used to smoke-test against a
 * handful of requests without pulling a whole 5,000-product section.
 */
export async function crawlContinenteCategory(
  category: CrawlCategory,
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<CategoryCrawl> {
  const byId = new Map<string, SearchHit>();
  let expected: number | null = null;

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    // The refusal stands exactly where the disallowed request would go, in
    // place of the `fetchHtml` that used to be here. Refusing at the top of the
    // function instead would make the whole body unreachable, and TypeScript
    // stops narrowing inside unreachable code - the pagination logic below
    // silently loses its null checks.
    const html = refuseDisallowed(
      `${GRID_URL}?cgid=${encodeURIComponent(category.cgid)}&start=${start}&sz=${PAGE_SIZE}`
    );
    const hits = parseContinenteTiles(html);
    if (page === 0) expected = parseContinenteTotal(html);
    if (hits.length === 0) break; // ran off the end of the category

    let fresh = 0;
    for (const hit of hits) {
      if (!byId.has(hit.id)) {
        byId.set(hit.id, hit);
        fresh++;
      }
    }
    opts.onProgress?.({ category, page: page + 1, collected: byId.size });

    if (fresh === 0) break; // every id already seen: pagination has wrapped

    if (expected !== null) {
      // Drive pagination from the count the grid publishes. A page of 35 tiles
      // need not parse to 35 products, so ending on a short page cuts the crawl
      // off early - that bug cost more than half the Pingo Doce catalogue.
      if (start + PAGE_SIZE >= expected) break;
    } else if (hits.length < PAGE_SIZE) {
      break; // no published count to steer by: fall back to the short page
    }
  }

  return { products: [...byId.values()], expected };
}

/** Crawl several categories in sequence (defaults to all Continente food). */
export async function crawlContinente(
  opts: { categories?: CrawlCategory[]; maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<CategoryResult[]> {
  const categories = opts.categories ?? CONTINENTE_FOOD_CATEGORIES;
  // One product can appear in more than one section (an organic rice in both
  // Mercearia and Bio e Saudável). Dedup across the whole run so each product is
  // kept once, attributed to the FIRST section that lists it - which is why the
  // overlapping "biologicos" section is ordered last, contributing only what is
  // genuinely new.
  const seen = new Set<string>();
  const results: CategoryResult[] = [];
  for (const category of categories) {
    const { products, expected } = await crawlContinenteCategory(category, {
      maxPages: opts.maxPages,
      onProgress: opts.onProgress,
    });

    let duplicates = 0;
    const fresh = products.filter((p) => {
      if (seen.has(p.id)) {
        duplicates++;
        return false;
      }
      seen.add(p.id);
      return true;
    });
    results.push({ category, products: fresh, expected: expected ?? undefined, duplicates });
  }
  return results;
}
