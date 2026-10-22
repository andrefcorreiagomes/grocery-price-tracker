/**
 * The product id a product address ends with, at Continente and at Pingo Doce:
 * `...-2597619.html` gives `2597619`. One function for both since 22 October
 * 2026 (code review L3); each store's file had an identical copy.
 *
 * Not every id is numeric, which cost us 170 of Continente's 101,398 published
 * URLs when this only matched digits. Variant SKUs append a suffix and
 * percent-encode the separating hyphen so the id survives
 * (`...-glade-4505195%2D1.html` is `4505195-1`), and curated products carry a
 * word id (`...-t%C3%A1bua1.html` is `tábua1`). Taking the last
 * hyphen-separated segment and decoding it handles all three, and matches the
 * id the listing tiles report for the same products. At Pingo Doce it was
 * confirmed against the page's own `sku`.
 */
export function productIdFromUrl(url: string): string | null {
  const tail = url.match(/-([^-/]+)\.html$/)?.[1];
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}
