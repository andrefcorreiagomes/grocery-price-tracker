import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../lib/db";
import {
  afterRefusal,
  BLOCKS,
  failedPageVerdict,
  fetchHtml,
  fetchPage,
  HttpError,
  httpStats,
  isBlockAnswer,
  NetworkError,
  REFUSALS,
  setHttpTimingForChecks,
  StoreRefusingError,
  stoppedStores,
} from "../scrapers/http";
import { PageReadError } from "../scrapers/types";
import { STAYED_ON_PRODUCT_PAGE } from "../scrapers/continente";
import { fetchProducts } from "../scrapers/crawl/continente-products";
import { fetchPingoDoceProducts } from "../scrapers/crawl/pingodoce-products";
import {
  BATCH,
  clearChecks,
  DEAD_NIGHTS_BEFORE_DELISTING,
  delistedRecheckDue,
  recordDead,
  fillBarcodes,
  forEachBatch,
  recordRecategorised,
  recordUnavailable,
  stopTrackingMovedOut,
  touchChecked,
} from "../scrapers/crawl/product-checks";
import { kindAssignments, kindChanges, rowsToClassify, writeKindChanges } from "./classify-food-types";
import { buildGroups, shownOnSite } from "../lib/grouping";
import { auchanBarcodeFromHtml } from "../scrapers/auchan";
import { openCatalogueWriter } from "../scrapers/crawl/persist";
import { changedFields, pageFieldsBefore, recordPageChanges, recordSitemapDates, type PageFields } from "../scrapers/crawl/sitemap-dates";
import { cheapestPerStore } from "../lib/comparison";

/**
 * The first three fixes of the code review of 22 October 2026
 * (docs/code-review-2026-10.md):
 *
 *   H1  a page that could not be fetched is "could not tell", never "gone"
 *   H2  lists of products reach the database in slices it accepts
 *   H3  a product no longer sold keeps its kind, for the price history
 *
 * H1 runs both page crawlers against a small server on this computer, so no
 * store is asked anything. H2 and H3 write a few made-up products under the
 * zzsafe- prefix and remove them.
 */

const PREFIX = "zzsafe-";
const STORE = "CONTINENTE" as const;

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

async function cleanup() {
  await prisma.sitemapDate.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  await prisma.pageChange.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  await prisma.productCheck.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

/** A Continente product page, cut down to what the reader reads. */
const CONTINENTE_PAGE =
  `<script type="application/ld+json">{"@type":"Product","name":"Atum Posta em Azeite","brand":{"name":"Bom Petisco"},"offers":{"price":"2.49"}}</script>` +
  `<script>var dl={&quot;item_category&quot;:&quot;Mercearia&quot;,&quot;item_category2&quot;:&quot;Conservas&quot;}</script>`;

/** A Pingo Doce product page, cut down the same way. */
const PINGO_DOCE_PAGE =
  `<script type="application/ld+json">{"@type":"Product","name":"Atum Posta em Azeite","brand":{"name":"Bom Petisco"}}</script>` +
  `<div class="prices"><span class="price">2,49 €</span></div><h1 class="product-unit-measure">0.12 Kg</h1>`;

/** The answers a store can give, by path. */
function startServer(): Promise<{ base: string; close: () => void }> {
  const server = createServer((req, res) => {
    const path = req.url ?? "";
    if (path.startsWith("/gone")) {
      res.writeHead(404).end("not found");
    } else if (path.startsWith("/drop")) {
      // No answer at all: the connection is cut, as on a bad network night.
      req.socket.destroy();
    } else if (path.startsWith("/busy")) {
      res.writeHead(503, { "Retry-After": "0" }).end("busy");
    } else if (path.startsWith("/empty") || path === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<html><body>Página sem produto</body></html>");
    } else if (path.startsWith("/moved")) {
      // A product no longer sold, sent on to the home page.
      res.writeHead(302, { Location: "/" }).end();
    } else if (path.startsWith("/continente")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(CONTINENTE_PAGE);
    } else {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(PINGO_DOCE_PAGE);
    }
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ base: `http://127.0.0.1:${port}`, close: () => server.close() });
    })
  );
}

const ids = (list: { storeProductId: string }[]) => list.map((d) => d.storeProductId).sort().join(",");

