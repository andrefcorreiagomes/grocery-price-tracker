export interface SearchHit {
  id: string;
  name: string;
  /**
   * Null only from the product-page crawlers, for a product listed without a
   * sellable price. Listing tiles omit those products entirely, so a row built
   * from a grid always has a number here.
   */
  price: number | null;
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
