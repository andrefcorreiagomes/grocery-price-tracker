import { fetchHtml, HttpError } from "../http";
import { parsePingoDoceTiles, parsePingoDoceTotal } from "../search/pingodoce";
import type { SearchHit } from "../search/types";
import { PINGO_DOCE_FOOD_CATEGORIES, type PingoDoceDepartment } from "./pingodoce-categories";

/**
 * Pingo Doce's department listing pages: the store's own product counts, and a
 * small sample of each department, over a route robots.txt allows.
 *
 * WHAT THIS USED TO BE. Until it was checked, this file walked
 * `/on/demandware.store/.../Search-Show?cgid=&start=&sz=` page by page and
 * returned whole departments. Pingo Doce's robots.txt disallows the endpoint
 * and all three parameters - four separate rules - so that route is gone.
 *
 * WHY IT IS STILL WORTH HAVING. A plain department page
 * (`/home/produtos/mercearia`) is allowed, is advertised in the store's own
 * sitemap, and publishes the department's TOTAL product count. That count is
 * the only independent yardstick the project has for Pingo Doce: the sitemap
 * says what URLs exist, the product pages say what each one holds, and neither
 * can answer "does the shop think it sells more than we know about?".
 *
 * WHAT IT CANNOT DO, measured over all 276 food category pages rather than
 * assumed:
 *
 *     231 of 276 pages rendered exactly 14 tiles
 *     226 of 276 showed fewer products than their own published count
 *     2,583 distinct products reachable, of 9,059 published - 28.4%
 *     0 of them carrying a pack size
 *
 * Fourteen is a hard ceiling: the "load more" control posts to
 * `Search-UpdateGrid`, under the disallowed `/on/demandware.store/`. So this is
 * a coverage check and a cheap price sample, and it is NOT a catalogue crawl.
 * The catalogue comes from `pingodoce-products.ts`, one product page at a time.
 *
 * The tile parsers below are unchanged and still correct - they were never the
 * problem. Only the address they are pointed at has changed.
 */

export interface DepartmentCount {
  department: PingoDoceDepartment;
  /**
   * The store's own count for the department, or null when the page stopped
   * publishing one - which is itself worth reporting, since it is this file's
   * whole reason for existing.
   */
  published: number | null;
  /**
   * The tiles the page rendered. At most ~14, and always the same ones, so this
   * is a SAMPLE and must never be mistaken for the department. Named `sample`
   * rather than `products` so no caller can read it as a crawl result by
   * accident.
   */
  sample: SearchHit[];
  /** set when the page could not be read at all */
  error?: string;
}

/**
 * Read each food department's listing page. One request per department -
 * nineteen in total, about twenty seconds.
 *
 * A department that fails is recorded and the walk continues: a missing count
 * degrades one row of a report, and abandoning the run would lose the other
 * eighteen.
 */
export async function readPingoDoceDepartments(
  opts: { departments?: PingoDoceDepartment[] } = {}
): Promise<DepartmentCount[]> {
  const departments = opts.departments ?? PINGO_DOCE_FOOD_CATEGORIES;
  const results: DepartmentCount[] = [];

  for (const department of departments) {
    try {
      const html = await fetchHtml(department.url);
      results.push({
        department,
        published: parsePingoDoceTotal(html),
        sample: parsePingoDoceTiles(html),
      });
    } catch (error) {
      const err = error as Error;
      results.push({
        department,
        published: null,
        sample: [],
        error: err instanceof HttpError ? `HTTP ${err.status}` : err.message.slice(0, 80),
      });
    }
  }

  return results;
}

export interface CoverageRow {
  label: string;
  /** what the store says the department holds */
  published: number | null;
  /** what we hold for it */
  held: number;
  /** published minus held, or null when the store published no count */
  gap: number | null;
  error?: string;
}

/**
 * Compare each department's published count against what the catalogue holds.
 *
 * `held` is counted by the caller from the database, because this module stays
 * DB-free like every other crawler here.
 *
 * A NEGATIVE gap is not an error and must not be reported as one: we hold
 * products the department no longer lists, which is what delisted-but-not-yet-
 * confirmed rows look like, and they are kept on purpose.
 */
export function coverageRows(
  counts: DepartmentCount[],
  heldBySlug: Map<string, number>
): CoverageRow[] {
  return counts.map((c) => {
    const held = heldBySlug.get(c.department.slug) ?? 0;
    return {
      label: c.department.label,
      published: c.published,
      held,
      gap: c.published === null ? null : c.published - held,
      error: c.error,
    };
  });
}
