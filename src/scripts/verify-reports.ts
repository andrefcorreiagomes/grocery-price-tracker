import { databaseFile, prisma } from "../lib/db";
import { mergeResultsByLabel, type DailyReport } from "../scrapers/crawl/daily-report";
import { renderReport } from "../scrapers/crawl/render-report";
import { buildRotationReport, type RotationExtras } from "../scrapers/crawl/rotation-report";
import { STORE_LIST, storeCountWord } from "../lib/stores";
import { lisbonDate, lisbonDayMonth } from "../lib/dates";
import { LOG_KEEP_DAYS, logsToPrune } from "./log-retention";

/**
 * The crawl reports say what the run did, and nothing it did not (code review
 * finding M1, docs/code-review-2026-10.md). Mostly pure; one database check
 * writes two made-up products under the zzrep- prefix and removes them.
 */

const PREFIX = "zzrep-";
let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

const rotation = (complete: boolean): RotationExtras => ({
  complete,
  refreshedThisRun: 17122,
  staleness: { today: 17122, week: 56, month: 282, older: 2 },
  daysToFullCoverage: 2,
  oldestSeenAt: "2026-08-19T12:57:00.000Z",
  deadPagesThisRun: 2,
  deadSamples: [{ storeProductId: "2373500", name: "Pera Packham's Continente", detail: "no product on the page" }],
  enrichment: { total: 17136, withBarcode: 17119, withSize: 15747 },
  sections: [{ label: "Mercearia", ours: 5106, published: 5418 }],
});

const base = (extra: Partial<DailyReport>): DailyReport => ({
  store: "CONTINENTE",
  runAt: "2026-10-22T03:25:00.000Z",
  verdict: "OK",
  problems: [],
  baseline: { runs: 5, since: "2026-08-21T15:03:00.000Z" },
  scraper: { sections: [], requests: 0, megabytes: 0, transferredMegabytes: null, minutesFetching: 0, retries: 0, slowdown: null },
  quality: { total: 17136, missingPrice: 0, missingBrand: 0, missingCategory: 0, missingUrl: 0 },
  catalogue: { seen: 0, newProducts: 0, disappeared: 0, stillMissing: 0, returned: 0, moved: 0, renamed: 0, samples: { newProducts: [], disappeared: [], returned: [], moved: [], renamed: [] } },
  prices: { opened: 0, changed: 0, unchanged: 0, skipped: 0, movers: [], absurd: [] },
  categories: { published: 0, crawled: 0, unknown: [], missing: [], publishedCountChanges: [], sitemapSlugs: 0, sitemapUnknown: [] },
  live: { candidatePairsAffected: 0 },
  drift: [],
  ...extra,
});

function verifyRendering() {
  console.log("  how the report is written out");
  const full = renderReport(base({ rotation: rotation(true) }), { explain: true });
  check("a full run is not called a slice", !full.includes("refreshed a slice") && full.includes("Freshness: when each product was last confirmed"));
  const slice = renderReport(base({ rotation: rotation(false) }), { explain: true });
  check("a slice still is", slice.includes("refreshed a slice") && slice.includes("Rotation: is the whole catalogue being reached"));
  check("dead pages are named by their product", full.includes("Pera Packham's Continente") && full.includes("no product on the page"));
  check("the notes no longer cite sections Continente removed", !/Bio e Saud|Frescos/.test(full), (full.match(/.{30}(Bio e Saud|Frescos).{30}/) ?? [""])[0]);
  check("the data quality counts products on sale", full.includes("17136 products on sale"));

  const grid = renderReport(
    base({
      store: "AUCHAN",
      rotation: rotation(true),
      gridHealth: {
        mode: "full", distinctWalked: 55000, coverage: [], addedByDepartments: 0, delisting: "active",
        tilesSeen: 1, tilesKept: 1, tilesUnpriced: 0, tilesMalformed: 0, withoutCategory: 0, segments: [],
        segmentsAppeared: [], segmentsVanished: [], segmentsAreBaseline: false, confirmedDead: 0, delistedNow: 0,
        delistedSamples: [], unavailable: 0, unavailableSkipped: 0, unreachable: 0, aliveButMissing: 0,
        aliveButMissingSamples: [], movedToNonFood: 0, movedToNonFoodSamples: [],
      },
    }),
    { explain: true }
  );
  check("Auchan's report has no section written for product pages", !grid.includes("What only a product page can tell us"));
  check("but still shows its barcode and size coverage", grid.includes("Barcodes and sizes") && grid.includes("products on sale with a barcode"));

  const merged = mergeResultsByLabel([
    { category: { cgid: "Mercearia", label: "Mercearia" }, products: [{ id: "1" } as never, { id: "2" } as never] },
    { category: { cgid: "Talho", label: "Talho" }, products: [{ id: "3" } as never] },
    { category: { cgid: "Mercearia", label: "Mercearia" }, products: [{ id: "4" } as never] },
  ]);
  check("a section collected in two passes is listed once", merged.length === 2 && merged[0].products.length === 3, merged.map((m) => `${m.category.label} ${m.products.length}`).join(", "));
}

