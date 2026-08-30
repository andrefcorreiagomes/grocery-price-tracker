import { PINGO_DOCE_SECTIONS } from "./pingodoce-sitemap";

/**
 * Pingo Doce's food departments, as LISTING PAGE URLs.
 *
 * This file used to hold `cgid`s - `ec_mercearia_1300` and friends - read by
 * hand from each department's landing page and fed to
 * `Search-Show?cgid=&start=&sz=`. Every part of that request is disallowed by
 * robots.txt, so the cgids are gone with the route that used them.
 *
 * A department's plain listing page carries no query string at all:
 *
 *     https://www.pingodoce.pt/home/produtos/mercearia
 *
 * Nothing in robots.txt forbids it, and Pingo Doce publishes all 543 of these
 * pages in `sitemap_2.xml`, which is an invitation rather than a loophole.
 *
 * WHAT THESE PAGES ARE GOOD FOR, measured over all 276 food category pages:
 *
 *   - the store's OWN product count per department, which is the only
 *     independent yardstick for "does the catalogue we hold still match the
 *     shop?" Nothing else publishes it.
 *   - NOT a catalogue crawl. Each page renders at most 14 tiles - 231 of the
 *     276 rendered exactly 14 - and the "load more" control posts to
 *     `Search-UpdateGrid` under `/on/demandware.store/`, which is disallowed.
 *     So the whole route reaches 2,583 distinct products, 28.4% of the 9,059
 *     the sitemap publishes, and it is the SAME 2,583 every time. It also
 *     carries no pack size, because no listing tile at any store does.
 *
 * The catalogue itself comes from `pingodoce-products.ts`, one product page at
 * a time.
 */

export interface PingoDoceDepartment {
  /** URL slug, e.g. "mercearia" */
  slug: string;
  label: string;
  /** the department's listing page - no query string, allowed, in the sitemap */
  url: string;
}

/**
 * Derived from `PINGO_DOCE_SECTIONS` rather than listed again here, so a
 * department can never be food for the sitemap crawler and absent from the
 * coverage check, or the reverse. That divergence is exactly the kind of thing
 * that hides for months.
 */
export const PINGO_DOCE_FOOD_CATEGORIES: PingoDoceDepartment[] = Object.entries(
  PINGO_DOCE_SECTIONS
)
  .filter(([, section]) => section.kind === "food")
  .map(([slug, section]) => ({
    slug,
    label: section.label,
    url: `https://www.pingodoce.pt/home/produtos/${slug}`,
  }));
