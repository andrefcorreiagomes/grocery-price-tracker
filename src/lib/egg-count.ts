import { stripAccents } from "./text";

/**
 * How many items are in a pack, for the kinds compared per ITEM rather than per
 * kilo: eggs (a box is sold by count - "12UN", "MEIA DÚZIA" - and its weight is
 * printed nowhere) and coffee capsules ("30 UN").
 *
 * Two sources, in order:
 *
 *   1. the name, which is how Auchan writes it: "OVOS ... CLASSE M 12UN",
 *      "... MEIA DÚZIA", "CÁPSULAS DELTA Q ... 40UN"
 *   2. the store's own price per item, which Continente and Pingo Doce show on
 *      the page ("0,25 €/un") while their names give no count at all ("Ovos de
 *      Solo Classe M"). The count is the whole number that turns the shelf
 *      price into that figure.
 *
 * Pure, so it is tested without a database.
 */

interface CountRule {
  /** packs are never bigger than this; anything larger is a misread */
  max: number;
  /** the usual pack sizes, which decide when several counts fit a price */
  common: number[];
  /** the words that follow a count in a name */
  units: string;
}

const EGGS: CountRule = { max: 60, common: [4, 6, 10, 12, 15, 18, 20, 24, 30], units: "un|uni|unid|unidades|ovos" };
const CAPSULES: CountRule = {
  max: 120,
  common: [8, 10, 12, 14, 16, 18, 20, 22, 24, 30, 32, 36, 40, 44, 48, 50, 60, 80, 100],
  units: "un|uni|unid|unidades|capsulas?|caps|pastilhas?|doses?|pods?",
};

function countFromName(name: string, rule: CountRule): number | null {
  const n = stripAccents(name).toLowerCase();
  const m = n.match(new RegExp(`\\b(\\d{1,3})\\s*x?\\s*(${rule.units})\\b`)) ?? n.match(/\bx\s*(\d{1,3})\b/);
  if (!m) return null;
  const count = Number(m[1]);
  return count >= 1 && count <= rule.max ? count : null;
}

/**
 * The count implied by the shelf price and the store's per-item figure, or
 * null.
 *
 * The figure is rounded to the cent, so price / figure is not a whole number:
 * EUR 2.99 at "0,25 €/un" gives 11.96. A count n fits when price / n rounds to
 * the shown figure. More than one can fit for a cheap figure; then the usual
 * pack sizes decide, and if they cannot, nothing is guessed.
 */
function countFromUnitPrice(
  price: number | null,
  shownUnitPrice: number | null,
  shownUnitPriceUnit: string | null,
  rule: CountRule
): number | null {
  if (price === null || price <= 0 || shownUnitPrice === null || shownUnitPrice <= 0) return null;
  if (shownUnitPriceUnit !== "un") return null;
  const fits: number[] = [];
  for (let count = 1; count <= rule.max; count++) {
    if (Math.abs(price / count - shownUnitPrice) <= 0.005 + 1e-9) fits.push(count);
  }
  if (fits.length === 1) return fits[0];
  const common = fits.filter((c) => rule.common.includes(c));
  return common.length === 1 ? common[0] : null;
}

/** The egg count a name states, or null. Dozens are understood. */
export function eggCountFromName(name: string): number | null {
  const n = stripAccents(name).toLowerCase();
  if (/\b2\s*duzias\b/.test(n)) return 24;
  if (/\b(meia|1\/2)\s*duzia\b/.test(n)) return 6;
  if (/\bduzia\b/.test(n)) return 12;
  return countFromName(name, EGGS);
}

export function eggCountFromUnitPrice(
  price: number | null,
  shownUnitPrice: number | null,
  shownUnitPriceUnit: string | null
): number | null {
  return countFromUnitPrice(price, shownUnitPrice, shownUnitPriceUnit, EGGS);
}

/**
 * Nescafé Dolce Gusto and Starbucks milk drinks take two capsules a cup, and
 * Auchan counts their boxes in CUPS: "CAPPUCINO 8UN" is the box of 16 capsules
 * Continente and Pingo Doce sell as 16. Measured on 29 October 2026 on the six
 * pairs sharing a barcode: every one 2 to 1. Neo pods are one a cup.
 */
const TWO_CAPSULE_DRINK = /cappuc|macchiat|machiat|white mocha|toffee|pumpkin|chococino/;

/** The capsule count a name states, or null: "30 UN", "10 Cápsulas", "x16", "93+7 UN". */
export function capsuleCountFromName(name: string): number | null {
  const n = stripAccents(name).toLowerCase();
  // Free capsules count: "93+7 UN" and "93 UN + 7 UN OFERTA" are boxes of 100.
  // The second number alone was read on 29 October 2026, a box of 7.
  const plus = n.match(/\b(\d{1,3})\s*(?:un|uni|unid|unidades)?\s*\+\s*(\d{1,3})\s*(?:un|uni|unid|unidades|capsulas?|caps)\b/);
  if (plus) {
    const total = Number(plus[1]) + Number(plus[2]);
    return total <= CAPSULES.max ? total : null;
  }
  const count = countFromName(name, CAPSULES);
  const cups = /\b(6|8)\s*un\b/.test(n) && /dolce gusto|\bndg\b/.test(n) && !/\bneo\b/.test(n) && TWO_CAPSULE_DRINK.test(n);
  return count !== null && cups ? count * 2 : count;
}

export function capsuleCountFromUnitPrice(
  price: number | null,
  shownUnitPrice: number | null,
  shownUnitPriceUnit: string | null
): number | null {
  return countFromUnitPrice(price, shownUnitPrice, shownUnitPriceUnit, CAPSULES);
}

/** The count for a kind compared per item, or null when the kind is not one of them. */
export function itemCount(
  kind: string,
  name: string,
  price: number | null,
  shownUnitPrice: number | null,
  shownUnitPriceUnit: string | null
): number | null {
  if (kind === "ovo") return eggCountFromName(name) ?? eggCountFromUnitPrice(price, shownUnitPrice, shownUnitPriceUnit);
  if (kind === "cafe-capsula") {
    return capsuleCountFromName(name) ?? capsuleCountFromUnitPrice(price, shownUnitPrice, shownUnitPriceUnit);
  }
  return null;
}
