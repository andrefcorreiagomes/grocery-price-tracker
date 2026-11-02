import { prisma } from "../../lib/db";
import { ASSUMED_FOR_SALE, type Availability } from "../types";

/**
 * Maintains `CataloguePrice`: one row per price a product has held - and, since
 * 2 November 2026, per spell in or out of stock - rather than one per day it
 * was observed.
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
  /** What the store's reader said (see Availability); "unknown" when it could not say. */
  availability: Availability;
  availabilitySign: string;
}

export interface PriceHistorySummary {
  /** products whose price and availability held, so their open period was extended */
  unchanged: number;
  /** products whose price moved: a period closed and a new one opened */
  changed: number;
  /**
   * products whose price held but whose availability changed - out of stock,
   * or back. The first night after 1 November 2026 every product lands here
   * once, leaving "assumed_for_sale" for a measured answer.
   */
  availabilityChanged?: number;
  /** products seen for the first time, or seen again after having no open period */
  opened: number;
  /**
   * products the store listed without a price. Recorded since 2 November 2026
   * - a period with an empty price - so their days out of stock are not a gap.
   */
  skipped: number;
  /** products whose reader could not tell whether they are for sale */
  unknown?: number;
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

/** Same price: both empty, or the same cents. */
function samePrice(a: number | null, b: number | null): boolean {
  return a === null || b === null ? a === b : cents(a) === cents(b);
}

/**
 * Record what each product cost at `seenAt`, and whether it was for sale.
 *
 * A period is one price AND one availability: it is extended while both hold,
 * and closed and replaced when either changes - so a product out of stock at
 * its usual price gets a period of its own, and the days it was out of stock
 * can be read from the history (the owner's design, 1 November 2026). The
 * sign is the one that opened the period.
 *
 * Note what does NOT happen - a product that was missing from recent crawls
 * and reappears as before simply has its period extended, leaving the gap
 * between the two observations visible in the timestamps rather than
 * recording a false continuity.
 */
export async function recordPrices(
  observations: PriceObservation[],
  seenAt: Date
): Promise<PriceHistorySummary> {
  const summary: PriceHistorySummary = {
    unchanged: 0,
    changed: 0,
    availabilityChanged: 0,
    opened: 0,
    skipped: observations.filter((o) => o.price === null).length,
    unknown: observations.filter((o) => o.availability === "unknown").length,
  };
  if (observations.length === 0) return summary;

  // One read of the open periods for everything in this run.
  const open = new Map<string, { id: string; price: number | null; availability: string }>();
  await inChunks(observations, async (batch) => {
    const rows = await prisma.cataloguePrice.findMany({
      where: { productId: { in: batch.map((o) => o.productId) }, isOpen: true },
      select: { id: true, productId: true, price: true, availability: true },
    });
    for (const row of rows) open.set(row.productId, row);
  });

  const extend: string[] = []; // period ids whose price and availability still hold
  const close: string[] = []; // period ids the product has moved on from
  const create: PriceObservation[] = [];

  for (const observation of observations) {
    const current = open.get(observation.productId);
    if (!current) {
      create.push(observation);
      summary.opened++;
    } else if (!samePrice(current.price, observation.price)) {
      close.push(current.id);
      create.push(observation);
      summary.changed++;
    } else if (current.availability !== observation.availability) {
      close.push(current.id);
      create.push(observation);
      summary.availabilityChanged = (summary.availabilityChanged ?? 0) + 1;
    } else {
      extend.push(current.id);
      summary.unchanged++;
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
        availability: o.availability,
        availabilitySign: o.availabilitySign,
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
        // Copied from the product, not read from a store: nobody looked.
        availability: ASSUMED_FOR_SALE,
        firstSeenAt: p.lastSeenAt,
        lastSeenAt: p.lastSeenAt,
      })),
    })
  );

  return { opened: missing.length, skipped: products.length - missing.length };
}
