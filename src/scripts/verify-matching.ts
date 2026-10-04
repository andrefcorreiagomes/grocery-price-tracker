import { prisma } from "../lib/db";
import { classifyFoodType, isFoodSection } from "../lib/food-types";
import { buildGroups, sizeSpreadOk, OVERSIZE_FACTOR, type GroupLink, type GroupMemberInput } from "../lib/grouping";
import { auchanTileSize, matchesTerm, parseSize, reconcileTileSize, SOLD_PER_KG, stripAccents } from "../lib/matching";
import { enrichment } from "../scrapers/crawl/persist";
import {
  categoryPathFromUrl,
  labelFromSlug,
  productIdFromUrl,
  PINGO_DOCE_SECTIONS,
} from "../scrapers/crawl/pingodoce-sitemap";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { coverageRows } from "../scrapers/crawl/pingodoce";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { sectionWarnings } from "../scrapers/crawl/history";
import { adminEnabled } from "../lib/admin";
import { MAX_NAMED_GROUPS } from "../lib/grupos";
import { detached } from "../scrapers/types";
import { correctedSize, implausiblePodSize, pricedPerUnit } from "../scrapers/page-size";
import {
  cheapestPerStore,
  cheapestStores,
  comparable,
  comparableStoreCount,
  namedGroup,
  ownBrandPerStore,
  unitsFor,
  type ComparableProduct,
} from "../lib/comparison";
import { isStoreError, STORE_ERRORS, storeErrorStatus } from "../../data/store-errors";
import { discoverProductUrls } from "../scrapers/crawl/continente-products";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * The matching layer: clustering guards (pure), and the decision/retirement
 * behaviour that keeps groups honest as the catalogue changes.
 *
 * The guards get the most attention because they are where a wrong answer is
 * silent - a bad group does not throw, it just shows two different products side
 * by side as though they were one. All rows use the zzm- prefix and are cleaned
 * up.
 */
