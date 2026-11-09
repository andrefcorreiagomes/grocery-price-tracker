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
  forSaleNow,
  comparableStoreCount,
  namedGroup,
  ownBrandPerStore,
  unitsFor,
  type ComparableProduct,
} from "../lib/comparison";
import { euros } from "../lib/money";
import { packLine, sizeLabel, storeLink } from "../lib/pack";
import {
  answerProblem,
  changesBetween,
  emptyMemory,
  factsFor,
  FIRST_READING_PACE,
  identityOf,
  MAX_ANSWER_CHARS,
  MAX_ANSWERS_BYTES,
  MAX_FIELD_CHARS,
  maxAnswerLines,
  overLimit,
  parseProposalNumbers,
  QUESTIONS,
  REREADS_PER_DAY,
  selectRows,
  takeInAnswers,
  type Answer,
  type Memory,
  type ReviewRow,
  type SentRow,
  type StoreEntry,
  type Verdict,
  type Missing,
} from "../lib/comparison-review";
import { COMMENT_MAX, DAILY_LIMIT, ReportLimiter, validateReport, VISITOR_LIMIT, visitorKey } from "../lib/error-reports";
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
  // Out of stock (the owner's rule, 1 November 2026): the price is kept and the
  // product marked, and the comparisons leave it out (forSaleNow).
  const soldOut = { ...p("CONTINENTE", "Batata Vermelha", 2.25, 3), unavailableAt: new Date() };
  check("an out-of-stock product keeps its price in the row", soldOut.price === 2.25);
  check("but the comparisons see none", forSaleNow(soldOut).price === null && forSaleNow({ ...soldOut, unavailableAt: null }).price === 2.25);
  const withSoldOut = cheapestPerStore([forSaleNow(soldOut), ...rows.slice(1).map((r) => forSaleNow({ ...r, unavailableAt: null }))], "batata");
  check("so it is not the cheapest: the next one in stock is",
    withSoldOut.get("CONTINENTE")!.kind === "price" && Math.abs((withSoldOut.get("CONTINENTE") as { unitPrice: number }).unitPrice - 2) < 1e-9);
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

  // The pack line and the store link under each product (src/lib/pack.ts).
  const sizes = [sizeLabel(0.5, "kg"), sizeLabel(0.0995, "kg"), sizeLabel(1.5, "kg"), sizeLabel(0.33, "l"), sizeLabel(6, "l"), sizeLabel(12, "un"), sizeLabel(0.3 * 1.0000000001, "kg")];
  check("sizes read as a shopper reads them", sizes.join() === "500 g,99.5 g,1.5 kg,330 ml,6 L,12 un,300 g", sizes.join());
  check("an unknown size or unit gives no size", sizeLabel(null, "kg") === null && sizeLabel(0.5, null) === null && sizeLabel(0, "kg") === null);
  const pk = (price: number | null, packageSize: number | null, unit: string | null, per: string) => packLine({ price, packageSize, unit }, per);
  check("a pack shows its price and size", pk(7.99, 5, "kg", "kg") === "7.99 € · 5 kg" && pk(2.99, 12, "un", "un") === "2.99 € · 12 un", String(pk(7.99, 5, "kg", "kg")));
  check("1 kg or 1 L compared in that unit shows no line (loose or a 1 kg bag look alike)",
    pk(1.69, 1, "kg", "kg") === null && pk(0.89, 1, "l", "l") === null && pk(0.99, 0.5, "kg", "l") === "0.99 € · 500 g");
  check("no known size says only the price; no price says nothing", pk(2.99, null, null, "un") === "preço: 2.99 €" && pk(null, 0.5, "kg", "kg") === null);
  check("store links: the three stores' own sites over https only",
    storeLink("https://www.continente.pt/produto/x-123.html") !== null &&
      storeLink("https://www.pingodoce.pt/home/produtos/x-1.html") !== null &&
      storeLink("https://www.auchan.pt/pt/x/1.html") !== null &&
      storeLink("javascript:alert(1)") === null &&
      storeLink("http://www.continente.pt/produto/x.html") === null &&
      storeLink("https://www.continente.pt.evil.example/x") === null &&
      storeLink("https://evil.example/?https://www.auchan.pt/") === null &&
      storeLink(undefined) === null);

  // "Reportar um erro": everything a visitor sends is untrusted (src/lib/error-reports.ts).
  const reportForm = (fields: Record<string, string>) => {
    const f = new FormData();
    for (const [k, v] of Object.entries({ foodType: "arroz", comparison: "risotto||kg", store: "AUCHAN", reason: "preco", comment: "", ...fields })) f.set(k, v);
    return validateReport(f, new Date(Date.UTC(2026, 10, 4, 12)));
  };
  const accepted = (fields: Record<string, string>) => "report" in reportForm(fields);
  check("a normal report is accepted, with the whole comparison or one store", accepted({}) && accepted({ store: "" }) && accepted({ comment: "O arroz é de 500 g, não 1 kg." }));
  check("only the listed stores and reasons are accepted",
    !accepted({ store: "LIDL" }) && !accepted({ store: "auchan" }) && !accepted({ reason: "spam" }) && !accepted({ reason: "" }) && !accepted({ reason: "__proto__" }) && !accepted({ reason: "toString" }));
  check("a comparison or food type that is not plain words is refused",
    !accepted({ foodType: "../dev.db" }) && !accepted({ foodType: "" }) && !accepted({ comparison: "x\n{\"fake\":1}" }) && !accepted({ comparison: "<script>" }) && !accepted({ comparison: "a".repeat(161) }));
  check(`a comment over ${COMMENT_MAX} characters is refused, one of exactly ${COMMENT_MAX} is not`,
    !accepted({ comment: "a".repeat(COMMENT_MAX + 1) }) && accepted({ comment: "é".repeat(COMMENT_MAX) }));
  const cleaned = reportForm({ comment: "  linha 1\r\n\r\n\r\n\r\nlinha​ 2\u0000\u001b[31m‮  " });
  check("a comment keeps its words and line breaks, loses control and invisible characters",
    "report" in cleaned && cleaned.report.comment === "linha 1\n\nlinha 2[31m", "report" in cleaned ? JSON.stringify(cleaned.report.comment) : "refused");
  const attack = reportForm({ comment: "x'); DROP TABLE CatalogueProduct; --\n{\"at\":\"fake\"}" });
  check("text that looks like a database command or a second report stays one line of plain data",
    "report" in attack && !JSON.stringify(attack.report).includes("\n") && JSON.parse(JSON.stringify(attack.report)).comment.includes("DROP TABLE"));
  const limiter = new ReportLimiter();
  const t0 = new Date(Date.UTC(2026, 10, 4, 12));
  const later = (min: number) => new Date(t0.getTime() + min * 60_000);
  const firstFive = [0, 1, 2, 3, 4].map((i) => limiter.allow("visitor-a", later(i)));
  check(`a visitor may send ${VISITOR_LIMIT} reports an hour, not one more; another visitor is not affected; an hour later again`,
    firstFive.every(Boolean) && !limiter.allow("visitor-a", later(5)) && limiter.allow("visitor-b", later(5)) && limiter.allow("visitor-a", later(61)));
  const flood = new ReportLimiter();
  let sent = 0;
  for (let i = 0; i < DAILY_LIMIT + 50; i++) if (flood.allow(`v${i}`, later(i % 50))) sent++;
  check(`at most ${DAILY_LIMIT} reports a day in all, however many visitors`, sent === DAILY_LIMIT, String(sent));
  check("a visitor's address is never kept, only an anonymous hash that changes each day",
    visitorKey("203.0.113.7", t0) !== visitorKey("203.0.113.7", later(24 * 60)) && !visitorKey("203.0.113.7", t0).includes("203"));

  // The daily AI review of the comparisons (src/lib/comparison-review.ts).
  const entry = (store: string, price: number, more: Partial<StoreEntry> = {}): StoreEntry => ({
    store, id: `${store}-1`, name: `Arroz ${store}`, brand: null, size: 5, unit: "kg", price, perUnit: price / 5,
    promotion: false, regularPrice: null, promoEndsAt: null, shelf: "Mercearia/Arroz", barcode: "560", url: null, ...more,
  });
  const reviewRow = (n: number, auchan = 5.99): ReviewRow => ({
    id: `r${n}`, foodType: "arroz", foodLabel: "Arroz", comparison: `C${n}`, comparisonKey: `c${n}`, rowType: "cheapest",
    stores: [entry("AUCHAN", auchan), entry("CONTINENTE", 7.99)], flags: [],
  });
  const manyRows = (n: number) => Array.from({ length: n }, (_, i) => reviewRow(i));
  const noOrder = (id: string) => id;
  const first = () => 0;
  const readAll = (m: Memory, rows: ReviewRow[], on: string) => {
    for (const r of rows) m.rows[r.id] = { contents: r.stores, readOn: on, conclusion: { verdict: "fine" }, rereadRound: 0 };
  };
  const idsOf = (s: { row: ReviewRow }[]) => s.map((x) => x.row.id);
  const whyCount = (s: { why: string }[], why: string) => s.filter((x) => x.why === why).length;

  check("nothing differs, no change; a new price, even by a cent, is a change, with before and after",
    changesBetween(reviewRow(1).stores, reviewRow(1).stores).length === 0 &&
      changesBetween(reviewRow(1).stores, reviewRow(1, 6).stores).some((c) => c.store === "AUCHAN" && c.field === "price" && c.before === 5.99 && c.after === 6));
  check("another product, a new shelf, or a store leaving the row are changes too",
    changesBetween(reviewRow(1).stores, [entry("AUCHAN", 5.99, { id: "other" }), entry("CONTINENTE", 7.99)]).some((c) => c.field === "id") &&
      changesBetween(reviewRow(1).stores, [entry("AUCHAN", 5.99, { shelf: "Outra" }), entry("CONTINENTE", 7.99)]).some((c) => c.field === "shelf") &&
      changesBetween(reviewRow(1).stores, [entry("CONTINENTE", 7.99)]).some((c) => c.store === "AUCHAN" && c.field === "in the row"));

  const startMemory = emptyMemory();
  const dayOne = selectRows(manyRows(1000), startMemory, "2026-11-16", noOrder, first);
  check(`the first reading sends ${FIRST_READING_PACE} rows a day, and is not yet done`, dayOne.length === FIRST_READING_PACE && !startMemory.firstReadingDone && whyCount(dayOne, "first reading") === FIRST_READING_PACE);
  const sameDayAgain = selectRows(manyRows(1000), emptyMemory(), "2026-11-17", noOrder, first);
  check("unanswered rows come first again, in the same order", idsOf(dayOne).join() === idsOf(sameDayAgain).join());

  const midFirst = emptyMemory();
  readAll(midFirst, manyRows(10), "2026-11-16");
  const changedMidFirst = selectRows([...manyRows(1000).slice(0, 10).map((r) => reviewRow(Number(r.id.slice(1)), 6.49)), ...manyRows(1000).slice(10)], midFirst, "2026-11-17", noOrder, first);
  check("during the first reading a changed row is read as well, on top of the 300",
    whyCount(changedMidFirst, "changed") === 10 && whyCount(changedMidFirst, "first reading") === FIRST_READING_PACE && whyCount(changedMidFirst, "read again") === 0);

  const endFirst = emptyMemory();
  readAll(endFirst, manyRows(800), "2026-11-20");
  const lastBatch = selectRows(manyRows(1000), endFirst, "2026-11-21", noOrder, first);
  check("the last rows of the first reading finish it, with no row read again on that day",
    endFirst.firstReadingDone && whyCount(lastBatch, "first reading") === 200 && whyCount(lastBatch, "read again") === 0);

  const reread = (readOn: string, today = "2026-12-10") => {
    const m = emptyMemory();
    m.firstReadingDone = true;
    readAll(m, manyRows(200), readOn);
    return selectRows(manyRows(200), m, today, noOrder, first);
  };
  check(`${REREADS_PER_DAY} rows are read again a day, and none is sent twice`,
    whyCount(reread("2026-12-01"), "read again") === REREADS_PER_DAY && new Set(idsOf(reread("2026-12-01"))).size === REREADS_PER_DAY);
  check("a row read in the last 2 days cannot be read again: read Monday, not Monday, Tuesday or Wednesday, but Thursday",
    whyCount(reread("2026-12-07", "2026-12-07"), "read again") === 0 && whyCount(reread("2026-12-07", "2026-12-08"), "read again") === 0 &&
      whyCount(reread("2026-12-07", "2026-12-09"), "read again") === 0 && whyCount(reread("2026-12-07", "2026-12-10"), "read again") === REREADS_PER_DAY);
  const justChanged = emptyMemory();
  justChanged.firstReadingDone = true;
  readAll(justChanged, manyRows(2), "2026-12-09"); // r0, r1 read yesterday because of a change
  for (const r of manyRows(100).slice(2)) justChanged.rows[r.id] = { contents: r.stores, readOn: "2026-12-01", conclusion: { verdict: "fine" }, rereadRound: 0 };
  const noRecent = selectRows(manyRows(100), justChanged, "2026-12-10", noOrder, first);
  check("a row the AI just read because it changed is not among the rows read again",
    !idsOf(noRecent).includes("r0") && !idsOf(noRecent).includes("r1") && whyCount(noRecent, "read again") === REREADS_PER_DAY);

  const round = emptyMemory();
  round.firstReadingDone = true;
  readAll(round, manyRows(100), "2026-11-20");
  const drawnFirst = selectRows(manyRows(100), round, "2026-12-01", noOrder, first);
  for (const s of drawnFirst) round.rows[s.row.id] = { ...round.rows[s.row.id], readOn: "2026-12-01", rereadRound: round.rereadRound };
  const drawnNext = selectRows(manyRows(100), round, "2026-12-04", noOrder, first);
  check("a row is not drawn again until the others have had their turn",
    idsOf(drawnNext).filter((id) => !idsOf(drawnFirst).includes(id)).length === 25);
  const quiet = emptyMemory();
  quiet.firstReadingDone = true;
  readAll(quiet, manyRows(100), "2026-12-09");
  selectRows(manyRows(100), quiet, "2026-12-10", noOrder, first);
  check("a day with nothing to read again does not start a new round of turns", quiet.rereadRound === 1);

  const answerOf = (rowId: string, more: Partial<Answer> = {}): Answer => ({
    rowId, verdict: "fine",
    questions: Object.fromEntries(QUESTIONS.map((q) => [q, { answer: "yes", evidence: "same barcode 560" }])) as Answer["questions"],
    ...more,
  });
  check("a bare \"fine\" is not an answer: each question needs an answer and its evidence",
    answerProblem(answerOf("r1"), false) === null &&
      answerProblem({ rowId: "r1", verdict: "fine" } as Answer, false) !== null &&
      answerProblem(answerOf("r1", { questions: { ...answerOf("r1").questions, priceFitsPack: { answer: "yes", evidence: "" } } }), false) !== null &&
      answerProblem(answerOf("r1", { verdict: "ok" as Verdict }), false) !== null);
  check("a problem needs its cause, evidence, fix, sureness and number; a page check says what to look at; a report needs its answer",
    answerProblem(answerOf("r1", { verdict: "problem" }), false) !== null &&
      answerProblem(answerOf("r1", { verdict: "problem", cause: "size misread", evidence: "name says 500 g", fix: "correct the size", sure: "sure", proposal: 1 }), false) === null &&
      answerProblem(answerOf("r1", { verdict: "needs_page" }), false) !== null &&
      answerProblem(answerOf("r1"), true) !== null && answerProblem(answerOf("r1", { reportAnswer: "price confirmed by the data" }), true) === null);

  const taken = emptyMemory();
  taken.pendingReports = [{ at: "t1", foodType: "arroz", comparison: "c3", store: "", reason: "preco", comment: "x" }];
  const sentRows: SentRow[] = [
    { row: reviewRow(1), why: "first reading" },
    { row: reviewRow(2), why: "first reading" },
    { row: reviewRow(3), why: "visitor report", reports: taken.pendingReports },
    { row: reviewRow(4), why: "first reading" },
  ];
  const takenStats = takeInAnswers(taken, "2026-11-16", sentRows, [
    answerOf("r1"),
    { rowId: "r2", verdict: "fine" } as Answer,
    answerOf("r3", { reportAnswer: "the price is the store's" }),
    answerOf("not-sent"),
  ]);
  check("an accepted answer is remembered with the row's contents; a rejected, foreign or missing one leaves the row unread",
    taken.rows.r1?.conclusion.verdict === "fine" && taken.rows.r1.contents[0].price === 5.99 && taken.rows.r1.readOn === "2026-11-16" &&
      !taken.rows.r2 && !taken.rows.r4 && takenStats.answered === 2 && takenStats.rejected === 2, JSON.stringify(takenStats));
  check("an answered visitor's report is finished; an unanswered one stays", taken.pendingReports.length === 0);

  const again = emptyMemory();
  readAll(again, [reviewRow(1), reviewRow(2)], "2026-11-20");
  const againStats = takeInAnswers(again, "2026-12-01",
    [{ row: reviewRow(1), why: "read again" }, { row: reviewRow(2), why: "read again" }],
    [answerOf("r1"), answerOf("r2", { verdict: "needs_page", pageToCheck: "the pack size", missing: "store page" })]);
  check("reading a row again counts disagreement with its earlier conclusion", againStats.rereadsAnswered === 2 && againStats.rereadsDisagreeing === 1);
  check("a page check must say what would have settled it, and that is counted (the owner, 8 November 2026)",
    answerProblem(answerOf("r1", { verdict: "needs_page", pageToCheck: "the size" }), false) !== null &&
      answerProblem(answerOf("r1", { verdict: "needs_page", pageToCheck: "the size", missing: "a guess" as Missing }), false) !== null &&
      againStats.needsPageMissing["store page"] === 1 && againStats.needsPageMissing["price history"] === 0 && again.rows.r2.conclusion.missing === "store page");

  const refused = emptyMemory();
  readAll(refused, [reviewRow(1)], "2026-11-20");
  refused.rows.r1.owner = { answer: "no", on: "2026-11-21", identity: identityOf(reviewRow(1).stores) };
  takeInAnswers(refused, "2026-12-01", [{ row: reviewRow(1, 6.49), why: "changed" }], [answerOf("r1")]);
  const keptRefusal = refused.rows.r1.owner?.answer === "no";
  const otherProduct: ReviewRow = { ...reviewRow(1), stores: [entry("AUCHAN", 5.99, { id: "other" }), entry("CONTINENTE", 7.99)] };
  takeInAnswers(refused, "2026-12-02", [{ row: otherProduct, why: "changed" }], [answerOf("r1")]);
  check("the owner's refusal survives a change of price, and ends when the products change", keptRefusal && refused.rows.r1.owner === undefined);

  const oldAnswer = emptyMemory();
  readAll(oldAnswer, [reviewRow(1, 6.49)], "2026-12-05");
  takeInAnswers(oldAnswer, "2026-12-01", [{ row: reviewRow(1), why: "changed" }], [answerOf("r1")]);
  check("a late answer never moves a row back", oldAnswer.rows.r1.readOn === "2026-12-05" && oldAnswer.rows.r1.contents[0].price === 6.49);

  // The size limits on what comes back from the AI's repository (the owner, 9 November 2026).
  const limited = emptyMemory();
  const longText = "x".repeat(MAX_FIELD_CHARS + 1);
  const limitedStats = takeInAnswers(limited, "2026-11-16", [{ row: reviewRow(1), why: "first reading" }, { row: reviewRow(2), why: "first reading" }], [
    answerOf("r1", { evidence: longText }),
    answerOf("r2", { questions: { ...answerOf("r2").questions, sameProduct: { answer: "yes", evidence: longText } } }),
  ]);
  check("an answer with a text over 2,000 characters, at any depth, is refused and counted; the row stays unread",
    limitedStats.overLimit === 2 && limitedStats.rejected === 2 && limitedStats.answered === 0 && !limited.rows.r1 && !limited.rows.r2, JSON.stringify(limitedStats));
  const manyFields = answerOf("r1", Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`extra${i}`, "y".repeat(1_500)])) as Partial<Answer>);
  check("an answer over 20,000 characters in all is refused, even with each text short; an honest answer passes",
    overLimit(manyFields) && !overLimit(answerOf("r1", { evidence: "y".repeat(MAX_FIELD_CHARS) })) && MAX_ANSWER_CHARS === 20_000);
  check("the whole answer file is refused over 10 MB; more than twice the rows sent, plus 20, raises the alarm",
    MAX_ANSWERS_BYTES === 10_000_000 && maxAnswerLines(300) === 620);

  const rice = factsFor(entry("AUCHAN", 6.49), entry("AUCHAN", 5.99), { low: 5.49, high: 6.49 });
  const ended = factsFor(entry("AUCHAN", 1.99), entry("AUCHAN", 1.49, { promotion: true, regularPrice: 1.99 }), undefined);
  const otherFacts = factsFor(entry("AUCHAN", 2, { id: "other" }), entry("AUCHAN", 1), undefined);
  check("the facts: the change in percent, the price per kilo worked out, a promotion ending, the history; no percent across different products",
    rice.priceChangePercent === 8.3 && rice.perUnitRecalculated === 1.3 && rice.historyLowest === 5.49 && rice.promotion === "off" && ended.promotion === "ended" && otherFacts.priceChangePercent === null,
    JSON.stringify(rice));
  check("the owner's answer: lists and ranges of numbers", parseProposalNumbers("1-3, 7").join() === "1,2,3,7");

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
    quality: { total: 10370, missingPrice: 2974, outOfStock: 2974, missingBrand: 0, missingCategory: 0, missingUrl: 0 },
    catalogue: { seen: 0, newProducts: 0, disappeared: 0, stillMissing: 0, returned: 0, moved: 0, renamed: 0, samples: { newProducts: [], disappeared: [], returned: [], moved: [], renamed: [] } },
    prices: { opened: 0, changed: 0, unchanged: 0, skipped: 0, movers: [], absurd: [] },
    categories: { published: 0, crawled: 25, unknown: [], missing: [], publishedCountChanges: [], sitemapSlugs: 0, sitemapUnknown: [] },
    live: { candidatePairsAffected: 0 },
    drift: [],
    pingoDoce: night,
  }, { explain: false });
  check("the report shows the sitemap and pages section", pdReport.includes("Sitemap and product pages") && pdReport.includes("16,128 address(es) in 2 file(s)"));
  check("the report shows products leaving", pdReport.includes("delisted this run (third night): 202"));
  // Every store's report: no price shown, and out of stock (1 November 2026).
  check("missing prices and out of stock are told apart",
    pdReport.includes("missing price 2974 (listed with no price shown), marked out of stock 2974 (price kept where shown)"));
  check("no category audit, so no Categories section", !pdReport.includes("## Categories") && !pdReport.includes("sitemap cross-check"));
  return failures - before;
}
