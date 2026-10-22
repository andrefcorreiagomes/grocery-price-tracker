import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { prisma } from "../lib/db";
import { failedPageVerdict, HttpError, NetworkError } from "../scrapers/http";
import { PageReadError } from "../scrapers/types";
import { fetchProducts } from "../scrapers/crawl/continente-products";
import { fetchPingoDoceProducts } from "../scrapers/crawl/pingodoce-products";
import {
  BATCH,
  clearChecks,
  forEachBatch,
  recordRecategorised,
  recordUnavailable,
  touchChecked,
} from "../scrapers/crawl/product-checks";
import { kindAssignments, rowsToClassify } from "./classify-food-types";

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
    } else if (path.startsWith("/empty")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end("<html><body>Página sem produto</body></html>");
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
    const paths = ["gone", "drop", "busy", "empty"];
    const continente = await fetchProducts(
      [...paths, "continente"].map((p, i) => ({ storeProductId: `${p}-${i}`, url: `${server.base}/${p}/${i}.html` })),
      { isFood: () => true }
    );
    check("Continente: the 404 and the page without a product are gone", ids(continente.dead) === "empty-3,gone-0", ids(continente.dead));
    check("Continente: the cut connection and the 503 are could-not-tell", ids(continente.unreachable) === "busy-2,drop-1", ids(continente.unreachable));
    check("Continente: the real page is read", continente.fetched === 1 && continente.results[0]?.products[0]?.price === 2.49);

    const pingo = await fetchPingoDoceProducts(
      [...paths, "pingodoce"].map((p, i) => ({
        storeProductId: `${p}-${i}`,
        url: `${server.base}/${p}/${i}.html`,
        section: "mercearia",
        categoryPath: "Mercearia/Conservas",
      }))
    );
    check("Pingo Doce: the 404 and the page without a product are gone", ids(pingo.dead) === "empty-3,gone-0", ids(pingo.dead));
    check("Pingo Doce: the cut connection and the 503 are could-not-tell", ids(pingo.unreachable) === "busy-2,drop-1", ids(pingo.unreachable));
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

export async function verifyCrawlSafety(): Promise<number> {
  failures = 0;
  try {
    await verifyFailedPages();
    await verifyBatching();
    await verifyKindsKept();
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
