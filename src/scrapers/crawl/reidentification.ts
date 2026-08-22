import { prisma } from "../../lib/db";
import type { Store } from "@/generated/prisma/client";

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