async function verifyFailedPages() {
  console.log("  H1: a page that could not be fetched is never \"gone\"");
  check("a 404 is gone", failedPageVerdict(new HttpError(404, "u")) === "gone");
  check("a 410 is gone", failedPageVerdict(new HttpError(410, "u")) === "gone");
  check("a 503 after retries is could-not-tell", failedPageVerdict(new HttpError(503, "u")) === "unreachable");
  check("a 429 is could-not-tell", failedPageVerdict(new HttpError(429, "u")) === "unreachable");
  check("no answer at all is could-not-tell", failedPageVerdict(new NetworkError("u", "timed out")) === "unreachable");
  check("a page that loaded with no product on it is gone", failedPageVerdict(new PageReadError("no product")) === "gone");
  check("an error in our own code is could-not-tell", failedPageVerdict(new TypeError("x is undefined")) === "unreachable");
  check("so is any other error", failedPageVerdict(new Error("something")) === "unreachable");

  const server = await startServer();
  try {
    // Addresses end in "-<number>.html", as the stores' do, so the product
    // number can be read back from where the page landed.
    const paths = ["gone", "drop", "busy", "empty", "moved"];
    const continente = await fetchProducts(
      [...paths, "continente"].map((p, i) => ({ storeProductId: `${i}`, url: `${server.base}/${p}/produto-${i}.html` })),
      { isFood: () => true }
    );
    check("Continente: the 404, the page without a product and the one sent home are gone", ids(continente.dead) === "0,3,4", ids(continente.dead));
    check("Continente: the page without a product that stayed on its own address is marked apart",
      continente.dead.filter((d) => d.reason.startsWith(STAYED_ON_PRODUCT_PAGE)).map((d) => d.storeProductId).join() === "3");
    check("Continente: the cut connection and the 503 are could-not-tell", ids(continente.unreachable) === "1,2", ids(continente.unreachable));
    check("Continente: the real page is read", continente.fetched === 1 && continente.results[0]?.products[0]?.price === 2.49);

    const pingo = await fetchPingoDoceProducts(
      [...paths, "pingodoce"].map((p, i) => ({
        storeProductId: `${i}`,
        url: `${server.base}/${p}/produto-${i}.html`,
        section: "mercearia",
        categoryPath: "Mercearia/Conservas",
      }))
    );
    check("Pingo Doce: the 404 and the page sent home are gone", ids(pingo.dead) === "0,4", ids(pingo.dead));
    check("Pingo Doce: an unreadable page at the product's own address is could-not-tell, like the cut connection and the 503 (1.13)",
      ids(pingo.unreachable) === "1,2,3", ids(pingo.unreachable));
    check("Pingo Doce: the real page is read", pingo.fetched === 1 && pingo.withSize === 1);
  } finally {
    server.close();
  }
}

async function verifyBatching() {
  console.log("\n  H2: long lists of products reach the database in slices");
  const slices: number[] = [];
  const total = await forEachBatch(
    Array.from({ length: 1234 }, (_, i) => String(i)),
    async (slice) => {
      slices.push(slice.length);
      return slice.length;
    }
  );
  check(`1,234 ids go in slices of ${BATCH}`, slices.join(",") === "500,500,234" && total === 1234, slices.join(","));
  check("an empty list makes no query", (await forEachBatch([], async () => { throw new Error("called"); })) === 0);

  // 1,500 ids, three of them real: more than the database accepts in one list.
  await cleanup();
  for (const n of [1, 2, 3]) {
    await prisma.catalogueProduct.create({
      data: { store: STORE, storeProductId: `${PREFIX}${n}`, name: `Safety product ${n}`, url: "https://example.invalid/s" },
    });
  }
  const real = [1, 2, 3].map((n) => `${PREFIX}${n}`);
  const list = [...Array.from({ length: 1497 }, (_, i) => `${PREFIX}none-${i}`), ...real];
  const at = new Date();

  const survives = async (name: string, work: () => Promise<unknown>) => {
    try {
      await work();
      return true;
    } catch (e) {
      check(name, false, (e as Error).message.slice(-120));
      return false;
    }
  };
  const rows = () =>
    prisma.catalogueProduct.findMany({
      where: { storeProductId: { in: real } },
      select: { lastCheckedAt: true, unavailableAt: true, delistedAt: true },
    });

  if (await survives("touchChecked takes 1,500 ids", () => touchChecked(STORE, list, at))) {
    check("touchChecked takes 1,500 ids and marks the real ones", (await rows()).every((r) => r.lastCheckedAt?.getTime() === at.getTime()));
  }
  if (await survives("recordUnavailable takes 1,500 ids", () => recordUnavailable(STORE, list, at))) {
    check("recordUnavailable takes 1,500 ids and marks the real ones", (await rows()).every((r) => r.unavailableAt?.getTime() === at.getTime()));
  }
  if (await survives("recordRecategorised takes 1,500 ids", () => recordRecategorised(STORE, list, at))) {
    check("recordRecategorised takes 1,500 ids and marks the real ones", (await rows()).every((r) => r.delistedAt?.getTime() === at.getTime()));
  }
  if (await survives("clearChecks takes 1,500 ids", () => clearChecks(STORE, list))) {
    check("clearChecks takes 1,500 ids", true);
  }
  await cleanup();
}

