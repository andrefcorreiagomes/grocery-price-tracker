import * as cheerio from "cheerio";
import { fetchHtml } from "../http";
import { collectHits, SEARCH_LIMIT } from "./paginate";
import type { SearchHit } from "./types";

/** Auchan honours `start`/`sz` directly on the public search URL. */
const SEARCH_URL = "https://www.auchan.pt/pt/pesquisa";

/**
 * What one HTML fragment yielded, beyond the products themselves.
 *
 * The counts exist because the failure they measure is silent. `parseAuchanTiles`
 * returns early on a tile whose JSON will not parse or is missing a field, so a
 * renamed attribute does not throw - it quietly returns fewer products, and the
 * catalogue shrinks with nothing to show why.
 *
 * Two reasons a tile does not become a product, kept APART because only one is a
 * fault. A tile can be perfectly well-formed and simply carry no price - an
 * out-of-stock product Auchan still lists but cannot sell today - and a price
 * tracker has nothing to record for it, so it is skipped and that is correct.
 * Measured at ~1.5% of the catalogue, and it must not count against the parser:
 * folding it in gave the yield guard a permanent 1.5% floor to see a real break
 * through. `malformed` is the actual alarm - bad JSON, or a missing id/name/url,
 * which a healthy grid never produces and a renamed attribute produces for every
 * tile at once. `withoutCategory` is the third silent one: a tile with no
 * category still becomes a hit, but its top segment reads as empty and the food
 * filter drops it, so a spike there means the catalogue is about to read as
 * non-food.
 */
export interface TileParse {
  hits: SearchHit[];
  /** `[data-gtm]` elements encountered - the denominator */
  seen: number;
  /** well-formed tiles that simply carry no price: out of stock, skipped, benign */
  unpriced: number;
  /** tiles broken in a way a healthy grid never is: bad JSON, or a missing id/name/url */
  malformed: number;
  /** hits that parsed but carry no category path */
  withoutCategory: number;
}

/**
 * Parse Auchan product tiles out of a grid/search HTML fragment, reporting the
 * yield. Each tile carries its data split across two JSON attributes: `data-gtm`
 * (id/name/price/brand/category) and `data-urls` (the absolute product url).
 */
export function parseAuchanTilesDetailed(html: string): TileParse {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];
  let seen = 0;
  let unpriced = 0;
  let malformed = 0;
  let withoutCategory = 0;

  $("[data-gtm]").each((_, el) => {
    seen++;
    const rawGtm = $(el).attr("data-gtm");
    const rawUrls = $(el).attr("data-urls");
    if (!rawGtm || !rawUrls) {
      malformed++;
      return;
    }

    let gtm: { id?: string; name?: string; price?: string; brand?: string; category?: string };
    let urls: { absoluteProductUrl?: string };
    try {
      gtm = JSON.parse(rawGtm);
      urls = JSON.parse(rawUrls);
    } catch {
      malformed++;
      return;
    }
    // id, name and url are the structural fields a real product tile always
    // carries; missing one means the tile shape has changed.
    if (!gtm.id || !gtm.name || !urls.absoluteProductUrl) {
      malformed++;
      return;
    }
    // Price is the one field a listed-but-unavailable product legitimately
    // lacks. Verified against the live grid: these tiles carry no price ANYWHERE
    // in their markup, so it is genuine absence, not a parser miss.
    if (gtm.price === undefined) {
      unpriced++;
      return;
    }

    const category = gtm.category ?? "";
    if (category === "") withoutCategory++;

    hits.push({
      id: gtm.id,
      name: gtm.name,
      price: Number(gtm.price),
      brand: gtm.brand ?? "",
      category,
      url: urls.absoluteProductUrl,
    });
  });

  return { hits, seen, unpriced, malformed, withoutCategory };
}

/**
 * The bare form, for callers that only want the products - the search extractor
 * and the product-discovery skill. The crawler uses the detailed form so it can
 * fail on a collapsed yield.
 */
export function parseAuchanTiles(html: string): SearchHit[] {
  return parseAuchanTilesDetailed(html).hits;
}

/**
 * How many products the result set holds, from the grid's own counter ("1 - 64
 * de 54,859 resultados"). The crawler paginates against this rather than
 * guessing from page length, since a full page need not parse to a full page of
 * products and stopping on a short one silently truncates the crawl.
 *
 * Only the `Search-Show` page carries this counter - the `Search-UpdateGrid`
 * fragment the crawler pages through does not - so the crawler reads it from its
 * first request and pages on from there. The message has several shapes ("13
 * resultados", "1 - 64 de 54,859 resultados"), and the total is the last number
 * in all of them.
 */
export function parseAuchanTotal(html: string): number | null {
  const text = cheerio.load(html)(".auc-js-search-results-count").first().text();
  const numbers = text.replace(/[.,\s]/g, "").match(/\d+/g);
  return numbers ? Number(numbers[numbers.length - 1]) : null;
}

export async function searchAuchan(
  term: string,
  limit = SEARCH_LIMIT
): Promise<SearchHit[]> {
  // asking for `sz = limit` means one request covers the whole cap
  return collectHits(
    (start) => fetchPage(term, start, limit),
    (hit) => hit.id,
    limit,
    limit
  );
}

async function fetchPage(term: string, start: number, size: number): Promise<SearchHit[]> {
  const html = await fetchHtml(
    `${SEARCH_URL}?q=${encodeURIComponent(term)}&start=${start}&sz=${size}`
  );
  return parseAuchanTiles(html);
}
