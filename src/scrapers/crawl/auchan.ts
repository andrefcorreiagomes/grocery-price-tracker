import { fetchHtml } from "../http";
import { parseAuchanTilesDetailed, parseAuchanTotal, type TileParse } from "../search/auchan";
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
  /**
   * Food products grouped by their top-segment department, deduped. Empty when
   * the crawl streamed to an `onBatch` handler rather than accumulating - the
   * nightly run persists as it goes and never holds the whole catalogue.
   */
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

  // Grid-health figures, threaded out so the nightly run can fail on a parser
  // that broke silently. See TileParse for why each matters.
  /** `[data-gtm]` tiles encountered across every page */
  tilesSeen: number;
  /** of those, how many parsed to a usable product */
  tilesKept: number;
  /** well-formed tiles carrying no price: out of stock, skipped, benign */
  tilesUnpriced: number;
  /** tiles broken in a way a healthy grid never is - the tile-yield alarm's numerator */
  tilesMalformed: number;
  /** tiles that parsed but carried no category, so were dropped as non-food */
  withoutCategory: number;
  /** the store's own published counts summed across the walk(s), for the truncated-walk brake */
  publishedTotal: number;
}

/**
 * Walk one category id to its end, handing each page's parse to `onPage`.
 * Pagination runs against the count the category publishes for itself; the
 * short-page rule is only a fallback, because a full page of tiles need not
 * parse to a full page of products and stopping there truncates the crawl.
 *
 * Dedup HERE is per-walk, used only to detect pagination wrapping, and its size
 * is returned as `distinct`. Run-wide dedup, the food filter and any streaming
 * happen in `onPage`, so that a department made mostly of products already seen
 * elsewhere still gets walked to its end.
 */
async function walkCategory(
  category: CrawlCategory,
  opts: {
    maxPages?: number;
    onProgress?: (p: CrawlProgress) => void;
    onPage: (parse: TileParse) => void | Promise<void>;
  }
): Promise<{ expected: number | null; distinct: number }> {
  const seenIds = new Set<string>();
  let expected: number | null = null;

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const cgid = encodeURIComponent(category.cgid);
    const html = await fetchHtml(
      page === 0
        ? `${SHOW_URL}?cgid=${cgid}&start=0&sz=${PAGE_SIZE}`
        : `${GRID_URL}?cgid=${cgid}&start=${start}&sz=${PAGE_SIZE}`
    );
    const parse = parseAuchanTilesDetailed(html);
    if (page === 0) expected = parseAuchanTotal(html);

    // Emit BEFORE the end-of-catalogue break, so a page that parsed nothing
    // because every tile was discarded still reaches the tile-yield monitor
    // rather than looking like the natural end of the walk.
    await opts.onPage(parse);
    if (parse.hits.length === 0) break; // ran off the end (or the whole page failed to parse)

    let fresh = 0;
    for (const tile of parse.hits) {
      if (seenIds.has(tile.id)) continue;
      seenIds.add(tile.id);
      fresh++;
    }
    opts.onProgress?.({ category, page: page + 1, collected: seenIds.size });

    if (fresh === 0) break; // pagination wrapped onto already-seen products

    if (expected !== null) {
      if (start + PAGE_SIZE >= expected) break;
    } else if (parse.hits.length < PAGE_SIZE) {
      break; // no published count to steer by: fall back to the short page
    }
  }

  return { expected, distinct: seenIds.size };
}

export async function crawlAuchan(
  opts: {
    mode?: AuchanCrawlMode;
    maxPages?: number;
    onProgress?: (p: CrawlProgress) => void;
    /**
     * Called with each page's food products, grouped by segment, as the walk
     * proceeds. When present the crawl streams and holds nothing: `food` in the
     * result is empty and the caller (the nightly writer) owns persistence. When
     * absent the products accumulate into `food`, for the one-shot script.
     */
    onBatch?: (products: SearchHit[], segment: string) => void | Promise<void>;
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

  let tilesSeen = 0;
  let tilesKept = 0;
  let tilesUnpriced = 0;
  let tilesMalformed = 0;
  let withoutCategory = 0;
  let publishedTotal = 0;

  for (const category of categories) {
    let added = 0;

    const { expected, distinct } = await walkCategory(category, {
      maxPages: opts.maxPages,
      onProgress: opts.onProgress,
      onPage: async (parse) => {
        tilesSeen += parse.seen;
        tilesKept += parse.hits.length;
        tilesUnpriced += parse.unpriced;
        tilesMalformed += parse.malformed;
        withoutCategory += parse.withoutCategory;

        // This page's food, grouped by segment, for streaming.
        const freshFood = new Map<string, SearchHit[]>();

        for (const tile of parse.hits) {
          if (seen.has(tile.id)) continue; // cross-listed, or a page overlap
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
          if (!isFoodSegment(segment)) continue;

          if (opts.onBatch) {
            const list = freshFood.get(segment) ?? [];
            list.push(tile);
            freshFood.set(segment, list);
          } else {
            const list = foodBySegment.get(segment) ?? [];
            list.push(tile);
            foodBySegment.set(segment, list);
          }
        }

        if (opts.onBatch) {
          for (const [segment, list] of freshFood) await opts.onBatch(list, segment);
        }
      },
    });

    if (expected !== null) publishedTotal += expected;

    walks.push({
      label: category.label,
      cgid: category.cgid,
      expected,
      fetched: distinct,
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
    tilesSeen,
    tilesKept,
    tilesUnpriced,
    tilesMalformed,
    withoutCategory,
    publishedTotal,
  };
}
