import { scrapePingoDoce } from "../pingodoce";
import { HttpError } from "../http";
import type { SearchHit } from "../search/types";
import type { CategoryResult, CrawlProgress } from "./types";
import type { PingoDoceProductUrl } from "./pingodoce-sitemap";

/**
 * The COMPLIANT Pingo Doce crawler: one request per product page.
 *
 * Pingo Doce's listing grids fall under four robots.txt rules
 * (`/on/demandware.store/`, `?cgid=`, `?start=`, `?sz=`), so the grid crawler
 * that `pingodoce.ts` once was has been replaced; see the notes there and in
 * `pingodoce-sitemap.ts`. This route uses the sitemap Pingo Doce advertises and
 * then each product's own page, neither of which is disallowed.
 *
 * The cost, measured:
 *
 *   listing grids      ~30 requests, ~2 min, 500 products per request, disallowed
 *   this one          9,059 requests, ~2.5 h, 1 product per request
 *
 * What it buys, beyond compliance:
 *
 *   - the PACK SIZE, which is the whole reason Pingo Doce cannot currently take
 *     part in a per-kilo comparison. Its grid tiles carry no size and its names
 *     almost never do: 29 of 7,191 products have one. The product page has it
 *     for essentially all of them.
 *   - roughly 1,900 food products the grid crawl never reached at all.
 *
 * No barcode: Pingo Doce publishes none anywhere, so its rows are matched on
 * brand, size and name. That is a store fact, not a gap in this crawler.
 *
 * DB-free like the other crawlers: the caller chooses the targets, this fetches
 * them, the runner persists.
 */

/** A page that told us the product is gone. */
export interface DeadProduct {
  storeProductId: string;
  url: string;
  reason: string;
}

/** A product whose page loaded but published no sellable price. */
export interface UnpricedProduct {
  storeProductId: string;
  url: string;
  name: string;
  categoryPath: string;
}

export interface PingoDoceCrawlResult {
  /** grouped by the top segment of each product's category path */
  results: CategoryResult[];
  fetched: number;
  /** how many of `fetched` carried a pack size - the point of the exercise */
  withSize: number;
  /** pages that said the product is gone (404/410, or no product data) */
  dead: DeadProduct[];
  /**
   * Pages that loaded a real product with no price. Kept as rows - the name,
   * size and category are all true and worth storing - but they carry
   * `price: null`, which `recordPrices` already skips and which the
   * cheapest-per-store query must exclude.
   */
  unpriced: UnpricedProduct[];
  /**
   * Failures we could NOT interpret - a 5xx, a socket error. Kept apart from
   * `dead` because counting them as delistings would let one bad night mark
   * thousands of live products as discontinued.
   */
  unreachable: DeadProduct[];
}

/** Top segment of a category path ("Talho/Porco" gives "Talho"). */
function topSection(path: string): string {
  return path.split("/")[0].trim() || "(sem categoria)";
}

/**
 * Fetch each target's product page and build catalogue rows from it.
 *
 * Unlike the Continente equivalent there is no `isFood` callback: Pingo Doce's
 * URLs carry their department, so `discoverPingoDoceProducts` has already
 * dropped non-food without spending a request on it. Anything reaching here is
 * food by construction.
 */
export async function fetchPingoDoceProducts(
  targets: PingoDoceProductUrl[],
  opts: {
    onProgress?: (p: CrawlProgress) => void;
    /**
     * Called with each batch as it is collected, so a long run is saved as it
     * goes. A full pass takes about two and a half hours, and holding all of it
     * until the end means a dropped connection at hour two loses the night.
     */
    onBatch?: (products: SearchHit[]) => Promise<void>;
    batchSize?: number;
  } = {}
): Promise<PingoDoceCrawlResult> {
  const bySection = new Map<string, SearchHit[]>();
  const dead: DeadProduct[] = [];
  const unpriced: UnpricedProduct[] = [];
  const unreachable: DeadProduct[] = [];
  const batchSize = opts.batchSize ?? 500;
  let pending: SearchHit[] = [];
  let fetched = 0;
  let withSize = 0;

  const flush = async () => {
    if (pending.length === 0 || !opts.onBatch) return;
    await opts.onBatch(pending);
    pending = [];
  };

  for (const [i, target] of targets.entries()) {
    let product;
    try {
      product = await scrapePingoDoce(target.url);
    } catch (error) {
      const err = error as Error;
      // A 404, or a page that loaded with no product data on it, both mean the
      // store no longer sells this. Anything else means we could not tell, and
      // must not be mistaken for a delisting.
      const gone = err instanceof HttpError ? err.status === 404 || err.status === 410 : true;
      (gone ? dead : unreachable).push({
        storeProductId: target.storeProductId,
        url: target.url,
        reason: err.message.slice(0, 100),
      });
      continue;
    }

    fetched++;
    if (product.packageSize !== null) withSize++;
    if (product.price === null) {
      unpriced.push({
        storeProductId: target.storeProductId,
        url: target.url,
        name: product.name,
        categoryPath: target.categoryPath,
      });
    }

    const hit: SearchHit = {
      id: target.storeProductId,
      name: product.name,
      price: product.price,
      brand: product.brand || "Pingo Doce",
      // From the URL, not the page: the breadcrumb gives the leaf alone.
      category: target.categoryPath,
      url: target.url,
      // The point of paying a request per product. Set even when null, because
      // here null means "this page has no size", not "this source could not
      // know" - which is what keeps a listing crawl from erasing it later.
      ean: product.ean,
      packageSize: product.packageSize,
      unit: product.packageUnit,
    };

    const section = topSection(target.categoryPath);
    const list = bySection.get(section) ?? [];
    list.push(hit);
    bySection.set(section, list);
    pending.push(hit);

    if (pending.length >= batchSize) await flush();

    if ((i + 1) % 100 === 0) {
      opts.onProgress?.({
        category: { cgid: "produtos", label: "product pages" },
        page: i + 1,
        collected: fetched,
      });
    }
  }

  await flush();

  return {
    results: [...bySection.entries()].map(([section, products]) => ({
      category: { cgid: section, label: section },
      products,
    })),
    fetched,
    withSize,
    dead,
    unpriced,
    unreachable,
  };
}
