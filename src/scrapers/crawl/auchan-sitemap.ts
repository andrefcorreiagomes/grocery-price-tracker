import { fetchHtml } from "../http";
import { productSitemapsFromIndex } from "./sitemap-index";

/**
 * Auchan's own list of the products it sells: the sitemap its robots.txt
 * names (code review M2, 22 October 2026).
 *
 * Auchan is crawled by walking its listing grids, which has no independent
 * list to check completeness against - or so its crawler said, until the
 * sitemap was looked at. Its index lists two product files; together, on
 * 22 October 2026, 61,996 product addresses, food and non-food. 17,775 of the
 * 17,781 products the walk had seen in the last two days were in them. Of the
 * 594 products we held as on sale that the walk had not seen for days or
 * weeks, and whose pages did not say "out of stock", only 72 were.
 *
 * So it is used for one thing: a product missing from the walk AND from this
 * list, whose page does not say "out of stock", counts a night toward
 * delisting, as a product missing from Pingo Doce's sitemap does. Three
 * requests a night: the index and the two files (about 19 MB unpacked).
 */

export const AUCHAN_SITEMAP_INDEX = "https://www.auchan.pt/sitemap_index.xml";

export interface AuchanSitemap {
  /** every product id the product files list */
  ids: Set<string>;
  /** entries per file, in the order the index lists them */
  perFile: { url: string; entries: number }[];
}

/**
 * The product id an Auchan address ends with: `.../10.html` is product 10,
 * the id we store. Null for an address that does not end that way.
 */
export function auchanIdFromUrl(url: string): string | null {
  const id = url.match(/\/([^/]+)\.html$/)?.[1];
  if (!id) return null;
  try {
    return decodeURIComponent(id);
  } catch {
    return id;
  }
}

/** The ids one product file lists. Pure, for the checks. */
export function idsFromProductSitemap(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
    .map((m) => auchanIdFromUrl(m[1]))
    .filter((id): id is string => id !== null);
}

/**
 * What a product missing from the walk is, given its page and Auchan's list
 * (null when the list was not believed or not read). "gone" and "unlisted"
 * both count a dead night. A page saying "out of stock" keeps the product
 * whatever the list says: listed but not for sale is never gone (code review
 * H7). Pure, for the checks.
 */
export function missingProductVerdict(
  page: "gone" | "unavailable" | "alive" | "unreachable",
  listed: Set<string> | null,
  storeProductId: string
): "gone" | "unlisted" | "unavailable" | "alive" | "unreachable" {
  if (page === "gone" || page === "unavailable") return page;
  if (listed !== null && !listed.has(storeProductId)) return "unlisted";
  return page;
}

/**
 * Read the index and every product file it lists. All or none: a file that
 * fails throws, because half a list looks exactly like a shop that halved
 * overnight, and the caller would read the missing half as gone. The caller
 * then does without the list for the night.
 */
export async function readAuchanSitemap(): Promise<AuchanSitemap> {
  const files = productSitemapsFromIndex(await fetchHtml(AUCHAN_SITEMAP_INDEX));
  if (files.length === 0) throw new Error("the sitemap index listed no product file");
  const ids = new Set<string>();
  const perFile: { url: string; entries: number }[] = [];
  for (const url of files) {
    const listed = idsFromProductSitemap(await fetchHtml(url));
    for (const id of listed) ids.add(id);
    perFile.push({ url, entries: listed.length });
  }
  return { ids, perFile };
}
