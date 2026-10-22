import type { SearchHit } from "../search/types";

/**
 * Examples carried per list in the crawl reports; the counts are always exact,
 * the samples are not. One number for every report since 22 October 2026
 * (code review L3); four files each had a copy.
 */
export const SAMPLE = 12;

/** One crawlable store category: the store's grid id plus a human label. */
export interface CrawlCategory {
  cgid: string;
  label: string;
  /** approximate product count when curated, for sanity-checking a crawl */
  approxCount?: number;
}

export interface CrawlProgress {
  category: CrawlCategory;
  page: number;
  collected: number;
}

export interface CategoryResult {
  category: CrawlCategory;
  products: SearchHit[];
  /**
   * How many products the store said the category holds, when it publishes a
   * count. Compared against `products.length` to prove a crawl was complete -
   * a silent shortfall is how the first Pingo Doce crawl lost half the
   * catalogue without failing.
   */
  expected?: number;
  /**
   * Products dropped because an earlier category in the same run already listed
   * them. Needed to read `expected` honestly: a department can legitimately
   * yield fewer products than the store reports when it shares stock with one
   * crawled before it.
   */
  duplicates?: number;
}
