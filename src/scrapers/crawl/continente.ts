import { fetchHtml } from "../http";
import { parseContinenteTiles } from "../search/continente";
import type { SearchHit } from "../search/types";
import { CONTINENTE_FOOD_CATEGORIES } from "./continente-categories";
import type { CategoryResult, CrawlCategory, CrawlProgress } from "./types";

/**
 * Catalogue crawler for Continente. Walks a food category's grid endpoint page
 * by page and returns the deduplicated products. Deliberately DB-free - it
 * fetches and parses; the runner script persists - mirroring how the search
 * extractors return `SearchHit[]` for a caller to store.
 */

const GRID_URL =
  "https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid";
const PAGE_SIZE = 35; // Continente clamps `sz` to 35 whatever we ask; walk `start`

/**
 * Fetch every product in one category. Pages `start` by 35 until a page brings
 * nothing new (wrapped onto already-seen results) or comes up short (the last
 * page). `maxPages` caps the walk - used to smoke-test against a handful of
 * requests without pulling a whole 5,000-product section.
 */
export async function crawlContinenteCategory(
  category: CrawlCategory,
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<SearchHit[]> {
  const byId = new Map<string, SearchHit>();

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const html = await fetchHtml(
      `${GRID_URL}?cgid=${encodeURIComponent(category.cgid)}&start=${start}&sz=${PAGE_SIZE}`
    );
    const hits = parseContinenteTiles(html);
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
    const products = (
      await crawlContinenteCategory(category, {
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
