import { fetchHtml } from "../http";
import { parseAuchanTiles } from "../search/auchan";
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
const PAGE_SIZE = 64; // Auchan caps the grid at ~64/page

/** First segment of a category path ("produtos-frescos/talho/..." -> "produtos-frescos"). */
function topSegment(category: string): string {
  return category.split(/[/>]/)[0].trim() || "(empty)";
}

export interface AuchanCrawlResult {
  /** food products grouped by their top-segment department, deduped */
  food: CategoryResult[];
  /** every top segment seen mapped to its distinct product count (food + non-food) */
  segmentTally: Map<string, number>;
}

export async function crawlAuchan(
  opts: { maxPages?: number; onProgress?: (p: CrawlProgress) => void } = {}
): Promise<AuchanCrawlResult> {
  const seen = new Set<string>();
  const segmentTally = new Map<string, number>();
  const foodBySegment = new Map<string, SearchHit[]>();

  for (let page = 0; opts.maxPages === undefined || page < opts.maxPages; page++) {
    const start = page * PAGE_SIZE;
    const html = await fetchHtml(`${GRID_URL}?cgid=root&start=${start}&sz=${PAGE_SIZE}`);
    const tiles = parseAuchanTiles(html);
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
    if (tiles.length < PAGE_SIZE) break; // short page: the last one
  }

  const food: CategoryResult[] = [...foodBySegment.entries()].map(([segment, products]) => ({
    category: { cgid: segment, label: segment },
    products,
  }));

  return { food, segmentTally };
}