async function verifyDelistedLeftOut() {
  console.log("\n  products no longer sold are left out of the freshness figures");
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  const seenAt = new Date();
  const input = {
    store: "PINGO_DOCE" as const, complete: true, seenAt, refreshed: 1, dead: 0, deadSamples: [], nonFood: 0,
    prices: { opened: 0, changed: 0, unchanged: 0, skipped: 0 }, http: [], publishedCounts: new Map(), newProducts: [], newCount: 0,
  };
  const before = (await buildRotationReport(input)).rotation!.staleness.older;
  const old = new Date(seenAt.getTime() - 60 * 86_400_000);
  await prisma.catalogueProduct.create({ data: { store: "PINGO_DOCE", storeProductId: `${PREFIX}live`, name: "x", url: "https://example.invalid/r", lastSeenAt: old } });
  await prisma.catalogueProduct.create({ data: { store: "PINGO_DOCE", storeProductId: `${PREFIX}gone`, name: "y", url: "https://example.invalid/r", lastSeenAt: old, delistedAt: old } });
  const after = (await buildRotationReport(input)).rotation!.staleness.older;
  check("an old product on sale counts, an old delisted one does not", after - before === 1, `${before} -> ${after}`);
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

export async function verifyReports(): Promise<number> {
  failures = 0;
  verifyRendering();
  console.log("\n  the number of stores, in words, for the site (code review M11)");
  check("three stores read \"três\", four would read \"quatro\"", storeCountWord() === "três" && storeCountWord(4) === "quatro" && STORE_LIST.length === 3);
  console.log("\n  dates on the site are Lisbon days (code review M14)");
  // The Auchan crawl started at 00:05 on 22 October in Lisbon: 23:05 UTC on the 21st.
  const auchanStart = new Date("2026-10-21T23:05:00Z");
  check("a crawl at 00:05 Lisbon is dated that day, whatever the server's clock", lisbonDate(auchanStart) === "22/10/2026" && lisbonDayMonth(auchanStart) === "22/10",
    `${lisbonDate(auchanStart)} ${lisbonDayMonth(auchanStart)}`);
  console.log("\n  the database is the one DATABASE_URL names (code review M7)");
  const setting = process.env.DATABASE_URL;
  try {
    process.env.DATABASE_URL = "file:./elsewhere/test.db";
    const named = databaseFile();
    delete process.env.DATABASE_URL;
    const unset = databaseFile();
    check("a file named in the setting is used, relative to the folder the program runs in",
      named.replace(/\\/g, "/").endsWith("/elsewhere/test.db") && named.startsWith(process.cwd()), named);
    check("with no setting, dev.db in that folder, as before", unset.replace(/\\/g, "/").endsWith("/dev.db"), unset);
  } finally {
    if (setting === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = setting;
  }

  console.log("\n  old logs are removed after 90 days, robots.txt copies never (code review L8)");
  const now = new Date("2026-10-22T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  const pruned = logsToPrune(
    [
      { name: "nightly-2026-06-01-00-05", modified: daysAgo(143) },
      { name: "crawl-2026-10-03-15-55-auchan.log", modified: daysAgo(19) },
      { name: "robots-2026-10-03-auchan.txt", modified: daysAgo(400) },
      { name: "nightly-2026-07-24-00-05", modified: daysAgo(LOG_KEEP_DAYS - 1) },
    ],
    now
  );
  check("a night's logs older than 90 days go; younger ones stay; robots copies stay however old",
    pruned.join() === "nightly-2026-06-01-00-05", pruned.join());

  try {
    await verifyDelistedLeftOut();
  } finally {
    await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
  }
  return failures;
}

// Run directly, not when imported by verify-nightly.
if (process.argv[1]?.replace(/\\/g, "/").endsWith("verify-reports.ts")) {
  verifyReports().then(async (n) => {
    console.log(`\n${n === 0 ? "all checks passed" : `${n} CHECK(S) FAILED`}`);
    if (n > 0) process.exitCode = 1;
    await prisma.$disconnect();
  });
}
