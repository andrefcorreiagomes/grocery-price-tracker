import { fetchHtml } from "../http";
import { parseAuchanTiles, parseAuchanTotal } from "../search/auchan";
import type { SearchHit } from "../search/types";
import { discoverFoodDepartments, isFoodSegment } from "./auchan-categories";
import type { CategoryResult, CrawlCategory, CrawlProgress } from "./types";

/**
 * Catalogue crawler for Auchan, in two modes.
 *
 * Auchan serves roughly 13 products per second no matter how it is asked -
 * measured across page sizes 200/500/1000 and offsets from 0 to 38,000, all
 * within 13.0-13.5/sec. Page size, pagination offset and price filters make no
 * difference. So the ONLY thing that makes a crawl faster is fetching fewer
 * products, which is what the mode chooses:
 *
 * - "root" walks `cgid=root`, the whole 54,859-product catalogue, and keeps food
 *   by each product's own category path. Provably complete; ~70 minutes.
 * - "departments" walks only the five food department ids. ~23 minutes.
 *
 * Departments are faster but not provably complete: those ids are curated
 * collections, and measured against a root walk they omit products Auchan itself
 * labels as food (`Congelados_2026` reported 1,146 where root found 1,208).
 * Running one mode and then the other is therefore the completeness audit -
 * both upsert into the same table by (store, storeProductId), so what a
 * departments run missed is exactly what a following root run adds.
 *
 * Everything below the fetch is shared by both modes: tile parsing, the food
 * whitelist, run-wide dedup, the segment tally. DB-free; the runner persists.
 */

const GRID_URL =
  "https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid";
/**
 * The grid fragment carries no product counter, so each walk's first page is
 * taken from the full search page, which does. It serves the same tiles, at the
 * cost of a heavier response once per category.
 */
const SHOW_URL =
  "https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-Show";
/**
 * Auchan honours `sz` far past the ~64 first assumed. 200 is not chosen for
 * speed - throughput is flat at ~13 products/sec from 200 to 1000 - but for
 * responses that stay near 2.5 MB instead of 12 MB, so a retry re-fetches
 * something small and memory stays modest.
 */
const PAGE_SIZE = 200;

/** How many example products to keep per segment, for judging what gets dropped. */
const SAMPLES_PER_SEGMENT = 5;

export type AuchanCrawlMode = "root" | "departments";

/**
 * Ordinary runs take the fast path. `root` is run deliberately, when
 * completeness is being checked rather than assumed.
 */
export const DEFAULT_AUCHAN_MODE: AuchanCrawlMode = "departments";

/** First segment of a category path ("produtos-frescos/talho/..." -> "produtos-frescos"). */
function topSegment(category: string): string {
  return category.split(/[/>]/)[0].trim() || "(empty)";
}

/** What one category walk returned, for the runner's coverage report. */
export interface AuchanWalkSummary {
  label: string;
  cgid: string;
  /** the count that category published for itself, when it published one */
  expected: number | null;
  /** distinct products the walk returned */
  fetched: number;
  /** how many of those were new to this run (the rest were cross-listed) */
  added: number;
}

export interface AuchanCrawlResult {
  mode: AuchanCrawlMode;
  /** food products grouped by their top-segment department, deduped */
  food: CategoryResult[];
  /** every top segment seen mapped to its distinct product count (food + non-food) */
  segmentTally: Map<string, number>;
  /** a few example product names per segment, so dropped segments can be judged */
  segmentSamples: Map<string, string[]>;
  /** distinct products walked, food and non-food together */
  crawled: number;
  /** one entry per category walked: `root`, or the five departments */
  walks: AuchanWalkSummary[];
  /** department slugs whose id could not be read (departments mode only) */
  failedDepartments: string[];
}

/**
 * Walk one category id to its end, returning its distinct products. Pagination
 * runs against the count the category publishes for itself; the short-page rule
 * is only a fallback, because a full page of tiles need not parse to a full page
 * of products and stopping there truncates the crawl.
 *
 * Dedup here is per-walk, used only to detect pagination wrapping. Run-wide
 * dedup happens in the caller, so that a department made mostly of products
 * already seen elsewhere still gets walked to its end.
 */
async function walkCategory(
  category: CrawlCategory,
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void }
): Promise<{ products: SearchHit[]; expected: number | null }> {
  const byId = new Map<string, SearchHit>();
  let expected: number | null = null;

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const cgid = encodeURIComponent(category.cgid);
    const html = await fetchHtml(
      page === 0
        ? `${SHOW_URL}?cgid=${cgid}&start=0&sz=${PAGE_SIZE}`
        : `${GRID_URL}?cgid=${cgid}&start=${start}&sz=${PAGE_SIZE}`
    );
    const tiles = parseAuchanTiles(html);
    if (page === 0) expected = parseAuchanTotal(html);
    if (tiles.length === 0) break; // ran off the end

    let fresh = 0;
    for (const tile of tiles) {
      if (byId.has(tile.id)) continue;
      byId.set(tile.id, tile);
      fresh++;
    }
    opts.onProgress?.({ category, page: page + 1, collected: byId.size });

    if (fresh === 0) break; // pagination wrapped onto already-seen products

    if (expected !== null) {
      if (start + PAGE_SIZE >= expected) break;
    } else if (tiles.length < PAGE_SIZE) {
      break; // no published count to steer by: fall back to the short page
    }
  }

  return { products: [...byId.values()], expected };
}

export async function crawlAuchan(
  opts: {
    mode?: AuchanCrawlMode;
    maxPages?: number;
    onProgress?: (p: CrawlProgress) => void;
  } = {}
): Promise<AuchanCrawlResult> {
  const mode = opts.mode ?? DEFAULT_AUCHAN_MODE;

  let categories: CrawlCategory[];
  let failedDepartments: string[] = [];
  if (mode === "root") {
    categories = [{ cgid: "root", label: "catálogo (root)" }];
  } else {
    const discovered = await discoverFoodDepartments();
    categories = discovered.departments;
    failedDepartments = discovered.failed;
  }

  const seen = new Set<string>();
  const segmentTally = new Map<string, number>();
  const segmentSamples = new Map<string, string[]>();
  const foodBySegment = new Map<string, SearchHit[]>();
  const walks: AuchanWalkSummary[] = [];

  for (const category of categories) {
    const { products, expected } = await walkCategory(category, opts);

    let added = 0;
    for (const tile of products) {
      if (seen.has(tile.id)) continue; // cross-listed in a department already walked
      seen.add(tile.id);
      added++;

      const segment = topSegment(tile.category);
      segmentTally.set(segment, (segmentTally.get(segment) ?? 0) + 1);

      const samples = segmentSamples.get(segment) ?? [];
      if (samples.length < SAMPLES_PER_SEGMENT) {
        samples.push(tile.name);
        segmentSamples.set(segment, samples);
      }

      // The whitelist applies in both modes: a department page carries some
      // cross-listed non-food, judged here by the product's own category path.
      if (isFoodSegment(segment)) {
        const list = foodBySegment.get(segment) ?? [];
        list.push(tile);
        foodBySegment.set(segment, list);
      }
    }

    walks.push({
      label: category.label,
      cgid: category.cgid,
      expected,
      fetched: products.length,
      added,
    });
  }

  const food: CategoryResult[] = [...foodBySegment.entries()].map(([segment, products]) => ({
    category: { cgid: segment, label: segment },
    products,
  }));

  return {
    mode,
    food,
    segmentTally,
    segmentSamples,
    crawled: seen.size,
    walks,
    failedDepartments,
  };
}
