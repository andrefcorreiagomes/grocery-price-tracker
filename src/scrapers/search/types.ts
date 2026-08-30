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
}
