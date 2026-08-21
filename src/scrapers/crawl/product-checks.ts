import { prisma } from "../../lib/db";
import type { Store, Verdict } from "@/generated/prisma/client";

/**
 * The record of product ids we opened and decided not to keep.
 *
 * Continente publishes ~101,000 product ids and we track ~17,000 of them as
 * food. Finding out what the other ~84,000 are costs one request each, about 24
 * hours in total - and until now that answer was thrown away, so every discovery
 * run paid the full 24 hours again. Writing the verdict down turns discovery
 * into a set subtraction plus a handful of fetches for whatever is new.
 *
 * Food deliberately lives in `CatalogueProduct` and nowhere else, so a product
 * has exactly one home and the two tables cannot disagree about it.
 */

/** How long a verdict is trusted before it goes back in the queue. */
export const RECHECK_AFTER_DAYS = 90;

export interface CheckResult {
  storeProductId: string;
  url: string;
  verdict: Verdict;
  name?: string | null;
  categoryPath?: string | null;
}

/** Every id we have already judged, for subtracting from the sitemap. */
export async function checkedIds(store: Store): Promise<Set<string>> {
  const rows = await prisma.productCheck.findMany({
    where: { store },
    select: { storeProductId: true },
  });
  return new Set(rows.map((r) => r.storeProductId));
}

/**
 * Write verdicts. Re-judging an id updates it in place and bumps `checkCount`
 * rather than adding a row, so the table stays one row per product and the
 * count doubles as "how many times have we come back to this".
 */
export async function recordChecks(
  store: Store,
  results: CheckResult[],
  checkedAt: Date
): Promise<{ written: number; notFood: number; dead: number }> {
  let notFood = 0;
  let dead = 0;

  for (const r of results) {
    if (r.verdict === "NOT_FOOD") notFood++;
    else dead++;

    await prisma.productCheck.upsert({
      where: { store_storeProductId: { store, storeProductId: r.storeProductId } },
      create: {
        store,
        storeProductId: r.storeProductId,
        url: r.url,
        verdict: r.verdict,
        name: r.name ?? null,
        categoryPath: r.categoryPath ?? null,
        checkedAt,
      },
      update: {
        url: r.url,
        verdict: r.verdict,
        name: r.name ?? null,
        categoryPath: r.categoryPath ?? null,
        checkedAt,
        checkCount: { increment: 1 },
      },
    });
  }

  return { written: results.length, notFood, dead };
}

export interface CheckTotals {
  notFood: number;
  dead: number;
  total: number;
}

/** How the rejected ids break down, for the report. */
export async function checkTotals(store: Store): Promise<CheckTotals> {
  const [notFood, dead] = await Promise.all([
    prisma.productCheck.count({ where: { store, verdict: "NOT_FOOD" } }),
    prisma.productCheck.count({ where: { store, verdict: "DEAD" } }),
  ]);
  return { notFood, dead, total: notFood + dead };
}

/** The ProductCheck totals recorded by the most recent run before `before`. */
export async function previousCheckTotals(
  store: Store,
  before: Date
): Promise<CheckTotals | null> {
  const run = await prisma.crawlRun.findFirst({
    where: { store, checkNotFood: { not: null }, startedAt: { lt: before } },
    orderBy: { startedAt: "desc" },
    select: { checkNotFood: true, checkDead: true },
  });
  if (run?.checkNotFood == null || run.checkDead == null) return null;
  return { notFood: run.checkNotFood, dead: run.checkDead, total: run.checkNotFood + run.checkDead };
}

export interface CheckTotalsChange extends CheckTotals {
  previousTotal: number | null;
  /** signed change against the previous run, null when nothing to compare */
  percent: number | null;
  /**
   * True when the table SHRANK. ProductCheck only ever grows in normal
   * operation, so a fall is not slow drift to warn about later - it means rows
   * left a table nothing deletes from, which is worth flagging at once.
   */
  shrank: boolean;
}

/**
 * Attach the previous run's totals. Kept pure and separate from the read so the
 * arithmetic - which is where the edge cases live - can be tested without a
 * database.
 */
