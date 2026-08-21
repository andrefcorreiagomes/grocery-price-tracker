import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";

/**
 * How big the catalogue is, per store, and how that moved since the last run.
 *
 * The crawl reports plenty about what it DID - refreshed, examined, delisted -
 * but nothing about the size of the thing it is maintaining. A catalogue that
 * grows by 40 products a night and one that grows by 4,000 look identical in
 * every other figure, and so do a catalogue holding steady and one quietly
 * shrinking because a section stopped being reached.
 *
 * All three stores appear, not only the one that ran. The catalogue is shared,
 * and a store whose crawler has silently stopped shows here as a flat line -
 * which is exactly the symptom that is otherwise invisible, because a crawler
 * that never runs produces no report to notice.
 */

export interface StoreSize {
  store: Store;
  total: number;
  /** rows kept but no longer offered to the app */
  delisted: number;
}

export interface StoreSizeChange extends StoreSize {
  /** the same store at the previous run, when there was one */
  previousTotal: number | null;
  /** signed change against that, or null when there is nothing to compare */
  percent: number | null;
}

const STORES: Store[] = ["CONTINENTE", "PINGO_DOCE", "AUCHAN"];

/** Count every store's rows. Six cheap indexed counts. */
export async function catalogueSizes(): Promise<StoreSize[]> {
  const sizes = await Promise.all(
    STORES.map(async (store) => ({
      store,
      total: await prisma.catalogueProduct.count({ where: { store } }),
      delisted: await prisma.catalogueProduct.count({
        where: { store, delistedAt: { not: null } },
      }),
    }))
  );
  return sizes;
}

/**
 * Attach the previous run's figures. A store absent from the previous run is
 * reported with a null percentage rather than as growth from zero, which would
 * read as the catalogue having just been created.
 */
export function compareSizes(now: StoreSize[], before: StoreSize[]): StoreSizeChange[] {
  const previous = new Map(before.map((s) => [s.store, s.total]));
  return now.map((size) => {
    const previousTotal = previous.get(size.store) ?? null;
    const percent =
      previousTotal === null || previousTotal === 0
        ? null
        : (100 * (size.total - previousTotal)) / previousTotal;
    return { ...size, previousTotal, percent };
  });
}

/** The most recent run that recorded sizes, for any store. */
export async function previousSizes(before: Date): Promise<StoreSize[]> {
  const run = await prisma.crawlRun.findFirst({
    where: { catalogueSizes: { not: null }, startedAt: { lt: before } },
    orderBy: { startedAt: "desc" },
    select: { catalogueSizes: true },
  });
  if (!run?.catalogueSizes) return [];
  try {
    return JSON.parse(run.catalogueSizes) as StoreSize[];
  } catch {
    // Unreadable history costs a comparison, not a run.
    return [];
  }
}
