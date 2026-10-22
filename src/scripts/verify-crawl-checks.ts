import { classifyFoodType, isFoodSection } from "../lib/food-types";
import { topSectionKind } from "../lib/store-sections";
import { categoryPathFromUrl, labelFromSlug, productIdFromUrl, PINGO_DOCE_SECTIONS } from "../scrapers/crawl/pingodoce-sitemap";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { coverageRows } from "../scrapers/crawl/pingodoce";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { compareWithBaseline, MIN_SECTION_FOR_DROP, sectionWarnings } from "../scrapers/crawl/history";
import { detached } from "../scrapers/types";
import { discoverProductUrls } from "../scrapers/crawl/continente-products";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Checks of the crawls' own checks: section counts across a change of crawler,
 * sitemap dates, no page kept in memory, rotation warnings, and Pingo Doce's
 * sitemap and report.
 *
 * Moved out of verify-matching.ts on 22 October 2026, which had grown to 2,100
 * lines on several subjects (code review M13). Unchanged, except that each
 * failure is now counted once: there, each part's failures were added to the
 * total twice.
 */

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

export async function verifyCrawlChecks(): Promise<number> {
  failures = 0;
  verifySectionComparison();
  await verifySitemapLastmod();
  verifyNoPageRetention();
  await verifyRotationWarnings();
  verifyPingoDoceSitemap();
  return failures;
}

/**
 * Run-over-run section comparison, keyed on the LABEL rather than on `cgid`.
 *
 * The case is taken verbatim from the night Continente switched routes. The
 * grid crawler had recorded `frescos`, `laticinios`, `mercearias`; the
 * product-page crawler records the display label, because it groups by each
 * product's own category path. Keyed on cgid, the comparison read that as all
 * six sections vanishing - in a run that had just fetched 17,088 products
 * across those very sections.
 *
 * Both sides are copied out of the CrawlRun rows the two runs actually wrote,
 * so the fixture cannot quietly agree with whatever the test author assumed.
 *
 * Tests `sectionWarnings` rather than `compareWithPrevious`, which reads the
 * store's NEWEST run from the database. Writing a fixture row there would mean
 * future-dating it to win that ordering, and one left behind by a crashed test
 * would poison every real comparison for that store afterwards - a worse
 * failure than the one being guarded against. The first version of this test
 * did try it, back-dated the row, and silently compared against Auchan's real
 * August run instead.
 */
