import { fetchHtml } from "../http";
import { parsePingoDoceTiles, parsePingoDoceTotal } from "../search/pingodoce";
import type { SearchHit } from "../search/types";
import { PINGO_DOCE_FOOD_CATEGORIES } from "./pingodoce-categories";
import type { CategoryResult, CrawlCategory, CrawlProgress } from "./types";

/**
 * Catalogue crawler for Pingo Doce. Walks a food category's grid page by page
 * and returns the deduplicated products. DB-free - the runner persists.
 */

const SEARCH_URL =
  "https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/pt_PT/Search-Show";

/**
 * Pingo Doce honours a large `sz`, but sz=1000 returned a 10 MB response, so we
 * page at 100 - a small category comes in one request, a large one in a handful,
 * and each response stays light.
 */
const PAGE_SIZE = 100;

export interface CategoryCrawl {
  products: SearchHit[];
  /** the store's own product count for the category, when published */
  expected: number | null;
}

export async function crawlPingoDoceCategory(
  category: CrawlCategory,
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<CategoryCrawl> {
  const byId = new Map<string, SearchHit>();
  let expected: number | null = null;

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const html = await fetchHtml(
      `${SEARCH_URL}?cgid=${encodeURIComponent(category.cgid)}&start=${start}&sz=${PAGE_SIZE}`
    );
    const hits = parsePingoDoceTiles(html);
    if (page === 0) expected = parsePingoDoceTotal(html);
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
      // Drive pagination from the store's own count. A full page of 100 tiles
      // does not always parse to 100 products, so treating a short page as the
      // last one ends the crawl early - that bug cost more than half the
      // catalogue on the first run.
      if (start + PAGE_SIZE >= expected) break;
    } else if (hits.length < PAGE_SIZE) {
      break; // no published count to steer by: fall back to the short page
    }
  }

  return { products: [...byId.values()], expected };
}

/** Crawl several categories in sequence (defaults to all Pingo Doce food). */
export async function crawlPingoDoce(
  opts: { categories?: CrawlCategory[]; maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<CategoryResult[]> {
  const categories = opts.categories ?? PINGO_DOCE_FOOD_CATEGORIES;
  // Dedup across the whole run: a product listed in two departments is kept
  // once, attributed to the first that lists it. See crawlContinente.
  const seen = new Set<string>();
  const results: CategoryResult[] = [];
  for (const category of categories) {
    const { products, expected } = await crawlPingoDoceCategory(category, {
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
