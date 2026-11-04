import { euros } from "@/lib/money";

/**
 * The pack price and the store link under each product of a comparison (the
 * owner's yes, 4 November 2026): the price per kilo alone cannot tell a 5 kg
 * bag from a 500 g one, and the link lets anyone check the price at the store.
 */

/** Drop float noise and trailing zeros: 0.30000000000000004 -> "0.3". */
function plain(value: number, decimals: number): string {
  return String(Number(value.toFixed(decimals)));
}

/**
 * A size as a shopper reads it: "500 g" and "1.5 kg", "330 ml" and "6 L",
 * "12 un". The decimal point, like the prices (src/lib/money.ts). Null when
 * the size or its unit is unknown. Pure.
 */
export function sizeLabel(size: number | null, unit: string | null): string | null {
  if (size === null || !(size > 0)) return null;
  if (unit === "kg") return size < 1 ? `${plain(size * 1000, 1)} g` : `${plain(size, 3)} kg`;
  if (unit === "l") return size < 1 ? `${plain(size * 1000, 1)} ml` : `${plain(size, 3)} L`;
  if (unit === "un") return `${plain(size, 0)} un`;
  return null;
}

/**
 * The line under a product's name: "1.99 € · 500 g".
 *
 * Left out when the pack is exactly one unit of the comparison (1 kg compared
 * per kilo, 1 L per litre): the price per kilo shown above IS the price then,
 * and a product sold loose by the kilo cannot be told from a 1 kg bag in the
 * stores' data - Continente and Pingo Doce give both as "1 kg" at the price
 * per kilo (measured 4 November 2026; assumption 6.45). Saying "1 kg" would be
 * wrong for the loose ones. With no known size: "preço: 1.99 €", which is true
 * whether it is a pack or sold loose. Null when there is no price. Pure.
 */
export function packLine(
  product: { price: number | null; packageSize: number | null; unit: string | null },
  comparedIn: string
): string | null {
  if (product.price === null) return null;
  const size = sizeLabel(product.packageSize, product.unit);
  if (size === null) return `preço: ${euros(product.price)} €`;
  const oneUnit = product.unit === comparedIn && (product.unit === "kg" || product.unit === "l") && Math.abs((product.packageSize as number) - 1) < 1e-9;
  if (oneUnit) return null;
  return `${euros(product.price)} € · ${size}`;
}

/** The three stores' own sites: a link goes nowhere else. */
const STORE_SITES = /^https:\/\/(www\.)?(continente\.pt|pingodoce\.pt|auchan\.pt)\//;

/**
 * The product's page at the store, or null when the stored address is not on
 * one of the three stores' sites over https. The addresses come from the
 * stores' own pages, so this guards against a malformed or hostile one
 * ("javascript:...") ever becoming a link on our site. Pure.
 */
export function storeLink(url: string | null | undefined): string | null {
  return url && STORE_SITES.test(url) ? url : null;
}
