import * as cheerio from "cheerio";
import { auchanTileSize } from "../../lib/sizes";
import { parseShownUnitPrice } from "../page-size";
import { struckPricePromotion } from "../struck-price";
import { sellablePrice } from "../types";
import type { SearchHit } from "./types";

/**
 * Reads product tiles out of a store's listing HTML. Shared with the catalogue
 * crawlers. The functions that once requested the stores' SEARCH pages were
 * removed on 3 October 2026: Continente's and Pingo Doce's robots.txt forbid
 * those pages and Auchan's evidently means to. Product discovery now searches
 * our own catalogue instead - see src/scripts/discover.ts.
 */

/**
 * What one HTML fragment yielded, beyond the products themselves.
 *
 * The counts exist because the failure they measure is silent. The tile reader
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
  /**
   * Tiles that show a price but are marked out of stock (`auc-product-unavailable`):
   * kept with that price and marked out of stock. About 9% expected (31 October 2026 sample);
   * near zero would mean the grid pages stopped carrying the mark.
   */
  markedUnavailable: number;
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
  let markedUnavailable = 0;
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
    // A price of 0, or one that will not read, is no price either (sellablePrice).
    if (gtm.price === undefined || sellablePrice(Number(gtm.price)) === null) {
      unpriced++;
      return;
    }

    const category = gtm.category ?? "";
    if (category === "") withoutCategory++;

    // An out-of-stock tile still shows a price: Auchan greys it, adds the class
    // `auc-product-unavailable` and an "Indisponível online" box in place of the
    // buy button. Checked 31 October 2026 on one shelf page: the 1 marked tile's
    // page said OutOfStock, the 23 unmarked all InStock. Kept with the price it
    // shows and marked out of stock - the owner's rule, 1 November 2026, as at
    // Continente - not skipped: a skipped product looks missing to the nightly,
    // which would open its page to find out why.
    const outOfStock = $(el).hasClass("auc-product-unavailable");
    if (outOfStock) markedUnavailable++;
    // An unmarked tile is taken as for sale: the grid shows the mark (4.29).
    const shownPrice = Number(gtm.price);
    const promotion = auchanTilePromotion($(el).find(".auc-price__stricked, .strike-through").first().text(), shownPrice);
    // Auchan's own per-kilo or per-item figure, printed on every tile measured.
    // When it settles the size, the size goes with the tile; when it does not,
    // the field stays absent and the name decides later, as it always did.
    const figure = $(el).find(".auc-measures--price-per-unit").first().text().replace(/\s+/g, " ").trim();
    const size = figure ? auchanTileSize(shownPrice, figure, gtm.name) : undefined;

    hits.push({
      id: gtm.id,
      name: gtm.name,
      price: shownPrice,
      ...(outOfStock
        ? { availability: "not_for_sale" as const, availabilitySign: "listing tile marked unavailable" }
        : { availability: "for_sale" as const, availabilitySign: "listing tile not marked unavailable" }),
      brand: gtm.brand ?? "",
      category,
      url: urls.absoluteProductUrl,
      ...(size ?? {}),
      ...promotion,
      // Auchan's own figure as printed ("8.6 €/Kg", "1.25 €/un"); null when the
      // tile has none.
      ...(() => {
        const shown = figure ? parseShownUnitPrice(figure) : null;
        return { shownUnitPrice: shown?.value ?? null, shownUnitPriceUnit: shown?.unit ?? null };
      })(),
    });
  });

  return { hits, seen, unpriced, markedUnavailable, malformed, withoutCategory };
}

/**
 * A tile's promotion, from its struck-through earlier price: "Price reduced
 * from 2,98 € to" (a pack price) or "from 1,39 € /Kg to" (per kilo), in the
 * same basis as the tile's price. Checked on a live listing page on 21 October
 * 2026: 3 of its 48 tiles carried one, each beside a discount badge ("-16%").
 *
 * NOT the "Promoção" label: it sat on 43 of those 48 tiles, promoted or not -
 * a template the page fills in the visitor's browser, with offers (multi-buy,
 * loyalty card) a crawler reading the HTML never sees. The rule is shared with
 * Pingo Doce's pages: see src/scrapers/struck-price.ts.
 */
export function auchanTilePromotion(struck: string, price: number): { onPromotion: boolean; regularPrice: number | null } {
  return struckPricePromotion(struck, price);
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
