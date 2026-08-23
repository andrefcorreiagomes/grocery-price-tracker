import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";
import type { IdentitySwap } from "./persist";

/**
 * Two guards against a product changing its id.
 *
 * A product's identity is the id parsed from its Continente URL; everything else
 * comes from the page. So when the store re-issues a product under a new id -
 * GS1 requires a fresh GTIN on a significant change, and SKUs do get recycled -
 * the old id stops answering and a new one appears, and left alone that becomes
 * one product split into two rows with a severed price history.
 *
 *   Guard 1 (isChurnCatastrophe) is the brake: a run where a large fraction of
 *   the catalogue fails at once is a mass re-numbering or a site fault, not
 *   turnover. The caller freezes delisting and fails the run so an unattended
 *   schedule cannot wipe the catalogue over a weekend.
 *
 *   Guard 2 (reconcileByBarcode) is the repair: a newly discovered product that
 *   shares an exact barcode with a row that just disappeared is the same
 *   product, so its price history is carried across rather than restarted.
 */

// --- Guard 1 -------------------------------------------------------------

/** Below this share of attempted products failing, a run is normal churn. */
export const CHURN_LIMIT = 0.1;
/** Too few products attempted to judge a fraction meaningfully. */
export const MIN_ATTEMPTED = 500;

/**
 * Did an implausible fraction of the catalogue fail this run? Pure, so the
 * threshold logic is tested without a crawl.
 *
 * Only a COMPLETE pass can answer: a `--limit` run attempts a slice, where a
 * high dead fraction is expected (the stalest products are the likeliest dead)
 * and means nothing.
 */
export function isChurnCatastrophe(input: {
  dead: number;
  attempted: number;
  complete: boolean;
}): boolean {
  const { dead, attempted, complete } = input;
  if (!complete) return false;
  if (attempted < MIN_ATTEMPTED) return false;
  return dead / attempted > CHURN_LIMIT;
}

/** A phrased reason for the report, or null when there is no catastrophe. */
export function churnCatastropheReason(input: {
  dead: number;
  attempted: number;
  complete: boolean;
}): string | null {
  if (!isChurnCatastrophe(input)) return null;
  const pct = ((100 * input.dead) / input.attempted).toFixed(0);
  return (
    `${pct}% of the catalogue (${input.dead.toLocaleString()} of ${input.attempted.toLocaleString()}) ` +
    `failed to refresh this run - a mass re-numbering or a site fault, not turnover. ` +
    `Delisting was frozen; no product advanced toward removal. This run is not trusted.`
  );
}

// --- Guard 3 and the parser-regression brakes ----------------------------

/**
 * Above this share of comparable barcodes CHANGING, the barcode reader is
 * misreading rather than the store swapping thousands of products at once.
 */
export const SWAP_LIMIT = 0.02;
/**
 * Above this share of stored barcodes going unreadable, the page changed shape
 * or the reader broke. This is the exact signature of the `&amp;ean=` bug, which
 * returned null for every product for months without anything noticing.
 */
export const LOSS_LIMIT = 0.1;
/**
 * Grocery prices are sticky - a normal night moves a low single-digit
 * percentage. A third of the catalogue moving at once means the wrong number is
 * being read off the page.
 */
export const PRICE_CHURN_LIMIT = 0.3;

function storm(count: number, of: number, limit: number, complete: boolean): boolean {
  if (!complete) return false;
  if (of < MIN_ATTEMPTED) return false;
  return count / of > limit;
}

/** Too many ids arriving with a different barcode: the reader, not the store. */
export function isBarcodeSwapStorm(input: {
  swaps: number;
  compared: number;
  complete: boolean;
}): boolean {
  return storm(input.swaps, input.compared, SWAP_LIMIT, input.complete);
}

/** Too many stored barcodes going unreadable at once. */
export function isBarcodeLossStorm(input: {
  lost: number;
  compared: number;
  complete: boolean;
}): boolean {
  return storm(input.lost, input.compared, LOSS_LIMIT, input.complete);
}

/** Too many prices moving at once to be real. */
export function isPriceChurnStorm(input: {
  changed: number;
  priced: number;
  complete: boolean;
}): boolean {
  return storm(input.changed, input.priced, PRICE_CHURN_LIMIT, input.complete);
}

/** Phrased reasons for the report, empty when nothing is wrong. */
export function parserRegressionReasons(input: {
  swaps: number;
  lost: number;
  compared: number;
  changed: number;
  priced: number;
  complete: boolean;
}): string[] {
  const reasons: string[] = [];
  const pct = (n: number, of: number) => ((100 * n) / of).toFixed(0);

  if (isBarcodeSwapStorm({ swaps: input.swaps, compared: input.compared, complete: input.complete })) {
    reasons.push(
      `${pct(input.swaps, input.compared)}% of barcodes changed this run ` +
        `(${input.swaps.toLocaleString()} of ${input.compared.toLocaleString()}) - the barcode reader is ` +
        `misreading, not that many products swapping. Nothing was archived.`
    );
  }
  if (isBarcodeLossStorm({ lost: input.lost, compared: input.compared, complete: input.complete })) {
    reasons.push(
      `${pct(input.lost, input.compared)}% of stored barcodes became unreadable ` +
        `(${input.lost.toLocaleString()} of ${input.compared.toLocaleString()}) - the page shape or the ` +
        `barcode reader has changed. This is how the ean bug hid for months.`
    );
  }
  if (isPriceChurnStorm({ changed: input.changed, priced: input.priced, complete: input.complete })) {
    reasons.push(
      `${pct(input.changed, input.priced)}% of prices moved this run ` +
        `(${input.changed.toLocaleString()} of ${input.priced.toLocaleString()}) - grocery prices are sticky, so ` +
        `the price reader is probably reading the wrong number. NOTE: prices are written as the crawl ` +
        `runs, so these rows already exist; every period this run created shares its seenAt and can be reverted.`
    );
  }
  return reasons;
}