function verifySectionComparison(): number {
  const before = failures;
  console.log("\n  section comparison across a change of crawler");

  // Verbatim from the night Continente switched routes, both sides copied out
  // of the recorded CrawlRun rows rather than invented.
  const previous = {
    startedAt: new Date("2026-08-21T15:29:00Z"),
    total: 17090,
    sections: [
      { cgid: "frescos", label: "Frescos", collected: 3320 },
      { cgid: "laticinios", label: "Laticínios e Ovos", collected: 1164 },
      { cgid: "mercearias", label: "Mercearia", collected: 5004 },
    ],
  };
  // What the product-page crawler writes: the label in both columns, because it
  // groups by each product's own category path and has no cgid to record.
  const now = [
    { cgid: "Frescos", label: "Frescos", collected: 3409 },
    { cgid: "Laticínios e Ovos", label: "Laticínios e Ovos", collected: 1132 },
    { cgid: "Mercearia", label: "Mercearia", collected: 4874 },
  ];

  const warnings = sectionWarnings(previous, 17060, now);
  check(
    "changing crawler does not read as sections disappearing",
    !warnings.some((w) => w.includes("missing from this one")),
    warnings.find((w) => w.includes("missing from this one")) ?? "no false alarms"
  );
  check(
    "and no drop is invented from the same numbers",
    warnings.length === 0,
    warnings.join(" | ") || "no warnings"
  );

  // An accent or a case difference between the two crawlers must not resurrect
  // the same false alarm by another route.
  check(
    "the label match survives accents and case",
    sectionWarnings(previous, 17060, [
      { cgid: "x", label: "FRESCOS", collected: 3409 },
      { cgid: "y", label: "Laticinios e Ovos", collected: 1164 },
      { cgid: "z", label: "mercearia", collected: 5004 },
    ]).length === 0
  );

  // The alarm must still fire: Mercearia gone entirely, Frescos collapsed.
  const broken = sectionWarnings(previous, 17060, [
    { cgid: "Frescos", label: "Frescos", collected: 1000 },
    { cgid: "Laticínios e Ovos", label: "Laticínios e Ovos", collected: 1132 },
  ]);
  check(
    "a genuinely absent section is still reported",
    broken.some((w) => w.startsWith("Mercearia") && w.includes("missing from this one")),
    broken.find((w) => w.includes("missing")) ?? "(nothing reported)"
  );
  check(
    "and a genuine collapse is still reported",
    broken.some((w) => w.startsWith("Frescos:") && w.includes("fewer")),
    broken.find((w) => w.startsWith("Frescos:")) ?? "(nothing reported)"
  );

  // Small aisles, from Continente's nights of 21 and 22 October 2026: each of
  // these warned, and none meant anything.
  const small = {
    startedAt: new Date("2026-10-21T00:05:00Z"),
    total: 17000,
    sections: [
      { cgid: "Garrafeira", label: "Garrafeira", collected: 2 },
      { cgid: "Marcas", label: "Marcas", collected: 25 },
      { cgid: "Campanhas", label: "Campanhas", collected: 1 },
      { cgid: "Frescos", label: "Frescos", collected: 3409 },
    ],
  };
  const smallNow = [
    { cgid: "Garrafeira", label: "Garrafeira", collected: 1 },
    { cgid: "Marcas", label: "Marcas", collected: 4 },
    { cgid: "Frescos", label: "Frescos", collected: 3409 },
  ];
  const quiet = sectionWarnings(small, 17000, smallNow);
  check(`sections under ${MIN_SECTION_FOR_DROP} products do not warn, shrinking or gone`, quiet.length === 0, quiet.join(" | ") || "no warnings");
  const collapsed = sectionWarnings(small, 17000, [...smallNow.slice(0, 2), { cgid: "Frescos", label: "Frescos", collected: 42 }]);
  check("a large section collapsing still does (Frescos, 3,409 to 42, 19 October 2026)",
    collapsed.length === 1 && collapsed[0].startsWith("Frescos:"), collapsed.join(" | "));
  const median = compareWithBaseline(
    { runs: 5, since: new Date("2026-08-21T15:03:00Z"), total: 17000, perRequestMs: null,
      sections: new Map([["Marcas", 14.5], ["Oportunidades", 2.5], ["Frescos", 3409]]) },
    17000,
    [{ cgid: "Marcas", label: "Marcas", collected: 6 }, { cgid: "Oportunidades", label: "Oportunidades", collected: 1 },
      { cgid: "Frescos", label: "Frescos", collected: 42 }]
  );
  check("against the median too: small aisles quiet, the large collapse reported",
    median.length === 1 && median[0].startsWith("Frescos:"), median.join(" | "));

  return failures - before;
}

/**
 * Reading `<lastmod>` out of Continente's product sitemap, so phase 3 opens the
 * ~88,000 never-seen ids newest-first instead of in whatever order the files
 * happen to list them.
 *
 * Served from a local file rather than the live sitemap - `discoverProductUrls`
 * reads `CONTINENTE_SITEMAP_URL`, which exists precisely so this path can be
 * exercised without 6 requests and 30 MB. The fixture is the real published
 * shape, copied from one of the files:
 *
 *   <url><loc>...</loc><lastmod>2026-08-27T22:41:49+00:00</lastmod>
 *        <changefreq>daily</changefreq><priority>0.5</priority></url>
 */
