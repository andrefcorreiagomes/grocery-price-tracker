/**
 * The promotion rule for a store that shows a promotion as a crossed-out
 * earlier price: Auchan on its listing tiles, Pingo Doce on its product pages
 * (both read on 21-22 October 2026; the two stores share the same shop
 * software and the same markup, "Price reduced from 4,59 €/Kg to").
 *
 * On promotion means a price cut: an earlier price is shown crossed out, and
 * it is above today's price. That is also what Continente's rule means (a price
 * before the discount, src/scrapers/continente.ts), so "promotion" says the
 * same thing at all three stores.
 *
 * What does NOT count, measured on the stores' own pages:
 *
 *   - a promotion box or label with no crossed-out price. Auchan prints a
 *     "Promoção" label on 43 of 48 tiles, promoted or not; Pingo Doce puts an
 *     empty promotion box on "Preço Garantido" (guaranteed price) pages, which
 *     made up to 361 of its 2,688 "promotions" before 22 October 2026.
 *   - a price below the manufacturer's recommended price ("PVPR"). Being under
 *     a suggested price is not a promotion (decided by the user, 22 October
 *     2026).
 *
 * The earlier price is returned in the basis the store prints it, which is the
 * basis of the price beside it: per pack, or per kilo for goods sold by weight.
 * No struck price, or one not above today's, is "not on promotion" - which also
 * clears a promotion that has ended.
 */
export function struckPricePromotion(
  struck: string | null | undefined,
  price: number | null
): { onPromotion: boolean; regularPrice: number | null } {
  const before = (struck ?? "").match(/(\d+(?:[.,]\d+)?)/)?.[1];
  const regular = before ? Number(before.replace(",", ".")) : NaN;
  return price !== null && Number.isFinite(regular) && regular > price
    ? { onPromotion: true, regularPrice: regular }
    : { onPromotion: false, regularPrice: null };
}
