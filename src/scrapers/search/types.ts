import type { Availability } from "../types";

export interface SearchHit {
  id: string;
  name: string;
  /**
   * Null for a product listed without a sellable price, from the product-page
   * crawlers (Pingo Doce's "0,00 EUR"). A tile with no price at all is omitted.
   */
  price: number | null;
  /**
   * Whether the store sells it now, and the sign the reader went by (see
   * Availability in ../types). "not_for_sale" keeps its shown price in
   * `price`; the product is saved with the "not for sale since" marker and
   * left out of the comparisons (the owner's rule, 1 November 2026). Missing
   * means the source could not say: saved as "unknown".
   */
  availability?: Availability;
  availabilitySign?: string;
  brand: string;
  category: string;
  url: string;

  /**
   * Barcode and package size, present ONLY when the row came from a product
   * page rather than a listing tile - tiles carry neither at any of the three
   * stores. The product-page crawler fills them, so a pass there does the work
   * of a crawl and an enrichment at once.
   *
   * `undefined` means "this source could not know", which is why persistence
   * treats it differently from `null`: a listing crawl must not erase a barcode
   * that a product-page crawl established.
   */
  ean?: string | null;
  packageSize?: number | null;
  unit?: string | null;
  /**
   * Where `packageSize` came from, when it is set: a product page (the default)
   * or the per-unit figure on an Auchan listing tile, which carries a size but
   * never a barcode. See `auchanTileSize` in src/lib/sizes.ts.
   */
  sizeSource?: "page" | "listing";
  /**
   * A tin's two weights as its product page labels them (ScrapeResult's
   * `tinWeights`). `undefined`: this source does not read them, so nothing is
   * written; nulls: the page was read and labels none, so a stale pair goes.
   */
  tinWeights?: { full: number | null; drained: number | null };

  /**
   * Promotion state, from a product page - and, since 22 October 2026, from an
   * Auchan listing tile, whose struck-through earlier price shows it (see
   * auchanTilePromotion). Undefined from any other listing tile, so a listing
   * crawl cannot erase what a page crawl recorded.
   */
  onPromotion?: boolean;
  regularPrice?: number | null;
  promoEndsAt?: Date | null;
  /** The price per kilo, litre or unit as the store displays it; see parseShownUnitPrice. */
  shownUnitPrice?: number | null;
  shownUnitPriceUnit?: "kg" | "l" | "un" | null;
}
