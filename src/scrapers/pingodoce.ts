import * as cheerio from "cheerio";
import { normalizePingoDoceBrand } from "./brand-normalize";
import { extractLdJsonBlocks, fetchHtml } from "./http";
import type { ScrapeResult } from "./types";

interface SchemaProduct {
  "@type"?: string;
  name?: string;
  brand?: { name?: string };
}

export async function scrapePingoDoce(url: string): Promise<ScrapeResult> {
  const html = await fetchHtml(url);

  const product = extractLdJsonBlocks(html).find(
    (block): block is SchemaProduct =>
      typeof block === "object" &&
      block !== null &&
      (block as SchemaProduct)["@type"] === "Product"
  );

  if (!product) {
    throw new Error(`Pingo Doce: could not find product data at ${url}`);
  }

  const $ = cheerio.load(html);
  const priceText = $(".prices .price").first().text().trim();
  const parsed = parsePortuguesePrice(priceText);

  if (parsed === null) {
    throw new Error(
      `Pingo Doce: could not find/parse price ("${priceText}") at ${url}`
    );
  }

  // "0,00 €" is how Pingo Doce says a product is not sellable, not a price. The
  // page is otherwise complete - name, brand, pack size all present - and it
  // renders an "Indisponível" badge alongside. Measured across the sitemap, the
  // whole of the promotions, own-brand and seasonal aisles read this way, as do
  // individual out-of-stock products in ordinary departments.
  //
  // A zero must never survive as a price: it is the minimum of every set it
  // joins, so one of these in the catalogue makes the cheapest product of its
  // food type free, in every store comparison, forever.
  const price = parsed === 0 ? null : parsed;

  const size = parsePackageSize($("h1.product-unit-measure").first().text());
  // The barcode rides on a nutritional-info URL in the page, and that URL is
  // HTML-escaped: "...?pid=4696048&amp;ean=8435250297955". So the character
  // before "ean=" is a semicolon, not an "&", and a plain /[?&]ean=/ misses
  // every one of them - measured, 0 of 124 products until this was allowed for.
  const eanMatch = html.match(/[?&](?:amp;)?ean=(\d+)/i);

  return {
    name: product.name ?? "",
    brand: normalizePingoDoceBrand(product.brand?.name),
    price,
    ean: eanMatch ? eanMatch[1] : null,
    // Deliberately null, and NOT read from the page. Pingo Doce's breadcrumb
    // renders the leaf alone - ["Produtos /", "Vinho Tinto", "Vinho Tinto"] -
    // with no department above it. The URL carries the full hierarchy, so the
    // catalogue crawler builds the path from there instead; see
    // `categoryPathFromUrl` in crawl/pingodoce-sitemap.ts.
    categoryPath: null,
    packageSize: size?.total ?? null,
    packageUnit: size?.unit ?? null,
    ...parsePromotion($),
  };
}

/**
 * Pingo Doce publishes the pack size in an `h1.product-unit-measure`, which
 * reads either "0.4 Kg" or "0.1 Kg | 13,9 €/Kg" - the size, optionally followed
 * by the unit price.
 *
 * This is the only place Pingo Doce gives a size at all: unlike Auchan it keeps
 * the size out of the product name (parseable from just 14 of its 7,191
 * catalogue names), and unlike Continente and Auchan it publishes no barcode.
 * So this label is the ONLY evidence available for comparing a Pingo Doce
 * product against another store's, which is why it is worth parsing carefully.
 *
 * Volumes are returned in litres and weights in kilograms, matching
 * `ScrapeResult.packageSize` and the app's comparison base.
 */
function parsePackageSize(text: string): { total: number; unit: "kg" | "l" } | null {
  const match = text
    .trim()
    .match(/^([\d.,]+)\s*(kg|g|gr|l|lt|ml|cl)\b/i);
  if (!match) return null;

  const qty = Number(match[1].replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) return null;

  switch (match[2].toLowerCase()) {
    case "kg":
      return { total: qty, unit: "kg" };
    case "l":
    case "lt":
      return { total: qty, unit: "l" };
    case "g":
    case "gr":
      return { total: qty / 1000, unit: "kg" };
    case "ml":
      return { total: qty / 1000, unit: "l" };
    case "cl":
      return { total: qty / 100, unit: "l" };
    default:
      return null;
  }
}

/**
 * Pingo Doce signals a promotion in the DOM: a `.product-promo-end` element
 * reading "Promoção até 17/08", alongside `.product-promotion-info`. Neither
 * appears on an unpromoted page. Note the `product-` prefix - the unprefixed
 * `.promo-end` matches nothing.
 *
 * Do not be tempted by the `discount` key in its dataLayer - it reads 0 even on
 * a page that is actively discounted, so it is useless.
 *
 * `regularPrice` stays null: Pingo Doce never prints the old price. It does
 * publish the discount rate, as the alt text of a badge image ("Poupe 35%"),
 * from which the old price could be derived - but that arrives rounded, so it
 * would put an approximate figure in the same column where Continente's is
 * exact. Left out deliberately rather than overlooked.
 */
function parsePromotion($: cheerio.CheerioAPI): Pick<
  ScrapeResult,
  "onPromotion" | "regularPrice" | "promoEndsAt"
> {
  const onPromotion = $(".product-promo-end, .product-promotion-info").length > 0;
  if (!onPromotion) {
    return { onPromotion: false, regularPrice: null, promoEndsAt: null };
  }
  return {
    onPromotion: true,
    regularPrice: null,
    promoEndsAt: parsePromoEnd($(".product-promo-end").first().text()),
  };
}

/**
 * "Promoção até 17/08" carries no year, so it has to be inferred. A promotion
 * still displayed on the page has not ended yet, so a date that lands in the
 * past means the promotion runs across the new year.
 */
function parsePromoEnd(text: string): Date | null {
  const match = text.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  // guard the ranges explicitly: Date.UTC silently rolls 32/13 over into the
  // next month or year rather than producing an Invalid Date
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  const now = new Date();
  let candidate = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  if (candidate.getTime() < Date.now() - 86_400_000) {
    candidate = new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day));
  }
  // a rolled-over date (e.g. 31/02) no longer matches what was parsed
  if (candidate.getUTCDate() !== day || candidate.getUTCMonth() !== month - 1) {
    return null;
  }
  return candidate;
}

/** Parses "0,86 €" / "1.234,56 €" / "16,6 €" style Portuguese price text into a number. */
function parsePortuguesePrice(text: string): number | null {
  const match = text.match(/([\d.]*\d,\d{1,2})/);
  if (!match) return null;
  const normalized = match[1].replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