const PREFIX = "zzm-";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  if (!ok) failures++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${label}${detail ? "   " + detail : ""}`);
}

const m = (id: string, store: string, size: string | null = null): GroupMemberInput => ({
  productId: id,
  store,
  size: size ? parseSize(size) : null,
});
const link = (aId: string, bId: string, rung = "ean"): GroupLink => ({ aId, bId, rung });

async function cleanup() {
  await prisma.matchDecision.deleteMany({ where: { OR: [{ aId: { startsWith: PREFIX } }, { bId: { startsWith: PREFIX } }] } });
  await prisma.productGroupMember.deleteMany({ where: { productId: { startsWith: PREFIX } } });
  await prisma.catalogueProduct.deleteMany({ where: { storeProductId: { startsWith: PREFIX } } });
}

export async function verifyMatching(): Promise<number> {
  failures = 0;
  await cleanup();

  // --- clustering: the shape of a group ------------------------------------
  console.log("  clustering");

  // Two pairs sharing a product become ONE three-store group - the triplet the
  // app wants, assembled from pairs without ever being told what a triplet is.
  const triplet = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN"), m("c", "PINGO_DOCE")],
    [link("a", "b"), link("b", "c")]
  );
  check("two pairs sharing a product form one 3-store group", triplet.length === 1 && triplet[0].storeCount === 3);
  check("that group is emitted", triplet[0]?.emit === true);

  // Disjoint pairs stay separate.
  const disjoint = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN"), m("c", "CONTINENTE"), m("d", "AUCHAN")],
    [link("a", "b"), link("c", "d")]
  );
  check("disjoint pairs stay two groups", disjoint.length === 2);

  // Five stores: proves nothing is hardcoded to pairs or triplets.
  const five = buildGroups(
    [m("a", "S1"), m("b", "S2"), m("c", "S3"), m("d", "S4"), m("e", "S5")],
    [link("a", "b"), link("b", "c"), link("c", "d"), link("d", "e")]
  );
  check("a 5-store chain clusters into one group", five.length === 1 && five[0].storeCount === 5);
  check("the 5-store group is emitted", five[0]?.emit === true);

  // A product with no confirmed pair is not a group of one.
  const lonely = buildGroups([m("a", "CONTINENTE"), m("b", "AUCHAN")], []);
  check("an unmatched product is not a group", lonely.length === 0);

  // --- clustering guards ----------------------------------------------------
  console.log("\n  clustering guards");

  // Two products from the SAME store: legitimate (a chain can stock two SKUs)
  // but also the signature of a bad merge, so it is emitted AND flagged.
  const dupStore = buildGroups(
    [m("a", "CONTINENTE"), m("b", "CONTINENTE"), m("c", "AUCHAN")],
    [link("a", "c"), link("b", "c")]
  );
  check("a duplicate store is flagged", dupStore[0]?.flags.includes("duplicate-store") === true);
  check("but the group is still emitted", dupStore[0]?.emit === true);

  // A component far larger than one-per-store: a chain of weak links has fused
  // unrelated products, so it must not be shown at all.
  const many = ["a", "b", "c", "d", "e", "f", "g"];
  const oversized = buildGroups(
    many.map((id, i) => m(id, i < 4 ? "CONTINENTE" : "AUCHAN")),
    many.slice(1).map((id, i) => link(many[i], id))
  );
  check("an oversized component is flagged", oversized[0]?.flags.includes("oversized") === true);
  check("and is NOT emitted", oversized[0]?.emit === false);
  check(
    "the oversize bar is stores x factor",
    OVERSIZE_FACTOR === 2 && many.length > 2 * OVERSIZE_FACTOR
  );

  // Held together only by weak links: usable, but worth knowing.
  const weak = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN")],
    [link("a", "b", "fuzzy")]
  );
  check("a weak-link-only group is flagged", weak[0]?.flags.includes("weak-links-only") === true);
  check("and is not marked strong", weak[0]?.strong === false);
  const strong = buildGroups([m("a", "CONTINENTE"), m("b", "AUCHAN")], [link("a", "b", "ean")]);
  check("an ean-linked group is strong and unflagged", strong[0]?.strong === true && strong[0]?.flags.length === 0);

  // --- the Nutella chain ----------------------------------------------------
  // The reason clustering needs whole-component checks at all: every ADJACENT
  // link passes, and the two ends are 2.5x apart.
  console.log("\n  the size-spread guard (chained matches)");
  const nutella = buildGroups(
    [m("a", "CONTINENTE", "400 g"), m("b", "AUCHAN", "750 g"), m("c", "PINGO_DOCE", "1 kg")],
    [link("a", "b"), link("b", "c")]
  );
  check("400g-750g-1kg chained is flagged size-spread", nutella[0]?.flags.includes("size-spread") === true);
  check("and is NOT emitted, though every link passed", nutella[0]?.emit === false);

  // The same shape at one size is fine.
  const sameSize = buildGroups(
    [m("a", "CONTINENTE", "400 g"), m("b", "AUCHAN", "400 g"), m("c", "PINGO_DOCE", "400 g")],
    [link("a", "b"), link("b", "c")]
  );
  check("the same chain at one size is emitted", sameSize[0]?.emit === true && sameSize[0]?.flags.length === 0);

  // Unknown sizes must not read as agreement - most of the catalogue has no size.
  check("unknown sizes do not trip the guard", sizeSpreadOk([m("a", "X"), m("b", "Y")]));
  check("one known size is not a spread", sizeSpreadOk([m("a", "X", "400 g"), m("b", "Y")]));
  check("kg against L can never be one product", !sizeSpreadOk([m("a", "X", "1 kg"), m("b", "Y", "1 l")]));

  // --- decisions and retirement (DB) ---------------------------------------
  console.log("\n  decisions and retirement");

  const mk = async (suffix: string, store: "CONTINENTE" | "AUCHAN" | "PINGO_DOCE") =>
    (
      await prisma.catalogueProduct.create({
        data: {
          store,
          storeProductId: `${PREFIX}${suffix}`,
          name: `Match test ${suffix}`,
          url: `https://example.invalid/${PREFIX}${suffix}`,
          price: 1.0,
        },
        select: { id: true },
      })
    ).id;

  const p1 = await mk("1", "CONTINENTE");
  const p2 = await mk("2", "AUCHAN");
  const [x1, y1] = p1 <= p2 ? [p1, p2] : [p2, p1];

  await prisma.matchDecision.create({
    data: {
      aId: x1, bId: y1, verdict: "CONFIRMED", source: "HUMAN",
      rung: "exact", nameSimilarity: 0.9, reason: "verified by hand",
    },
  });
  const humanRow = await prisma.matchDecision.findUnique({ where: { aId_bId: { aId: x1, bId: y1 } } });
  check("a human decision is stored", humanRow?.source === "HUMAN" && humanRow.verdict === "CONFIRMED");

  // Retiring a pair whose member is delisted: the row survives with a reason,
  // so the same bad pair is not silently re-proposed later.
  await prisma.catalogueProduct.update({ where: { id: p2 }, data: { delistedAt: new Date() } });
  await prisma.matchDecision.update({
    where: { aId_bId: { aId: x1, bId: y1 } },
    data: { retiredAt: new Date(), retiredReason: "member delisted" },
  });
  const retired = await prisma.matchDecision.findUnique({ where: { aId_bId: { aId: x1, bId: y1 } } });
  check("a retired decision is kept, not deleted", retired !== null && retired.retiredAt !== null);
  check("with the reason recorded", retired?.retiredReason === "member delisted");
  check("and its human verdict is still on the row", retired?.source === "HUMAN");

  // A retired pair must not reach grouping.
  const live = await prisma.matchDecision.findMany({
    where: { verdict: "CONFIRMED", retiredAt: null, aId: { startsWith: PREFIX } },
  });
  check("a retired pair is excluded from the grouping read", live.length === 0);

  // A triplet losing one member recomputes to a valid 2-store group rather than
  // vanishing or keeping a dead member.
  const shrunk = buildGroups(
    [m("a", "CONTINENTE"), m("b", "AUCHAN")], // c delisted, so not passed in
    [link("a", "b"), link("b", "c")] // the stale link to c is ignored
  );
  check("a triplet minus a delisted member becomes a 2-store group", shrunk.length === 1 && shrunk[0].storeCount === 2);
  check("and the dead member is not in it", !shrunk[0].productIds.includes("c"));

  failures += verifyFoodTypes();
  failures += verifyPingoDoceSitemap();
  failures += await verifyRotationWarnings();
  failures += verifyNoPageRetention();
  failures += await verifySitemapLastmod();
  failures += verifyComparison();
  failures += verifySectionComparison();

  await cleanup();
  return failures;
}

