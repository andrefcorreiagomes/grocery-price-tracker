import { prisma } from "../lib/db";
import {
  CHURN_LIMIT,
  MIN_ATTEMPTED,
  isChurnCatastrophe,
  reconcileByBarcode,
} from "../scrapers/crawl/reidentification";

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
      eanNormalized: ean,
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
  const oldId = await makeProduct("old", "5600000000001", yesterday);
  const p1 = await makePeriod(oldId, 1.15, monthAgo, weekAgo, false);
  const p2 = await makePeriod(oldId, 1.25, weekAgo, yesterday, false);
  const p3open = await makePeriod(oldId, 1.35, yesterday, yesterday, true);
  // new: same barcode, discovered now, today's open period
  const newId = await makeProduct("new", "5600000000001", now);
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
  await makeProduct("amb-a", "5600000000002", yesterday);
  await makeProduct("amb-b", "5600000000002", yesterday);
  const ambNew = await makeProduct("amb-new", "5600000000002", now);
  await makePeriod(ambNew, 2.0, now, now, true);
  const amb = await reconcileByBarcode(STORE, [`${PREFIX}amb-new`], now);
  check("two candidates are flagged ambiguous, not linked", amb.changes.length === 0 && amb.ambiguous.length === 1);
  check("the ambiguous entry counts both candidates", amb.ambiguous[0]?.candidates === 2);

  await cleanup();

  // a different barcode links nothing
  await makeProduct("diff-old", "5600000000010", yesterday);
  const diffNew = await makeProduct("diff-new", "5600000000011", now);
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
  await makeProduct("live-old", "5600000000020", now); // lastSeenAt = now, so refreshed this run
  const liveNew = await makeProduct("live-new", "5600000000020", now);
  await makePeriod(liveNew, 5.0, now, now, true);
  const live = await reconcileByBarcode(STORE, [`${PREFIX}live-new`], now);
  check(
    "a barcode shared with a live product is not an id change",
    live.changes.length === 0 && live.ambiguous.length === 0
  );

  await cleanup();
  return failures;
}
