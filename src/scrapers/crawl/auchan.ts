import { fetchHtml } from "../http";
import { parseAuchanTiles, parseAuchanTotal } from "../search/auchan";
import type { SearchHit } from "../search/types";
import { isFoodSegment } from "./auchan-categories";
import type { CategoryResult, CrawlProgress } from "./types";

/**
 * Catalogue crawler for Auchan. Unlike the other two stores, Auchan is not
 * crawled by category: its top-level ids do not aggregate their descendants and
 * its tree is JS-rendered, so no category list can be made provably complete.
 * Instead we pull the whole catalogue from `cgid=root` and keep the food by each
 * product's own category path (its top segment names its department). This gives
 * complete food coverage without navigating the tree. DB-free; the runner
 * persists.
 */

const GRID_URL =
  "https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-UpdateGrid";
/**
 * The grid fragment carries no product counter, so the first page is taken from
 * the full search page, which does. It serves the same tiles, at the cost of a
 * heavier response once per crawl.
 */
const SHOW_URL =
  "https://www.auchan.pt/on/demandware.store/Sites-AuchanPT-Site/pt_PT/Search-Show";
/**
 * Auchan honours `sz` far past the ~64 first assumed - measured, asking for 200
 * returns 200 tiles - which cuts the whole-catalogue walk from ~858 requests to
 * ~275. Not raised further: sz=500 also works but took 22 s against 1.2 s for
 * 200, so it is asking too much of them for no gain, since the bytes per product
 * are the same either way and only the per-request delay is saved.
 */
const PAGE_SIZE = 200;

/** First segment of a category path ("produtos-frescos/talho/..." -> "produtos-frescos"). */
function topSegment(category: string): string {
  return category.split(/[/>]/)[0].trim() || "(empty)";
}

export interface AuchanCrawlResult {
  /** food products grouped by their top-segment department, deduped */
  food: CategoryResult[];
  /** every top segment seen mapped to its distinct product count (food + non-food) */
  segmentTally: Map<string, number>;
  /** distinct products walked, food and non-food together */
  crawled: number;
  /**
   * Size of the whole catalogue as Auchan reports it. Because this crawl walks
   * `root` rather than per-department ids, the count is catalogue-wide - it
   * proves the walk was complete, but says nothing about any one department.
   */
  expected: number | null;
}

export async function crawlAuchan(
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<AuchanCrawlResult> {
  const seen = new Set<string>();
  const segmentTally = new Map<string, number>();
  const foodBySegment = new Map<string, SearchHit[]>();
  let expected: number | null = null;

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const html = await fetchHtml(
      page === 0
        ? `${SHOW_URL}?cgid=root&start=0&sz=${PAGE_SIZE}`
        : `${GRID_URL}?cgid=root&start=${start}&sz=${PAGE_SIZE}`
    );
    const tiles = parseAuchanTiles(html);
    if (page === 0) expected = parseAuchanTotal(html);
    if (tiles.length === 0) break; // ran off the end of the catalogue

    let fresh = 0;
    for (const tile of tiles) {
      if (seen.has(tile.id)) continue;
      seen.add(tile.id);
      fresh++;

      const segment = topSegment(tile.category);
      segmentTally.set(segment, (segmentTally.get(segment) ?? 0) + 1);
      if (isFoodSegment(segment)) {
        const list = foodBySegment.get(segment) ?? [];
        list.push(tile);
        foodBySegment.set(segment, list);
      }
    }
    opts.onProgress?.({
      category: { cgid: "root", label: "root" },
      page: page + 1,
      collected: seen.size,
    });

    if (fresh === 0) break; // pagination wrapped onto already-seen products

    if (expected !== null) {
      // Drive pagination from Auchan's own count. A page of 64 tiles need not
      // parse to 64 products, so ending on a short page cuts the walk off early
      // - that bug cost more than half the Pingo Doce catalogue.
      if (start + PAGE_SIZE >= expected) break;
    } else if (tiles.length < PAGE_SIZE) {
      break; // no published count to steer by: fall back to the short page
    }
  }

  const food: CategoryResult[] = [...foodBySegment.entries()].map(([segment, products]) => ({
    category: { cgid: segment, label: segment },
    products,
  }));

  return { food, segmentTally, crawled: seen.size, expected };
}