async function verifyKindsKept() {
  console.log("\n  H3: a product no longer sold keeps its kind");
  const shelf = "Frutas e Legumes/Legumes/Batatas";
  const row = (id: string, delistedAt: Date | null, categoryPath = shelf) => ({
    id, store: STORE, storeProductId: id, name: "Batata Vermelha Continente", categoryPath, delistedAt,
  });
  const decided = kindAssignments([row("live", null), row("gone", new Date()), row("not-food", null, "Limpeza/Detergentes")]);
  const kindOf = (id: string) => decided.find((d) => d.id === id)?.foodType ?? null;
  check("a product on sale gets its kind", kindOf("live") === "batata", String(kindOf("live")));
  check("a product no longer sold gets the same kind", kindOf("gone") === "batata", String(kindOf("gone")));
  check("a product outside the food sections gets none", kindOf("not-food") === null);

  await cleanup();
  await prisma.catalogueProduct.create({
    data: { store: STORE, storeProductId: `${PREFIX}delisted`, name: "Batata Vermelha", url: "https://example.invalid/b", categoryPath: shelf, delistedAt: new Date() },
  });
  const targets = await rowsToClassify();
  check("classification reads products no longer sold", targets.some((t) => t.storeProductId === `${PREFIX}delisted`));
  await cleanup();

  // After tonight's classification step (which runs before the checks), the
  // database must hold exactly what today's rules give the products no longer sold.
  const delisted = targets.filter((t) => t.delistedAt !== null && !t.storeProductId.startsWith(PREFIX));
  const expected = new Map(kindAssignments(delisted).map((a) => [a.id, a.foodType]));
  const stored = await prisma.catalogueProduct.findMany({
    where: { delistedAt: { not: null }, foodType: { not: null } },
    select: { id: true, foodType: true },
  });
  const storedIds = new Set(stored.map((s) => s.id));
  const wrong =
    stored.filter((s) => expected.get(s.id) !== s.foodType).length +
    [...expected.keys()].filter((id) => !storedIds.has(id)).length;
  check(
    `the ${expected.size.toLocaleString()} products no longer sold that have a kind hold it in the database`,
    expected.size > 0 && wrong === 0,
    `${stored.length.toLocaleString()} stored, ${wrong} different`
  );
}

async function verifyMovedOut() {
  console.log("\n  H4: a product seen in a non-food section stops being tracked");
  await cleanup();
  const ids = [1, 2, 3, 4, 5, 6, 7].map((n) => `${PREFIX}moved-${n}`);
  for (const id of ids) {
    await prisma.catalogueProduct.create({
      data: { store: "AUCHAN", storeProductId: id, name: `Saqueta de fruta ${id}`, url: "https://example.invalid/m" },
    });
  }
  await prisma.catalogueProduct.create({
    data: { store: "AUCHAN", storeProductId: `${PREFIX}already`, name: "Already gone", url: "https://example.invalid/a", delistedAt: new Date(0) },
  });
  const at = new Date();
  const seen = [...ids, `${PREFIX}already`, `${PREFIX}never-held`];
  const delisted = async () =>
    prisma.catalogueProduct.count({ where: { storeProductId: { in: ids }, delistedAt: at } });

  // 7 of 100 held is 7%: above the 5% brake, so nothing is marked.
  const braked = await stopTrackingMovedOut("AUCHAN", seen, 100, at);
  check("an implausible share at once marks nothing and says why", braked.stopped.length === 0 && braked.refused !== null && (await delisted()) === 0,
    braked.refused?.slice(0, 60) ?? "no reason");

  // 7 of 1,000 is 0.7%: a real move.
  const moved = await stopTrackingMovedOut("AUCHAN", seen, 1000, at);
  check("a held product seen in a non-food section stops being tracked", moved.refused === null && (await delisted()) === 7);
  check("only products we hold and still track are counted", moved.stopped.length === 7 && moved.stopped.every((s) => ids.includes(s.storeProductId)),
    `${moved.stopped.length} stopped`);
  check("with their names, for the report", moved.stopped[0]?.name.startsWith("Saqueta de fruta"));
  await cleanup();
}

