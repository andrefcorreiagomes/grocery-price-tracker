import { prisma } from "../../lib/db";

/**
 * Maintains `CataloguePrice`: one row per price a product has held, rather than
 * one per day it was observed.
 *
 * Every crawl already reads every product's price off its listing tile, so this
 * records something we were previously throwing away. The work is set-based -
 * a crawl touches 42,000 products, and doing this per product would cost more
 * than the crawl itself.
 */

/** Match `CHUNK` in persist.ts: SQLite commits per statement unless batched. */
const CHUNK = 500;

export interface PriceObservation {
  productId: string;
  price: number | null;
}

export interface PriceHistorySummary {
  /** products whose price held, so their open period was extended */
  unchanged: number;
  /** products whose price moved: a period closed and a new one opened */
  changed: number;
  /** products seen for the first time, or seen again after having no open period */
  opened: number;
  /** products the store listed without a price */
  skipped: number;
}

/**
 * Compare on cents, not on the raw float. Two readings of "1.99" should never
 * count as a price change because of how the number was represented on the way
 * in or out of the database.
 */
function cents(price: number): number {
  return Math.round(price * 100);
}

/** Run `work` over `items` in batches, so no single statement gets unwieldy. */
async function inChunks<T>(items: T[], work: (batch: T[]) => Promise<unknown>) {
  for (let i = 0; i < items.length; i += CHUNK) {
    await work(items.slice(i, i + CHUNK));
  }
}

/**
 * Record what each product cost at `seenAt`.
 *
 * Three outcomes per product: the open period is extended, or closed and
 * replaced, or a first one is opened. Note what does NOT happen - a product
 * that was missing from recent crawls and reappears at its old price simply has
 * its period extended, leaving the gap between the two observations visible in
 * the timestamps rather than recording a false continuity.
 */
export async function recordPrices(
  observations: PriceObservation[],
  seenAt: Date
): Promise<PriceHistorySummary> {
  const priced = observations.filter(
    (o): o is { productId: string; price: number } => o.price !== null
  );
  const summary: PriceHistorySummary = {
    unchanged: 0,
    changed: 0,
    opened: 0,
    skipped: observations.length - priced.length,
  };
  if (priced.length === 0) return summary;

  // One read of the open periods for everything in this run.
  const open = new Map<string, { id: string; price: number }>();
  await inChunks(priced, async (batch) => {
    const rows = await prisma.cataloguePrice.findMany({
      where: { productId: { in: batch.map((o) => o.productId) }, isOpen: true },
      select: { id: true, productId: true, price: true },
    });
    for (const row of rows) open.set(row.productId, { id: row.id, price: row.price });
  });

  const extend: string[] = []; // period ids whose price still holds
  const close: string[] = []; // period ids the price has moved on from
  const create: { productId: string; price: number }[] = [];

  for (const observation of priced) {
    const current = open.get(observation.productId);
    if (!current) {
      create.push(observation);
      summary.opened++;
    } else if (cents(current.price) === cents(observation.price)) {
      extend.push(current.id);
      summary.unchanged++;
    } else {
      close.push(current.id);
      create.push(observation);
      summary.changed++;
    }
  }

  // The unchanged case is the overwhelming majority, and is one statement per
  // batch: grocery prices are sticky, so most of a daily crawl lands here.
  await inChunks(extend, (batch) =>
    prisma.cataloguePrice.updateMany({ where: { id: { in: batch } }, data: { lastSeenAt: seenAt } })
  );

  // Closed periods keep their own lastSeenAt: it records when that price was
  // last true, which is exactly what a reader of the series wants.
  await inChunks(close, (batch) =>
    prisma.cataloguePrice.updateMany({ where: { id: { in: batch } }, data: { isOpen: false } })
  );

  await inChunks(create, (batch) =>
    prisma.cataloguePrice.createMany({
      data: batch.map((o) => ({
        productId: o.productId,
        price: o.price,
        firstSeenAt: seenAt,
        lastSeenAt: seenAt,
      })),
    })
  );

  return summary;
}

/**
 * Open a period for any product that has a price but no open period.
 *
 * Run once after the table is introduced, so the 42,000 prices already sitting
 * in `CatalogueProduct` are kept rather than being recorded only if each product
 * survives to the next crawl. Idempotent, so it also repairs a product that
 * somehow ends up with no open period.
 *
 * The timestamps come from the product's own `lastSeenAt` and mean "known to be
 * this price at this moment", NOT "started being this price then" - when the
 * current price actually began is something we do not know, and taking
 * `firstSeenAt` from the product would assert it falsely.
 */
export async function backfillPriceHistory(): Promise<{ opened: number; skipped: number }> {
  const products = await prisma.catalogueProduct.findMany({
    where: { price: { not: null } },
    select: { id: true, price: true, lastSeenAt: true },
  });

  const withOpen = new Set<string>();
  await inChunks(products, async (batch) => {
    const rows = await prisma.cataloguePrice.findMany({
      where: { productId: { in: batch.map((p) => p.id) }, isOpen: true },
      select: { productId: true },
    });
    for (const row of rows) withOpen.add(row.productId);
  });

  const missing = products.filter((p) => !withOpen.has(p.id));
  await inChunks(missing, (batch) =>
    prisma.cataloguePrice.createMany({
      data: batch.map((p) => ({
        productId: p.id,
        price: p.price as number,
        firstSeenAt: p.lastSeenAt,
        lastSeenAt: p.lastSeenAt,
      })),
    })
  );

  return { opened: missing.length, skipped: products.length - missing.length };
}
