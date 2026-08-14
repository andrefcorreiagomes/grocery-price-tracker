import { sleep } from "../http";

/**
 * Hits pulled per store per term during discovery. Deliberately shallow: the
 * tracker wants a few dozen good comparison groups, not exhaustive coverage,
 * and walking a broad term's full result set cost ~40 requests and 90 seconds
 * before any judgment could start.
 *
 * The number is the same for every store on purpose. All three run Salesforce
 * Commerce Cloud but serve different page sizes (Continente's grid gives 35 per
 * request, Pingo Doce and Auchan up to 100), so capping by *pages* would sample
 * Continente at a third the depth of the others - and an under-sampled store is
 * exactly what makes a group look 2/3 when it is really 3/3. Equal denominators
 * are what make "found at 2 of 3 stores" mean anything.
 */
export const SEARCH_LIMIT = 60;

/**
 * Collects up to `limit` distinct hits by walking a store's result offsets.
 *
 * Two failure modes this guards against, both found the hard way:
 *
 * - Reading only the first page silently capped every search at 35 hits from
 *   Continente, ~18 from Pingo Doce and 24 from Auchan. The tell was those
 *   three numbers recurring across five unrelated terms. A cap is fine; a cap
 *   you don't know about is not, which is why `limit` is explicit and uniform
 *   rather than whatever a store happens to serve.
 * - Tiles repeat across grid/list markup and can overlap page boundaries, so
 *   dedupe by product id rather than trusting page arithmetic.
 */
export async function collectHits<T>(
  fetchPage: (start: number) => Promise<T[]>,
  idOf: (item: T) => string,
  pageSize: number,
  limit = SEARCH_LIMIT
): Promise<T[]> {
  const byId = new Map<string, T>();

  for (let start = 0; byId.size < limit; start += pageSize) {
    const items = await fetchPage(start);
    if (items.length === 0) break;

    const sizeBefore = byId.size;
    for (const item of items) byId.set(idOf(item), item);

    // a page that adds nothing means we've wrapped onto already-seen results -
    // some stores clamp an out-of-range offset back to the last valid page
    // rather than returning an empty grid
    if (byId.size === sizeBefore) break;
    if (items.length < pageSize) break;

    if (byId.size < limit) await sleep(300);
  }

  // a store whose page size overshoots the limit would otherwise report a
  // bigger denominator than the others
  return [...byId.values()].slice(0, limit);
}
