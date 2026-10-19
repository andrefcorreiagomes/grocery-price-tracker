import { prisma } from "../lib/db";
import { STORE_LIST } from "../lib/stores";
import { syncStores } from "../lib/stores-db";
import { SectionTally, recordSections } from "../scrapers/crawl/section-watch";
import { openCatalogueWriter, persistCatalogue } from "../scrapers/crawl/persist";
import {
  clearChecks,
  stopTrackingLeftOut,
  recordDead,
  recordRecategorised,
  staleDelisted,
  touchChecked,
} from "../scrapers/crawl/product-checks";
import { verifySitemapTrust } from "./verify-sitemap-trust";
import { verifySitemapParse } from "./verify-sitemap-parse";
import { verifyCatalogueSize } from "./verify-catalogue-size";
import { verifyProductCheckTotals } from "./verify-productcheck-totals";
import { verifyReidentification } from "./verify-reidentification";
import { verifyAuchanNightly } from "./verify-auchan-nightly";
import { verifyMatching } from "./verify-matching";
import { verifyContinentePages } from "./verify-continente-pages";
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
  await prisma.storeSection.deleteMany({ where: { path: { startsWith: PREFIX } } });
  await prisma.productCheck.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

async function main() {
  await cleanup();

  // --- the store table ------------------------------------------------------
  console.log("the store table");
  await syncStores();
  const stores = await prisma.store.findMany({ orderBy: { position: "asc" } });
  check(
    "the database lists the same stores as the code, in the same order",
    JSON.stringify(stores.map((s) => [s.id, s.name, s.website, s.crawlMethod, s.barcodeSource])) ===
      JSON.stringify(STORE_LIST.map((s) => [s.id, s.name, s.website, s.crawlMethod, s.barcodeSource]))
  );
  let refused = false;
  try {
    await prisma.catalogueProduct.create({
      data: { store: "NO_SUCH_STORE", storeProductId: `${PREFIX}nostore`, name: "x", url: "https://example.invalid/x" },
    });
  } catch {
    refused = true;
  }
  check("a product naming a store that does not exist is refused", refused);

  // --- the section memory -----------------------------------------------------
  console.log("\nthe section memory");
  const tally = new SectionTally(STORE);
  tally.add(`${PREFIX}seccao/sub`, "Example product");
  const firstSeen = new Date(Date.now() - 86_400_000);
  await recordSections(STORE, tally, firstSeen, false);
  const again = await recordSections(STORE, tally, new Date(), false);
  const row = await prisma.storeSection.findUnique({ where: { store_path: { store: STORE, path: `${PREFIX}seccao` } } });
  check("a section is remembered with when it was first and last seen",
    row !== null && row.firstSeenAt.getTime() === firstSeen.getTime() && row.lastSeenAt.getTime() > firstSeen.getTime());
  check("and is not new the second time", again.added.every((a) => !a.path.startsWith(PREFIX)));
  check("an undecided section's sub-sections are not recorded",
    (await prisma.storeSection.count({ where: { path: { startsWith: `${PREFIX}seccao/` } } })) === 0);

  await prisma.catalogueProduct.create({
    data: { store: STORE, storeProductId: `${PREFIX}leftout`, name: "Whey", url: "https://example.invalid/w" },
  });
  const stopped = await stopTrackingLeftOut(STORE, [`${PREFIX}leftout`, `${PREFIX}not-held`], new Date());
  const left = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}leftout` } },
  });
  check("a held product the rules leave out stops being tracked, not deleted", stopped === 1 && left?.delistedAt !== null);
  check("and marking it again changes nothing", (await stopTrackingLeftOut(STORE, [`${PREFIX}leftout`], new Date())) === 0);
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

  // A product page saves the promotion and the store's own unit price; a later
  // listing save, which cannot see them, must leave them alone.
  await cleanup();
  const pageWriter = await openCatalogueWriter(STORE);
  await pageWriter.save([{
    ...hit(20, 18.68), onPromotion: true, regularPrice: 23.29, promoEndsAt: null,
    shownUnitPrice: 26.69, shownUnitPriceUnit: "l",
  }], "Mercearia");
  pageWriter.finish();
  const listingWriter = await openCatalogueWriter(STORE);
  await listingWriter.save([hit(20, 18.68)], "Mercearia");
  listingWriter.finish();
  const promoRow = await prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: STORE, storeProductId: `${PREFIX}20` } },
    select: { onPromotion: true, regularPrice: true, shownUnitPrice: true, shownUnitPriceUnit: true },
  });
  check("a page saves the promotion and the shown unit price",
    promoRow?.onPromotion === true && promoRow?.regularPrice === 23.29 && promoRow?.shownUnitPrice === 26.69);
  check("and a listing save that cannot see them leaves them alone", promoRow?.shownUnitPriceUnit === "l");

  // A non-food verdict whose product turned out to be food is removed.
  await prisma.productCheck.create({
    data: { store: STORE, storeProductId: `${PREFIX}21`, url: "https://example.invalid/x", verdict: "NOT_FOOD", checkedAt: new Date(0) },
  });
  const cleared = await clearChecks(STORE, [`${PREFIX}21`, `${PREFIX}22`]);
  const stillThere = await prisma.productCheck.count({ where: { storeProductId: `${PREFIX}21` } });
  check("a verdict for a product that is food now is cleared", cleared === 1 && stillThere === 0, `cleared=${cleared}`);

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

  console.log("\n11. catalogue growth per store");
  failures += verifyCatalogueSize();

  console.log("\n12. ProductCheck growth run over run");
  failures += verifyProductCheckTotals();

  console.log("\n13. re-identification guards (churn brake + barcode continuity)");
  failures += await verifyReidentification();

  console.log("\n14. Auchan nightly (grid guards, delisting, segment monitor)");
  failures += await verifyAuchanNightly();

  console.log("\n15. matching (clustering guards, decisions, retirement)");
  failures += await verifyMatching();

  console.log("\n16. Continente pages (layout of 18 October 2026, the non-food limit, moved addresses)");
  failures += verifyContinentePages();

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