async function verifySitemapLastmod(): Promise<number> {
  const before = failures;
  console.log("\n  sitemap lastmod (phase 3 ordering)");

  const entry = (id: string, when: string | null) =>
    `<url><loc>https://www.continente.pt/produto/coisa-marca-${id}.html</loc>` +
    (when ? `<lastmod>${when}</lastmod>` : "") +
    `<changefreq>daily</changefreq><priority>0.5</priority></url>`;

  const products =
    `<?xml version="1.0" ?><urlset>` +
    entry("111", "2026-07-17T10:59:51+00:00") + // oldest
    entry("222", "2026-08-27T22:41:49+00:00") + // newest
    entry("333", null) + // publishes no date
    `</urlset>`;

  // Served over HTTP on a loopback port, because `fetchHtml` speaks http only -
  // and because going through the real fetch path is the point: it proves the
  // parse against the shape the store actually publishes, not against a string
  // handed straight to a helper.
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/xml" });
    res.end(
      req.url === "/index.xml"
        ? `<?xml version="1.0" ?><sitemapindex><sitemap>` +
            `<loc>http://127.0.0.1:${port}/sitemap_1-product.xml</loc>` +
            `</sitemap></sitemapindex>`
        : products
    );
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const port = (server.address() as AddressInfo).port;

  try {
    process.env.CONTINENTE_SITEMAP_URL = `http://127.0.0.1:${port}/index.xml`;
    const sitemap = await discoverProductUrls();

    check("every product url is still found", sitemap.urls.size === 3, `${sitemap.urls.size} of 3`);
    check(
      "a published lastmod is read as a date",
      sitemap.lastmod.get("222") === Date.parse("2026-08-27T22:41:49+00:00")
    );
    check(
      "an entry without a lastmod is absent, not zero",
      !sitemap.lastmod.has("333") && sitemap.lastmod.size === 2,
      "zero would sort as 1970 and be indistinguishable from a real old date"
    );

    // The ordering phase 3 applies, with the same comparator.
    const order = ["111", "333", "222"]
      .slice()
      .sort(
        (a, b) => (sitemap.lastmod.get(b) ?? -Infinity) - (sitemap.lastmod.get(a) ?? -Infinity)
      );
    check(
      "newest first, and undated ids sort last",
      order.join(",") === "222,111,333",
      order.join(" then ")
    );
  } finally {
    delete process.env.CONTINENTE_SITEMAP_URL;
    await new Promise<void>((ok) => server.close(() => ok()));
  }

  return failures - before;
}

/**
 * The bug that killed the first full Continente pass: a short field cut out of
 * a big page keeps the whole page alive, because V8 substrings are views rather
 * than copies. The crawl held 2,200 results and died at 4 GB.
 *
 * Measured rather than asserted, and measured on the SAME scale that matters -
 * many pages held at once - because one retained page is invisible and two
 * thousand are fatal. No network and no database: a simulated page is a string,
 * which is all the bug was ever about.
 *
 * A slice-shaped test would not have caught this. 300 pages is about 570 MB,
 * comfortably inside the heap, which is exactly why a 300-product live slice
 * ran clean an hour before the full pass fell over.
 */
