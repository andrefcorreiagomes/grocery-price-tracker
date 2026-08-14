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
  const price = parsePortuguesePrice(priceText);

  if (price === null) {
    throw new Error(
      `Pingo Doce: could not find/parse price ("${priceText}") at ${url}`
    );
  }

  const eanMatch = html.match(/[?&]ean=(\d+)/i);

  return {
    name: product.name ?? "",
    brand: normalizePingoDoceBrand(product.brand?.name),
    price,
    ean: eanMatch ? eanMatch[1] : null,
    packageSize: null,
    ...parsePromotion($),
  };
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
