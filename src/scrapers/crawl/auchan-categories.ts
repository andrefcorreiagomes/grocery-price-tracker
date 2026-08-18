/**
 * Auchan food filter.
 *
 * Unlike Continente and Pingo Doce, Auchan is NOT crawled by a list of category
 * ids. Its top-level ids do not aggregate their descendants and its category
 * tree is JavaScript-rendered, so a category-driven crawl cannot be made
 * provably complete. Instead the crawler pulls the whole catalogue from
 * `cgid=root` and keeps a product when the top segment of its own category path
 * is a food department. See `crawl/auchan.ts`.
 *
 * This is a whitelist on purpose: only known food segments are kept, so a new
 * non-food department cannot leak in as food. The opposite risk - a food
 * department we did not anticipate being dropped - is guarded by the runner,
 * which reports every top segment it saw (kept and dropped) so a wrongly-dropped
 * food department is visible rather than lost silently.
 *
 * Segments are stored and compared normalised (lowercase, accent-stripped) so a
 * stray accent cannot cause a miss.
 */

/** Lowercase and strip diacritics, for accent-insensitive segment matching. */
export function normalizeSegment(segment: string): string {
  return segment
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Food department top-segments observed in Auchan's category paths, normalised. */
export const AUCHAN_FOOD_SEGMENTS = new Set(
  [
    "alimentação",
    "produtos-frescos",
    "bebidas-e-garrafeira",
    "congelados",
    "biológicos-e-alternativas",
    "gelados", // included defensively; may appear under another segment
  ].map(normalizeSegment)
);

export function isFoodSegment(segment: string): boolean {
  return AUCHAN_FOOD_SEGMENTS.has(normalizeSegment(segment));
}
