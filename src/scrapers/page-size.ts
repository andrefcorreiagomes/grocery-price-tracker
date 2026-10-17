import { stripAccents } from "../lib/matching";

/**
 * What a product page's size really means, beyond what the size label says.
 *
 * Two corrections, both measured on live pages (3 October 2026) before being
 * written, and shared because Continente and Pingo Doce make the same mistakes.
 */

/**
 * Is the headline price already a price per kilo (or per litre)?
 *
 * Goods sold by weight - a whole chicken, a salmon, a leg of turkey - show a
 * price per kilo AND the weight of the one item on the shelf. Continente:
 *
 *     2,49€/kg   7,35€/un        emb. 2,95 kg (aprox.)
 *
 * Pingo Doce:
 *
 *     10,99 €/Kg                 4.2 Kg
 *
 * Dividing one by the other made that chicken EUR 0.84/kg and the salmon EUR
 * 1.90/kg. The suffix on the headline price is what separates the two cases: a
 * pack shows "1,99€" there, with any "/kg" figure only as a secondary line.
 *
 * Read from the same text the price came from, and only when that text's first
 * figure IS the price, so a carousel of other products cannot answer for this
 * one - the trap that once gave a tin of tuna its neighbour's drained weight.
 */
export function pricedPerUnit(priceText: string, price: number | null): "kg" | "l" | null {
  if (price === null) return null;
  const m = priceText.match(/(\d[\d.]*,\d{1,2}|\d+(?:\.\d+)?)\s*€\s*(?:\/\s*(kg|lt?)\b)?/i);
  if (!m) return null;
  const shown = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
  if (!Number.isFinite(shown) || Math.abs(shown - price) > 0.005) return null;
  if (!m[2]) return null;
  return m[2].toLowerCase() === "kg" ? "kg" : "l";
}

/**
 * A capsule or pod pack whose page size is a COUNT read as a quantity.
 *
 * Measured across the catalogue, 8 such products: seven L'Or capsule packs at
 * Continente whose page gives the intensity as litres ("Int 10 L'Or" as 10 L),
 * and a Pingo Doce box of 10 capsules labelled "10 Kg | 0,38 €/Kg" by the store
 * itself. Even a 100-capsule box weighs well under a kilo, and no capsule is
 * sold by the litre, so either reading is a count. Unknown is the honest size.
 */
export function implausiblePodSize(name: string, total: number, unit: "kg" | "l"): boolean {
  if (!/\b(capsula|pastilha)s?\b/.test(stripAccents(name).toLowerCase())) return false;
  return unit === "l" || total >= 1;
}

/**
 * The price per kilo, litre or unit a store DISPLAYS, as it displays it:
 * "6,65€/lt" (Continente), "0.1 Kg | 13,9 €/Kg" (Pingo Doce's size label),
 * "8.6 €/Kg" (Auchan's listing tile). Saved as the store's own figure, so it
 * can be compared with the price per kilo this project works out.
 */
export function parseShownUnitPrice(text: string): { value: number; unit: "kg" | "l" | "un" } | null {
  const m = text.match(/(\d[\d.]*,\d{1,2}|\d+(?:\.\d+)?)\s*€\s*\/\s*(kg|lt?|un)\b/i);
  if (!m) return null;
  const value = Number(m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const raw = m[2].toLowerCase();
  return { value, unit: raw === "kg" ? "kg" : raw === "un" ? "un" : "l" };
}

/**
 * The pack size worked out from the price per kilo or litre a page shows under
 * the price, for a page that states no size of its own.
 *
 * Continente's wine and spirit pages carry no "emb." label at all - 6,856 of
 * its products had been read and left without a size, almost all of them
 * bottles - but most show "6,65€/lt" under "4,99€". The size is then the price
 * divided by that figure, 0.7504 L here, rounded with the figure's own
 * rounding to the cent in mind: 0.75 L. Measured
 * on 30 pages without a size (17 October 2026): 25 gave 0.75, 0.70, 0.375 or
 * 1.5 L exactly this way.
 *
 * Only "/kg" and "/lt". A wine page sometimes labels the same per-litre figure
 * "/un" (EUR 45.99 beside "61,32€/un"), but on coffee "/un" really is per
 * capsule, so "/un" is left alone rather than guessed at.
 */
export function sizeFromUnitPrice(
  secondaryText: string,
  price: number | null
): { total: number; unit: "kg" | "l" } | null {
  if (price === null || price <= 0) return null;
  const shown = parseShownUnitPrice(secondaryText);
  if (!shown || shown.unit === "un") return null;
  const perUnit = shown.value;
  const unit = shown.unit;
  // The figure shown is rounded to the cent, so the true size lies between
  // these two. Take the roundest number inside that range: 0.75 rather than
  // 0.749 for a EUR 3.29 wine at "4,39€/lt", while a half bottle at "15,71€/lt"
  // stays 0.375, because 0.37 and 0.38 both fall outside its range.
  const lo = price / (perUnit + 0.005);
  const hi = perUnit > 0.005 ? price / (perUnit - 0.005) : Infinity;
  let total = Number((price / perUnit).toPrecision(3));
  for (const digits of [1, 2, 3]) {
    const candidate = Number((price / perUnit).toPrecision(digits));
    if (candidate >= lo && candidate <= hi) { total = candidate; break; }
  }
  // The same bounds the name reader uses for one container.
  const plausible = unit === "kg" ? total >= 0.001 && total <= 30 : total >= 0.01 && total <= 10;
  return plausible ? { total, unit } : null;
}

/** The size a page's label gives, after both corrections. */
export function correctedSize(
  name: string,
  label: { total: number; unit: "kg" | "l" } | null,
  perUnit: "kg" | "l" | null
): { total: number; unit: "kg" | "l" } | null {
  // The price is already per kilo or litre, so a size of exactly 1 makes the
  // unit price the price itself, whatever one item happens to weigh.
  if (perUnit) return { total: 1, unit: perUnit };
  if (label && implausiblePodSize(name, label.total, label.unit)) return null;
  return label;
}
