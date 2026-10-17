import { stripAccents } from "./matching";

/**
 * How many eggs are in a box. Eggs are compared per EGG, because a box is sold
 * by count - "12UN", "MEIA DÚZIA" - and its weight is printed nowhere.
 *
 * Two sources, in order:
 *
 *   1. the name, which is how Auchan writes it: "OVOS ... CLASSE M 12UN",
 *      "... MEIA DÚZIA", "2 DUZIAS"
 *   2. the store's own price per egg, which Continente and Pingo Doce show on
 *      the page ("0,25 €/un") while their names give no count at all ("Ovos de
 *      Solo Classe M"). The count is the whole number that turns the shelf
 *      price into that figure.
 *
 * Pure, so it is tested without a database.
 */

/** Boxes are never bigger than this; anything larger is a misread. */
const MAX_EGGS = 60;

/** The count a name states, or null. */
export function eggCountFromName(name: string): number | null {
  const n = stripAccents(name).toLowerCase();
  if (/\b2\s*duzias\b/.test(n)) return 24;
  if (/\b(meia|1\/2)\s*duzia\b/.test(n)) return 6;
  if (/\bduzia\b/.test(n)) return 12;
  const m = n.match(/\b(\d{1,2})\s*x?\s*(un|uni|unid|unidades|ovos)\b/);
  if (!m) return null;
  const count = Number(m[1]);
  return count >= 1 && count <= MAX_EGGS ? count : null;
}

/**
 * The count implied by the shelf price and the store's per-egg figure, or null.
 *
 * The figure is rounded to the cent, so price / figure is not a whole number:
 * EUR 2.99 at "0,25 €/un" gives 11.96. A count n fits when price / n rounds to
 * the shown figure. More than one can fit for a cheap figure; then the common
 * box sizes decide, and if they cannot, nothing is guessed.
 */
export function eggCountFromUnitPrice(
  price: number | null,
  shownUnitPrice: number | null,
  shownUnitPriceUnit: string | null
): number | null {
  if (price === null || price <= 0 || shownUnitPrice === null || shownUnitPrice <= 0) return null;
  if (shownUnitPriceUnit !== "un") return null;
  const fits: number[] = [];
  for (let count = 1; count <= MAX_EGGS; count++) {
    if (Math.abs(price / count - shownUnitPrice) <= 0.005 + 1e-9) fits.push(count);
  }
  if (fits.length === 1) return fits[0];
  const common = fits.filter((c) => [4, 6, 10, 12, 15, 18, 20, 24, 30].includes(c));
  return common.length === 1 ? common[0] : null;
}
