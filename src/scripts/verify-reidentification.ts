import { prisma } from "../lib/db";
import {
  CHURN_LIMIT,
  LOSS_LIMIT,
  MIN_ATTEMPTED,
  PRICE_CHURN_LIMIT,
  SWAP_LIMIT,
  archiveIdentitySwaps,
  isBarcodeLossStorm,
  isBarcodeSwapStorm,
  isChurnCatastrophe,
  isPriceChurnStorm,
  reconcileByBarcode,
  retiredId,
} from "../scrapers/crawl/reidentification";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { matchableEan } from "../lib/matching";
import type { SearchHit } from "../scrapers/search/types";

/**
 * The two re-identification guards. Guard 1 is a pure predicate; Guard 2 does
 * price-history surgery, so its tests are against a seeded database and check
 * the transfer is EXACT, not merely that an open period survived.
 *
 * All rows use the zzverify- prefix and are cleaned up.
 */
const PREFIX = "zzri-";
const STORE = "CONTINENTE" as const;

async function cleanup() {
  await prisma.cataloguePrice.deleteMany({
    where: { product: { storeProductId: { startsWith: PREFIX } } },
  });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

/**
 * A structurally valid EAN-13 for the given seed.
 *
 * matchableEan verifies the GTIN check digit and rejects anything failing it, so
 * invented barcodes are silently treated as "no barcode" - which made an earlier
 * version of these tests pass for the wrong reason.
 */
function ean(seed: number): string {
  const body = "56" + String(seed).padStart(10, "0");
  const padded = "0" + body;
  let sum = 0;
  for (let i = 0; i < 13; i++) {
    const d = padded.charCodeAt(i) - 48;
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return body + String((10 - (sum % 10)) % 10);
}

/** Create a product row; returns its internal id. */
async function makeProduct(
  suffix: string,
  ean: string | null,
  seenAt: Date
): Promise<string> {
  const row = await prisma.catalogueProduct.create({
    data: {
      store: STORE,
      storeProductId: `${PREFIX}${suffix}`,
      name: `Product ${suffix}`,
      brand: "Verify",
      url: `https://example.invalid/${PREFIX}${suffix}.html`,
      price: 1.0,
      ean,
      eanNormalized: matchableEan(ean),
      firstSeenAt: seenAt,
      lastSeenAt: seenAt,
      lastCheckedAt: seenAt,
    },
    select: { id: true },
  });
  return row.id;
}

async function makePeriod(
  productId: string,
  price: number,
  firstSeenAt: Date,
  lastSeenAt: Date,
  isOpen: boolean
): Promise<string> {
  const row = await prisma.cataloguePrice.create({
    data: { productId, price, firstSeenAt, lastSeenAt, isOpen },
    select: { id: true },
  });
  return row.id;
}

export async function verifyReidentification(): Promise<number> {
  let failures = 0;
  const check = (label: string, ok: boolean, detail = "") => {
    if (!ok) failures++;
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
  };

  await cleanup();

  // --- Guard 1: pure predicate --------------------------------------------
  console.log("Guard 1: churn catastrophe predicate");
  const full = (dead: number, attempted: number, complete = true) =>
    isChurnCatastrophe({ dead, attempted, complete });

  check("a handful dead in a full catalogue is not a catastrophe", !full(20, 17_291));
  check("most of the catalogue dead is a catastrophe", full(13_000, 17_291));
  check(
    `just below ${CHURN_LIMIT} does not fire`,
    !full(Math.floor(1000 * CHURN_LIMIT) - 1, 1000)
  );
  check(`just above ${CHURN_LIMIT} fires`, full(Math.ceil(1000 * CHURN_LIMIT) + 1, 1000));
  check("a non-complete pass never fires", !full(900, 1000, false));
  check(
    `a tiny run under ${MIN_ATTEMPTED} attempted never fires`,
    !full(MIN_ATTEMPTED - 1, MIN_ATTEMPTED - 1)
  );
  check("zero attempted never divides by zero", !full(0, 0));

  // --- Guard 2: the core case ---------------------------------------------
  console.log("\nGuard 2: reconcile by barcode");
  await cleanup();

  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
  const monthAgo = new Date(now.getTime() - 30 * 86_400_000);

  // old: barcode X, last seen yesterday (not this run), two closed periods + one open
  const oldId = await makeProduct("old", ean(1), yesterday);
  const p1 = await makePeriod(oldId, 1.15, monthAgo, weekAgo, false);
  const p2 = await makePeriod(oldId, 1.25, weekAgo, yesterday, false);
  const p3open = await makePeriod(oldId, 1.35, yesterday, yesterday, true);
  // new: same barcode, discovered now, today's open period
  const newId = await makeProduct("new", ean(1), now);
  await makePeriod(newId, 1.39, now, now, true);

  const oldPeriodsBefore = await prisma.cataloguePrice.findMany({
    where: { productId: oldId },
    orderBy: { firstSeenAt: "asc" },
  });

  const result = await reconcileByBarcode(STORE, [`${PREFIX}new`], now);

  check("exactly one id change detected", result.changes.length === 1);
  check("no ambiguous matches", result.ambiguous.length === 0);
  check(
    "the change names old -> new",
    result.changes[0]?.oldId === `${PREFIX}old` && result.changes[0]?.newId === `${PREFIX}new`
  );
  check("it reports 3 periods carried", result.changes[0]?.periodsCarried === 3);

  const oldRow = await prisma.catalogueProduct.findUnique({
    where: { id: oldId },
    select: { supersededById: true },
  });
  check("old row points at new via supersededById", oldRow?.supersededById === newId);

  const openOnNew = await prisma.cataloguePrice.count({ where: { productId: newId, isOpen: true } });
  check("new has exactly one open period", openOnNew === 1, `${openOnNew}`);

  const stillOnOld = await prisma.cataloguePrice.count({ where: { productId: oldId } });
  check("no periods remain on old", stillOnOld === 0, `${stillOnOld}`);

  // Point-in-time: a date inside old's first interval returns its price on new.
  const midMonth = new Date(monthAgo.getTime() + 3 * 86_400_000);
  const atDate = await prisma.cataloguePrice.findFirst({
    where: { productId: newId, firstSeenAt: { lte: midMonth }, lastSeenAt: { gte: midMonth } },
    select: { price: true },
  });
  check("a point-in-time query on new returns old's price", atDate?.price === 1.15, `${atDate?.price}`);

  // --- Guard 2: the transfer is EXACT (its own test) ----------------------
  console.log("\nGuard 2: price history moved exactly, nothing lost or duplicated");
  const movedRows = await prisma.cataloguePrice.findMany({
    where: { id: { in: [p1, p2, p3open] } },
  });
  check("all three original period rows still exist by id", movedRows.length === 3);
  check("every original period now belongs to new", movedRows.every((r) => r.productId === newId));

  const byId = new Map(movedRows.map((r) => [r.id, r]));
  const before = new Map(oldPeriodsBefore.map((r) => [r.id, r]));
  const closedUnchanged = [p1, p2].every((id) => {
    const a = before.get(id)!;
    const b = byId.get(id)!;
    return (
      a.price === b.price &&
      a.firstSeenAt.getTime() === b.firstSeenAt.getTime() &&
      a.lastSeenAt.getTime() === b.lastSeenAt.getTime() &&
      a.isOpen === b.isOpen // both already closed
    );
  });
  check("the two already-closed periods are unchanged but for productId", closedUnchanged);

  const formerlyOpen = byId.get(p3open)!;
  const wasOpen = before.get(p3open)!;
  check(
    "the formerly-open period changed ONLY isOpen (now false)",
    formerlyOpen.isOpen === false &&
      formerlyOpen.price === wasOpen.price &&
      formerlyOpen.firstSeenAt.getTime() === wasOpen.firstSeenAt.getTime() &&
      formerlyOpen.lastSeenAt.getTime() === wasOpen.lastSeenAt.getTime()
  );

  const newTotal = await prisma.cataloguePrice.count({ where: { productId: newId } });
  check("new holds old's 3 periods plus its own 1 = 4", newTotal === 4, `${newTotal}`);

  // No overlapping open periods anywhere in the test data.
  const openDup = await prisma.cataloguePrice.groupBy({
    by: ["productId"],
    where: { isOpen: true, product: { storeProductId: { startsWith: PREFIX } } },
    _count: { _all: true },
  });
  check(
    "catalogue-wide invariant holds: at most one open period per product",
    openDup.every((g) => g._count._all === 1),
    `max ${Math.max(0, ...openDup.map((g) => g._count._all))}`
  );

  // --- Guard 2: the cases that must NOT link ------------------------------
  console.log("\nGuard 2: matches that must be refused");
  await cleanup();

  // ambiguous: two disappeared rows share the barcode
  await makeProduct("amb-a", ean(2), yesterday);
  await makeProduct("amb-b", ean(2), yesterday);
  const ambNew = await makeProduct("amb-new", ean(2), now);
  await makePeriod(ambNew, 2.0, now, now, true);
  const amb = await reconcileByBarcode(STORE, [`${PREFIX}amb-new`], now);
  check("two candidates are flagged ambiguous, not linked", amb.changes.length === 0 && amb.ambiguous.length === 1);
  check("the ambiguous entry counts both candidates", amb.ambiguous[0]?.candidates === 2);

  await cleanup();

  // a different barcode links nothing
  await makeProduct("diff-old", ean(10), yesterday);
  const diffNew = await makeProduct("diff-new", ean(11), now);
  await makePeriod(diffNew, 3.0, now, now, true);
  const diff = await reconcileByBarcode(STORE, [`${PREFIX}diff-new`], now);
  check("a different barcode links nothing", diff.changes.length === 0 && diff.ambiguous.length === 0);

  await cleanup();

  // a null barcode (scale ticket) never matches, even against another null
  await makeProduct("null-old", null, yesterday);
  const nullNew = await makeProduct("null-new", null, now);
  await makePeriod(nullNew, 4.0, now, now, true);
  const nul = await reconcileByBarcode(STORE, [`${PREFIX}null-new`], now);
  check("a null barcode never matches", nul.changes.length === 0 && nul.ambiguous.length === 0);

  await cleanup();

  // a barcode shared with a row that DID refresh this run (live cross-listing)
  await makeProduct("live-old", ean(20), now); // lastSeenAt = now, so refreshed this run
  const liveNew = await makeProduct("live-new", ean(20), now);
  await makePeriod(liveNew, 5.0, now, now, true);
  const live = await reconcileByBarcode(STORE, [`${PREFIX}live-new`], now);
  check(
    "a barcode shared with a live product is not an id change",
    live.changes.length === 0 && live.ambiguous.length === 0
  );

  // --- Guard 3: the barcode case matrix -----------------------------------
  console.log("\nGuard 3: which barcode transitions are a swap");
  await cleanup();

  const hit = (suffix: string, ean: string | null | undefined, price = 9.99): SearchHit => ({
    id: `${PREFIX}${suffix}`,
    name: `Incoming ${suffix}`,
    price,
    brand: "Verify",
    category: "Mercearia/Testes",
    url: `https://example.invalid/${PREFIX}${suffix}.html`,
    ean,
    packageSize: null,
    unit: null,
  });

  // One row per transition in the matrix, all seeded before the writer opens so
  // its up-front read sees them.
  await makeProduct("m-null-to-x", null, yesterday); // enrichment
  await makeProduct("m-x-to-x", ean(100), yesterday); // unchanged
  await makeProduct("m-x-to-null", ean(101), yesterday); // loss
  await makeProduct("m-x-to-y", ean(102), yesterday); // SWAP
  await makeProduct("m-null-to-null", null, yesterday); // nothing knowable

  const w = await openCatalogueWriter(STORE);
  await w.save(
    [
      hit("m-null-to-x", ean(200)),
      hit("m-x-to-x", ean(100)),
      hit("m-x-to-null", null),
      hit("m-x-to-y", ean(999)),
      hit("m-null-to-null", null),
      hit("m-brand-new", ean(300)), // no prior row at all
    ],
    "Mercearia"
  );
  const heldResult = w.finish();

  check("exactly one swap detected", heldResult.swaps.length === 1, `${heldResult.swaps.length}`);
  check(
    "the swap is the X -> Y row",
    heldResult.swaps[0]?.storeProductId === `${PREFIX}m-x-to-y`,
    heldResult.swaps[0]?.storeProductId ?? "(none)"
  );
  check(
    "it carries both barcodes",
    // Both sides are the NORMALIZED (14-digit) form, which is what the row
    // stores and what a comparison must use.
    heldResult.swaps[0]?.previousEan === matchableEan(ean(102)) &&
      heldResult.swaps[0]?.incomingEan === matchableEan(ean(999)),
    `${heldResult.swaps[0]?.previousEan} -> ${heldResult.swaps[0]?.incomingEan}`
  );
  check("one barcode loss counted", heldResult.barcodesLost === 1, `${heldResult.barcodesLost}`);
  check(
    "only rows with a stored barcode are compared",
    heldResult.barcodesCompared === 3,
    `${heldResult.barcodesCompared}`
  );

  // Held aside means NOT written: the row must still hold the old product.
  const untouched = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-x-to-y` } },
    select: { name: true, price: true, eanNormalized: true },
  });
  check(
    "the swapped row was NOT written - it still holds the old product",
    untouched?.name === "Product m-x-to-y" &&
      untouched?.price === 1.0 &&
      untouched?.eanNormalized === matchableEan(ean(102)),
    `${untouched?.name} / ${untouched?.price} / ${untouched?.eanNormalized}`
  );

  // Everything else went through normally.
  const enriched = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-null-to-x` } },
    select: { eanNormalized: true, name: true },
  });
  check(
    "null -> X enriches silently",
    enriched?.eanNormalized === matchableEan(ean(200)) && enriched?.name === "Incoming m-null-to-x"
  );
  const lost = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-x-to-null` } },
    select: { name: true },
  });
  check("X -> null is written, not archived", lost?.name === "Incoming m-x-to-null");
  const brandNew = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-brand-new` } },
    select: { eanNormalized: true },
  });
  check("a brand-new row with a barcode is not a swap", brandNew?.eanNormalized === matchableEan(ean(300)));

  // --- Guard 3: the archive is correct ------------------------------------
  console.log("\nGuard 3: archiving preserves the old product and its history");
  const swapRowId = (
    await prisma.catalogueProduct.findUniqueOrThrow({
      where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-x-to-y` } },
      select: { id: true },
    })
  ).id;
  const hp1 = await makePeriod(swapRowId, 1.5, monthAgo, weekAgo, false);
  const hp2 = await makePeriod(swapRowId, 1.6, weekAgo, yesterday, true);

  const archived = await archiveIdentitySwaps(STORE, heldResult.swaps, now);
  check("one swap archived", archived.length === 1);
  check(
    "the retired id is deterministic",
    archived[0]?.retiredId === retiredId(`${PREFIX}m-x-to-y`, now),
    archived[0]?.retiredId ?? ""
  );
  check(
    "the archive records the OLD product's name",
    archived[0]?.previousName === "Product m-x-to-y",
    archived[0]?.previousName ?? ""
  );

  const tombstone = await prisma.catalogueProduct.findUnique({
    where: { id: swapRowId },
    select: { storeProductId: true, delistedAt: true, name: true },
  });
  check("the old row now carries the retired id", tombstone?.storeProductId.includes("~retired-") === true);
  check("the old row is delisted at once, no three-night wait", tombstone?.delistedAt !== null);
  check("the old row still holds the old product's name", tombstone?.name === "Product m-x-to-y");

  const keptPeriods = await prisma.cataloguePrice.findMany({
    where: { id: { in: [hp1, hp2] } },
    select: { productId: true, price: true },
  });
  check(
    "its price history followed it, untouched",
    keptPeriods.length === 2 && keptPeriods.every((r) => r.productId === swapRowId)
  );

  // The clean id is free, so the incoming product can take it.
  await w.saveResolved([heldResult.swaps[0].incoming], "Mercearia");
  const successor = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}m-x-to-y` } },
    select: { id: true, name: true, eanNormalized: true },
  });
  check(
    "a fresh row now holds the clean id with the new product",
    successor?.name === "Incoming m-x-to-y" && successor?.eanNormalized === matchableEan(ean(999))
  );
  check("it is a different row from the tombstone", successor?.id !== swapRowId);

  const successorPeriods = await prisma.cataloguePrice.findMany({
    where: { productId: successor?.id },
    select: { price: true, isOpen: true },
  });
  check(
    "the new product starts its own series, one open period at its own price",
    successorPeriods.length === 1 && successorPeriods[0]?.isOpen === true && successorPeriods[0]?.price === 9.99,
    `${successorPeriods.length} period(s)`
  );
  check(
    "the two histories share no rows",
    !successorPeriods.some((p) => p.price === 1.5 || p.price === 1.6)
  );

  // --- The parser-regression brakes ---------------------------------------
  console.log("\nParser-regression brakes");
  const swapStorm = (swaps: number, compared: number, complete = true) =>
    isBarcodeSwapStorm({ swaps, compared, complete });
  const lossStorm = (lost: number, compared: number, complete = true) =>
    isBarcodeLossStorm({ lost, compared, complete });
  const priceStorm = (changed: number, priced: number, complete = true) =>
    isPriceChurnStorm({ changed, priced, complete });

  check("a few real swaps do not trip the swap brake", !swapStorm(5, 10_000));
  check(`above ${SWAP_LIMIT} trips it`, swapStorm(Math.ceil(10_000 * SWAP_LIMIT) + 1, 10_000));
  check(`just below ${SWAP_LIMIT} does not`, !swapStorm(Math.floor(10_000 * SWAP_LIMIT) - 1, 10_000));
  check("a small run never trips the swap brake", !swapStorm(MIN_ATTEMPTED, MIN_ATTEMPTED - 1));
  check("a non-complete pass never trips the swap brake", !swapStorm(9_000, 10_000, false));

  check("a few lost barcodes do not trip the loss brake", !lossStorm(50, 10_000));
  check(`above ${LOSS_LIMIT} trips it`, lossStorm(Math.ceil(10_000 * LOSS_LIMIT) + 1, 10_000));
  check("every barcode lost trips it - the ean bug's signature", lossStorm(10_000, 10_000));

  check("a normal night of price moves does not trip the price brake", !priceStorm(300, 10_000));
  check(`above ${PRICE_CHURN_LIMIT} trips it`, priceStorm(Math.ceil(10_000 * PRICE_CHURN_LIMIT) + 1, 10_000));
  check("every price moving trips it", priceStorm(10_000, 10_000));

  // --- The brake actually brakes ------------------------------------------
  console.log("\nThe swap brake refuses to archive");
  await cleanup();

  // Seed enough rows that a storm is measurable, all swapping at once.
  const stormSize = MIN_ATTEMPTED + 20;
  const seeded: SearchHit[] = [];
  for (let i = 0; i < stormSize; i++) {
    await makeProduct(`storm-${i}`, ean(10_000 + i), yesterday);
    seeded.push(hit(`storm-${i}`, ean(90_000 + i)));
  }
  const stormWriter = await openCatalogueWriter(STORE);
  await stormWriter.save(seeded, "Mercearia");
  const stormResult = stormWriter.finish();

  check("every seeded row is held aside as a swap", stormResult.swaps.length === stormSize, `${stormResult.swaps.length}`);
  const tripped = isBarcodeSwapStorm({
    swaps: stormResult.swaps.length,
    compared: stormResult.barcodesCompared,
    complete: true,
  });
  check("the swap brake trips", tripped);

  // The runner archives only when the brake is clear, so nothing should move.
  // Scoped to this test's own rows: the real catalogue legitimately holds
  // retired ids once a real crawl has archived a reused one - 68 after the
  // 4 October 2026 Continente run - and counting those failed this check.
  const retiredCount = await prisma.catalogueProduct.count({
    where: { store: STORE, storeProductId: { startsWith: PREFIX, contains: "~retired-" } },
  });
  check("nothing was archived - no retired ids exist", retiredCount === 0, `${retiredCount}`);
  const intact = await prisma.catalogueProduct.count({
    where: { store: STORE, storeProductId: { startsWith: `${PREFIX}storm-` }, delistedAt: null },
  });
  check("every original row keeps its id and is not delisted", intact === stormSize, `${intact}`);

  await cleanup();
  return failures;
}
