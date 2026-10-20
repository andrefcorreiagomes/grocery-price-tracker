import { prisma } from "../lib/db";
import { classifyFoodType, isFoodSection } from "../lib/food-types";
import { sectionKey, sectionOf, topSectionKind } from "../lib/store-sections";
import { keepInCatalogue } from "../lib/catalogue-filter";
import { capsuleCountFromName, eggCountFromName, eggCountFromUnitPrice, itemCount } from "../lib/egg-count";
import { categoryOf, labelsOf, laterCategoryOf, subKindOf, treeProblems } from "../lib/food-tree";
import { comparisonGroups, mainGroup, MIN_CHAINS, shownGroups, type TreeProduct } from "../lib/comparison-groups";
import { missingFromList } from "../scrapers/crawl/product-checks";
import { FOOD_TYPES } from "../../data/food-types";
import { LeftOutTally, SectionTally, compareSections, sectionProblems } from "../scrapers/crawl/section-watch";
import { parseCategoryPaths } from "../scrapers/crawl/continente-categories";
import { buildGroups, reconcileGroups, sizeSpreadOk, OVERSIZE_FACTOR, type GroupLink, type GroupMemberInput } from "../lib/grouping";
import { auchanTileSize, matchesTerm, parseSize, qualifierMismatch, reconcileTileSize, SOLD_PER_KG, stripAccents } from "../lib/matching";
import { enrichment } from "../scrapers/crawl/persist";
import {
  categoryPathFromUrl,
  nameFromUrl,
  labelFromSlug,
  productIdFromUrl,
  PINGO_DOCE_SECTIONS,
} from "../scrapers/crawl/pingodoce-sitemap";
import { PINGO_DOCE_FOOD_CATEGORIES } from "../scrapers/crawl/pingodoce-categories";
import { coverageRows } from "../scrapers/crawl/pingodoce";
import { buildRotationReport } from "../scrapers/crawl/rotation-report";
import { sectionWarnings } from "../scrapers/crawl/history";
import { adminEnabled } from "../lib/admin";
import { currentSince, MAX_NAMED_GROUPS, STALE_AFTER_DAYS } from "../lib/grupos";
import { detached } from "../scrapers/types";
import { correctedSize, implausiblePodSize, parseShownUnitPrice, pricedPerUnit, sizeFromUnitPrice } from "../scrapers/page-size";
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

  // --- a group keeps its id from run to run --------------------------------
  console.log("\n  a group keeps its id from run to run");
  const C = "CONTINENTE", A = "AUCHAN", P = "PINGO_DOCE";
  const cluster = (members: GroupMemberInput[], links: GroupLink[]) => buildGroups(members, links);

  const same = reconcileGroups([{ id: "g1", productIds: ["b", "a"] }], cluster([m("a", C), m("b", A)], [link("a", "b")]));
  check("an unchanged group keeps its id", same.kept.length === 1 && same.kept[0].id === "g1" && same.created.length === 0);
  check("and is not counted as changed", same.kept[0]?.changed === false);

  const grown = reconcileGroups(
    [{ id: "g1", productIds: ["a", "b"] }],
    cluster([m("a", C), m("b", A), m("c", P)], [link("a", "b"), link("b", "c")])
  );
  check("a pair that gains a third store keeps its id", grown.kept[0]?.id === "g1" && grown.kept[0].group.storeCount === 3);
  check("and is counted as changed", grown.kept[0]?.changed === true);

  const fresh = reconcileGroups([], cluster([m("a", C), m("b", A)], [link("a", "b")]));
  check("a cluster with no earlier group is new", fresh.created.length === 1 && fresh.kept.length === 0);

  // Two groups joined by a new pair: the one sharing more products keeps its id.
  const merged = reconcileGroups(
    [{ id: "g1", productIds: ["a", "b"] }, { id: "g2", productIds: ["c", "d"] }],
    cluster([m("a", C), m("b", A), m("c", P), m("d", A), m("e", C)], [link("a", "b"), link("b", "c"), link("c", "d"), link("d", "e")])
  );
  // Five products over three stores is within the two-per-store limit, so this cluster is emitted.
  check("when two groups merge, one keeps its id", merged.kept.length === 1);
  check(
    "and the other is retired as merged into it",
    merged.retired.length === 1 && merged.retired[0].reason === "merged" && merged.retired[0].mergedIntoId === merged.kept[0]?.id
  );

  // One group split in two: the bigger part keeps the id, the rest is new.
  const split = reconcileGroups(
    [{ id: "g1", productIds: ["a", "b", "c", "d", "e"] }],
    cluster([m("a", C), m("b", A), m("c", P), m("d", C), m("e", A)], [link("a", "b"), link("b", "c"), link("d", "e")])
  );
  check(
    "when a group splits, the bigger part keeps the id",
    split.kept.length === 1 && split.kept[0].id === "g1" && split.kept[0].group.productIds.join() === "a,b,c"
  );
  check("and the smaller part is a new group", split.created.length === 1 && split.created[0].productIds.join() === "d,e");

  const gone = reconcileGroups([{ id: "g1", productIds: ["a", "b"] }], []);
  check("a group whose pairs all went is retired as dissolved", gone.retired[0]?.reason === "dissolved");

  const refusedNow = reconcileGroups(
    [{ id: "g1", productIds: ["a", "b"] }],
    cluster([m("a", C, "400 g"), m("b", A, "750 g"), m("c", P, "1 kg")], [link("a", "b"), link("b", "c")])
  );
  check("a group whose cluster fails a guard is retired as refused", refusedNow.retired[0]?.reason === "refused" && refusedNow.kept.length === 0);

  // The answer must not depend on the order the clusters come in.
  const twoClusters = cluster([m("a", C), m("b", A), m("c", C), m("d", A)], [link("a", "b"), link("c", "d")]);
  const old = [{ id: "g1", productIds: ["a", "b"] }, { id: "g2", productIds: ["c", "d"] }];
  const forward = reconcileGroups(old, twoClusters).kept.map((k) => `${k.id}=${k.group.productIds}`).sort().join(" ");
  const backward = reconcileGroups(old, [...twoClusters].reverse()).kept.map((k) => `${k.id}=${k.group.productIds}`).sort().join(" ");
  check("the same clusters in a different order give the same ids", forward === backward && forward === "g1=a,b g2=c,d");

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
  failures += verifyStoreSections();
  failures += verifyRealFoodList();
  failures += verifySplitKinds();
  failures += verifyFoodTree();
  failures += verifyComparisonGroups();
  failures += verifyStaleProducts();

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
  is("Cápsulas Dolce Gusto Espresso Napoli", "PINGO_DOCE", "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas", "cafe-capsula");
  check(
    "capsules are coffee capsules, compared per capsule since 18 October 2026",
    classifyFoodType("Cápsulas Compatíveis 16un", "PINGO_DOCE",
      "Mercearia/Café, Chá e Bebidas Solúveis/Café em Cápsulas") === "cafe-capsula"
  );

  // A shelf that names several foods says what is NEAR a product, not what it
  // is. Taking the first food named filed 2,271 products wrongly.
  console.log("\n  food types: shelves that name several foods");
  is("Puré de Batata Knorr", "CONTINENTE", "Mercearia/Arroz, Massa e Farinha/Puré", null);
  // (Nectarines have their own kind since 17 October 2026; flat peaches do not.)
  is("Paraguaio Continente", "CONTINENTE", "Frescos/Frutas/Pêssego, Ameixa e Kiwi", null);
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
  is("CÁPSULAS DOLCE GUSTO BUONDI 64 UN", "AUCHAN", cafeShelf, "cafe-capsula");
  is("CÁPSULAS TORRIÉ CAFÉ COM LEITE SOLÚVEL DOLCE GUSTO 16UN", "AUCHAN", cafeShelf, "cafe-capsula");
  is("Cápsulas de Galão", "PINGO_DOCE", "Café, Chá e Achocolatados/Capsulas de Cafe", "cafe-capsula");
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
    "alimentação/mercearia/café,-chá-e-infusão/café-de-máquina,-grão-e-pastilhas", "cafe-capsula");
  check("roasted barley is not coffee, though Delta also sells coffee",
    classifyFoodType("CEVADA DELTA TORRADA MOÍDA 220 G", "AUCHAN",
      "alimentação/mercearia/café,-chá-e-infusão/café-saco,-solúvel-e-cevadas") !== "cafe");
  is("TABLETE LINDT EXCELLENCE 70% 100G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados", "chocolate");
  is("Chouriça Tradicional Prisca", "CONTINENTE", "Frescos/Charcutaria/Chouriço e Morcela", "chourico");

  // Five foods whose cheapest product was not that food (17 October 2026).
  const codShelf = "Frescos/Peixaria/Bacalhau";
  check("pollock on the cod shelf is not cod",
    classifyFoodType("Paloco do Pacífico Desfiado Seco Continente", "CONTINENTE", codShelf) !== "bacalhau");
  check("nor are cod heads, the cheapest 'cod' at EUR 5.99/kg",
    classifyFoodType("Caras de Bacalhau Seco Continente", "CONTINENTE", codShelf) !== "bacalhau");
  check("nor tongues and cheeks",
    classifyFoodType("Línguas de Bacalhau Ultracongelado Lugrade", "CONTINENTE", codShelf) !== "bacalhau" &&
    classifyFoodType("BOCHECHAS BACALHAU RIBERALVES 400G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco") !== "bacalhau");
  check("and a cod head on the general fish shelf is not 'other fish' either",
    classifyFoodType("BACALHAU CABEÇA KG", "AUCHAN", "produtos-frescos/peixaria/peixe-fresco") === null);
  is("Lombos de Bacalhau Graúdo Continente", "CONTINENTE", codShelf, "bacalhau");
  // Undecided since pollock got a kind of its own (20 October 2026): this shelf
  // now names two foods. Three pollock products on it were filed as cod before.
  is("LOMBOS RIBERALVES 4M CURA UNIDOSE MSC 240G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco", null);
  is("PALOCO RIBERALVES PACIFICO DESFIADO MSC 400G", "AUCHAN", "congelados/peixe/bacalhau-e-paloco", "paloco");
  const smoked = "Frescos/Charcutaria/Bacon e Fumados";
  check("a smoked ham hock on the bacon shelf is not bacon",
    classifyFoodType("Pernil Fumado Primor", "CONTINENTE", smoked) !== "bacon");
  is("Bacon Fumado Fatiado Continente", "CONTINENTE", smoked, "bacon");
  is("Barriga Fumada Forno a Lenha Prisca", "CONTINENTE", smoked, "bacon");
  is("PANCETTA AUCHAN 12 FATIAS 100G", "AUCHAN", "produtos-frescos/charcutaria/chouriço,-bacon-e-fumados", "bacon");
  const spices = "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas";
  is("Caril em Frasco Continente", "CONTINENTE", spices, "caril");
  check("a curry dish is not the spice",
    classifyFoodType("Caril de Lentilhas Bonduelle", "CONTINENTE", "Mercearia/Conservas/Cogumelos, Milho, Ervilha") !== "caril");
  check("nor is paprika on the curry shelf",
    classifyFoodType("COLORAU-PIMENTÃO AUCHAN DOCE 100G", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/caril-e-especiarias") !== "caril");
  check("nor a curry paste, cheaper per kilo than the powder",
    classifyFoodType("CARIL SHARWOOD'S PASTA SUAVE 295G", "AUCHAN", "alimentação/sabores-do-mundo/cozinha-indiana") !== "caril");
  check("and a shrimp curry meal is not 'other fish'",
    classifyFoodType("Caril Thai de Camarão O Passe", "CONTINENTE", "Congelados/Refeições/Peixe") === null);
  const easter = "Páscoa/Amendoas";
  check("chocolate almonds are not almonds",
    classifyFoodType("Amêndoas de Chocolate Negro", "PINGO_DOCE", easter) !== "amendoa");
  check("nor are sugared almonds, and they are not chocolate either",
    classifyFoodType("Amêndoas Tipo Francês Bem Me Quer", "CONTINENTE", "Mercearia/Chocolate, Gomas e Rebuçados/Chocolates") === null);
  check("nor sugared pine nuts that reached the almond shelf",
    classifyFoodType("Confeitos de Pinhão", "PINGO_DOCE", easter) !== "amendoa");
  is("Amêndoa com Pele Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes", "amendoa");
  is("Amêndoas com Mel e Sal Marinho", "PINGO_DOCE", "Mercearia/Batatas Fritas Snacks e Frutos Secos", "amendoa");
  check("chocolate hazelnuts are not hazelnuts",
    classifyFoodType("Avelãs Cobertas com Chocolate de Leite", "PINGO_DOCE", easter) !== "avela");
  is("Miolo de Avelã Torrada Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes", "avela");

  // Powders are not chocolate bars, and a two-food shelf must not appear by accident.
  const chocShelf = "alimentação/mercearia/chocolates-e-achocolatados/achocolatados";
  is("ACHOCOLATADO NESQUIK SACO 1KG", "AUCHAN", chocShelf, "achocolatado");
  is("Bebida de Chocolate Solúvel Cola Cao", "CONTINENTE", "Mercearia/Café, Chá e Solúveis/Chocolate Solúvel", "achocolatado");
  is("Cacau Magro em Pó Continente Equilíbrio", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Cacau e Chocolates de Culinária", "cacau");
  is("PREPARADO LACASA CHOCOLATE QUENTE 350G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados/achocolatados", "achocolatado");
  check("a bakery pastry is not chocolate",
    classifyFoodType("Supremas de Chocolate Da Nossa Pastelaria", "CONTINENTE", "Mercearia/Chocolate, Gomas e Rebuçados/Chocolates") !== "chocolate");
  is("Barrinhas de Chocolate Kinder", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Chocolates e Guloseimas/Tabletes de Chocolate", "chocolate");
  is("CHOCOLATE NEGRO AUCHAN 70% CACAU E COM BAIXO TEOR DE AÇÚCAR 100G", "AUCHAN",
    "alimentação/mercearia/chocolates-e-achocolatados/tablete-de-chocolate", "chocolate");
  // Ready meals are dishes, not the ingredients on the same shelf.
  const quick = "alimentação/sabores-do-mundo/cozinha-brasileira/preparados-e-refeições-rápidas";
  check("cornmeal is not a ready meal", classifyFoodType("FUBÁ MIMOSO DA TERRINHA 1KG", "AUCHAN", quick) !== "refeicao");
  check("nor is plain tofu",
    classifyFoodType("Tofu Natural Joya", "CONTINENTE", "Frescos/Refeições Práticas/Vegetariano") !== "refeicao");
  is("BOLONHESA SEITAN NOBRE VEGALIA 420G", "AUCHAN",
    "alimentação/mercearia/refeições,-sopas-e-puré/refeições-pré-preparadas", "refeicao");

  // Same brand and size, different product: the matcher must not confirm these.
  check("lactose-free milk is not regular milk",
    qualifierMismatch("Leite UHT Meio Gordo Mimosa", "LEITE MIMOSA UHT ESPECIAL 0% LACTOSE MEIO GORDO 6X1L") === "lactose");
  check("nor organic against regular",
    qualifierMismatch("Massa Fusilli Rummo", "MASSA RUMMO FUSILLI BIO 500G") === "bio");
  check("but the same words in another order are the same product",
    qualifierMismatch("Leite UHT Meio Gordo Mimosa", "LEITE MIMOSA UHT MEIO GORDO 1L") === null);
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

  // The hand check of a 408-product sample, 20 October 2026: each mistake it
  // found, and each everyday food it found without a kind.
  console.log("\n  food types: the hand check of 20 October 2026");
  const jams = "Mercearia/Compotas Mel e Cremes de Barrar/Compotas e Doces";
  is("Doce de Abóbora com Amêndoa", "PINGO_DOCE", jams, null);
  is("Mel de Rosmaninho", "PINGO_DOCE", jams, "mel");
  is("Coelhos de Chocolate", "PINGO_DOCE", "Páscoa/Chocolates e Bombons", "chocolate");
  is("Azeite de Dende Integral Kidendê", "CONTINENTE", "Mercearia/Azeite, Óleo e Vinagre/Azeite", null);
  is("Milho para Pipocas Continente", "CONTINENTE", "Mercearia/Batatas Fritas e Aperitivos/Pipocas", "pipoca");
  is("Grão Vasco Dão Vinho Tinto", "CONTINENTE", "Bebidas e Garrafeira/Vinhos/Vinho Tinto", "vinho");
  is("LEITE REINA CREME COM BOLACHA 4X125G", "AUCHAN", "alimentação/produtos-lácteos/gelatinas-e-sobremesas/sobremesas-tradicionais", null);
  // cut words on prepared-food shelves
  is("PEITO FRANGO IZIDORO FATIAS FINAS 120G+30G", "AUCHAN", "produtos-frescos/charcutaria/fiambre-de-peru-e-frango", null);
  is("PATANISCAS DE BACALHAU RIBERALVES FORNO (5 UNID) 300G", "AUCHAN", "congelados/refeições-rápidas/salgados-e-petiscos", "refeicao");
  is("CALDEIRADA BACALHAU RIBERALVES MSC 700G", "AUCHAN", "congelados/peixe/preparados-de-peixe", null);
  is("Pernas de Frango Assado", "PINGO_DOCE", "Take Away/Frango Assado e Churrasco", null);
  is("Pedaços de Ananás Cobertos com Chocolate Branco e Coco", "PINGO_DOCE", "Congelados/Gelados e Sobremesas/Gelados Barra Sandwich e Bites", "gelado");
  is("MIX PROTEÍNAS VEGETAIS SHINE BANANA BIO 250G", "AUCHAN", "biológicos-e-alternativas/biológicos/biológicos-alternativas-vegetais/tofu-e-proteínas-vegetais", "tofu");
  is("Foie Gras de Pato Continente Seleção", "CONTINENTE", "Mercearia/Conservas/Patês", null);
  // ...but the raw cuts and smoked salmon are untouched
  is("Bifinhos do Lombo de Porco Finíssimos Continente", "CONTINENTE", "Talho/Porco", "porco");
  is("Lombo de Salmão Fumado Noruega Ubago", "CONTINENTE", "Frescos/Charcutaria/Salmão Fumado", "salmao");
  // shelves that hold "and other things"
  is("MARMELO KG", "AUCHAN", "produtos-frescos/fruta/banana-e-frutos-tropicais", null);
  is("TORRESMOS TI MARIA 60G", "AUCHAN", "alimentação/mercearia/batatas-fritas-e-aperitivos-snacks/aperitivos,-snacks-e-pipocas", null);
  is("CREME LIÉGEOIS AUCHAN CHOCOLATE E NATA 4X115G", "AUCHAN", "alimentação/produtos-lácteos/gelatinas-e-sobremesas/sobremesas-tradicionais", null);
  is("Foie Gras de Pato Capdevila", "CONTINENTE", "Charcutaria e Queijos/Tábuas e Aperitivos", null);
  is("Snack de Chocolate Twix Pack 3", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Chocolates e Guloseimas/Snacks de Chocolate", "chocolate");
  is("SNACK CHOCOLATE KINDER BUENO WHITE 2X5 195 G", "AUCHAN", "alimentação/mercearia/chocolates-e-achocolatados/bombons-e-snacks", "chocolate");
  // everyday foods that had no kind
  const grains = "Mercearia/Arroz, Massa e Farinha/Couscous, Quinoa, Bulgur e Outros";
  is("Couscous Milaneza", "CONTINENTE", grains, "cuscuz");
  is("Mistura Express para Couscous Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", null);
  is("Cominhos Moídos", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Especiarias e Ervas Aromaticas", "cominho");
  is("Oregãos Secos", "PINGO_DOCE", "Frutas e Vegetais/Ervas Aromaticas Frescas", "oregao");
  is("QUIABOS KG", "AUCHAN", "produtos-frescos/legumes/mais-legumes", "quiabo");
  is("Paloco do Pacífico Desfiado Congelado", "PINGO_DOCE", "Peixaria/Bacalhau/Bacalhau Congelado", "paloco");
  is("Filetes de Anchova em Azeite", "PINGO_DOCE", "Mercearia/Conservas/Sardinhas e Outros Peixes", "anchova");
  is("Fuet Extra Continente", "CONTINENTE", "Charcutaria e Queijos/Enchidos/Fuet", "fuet");
  is("PÃO RALADO AUCHAN 240G", "AUCHAN", "alimentação/mercearia/tostas-e-pão-embalado/tostas,-mini-tostas-e-gressinos", "pao-ralado");
  is("Leite Condensado Magro", "PINGO_DOCE", "Mercearia/Sobremesas/Leite Condensado e de Coco", "leite-condensado");
  is("Leite de Coco para Culinária", "PINGO_DOCE", "Mercearia/Sobremesas/Leite Condensado e de Coco", "leite-coco");
  // a coconut yoghurt, decided by its yoghurt shelf - not coconut milk
  is("LEITE COCO FERMENTADO MIMOSA LIQUIDO MORANGO 4X151ML", "AUCHAN", "alimentação/produtos-lácteos/iogurtes/soja-e-vegetais", "iogurte");
  is("ARANDOS SECOS AUCHAN 150 G", "AUCHAN", "produtos-frescos/fruta/frutos-secos-e-sementes", "arando");
  is("Batatas Pré-Fritas Palitos", "PINGO_DOCE", "Congelados/Refeicoes e Salgados/Batatas e Pure", "batata-pre-frita");
  is("Batata para Fritar Embalada", "PINGO_DOCE", "Frutas e Vegetais/Vegetais/Batatas", null);

  // The hand check of a second, fresh sample, 20 October 2026.
  console.log("\n  food types: the second hand check, 20 October 2026");
  const nuts = "Mercearia/Batatas Fritas Snacks e Frutos Secos/Frutos Secos e Desidratados";
  is("Mistura Cajus, Avelãs e Amendoins Torrados", "PINGO_DOCE", nuts, null);
  is("Mix de Frutos Secos Torrados sem Sal", "PINGO_DOCE", nuts, null);
  is("Mix Framboesa e Mirtilo Continente", "CONTINENTE", "Frutas e Legumes/Frutas/Morango e Frutos Vermelhos", null);
  is("Mix Tomate Cherry", "PINGO_DOCE", "Frutas e Vegetais/Vegetais/Tomates Pepinos e Pimentos", "tomate");
  is("Mistura de Pimentas em Grão em Saqueta Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", "pimenta");
  is("Mix Salsichas Frescas de Porco Sabor Lusitano Continente", "CONTINENTE", "Talho/Pronto a Cozinhar", "salsicha");
  is("Entrecosto de Porco com Molho Barbecue Slow Cooked", "PINGO_DOCE", "Talho/Porco", null);
  is("Lombo de Porco Preto Fatiado Continente Seleção", "CONTINENTE", "Charcutaria e Queijos/Enchidos/Paio", "paio");
  is("Cubos de Fiambre", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Fiambre Mortadela e Chouricao", "fiambre");
  is("Feijoada de Cogumelos Brasil", "PINGO_DOCE", "Mercearia/Conservas/Refeicoes Enlatadas", "refeicao");
  is("TIRAS NATURE ADDICTS FRUTA MORANGO 35G", "AUCHAN", "alimentação/mercearia/batatas-fritas-e-aperitivos-snacks/aperitivos,-snacks-e-pipocas", null);
  is("BIFES CEM PORCENTO SOJA MOLHO TOMATE 25OG", "AUCHAN", "biológicos-e-alternativas/alimentação-vegetariana", null);
  is("MOLHO KIKKOMAN SOJA 1L", "AUCHAN", "alimentação/sabores-do-mundo/cozinha-asiática/molhos-e-temperos", "molho-soja");
  is("Massa de Alho", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Outros Molhos e Temperos", null);
  // tomato paste is neither fresh tomato nor pulp: no kind yet
  is("TOMATE DUPLO CONCENTRADO MUTTI TUBO 130G", "AUCHAN", "alimentação/mercearia/polpas,-caldos-e-temperos/polpa-tomate", null);
  is("PÃO LÓ OVAR IGP 500 GR", "AUCHAN", "produtos-frescos/pastelaria/bolos-embalados", "bolo");
  is("Cebola Frita Crocante", "PINGO_DOCE", "Mercearia/Temperos e Molhos/Especiarias e Ervas Aromaticas", null);
  is("AMEIXA D? ELVAS FRASCO 500G", "AUCHAN", "alimentação/mercearia/cremes,-compotas-e-mel/compotas", null);
  is("Paio York Fatiado", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro", null);
  is("Petinga em Azeite Alva", "CONTINENTE", "Mercearia/Conservas/Sardinha, Cavala, Lulas", "sardinha");
  is("Gengibre Moído em Frasco Margão", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Especiarias e Ervas Aromáticas", "gengibre-po");
  is("Gengibre Continente", "CONTINENTE", "Frutas e Legumes/Legumes", "gengibre");

  console.log("\n  food types: sections and honesty");
  check(
    "a matching head in a NON-food section is rejected",
    classifyFoodType("Batata Vermelha", "CONTINENTE", "Casa e Jardim") === null
  );
  check(
    "Pingo Doce drinks are food (the bug that read its whole drinks aisle as zero)",
    isFoodSection("PINGO_DOCE", "Águas, Sumos e Refrigerantes/Aguas") &&
      isFoodSection("PINGO_DOCE", "Vinhos/Vinho Tinto") &&
      isFoodSection("PINGO_DOCE", "Café, Chá e Achocolatados/Capsulas de Cafe")
  );
  // Paths are department-first since the sitemap crawler; a bare shelf name is
  // no section the decisions file knows, so it is left out and reported.
  check(
    "a section the decisions file does not mention is not food",
    !isFoodSection("PINGO_DOCE", "Vinho Tinto") && !isFoodSection("CONTINENTE", "undefined")
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

  // A bottle with no size label: the price over the per-litre figure under it.
  // Strings as they appear on live Continente pages (17 October 2026).
  console.log("\n  page sizes: worked out from the price per litre");
  const fromUnit = (text: string, price: number) => sizeFromUnitPrice(text, price);
  check("a wine at 4,99 with 6,65 per litre is a 0.75 L bottle",
    fromUnit("6,65€/lt", 4.99)?.total === 0.75 && fromUnit("6,65€/lt", 4.99)?.unit === "l");
  check("a cheap wine still rounds to 0.75, not 0.749", fromUnit("4,39€/lt", 3.29)?.total === 0.75);
  check("a half bottle stays 0.375", fromUnit("15,71€/lt", 5.89)?.total === 0.375);
  check("a spirit is 0.7 L", fromUnit("19,27€/lt", 13.49)?.total === 0.7);
  check("a per-kilo figure gives kilos", fromUnit("9,95€/kg", 1.99)?.total === 0.2 && fromUnit("9,95€/kg", 1.99)?.unit === "kg");
  check("a price per capsule is not a size", fromUnit("0,31€/un", 19.99) === null);
  check("nor is a per-litre figure labelled per unit", fromUnit("61,32€/un", 45.99) === null);
  check("and no figure means no size", fromUnit("", 18.68) === null);
  // The store's displayed unit price, saved as shown, in each store's format.
  const shown = (t: string) => JSON.stringify(parseShownUnitPrice(t));
  check("Continente's per-litre line is read", shown("6,65€/lt") === '{"value":6.65,"unit":"l"}');
  check("and its per-capsule line too", shown("0,31€/un") === '{"value":0.31,"unit":"un"}');
  check("Pingo Doce's figure after the size", shown("0.1 Kg | 13,9 €/Kg") === '{"value":13.9,"unit":"kg"}');
  check("Auchan's tile figure, with a decimal point", shown("8.6 €/Kg") === '{"value":8.6,"unit":"kg"}');
  check("a plain price is not a unit price", parseShownUnitPrice("4,99€") === null);

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
    "a dairy drink is NOT swept in - nor, since 17 October 2026, counted as plain milk",
    // A full path, not the bare section: "Laticínios e Ovos" alone tokenises to
    // `ovos` and the fallback answers `ovo`. That is the category fallback
    // being coarse, not the plant-drink rule, and it is why the shelf is only
    // ever consulted last.
    classifyFoodType(
      "Bebida Láctea Infantil 1 a 3 anos",
      "CONTINENTE",
      "Laticínios e Ovos/Leite/Leite Infantil"
    ) === null,
    "widening the rule must not start eating milk"
  );

  return failures - before;
}

/**
 * data/store-sections.ts and the section watch: which products are kept, and
 * what a crawl reports about the store's sections.
 */
function verifyStoreSections(): number {
  const before = failures;
  console.log("\n  store sections");

  check(
    "section names compare without accents, case or punctuation",
    sectionKey("Laticínios e Ovos") === "laticinios-e-ovos" &&
      sectionKey("laticinios-e-ovos") === "laticinios-e-ovos" &&
      sectionKey("viagem,-desporto-e-outdoor") === "viagem-desporto-e-outdoor"
  );
  check(
    "every top section the catalogue holds today is decided, but one broken path",
    ["Frescos/Frutas", "Bio e Saudável", "Marcas/Marcas Continente"].every((p) => sectionOf("CONTINENTE", p).kind !== "unknown") &&
      sectionOf("CONTINENTE", "undefined").kind === "unknown"
  );

  const supplements = sectionOf("CONTINENTE", "Bio e Saudável/Suplementos e Vitaminas/Multivitamínicos");
  check("a skipped sub-section is found below its own level", supplements.skip?.why === "supplements and vitamins");
  check(
    "but its food neighbour in the same section is not skipped",
    sectionOf("CONTINENTE", "Bio e Saudável/Nutrição Desportiva/Barras e Snacks").skip === null
  );
  check(
    "Pingo Doce's unaccented sub-sections match the file's spelling",
    sectionOf("PINGO_DOCE", "Alternativas Alimentares/Suplementos").skip !== null &&
      sectionOf("AUCHAN", "congelados/gelo").skip?.why === "ice"
  );

  check("food in a food section is kept", keepInCatalogue("CONTINENTE", "Mercearia/Conservas", "Atum em Azeite").keep);
  const tv = keepInCatalogue("PINGO_DOCE", "Promoções/Poupe Esta Semana", "TV LG SMART AI FHD 43LR60006LA");
  check("a television in a mixed aisle is left out", !tv.keep && tv.reason === "mixed aisle, not recognised as food");
  check(
    "a recognised food in the same aisle is kept",
    keepInCatalogue("PINGO_DOCE", "Promoções/Poupe Esta Semana", "Queijo Flamengo Fatiado").keep
  );
  const whey = keepInCatalogue("AUCHAN", "biológicos-e-alternativas/nutrição-desportiva/proteína", "PROTEÍNA WHEY 900G");
  check("a protein powder is left out, with the sub-section named", !whey.keep && whey.reason === "skipped sub-section" && /protein powders/.test(whey.detail ?? ""));
  const shampoo = keepInCatalogue("AUCHAN", "beleza-e-higiene/cabelo", "CHAMPÔ");
  check("a non-food section is left out", !shampoo.keep && shampoo.reason === "non-food section");
  const unknown = keepInCatalogue("AUCHAN", "uma-seccao-nova/x", "ARROZ");
  check("an undecided section is left out rather than guessed", !unknown.keep && unknown.reason === "unknown section");

  // --- the section tally -----------------------------------------------------
  const tally = new SectionTally("CONTINENTE");
  tally.add("Mercearia/Conservas/Atum/Em Azeite", "Atum A");
  tally.add("Mercearia/Conservas/Sardinha", "Sardinha B");
  tally.add("Limpeza/Roupa/Detergentes", "Detergente C");
  const paths = tally.entries.map((e) => e.path).sort();
  check(
    "sections are recorded three levels deep at most",
    paths.includes("mercearia/conservas/atum") && !paths.some((p) => p.split("/").length > 3)
  );
  check("a non-food section's sub-sections are not recorded", paths.includes("limpeza") && !paths.includes("limpeza/roupa"));
  const conservas = tally.entries.find((e) => e.path === "mercearia/conservas");
  check("products are counted at every level, with an example", conservas?.products === 2 && conservas.example === "Atum A");
  const listOnly = new SectionTally("CONTINENTE", false);
  listOnly.add("mercearia/conservas");
  check("a list of sections counts no products", listOnly.entries.every((e) => e.products === null));

  // --- comparing with the previous crawl ---------------------------------------
  const t0 = new Date("2026-10-01T00:00:00Z");
  const t1 = new Date("2026-10-02T00:00:00Z");
  const prev = (path: string, at = t1) => ({ path, label: path, depth: path.split("/").length, lastSeenAt: at });
  const seen = (path: string) => ({ path, label: path, depth: path.split("/").length, products: 1, example: "x" });

  const first = compareSections("CONTINENTE", [], [seen("mercearia"), seen("mercearia/nova")], true);
  check("the first crawl calls nothing new", first.firstRun && first.added.length === 0);

  const next = compareSections(
    "CONTINENTE",
    [prev("mercearia"), prev("mercearia/velha"), prev("mercearia/antiga", t0)],
    [seen("mercearia"), seen("mercearia/nova")],
    true
  );
  check("a section not seen before is new, with its section's decision", next.added.length === 1 && next.added[0].kind === "food");
  check(
    "a section the last crawl saw and this one did not has vanished",
    next.vanished.map((v) => v.path).join() === "mercearia/velha",
    "one gone longer ago is not reported again"
  );
  const partial = compareSections("CONTINENTE", [prev("mercearia"), prev("mercearia/velha")], [seen("mercearia")], false);
  check("a partial crawl reports nothing as vanished", partial.vanished.length === 0);

  const undecided = compareSections("AUCHAN", [prev("alimentacao")], [seen("alimentacao"), seen("seccao-nova")], true);
  check("an undecided top section is reported", undecided.undecided.map((s) => s.path).join() === "seccao-nova");
  check("and makes the report WARN", sectionProblems(undecided).some((p) => p.includes("not decided")));
  check(
    "a new non-food section is listed but does not WARN",
    sectionProblems(compareSections("CONTINENTE", [prev("limpeza")], [seen("limpeza"), seen("animais")], true)).length === 0
  );

  const leftOut = new LeftOutTally();
  leftOut.add(tv, "TV", "Promoções/Poupe Esta Semana");
  leftOut.add(shampoo, "CHAMPÔ", "beleza-e-higiene/cabelo");
  check("what was left out is counted, but not the non-food sections", leftOut.total === 1);

  check(
    "Continente's category sitemap is read at every depth",
    parseCategoryPaths(
      "<loc>https://www.continente.pt/mercearia/</loc><loc>https://www.continente.pt/mercearia/conservas/</loc><loc>https://www.continente.pt/</loc>"
    ).join() === "mercearia,mercearia/conservas"
  );
  check(
    "a Pingo Doce address gives a readable example name",
    nameFromUrl("https://www.pingodoce.pt/home/produtos/mercearia/conservas/atum-em-azeite-893466.html") === "atum em azeite"
  );

  return failures - before;
}

/** The real-food list of 17 October 2026: misfilings fixed, new kinds, eggs per egg. */
function verifyRealFoodList(): number {
  const before = failures;
  console.log("\n  the real-food list");
  const c = (name: string, store: string, path: string) => classifyFoodType(name, store, path);

  check(
    "a shelf two levels up does not decide: Pingo Doce's fuet is not cheese",
    c("Fuet Extra", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro") !== "queijo" &&
      c("Lombo Fatiado Curado", "PINGO_DOCE", "Charcutaria e Queijos/Charcutaria/Outros Enchidos e Fumeiro") === null
  );
  check(
    "an avocado on the grapes shelf is an avocado",
    c("Abacate Hass Continente", "CONTINENTE", "Frescos/Frutas/Uvas e Tropicais") === "abacate"
  );
  check(
    "a name-only kind is never decided by its shelf: a lime is not an orange",
    c("Lima Continente", "CONTINENTE", "Frescos/Frutas/Laranja, Clementina e Limão") === null
  );
  check(
    "courgettes are not beans",
    c("Curgete Verde Continente", "CONTINENTE", "Frescos/Legumes/Curgete, Beringela e Feijão Verde") === "curgete"
  );
  check(
    "green beans have their own kind",
    c("Feijão Verde", "PINGO_DOCE", "Frutas e Vegetais/Vegetais") === "feijao-verde" &&
      c("Feijão Encarnado Cozido", "PINGO_DOCE", "Mercearia/Arroz Massa e Leguminosas") === "feijao"
  );
  check(
    "Pingo Doce's lactose-free \"Bebida de Leite\" is milk",
    c("Bebida de Leite UHT Livre Meio Gordo", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") === "leite"
  );
  check(
    "chocolate milk and coconut milk are not milk",
    c("Leite Achocolatado", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") === null &&
      // a kind of its own since 20 October 2026
      c("Leite de Coco Ayam", "CONTINENTE", "Mercearia/Açúcar e Sobremesas/Leite Condensado e Leite de Coco") === "leite-coco"
  );
  check(
    "walnut kernels reach walnuts through the plural",
    c("Miolo de Nozes Metades Continente", "CONTINENTE", "Frescos/Frutas/Frutos Secos, Desidratados e Sementes") === "noz"
  );
  check(
    "oat flakes are oats, and cornflakes are not sweetcorn",
    c("Flocos de Aveia Finos", "PINGO_DOCE", "Mercearia") === "aveia" &&
      c("Flocos de Milho Cobertos com Chocolate", "PINGO_DOCE", "Mercearia") !== "milho"
  );
  check(
    "a cereal bar is not a breakfast cereal",
    c("Barras de Cereais com Chocolate", "PINGO_DOCE", "Bolachas, Cereais e Guloseimas/Cereais Barras e Bolsas de Fruta/Barras de Cereais") === null
  );
  check(
    "egg white and quail eggs are not eggs",
    c("Clara de Ovo Pasteurizada Continente", "CONTINENTE", "Laticínios e Ovos/Ovos") === null &&
      c("Ovos de Codorniz", "PINGO_DOCE", "Ovos") === null &&
      c("Ovos de Solo Classe M", "PINGO_DOCE", "Ovos") === "ovo"
  );

  check(
    "an egg count is read from the name",
    eggCountFromName("OVOS GALINHAS SOLO AUCHAN CLASSE M 12UN") === 12 &&
      eggCountFromName("OVOS POLEGAR CLASSE M MEIA DÚZIA") === 6 &&
      eggCountFromName("OVOS SABOROSOS CLASSE M 2 DUZIAS") === 24 &&
      eggCountFromName("OVOS SABOROSOS CLASSE L UMA DÚZIA") === 12 &&
      eggCountFromName("Ovos de Solo Classe M") === null
  );
  check(
    "or from the store's price per egg, though rounded to the cent",
    eggCountFromUnitPrice(2.99, 0.25, "un") === 12 && eggCountFromUnitPrice(1.79, 0.3, "un") === 6
  );
  check(
    "a per-kilo figure gives no count",
    eggCountFromUnitPrice(2.99, 0.25, "kg") === null && eggCountFromUnitPrice(null, 0.25, "un") === null
  );
  const egg = (store: string, price: number, count: number) =>
    ({ storeProductId: `e-${store}`, store, name: "Ovos", brand: null, price, packageSize: count, unit: "un" });
  check("eggs are compared per egg", comparable(egg("CONTINENTE", 2.99, 12), "ovo") && unitsFor("ovo", []).join() === "un");
  check("a box counted in eggs never enters a per-kilo ranking", !comparable(egg("CONTINENTE", 2.99, 12), "batata"));

  const hidden = new Set(FOOD_TYPES.filter((t) => t.hidden).map((t) => t.id));
  check(
    "sweets and drinks are set aside, everyday food is not",
    ["chocolate", "bolacha", "gelado", "vinho", "cerveja", "refrigerante"].every((id) => hidden.has(id)) &&
      ["leite", "agua", "cafe", "acucar", "pao", "ovo"].every((id) => !hidden.has(id))
  );

  return failures - before;
}

/** The kinds that used to hold several foods, split on 17 October 2026. */
function verifySplitKinds(): number {
  const before = failures;
  console.log("\n  kinds that held several foods, split");
  const c = (name: string, store = "PINGO_DOCE", path = "Mercearia") => classifyFoodType(name, store, path);

  check("a scabbardfish steak is scabbardfish", c("Posta de Peixe Espada Preto Fresco", "PINGO_DOCE", "Peixaria/Peixe") === "peixe-espada");
  check("a grouper head is not grouper", c("Cabeça de Garoupa Fresca", "PINGO_DOCE", "Peixaria/Peixe") === null);
  check("an unnamed fish has no kind now", c("Cachucho Fresco", "PINGO_DOCE", "Peixaria/Peixe") === null);
  check("a fillet goes to its fish", c("Filetes de Pescada do Cabo Congelados") === "pescada" && c("Filetes de Atum em Azeite") === "atum");
  // Since 18 October 2026 tinned and fresh fish are one kind each, kept apart by
  // the label "lata" rather than by separate kinds.
  const tin = (kind: string, name: string) => labelsOf(kind, name).includes("lata");
  check(
    "tinned and fresh fish are one kind, told apart by the label",
    c("Atum ao Natural Bom Petisco 120 (84) G") === "atum" && tin("atum", "Atum ao Natural Bom Petisco 120 (84) G") &&
      c("Bife de Atum Fresco") === "atum" && !tin("atum", "Bife de Atum Fresco") &&
      c("CAVALA KG", "AUCHAN", "produtos-frescos/peixaria") === "cavala" && tin("cavala", "Filetes de Cavala em Azeite")
  );
  check(
    "a tinned squid is squid, labelled tinned",
    c("Lulas em Molho Americano") === "lula" && tin("lula", "Lulas em Molho Americano") &&
      !tin("lula", "LULA COSTA FRESCA INTEIRA KG")
  );
  check(
    "piri-piri sauce and dried piri-piri are different kinds, and a bottle saying neither has none",
    c("Molho Piri-Piri Extra Forte") === "piri-piri" && c("Piri-piri Moído") === "piri-piri-seco" &&
      c("PIRI-PIRI GALLO 50ML") === null
  );
  check(
    "tinned fish written without \"em\", or with a drained weight, is tinned",
    tin("cavala", "Filetes Cavala Óleo Vegetal") && tin("cavala", "FILETE CAVALA PITEU EM MOSTARDA 120G") &&
      tin("sardinha", "SARDINHA AUCHAN COLLECTION SEM PELE E SEM ESPINHA (85)120G")
  );
  check("smoked fish is labelled smoked", labelsOf("sardinha", "SARDINHA FUMADA FILETE REAL 100 GR").includes("fumado"));
  check("a cow's foot is not beef", c("MÃO DE BOVINO CONGELADO KG", "AUCHAN", "produtos-frescos/talho") === null);
  check("breaded fillets are a kind of their own", c("Filetes de Pescada Panados com Limão Congelados") === "filete-panado");
  check("but breaded CHICKEN is not a fish fillet", c("Panado de Frango", "PINGO_DOCE", "Talho/Aves") !== "filete-panado");
  check(
    "the packing is not the food",
    // anchovies have been a kind since 20 October 2026; the point is that it is not oil
    c("Filetes de Anchova em Óleo") === "anchova" && c("Filetes Recheados com Tomate e Mozzarella") === null
  );
  check(
    "everyday sauces have kinds of their own",
    c("Molho de Soja") === "molho-soja" && c("Molho Pesto Alla Genovese") === "pesto" &&
      c("Molho Béchamel") === "bechamel" && c("Molho Piri-Piri Extra Forte") === "piri-piri"
  );
  check("other sauces have no kind", c("Molho Caesar") === null);
  check("seeds are compared seed by seed", c("Sementes de Chia") === "chia" && c("Sementes de Girassol") === "girassol");
  check("a seed mix has no kind", c("Mistura de Sementes") === null);
  check(
    "a bag of leaves and a ready-made salad are different kinds",
    c("Salada Camponesa Embalada", "PINGO_DOCE", "Frutas e Vegetais/Vegetais") === "salada-folhas" &&
      c("Salada de Massa e Atum", "PINGO_DOCE", "Take Away") === "salada-pronta"
  );
  check("codfish cakes are not pastel de nata", c("Pastéis de Bacalhau Congelados") === "pastel-bacalhau" && c("Pastel de Nata") === "pastel-nata");
  check("tomato pulp is its own kind", c("Polpa de Tomate") === "polpa-tomate" && c("Passata de Tomate Mutti") === "polpa-tomate");
  check("beef offal is not beef, but coração de alcatra is", c("Rim de Bovino Embalado", "PINGO_DOCE", "Talho") === null &&
    c("Bife do Coração de Alcatra de Vitela", "CONTINENTE", "Frescos/Talho") === "vitela");
  check("Caldo Verde is a soup, not a stock", c("Caldo Verde Continente") !== "caldo");
  check("salt flakes are salt", c("Flor de Sal Marnoto", "CONTINENTE", "Mercearia/Molhos, Temperos e Sal/Sal") === "sal");
  check(
    "dried herbs on the salt-and-herbs shelf are not salt",
    c("TOMILHO PICADO AUCHAN DESIDRATADO", "AUCHAN", "alimentação/mercearia/sal,-ervas-e-temperos/ervas-aromáticas") === null
  );
  return failures - before;
}

/** The food tree of 18 October 2026: categories, sub-kinds, labels, and the kinds it changed. */
function verifyFoodTree(): number {
  const before = failures;
  console.log("\n  the food tree");
  const c = (name: string, store = "PINGO_DOCE", path = "Mercearia") => classifyFoodType(name, store, path);

  check("the tree is sound: every kind on the site in exactly one category", treeProblems().length === 0, treeProblems().join("; "));
  check("a kind's category follows from the kind", categoryOf("frango")?.id === "carne" && categoryOf("coentros")?.id === "temperos");
  check("a set-aside kind has no category yet, only where it will go", categoryOf("chocolate") === null && laterCategoryOf("vinho") === "Bebidas");

  check("chicken breast is peito, wings are asa", subKindOf("frango", "Peito de Frango Embalado") === "peito" && subKindOf("frango", "ASAS DE FRANGO KG") === "asa");
  check("semi-skimmed milk is not read as whole milk", subKindOf("leite", "Leite UHT Meio Gordo Mimosa") === "meio-gordo");
  check("basmati and risotto rice", subKindOf("arroz", "Arroz Basmati Cigala") === "basmati" && subKindOf("arroz", "Arroz Arbório para Risotto") === "risotto");
  check("a name matching no sub-kind has none", subKindOf("frango", "Frango para Churrasco Embalado") === null);
  check("a kind with no sub-kinds gives none", subKindOf("banana", "Banana da Madeira") === null);

  check("frozen and organic are labels, and can come together", labelsOf("ervilha", "Ervilhas Biológicas Congeladas").join() === "congelado,bio");
  check("tuna in olive oil is tinned", labelsOf("atum", "Atum em Azeite Bom Petisco").includes("lata"));
  check("olive oil is not tinned, though it says azeite", !labelsOf("azeite", "Azeite Virgem Extra Gallo").includes("lata"));
  check("nuts are not dried fruit by the word secos", !labelsOf("noz", "Miolo de Noz Frutos Secos").includes("seco"));
  check("porco preto is a label on pork and charcutaria", labelsOf("porco", "Lombo de Porco Preto").includes("porco-preto") &&
    labelsOf("chourico", "Chouriço de Porco Preto").includes("porco-preto") && !labelsOf("pao", "Pão Alentejano").includes("porco-preto"));
  check("Pingo Doce's \"Livre\" milk is lactose-free", labelsOf("leite", "Bebida de Leite UHT Livre Meio Gordo").includes("sem-lactose"));

  check("clementines and tangerines are different kinds", c("CLEMENTINA KG", "AUCHAN", "produtos-frescos/fruta") === "clementina" &&
    c("Mandarina Embalada", "PINGO_DOCE", "Frutas e Vegetais/Frutas") === "tangerina");
  check("a product sold as both is neither", c("Clementina/Mandarina Continente", "CONTINENTE", "Frescos/Frutas") === null);
  check("veal and beef are different kinds", c("Lombo de Vitelão", "PINGO_DOCE", "Talho") === "vitela" &&
    c("Maminha de Novilho", "PINGO_DOCE", "Talho") === "vaca" && c("Picanha de Bovino Europa", "PINGO_DOCE", "Talho") === "vaca");
  check("lamb and kid goat are different kinds", c("Perna de Borrego", "PINGO_DOCE", "Talho") === "borrego" &&
    c("Quartos de Cabrito Balcão Continente", "CONTINENTE", "Frescos/Talho") === "cabrito");
  check("cured shoulder is ham, fresh shoulder is pork", c("PALETA DE PORCO PRETO MONTARAZ 70 G", "AUCHAN", "produtos-frescos/charcutaria") === "presunto" &&
    c("Paleta de Porco", "PINGO_DOCE", "Talho/Porco") === "porco");
  check("Leite Creme is not milk", c("Leite Creme", "PINGO_DOCE", "Leite e Bebidas Vegetais/Leite") !== "leite");
  check("tonic water is set aside with the drinks", c("Água Tónica Schweppes", "CONTINENTE", "Bebidas e Garrafeira/Água") === "agua-sabor");
  check("ravioli is pasta, a filled wrap is not a flatbread", c("Ravioli 4 Queijos") === "massa" && c("Wrap de Atum") !== "tortilha" &&
    c("Wraps de Trigo Integral") === "tortilha");
  check("capsules are counted: 40UN, 10 cápsulas, x16", capsuleCountFromName("CÁPSULAS DELTA Q PACK XL 40UN") === 40 &&
    capsuleCountFromName("Café 10 Cápsulas Nespresso") === 10 && capsuleCountFromName("Pastilhas x16") === 16 &&
    capsuleCountFromName("Cápsulas de Café Intenso Int 13 Continente") === null);
  check("each pack's count comes from the right rule", itemCount("ovo", "OVOS M 12UN", 2.99, null, null) === 12 &&
    itemCount("cafe-capsula", "CAPSULAS DOLCE GUSTO ROBUSTO 30 UN", 10.49, null, null) === 30 && itemCount("arroz", "Arroz 1kg", 1, null, null) === null);

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
  check("two chains are enough to show a group", shownGroups(groups).length === 3 && MIN_CHAINS === 2);
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
  return failures - before;
}
