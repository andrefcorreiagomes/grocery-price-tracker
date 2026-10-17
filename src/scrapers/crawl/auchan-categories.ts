import * as cheerio from "cheerio";
import { fetchHtml } from "../http";
import type { CrawlCategory } from "./types";
import { topSectionKind } from "../../lib/store-sections";

/**
 * Auchan food filter, and the food department ids for the faster crawl mode.
 *
 * Two things live here because they are two answers to one question - "which of
 * Auchan's products are food?":
 *
 * 1. `isFoodSegment` judges a product by the top segment of its OWN category
 *    path, as decided in data/store-sections.ts. This is what makes the `root`
 *    crawl safe: we walk everything and keep what Auchan itself labels as food.
 * 2. `discoverFoodDepartments` finds the ids of the five food departments, so
 *    the `departments` crawl mode can fetch only those instead of the whole
 *    54,859-product catalogue. Auchan serves ~13 products/second whatever we
 *    ask, so fetching less is the only thing that makes a crawl faster.
 *
 * The decisions still apply in both modes: a department page carries some
 * cross-listed non-food, and rule 1 filters it out.
 */

/**
 * Does Auchan's own top segment hold food? Decided in data/store-sections.ts:
 * true for a food or a mixed segment. (`o-mundo-do-bebé` holds ordinary
 * biscuits next to nappies and is decided non-food there; baby food is its own
 * piece of work.)
 */
export function isFoodSegment(segment: string): boolean {
  const kind = topSectionKind("AUCHAN", segment);
  return kind === "food" || kind === "mixed";
}

/**
 * The five food departments, by the URL slug of their landing page. Slugs are
 * stable - they are the first path segment of every product URL we store - so
 * these are safe to hardcode.
 *
 * Their `cgid`s are NOT. Measured, the ids are `alimentacao-`,
 * `bebidas-e-garrafeira`, `produtos-frescos`,
 * `biologico-e-escolhas-alimentares` and `Congelados_2026`: two cannot be
 * derived from the slug, and one carries a year that will roll over. So the
 * crawler reads each id off its landing page at run time rather than keeping a
 * list that would quietly rot.
 */
export const AUCHAN_FOOD_DEPARTMENT_SLUGS: { slug: string; label: string }[] = [
  { slug: "alimentacao", label: "Alimentação" },
  { slug: "produtos-frescos", label: "Produtos Frescos" },
  { slug: "bebidas-e-garrafeira", label: "Bebidas e Garrafeira" },
  { slug: "congelados", label: "Congelados" },
  { slug: "biologicos-e-alternativas", label: "Biológicos e Alternativas" },
];

/** Pull the grid `cgid` out of a category landing page's "ver mais produtos" control. */
export function parseDepartmentCgid(html: string): string | null {
  const $ = cheerio.load(html);
  const dataUrl = $("[data-url*='Search-UpdateGrid']").first().attr("data-url");
  const source = dataUrl ?? html;
  const match = source.match(/Search-UpdateGrid\?cgid=([^&"'\s]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Fetch each food department's landing page and read its grid `cgid`. Five
 * requests once per crawl, in exchange for ids that cannot go stale.
 *
 * A department whose id cannot be read is reported rather than skipped silently
 * - losing a whole department to a markup change is exactly the kind of quiet
 * failure this crawler has been bitten by before.
 */
export async function discoverFoodDepartments(): Promise<{
  departments: CrawlCategory[];
  failed: string[];
}> {
  const departments: CrawlCategory[] = [];
  const failed: string[] = [];

  for (const { slug, label } of AUCHAN_FOOD_DEPARTMENT_SLUGS) {
    const html = await fetchHtml(`https://www.auchan.pt/pt/${slug}/`);
    const cgid = parseDepartmentCgid(html);
    if (cgid) departments.push({ cgid, label });
    else failed.push(slug);
  }

  return { departments, failed };
}
