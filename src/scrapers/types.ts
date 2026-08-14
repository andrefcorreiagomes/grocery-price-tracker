export interface ScrapeResult {
  name: string;
  brand: string | null;
  price: number;
  ean: string | null;
  /** Pack size in base unit (kg or L). Extracted from the product page when available; null when not found. */
  packageSize: number | null;

  /**
   * Whether `price` is a promotional price. Every store publishes this, but via
   * a different mechanism - see each scraper. A missing marker is read as
   * `false` rather than throwing, so a markup change degrades quietly; the
   * per-store promo counts printed by scrape-daily are the canary for that.
   */
  onPromotion: boolean;
  /** Price before the discount. Only Continente publishes it; null elsewhere. */
  regularPrice: number | null;
  /** When the promotion ends. Pingo Doce and Auchan publish it; Continente doesn't. */
  promoEndsAt: Date | null;
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
