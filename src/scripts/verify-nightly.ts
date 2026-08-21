import { prisma } from "../lib/db";
import { openCatalogueWriter, persistCatalogue } from "../scrapers/crawl/persist";
import {
  recordDead,
  recordRecategorised,
  staleDelisted,
  touchChecked,
} from "../scrapers/crawl/product-checks";
import { verifySitemapTrust } from "./verify-sitemap-trust";
import { verifySitemapParse } from "./verify-sitemap-parse";
import type { SearchHit } from "../scrapers/search/types";

/**
 * Verification steps 3 and 8: writer invariants and queue ordering, both with
 * no network. Uses fabricated products under a distinctive id prefix and
 * removes them afterwards.
 */
const PREFIX = "zzverify-";
const STORE = "CONTINENTE" as const;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

function hit(n: number, price: number, section = "Mercearia"): SearchHit {
  return {
    id: `${PREFIX}${n}`,
    name: `Verify product ${n}`,
    price,
    brand: "Verify",
    category: `${section}/Testes`,
    url: `https://example.invalid/${PREFIX}${n}.html`,
  };
}

async function cleanup() {
  await prisma.productCheck.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

async function main() {
  await cleanup();

  // --- 3. writer invariants -------------------------------------------------
  console.log("3. writer invariants");

  const batchA = [hit(1, 1.0), hit(2, 2.0)];
  const batchB = [hit(3, 3.0), hit(1, 1.0)]; // id 1 repeats within the same run

  const writer = await openCatalogueWriter(STORE);
  await writer.save(batchA, "Mercearia");
  await writer.save(batchB, "Mercearia");
  const streamed = writer.finish();

  const rows = await prisma.catalogueProduct.findMany({
    where: { store: STORE, storeProductId: { startsWith: PREFIX } },
    select: { storeProductId: true, lastSeenAt: true, lastCheckedAt: true, price: true },
  });

  check("all three products saved", rows.length === 3, `got ${rows.length}`);
  check(
    "one seenAt across every batch",
    new Set(rows.map((r) => r.lastSeenAt.getTime())).size === 1
  );
  check(
    "seenAt is the writer's instant",
    rows.every((r) => r.lastSeenAt.getTime() === streamed.seenAt.getTime())
  );
  check(
    "lastCheckedAt written on save",
    rows.every((r) => r.lastCheckedAt?.getTime() === streamed.seenAt.getTime())
  );
  check(
    "a repeat inside one run counts as an update, not a create",
    streamed.summaries[0].created === 3 && streamed.summaries[0].updated === 1,
    `created=${streamed.summaries[0].created} updated=${streamed.summaries[0].updated}`
  );

  const periods = await prisma.cataloguePrice.groupBy({
    by: ["productId"],
    where: { isOpen: true, product: { storeProductId: { startsWith: PREFIX } } },
    _count: { _all: true },
  });
  check(
    "at most one open price period per product",
    periods.every((p) => p._count._all === 1),
    `max ${Math.max(0, ...periods.map((p) => p._count._all))}`
  );

  // The same input through the one-shot path must agree with the streamed one.
  await cleanup();
  const oneShot = await persistCatalogue(STORE, [
    { category: { cgid: "Mercearia", label: "Mercearia" }, products: [...batchA, ...batchB] },
  ]);
  check(
    "streamed and one-shot agree on created/updated",
    oneShot.summaries[0].created === streamed.summaries[0].created &&
      oneShot.summaries[0].updated === streamed.summaries[0].updated,
    `one-shot created=${oneShot.summaries[0].created} updated=${oneShot.summaries[0].updated}`
  );

  // --- 8. queue order and delisting ----------------------------------------
  console.log("\n8. queue order and delisting");
  await cleanup();

  const now = new Date();
  const old = new Date(now.getTime() - 200 * 86_400_000);
  const setup = await openCatalogueWriter(STORE);
  await setup.save([hit(10, 5.0), hit(11, 6.0), hit(12, 7.0)], "Mercearia");
  setup.finish();

  // Age one of them so the ordering has something to sort.
  await prisma.catalogueProduct.update({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}11` } },
    data: { lastCheckedAt: old, lastSeenAt: old },
  });

  const before = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    select: { lastSeenAt: true },
  });

  // Three dead nights on product 10.
  const checkedAt = new Date(now.getTime() + 1000);
  await recordDead(STORE, [`${PREFIX}10`], checkedAt);
  const afterOne = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    select: { deadCount: true, delistedAt: true, lastSeenAt: true, lastCheckedAt: true },
  });
  check("one dead night does not delist", afterOne?.delistedAt === null, `count=${afterOne?.deadCount}`);
  check(
    "a dead page advances lastCheckedAt",
    afterOne?.lastCheckedAt?.getTime() === checkedAt.getTime()
  );
  check(
    "a dead page leaves lastSeenAt frozen",
    afterOne?.lastSeenAt.getTime() === before?.lastSeenAt.getTime()
  );

  await recordDead(STORE, [`${PREFIX}10`], checkedAt);
  const two = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    select: { delistedAt: true },
  });
  check("two dead nights still does not delist", two?.delistedAt === null);

  await recordDead(STORE, [`${PREFIX}10`], checkedAt);
  const three = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    select: { delistedAt: true, deadCount: true },
  });
  check("three dead nights delists", three?.delistedAt !== null, `count=${three?.deadCount}`);

  // The queue phase 2 uses.
  const queue = await prisma.catalogueProduct.findMany({
    where: { store: STORE, delistedAt: null, storeProductId: { startsWith: PREFIX } },
    select: { storeProductId: true },
    orderBy: { lastCheckedAt: "asc" },
  });
  check(
    "a delisted product is out of the nightly queue",
    !queue.some((q) => q.storeProductId === `${PREFIX}10`)
  );
  check(
    "stalest leads the queue",
    queue[0]?.storeProductId === `${PREFIX}11`,
    queue.map((q) => q.storeProductId.replace(PREFIX, "")).join(",")
  );

  // Delisted rows must still be reachable by the slow re-check.
  await prisma.catalogueProduct.update({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    data: { lastCheckedAt: old },
  });
  const stale = await staleDelisted(STORE, 50, now);
  check(
    "a delisted product is in the 90-day re-check queue",
    stale.some((s) => s.storeProductId === `${PREFIX}10`)
  );

  // A product that answers again is no longer delisted.
  const revive = await openCatalogueWriter(STORE);
  await revive.save([hit(10, 5.5)], "Mercearia");
  revive.finish();
  const revived = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}10` } },
    select: { delistedAt: true, deadCount: true },
  });
  check(
    "answering again clears the delisting and the counter",
    revived?.delistedAt === null && revived?.deadCount === 0,
    `delistedAt=${revived?.delistedAt} count=${revived?.deadCount}`
  );

  // Recategorised out of food: delisted immediately, no three-night wait.
  await recordRecategorised(STORE, [`${PREFIX}12`], checkedAt);
  const recat = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}12` } },
    select: { delistedAt: true },
  });
  check("recategorised out of food is delisted at once", recat?.delistedAt !== null);

  // A transient failure must not touch anything but the clock.
  const beforeTouch = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}11` } },
    select: { deadCount: true, delistedAt: true },
  });
  await touchChecked(STORE, [`${PREFIX}11`], checkedAt);
  const afterTouch = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}11` } },
    select: { deadCount: true, delistedAt: true, lastCheckedAt: true },
  });
  check(
    "an unreachable page changes only lastCheckedAt",
    afterTouch?.deadCount === beforeTouch?.deadCount &&
      afterTouch?.delistedAt === beforeTouch?.delistedAt &&
      afterTouch?.lastCheckedAt?.getTime() === checkedAt.getTime()
  );

  await cleanup();

  // Pure logic, no database - but it belongs behind the same command, because a
  // check nobody remembers to run is not a check.
  console.log("\n9. sitemap trust, across a sequence of runs");
  failures += verifySitemapTrust();

  console.log("\n10. sitemap parsing: per-file counts and unreadable ids");
  failures += await verifySitemapParse();

  console.log(`\n${failures === 0 ? "all checks passed" : `${failures} CHECK(S) FAILED`}`);
  if (failures > 0) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    await prisma.$disconnect();
    process.exit(1);
  });
