import { scrapeContinente } from "../continente";
import { fetchHtml, HttpError } from "../http";
import type { SearchHit } from "../search/types";
import type { CategoryResult, CrawlProgress } from "./types";

/**
 * The COMPLIANT Continente crawler: one request per product page.
 *
 * Continente's robots.txt disallows the listing-grid parameters the fast
 * crawler uses (`/*?cgid`, `/*?start=`, `/*?sz`) and points crawlers at its
 * sitemap instead. This route obeys that: product URLs come from the sitemap it
 * advertises, and each product is read from its own page, which nothing in
 * robots.txt forbids.
 *
 * The trade is stark and worth stating plainly:
 *
 *   fast crawler        562 requests, ~14 min, 35 products per request
 *   this one         ~17,000 requests, ~5 hours, 1 product per request
 *
 * In exchange it returns MORE per product - the barcode and package size, which
 * listing tiles never carry - so a pass here does the work of a crawl and an
 * enrichment at once. It is also resumable by construction: the caller decides
 * which products to fetch, so a daily budget can refresh the stalest slice and
 * still make deterministic progress through the catalogue.
 *
 * DB-free like the other crawlers: the caller chooses the targets, this fetches
 * them, the runner persists.
 */

/**
 * Sitemap files Continente advertises in its robots.txt.
 *
 * Overridable so the failure path can actually be exercised. "What happens when
 * the sitemap is unreachable?" is a question with a real answer - discovery is
 * skipped and the price refresh continues - and an answer nobody would ever
 * check if testing it meant waiting for a genuine outage.
 */
function sitemapIndexUrl(): string {
  // Read per call, not at import: a module-level constant is fixed before any
  // test can set the variable, which silently sends the "offline" test to the
  // live site instead - measured, it fetched all six real sitemaps.
  return process.env.CONTINENTE_SITEMAP_URL ?? "https://www.continente.pt/sitemap_index.xml";
}

export interface ProductTarget {
  storeProductId: string;
  url: string;
}

/** A page that told us the product is gone. */
export interface DeadProduct {
  storeProductId: string;
  url: string;
  reason: string;
}

/** A page that answered, for a real product we do not track. */
export interface NonFoodProduct {
  storeProductId: string;
  url: string;
  name: string;
  categoryPath: string | null;
}

export interface ProductCrawlResult {
  /** grouped by the top segment of each product's own category path */
  results: CategoryResult[];
  fetched: number;
  /**
   * Pages that said the product is gone: delisted, and about half the sitemap.
   * Returned as data rather than a count because each one is evidence about a
   * specific product - it advances that product's delisting counter and, for a
   * never-seen id, settles what it is once and for all.
   */
  dead: DeadProduct[];
  /** products whose category is not one we treat as food */
  nonFood: NonFoodProduct[];
  /**
   * Failures we could NOT interpret - a 5xx, a socket error, anything that
   * means "we could not tell" rather than "it is gone". Kept apart from `dead`
   * because counting them as delistings would let one bad night mark thousands
   * of live products as discontinued.
   */
  unreachable: DeadProduct[];
}

/**
 * The product id a Continente URL ends with: `...-2597619.html` gives
 * `2597619`.
 *
 * Not every id is numeric, which cost us 170 of the 101,398 published URLs when
 * this only matched digits. Variant SKUs append a suffix and percent-encode the
 * separating hyphen so the id survives (`...-glade-4505195%2D1.html` is
 * `4505195-1`), and curated products carry a word id (`...-t%C3%A1bua1.html` is
 * `tábua1`). Taking the last hyphen-separated segment and decoding it handles
 * all three, and matches the id the listing tiles report for the same products.
 */
