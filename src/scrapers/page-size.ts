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