/**
 * The comparison rules: what each store has to say about one kind of food.
 *
 * The cases that matter are the two that look like a blank cell. "Continente
 * does not sell this" and "Continente sells it but we cannot price it per kilo"
 * are different facts, and both are common - Continente publishes a size for
 * 57% of its products, and a fifth of Pingo Doce's pages carry no sellable
 * price. Rendering them alike would be the page's most frequent lie, so it is
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
  check(
    "and neither is a missing price",
    cheapestPerStore([p("AUCHAN", "X", null, 1)], "batata").get("AUCHAN")!.kind === "no-size"
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

  // Two prices or it is not a comparison. This is what empties the wine page:
  // every wine group pairs a sized Auchan bottle with an unsized Continente row.
  const halfPriced = namedGroup(
    [
      p("AUCHAN", "Vinho X", 3.98, 0.75, "l"),
      // no size: exactly the state 57%-sized Continente is in for wine
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

  // The department list is DERIVED from the sections table, so the two can
  // never disagree. What is worth checking is that the derivation still selects
  // food only, and still builds an address robots.txt permits.
  // The cross-cutting aisles were skipped wholesale on a six-page sample, which
  // turned out to be six out-of-season Christmas products. Measured properly,
  // 494 of the 1,010 are food.
  check(
    "a mixed aisle is fetched, not skipped",
    PINGO_DOCE_SECTIONS["as-nossas-marcas"]?.kind === "mixed" &&
      PINGO_DOCE_SECTIONS["natal-e-ano-novo"]?.kind === "mixed",
    "their URL cannot say what a product is, so the name has to"
  );
  check(
    "a non-food aisle is still skipped without a request",
    PINGO_DOCE_SECTIONS["limpeza"]?.kind === "non-food" &&
      PINGO_DOCE_SECTIONS["higiene-pessoal-e-beleza"]?.kind === "non-food",
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
    "but a spreading pasta still is",
    classifyFoodType("Pasta de Atum", "PINGO_DOCE", "Mercearia/Pates e Pastas") === "pasta"
  );

  check(
    "the food departments are exactly the food-kind sections",
    PINGO_DOCE_FOOD_CATEGORIES.length ===
      Object.values(PINGO_DOCE_SECTIONS).filter((s) => s.kind === "food").length &&
      PINGO_DOCE_FOOD_CATEGORIES.every((d) => PINGO_DOCE_SECTIONS[d.slug]?.kind === "food"),
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

/**
 * Food-type classification and the free size backfill. Pure - no database, no
 * network - because these are judgement calls and the point is that they can be
 * checked without either.
 */
