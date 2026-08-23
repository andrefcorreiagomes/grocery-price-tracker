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
 * catalogue shrinks with nothing to show why. Counting elements SEEN against
 * hits KEPT turns that into a number a run can fail on. `withoutCategory` is the
 * other silent one: a tile with no category path still becomes a hit, but its
 * top segment reads as empty and the food filter drops it, so a spike here means
 * the catalogue is about to read as non-food.
 */
export interface TileParse {
  hits: SearchHit[];
  /** `[data-gtm]` elements encountered - the denominator */
  seen: number;
  /** elements that could not be turned into a hit: bad JSON or a missing field */
  discarded: number;
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
  let discarded = 0;
  let withoutCategory = 0;

  $("[data-gtm]").each((_, el) => {
    seen++;
    const rawGtm = $(el).attr("data-gtm");
    const rawUrls = $(el).attr("data-urls");
    if (!rawGtm || !rawUrls) {
      discarded++;
      return;
    }

    let gtm: { id?: string; name?: string; price?: string; brand?: string; category?: string };
    let urls: { absoluteProductUrl?: string };
    try {
      gtm = JSON.parse(rawGtm);
      urls = JSON.parse(rawUrls);
    } catch {
      discarded++;
      return;
    }
    if (!gtm.id || !gtm.name || gtm.price === undefined || !urls.absoluteProductUrl) {
      discarded++;
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

  return { hits, seen, discarded, withoutCategory };
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
