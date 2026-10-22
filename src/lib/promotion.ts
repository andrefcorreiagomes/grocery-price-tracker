/**
 * Whether a price the site shows is a promotion, and what the store says
 * about it.
 *
 * At all three chains a promotion means a price cut, with the price before it
 * (since 22 October 2026; src/scrapers/struck-price.ts). Continente marks about
 * 28% of its products and gives no end date; Pingo Doce gives an end date too;
 * Auchan's listing tiles give none. Until 22 October 2026 Pingo Doce's count
 * also took in "Preço Garantido" pages with no price cut, and Auchan's prices
 * were never called promotions: unknown, not "not on promotion".
 *
 * Pure, and free of the database, so the pages and the basket can share it.
 */

export interface Promotion {
  /** the price per kilo, litre or unit before the discount; all three stores give it */
  regularUnitPrice: number | null;
  /** the last day it runs, "2026-10-27"; Pingo Doce only */
  endsOn: string | null;
}

interface PromotionFields {
  price: number | null;
  packageSize: number | null;
  onPromotion?: boolean | null;
  regularPrice?: number | null;
  promoEndsAt?: Date | null;
}

/** The promotion behind a product's price, or null when it is not one (or not known to be). */
export function promotionOf(p: PromotionFields, now = new Date()): Promotion | null {
  if (!p.onPromotion) return null;
  // Compared against the *start* of today, not the current moment: promoEndsAt
  // is stored as midnight on the last day the promotion runs, so a promotion
  // ending today is still valid today. A known end date already past is
  // positive evidence the promotion is over - drop the mark, keep the price.
  const startOfToday = new Date(now.toISOString().slice(0, 10)).getTime();
  if (p.promoEndsAt && p.promoEndsAt.getTime() < startOfToday) return null;
  const regular =
    p.regularPrice && p.packageSize && p.price !== null && p.regularPrice > p.price
      ? p.regularPrice / p.packageSize
      : null;
  return { regularUnitPrice: regular, endsOn: p.promoEndsAt ? p.promoEndsAt.toISOString().slice(0, 10) : null };
}

/** "2026-10-27" -> "27/10", the site's short date. */
export function shortDay(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}
