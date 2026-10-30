import { comparisonGroups, mainGroup, MIN_CHAINS, shownGroups, type TreeProduct } from "../lib/comparison-groups";
import { missingFromList } from "../scrapers/crawl/product-checks";
import { deadPagesBelievable, MAX_SHARE_DEAD_PAGES, pingoDoceProblems, type PingoDoceExtras } from "../scrapers/crawl/pingodoce-report";
import { BRAKES } from "../scrapers/crawl/brakes";
import { isNonFoodCatastrophe, isPriceChurnStorm, PRICE_CHURN_LIMIT } from "../scrapers/crawl/reidentification";
import { renderReport } from "../scrapers/crawl/render-report";
import { stripAccents } from "../lib/text";
import { productSitemapsFromIndex } from "../scrapers/crawl/pingodoce-sitemap";
import { adminEnabled } from "../lib/admin";
import { currentSince, MAX_NAMED_GROUPS, STALE_AFTER_DAYS } from "../lib/grupos";
import {
  cheapestPerStore,
  cheapestStores,
  comparableStoreCount,
  namedGroup,
  ownBrandPerStore,
  unitsFor,
  type ComparableProduct,
} from "../lib/comparison";
import { euros } from "../lib/money";
import { promotionLine, promotionWarning } from "../scrapers/crawl/promo-watch";
import { auchanTilePromotion, parseAuchanTilesDetailed } from "../scrapers/search/auchan";

/**
 * Checks of the comparison rules: what each store says about one kind of food,
 * the comparisons inside a kind, and products the crawls stopped seeing.
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

export function verifyComparisons(): number {
  failures = 0;
  verifyComparison();
  verifyComparisonGroups();
  verifyStaleProducts();
  return failures;
}

/**
 * The comparison rules: what each store has to say about one kind of food.
 *
 * The cases that matter are the two that look like a blank cell. "Continente
 * does not sell this" and "Continente sells it but we cannot price it per kilo"
 * are different facts, and both are common - about a tenth of Continente's
 * products give no size. Rendering them alike would be the page's most
 * frequent lie, so it is
 * the thing most worth pinning down here.
 */
