import { fetchHtml } from "../http";
import { parsePingoDoceTiles } from "../search/pingodoce";
import type { SearchHit } from "../search/types";
import { PINGO_DOCE_FOOD_CATEGORIES } from "./pingodoce-categories";
import type { CategoryResult, CrawlCategory, CrawlProgress } from "./types";

/**
 * Catalogue crawler for Pingo Doce. Mirrors the Continente crawler: walks a food
 * category's grid page by page and returns the deduplicated products. DB-free -
 * the runner script persists.
 */

const SEARCH_URL =
  "https://www.pingodoce.pt/on/demandware.store/Sites-pingo-doce-Site/pt_PT/Search-Show";

/**
 * Pingo Doce honours a large `sz`, but sz=1000 returned a 10 MB response, so we
 * page at 100 - a small category comes in one request, a large one in a handful,
 * and each response stays light.
 */
const PAGE_SIZE = 100;

export async function crawlPingoDoceCategory(
  category: CrawlCategory,
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<SearchHit[]> {
  const byId = new Map<string, SearchHit>();

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const html = await fetchHtml(
      `${SEARCH_URL}?cgid=${encodeURIComponent(category.cgid)}&start=${start}&sz=${PAGE_SIZE}`
    );
    const hits = parsePingoDoceTiles(html);
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
    if (hits.length < PAGE_SIZE) break; // short page: the last one
  }

  return [...byId.values()];
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
    const products = (
      await crawlPingoDoceCategory(category, {
        maxPages: opts.maxPages,
        onProgress: opts.onProgress,
      })
    ).filter((p) => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });
    results.push({ category, products });
  }
  return results;
}