function verifyNoPageRetention(): number {
  const before = failures;
  console.log("\n  page retention (the OOM that killed the first full pass)");

  const PAGES = 200;
  const PAGE_BYTES = 1_000_000;
  // Present only under `--expose-gc`. With it the numbers are exact; without
  // it, the pages just dropped are still counted as live, so the two figures
  // are compared against EACH OTHER rather than against an absolute - see the
  // threshold below.
  const gc = (globalThis as { gc?: () => void }).gc;

  const heldPerPage = (extract: (html: string) => string): number => {
    gc?.();
    const kept: string[] = [];
    const heapBefore = process.memoryUsage().heapUsed;
    for (let i = 0; i < PAGES; i++) {
      kept.push(extract(`x${i}`.padEnd(PAGE_BYTES, "abcdefgh") + `"cat":"Mercearia/Atum ${i}"`));
    }
    gc?.();
    const held = (process.memoryUsage().heapUsed - heapBefore) / PAGES;
    // `kept` must stay reachable across the measurement, or the very thing
    // under test is collected before it can be measured
    if (kept.length !== PAGES) throw new Error("unreachable");
    return held;
  };

  const naive = heldPerPage((html) => html.match(/"cat":"([^"]*)"/)![1]);
  const fixed = heldPerPage((html) => detached(html.match(/"cat":"([^"]*)"/)![1]));

  check(
    "a bare regex capture does retain its whole page",
    naive > PAGE_BYTES / 2,
    `${(naive / 1024).toFixed(0)} KB per page - the bug is real, not theoretical`
  );
  // Relative, not absolute, so this is honest whether or not --expose-gc is on.
  // Under gc the fixed figure is ~0 against a full page; without it, uncollected
  // garbage inflates both and the ratio still separates them cleanly. What must
  // never happen is the two being ALIKE, which is what dropping `detached`
  // would produce.
  check(
    "detached() keeps the field without the page",
    fixed < naive / 3,
    `${(fixed / 1024).toFixed(1)} KB against ${(naive / 1024).toFixed(0)} KB` +
      (gc ? "" : "   (no --expose-gc: both figures include uncollected garbage)")
  );
  check(
    "and it is still the same text",
    detached("Mercearia/Atum 7") === "Mercearia/Atum 7" && detached(null) === null
  );

  return failures - before;
}

/**
 * Two ways the rotation report misreported itself, both found by running a
 * 20-product slice against the live site and reading what it printed. Neither
 * was reachable offline before, because both only appear on a PARTIAL run.
 */
async function verifyRotationWarnings(): Promise<number> {
  const before = failures;
  console.log("\n  the rotation report, on a partial run");

  const base = {
    store: "CONTINENTE" as const,
    seenAt: new Date(),
    refreshed: 13,
    deadSamples: [],
    nonFood: 0,
    prices: { unchanged: 0, changed: 0, opened: 0, skipped: 0 },
    http: [],
    publishedCounts: new Map<string, number>(),
    newProducts: [],
    newCount: 0,
  };

  const said = (report: { problems: string[] }, needle: RegExp) =>
    report.problems.some((p) => needle.test(p));

  // 17,293 products refreshed 13 at a time is "1331 days to a full pass" - which
  // is arithmetic on a deliberate slice, not a finding about the catalogue.
  const partial = await buildRotationReport({ ...base, complete: false, dead: 9 });
  check(
    "a --limit run does not claim the full pass takes 1331 days",
    !said(partial, /a full pass takes/),
    "the rate means nothing when the budget was deliberately tiny"
  );

  const full = await buildRotationReport({ ...base, complete: true, dead: 9 });
  check(
    "a complete run still reports a genuinely slow rate",
    said(full, /a full pass takes/),
    "standing the warning down must not disable it everywhere"
  );

  // "9 confirmed delisted" in the headline against "delisted this run: 0" in the
  // body, from one run. Same words, two different quantities.
  check(
    "dead pages are not called delistings",
    said(partial, /answered with a dead page/) && !said(partial, /confirmed delisted/),
    "delisting takes three such nights, and is counted separately"
  );

  return failures - before;
}

/**
 * Pingo Doce sitemap discovery: the URL is the only place its department is
 * written down, so everything downstream of a bad parse here is wrong quietly.
 * Pure - no network - because these are string rules.
 */
function verifyPingoDoceSitemap(): number {
  const before = failures;
  console.log("\n  pingo doce: sitemap discovery");

  const veg =
    "https://www.pingodoce.pt/home/produtos/frutas-e-vegetais/vegetais/outros-vegetais/alho-frances-cortado-embalado-pingo-doce-893466.html";
  const wine =
    "https://www.pingodoce.pt/home/produtos/vinhos/vinho-tinto/vinho-tinto-alentejo-borba-sovibor-borba-sovibor-859.html";

  check("the id is the URL's last segment", productIdFromUrl(veg) === "893466");
  check("a short slug parses too", productIdFromUrl(wine) === "859");
  check(
    "a category listing page has no product id",
    productIdFromUrl("https://www.pingodoce.pt/home/produtos/limpeza/roupa/detergentes") === null
  );

  check(
    "the URL gives the full department path the breadcrumb never does",
    categoryPathFromUrl(veg) === "Frutas e Vegetais/Vegetais/Outros Vegetais"
  );
  check(
    "a bare shelf name gains its department",
    categoryPathFromUrl(wine) === "Vinhos/Vinho Tinto"
  );

  // The exact-text match in isFoodSection is why the top-level labels are
  // hand-written with their accents rather than title-cased from the slug.
  check(
    "food departments survive the food-section filter",
    isFoodSection("PINGO_DOCE", categoryPathFromUrl(veg)) &&
      isFoodSection("PINGO_DOCE", categoryPathFromUrl(wine))
  );
  check(
    "an accented non-food department is still excluded",
    !isFoodSection(
      "PINGO_DOCE",
      categoryPathFromUrl(
        "https://www.pingodoce.pt/home/produtos/casa-e-eletrodomesticos/cozinha/tachos/tacho-inox-24cm-1234.html"
      )
    ),
    "Casa e Eletrodomésticos, not \"Casa E Eletrodomesticos\""
  );

  check(
    "sub-category slugs keep Portuguese connectives lowercase",
    labelFromSlug("tomates-pepinos-e-pimentos") === "Tomates Pepinos e Pimentos" &&
      labelFromSlug("bolsas-de-fruta") === "Bolsas de Fruta"
  );

  // Every Pingo Doce section has a decision in data/store-sections.ts, by label.
  const pdKind = (slug: string) => topSectionKind("PINGO_DOCE", PINGO_DOCE_SECTIONS[slug]?.label ?? slug);
  check(
    "every Pingo Doce section label has a decision",
    Object.keys(PINGO_DOCE_SECTIONS).every((slug) => pdKind(slug) !== undefined)
  );

  // The department list is DERIVED from the sections table, so the two can
  // never disagree. What is worth checking is that the derivation still selects
  // food only, and still builds an address robots.txt permits.
  // The cross-cutting aisles were skipped wholesale on a six-page sample, which
  // turned out to be six out-of-season Christmas products. Measured properly,
  // 494 of the 1,010 are food.
  check(
    "a mixed aisle is fetched, not skipped",
    pdKind("as-nossas-marcas") === "mixed" && pdKind("natal-e-ano-novo") === "mixed",
    "their URL cannot say what a product is, so the name has to"
  );
  check(
    "a non-food aisle is still skipped without a request",
    pdKind("limpeza") === "non-food" && pdKind("higiene-pessoal-e-beleza") === "non-food",
    "there the URL does settle it - 5,827 pages, 1.6 hours saved"
  );
  check(
    "a mixed-aisle product is judged by its name alone",
    classifyFoodType(
      "Queijo Ovelha Amanteigado Seia Médio Pingo Doce",
      "PINGO_DOCE",
      "As Nossas Marcas/Pingo Doce"
    ) === "queijo",
    "the path says only the brand"
  );
  check(
    "and non-food in the same aisle is not",
    classifyFoodType("Fraldas Bebé Extra Care Dry T6", "PINGO_DOCE", "As Nossas Marcas/Pingo Doce") === null
  );
  check(
    "toothpaste is not a pasta",
    classifyFoodType("Pasta de Dentes Branqueadora Pingo Doce", "PINGO_DOCE", "As Nossas Marcas/Pingo Doce") === null,
    "the one systematic contaminant the measurement found"
  );
  check(
    "and spreading pastes have no kind since 17 October 2026 (curry paste next to olive paste)",
    classifyFoodType("Pasta de Atum", "PINGO_DOCE", "Mercearia/Pates e Pastas") === null
  );

  check(
    "the food departments are exactly the food-kind sections",
    PINGO_DOCE_FOOD_CATEGORIES.length ===
      Object.keys(PINGO_DOCE_SECTIONS).filter((slug) => pdKind(slug) === "food").length &&
      PINGO_DOCE_FOOD_CATEGORIES.every((d) => pdKind(d.slug) === "food"),
    `${PINGO_DOCE_FOOD_CATEGORIES.length} departments`
  );

  // The whole point of the rewrite. A query string on any of these would put the
  // request straight back under the rules that disallowed the old crawler.
  check(
    "every department page is a plain path with no query string",
    PINGO_DOCE_FOOD_CATEGORIES.every(
      (d) =>
        d.url.startsWith("https://www.pingodoce.pt/home/produtos/") &&
        !d.url.includes("?") &&
        !d.url.includes("/on/demandware.store/")
    ),
    "no ?cgid=, ?start= or ?sz=, and not the disallowed endpoint"
  );

  check(
    "a department page's tile sample is never mistaken for its full contents",
    // 14 is the hard ceiling measured across all 276 food category pages; the
    // "load more" beyond it posts to a disallowed endpoint.
    coverageRows(
      [
        {
          department: PINGO_DOCE_FOOD_CATEGORIES[0],
          published: 1410,
          sample: new Array(14).fill(null).map((_, i) => ({
            id: `s${i}`, name: "", price: 1, brand: "", category: "", url: "",
          })),
        },
      ],
      new Map([[PINGO_DOCE_FOOD_CATEGORIES[0].slug, 1368]])
    )[0].gap === 42,
    "the gap is published minus HELD, not published minus the 14 tiles shown"
  );

  return failures - before;
}