function verifyComparison(): number {
  const before = failures;
  console.log("\n  the comparison rules");

  const p = (
    store: string,
    name: string,
    price: number | null,
    size: number | null,
    unit: string | null = "kg",
    brand: string | null = "Marca X"
  ): ComparableProduct => ({ storeProductId: `${store}-${name}`, store, name, brand, price, packageSize: size, unit });

  // Continente has two, Auchan one dearer, Pingo Doce stocks it but with no size.
  const rows = [
    p("CONTINENTE", "Batata Vermelha", 2.25, 3),        // 0.75/kg
    p("CONTINENTE", "Batata Grande", 4.00, 2),          // 2.00/kg
    p("AUCHAN", "BATATA VERMELHA 3 KG", 2.37, 3),       // 0.79/kg
    p("PINGO_DOCE", "Batata a Granel", 1.29, null),     // stocked, unpriceable
  ];
  const cheapest = cheapestPerStore(rows, "batata");

  const cell = (s: string) => cheapest.get(s)!;
  check(
    "the cheapest is the minimum, not the first row",
    cell("CONTINENTE").kind === "price" &&
      Math.abs((cell("CONTINENTE") as { unitPrice: number }).unitPrice - 0.75) < 1e-9,
    "0.75/kg, not the 2.00/kg listed first"
  );
  check("a store with no products reads not-stocked", cheapestPerStore(rows.filter((r) => r.store !== "AUCHAN"), "batata").get("AUCHAN")!.kind === "not-stocked");
  check(
    "a store with products but no size reads no-size",
    cell("PINGO_DOCE").kind === "no-size",
    "it sells potatoes; we just cannot price them per kilo"
  );
  check(
    "and no-size still names something the store sells",
    cell("PINGO_DOCE").kind === "no-size" &&
      (cell("PINGO_DOCE") as { example: ComparableProduct }).example.name === "Batata a Granel"
  );
  check(
    "the two blank states are different values, not both empty",
    cell("PINGO_DOCE").kind !== cheapestPerStore([], "batata").get("PINGO_DOCE")!.kind,
    "this is the distinction the page must render differently"
  );

  // Unit safety. `azeite` is measured in litres, so a row recorded in kg is
  // excluded rather than silently compared against litres.
  const azeite = cheapestPerStore(
    [p("CONTINENTE", "Azeite", 4.39, 0.75, "l"), p("AUCHAN", "AZEITE", 3.0, 1, "kg")],
    "azeite"
  );
  check("litres and kilos are never compared", azeite.get("AUCHAN")!.kind === "no-size");
  check("and the correctly-measured one still prices", azeite.get("CONTINENTE")!.kind === "price");

  // A zero or negative size must not divide.
  check(
    "a zero size is not a free product",
    cheapestPerStore([p("AUCHAN", "X", 1, 0)], "batata").get("AUCHAN")!.kind === "no-size"
  );
  // A missing price is a product not for sale today, so a store with nothing
  // else here does not sell this today (code review H7, 22 October 2026;
  // until then this read "sells it, but gives no weight").
  check(
    "and neither is a missing price: a store whose only product is unpriced does not sell it today",
    cheapestPerStore([p("AUCHAN", "X", null, 1)], "batata").get("AUCHAN")!.kind === "not-stocked"
  );

  // Own-brand asks a different question and may name a different winner.
  const own = ownBrandPerStore(
    [
      p("CONTINENTE", "Batata Continente", 3.0, 3, "kg", "Continente"),   // 1.00/kg
      p("CONTINENTE", "Batata Marca", 2.25, 3, "kg", "Marca X"),          // 0.75/kg, not own
      p("AUCHAN", "BATATA AUCHAN", 2.7, 3, "kg", "Auchan"),               // 0.90/kg
    ],
    "batata"
  );
  check(
    "own-brand ignores the cheaper third-party product",
    own.get("CONTINENTE")!.kind === "price" &&
      Math.abs((own.get("CONTINENTE") as { unitPrice: number }).unitPrice - 1.0) < 1e-9
  );
  check(
    "and can crown a different store than cheapest-overall did",
    cheapestStores(own).join() === "AUCHAN"
  );
  check(
    "a store with no own-brand product reads not-stocked for THIS question",
    own.get("PINGO_DOCE")!.kind === "not-stocked",
    "true of the own-brand comparison, whatever else it sells"
  );

  check(
    "the store count counts PRICED stores, not stocking ones",
    comparableStoreCount(cheapest) === 2,
    "three stores stock potatoes; only two can be priced per kilo"
  );
  check(
    "one priced store has no cheapest",
    cheapestStores(cheapestPerStore([p("AUCHAN", "X", 1, 1)], "batata")).length === 0,
    "naming it cheapest would imply it beat something"
  );

  // The admin pages have no password. They do not need one, because they are
  // not meant to be reachable from the internet - but that only holds while the
  // switch FAILS CLOSED. A default-on flag that has to be turned off would put
  // a page where anyone can refile the whole menu one forgotten variable away.
  console.log("\n  the admin switch fails closed");
  const previous = process.env.ADMIN_ENABLED;
  const withEnv = (value: string | undefined) => {
    if (value === undefined) delete process.env.ADMIN_ENABLED;
    else process.env.ADMIN_ENABLED = value;
    return adminEnabled();
  };
  try {
    check("unset means off", withEnv(undefined) === false, "an unconfigured server is safe");
    check("empty means off", withEnv("") === false);
    check('"false" means off', withEnv("false") === false);
    check('"1" means off', withEnv("1") === false, "only the exact word counts");
    check('"TRUE" means off', withEnv("TRUE") === false, "case matters, so a typo cannot open it");
    check('only "true" means on', withEnv("true") === true);
  } finally {
    withEnv(previous);
  }

  // The named-product comparison: pick a name, order by price gap, cut at 20.
  console.log("\n  named-product groups");
  const g = (name: string, store: string, price: number | null, size: number | null) =>
    p(store, name, price, size, "kg");

  const pick = (members: ComparableProduct[]) =>
    members.reduce((a, b) => (b.name.length < a.name.length ? b : a)).name;
  check(
    "a group is named by its shortest member",
    pick([
      g("Creme para Barrar Nutella Pack Poupança Continente", "CONTINENTE", 4.29, 1),
      g("Nutella", "AUCHAN", 3.99, 1),
    ]) === "Nutella",
    "the shortest is reliably the least store-specific"
  );

  // Every group today spans two chains, because Pingo Doce publishes no barcode.
  // The third must read "not stocked", not vanish from the row.
  const pair = namedGroup(
    [g("Batata do Zé", "AUCHAN", 1.15, 1), g("Batata do Zé", "PINGO_DOCE", 1.2, 1)],
    "batata",
    "kg"
  );
  check(
    "the chain with no member reads not-stocked",
    pair.get("CONTINENTE")!.kind === "not-stocked",
    "not a blank, and not a zero"
  );
  check("and the two that have it are priced", cheapestStores(pair).join() === "AUCHAN");

  // A tie names every store in it. Naming only the first highlighted
  // Continente alone where all three sold cooking oil at EUR 1.55 a litre.
  const tie = cheapestPerStore(
    [p("CONTINENTE", "Oleo A", 1.55, 1, "l"), p("PINGO_DOCE", "Oleo B", 1.55, 1, "l"), p("AUCHAN", "OLEO C", 3.1, 2, "l")],
    "oleo"
  );
  check("a three-way tie names all three", cheapestStores(tie).length === 3);
  const nearTie = cheapestPerStore(
    [p("CONTINENTE", "Oleo A", 1.551, 1, "l"), p("PINGO_DOCE", "Oleo B", 1.549, 1, "l"), p("AUCHAN", "OLEO C", 1.6, 1, "l")],
    "oleo"
  );
  check("prices equal in cents are a tie", cheapestStores(nearTie).join() === "CONTINENTE,PINGO_DOCE",
    "the page shows 1.55 for both, so neither may be called cheaper");

  // The other half of that promise: the figure SHOWN must be the cents
  // compared. 1.99 EUR for 2 kg of onions is 0.995 a kilo; toFixed printed it
  // 0.99 beside Pingo Doce's 0.99, which was marked cheaper (21 Oct 2026).
  const halfCent = cheapestPerStore(
    [p("CONTINENTE", "Cebola A", 1.99, 2), p("PINGO_DOCE", "Cebola B", 0.99, 1), p("AUCHAN", "CEBOLA C", 2.48, 2)],
    "cebola"
  );
  const shown = [...halfCent.values()].map((c) => (c.kind === "price" ? euros(c.unitPrice) : "-"));
  check("a half cent is shown as the cents it is compared in", shown.join() === "1.00,0.99,1.24" &&
    cheapestStores(halfCent).join() === "PINGO_DOCE", `shown ${shown.join(" ")}`);

  // The promotion early warning (promo-watch.ts). A misread marker reads as
  // "not on promotion", so only the share can show it broke.
  const tally = (store: string, seen: number, on: number, off: number) =>
    ({ store, seen, onPromotion: on, notOnPromotion: off, unknown: seen - on - off });
  check("a usual quarter on promotion is no warning", promotionWarning(tally("CONTINENTE", 17095, 4730, 12283)) === null);
  check("no promotion at all is a warning", promotionWarning(tally("PINGO_DOCE", 9572, 0, 9572)) !== null);
  check("most of the catalogue on promotion is a warning", promotionWarning(tally("CONTINENTE", 17095, 13000, 4095)) !== null);
  check("most products with no promotion state is a warning", promotionWarning(tally("CONTINENTE", 17095, 2000, 5000)) !== null);
  check("a 20-product test run is too small to judge", promotionWarning(tally("CONTINENTE", 20, 0, 20)) === null);
  const failed = { ...tally("CONTINENTE", 0, 0, 0), error: "database is locked" };
  check("a failed count is a warning, not a crash",
    promotionWarning(failed)?.includes("database is locked") === true && promotionLine(failed).includes("could not be counted"));
  check("a store whose promotions are not read is reported, not warned about",
    promotionWarning(tally("OUTRA", 17740, 0, 0)) === null && promotionLine(tally("OUTRA", 17740, 0, 0)).includes("not read"));
  check("Auchan's promotions are read now, so a night with none is a warning",
    promotionWarning(tally("AUCHAN", 17740, 0, 17740)) !== null);

  // Auchan's listing tiles (search/auchan.ts), from the live markup of 21 October
  // 2026: the struck earlier price is the promotion; the "Promoção" label,
  // present on 43 of 48 tiles, is not.
  const auchanTile = (id: string, price: string, inside: string) =>
    `<div class="product-tile" data-gtm='{"id":"${id}","name":"LARANJA 2 KG","price":"${price}","brand":"","category":"produtos-frescos/fruta"}' ` +
    `data-urls='{"absoluteProductUrl":"https://www.auchan.pt/pt/x/${id}.html"}'><span class="sales">${inside}` +
    `<div class="auc-price__promotion"><span class="auc-price__promotion__label"> Promoção </span></div></span></div>`;
  const tiles = parseAuchanTilesDetailed(
    auchanTile("158914", "2.49", `<span class="strike-through"><span class="auc-price__stricked">Price reduced from 2,98 € to</span></span><span class="value">2,49 €</span>`) +
      auchanTile("234229", "1.19", `<span class="value">1,19 € /Kg</span>`)
  ).hits;
  check("an Auchan tile with a struck price is a promotion, with the price before",
    tiles[0]?.onPromotion === true && tiles[0]?.regularPrice === 2.98);
  check("an Auchan tile with only the \"Promoção\" label is not", tiles[1]?.onPromotion === false && tiles[1]?.regularPrice === null);
  check("a struck price per kilo reads too", auchanTilePromotion("Price reduced from 1,39 € /Kg to", 1.19).regularPrice === 1.39);

  // Two prices or it is not a comparison. This is what empties the wine page:
  // every wine group pairs a sized Auchan bottle with an unsized Continente row.
  const halfPriced = namedGroup(
    [
      p("AUCHAN", "Vinho X", 3.98, 0.75, "l"),
      // no size: as some Continente wines are
      p("CONTINENTE", "Vinho X", 5.99, null, null),
    ],
    "vinho",
    "l"
  );
  check(
    "a group priced on only one side cannot be compared",
    [...halfPriced.values()].filter((c) => c.kind === "price").length === 1,
    "168 wine groups are in this state, and the page says so rather than hiding them"
  );

  check(
    "the cut is the 90th percentile of the real distribution",
    MAX_NAMED_GROUPS === 20,
    "median 4, 90th 20, max 168; six would have truncated 38% of pages"
  );

  // The filter on the index. Portuguese food names are full of accents and
  // nobody types them into a search box.
  const matches = (query: string, label: string) =>
    stripAccents(label).toLowerCase().includes(stripAccents(query).toLowerCase().trim());
  check("the filter finds Açúcar from \"acucar\"", matches("acucar", "Açúcar"));
  check("and Chá from \"cha\"", matches("cha", "Chá"));
  check("and does not match everything", !matches("zzzz", "Açúcar"));

  // A few foods really are sold both ways and get one ranking per unit rather
  // than one unit chosen for them. Tarts are two different foods sharing a
  // word; mayonnaise is one food the stores record inconsistently.
  console.log("\n  foods measured both ways");
  const tartes = [
    p("CONTINENTE", "Tarte de Maçã", 6.0, 1, "kg"),          // 6.00/kg
    p("CONTINENTE", "Tarte Gelada Capuccino", 4.0, 0.8, "l"), // 5.00/l
    p("AUCHAN", "TARTE MACA", 5.0, 1, "kg"),                  // 5.00/kg
  ];
  check(
    "a food sold both ways offers both rankings",
    unitsFor("tarte", tartes).join(",") === "kg,l",
    "baked tarts by weight, frozen tarts by volume"
  );
  check(
    "and only the units actually present",
    unitsFor("tarte", [tartes[0]]).join(",") === "kg",
    "no empty second table just because the table allows one"
  );
  check(
    "a single-unit food still offers exactly one",
    unitsFor("batata", rows).join(",") === "kg"
  );

  const byWeight = cheapestPerStore(tartes, "tarte", "kg");
  const byVolume = cheapestPerStore(tartes, "tarte", "l");
  check(
    "the weight ranking sees only the weight products",
    byWeight.get("AUCHAN")!.kind === "price" &&
      Math.abs((byWeight.get("AUCHAN") as { unitPrice: number }).unitPrice - 5) < 1e-9
  );
  check(
    "the volume ranking sees only the volume ones",
    byVolume.get("CONTINENTE")!.kind === "price" &&
      (byVolume.get("CONTINENTE") as { product: ComparableProduct }).product.name ===
        "Tarte Gelada Capuccino"
  );
  check(
    "a store present only in the other unit reads no-size, not not-stocked",
    byVolume.get("AUCHAN")!.kind === "no-size",
    "Auchan sells tarts; it sells no tart measured by volume"
  );

  return failures - before;
}