async function verifyKindWrites() {
  console.log("\n  H5: classification writes only what changed, all at once");
  const v = (id: string, foodType: string | null, subKind: string | null = null, labels: string | null = null) => ({ id, foodType, subKind, labels });
  const stored = [v("same", "batata"), v("relabelled", "atum", null, null), v("unknown-now", "maca"), v("new", null), v("still-none", null)];
  const decided = [v("same", "batata"), v("relabelled", "atum", null, "lata"), v("new", "pera")];
  const changes = kindChanges(stored, decided);
  const ids = changes.map((c) => c.id).sort().join(",");
  check("unchanged products are not written", ids === "new,relabelled,unknown-now", ids);
  check("a product no longer recognised goes back to no kind",
    changes.find((c) => c.id === "unknown-now")?.foodType === null);
  check("a change of label alone is written", changes.find((c) => c.id === "relabelled")?.labels === "lata");

  await cleanup();
  const shelf = "Frutas e Legumes/Legumes/Batatas";
  const make = (n: string, name: string, foodType: string | null) =>
    prisma.catalogueProduct.create({
      data: { store: STORE, storeProductId: `${PREFIX}k-${n}`, name, url: "https://example.invalid/k", categoryPath: shelf, foodType },
    });
  await make("wrong", "Batata Vermelha", "maca");
  await make("right", "Batata Branca", "batata");
  await make("stale", "Saco de Rede", "batata");
  // "right" must hold exactly what today's rules give it, sub-kind and labels too.
  const rightRow = (await rowsToClassify()).find((r) => r.storeProductId === `${PREFIX}k-right`);
  const rightValues = rightRow ? kindAssignments([rightRow])[0] : undefined;
  if (rightValues) {
    await prisma.catalogueProduct.update({
      where: { id: rightValues.id },
      data: { foodType: rightValues.foodType, subKind: rightValues.subKind, labels: rightValues.labels },
    });
  }
  const rows = (await rowsToClassify()).filter((r) => r.storeProductId.startsWith(PREFIX));
  const first = kindChanges(rows, kindAssignments(rows));
  await writeKindChanges(first);
  const after = new Map(
    (await prisma.catalogueProduct.findMany({ where: { storeProductId: { startsWith: `${PREFIX}k-` } }, select: { storeProductId: true, foodType: true } }))
      .map((r) => [r.storeProductId.replace(`${PREFIX}k-`, ""), r.foodType])
  );
  check("a wrong kind is corrected", after.get("wrong") === "batata", String(after.get("wrong")));
  check("a right kind is left alone, and was not rewritten", after.get("right") === "batata" && !first.some((c) => c.id === rows.find((r) => r.storeProductId.endsWith("k-right"))?.id));
  check("a kind the rules no longer give is cleared", after.get("stale") === null, String(after.get("stale")));
  const again = (await rowsToClassify()).filter((r) => r.storeProductId.startsWith(PREFIX));
  check("a second run finds nothing to write", kindChanges(again, kindAssignments(again)).length === 0);
  await cleanup();
}

function verifyGroupRules() {
  console.log("\n  H6: which groups of identical products may be built and shown");
  const m = (productId: string, store: string, barcode: string | null = null) => ({
    productId, store, size: null, barcode, barcodeExpected: store !== "PINGO_DOCE",
  });
  const link = (aId: string, bId: string) => ({ aId, bId, rung: "exact" });
  const only = (groups: ReturnType<typeof buildGroups>) => groups[0];

  // Wine #30 of the sample: Continente and Auchan refused (different barcodes),
  // each matched to Pingo Doce on name.
  const wine = [m("co", "CONTINENTE", "5608309023253"), m("pd", "PINGO_DOCE"), m("au", "AUCHAN", "5010867770744")];
  const chained = only(buildGroups(wine, [link("pd", "co"), link("pd", "au")], [{ aId: "co", bId: "au" }]));
  check("a group holding a refused pair is not built", chained.emit === false && chained.flags.includes("refused-pair"), chained.flags.join(","));
  const unrefused = only(buildGroups(wine, [link("pd", "co"), link("pd", "au")]));
  check("without the refusal it would be built", unrefused.emit === true);

  const agree = only(buildGroups([m("co", "CONTINENTE", "1"), m("pd", "PINGO_DOCE"), m("au", "AUCHAN", "1")], [link("co", "pd"), link("pd", "au")]));
  check("Continente and Auchan sharing a barcode, Pingo Doce by name: shown", agree.emit && shownOnSite(JSON.stringify(agree.flags)), agree.flags.join(","));
  const unread = only(buildGroups([m("co", "CONTINENTE", "1"), m("au", "AUCHAN", null)], [link("co", "au")]));
  check("an Auchan barcode not yet read keeps the group off the site", unread.flags.includes("barcode-unconfirmed") && !shownOnSite(JSON.stringify(unread.flags)));
  const differ = only(buildGroups([m("co", "CONTINENTE", "1"), m("au", "AUCHAN", "2")], [link("co", "au")]));
  check("two different barcodes keep it off the site", differ.flags.includes("barcode-unconfirmed"));
  const coPd = only(buildGroups([m("co", "CONTINENTE", "1"), m("pd", "PINGO_DOCE")], [link("co", "pd")]));
  check("a Continente-Pingo Doce pair rests on brand, size and name: shown", shownOnSite(JSON.stringify(coPd.flags)), coPd.flags.join(","));

  const twice = only(buildGroups([m("pd1", "PINGO_DOCE"), m("pd2", "PINGO_DOCE"), m("co", "CONTINENTE", "7")], [link("pd1", "co"), link("pd2", "co")]));
  check("two Pingo Doce products in one group, unproven: kept off the site", twice.flags.includes("duplicate-store") && !shownOnSite(JSON.stringify(twice.flags)));
  const listedTwice = only(buildGroups([m("co1", "CONTINENTE", "7"), m("co2", "CONTINENTE", "7"), m("pd", "PINGO_DOCE")], [link("co1", "pd"), link("co2", "pd")]));
  check("one product a store lists twice (same barcode) is not a duplicate", !listedTwice.flags.includes("duplicate-store"), listedTwice.flags.join(","));
  const organic = only(buildGroups([m("co1", "CONTINENTE", "5601252106677"), m("co2", "CONTINENTE", "5601252117734"), m("au", "AUCHAN", "5601252106677")], [link("co1", "au"), link("co2", "au")]));
  check("Gallo's regular and organic oil at one store: kept off the site", organic.flags.includes("duplicate-store") && !shownOnSite(JSON.stringify(organic.flags)));

  // Gallo #27: Continente lists the regular and the organic oil under one name;
  // Auchan's regular bottle shares the regular one's barcode and was refused
  // against the organic one.
  const gallo = buildGroups(
    [m("co-reg", "CONTINENTE", "5601252106677"), m("co-bio", "CONTINENTE", "5601252117734"), m("au", "AUCHAN", "5601252106677"), m("pd", "PINGO_DOCE")],
    [link("co-reg", "au"), link("co-reg", "pd"), link("co-bio", "pd"), link("pd", "au")],
    [{ aId: "co-bio", bId: "au" }]
  );
  check("a refused group keeps the part a shared barcode proves", gallo.length === 1 && gallo[0].emit && gallo[0].productIds.join(",") === "au,co-reg,pd",
    gallo.map((g) => `${g.productIds.join(",")} ${g.emit} ${g.flags.join(",")}`).join(" | "));
  check("that part is shown, at all three chains, marked as trimmed", shownOnSite(JSON.stringify(gallo[0].flags)) && gallo[0].storeCount === 3 && gallo[0].flags.includes("trimmed"));
  check("with no shared barcode nothing proves a part: still refused", chained.emit === false && !chained.flags.includes("trimmed"));

  check("a group with no flags is shown", shownOnSite(null));
  check("a group a person confirmed is still shown", shownOnSite(JSON.stringify(["weak-links-only"])));
  check("unreadable flags are not shown", !shownOnSite("{not json"));
}

