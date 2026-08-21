import { scrapeContinente } from "../continente";
import { fetchHtml } from "../http";
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

/** Sitemap files Continente advertises in its robots.txt. */
const SITEMAP_INDEX = "https://www.continente.pt/sitemap_index.xml";

export interface ProductTarget {
  storeProductId: string;
  url: string;
}

export interface ProductCrawlResult {
  /** grouped by the top segment of each product's own category path */
  results: CategoryResult[];
  fetched: number;
  /** pages that returned no product data: delisted, and about half the sitemap */
  dead: number;
  /** products whose category is not one we treat as food */
  nonFood: number;
  failures: string[];
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

/**
 * Every product URL Continente publishes, keyed by the id embedded in the URL
 * (`...-2597619.html`). Six requests.
 *
 * A superset, not a statement of what exists: measured, ~42,000 of the ~101,000
 * entries are delisted products whose pages return nothing. It is reliable for
 * re-finding products we already know about, and unreliable as a census.
 */
export async function discoverProductUrls(): Promise<Map<string, string>> {
  const index = await fetchHtml(SITEMAP_INDEX);
  const maps = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((u) => u.includes("product"));

  const byId = new Map<string, string>();
  for (const map of maps) {
    const xml = await fetchHtml(map);
    for (const entry of xml.matchAll(/<loc>(https:\/\/www\.continente\.pt\/produto\/[^<]+)<\/loc>/g)) {
      const id = productIdFromUrl(entry[1]);
      if (id) byId.set(id, entry[1]);
    }
  }
  return byId;
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
  }
): Promise<ProductCrawlResult> {
  const bySection = new Map<string, SearchHit[]>();
  const failures: string[] = [];
  let fetched = 0;
  let dead = 0;
  let nonFood = 0;

  for (const [i, target] of targets.entries()) {
    let product;
    try {
      product = await scrapeContinente(target.url);
    } catch (error) {
      // A page with no product data is the normal signal for a delisted
      // product, not an error worth stopping for - roughly half of the
      // sitemap's unseen entries are in that state.
      dead++;
      if (failures.length < 10) {
        failures.push(`${target.storeProductId}: ${(error as Error).message.slice(0, 80)}`);
      }
      continue;
    }

    fetched++;
    if (!opts.isFood(product.categoryPath)) {
      nonFood++;
      continue;
    }

    const section = topSection(product.categoryPath);
    const list = bySection.get(section) ?? [];
    list.push({
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
    });
    bySection.set(section, list);

    if ((i + 1) % 100 === 0) {
      opts.onProgress?.({
        category: { cgid: "produtos", label: "product pages" },
        page: i + 1,
        collected: fetched,
      });
    }
  }

  return {
    results: [...bySection.entries()].map(([section, products]) => ({
      category: { cgid: section, label: section },
      products,
    })),
    fetched,
    dead,
    nonFood,
    failures,
  };
}