/** Comparisons inside a kind: same sub-kind, same labels, same unit, and two chains at least. */
function verifyComparisonGroups(): number {
  const before = failures;
  console.log("\n  comparison groups");
  const p = (store: string, name: string, price: number, size: number, subKind: string | null, labels: string | null): TreeProduct => ({
    storeProductId: `${store}-${name}`, store, name, brand: "X", price, packageSize: size, unit: "kg", subKind, labels,
  });
  const rows = [
    p("CONTINENTE", "Peito de Frango", 8, 1, "peito", null),
    p("AUCHAN", "Peito de Frango", 7, 1, "peito", null),
    p("PINGO_DOCE", "Peito de Frango Congelado", 5, 1, "peito", "congelado"),
    p("CONTINENTE", "Peito de Frango Congelado", 6, 1, "peito", "congelado"),
    p("AUCHAN", "Asas de Frango", 3, 1, "asa", null),
    p("CONTINENTE", "Frango para Churrasco", 4, 1, null, null),
    p("PINGO_DOCE", "Frango para Churrasco", 4.5, 1, null, null),
  ];
  const groups = comparisonGroups("frango", rows);
  const titles = groups.map((g) => g.title);
  check("fresh and frozen breast are separate comparisons", titles.includes("Peito e bifes") && titles.includes("Peito e bifes · Congelado"));
  check("frozen breast is never cheaper than fresh by mixing them", groups.find((g) => g.title === "Peito e bifes")?.cheapestPrice === 7);
  check("groups follow the tree's order, products with no sub-kind last", titles[0] === "Peito e bifes" && titles[titles.length - 1] === "Outros");
  check("a group one chain sells is kept but not shown", groups.some((g) => g.subKind === "asa") && !shownGroups(groups).some((g) => g.subKind === "asa"));
  check("two chains are enough to show a group", shownGroups(groups).length === 2 && MIN_CHAINS === 2);
  // The user's decision, 29 October 2026: "Outros" mixes unlike products.
  check("\"Outros\" is never shown, even with two chains", groups.some((g) => g.title === "Outros" && g.storesCompared === 2) && !shownGroups(groups).some((g) => g.others));
  check("a kind with no sub-kinds is not \"Outros\"", !comparisonGroups("banana", [p("CONTINENTE", "Banana", 1, 1, null, null)])[0]?.others);
  check("the main group is plain before labelled", mainGroup(groups)?.title === "Peito e bifes");
  check("a kind with no sub-kinds is titled by its own name", comparisonGroups("banana", [p("CONTINENTE", "Banana", 1, 1, null, null)])[0]?.title === "Banana");
  return failures - before;
}