function verifyRecheckSchedule() {
  console.log("\n  H7: a product no longer sold is looked at again after 7 and 30 days");
  const day = 86_400_000;
  const delisted = new Date("2026-10-22T03:00:00Z");
  const at = (days: number) => new Date(delisted.getTime() + days * day);
  check("not the next day", !delistedRecheckDue(delisted, delisted, at(1)));
  check("on day 7", delistedRecheckDue(delisted, delisted, at(7)));
  check("once only: not again on day 8 after the day-7 look", !delistedRecheckDue(delisted, at(7), at(8)));
  check("again on day 30", delistedRecheckDue(delisted, at(7), at(30)));
  check("then not until 90 days after the last look", !delistedRecheckDue(delisted, at(30), at(100)) && delistedRecheckDue(delisted, at(30), at(121)));
  check("a night missed is caught up: day 7's look still happens on day 9", delistedRecheckDue(delisted, delisted, at(9)));
  check("never looked at: due", delistedRecheckDue(delisted, null, at(1)));
}

async function verifyBarcodesKept() {
  console.log("\n  Auchan: a product page opened to check a missing product keeps its barcode");
  const page = (block: object) => `<script type="application/ld+json">${JSON.stringify(block)}</script>`;
  check("the barcode is read from the page", auchanBarcodeFromHtml(page({ "@type": "Product", name: "X", gtin: "5601252106677" })) === "5601252106677");
  check("a page without one gives none", auchanBarcodeFromHtml(page({ "@type": "Product", name: "X" })) === null);
  check("Auchan's \"not found\" page gives none", auchanBarcodeFromHtml("<p>Não temos o que procura</p>") === null);

  await cleanup();
  const make = (n: string, ean: string | null) =>
    prisma.catalogueProduct.create({
      data: { store: "AUCHAN", storeProductId: `${PREFIX}b-${n}`, name: n, url: "https://example.invalid/b", ean, eanNormalized: ean ? ean.padStart(14, "0") : null },
    });
  await make("blank", null);
  await make("known", "5601252106677");
  const filled = await fillBarcodes("AUCHAN", [
    { storeProductId: `${PREFIX}b-blank`, barcode: "5601252117734" },
    { storeProductId: `${PREFIX}b-known`, barcode: "5601252117734" },
  ], new Date());
  const rows = new Map(
    (await prisma.catalogueProduct.findMany({ where: { storeProductId: { startsWith: `${PREFIX}b-` } }, select: { storeProductId: true, eanNormalized: true } }))
      .map((r) => [r.storeProductId.replace(`${PREFIX}b-`, ""), r.eanNormalized])
  );
  check("a missing barcode is filled in", rows.get("blank") === "05601252117734", String(rows.get("blank")));
  check("a known barcode is never overwritten by a side read", rows.get("known") === "05601252106677" && filled === 1, `filled ${filled}`);
  await cleanup();
}