function verifyFoodTypes(): number {
  const before = failures;
  console.log("\n  food types: classification");

  // Continente and Auchan file potatoes under a food top-level; Pingo Doce's
  // path is a flat shelf name, which is why its rule is inverted.
  const CONT = "Frescos/Legumes/Batata, Batata Doce e Mandioca";
  const AUCH = "produtos-frescos/legumes/batatas,-alho-e-cebola";
  const PING = "Frutas e Vegetais/Batatas, Cebolas e Alhos";

  const is = (name: string, store: string, path: string, want: string | null) =>
    check(
      `${name.slice(0, 38).padEnd(38)} -> ${String(want)}`,
      classifyFoodType(name, store, path) === want,
      `got ${String(classifyFoodType(name, store, path))}`
    );

  // batata, in all three stores and all three name shapes
  is("Batata Vermelha Continente", "CONTINENTE", CONT, "batata");
  is("BATATA BRANCA LAVADA KG", "AUCHAN", AUCH, "batata");
  is("Batata para Cozer e Assar Embalada", "PINGO_DOCE", PING, "batata");

  // ...and the three foods that share the word but are not it
  is("Batata Doce Polpa Laranja", "CONTINENTE", CONT, "batata-doce");
  is("Batatas Fritas Lisas", "CONTINENTE", "Mercearia/Snacks", null);
  is("Puré de Batata Flocos", "CONTINENTE", "Mercearia/Puré", null);

  console.log("\n  food types: the ordering rule (food type beats cut word)");
  // These are the cases that bite. A cut word must never win over a real food
  // type, or "Queijo Fresco de Vaca" is filed as beef.
  is("Queijo Fresco de Vaca", "CONTINENTE", "Laticínios e Ovos/Queijo", "queijo");
  is("Fiambre de Peito de Peru", "CONTINENTE", "Frescos/Charcutaria", "fiambre");
  is("Salsicha de Frango Brasitas", "PINGO_DOCE", "Talho", "salsicha");
  is("Arroz de Pato Congelado", "AUCHAN", "congelados", "arroz");
  // ...and where the head IS a cut, it resolves to the animal behind it
  is("Peito de Frango Embalado", "PINGO_DOCE", "Talho", "frango");
  is("Lombo de Porco", "PINGO_DOCE", "Talho", "porco");
  is("Lombo de Atum Descongelado", "PINGO_DOCE", "Peixaria", "atum");
  is("Miolo de Camarão 40/60 Congelado", "CONTINENTE", "Congelados", "camarao");
  is("Coxa de Frango", "AUCHAN", "produtos-frescos", "frango");

  console.log("\n  food types: the fallback chain");
  // "miolo" is the kernel of anything, not just shellfish - 86 of its 134
  // products are nuts, and a cut-word list restricted to animals lost them all.
  is("Miolo de Amêndoa com Pele Continente", "CONTINENTE", "Mercearia", "amendoa");
  is("Miolo de Noz Metades", "CONTINENTE", "Mercearia", "noz");
  is("Miolo de Avelã Torrada", "CONTINENTE", "Mercearia", "avela");
  // Wine estates: the head is the estate, the food is later in the name.
  is("Quinta do Carmo Alentejano Vinho Branco", "CONTINENTE", "Bebidas e Garrafeira/Vinhos", "vinho");
  is("Herdade dos Grous Alentejo Vinho Rosé", "CONTINENTE", "Bebidas e Garrafeira/Vinhos", "vinho");
  // Category fallback: nothing in this name says coffee, but the shelf does.
  is("Cápsulas Dolce Gusto Espresso Napoli", "PINGO_DOCE", "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas", "cafe");
  check(
    "the category is read leaf-first, so Café em Cápsulas is café and not chá",
    classifyFoodType("Cápsulas Compatíveis 16un", "PINGO_DOCE",
      "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas") === "cafe"
  );

  // A shelf that names several foods says what is NEAR a product, not what it
  // is. Taking the first food named filed 2,271 products wrongly.
  console.log("\n  food types: shelves that name several foods");
  is("Puré de Batata Knorr", "CONTINENTE", "Mercearia/Arroz, Massa e Farinha/Puré", null);
  is("Nectarina Continente", "CONTINENTE", "Frescos/Frutas/Pêssego, Ameixa e Kiwi", null);
  is("LAÇOS (FARFALLE) AUCHAN 500G", "AUCHAN", "alimentação/mercearia/arroz-e-massa", null);
  // ...and an undecided shelf does not hand over to its broader parent.
  is("Coco Ralado Continente", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Preparados para Mousses e Bolos", null);
  // How many foods a shelf names is decided by the shelf alone: after café's
  // rules turned a product away, this shelf used to look like a tea shelf.
  check(
    "a shelf naming coffee and tea is not a tea shelf for whatever coffee rejects",
    classifyFoodType("Cápsulas de Achocolatado Dolce Gusto Nesquik", "PINGO_DOCE",
      "Café, Chá e Achocolatados/Capsulas de Cafe") !== "cha"
  );

  // What the old shelf rule got right is now claimed by name.
  console.log("\n  food types: claimed by name instead of by shelf");
  const cafeShelf = "alimentação/mercearia/café,-chá-e-infusão/cápsula-dolce-gusto-e-compatíveis";
  is("CÁPSULAS DOLCE GUSTO BUONDI 64 UN", "AUCHAN", cafeShelf, "cafe");
  is("CÁPSULAS TORRIÉ CAFÉ COM LEITE SOLÚVEL DOLCE GUSTO 16UN", "AUCHAN", cafeShelf, "cafe");
  is("Cápsulas de Galão", "PINGO_DOCE", "Café, Chá e Achocolatados/Capsulas de Cafe", "cafe");
  check("capsules of something else are not coffee",
    classifyFoodType("CÁPSULAS TASSIMO MILKA 8UN", "AUCHAN", cafeShelf) !== "cafe");
  check("nor are Nesquik capsules, even on a coffee shelf",
    classifyFoodType("Cápsulas de Achocolatado Dolce Gusto Nesquik", "PINGO_DOCE",
      "Café, Chá e Achocolatados/Capsulas de Cafe") !== "cafe");
  // "pastilha" is a coffee pod and also a lozenge; "açafrão" contains "caf".
  const sweets = "Mercearia/Chocolate, Gomas e Rebuçados/Gomas, Pastilhas e Rebuçados";
  check("coffee-flavoured sweets are not coffee",
    classifyFoodType("Rebuçados de Café Mini sem Glúten Villa", "CONTINENTE", sweets) !== "cafe");
  check("nor is saffron gum, though açafrão contains caf",
    classifyFoodType("Pastilhas Elásticas de Gengibre e Açafrão True Gum", "CONTINENTE", sweets) !== "cafe");
  is("Pastilhas Delta Café Platinum 16un", "AUCHAN",
    "alimentação/mercearia/café,-chá-e-infusão/café-de-máquina,-grão-e-pastilhas", "cafe");
  check("roasted barley is not coffee, though Delta also sells coffee",
    classifyFoodType("CEVADA DELTA TORRADA MOÍDA 220 G", "AUCHAN",
      "alimentação/mercearia/café,-chá-e-infusão/café-saco,-solúvel-e-cevadas") !== "cafe");
  is("TABLETE LINDT EXCELLENCE 70% 100G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados", "chocolate");
  is("Chouriça Tradicional Prisca", "CONTINENTE", "Frescos/Charcutaria/Chouriço e Morcela", "chourico");
  is("PÃES GARCIA CACETE SEM GLÚTEN 5X80G", "AUCHAN", "alimentação/padaria-e-pastelaria", "pao");

  check("a name ending in a weight range is sold by the kilo",
    SOLD_PER_KG.test("SALMÃO FRESCO INTEIRO 2KG A 3KG") && SOLD_PER_KG.test("ROBALO GRANDE 800G A 1KG"),
    "a fish graded 2-3 kg, priced per kilo - not a 2 kg pack");
  check("a size written into the end of a word is not", !SOLD_PER_KG.test("ARROZ AGULHA 1KG"));
  check("a shelf saying 'and specialities' does not make hummus salmon",
    classifyFoodType("Hummus", "PINGO_DOCE",
      "Charcutaria e Queijos/Charcutaria/Salmao Fumado e Especialidades") !== "salmao");
  is("Salmão Fumado Norueguês", "PINGO_DOCE",
    "Charcutaria e Queijos/Charcutaria/Salmao Fumado e Especialidades", "salmao");
  check("a salmon head is not salmon", classifyFoodType("CABEÇA SALMÃO KG", "AUCHAN",
    "produtos-frescos/peixaria/peixe-fresco") !== "salmao");
  check("nor 'other fish'", classifyFoodType("SALMÃO CABEÇA 2KG A 3KG", "AUCHAN",
    "produtos-frescos/peixaria/peixe-fresco") !== "peixe");
  is("Salmão Inteiro Fresco", "PINGO_DOCE", "Peixaria/Peixe/Atum e Salmao", "salmao");
  check("quail is not duck, though Auchan shelves it with duck",
    classifyFoodType("CODORNIZ EXTRA AUCHAN CULTIVAMOS O BOM KG", "AUCHAN",
      "produtos-frescos/talho/pato-e-mais-aves") !== "pato");
  is("Pato Inteiro com Miúdos Embalado", "PINGO_DOCE", "Talho/Aves", "pato");
  check("línguas de gato are not cinnamon, even with Auchan's brand in the middle",
    classifyFoodType("LÍNGUAS AUCHAN DE GATO CROCANTE CANELA LIMÃO 200G", "AUCHAN",
      "alimentação/mercearia/bolachas-e-bolos") !== "canela");
  is("CANELA MOÍDA MARGÃO 40G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos", "canela");

  // These two rules held invisible control characters where `\b` belonged, and
  // matched nothing until that was noticed.
  console.log("\n  food types: rules that used to match nothing");
  check("ovos moles are a sweet, not eggs",
    classifyFoodType("Ovos Moles de Aveiro", "CONTINENTE", "Frescos/Padaria e Pastelaria/Doçaria Regional") !== "ovo");
  check("a dish with a sauce is not sauce",
    classifyFoodType("Pernil Assado com Molho de Cerveja", "PINGO_DOCE", "Congelados/Refeicoes e Salgados") !== "molho");
  check("nor is it the sauce's ingredient",
    classifyFoodType("Pernil Assado com Molho de Cerveja", "PINGO_DOCE", "Congelados/Refeicoes e Salgados") !== "cerveja",
    "roast pork in beer sauce is not beer");
  // The scan must not override an exclude: pure de batata is not a potato.
  is("Puré de Batata Flocos Continente", "CONTINENTE", "Mercearia", null);

  console.log("\n  food types: sections and honesty");
  check(
    "a matching head in a NON-food section is rejected",
    classifyFoodType("Batata Vermelha", "CONTINENTE", "Casa e Jardim") === null
  );
  check(
    "Pingo Doce drinks are food (the bug that read its whole drinks aisle as zero)",
    isFoodSection("PINGO_DOCE", "Águas, Sumos e Refrigerantes") &&
      isFoodSection("PINGO_DOCE", "Vinho Tinto") &&
      isFoodSection("PINGO_DOCE", "Cápsulas de Café")
  );
  check(
    "Pingo Doce non-food is still excluded",
    !isFoodSection("PINGO_DOCE", "Casa e Eletrodomésticos") &&
      !isFoodSection("PINGO_DOCE", "Sacos e Sacos de Compras")
  );
  check(
    "an unrecognised head returns null rather than a guess",
    classifyFoodType("Zurblatt Fantástico 500g", "CONTINENTE", "Mercearia") === null
  );

  console.log("\n  food types: free size extraction");
  const size = (name: string) => parseSize(name);
  check("a pack size in the name is read", size("BATATA VERMELHA AUCHAN 3 KG")?.total === 3);
  check("grams fold to kg", Math.abs((size("BOLACHA MARIA 200G")?.total ?? 0) - 0.2) < 1e-9);
  check("a multipack multiplies out", size("LEITE UHT AGROS MEIO GORDO 6X1L")?.total === 6);
  check("no size in the name is null, not a guess", size("Batata Vermelha") === null);

  // Auchan leaves the decimal point out of volumes, so the first digit is the
  // whole part. Read literally these became 198 L, 300 L and 600 L, and a size
  // that is too large makes the price per kilo too small - which sorts it
  // straight to the top of every "cheapest" ranking.
  console.log("\n  food types: Auchan's two size notations");
  const near = (got: number | undefined, want: number) => Math.abs((got ?? -1) - want) < 1e-9;
  check(
    "a three-digit volume has an implied decimal point",
    near(size("CERVEJA SEM ALCOOL SUPER BOCK PILSENER 0.0% 6X033L")?.total, 1.98),
    "6 x 0.33 L = 1.98 L, not 198 L"
  );
  check("and again at half a litre", near(size("AGUA C/ GAS VIMEIRO 6X050L (SDR)")?.total, 3));
  check(
    "and where the whole part is not zero",
    near(size("AGUA S/GAS VIMEIRO ORIGINAL 4X150L (SDR)")?.total, 6),
    "4 x 1.50 L = 6 L, not 600 L"
  );
  check("a plain litre value is untouched", size("SUMO LARANJA 2L")?.total === 2);
  check("and so are grams, where 500 is genuinely 500", near(size("BOLACHA 500G")?.total, 0.5));

  // A weight GRADE is not a size. Auchan grades fish in grams but labels it kg.
  check(
    "a weight range is unknown, not the larger number",
    size("TRUTA SALMONADA 800/1600 KG") === null,
    "we do not know what one fish weighs, so we must not claim to"
  );
  check("another grade, same answer", size("DOURADA FRESCA INTEIRA 400/600 KG") === null);
  check(
    "a slash that is not a range still parses",
    near(size("LEITE UHT M/GORDO GRESSO 1L")?.total, 1),
    "M/GORDO is meio gordo, not a range"
  );

  // The two-digit form of the same notation cannot be decoded: 6X33L is 0.33 L
  // cans while 4X15L is 1.5 L bottles, and nothing in the string tells them
  // apart. Refusing to answer beats being right half the time.
  check("an undecodable volume is unknown, not a guess", size("REFRIGERANTE 7UP LATA 6X33L") === null);
  check("and the other reading of it too", size("AGUA SERRA DA ESTRELA 4X15L") === null);
  check("a calibre where a size goes is unknown", size("CHOURICAO PROBAR T/80 KG") === null);
  check(
    "a model number is not a size",
    size("BOLO CAKE DESIGN PRODUÇÃO PRÓPRIA Nº20 KG") === null,
    "design number 20, sold by the kilo - not a 20 kg cake"
  );
  check("nor with a dot", size("BOLO CAKE DESIGN N.º 7 KG") === null);
  check("a real size beside a model number survives", near(size("VELA Nº5 BOLO 500G")?.total, 0.5));
  check("a 10 L garrafao still parses", near(size("AGUA GARRAFAO 10L")?.total, 10));
  check("a fraction of a centilitre is litres written wrongly",
    near(size("SUPER SMOOTHIE INNOCENT ANTIOX 0.75CL (SDR)")?.total, 0.75), "0.75 L, not 7.5 ml");
  check("whole centilitres are still centilitres", near(size("REFRIGERANTE LATA 33CL")?.total, 0.33));
  // An added amount is in the pack the shopper pays for; reading only the first
  // made these 18-33% dearer per kilo than they are.
  check("an added amount is part of the pack",
    near(size("FIAMBRE DA PERNA EXTRA IZIDORO FATIAS FINAS 120G+30G")?.total, 0.15), "150 g, not 120 g");
  check("with GRATIS after it too", near(size("MEL GRANJA SAN FRANCISCO 850G+150G GRÁTIS")?.total, 1));
  check("and in litres", near(size("REFRIGERANTES COM GÁS FANTA LARANJA 1.5L+0.5L GRÁTIS (SDR)")?.total, 2));
  check("an added amount in another dimension is ignored", near(size("GELADO 500ML+100G")?.total, 0.5));
  check("a plus with no amount changes nothing", near(size("BOLACHAS 200G + OFERTA")?.total, 0.2));
  check("a minimum weight is unknown, not a pack", size("POLVO GRANDE CONGELADO (+6 KG)") === null,
    "an octopus over 6 kg, priced per kilo - not EUR 2.83/kg");
  check("a zero-led two-digit litre is unknown", size("REFRIGERANTES COM GÁS PEPSI ZERO 1+05L OFERTA") === null,
    "1 L + 0.5 L, not 5 L");
  check("a kilo grade with one unit is unknown", size("POLVO CONGELADO (4 A 5 KG)") === null, "graded 4-5 kg, not a 5 kg pack");
  check("and is sold by the kilo", SOLD_PER_KG.test("POLVO NACIONAL AUCHAN CONGELADO (3 A 4 KG)"));
  check("a gram range is still a net weight", near(size("PÊSSEGO FERBAR METADES 810 A 860G")?.total, 0.86));
  check("and an age is not an amount", near(size("BEBIDA LACTEA NESTLÉ BOLACHA MARIA CRESCIMENTO 3+ 1L")?.total, 1));

  // Auchan's figure against the name: the figure decides only where it helps.
  const rec = (total: number, unit: "kg" | "l", name: string) => reconcileTileSize({ total, unit }, name);
  check("an impossible figure loses to the name", rec(399, "kg", "LASANHA IGLO BOLONHESA 300G") === undefined,
    "the first version priced this lasagna at EUR 0.01/kg");
  check("a believable figure fills a name with no size", rec(0.15, "kg", "QUEIJO FRESCO AUCHAN")?.packageSize === 0.15);
  check("but an impossible one does not", rec(150, "kg", "QUEIJO FRESCO AUCHAN") === undefined);
  check("a close figure confirms the name's exact size",
    near(rec(0.274, "kg", "GELADO SNICKERS 6X48G")?.packageSize ?? undefined, 0.288));
  check("a whole multiple is a pack count the name reader missed",
    near(rec(0.15, "kg", "CHOCOLATE SNICKERS SNACK 3 PACK 50G")?.packageSize ?? undefined, 0.15));
  check("ten times is Auchan's per-100 g error, not a pack of ten",
    rec(0.601, "kg", "GEL MYPROTEIN HYROX LIMO/FRAMBOE 60G") === undefined, "60 g, not 601 g");
  check("a whole multiple without a multipack sign is Auchan's error",
    rec(1, "kg", "SALSICHA BEYOND MEAT VEGETAL 200G") === undefined, "200 g, not a kilo");
  check("as is one the name reader had already counted",
    rec(1, "kg", "QUINOA TIPIAK BRANCA EXPRESS 2X100G") === undefined, "2 x 100 g, not a kilo");
  check("a missed '4*100G' is a pack count",
    near(rec(0.4, "kg", "HAMBURGUERES DE SUINO ISENTO DE GLUTEN AUCHAN 4*100G")?.packageSize ?? undefined, 0.4));
  check("and so is 'LEVE 4 PAGUE 3'",
    near(rec(1, "l", "VINHO ROSE MATEUS LEVE 4 PAGUE 3 0.25L")?.packageSize ?? undefined, 1));
  check("any other disagreement leaves the name in charge",
    rec(0.1, "kg", "RÚCULA SELVAGEM VITACRESS 75 G") === undefined);
  check("kilos against litres leaves the name in charge", rec(0.4, "l", "MOLHO BARILLA BASILICO 400G") === undefined);

  // `npm run discover` searches our own catalogue by these rules.
  console.log("\n  discovery: searching the catalogue by words");
  check("accents and case are ignored", matchesTerm("Açúcar Mascavado Continente", "acucar mascavado"));
  check("plurals meet singulars, both ways", matchesTerm("Ovo Cozido", "ovos") && matchesTerm("Ovos Classe M", "ovo"));
  check("including Portuguese plurals", matchesTerm("Limões Bio", "limao") && matchesTerm("Pães de Leite", "pao"));
  check("whole words only: sal does not find salmão", !matchesTerm("Salmão Fumado", "sal"));
  check("every word must be present", !matchesTerm("Iogurte Grego", "iogurte natural"));

  // Products whose store publishes impossible data (data/store-errors.ts).
  console.log("\n  known store errors: kept out of comparisons, not deleted");
  const crackers: ComparableProduct = {
    storeProductId: "988950", store: "PINGO_DOCE", name: "Bolachas Crackers Sabor a Tomate",
    brand: "Gran Pavesi", price: 3.99, packageSize: 3.36, unit: "kg",
  };
  check("a listed product is recognised", isStoreError("PINGO_DOCE", "988950"));
  check("and only that one", !isStoreError("CONTINENTE", "988950") && !isStoreError("PINGO_DOCE", "988951"));
  check("a listed product cannot compete, however complete its data looks",
    !comparable(crackers, "bolacha"), "Pingo Doce's own label says 3.36 kg");
  check("the same data under another id still can", comparable({ ...crackers, storeProductId: "1" }, "bolacha"));
  check("a store whose only product is listed reads 'size unknown', not 'not sold'",
    cheapestPerStore([crackers], "bolacha").get("PINGO_DOCE")?.kind === "no-size",
    "it does sell biscuits");
  const entry = STORE_ERRORS.find((e) => e.storeProductId === "988950")!;
  check("the store's size unchanged: nothing to do yet",
    storeErrorStatus(entry, { packageSize: 3.36, unit: "kg", delisted: false }).kind === "unchanged");
  const fixed = storeErrorStatus(entry, { packageSize: 0.336, unit: "kg", delisted: false });
  check("the store's size changed: look again now, not in 30 days",
    fixed.kind === "changed" && fixed.was === "3.36 kg" && fixed.now === "0.336 kg");
  check("the size removed altogether also counts as a change",
    storeErrorStatus(entry, { packageSize: null, unit: null, delisted: false }).kind === "changed");
  check("a delisted or missing product is reported as gone",
    storeErrorStatus(entry, { packageSize: 3.36, unit: "kg", delisted: true }).kind === "gone" &&
      storeErrorStatus(entry, null).kind === "gone");
  check("every entry is dated, evidenced and unique",
    STORE_ERRORS.every((e) => /^\d{4}-\d{2}-\d{2}$/.test(e.checkedOn) && e.evidence.length > 0 && e.problem.length > 0) &&
      new Set(STORE_ERRORS.map((e) => `${e.store}:${e.storeProductId}`)).size === STORE_ERRORS.length);

  // Auchan's own per-unit figure on its listing tiles. Prices and figures as
  // they appeared on three live listings, 4 October 2026.
  console.log("\n  Auchan listing tiles: the store's own per-unit figure");
  const tile = (price: number, figure: string, name: string) => auchanTileSize(price, figure, name);
  check("a per-kilo figure gives the pack size, whatever the name says",
    near(tile(1.29, "8.6 €/Kg", "LINGUIÇA CORRENTE POLEGAR PICANTE KG")?.packageSize ?? undefined, 0.15),
    "EUR 1.29 at 8.60/kg is a 150 g pack, not a kilo");
  check("and it is marked as the store's own figure",
    tile(1.29, "8.6 €/Kg", "LINGUIÇA CORRENTE POLEGAR PICANTE KG")?.sizeSource === "listing");
  check("a per-litre figure gives litres", tile(1.99, "1.33 €/L", "SUMO LARANJA 1.5L")?.unit === "l");
  check("a name the figure confirms keeps its exact size",
    near(tile(3.99, "19.23 €/Kg", "SNACK DE CHOCOLATE KIT KAT 5X41.5G")?.packageSize ?? undefined, 0.2075),
    "207.5 g, not the 208 g a rounded figure gives");
  check("a name the figure contradicts is overruled",
    near(tile(3.29, "21.93 €/Kg", "CHOCOLATE SNICKERS SNACK 3 PACK 50G")?.packageSize ?? undefined, 0.15),
    "three 50 g bars: the name reader saw only 50 g");
  check("a tiny expensive pack keeps its precision",
    near(tile(2.99, "9966.67 €/Kg", "ACAFRAO MOIDO 0.3 G")?.packageSize ?? undefined, 0.0003));
  check("a per-item figure that differs from the price: the price is per kilo",
    tile(4.49, "8.98 €/un", "PATO INTEIRO COM MIUDOS QUINTA DA MARINHA KG")?.packageSize === 1,
    "a whole duck at EUR 4.49/kg, EUR 8.98 the bird");
  const quail = tile(1.25, "1.25 €/un", "CODORNIZ EXTRA AUCHAN CULTIVAMOS O BOM KG");
  check("a per-item figure equal to the price is unknown, deliberately",
    quail !== undefined && quail.packageSize === null && quail.sizeSource === "listing",
    "per bird or one-kilo bird: the tile cannot say, and the KG rule must not guess");
  check("a per-item figure says nothing about a name that is not sold by the kilo",
    tile(2.49, "0.21 €/un", "OVOS CLASSE M AUCHAN 12UN") === undefined,
    "the price of one egg must not make a box of twelve 'per kilo'");
  check("a figure without a unit settles nothing", tile(19.99, "2.00 €", "GUANCIALE MONTARAZ PORCO PRETO KG") === undefined);

  // Saving: a size from a tile must not touch the barcode or the page-read mark.
  const fromTile = enrichment({ packageSize: 0.15, unit: "kg", sizeSource: "listing" });
  check("a tile's size does not erase a barcode", !("ean" in fromTile) && !("eanNormalized" in fromTile));
  check("nor claim a product page was read", !("enrichedAt" in fromTile));
  check("and records where the size came from", fromTile.sizeSource === "listing");
  const fromPage = enrichment({ ean: null, packageSize: 0.5, unit: "kg" });
  check("a product page still writes both, as before",
    "ean" in fromPage && "enrichedAt" in fromPage && fromPage.sizeSource === "page");
  check("a listing that knows nothing writes nothing", Object.keys(enrichment({})).length === 0);

  // Goods sold by weight: the headline price is already per kilo, and the size
  // label is what one item weighs. Strings as they appear on live pages
  // (3 October 2026).
  console.log("\n  page sizes: a price that is already per kilo");
  check("Continente's per-kilo headline is recognised",
    pricedPerUnit("2,49€/kg 7,35€/un", 2.49) === "kg", "a whole chicken, emb. 2,95 kg (aprox.)");
  check("so is Pingo Doce's, promotion text and all",
    pricedPerUnit("10,99 €/Kg Price reduced from 12,99 €/Kg to", 10.99) === "kg", "a whole salmon, label 4.2 Kg");
  check("a pack price is not per kilo, whatever the second line says",
    pricedPerUnit("1,99€ 9,95€/kg", 1.99) === null);
  check("nor is a plain promotion", pricedPerUnit("3,79 € Price reduced from 4,99 € to", 3.79) === null);
  check("a per-kilo figure that is not THIS price does not count",
    pricedPerUnit("4,99€/kg", 2.49) === null, "another product's price must never answer for this one");
  check("no price, no verdict", pricedPerUnit("2,49€/kg", null) === null);
  check("a per-kilo price makes the size exactly 1",
    correctedSize("Frango Inteiro", { total: 2.95, unit: "kg" }, "kg")?.total === 1,
    "EUR 2.49/kg, not 2.49 / 2.95 = EUR 0.84/kg");

  console.log("\n  page sizes: capsules counted as kilos or litres");
  check("ten capsules labelled 10 Kg are not 10 kg",
    correctedSize("Cápsulas de Café Nespresso Baunilha", { total: 10, unit: "kg" }, null) === null);
  check("nor is an intensity read as litres",
    implausiblePodSize("Cápsulas de Café Fortissimo Int 10 L'Or", 10, "l"));
  check("a real capsule weight survives",
    correctedSize("Cápsulas de Café Expresso", { total: 0.052, unit: "kg" }, null)?.total === 0.052);
  check("and a 10 kg sack of something that is not a capsule is left alone",
    correctedSize("Batata Branca Saco", { total: 10, unit: "kg" }, null)?.total === 10);
  check("and a 5 kg sack of rice", near(size("ARROZ AGULHA 5 KG")?.total, 5));

  // Portuguese writes thousands with a dot, and Auchan leaves it in front of a
  // small unit, where it reads as a decimal point.
  console.log("\n  food types: a thousands dot before a small unit");
  check("1.200 GR is 1200 grams", near(size("MARISCADA COZIDA UNIDADE 1.200 GR")?.total, 1.2));
  check("0.375G is 375 grams", near(size("RATATOUILLE BONDUELLE 0.375G")?.total, 0.375));
  check("0.250ML is 250 millilitres", near(size("KOMBUCHA PLENO CHA VERDE BIO 0.250ML")?.total, 0.25));
  // One and two decimals are genuinely used for the tiny expensive things, and
  // must survive: these come out near the real EUR 10,000/kg for saffron and
  // EUR 3,800/kg for vanilla.
  check("0.3 G of saffron really is 0.3 grams", near(size("ACAFRAO MOIDO 3 DOSES 0.3 G")?.total, 0.0003));
  check("a 1.2 g vanilla pod likewise", near(size("VAGEM ESPIGA DE BAUNILHA SAQUETA 1.2G")?.total, 0.0012));
  check("and 1.500 KG is still 1.5 kg, not 1500", near(size("ARROZ 1.500 KG")?.total, 1.5));

  // Auchan usually drops the "de" that the other two chains write.
  console.log("\n  food types: plant drinks");
  const t = (name: string) => classifyFoodType(name, "AUCHAN", "alimentação/bebidas");
  check("BEBIDA ARROZ is a drink, not rice", t("BEBIDA ARROZ UHT AUCHAN SEM GLUTEN 1L") === "bebida-vegetal");
  check("BEBIDA AMENDOAS is a drink, not nuts", t("BEBIDA AMÊNDOAS AUCHAN SEM AÇÚCARES 1L") === "bebida-vegetal");
  check("BEBIDA SOJA is classified at all", t("BEBIDA SOJA AUCHAN SEM GLÚTEN 1L") === "bebida-vegetal");
  check("an Alpro naming no plant is still a plant drink", t("BEBIDA ALPRO BARISTA 1L") === "bebida-vegetal");
  check(
    "the written-out form still works",
    classifyFoodType("Bebida Vegetal de Aveia", "CONTINENTE", "Laticínios e Ovos") === "bebida-vegetal"
  );
  check(
    "a dairy drink is NOT swept in",
    // A full path, not the bare section: "Laticínios e Ovos" alone tokenises to
    // `ovos` and the fallback answers `ovo`. That is the category fallback
    // being coarse, not the plant-drink rule, and it is why the shelf is only
    // ever consulted last.
    classifyFoodType(
      "Bebida Láctea Infantil 1 a 3 anos",
      "CONTINENTE",
      "Laticínios e Ovos/Leite/Leite Infantil"
    ) === "leite",
    "widening the rule must not start eating milk"
  );

  return failures - before;
}
