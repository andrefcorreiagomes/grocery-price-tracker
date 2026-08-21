import { parseSize } from "../lib/matching";
import { extractLdJsonBlocks, fetchHtml } from "./http";
import { validDateOrNull, type ScrapeResult } from "./types";

interface SchemaProduct {
  "@type"?: string;
  name?: string;
  gtin?: string;
  brand?: { name?: string };
  offers?: { price?: string | number; priceValidUntil?: string };
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
