import type { ProductNote } from "./daily-report";

/**
 * What a nightly run learned beyond today's prices: which published ids it had
 * never opened, what they turned out to be, and how much of the store is still
 * unexamined.
 *
 * This is the half of the report that answers "is the catalogue COMPLETE?",
 * which is a different question from "are its prices FRESH?" and was previously
 * unanswerable - the compliant crawler could only ever refresh products it
 * already held.
 */
export interface DiscoveryExtras {
  /** product ids the sitemap published this run */
  sitemapEntries: number;
  /** what it published last run, for the shrink guard */
  sitemapPrevious: number | null;
  /**
   * False when the sitemap came back suspiciously smaller than last time. A
   * truncated file is far likelier than a store losing thousands of products
   * overnight, so discovery is skipped rather than acted on.
   */
  sitemapTrusted: boolean;
  /**
   * Set when the sitemap could not be read at all, as opposed to being read and
   * disbelieved. Distinguished because they call for different responses: an
   * outage fixes itself, a sitemap that shrank by a third does not.
   */
  sitemapError: string | null;

  /** ids opened for the FIRST time this run, drawn from the backlog */
  examined: number;
  /** ids re-opened because their verdict had gone stale */
  rechecked: number;
  verdictNotFood: number;
  verdictDead: number;
  /** ids that turned out to be food and entered the catalogue */
  newFood: ProductNote[];
  newFoodCount: number;

  /** published ids still never opened */
  unexaminedRemaining: number;
  /** at this run's rate, nights until nothing is unexamined */
  nightsToComplete: number | null;

  /** products we hold that the sitemap no longer lists - an early warning */
  droppedFromSitemap: ProductNote[];
  droppedFromSitemapCount: number;

  /** products that reached three consecutive dead nights this run */
  delistedNow: ProductNote[];
  delistedNowCount: number;
  /** products still live but no longer in a food section */
  recategorised: ProductNote[];
  recategorisedCount: number;

  /**
   * Pages that failed in a way that does NOT mean "gone" - a 5xx, a socket
   * error. Deliberately not counted towards delisting.
   */
  unreachable: number;
}

/** Examples carried per list, matching the other reports. */
export const SAMPLE = 12;

export function nightsToComplete(remaining: number, perNight: number): number | null {
  if (remaining <= 0) return 0;
  if (perNight <= 0) return null;
  return Math.ceil(remaining / perNight);
}
