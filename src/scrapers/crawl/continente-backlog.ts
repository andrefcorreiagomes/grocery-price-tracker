import { keepInCatalogue } from "../../lib/catalogue-filter";
import { kindFromName } from "../../lib/food-types";
import { topSection } from "../../lib/store-sections";
import type { SearchHit } from "../search/types";
import type { openCatalogueWriter } from "./persist";
import type { ProductTarget } from "./continente-products";

/**
 * Continente's never-opened addresses: in what order to open them, and how
 * what is found is kept. Shared by the nightly (3,000 a night) and the
 * catch-up command (`npm run catchup:continente`, 23 October 2026).
 *
 * Continente's addresses do not say whether a product is food, so each one
 * must be opened once to find out. On 23 October 2026, 68,340 of the 103,466
 * addresses in its sitemap had never been opened; most are not food (2 of the
 * 3,000 opened that night were new food).
 */

/** data/store-sections.ts, applied to what the product page says. */
export const isContinenteFood = (path: string | null, name: string) => keepInCatalogue("CONTINENTE", path, name).keep;

/** Save a batch of food products, grouped into the sections the report reads. */
export async function saveGrouped(writer: Awaited<ReturnType<typeof openCatalogueWriter>>, batch: SearchHit[]) {
  const bySection = new Map<string, SearchHit[]>();
  for (const hit of batch) {
    const section = topSection(hit.category);
    const list = bySection.get(section) ?? [];
    list.push(hit);
    bySection.set(section, list);
  }
  for (const [section, products] of bySection) await writer.save(products, section);
}

/**
 * The product's name as its address spells it:
 * ".../produto/queijo-flamengo-fatias-continente-2597619.html" gives
 * "queijo flamengo fatias continente". Null when the address is not a product
 * address.
 */
export function nameFromProductUrl(url: string): string | null {
  const slug = url.match(/\/produto\/(.+)-[^-/]+\.html$/)?.[1];
  if (!slug) return null;
  try {
    return decodeURIComponent(slug).replace(/-/g, " ");
  } catch {
    return slug.replace(/-/g, " ");
  }
}

/** Whether the name in the address suggests food (a guess, used only for the order). */
export function looksLikeFood(url: string): boolean {
  const name = nameFromProductUrl(url);
  return name !== null && kindFromName(name, "CONTINENTE") !== null;
}

/**
 * The order to open never-opened addresses in: those whose name suggests food
 * first (the user's wish, 23 October 2026: the food matters, and the guess
 * only decides what comes first - every address is still opened); within each
 * group, newest sitemap date first, and an address with no date last, because
 * unknown is not the same as recent.
 */
export function backlogOrder(targets: ProductTarget[], lastmod: Map<string, number>): ProductTarget[] {
  const food = new Map(targets.map((t) => [t.storeProductId, looksLikeFood(t.url)]));
  return [...targets].sort(
    (a, b) =>
      Number(food.get(b.storeProductId)) - Number(food.get(a.storeProductId)) ||
      (lastmod.get(b.storeProductId) ?? -Infinity) - (lastmod.get(a.storeProductId) ?? -Infinity)
  );
}