async function verifyNotForSale() {
  console.log("\n  H7: listed but not for sale - kept, no current price, never gone");
  await cleanup();
  const hit = (price: number | null) => ({
    id: `${PREFIX}nfs`, name: "Bolo de Arroz", price, brand: "Pingo Doce", category: "Padaria e Pastelaria/Bolos", url: "https://example.invalid/n",
  });
  const first = await openCatalogueWriter("PINGO_DOCE");
  await first.save([hit(null)], "Padaria e Pastelaria");
  const row = () => prisma.catalogueProduct.findUnique({
    where: { store_storeProductId: { store: "PINGO_DOCE", storeProductId: `${PREFIX}nfs` } },
    select: { unavailableAt: true, price: true, deadCount: true, delistedAt: true },
  });
  const saved = await row();
  check("saved without a price: marked unavailable, not gone", saved?.unavailableAt !== null && saved?.price === null && saved?.delistedAt === null);
  const back = await openCatalogueWriter("PINGO_DOCE");
  await back.save([hit(1.49)], "Padaria e Pastelaria");
  check("saved again with a price: available again", (await row())?.unavailableAt === null && (await row())?.price === 1.49);

  await prisma.catalogueProduct.update({
    where: { store_storeProductId: { store: "PINGO_DOCE", storeProductId: `${PREFIX}nfs` } },
    data: { deadCount: 2 },
  });
  await recordUnavailable("PINGO_DOCE", [`${PREFIX}nfs`], new Date());
  const out = await row();
  check("a page that says out of stock removes the current price", out?.price === null && out?.unavailableAt !== null);
  check("and resets the gone-night count, because the page answered", out?.deadCount === 0, `count ${out?.deadCount}`);
  await cleanup();

  const p = (store: string, price: number | null, packageSize: number | null) => ({
    storeProductId: `${store}-${price}`, store, name: "Batata", brand: null, price, packageSize, unit: packageSize ? "kg" : null,
  });
  const cells = cheapestPerStore([p("CONTINENTE", 1.2, 1), p("PINGO_DOCE", null, 1), p("AUCHAN", 2.4, null)], "batata", "kg");
  check("a store whose only product is unavailable reads as not selling it", cells.get("PINGO_DOCE")?.kind === "not-stocked");
  check("a priced product without a size still reads as no size", cells.get("AUCHAN")?.kind === "no-size");
  check("a priced, sized product is compared", cells.get("CONTINENTE")?.kind === "price");
}

/**
 * L6: a store that refuses everything is paused, then left alone. Run against
 * a server on this computer (its own port, so the other checks are untouched),
 * with the waits shortened to milliseconds.
 */
async function verifyRefusals() {
  console.log("\n  L6: a store that keeps refusing is paused, then left alone");
  check("one refused page: carry on", afterRefusal(1) === "carry on");
  check(`${REFUSALS.pagesBeforePause} in a row: pause`, afterRefusal(REFUSALS.pagesBeforePause) === "pause");
  const all = REFUSALS.pagesBeforePause * (REFUSALS.pausesMs.length + 1);
  check(`${all} in a row, through every pause: stop`, afterRefusal(all) === "stop" && afterRefusal(all - REFUSALS.pagesBeforePause) === "pause");

  let hits = 0;
  let answering = false;
  const server = createServer((_req, res) => {
    hits++;
    if (answering) res.writeHead(200, { "Content-Type": "text/html" }).end("<html>ok</html>");
    else res.writeHead(503, { "Retry-After": "0" }).end("busy");
  });
  const base = await new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  );
  setHttpTimingForChecks({ minDelayMs: 1, pausesMs: [5, 5, 5] });
  const verdicts: string[] = [];
  try {
    // 19 refused, then one answer: the count starts again.
    for (let i = 0; i < REFUSALS.pagesBeforePause - 1; i++) await fetchHtml(`${base}/p${i}`).catch(() => {});
    answering = true;
    await fetchHtml(`${base}/ok`);
    answering = false;
    for (let i = 0; i < all; i++) {
      await fetchHtml(`${base}/q${i}`).catch((e: Error) => verdicts.push(e.name));
    }
    check("a page that answers resets the count, so the store was still asked",
      verdicts.length === all && !verdicts.slice(0, all - 1).includes("StoreRefusingError"), verdicts.slice(-2).join());
    const before = hits;
    let refusedError: unknown = null;
    await fetchHtml(`${base}/after`).catch((e) => (refusedError = e));
    check("after every pause, the store is asked nothing more this run",
      refusedError instanceof StoreRefusingError && hits === before && stoppedStores().some((h) => base.endsWith(h)));
    check("and a refused page is never \"gone\"", failedPageVerdict(refusedError) === "unreachable");
    const counted = httpStats().find((h) => base.endsWith(h.host))?.requests;
    check("L5: every request sent is counted, refused and retried ones too", counted === hits, `${counted} counted, ${hits} received`);

    // L9: Pingo Doce's progress line counts pages attempted, read or not.
    const seen: number[] = [];
    const targets = Array.from({ length: 100 }, (_, i) => ({
      storeProductId: `${PREFIX}l9-${i}`, url: `${base}/l9/${i}`, section: "mercearia", categoryPath: "Mercearia",
    }));
    const run = await fetchPingoDoceProducts(targets, { onProgress: (p) => seen.push(p.page) });
    check("L9: 100 pages that all failed still print the progress line", seen.join() === "100" && run.fetched === 0, seen.join());
  } finally {
    setHttpTimingForChecks({ minDelayMs: 1_000, pausesMs: REFUSALS.pausesMs });
    server.close();
  }
}