export interface ArchivedSwap {
  /** the id as it now reads on the tombstone */
  retiredId: string;
  /** the id, still live, now holding the new product */
  storeProductId: string;
  previousEan: string;
  incomingEan: string;
  /** the name the OLD product had, preserved because it was never overwritten */
  previousName: string;
  newName: string;
}

/** Deterministic, unique, and impossible to collide with a real Continente id. */
export function retiredId(storeProductId: string, seenAt: Date): string {
  return `${storeProductId}~retired-${seenAt.toISOString().slice(0, 10)}`;
}

/**
 * Resolve held-aside identity swaps: archive the old product, then let the new
 * one have the id.
 *
 * Called only once the brakes have cleared. The old row is renamed rather than
 * deleted, so its CataloguePrice history follows it untouched - those rows
 * reference the internal `id`, which never changes - and the two products end up
 * with two separate series instead of one spliced one.
 *
 * `delistedAt` is set immediately, with no three-night wait: another product
 * taking over the id is proof the old one is gone, not an inference from silence.
 */
export async function archiveIdentitySwaps(
  store: Store,
  swaps: IdentitySwap[],
  seenAt: Date
): Promise<ArchivedSwap[]> {
  const archived: ArchivedSwap[] = [];

  for (const swap of swaps) {
    const old = await prisma.catalogueProduct.findUnique({
      where: { store_storeProductId: { store, storeProductId: swap.storeProductId } },
      select: { id: true, name: true },
    });
    if (!old) continue; // vanished between the crawl and here; nothing to archive

    const retired = retiredId(swap.storeProductId, seenAt);
    await prisma.catalogueProduct.update({
      where: { id: old.id },
      data: { storeProductId: retired, delistedAt: seenAt, lastCheckedAt: seenAt },
    });

    archived.push({
      retiredId: retired,
      storeProductId: swap.storeProductId,
      previousEan: swap.previousEan,
      incomingEan: swap.incomingEan,
      previousName: old.name,
      newName: swap.incoming.name,
    });
  }

  return archived;
}

// --- Guard 2 -------------------------------------------------------------

export interface IdChange {
  oldId: string;
  newId: string;
  name: string;
  /** price periods carried from old to new */
  periodsCarried: number;
}

export interface AmbiguousMatch {
  newId: string;
  name: string;
  barcode: string;
  /** how many disappeared rows shared the barcode */
  candidates: number;
}

export interface ReidentificationResult {
  changes: IdChange[];
  ambiguous: AmbiguousMatch[];
}

/**
 * Reconcile newly discovered products against rows that just disappeared, by
 * exact barcode.
 *
 * A candidate old row is: same store, same `eanNormalized`, a different id, not
 * refreshed this run (`lastSeenAt < seenAt` - the disappearing side, never a
 * live cross-listing), and not already a tombstone. Exactly one candidate is an
 * id change; more than one is ambiguous and left for a human.
 */
export async function reconcileByBarcode(
  store: Store,
  newIds: string[],
  seenAt: Date
): Promise<ReidentificationResult> {
  const result: ReidentificationResult = { changes: [], ambiguous: [] };
  if (newIds.length === 0) return result;

  // The new products, with the barcode phase 3 read from their pages. Only
  // those with a real barcode can be reconciled at all.
  const fresh = await prisma.catalogueProduct.findMany({
    where: { store, storeProductId: { in: newIds }, eanNormalized: { not: null } },
    select: { id: true, storeProductId: true, name: true, eanNormalized: true },
  });

  for (const product of fresh) {
    const candidates = await prisma.catalogueProduct.findMany({
      where: {
        store,
        eanNormalized: product.eanNormalized,
        storeProductId: { not: product.storeProductId },
        lastSeenAt: { lt: seenAt },
        supersededById: null,
      },
      select: { id: true, storeProductId: true },
    });

    if (candidates.length === 0) continue;
    if (candidates.length > 1) {
      result.ambiguous.push({
        newId: product.storeProductId,
        name: product.name,
        barcode: product.eanNormalized as string,
        candidates: candidates.length,
      });
      continue;
    }

    const old = candidates[0];
    const periodsCarried = await carryPriceHistory(old.id, product.id);
    await prisma.catalogueProduct.update({
      where: { id: old.id },
      data: { supersededById: product.id },
    });

    result.changes.push({
      oldId: old.storeProductId,
      newId: product.storeProductId,
      name: product.name,
      periodsCarried,
    });
  }

  return result;
}

/**
 * Move every CataloguePrice row from `oldProductId` to `newProductId`, keeping
 * the one-open-period invariant.
 *
 * `new` already owns today's open period. `old`'s open period (stale, left open
 * when the product stopped answering) must be closed FIRST, or the move would
 * leave `new` with two open periods. Afterwards `new` holds old's now-closed
 * history plus today's open one, and the silent gap between them is the real
 * absence.
 */
async function carryPriceHistory(oldProductId: string, newProductId: string): Promise<number> {
  // Close old's open period, if any. Its lastSeenAt stays: it records when that
  // price was last confirmed true.
  await prisma.cataloguePrice.updateMany({
    where: { productId: oldProductId, isOpen: true },
    data: { isOpen: false },
  });

  const moved = await prisma.cataloguePrice.updateMany({
    where: { productId: oldProductId },
    data: { productId: newProductId },
  });
  return moved.count;
}