export function productIdFromUrl(url: string): string | null {
  const tail = url.match(/-([^-/]+)\.html$/)?.[1];
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

export interface SitemapResult {
  /** every published product URL, keyed by the id embedded in it */
  urls: Map<string, string>;
  /**
   * How many product sitemap FILES the index listed - six, at the time of
   * writing.
   *
   * Recorded separately from the address count because it catches what the
   * count cannot. The files need not be equally sized, so if the index stopped
   * listing a small one, the addresses might drop by less than the 5% that
   * makes a shrunken sitemap suspicious, and nothing would notice. "Six files
   * yesterday, five today" is unambiguous whatever their sizes - and unlike the
   * address count it means something on a first run too, since an index
   * listing zero product files is wrong on its face.
   */
  files: number;
}

/**
 * Every product URL Continente publishes, keyed by the id embedded in the URL
 * (`...-2597619.html`). Six requests.
 *
 * A superset, not a statement of what exists: measured, ~42,000 of the ~101,000
 * entries are delisted products whose pages return nothing. It is reliable for
 * re-finding products we already know about, and unreliable as a census.
 *
 * All the files or none: one that fails throws rather than returning a partial
 * set, because five files of six looks exactly like a smaller shop, and the
 * caller would read a sixth of the catalogue as no longer published.
 */
export async function discoverProductUrls(): Promise<SitemapResult> {
  const index = await fetchHtml(sitemapIndexUrl());
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.includes("product"));

  const urls = new Map<string, string>();
  for (const map of maps) {
    const xml = await fetchHtml(map);
    for (const entry of xml.matchAll(/<loc>(https:\/\/www\.continente\.pt\/produto\/[^<]+)<\/loc>/g)) {
      const id = productIdFromUrl(entry[1]);
      if (id) urls.set(id, entry[1]);
    }
  }
  return { urls, files: maps.length };
}

/** Top segment of a category path ("Frescos/Frutas/..." gives "Frescos"). */
function topSection(path: string | null): string {
  return path?.split("/")[0].trim() || "(sem categoria)";
}

/**
 * Fetch each target's product page and build catalogue rows from it.
 *
 * `isFood` decides what to keep. The caller supplies it because this crawler is
 * also how NEW products get classified: a product we have never seen has no
 * stored category, and its own page is the only place to learn one.
 */
export async function fetchProducts(
  targets: ProductTarget[],
  opts: {
    isFood: (categoryPath: string | null) => boolean;
    onProgress?: (p: CrawlProgress) => void;
    /**
     * Called with each batch of food products as it is collected, so a long run
     * can be saved as it goes. A full Continente pass takes about five hours,
     * and holding all of it until the end means a dropped connection at hour
     * four loses the night.
     */
    onBatch?: (products: SearchHit[]) => Promise<void>;
    /** products per `onBatch` call */
    batchSize?: number;
  }
): Promise<ProductCrawlResult> {
  const bySection = new Map<string, SearchHit[]>();
  const dead: DeadProduct[] = [];
  const nonFood: NonFoodProduct[] = [];
  const unreachable: DeadProduct[] = [];
  const batchSize = opts.batchSize ?? 500;
  let pending: SearchHit[] = [];
  let fetched = 0;

  const flush = async () => {
    if (pending.length === 0 || !opts.onBatch) return;
    await opts.onBatch(pending);
    pending = [];
  };

  for (const [i, target] of targets.entries()) {
    let product;
    try {
      product = await scrapeContinente(target.url);
    } catch (error) {
      const err = error as Error;
      // A 404, or a page that loaded with no product data on it, both mean the
      // store no longer sells this - roughly half of the sitemap's unseen
      // entries are in that state. Anything else means we could not tell, and
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
    if (!opts.isFood(product.categoryPath)) {
      nonFood.push({
        storeProductId: target.storeProductId,
        url: target.url,
        name: product.name,
        categoryPath: product.categoryPath,
      });
      continue;
    }

    const section = topSection(product.categoryPath);
    const hit: SearchHit = {
      id: target.storeProductId,
      name: product.name,
      price: product.price,
      brand: product.brand || "Continente",
      category: product.categoryPath ?? "",
      url: target.url,
      // The point of paying a request per product: the page carries what no
      // listing tile does. Set even when null, because here null means "this
      // page has no barcode", not "this source could not know".
      ean: product.ean,
      packageSize: product.packageSize,
      unit: product.packageUnit,
    };
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
    dead,
    nonFood,
    unreachable,
  };
}
