import * as cheerio from "cheerio";
import { fetchHtml } from "../http";
import { collectHits, SEARCH_LIMIT } from "./paginate";
import type { SearchHit } from "./types";

/**
 * Continente ignores `start`/`sz` on the public search URL - it always returns
 * the same first 35 tiles. The offsets only work against the grid endpoint the
 * page's own "load more" control calls, which needs `cgid` and `pmin` alongside
 * them (that exact URL is embedded in the search page as a `data-url`).
 */
const GRID_URL =
  "https://www.continente.pt/on/demandware.store/Sites-continente-Site/default/Search-UpdateGrid";

/**
 * Even the grid endpoint clamps `sz` to 35 - asking for 60 still returns 35 -
 * so unlike the other two stores Continente can't cover the cap in one request
 * and walks offsets instead. Verified, not assumed.
 */
const PAGE_SIZE = 35;

/**
 * Parse Continente product tiles out of a grid/search HTML fragment. Shared by
 * the search extractor here and the catalogue crawler, so both read tiles the
 * same way. Each tile carries its data in a `data-product-tile-impression` JSON
 * attribute; the link is the first `.html` anchor inside the tile.
 */
export function parseContinenteTiles(html: string): SearchHit[] {
  const $ = cheerio.load(html);
  const hits: SearchHit[] = [];

  $("[data-product-tile-impression]").each((_, el) => {
    const raw = $(el).attr("data-product-tile-impression");
    if (!raw) return;

    let parsed: { id?: string; name?: string; price?: number; brand?: string; category?: string };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!parsed.id || !parsed.name || parsed.price === undefined) return;

    const link = $(el).find('a[href*=".html"]').first().attr("href");
    if (!link) return;

    hits.push({
      id: parsed.id,
      name: parsed.name,
      price: parsed.price,
      // an empty brand at Continente means no third-party brand is attached -
      // it's sold under their own fresh-food program, not literally unbranded
      brand: parsed.brand || "Continente",
      category: parsed.category ?? "",
      url: link.startsWith("http") ? link : `https://www.continente.pt${link}`,
    });
  });

  return hits;
}

export async function searchContinente(
  term: string,
  limit = SEARCH_LIMIT
): Promise<SearchHit[]> {
  return collectHits(
    (start) => fetchPage(term, start),
    (hit) => hit.id,
    PAGE_SIZE,
    limit
  );
}

async function fetchPage(term: string, start: number): Promise<SearchHit[]> {
  const html = await fetchHtml(
    `${GRID_URL}?cgid=col-produtos&q=${encodeURIComponent(term)}&pmin=0.01&start=${start}&sz=${PAGE_SIZE}`
  );
  return parseContinenteTiles(html);
}