/** Products the crawls stopped seeing: out of the comparisons, and delisted at Pingo Doce. */
function verifyStaleProducts(): number {
  const before = failures;
  console.log("\n  products the crawls stopped seeing");
  const latest = new Date("2026-10-03T16:00:00Z");
  check("a product seen in its chain's latest crawl is current", new Date("2026-10-03T12:00:00Z") >= currentSince(latest));
  check("one last seen in August is not", new Date("2026-08-31T12:00:00Z") < currentSince(latest));
  check("the window is measured from the chain's own latest crawl, not today", STALE_AFTER_DAYS === 14 &&
    currentSince(latest).getTime() === latest.getTime() - 14 * 86_400_000);
  const held = Array.from({ length: 100 }, (_, i) => `p${i}`);
  const listed = new Set(held.slice(0, 97));
  check("products missing from the store's list are found", missingFromList(held, listed).missing.join() === "p97,p98,p99");
  check("a few missing is believable", missingFromList(held, listed).believable);
  check("a fifth of the range vanishing overnight is not", !missingFromList(held, new Set(held.slice(0, 80))).believable);

  // Pingo Doce's report, from its night of 22 October 2026.
  console.log("\n  Pingo Doce's report");
  const night: PingoDoceExtras = {
    sitemapFiles: [{ file: "sitemap_0-product.xml", entries: 11436 }, { file: "sitemap_1-product.xml", entries: 4692 }],
    sitemapPrevious: 16150,
    food: 10178, nonFood: 5807, skippedSections: 141, fromMixed: 943, unfiled: 2,
    unparseable: 0, unparseableSamples: [], unknownSections: [],
    targets: 10178, fetched: 9907, withSize: 8903, unpriced: 2656,
    unreachable: 126, unreachableSamples: [{ storeProductId: "980669", name: "Fetch failed (503)" }],
    missingFromSitemap: 211, sitemapBelieved: true, sitemapDistrust: null, sitemapAccepted: null, sitemapIndexProblem: null,
    deadPages: 145, deadPagesBelieved: true,
    delistedNow: 202, delistedSamples: [{ storeProductId: "1", name: "Produto Retirado" }],
    stoppedBySection: 0, stoppedByName: 0, nonFoodRefused: [], priceStorm: null, departmentsUnread: [],
  };
  const nightProblems = pingoDoceProblems(night);
  check("that night's 126 unreadable pages (1.2%) are its one warning", nightProblems.fails.length === 0 &&
    nightProblems.warnings.length === 1 && nightProblems.warnings[0].includes("126 page(s) could not be read"), nightProblems.warnings.join(" | "));
  check("a usual night, with no unreadable pages, has no problem", (() => {
    const p = pingoDoceProblems({ ...night, unreachable: 0 });
    return p.fails.length === 0 && p.warnings.length === 0;
  })());
  check("145 pages saying gone of 10,178 is believed", deadPagesBelievable(145, 10178));
  check("most pages saying gone at once is not: a broken reader", !deadPagesBelievable(9000, 10178));
  const broken = pingoDoceProblems({ ...night, deadPages: 9000, deadPagesBelieved: false, withSize: 100, unpriced: 9000, unreachable: 0 });
  check("a broken page reader FAILs, and the size and price shares warn", broken.fails.length === 1 &&
    broken.warnings.some((w) => w.includes("pack size")) && broken.warnings.some((w) => w.includes("no price")), [...broken.fails, ...broken.warnings].join(" | "));
  check("an unknown department and unreadable addresses warn",
    pingoDoceProblems({ ...night, unreachable: 0, unknownSections: [{ section: "nova-seccao", count: 40 }], unparseable: 3 }).warnings.length === 2);
  check("a disbelieved sitemap warns, with its reason", (() => {
    const w = pingoDoceProblems({ ...night, unreachable: 0, sitemapBelieved: false, sitemapDistrust: "it shrank from 16,150 to 9,000 entries" }).warnings;
    return w.length === 1 && w[0].includes("shrank");
  })());
  check("a list accepted as the new normal, and an unread index, each warn",
    pingoDoceProblems({ ...night, unreachable: 0, sitemapAccepted: "same figures 3 nights", sitemapIndexProblem: "the sitemap index could not be read" }).warnings.length === 2);

  // Every store has the same three brakes, each with its own limit (code
  // review M4, brakes.ts).
  console.log("\n  the brakes, one table for every store");
  check("Pingo Doce's night of 22 October (33 of 7,207 prices moved) does not trip its price brake",
    !isPriceChurnStorm({ changed: 33, priced: 7207, complete: true, store: "PINGO_DOCE" }));
  check("nor its run after a change of promotions (1,961 of 7,196, 21 October)",
    !isPriceChurnStorm({ changed: 1961, priced: 7196, complete: true, store: "PINGO_DOCE" }));
  check("but 35% of prices moving does, at Pingo Doce as at Continente (30%, the user's decision)",
    isPriceChurnStorm({ changed: 2500, priced: 7196, complete: true, store: "PINGO_DOCE" }) &&
    isPriceChurnStorm({ changed: 2500, priced: 7196, complete: true, store: "CONTINENTE" }));
  check("with no store given, Continente's limits apply",
    isPriceChurnStorm({ changed: 2500, priced: 7196, complete: true }) && PRICE_CHURN_LIMIT === BRAKES.CONTINENTE.priceChurn);
  check("Pingo Doce's dead-page limit is the table's", MAX_SHARE_DEAD_PAGES === BRAKES.PINGO_DOCE.deadPages);
  check("15 of 10,000 Pingo Doce products leaving food is believed, 900 is not",
    !isNonFoodCatastrophe({ nonFood: 15, attempted: 10_000, store: "PINGO_DOCE" }) && isNonFoodCatastrophe({ nonFood: 900, attempted: 10_000, store: "PINGO_DOCE" }));
  const pdBrakes = pingoDoceProblems({ ...night, unreachable: 0, nonFoodRefused: ["moved out of a food section: 90%"], priceStorm: "6,900 of 7,196 prices moved" });
  check("at Pingo Doce both now FAIL the run", pdBrakes.fails.length === 2, pdBrakes.fails.join(" | "));

  // Pingo Doce's product files come from its index (code review M3).
  console.log("\n  Pingo Doce's sitemap index");
  const index =
    '<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
    "<sitemap><loc>https://www.pingodoce.pt/home/sitemap_0-product.xml</loc><lastmod>2026-10-22</lastmod></sitemap>" +
    "<sitemap><loc>https://www.pingodoce.pt/home/sitemap_1-product.xml</loc></sitemap>" +
    "<sitemap><loc>https://www.pingodoce.pt/home/sitemap_2.xml</loc></sitemap>" +
    "<sitemap><loc>https://www.pingodoce.pt/home/sitemap_3-product.xml</loc></sitemap></sitemapindex>";
  check("every product file the index lists is read, a new third one included",
    productSitemapsFromIndex(index).map((u) => u.split("/").pop()).join() === "sitemap_0-product.xml,sitemap_1-product.xml,sitemap_3-product.xml");
  check("the category file is not taken for products", !productSitemapsFromIndex(index).some((u) => u.endsWith("sitemap_2.xml")));
  check("an index with no product file gives none (the known two are then read, with a warning)", productSitemapsFromIndex("<sitemapindex></sitemapindex>").length === 0);
  const pdReport = renderReport({
    store: "PINGO_DOCE",
    runAt: "2026-10-22T00:25:00.000Z",
    verdict: "OK",
    problems: [],
    baseline: { runs: 3, since: "2026-10-18T21:27:00.000Z" },
    scraper: { sections: [], requests: 0, megabytes: 0, transferredMegabytes: null, minutesFetching: 0, retries: 0, slowdown: null },
    quality: { total: 10370, missingPrice: 2974, missingBrand: 0, missingCategory: 0, missingUrl: 0 },
    catalogue: { seen: 0, newProducts: 0, disappeared: 0, stillMissing: 0, returned: 0, moved: 0, renamed: 0, samples: { newProducts: [], disappeared: [], returned: [], moved: [], renamed: [] } },
    prices: { opened: 0, changed: 0, unchanged: 0, skipped: 0, movers: [], absurd: [] },
    categories: { published: 0, crawled: 25, unknown: [], missing: [], publishedCountChanges: [], sitemapSlugs: 0, sitemapUnknown: [] },
    live: { candidatePairsAffected: 0 },
    drift: [],
    pingoDoce: night,
  }, { explain: false });
  check("the report shows the sitemap and pages section", pdReport.includes("Sitemap and product pages") && pdReport.includes("16,128 address(es) in 2 file(s)"));
  check("the report shows products leaving", pdReport.includes("delisted this run (third night): 202"));
  // Every store's report since 22 October 2026 (code review H7).
  check("missing prices are explained as listed but not for sale", pdReport.includes("missing price 2974 (listed but not for sale"));
  check("no category audit, so no Categories section", !pdReport.includes("## Categories") && !pdReport.includes("sitemap cross-check"));
  return failures - before;
}
