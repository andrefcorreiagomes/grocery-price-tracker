import type { SearchHit } from "../search/types";

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
}