/**
 * A store that says it is blocking us (474, as Continente did to the rented
 * server on 23 October 2026) is left alone after BLOCKS.blocksBeforeStop such
 * pages in a row - and nothing an ordinary removed product does can look like
 * that: a redirect to the home page, a "not found", a page without a product.
 */
async function verifyBlocks() {
  const n = BLOCKS.blocksBeforeStop;
  console.log(`\n  a store that blocks us is left alone after ${n} blocked pages in a row`);
  check("474 \"Request Blocked\" is a block", isBlockAnswer(474, "Request Blocked"));
  check("403 with a page saying blocked is a block", isBlockAnswer(403, "<h1>Request Blocked</h1>") && isBlockAnswer(403, "Acesso bloqueado"));
  check("403 without it, 404, 410, 503 and 200 are not",
    !isBlockAnswer(403, "<h1>Forbidden</h1>") && !isBlockAnswer(404, "") && !isBlockAnswer(410, "") && !isBlockAnswer(503, "busy") && !isBlockAnswer(200, "blocked"));

  let hits = 0;
  const server = createServer((req, res) => {
    hits++;
    if (req.url?.startsWith("/moved")) res.writeHead(302, { Location: "/" }).end();
    else if (req.url === "/") res.writeHead(200, { "Content-Type": "text/html" }).end("<html>home page, no product</html>");
    else if (req.url?.startsWith("/gone")) res.writeHead(404).end("not found");
    else res.writeHead(474).end("Request Blocked");
  });
  const base = await new Promise<string>((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))
  );
  setHttpTimingForChecks({ minDelayMs: 1, pausesMs: [5, 5, 5] });
  try {
    // 9 blocked, then a product that moved to the home page; 9 blocked, then a "not found".
    const errors: string[] = [];
    for (let i = 0; i < n - 1; i++) await fetchHtml(`${base}/a${i}`).catch((e: Error) => errors.push(e.name));
    const home = await fetchPage(`${base}/moved-1`);
    check("a removed product sent on to the home page is an answer, not a block", home.url === `${base}/`);
    for (let i = 0; i < n - 1; i++) await fetchHtml(`${base}/b${i}`).catch((e: Error) => errors.push(e.name));
    await fetchHtml(`${base}/gone-1`).catch((e) => errors.push(failedPageVerdict(e)));
    check(`each of those starts the count again, so ${2 * (n - 1)} blocked pages did not stop the store`,
      !errors.includes("StoreRefusingError") && errors.at(-1) === "gone", errors.slice(-2).join());
    check("a blocked page is asked once, not three times", hits === 2 * (n - 1) + 2 + 1, `${hits} requests`);

    let last: unknown = null;
    for (let i = 0; i < n; i++) await fetchHtml(`${base}/c${i}`).catch((e) => (last = e));
    check("a blocked page is never \"gone\"", failedPageVerdict(last) === "unreachable");
    const before = hits;
    let after: unknown = null;
    await fetchHtml(`${base}/d`).catch((e) => (after = e));
    check(`after ${n} blocked pages in a row the store is asked nothing more this run`,
      after instanceof StoreRefusingError && hits === before && stoppedStores().some((h) => base.endsWith(h)), String(after));
  } finally {
    setHttpTimingForChecks({ minDelayMs: 1_000, pausesMs: REFUSALS.pausesMs });
    server.close();
  }
}

