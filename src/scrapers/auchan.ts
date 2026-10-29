import { parseSize } from "../lib/sizes";
import { extractLdJsonBlocks, fetchHtml, HttpError } from "./http";
import { PageReadError, sellablePrice, validDateOrNull, type ScrapeResult } from "./types";

interface SchemaProduct {
  "@type"?: string;
  name?: string;
  gtin?: string;
  brand?: { name?: string };
  offers?: { price?: string | number; priceValidUntil?: string; availability?: string };
}

/**
 * What a product page says about a product the grid walk did not see.
 *
 *   alive       the page answers and the product is IN STOCK - live, just absent
 *               from the grid we walked (a hole in the walk).
 *   unavailable the page answers and the offer says OutOfStock, or carries no
 *               price at all (since 29 October 2026). Listed, not
 *               sellable, not gone. Measured against the live site: out-of-stock
 *               products usually KEEP their price and flip `availability`, so the
 *               signal is availability, not a missing price. Its grid tile is
 *               skipped too, so the walk always misses it.
 *   gone        404/410, or 200 with Auchan's own "not found" page - the store
 *               no longer has this product.
 *   unreachable a 5xx, a network error, or a page with no Product block at all -
 *               we could not tell, so no claim is made. Auchan's fresh /
 *               variable-weight pages carry no structured product data and land
 *               here; that they are re-checked each night rather than throttled
 *               is a known, small residual.
 */
export type AuchanPageStatus = "alive" | "unavailable" | "gone" | "unreachable";

/** Auchan's own "not found" page, served with 200 for a withdrawn product. */
const NOT_FOUND_PAGE = /N[ãa]o temos o que procura/i;

/** schema.org availability values that mean "listed but not sellable right now". */
const NOT_SELLABLE = /OutOfStock|SoldOut|Discontinued|BackOrder|PreOrder/i;

/**
 * The status decision for a page that LOADED, split out so it can be tested from
 * saved HTML without a request.
 *
 * Keys on `offers.availability`, verified against the live site: an out-of-stock
 * product keeps a price in its ld+json and only flips availability to
 * OutOfStock, so a price-presence test both misses it and mislabels it "alive".
 * "No Product block at all" is unreachable, not gone: a 200 with no product data
 * is a fresh-produce template or a markup change, not proof of withdrawal -
 * with one exception. Auchan answers a withdrawn product with 200 and its own
 * "not found" page, "Não temos o que procura. Vamos tentar de novo?", instead
 * of a 404. Read on 18 October 2026 from two saved pages: 540 of 600 products
 * missing from the walk got this page, and being "unreachable" they were never
 * counted as gone, which kept about 470 withdrawn products "on sale" since
 * August. That page is a fact, like a 404, so it is "gone".
 */
export function auchanStatusFromHtml(html: string): "alive" | "unavailable" | "gone" | "unreachable" {
  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" && block !== null && (block as SchemaProduct)["@type"] === "Product"
  );
  if (!product) return NOT_FOUND_PAGE.test(html) ? "gone" : "unreachable";
  // A page with no price at all is not for sale online, whatever its
  // availability says: 4 of 5 such pages opened on 29 October 2026 said
  // InStock, with an empty price box (assumption 4.26). With no online price we
  // take the store as not selling it (the user's rule, 29 October 2026).
  if (!hasPrice(product)) return "unavailable";
  return NOT_SELLABLE.test(String(product.offers?.availability ?? "")) ? "unavailable" : "alive";
}

function hasPrice(product: SchemaProduct): boolean {
  const price = product.offers?.price;
  return price !== undefined && price !== null && String(price).trim() !== "";
}

/** The barcode in a product page's structured data (`gtin`), or null. */
export function auchanBarcodeFromHtml(html: string): string | null {
  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" && block !== null && (block as SchemaProduct)["@type"] === "Product"
  );
  return product?.gtin ?? null;
}

/**
 * Fetch a product page and classify it, for phase 2's confirm-the-missing pass.
 * Lighter than `scrapeAuchan` - it needs only the verdict, not the full result -
 * and, unlike `scrapeAuchan`, it distinguishes "listed but unavailable" from
 * "could not tell", which is what stops out-of-stock products being re-fetched
 * every night.
 *
 * Also the page's barcode, which the listing tiles never carry. The page is
 * read anyway, so keeping it costs nothing; until 22 October 2026 it was
 * thrown away, about 600 pages a night.
 */
export async function classifyAuchanPage(url: string): Promise<{ status: AuchanPageStatus; barcode: string | null }> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return { status: "gone", barcode: null };
    return { status: "unreachable", barcode: null };
  }
  return { status: auchanStatusFromHtml(html), barcode: auchanBarcodeFromHtml(html) };
}

export async function scrapeAuchan(url: string): Promise<ScrapeResult> {
  return parseAuchanPage(await fetchHtml(url), url);
}

/** Reading a page, apart from fetching it, so it can be checked on a saved one. */
export function parseAuchanPage(html: string, url: string): ScrapeResult {
  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" &&
      block !== null &&
      (block as SchemaProduct)["@type"] === "Product"
  );

  if (!product) {
    throw new PageReadError(`Auchan: could not find product data at ${url}`);
  }

  const name = product.name ?? "";

  return {
    name,
    brand: product.brand?.name ?? null,
    // No price on the page: listed, not for sale online (auchanStatusFromHtml).
    // Until 29 October 2026 such a page was unreadable and the product never saved.
    price: hasPrice(product) ? sellablePrice(Number(product.offers?.price)) : null,
    ean: product.gtin ?? null,
    categoryPath: null,
    // Auchan writes the size into the product name itself - "BACON EXTRA CUBOS
    // AUCHAN 2X75G" - and does so for 86% of its catalogue, where Continente
    // and Pingo Doce do it for essentially none. So the name is the size
    // source here, and no separate label needs parsing.
    packageSize: parseSize(name)?.total ?? null,
    packageUnit: parseSize(name)?.unit ?? null,
    ...parsePromotion(product.offers?.priceValidUntil),
    // Not read here: Auchan's nightly takes the store's per-kilo figure from its
    // listing tiles, and which figure on this page is the product's own (not a
    // carousel's) has not been checked.
    shownUnitPrice: null,
  };
}

/**
 * Auchan's only usable promotion signal is `priceValidUntil` in the ld+json
 * offer: present while a promotion runs, absent otherwise.
 *
 * The obvious-looking alternatives are decoys - the `promo-label`,
 * `promo-badges` and `promo-details` class names appear byte-identically on
 * promoted and unpromoted pages, because those containers are empty in the
 * server HTML and filled client-side. Auchan never publishes the pre-promotion
 * price at all, hence `regularPrice: null`.
 */
function parsePromotion(priceValidUntil: string | undefined): Pick<
  ScrapeResult,
  "onPromotion" | "regularPrice" | "promoEndsAt"
> {
  const promoEndsAt = validDateOrNull(priceValidUntil);
  // an end date already in the past is not a running promotion
  if (promoEndsAt === null || promoEndsAt.getTime() < Date.now() - 86_400_000) {
    return { onPromotion: false, regularPrice: null, promoEndsAt: null };
  }
  return { onPromotion: true, regularPrice: null, promoEndsAt };
}
