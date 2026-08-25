import { parseSize } from "../lib/matching";
import { extractLdJsonBlocks, fetchHtml, HttpError } from "./http";
import { validDateOrNull, type ScrapeResult } from "./types";

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
 *   unavailable the page answers and the offer says OutOfStock. Listed, not
 *               sellable, not gone. Measured against the live site: out-of-stock
 *               products usually KEEP their price and flip `availability`, so the
 *               signal is availability, not a missing price. Its grid tile is
 *               skipped too, so the walk always misses it.
 *   gone        404/410 - the store no longer has this page.
 *   unreachable a 5xx, a network error, or a page with no Product block at all -
 *               we could not tell, so no claim is made. Auchan's fresh /
 *               variable-weight pages carry no structured product data and land
 *               here; that they are re-checked each night rather than throttled
 *               is a known, small residual.
 */
export type AuchanPageStatus = "alive" | "unavailable" | "gone" | "unreachable";

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
 * is a fresh-produce template or a markup change, not proof of withdrawal.
 */
export function auchanStatusFromHtml(html: string): "alive" | "unavailable" | "unreachable" {
  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" && block !== null && (block as SchemaProduct)["@type"] === "Product"
  );
  if (!product) return "unreachable";
  return NOT_SELLABLE.test(String(product.offers?.availability ?? "")) ? "unavailable" : "alive";
}

/**
 * Fetch a product page and classify it, for phase 2's confirm-the-missing pass.
 * Lighter than `scrapeAuchan` - it needs only the verdict, not the full result -
 * and, unlike `scrapeAuchan`, it distinguishes "listed but unavailable" from
 * "could not tell", which is what stops out-of-stock products being re-fetched
 * every night.
 */
export async function classifyAuchanPage(url: string): Promise<AuchanPageStatus> {
  let html: string;
  try {
    html = await fetchHtml(url);
  } catch (error) {
    if (error instanceof HttpError && (error.status === 404 || error.status === 410)) return "gone";
    return "unreachable";
  }
  return auchanStatusFromHtml(html);
}

export async function scrapeAuchan(url: string): Promise<ScrapeResult> {
  const html = await fetchHtml(url);

  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" &&
      block !== null &&
      (block as SchemaProduct)["@type"] === "Product"
  );

  if (!product || product.offers?.price === undefined) {
    throw new Error(`Auchan: could not find product/price data at ${url}`);
  }

  const name = product.name ?? "";

  return {
    name,
    brand: product.brand?.name ?? null,
    price: Number(product.offers.price),
    ean: product.gtin ?? null,
    // Auchan writes the size into the product name itself - "BACON EXTRA CUBOS
    // AUCHAN 2X75G" - and does so for 86% of its catalogue, where Continente
    // and Pingo Doce do it for essentially none. So the name is the size
    // source here, and no separate label needs parsing.
    // only Continente has a product-page crawl so far; see continente.ts
    categoryPath: null,
    packageSize: parseSize(name)?.total ?? null,
    packageUnit: parseSize(name)?.unit ?? null,
    ...parsePromotion(product.offers.priceValidUntil),
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