/** The sitemap-date test: dates kept when they change, page changes kept field by field. */
async function verifySitemapDates() {
  console.log("\n  the sitemap-date test: what is kept each night");
  const base: PageFields = { price: 1.99, name: "Atum", brand: "Bom Petisco", size: "0.12 kg", shelf: "Mercearia", promotion: false, regularPrice: null, barcode: "5601234567897" };
  check("nothing changed, nothing kept", changedFields(base, { ...base, price: 1.9900000001 }).length === 0);
  const diff = changedFields(base, { ...base, price: 2.19, name: "Atum em Azeite" });
  check("a new price and a new name are each kept, with before and after",
    diff.map((d) => `${d.field}:${d.before}>${d.after}`).join() === "price:1.99>2.19,name:Atum>Atum em Azeite", diff.map((d) => d.field).join());

  await cleanup();
  const a = `${PREFIX}date-a`;
  const b = `${PREFIX}date-b`;
  const night = (d: number) => new Date(Date.UTC(2026, 9, 23 + d));
  const first = await recordSitemapDates(STORE, new Map([[a, night(-5).getTime()], [b, night(-5).getTime()]]), night(0));
  const same = await recordSitemapDates(STORE, new Map([[a, night(-5).getTime()], [b, night(-5).getTime()]]), night(1));
  const moved = await recordSitemapDates(STORE, new Map([[a, night(1).getTime()], [b, night(-5).getTime()]]), night(2));
  const rows = await prisma.sitemapDate.count({ where: { storeProductId: { startsWith: PREFIX } } });
  check("a date is kept the first time, not again while it stays, and again when it moves",
    first.first === 2 && same.changed + same.first === 0 && moved.changed === 1 && rows === 3, `${JSON.stringify([first, same, moved])} rows ${rows}`);

  await prisma.catalogueProduct.create({
    data: { store: STORE, storeProductId: a, name: "Atum", brand: "Bom Petisco", url: "https://example.invalid/d", price: 1.99, categoryPath: "Mercearia/Conservas" },
  });
  const before = await pageFieldsBefore(STORE);
  const writer = await openCatalogueWriter(STORE);
  await writer.save([{ id: a, name: "Atum", price: 2.19, brand: "Bom Petisco", category: "Mercearia/Conservas", url: "https://example.invalid/d" }], "Mercearia");
  const counts = await recordPageChanges(STORE, before, writer.seenAt);
  const kept = await prisma.pageChange.findMany({ where: { storeProductId: a } });
  check("a page read tonight with a new price leaves one change, the price", Object.keys(counts).join() === "price" && counts.price === 1 && kept.some((k) => k.field === "price" && k.before === "1.99" && k.after === "2.19"),
    JSON.stringify(counts));

  // A count of eggs or capsules, filled in after the crawl, survives a page
  // that shows no size - and so leaves no false "size change" (2.22, 3.8).
  const eggs = `${PREFIX}date-eggs`;
  await prisma.catalogueProduct.create({
    data: { store: STORE, storeProductId: eggs, name: "Ovos M", url: "https://example.invalid/o", price: 2.49, categoryPath: "Laticínios e Ovos/Ovos", packageSize: 12, unit: "un" },
  });
  const beforeEggs = await pageFieldsBefore(STORE);
  const eggWriter = await openCatalogueWriter(STORE);
  await eggWriter.save([{ id: eggs, name: "Ovos M", price: 2.49, brand: "Continente", category: "Laticínios e Ovos/Ovos", url: "https://example.invalid/o", packageSize: null, unit: null }], "Laticínios");
  const eggCounts = await recordPageChanges(STORE, beforeEggs, eggWriter.seenAt);
  const eggRow = await prisma.catalogueProduct.findUnique({ where: { store_storeProductId: { store: STORE, storeProductId: eggs } }, select: { packageSize: true, unit: true } });
  check("a count of eggs survives a page with no size, and no size change is recorded",
    eggRow?.packageSize === 12 && eggRow?.unit === "un" && !("size" in eggCounts), `${JSON.stringify(eggRow)} ${JSON.stringify(eggCounts)}`);
  await cleanup();
}

/** M5: why a product left is recorded beside when, and cleared when it returns. */
async function verifyDelistReason() {
  console.log("\n  M5: why a product left is recorded");
  await cleanup();
  const ids = ["gone", "moved", "back"].map((s) => `${PREFIX}why-${s}`);
  for (const id of ids) {
    await prisma.catalogueProduct.create({
      data: { store: STORE, storeProductId: id, name: "Atum", url: "https://example.invalid/w", price: 1.5, categoryPath: "Mercearia/Conservas" },
    });
  }
  const why = async (id: string) =>
    prisma.catalogueProduct.findUnique({
      where: { store_storeProductId: { store: STORE, storeProductId: id } },
      select: { delistedAt: true, delistReason: true },
    });
  for (let night = 0; night < DEAD_NIGHTS_BEFORE_DELISTING; night++) await recordDead(STORE, [ids[0], ids[2]], new Date());
  const gone = await why(ids[0]);
  check("three dead nights: delisted as gone", gone?.delistedAt !== null && gone?.delistReason === "gone", String(gone?.delistReason));
  await recordRecategorised(STORE, [ids[1]], new Date());
  check("moved to a non-food shelf: delisted as not food", (await why(ids[1]))?.delistReason === "not-food");
  const writer = await openCatalogueWriter(STORE);
  await writer.save([{ id: ids[2], name: "Atum", price: 1.5, brand: "Bom Petisco", category: "Mercearia/Conservas", url: "https://example.invalid/w" }], "Mercearia");
  const back = await why(ids[2]);
  check("a product seen again is no longer delisted, and has no reason", back?.delistedAt === null && back?.delistReason === null);
  await cleanup();
}

export async function verifyCrawlSafety(): Promise<number> {
  failures = 0;
  try {
    await verifyFailedPages();
    await verifyRefusals();
    await verifyBlocks();
    await verifyBatching();
    await verifyKindsKept();
    await verifyMovedOut();
    await verifyKindWrites();
    verifyGroupRules();
    verifyRecheckSchedule();
    await verifyBarcodesKept();
    await verifyNotForSale();
    await verifyDelistReason();
    await verifySitemapDates();
  } finally {
    await cleanup();
  }
  return failures;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify-crawl-safety.ts")) {
  verifyCrawlSafety().then(async (n) => {
    console.log(`\n${n === 0 ? "all checks passed" : `${n} CHECK(S) FAILED`}`);
    if (n > 0) process.exitCode = 1;
    await prisma.$disconnect();
  });
}
