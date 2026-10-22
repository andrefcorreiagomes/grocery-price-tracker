import type { Store } from "@/lib/stores";

/**
 * The brakes, every store's in one place (code review M4, 22 October 2026).
 *
 * A brake refuses to believe a night's change when too much of it arrives at
 * once. A store does not drop a tenth of its range, move its food into non-food
 * shelves, or reprice most of its products overnight; a broken reader or a
 * broken page does. Each crawl applies the same three brakes, each store with
 * its own limit, set from its own nights:
 *
 *   deadPages   share of the product pages tried that said "gone". Above it,
 *               none of them counts toward delisting tonight.
 *   nonFood     share of the products we track that read as non-food tonight.
 *               Above it, none of them stops being tracked.
 *   priceChurn  share of the priced products whose price changed. Above it the
 *               run FAILs. The prices are already written by then; every row
 *               the run wrote shares its seenAt, so they can be reverted.
 *
 * Until 22 October 2026 these were written separately in three files, with
 * different limits, and Pingo Doce had no non-food or price brake at all.
 */
export interface Brakes {
  deadPages: number;
  nonFood: number;
  priceChurn: number;
}

export const BRAKES: Record<Store, Brakes> = {
  CONTINENTE: {
    // Kept as they were set when each brake was written.
    deadPages: 0.1,
    // A normal night: 141 of 17,264 products (0.8%) on 3 October 2026. On
    // 18 October, when Continente renamed its top shelves, nearly all of them.
    nonFood: 0.05,
    // Prices that changed: 14% on 21 October, 0.5% on 22 October 2026.
    priceChurn: 0.3,
  },
  PINGO_DOCE: {
    // Pages saying "gone": 1.4-1.7% on its nights of 18, 21 and 22 October 2026.
    deadPages: 0.05,
    // Products leaving food on those nights: 1 to 15 of about 10,000.
    nonFood: 0.05,
    // Prices that changed since the run before: 31% (3 October 2026, weeks
    // after the one before), 25% (18 October, 15 days after), 27% (21 October,
    // 2 days after) - but 0.5% on 22 October, one night after. The big moves
    // are mostly cuts of 25-35% and rises of 25-50%: promotions starting and
    // ending. So a night after a change of promotions can move a quarter of
    // the prices. The limit sits well above that for now, agreed with the user
    // on 22 October 2026, and is to be set again from more nights. A reader
    // reading the wrong number would move nearly every price.
    priceChurn: 0.6,
  },
  AUCHAN: {
    deadPages: 0.1,
    nonFood: 0.05,
    // Prices that changed: 4.4% on 21 October, 2.5% on 22 October 2026.
    priceChurn: 0.3,
  },
};
