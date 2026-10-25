export interface ScrapeResult {
  /**
   * The address that finally answered, after redirects. Set only by readers
   * that know it (Continente's), so a crawler can store a product's new
   * address instead of paying for the redirect every night.
   */
  finalUrl?: string;
  name: string;
  brand: string | null;
  /**
   * The listed price, or null when the page loads a real product that carries
   * no sellable price - out of stock, or sold by variable weight.
   *
   * Nullable because a product PAGE can say this and a listing tile cannot: the
   * grids simply omit such products, which is why no zero ever reached the
   * database from the grid crawlers. Pingo Doce publishes "0,00 EUR" plus an
   * "Indisponível" badge, and reading that as a price of zero would put a free
   * product at the top of every cheapest-per-store ranking.
   */
  price: number | null;
  ean: string | null;
  /**
   * The store's own category path for this product, when the page carries it.
   * A listing tile always has one; a product page does not always, which is why
   * this is nullable. Needed so a product-page crawl can produce the same rows
   * as a listing crawl.
   */
  categoryPath: string | null;

  /** Pack size in base unit (kg or L). Extracted from the product page when available; null when not found. */
  packageSize: number | null;
  /**
   * Which base unit `packageSize` is in. Weight and volume are both collapsed
   * to a single number, so without this a 1.5 of water and a 1.5 of rice are
   * indistinguishable - and comparing them would be nonsense. Null exactly when
   * `packageSize` is.
   */
  packageUnit: "kg" | "l" | null;

  /**
   * Whether `price` is a promotional price - a price cut, at every store (see
   * src/scrapers/struck-price.ts). A missing marker is read as `false` rather
   * than throwing, so a markup change degrades quietly; each crawl report
   * counts promotions to notice that (src/scrapers/crawl/promo-watch.ts).
   */
  onPromotion: boolean;
  /** Price before the discount, in the basis of `price`; null when not on promotion. */
  regularPrice: number | null;
  /** When the promotion ends. Pingo Doce's pages publish it, and Auchan's (unused by the nightly); Continente's don't. */
  promoEndsAt: Date | null;
  /** The price per kilo, litre or unit as the page displays it; null when it shows none. */
  shownUnitPrice: { value: number; unit: "kg" | "l" | "un" } | null;
}

/**
 * The page loaded, and the reader found no product on it: no product data, or
 * no price it can read. The page readers throw this - and only this - for a
 * page that answered, which is what lets a crawler count it as "gone" while a
 * failure to get an answer at all is not (failedPageVerdict in http.ts).
 */
export class PageReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PageReadError";
  }
}

/**
 * A page that loaded at the product's own address but could not be read. Unlike
 * PageReadError it says nothing about the product - a protection page, a
 * maintenance page or a changed layout looks like this - so it is "could not
 * tell" (failedPageVerdict), never a night towards delisting (25 October 2026,
 * assumption 1.13).
 */
export class UnreadablePageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnreadablePageError";
  }
}

/**
 * At or below this a store is not quoting a price. Pingo Doce publishes "0,00 €"
 * for a product listed but not for sale, and one cent for a handful it cannot
 * price; nothing in a supermarket costs a cent, and the cheapest real price in
 * the catalogue is five.
 */
export const PLACEHOLDER_PRICE = 0.01;

/**
 * A price a shopper could pay, or null: the rule every reader applies, since
 * 22 October 2026 (code review M9). Until then only Pingo Doce's did, and a zero
 * read at Continente or Auchan would have become the cheapest product of its
 * kind in every comparison. Null means "listed, not for sale now" - the product
 * is kept, without a price.
 */
export function sellablePrice(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > PLACEHOLDER_PRICE ? value : null;
}

/**
 * These two guards exist because the types above are compile-time only.
 * `Number("abc")` is NaN and NaN *is* a `number`; `new Date("x")` is an Invalid
 * Date and still a `Date`. Both would satisfy the interface and land in the
 * database, so anything unparseable has to collapse to null here instead.
 */
export function finiteOrNull(value: number | undefined | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function validDateOrNull(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * A copy of `value` that does not retain the string it was cut from.
 *
 * V8 does not copy when you take a substring. `html.match(...)[1]` returns a
 * SlicedString - a pointer into the original - so a 26-character category path
 * keeps its whole 2 MB page alive for as long as the field exists. That is
 * invisible until something holds many of them at once.
 *
 * It killed the first full Continente pass. Measured on 300 simulated 2 MB
 * pages, keeping one short field from each:
 *
 *     match() capture, as written    1953.1 KB retained per page
 *     the same, detached                 0.1 KB retained per page
 *
 * The crawl held 2,200 results before running out of heap at 4 GB, which is
 * 2,200 x 1.9 MB almost exactly. A 300-product slice never showed it: 300 pages
 * is ~570 MB, comfortably under the limit, so the bug needed a long run to
 * appear at all.
 *
 * Buffer round-trips rather than any string operation, because concatenation
 * and `.slice()` can both hand back another view instead of a fresh allocation.
 * Only apply it to short fields kept out of a big string - it copies, so it is
 * not free, and it is pointless on a string that was never a substring (a
 * JSON.parse result is already its own allocation).
 */
export function detached(value: string): string;
export function detached(value: null | undefined): null;
export function detached(value: string | null | undefined): string | null;
export function detached(value: string | null | undefined): string | null {
  return value == null ? null : Buffer.from(value, "utf8").toString("utf8");
}
