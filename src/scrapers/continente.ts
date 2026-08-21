import * as cheerio from "cheerio";
import { extractLdJsonBlocks, fetchHtml } from "./http";
import { finiteOrNull, type ScrapeResult } from "./types";

interface SchemaProduct {
  "@type"?: string;
  name?: string;
  brand?: { name?: string };
  offers?: { price?: string | number };
}

export async function scrapeContinente(url: string): Promise<ScrapeResult> {
  const html = await fetchHtml(url);

  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" &&
      block !== null &&
      (block as SchemaProduct)["@type"] === "Product"
  );

  if (!product || product.offers?.price === undefined) {
    throw new Error(`Continente: could not find product/price data at ${url}`);
  }

  const $ = cheerio.load(html);
  const size = parsePackageSize($(".ct-pdp--unit").first().text().trim());
  // The barcode rides on a nutritional-info URL in the page, and that URL is
  // HTML-escaped: "...?pid=4696048&amp;ean=8435250297955". So the character
  // before "ean=" is a semicolon, not an "&", and a plain /[?&]ean=/ misses
  // every one of them - measured, 0 of 124 products until this was allowed for.
  const eanMatch = html.match(/[?&](?:amp;)?ean=(\d+)/i);
  const price = Number(product.offers.price);

  return {
    name: product.name ?? "",
    // an empty brand at Continente means no third-party brand is attached -
    // it's sold under their own fresh-food program, not literally unbranded
    brand: product.brand?.name || "Continente",
    price,
    ean: eanMatch ? eanMatch[1] : null,
    categoryPath: parseCategoryPath(html),
    packageSize: size?.total ?? null,
    packageUnit: size?.unit ?? null,
    ...parsePromotion(html, price),
  };
}

/**
 * Continente is the only store that publishes the pre-promotion price. It sits
 * in the analytics dataLayer as `"discount":2.1,"pre_discount_price":5.99`, and
 * both keys are absent entirely when nothing is discounted.
 *
 * Two things to know: the JSON is HTML-escaped in the page source (`&quot;`, not
 * `"`), and the page also renders generic `promotion` / `promo-text` strings
 * whether or not there is a promotion - so only `pre_discount_price`
 * discriminates. Continente publishes no end date, hence `promoEndsAt: null`.
 */
function parsePromotion(html: string, price: number): Pick<
  ScrapeResult,
  "onPromotion" | "regularPrice" | "promoEndsAt"
> {
  const match = html
    .replace(/&quot;/g, '"')
    .match(/"pre_discount_price"\s*:\s*([\d.]+)/);
  const regularPrice = finiteOrNull(match ? Number(match[1]) : null);

  // a "regular" price at or below the sale price means the wrong number was
  // picked up, so treat it as no promotion rather than recording nonsense
  if (regularPrice === null || regularPrice <= price) {
    return { onPromotion: false, regularPrice: null, promoEndsAt: null };
  }
  return { onPromotion: true, regularPrice, promoEndsAt: null };
}

/**
 * The category a product page claims for itself, from the analytics dataLayer:
 * `"item_category":"Frescos","item_category2":"Frutas","item_category3":"..."`.
 *
 * Joined with "/" to match exactly what the listing tiles produce, so rows built
 * from a product page and rows built from a grid are indistinguishable
 * downstream. The JSON is HTML-escaped in the page source, hence the unescape -
 * the same trap as the pre-discount price below.
 */
function parseCategoryPath(html: string): string | null {
  const source = html.replace(/&quot;/g, '"');
  const parts: string[] = [];
  for (const key of ["item_category", "item_category2", "item_category3"]) {
    const match = source.match(new RegExp(`"${key}"\s*:\s*"([^"]*)"`));
    if (match?.[1]) parts.push(decodeEntities(match[1]));
  }
  return parts.length > 0 ? parts.join("/") : null;
}

/** The dataLayer double-escapes accents (`Ma&ccedil;&atilde;`). */
function decodeEntities(text: string): string {
  return cheerio.load(`<i>${text}</i>`)("i").text();
}

/**
 * Parses Continente's "emb. X unit" label into a base-unit quantity.
 * "emb. 1 kg" → 1, "emb. 500 g" → 0.5, "emb. 1,5 L" → 1.5, "emb. 33 cl" → 0.33
 *
 * Multipacks are written "emb. 3 x 210 gr" and return the TOTAL across the
 * pack (0.63), because that is what the price buys. The original pattern had
 * no branch for the count and silently returned null on every multipack -
 * found on tomato pulp, which is sold as 3 x 210 g almost everywhere.
 *
 * Note the label can carry a second figure - "emb. 540 gr (peso escorrido
 * 400 gr)" - which is the drained weight, deliberately not returned here: the
 * caller decides which basis a group uses (see the product-discovery skill).
 */
function parsePackageSize(text: string): { total: number; unit: "kg" | "l" } | null {
  const match = text.match(/emb\.\s*(?:(\d+)\s*[x×]\s*)?([\d,]+)\s*(kg|g|l|ml|cl)/i);
  if (!match) return null;

  const count = match[1] ? Number(match[1]) : 1;
  const qty = Number(match[2].replace(",", "."));
  if (!Number.isFinite(qty) || !Number.isFinite(count)) return null;

  const total = count * qty;
  switch (match[3].toLowerCase()) {
    case "g":  return { total: total / 1000, unit: "kg" };
    case "ml": return { total: total / 1000, unit: "l" };
    case "cl": return { total: total / 100, unit: "l" };
    case "l":  return { total, unit: "l" };
    default:   return { total, unit: "kg" };
  }
}