export function compareCheckTotals(
  now: CheckTotals,
  previous: CheckTotals | null
): CheckTotalsChange {
  const previousTotal = previous?.total ?? null;
  const percent =
    previousTotal === null || previousTotal === 0
      ? null
      : (100 * (now.total - previousTotal)) / previousTotal;
  return {
    ...now,
    previousTotal,
    percent,
    shrank: previousTotal !== null && now.total < previousTotal,
  };
}

/**
 * Verdicts old enough to be worth asking again. A delisted product can come
 * back and a non-food item can be recategorised; without this the table would
 * slowly become a way of being permanently wrong.
 */
export async function staleChecks(
  store: Store,
  limit: number,
  now: Date
): Promise<{ storeProductId: string; url: string }[]> {
  const cutoff = new Date(now.getTime() - RECHECK_AFTER_DAYS * 86_400_000);
  return prisma.productCheck.findMany({
    where: { store, checkedAt: { lt: cutoff } },
    select: { storeProductId: true, url: true },
    orderBy: { checkedAt: "asc" },
    take: limit,
  });
}

/**
 * Delisted products old enough to be worth asking again, on the same schedule.
 * They are excluded from the nightly queue - re-fetching a page we know is gone,
 * every night, forever, is the thing `lastCheckedAt` exists to prevent - but
 * they should not be abandoned entirely either.
 */
export async function staleDelisted(
  store: Store,
  limit: number,
  now: Date
): Promise<{ storeProductId: string; url: string }[]> {
  const cutoff = new Date(now.getTime() - RECHECK_AFTER_DAYS * 86_400_000);
  const rows = await prisma.catalogueProduct.findMany({
    where: {
      store,
      delistedAt: { not: null },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: cutoff } }],
    },
    select: { storeProductId: true, url: true },
    orderBy: { lastCheckedAt: "asc" },
    take: limit,
  });
  return rows;
}

/**
 * Record that a product page did not answer.
 *
 * Only a page that actually said the product is gone should land here - a 5xx
 * or a socket error means we could not tell, and counting those would let one
 * bad night mark thousands of products delisted. Three consecutive nights sets
 * `delistedAt`, which drops the product out of the nightly queue and is what a
 * user-facing catalogue would filter on. Nothing is deleted: the row and its
 * whole price history stay.
 */
export const DEAD_NIGHTS_BEFORE_DELISTING = 3;

export async function recordDead(
  store: Store,
  storeProductIds: string[],
  checkedAt: Date
): Promise<{ delisted: string[] }> {
  const delisted: string[] = [];

  for (const storeProductId of storeProductIds) {
    const row = await prisma.catalogueProduct.update({
      where: { store_storeProductId: { store, storeProductId } },
      data: { deadCount: { increment: 1 }, lastCheckedAt: checkedAt },
      select: { deadCount: true, delistedAt: true },
    });

    if (row.deadCount >= DEAD_NIGHTS_BEFORE_DELISTING && row.delistedAt === null) {
      await prisma.catalogueProduct.update({
        where: { store_storeProductId: { store, storeProductId } },
        data: { delistedAt: checkedAt },
      });
      delisted.push(storeProductId);
    }
  }

  return { delisted };
}

/**
 * A product we hold that is still live but has left the food sections. It stops
 * being tracked immediately rather than after three nights: the page answered,
 * so there is nothing uncertain about it.
 */
export async function recordRecategorised(
  store: Store,
  storeProductIds: string[],
  checkedAt: Date
): Promise<void> {
  if (storeProductIds.length === 0) return;
  await prisma.catalogueProduct.updateMany({
    where: { store, storeProductId: { in: storeProductIds } },
    data: { delistedAt: checkedAt, lastCheckedAt: checkedAt },
  });
}

/** Mark an attempt without judging it - used when the failure was transient. */
export async function touchChecked(
  store: Store,
  storeProductIds: string[],
  checkedAt: Date
): Promise<void> {
  if (storeProductIds.length === 0) return;
  await prisma.catalogueProduct.updateMany({
    where: { store, storeProductId: { in: storeProductIds } },
    data: { lastCheckedAt: checkedAt },
  });
}
