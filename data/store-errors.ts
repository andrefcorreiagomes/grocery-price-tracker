/**
 * Products whose STORE publishes data that cannot be true.
 *
 * Not our parsing errors - those are fixed in the readers. These are products
 * where we read the store's page correctly and the page itself is wrong, so no
 * reading rule can help. Left alone, such a product competes for "cheapest" with
 * an impossible price per kilo.
 *
 * A listed product is not deleted and its price is still recorded. It simply
 * cannot take part in a price-per-kilo comparison: the page shows its store as
 * "sold, size unknown", the state it already uses when a size is missing.
 *
 * Each entry is a judgement about ONE product, kept here so every judgement is
 * visible, with its evidence and the date it was checked. A rule like "too cheap,
 * so hide it" was the alternative and was rejected: it would also hide genuine
 * bargains, such as beef kidney at EUR 1.97/kg.
 *
 * Stores correct their data. `npm run validate:comparisons` lists these entries
 * after every crawl and flags two things, so none outlives its error:
 *
 *   - CHANGED: the store's size is no longer the one judged wrong. Look now.
 *   - RE-CHECK DUE: unchanged, but not looked at for RECHECK_AFTER_DAYS.
 *
 * Looking means reading the product's page, which is a request to the store and
 * is done by hand, never automatically. Removing an entry is a person's
 * decision too.
 *
 * CONFIRMED SIZES (the owner's decision, 31 October 2026). Where the store's
 * own pages prove the true size - not where we only guess it - an entry may
 * carry `trueSize`. The product then takes part in comparisons at that size
 * instead of sitting out, but only while the store's listing still looks as it
 * did when the size was confirmed (`confirmedSize`); the moment it does not,
 * the product sits out again and the nightly check says so. The price is never
 * replaced: it is still the store's price of the night.
 */

export interface StoreError {
  store: "CONTINENTE" | "PINGO_DOCE" | "AUCHAN";
  /** the store's own product id, as in CatalogueProduct.storeProductId */
  storeProductId: string;
  name: string;
  /** what is wrong, in one sentence */
  problem: string;
  /** the store's own text that shows it */
  evidence: string;
  /** when the store's page was last looked at, YYYY-MM-DD */
  checkedOn: string;
  /**
   * The size the store showed when the entry was made - the value a person
   * judged wrong. The program cannot tell a right size from a wrong one; it can
   * tell when the store's size CHANGES, which every crawl re-reads. A change is
   * the cue to look again now rather than when the re-check falls due.
   */
  listedSize: { packageSize: number | null; unit: "kg" | "l" | "un" | null };
  /** The true size, proven by the store's own pages; see CONFIRMED SIZES above. */
  trueSize?: TrueSize;
}

export interface TrueSize {
  packageSize: number;
  unit: "kg" | "l" | "un";
  /**
   * What must still be true each night for the size to be used:
   *
   *   "store-figure"       the store's own price per kilo (or litre) still gives
   *                        this size: price / figure, within 1%. A strong check,
   *                        made against the store's data every night.
   *   "listing-unchanged"  the name, the store's size and the store's per-unit
   *                        figure look as they did (`listedFigure`). Weaker: a
   *                        change the listing does not show - a crab sold at a
   *                        fixed price instead of by the kilo, with the same
   *                        tile - is only caught when the page is looked at again.
   */
  holdsWhile: "store-figure" | "listing-unchanged";
  /** for "listing-unchanged": the unit of the store's figure, and whether it equalled the price */
  listedFigure?: { unit: "kg" | "l" | "un"; equalsPrice: boolean };
  /**
   * Where the proof is another store selling the same barcode at this size (31
   * October 2026): that product. The nightly check (`sameBarcodeProblem`) says
   * CONFIRMED SIZE NO LONGER HOLDS when it stops bearing the size out, for a
   * person to look; the comparison itself rests on `holdsWhile`.
   */
  sameBarcodeAt?: { store: StoreError["store"]; storeProductId: string };
}

/** What the latest crawl stored for a product, as far as the same-barcode check needs it. */
export interface BarcodeListing {
  ean: string | null;
  price: number | null;
  packageSize: number | null;
  unit: string | null;
  delisted: boolean;
}

/** How far apart the two stores' prices may be before the barcode no longer vouches for the size. */
export const SAME_BARCODE_PRICE_RATIO = 1.5;

/**
 * Why the other store's product no longer vouches for the true size, or null
 * while it does: still on sale, still the same barcode, still that size (within
 * 1%), and a price within SAME_BARCODE_PRICE_RATIO of this one - a much dearer
 * or cheaper pack would suggest a different size after all.
 */
export function sameBarcodeProblem(entry: StoreError, here: BarcodeListing | null, there: BarcodeListing | null): string | null {
  const t = entry.trueSize;
  const at = t?.sameBarcodeAt;
  if (!t || !at) return null;
  const where = `${at.store} ${at.storeProductId}`;
  if (!here || here.ean === null) return `this product's barcode is no longer known`;
  if (!there || there.delisted) return `${where} is no longer on sale`;
  if (there.ean !== here.ean) return `${where} no longer has the same barcode`;
  if (there.unit !== t.unit || there.packageSize === null || Math.abs(there.packageSize - t.packageSize) > 0.01 * t.packageSize) {
    return `${where} now shows ${sizeText(there)}`;
  }
  if (here.price !== null && there.price !== null) {
    const ratio = Math.max(here.price, there.price) / Math.min(here.price, there.price);
    if (ratio > SAME_BARCODE_PRICE_RATIO) return `${where} costs ${there.price} €, against ${here.price} € here`;
  }
  return null;
}

/** What the latest crawl stored for a product, as far as a confirmed size needs it. */
export interface ListingNow {
  name: string;
  price: number | null;
  packageSize: number | null;
  unit: string | null;
  shownUnitPrice?: number | null;
  shownUnitPriceUnit?: string | null;
}

/** What the latest crawl stored for a listed product. */
export interface StoredState {
  packageSize: number | null;
  unit: string | null;
  delisted: boolean;
}

export type StoreErrorStatus =
  | { kind: "unchanged" }
  | { kind: "changed"; was: string; now: string }
  | { kind: "gone" };

const sizeText = (s: { packageSize: number | null; unit: string | null }) =>
  s.packageSize === null ? "no size" : `${Number(s.packageSize.toPrecision(6))} ${s.unit ?? "?"}`;

/**
 * Has the store's data moved since the entry was made? `stored` is null when
 * the product is not in the catalogue at all. Sizes are compared as numbers,
 * not text: arithmetic stores 30 x 30 g as 0.8999999999999999 kg, which is
 * not a change. Nor is half a percent: a size worked out from a price and the
 * store's rounded per-kilo figure moves with every price change (the Bollycao
 * croissant went 0.75, 0.751, 0.75 kg, 22-30 October 2026); a store fixing
 * its data moves it tenfold.
 */
export function storeErrorStatus(entry: StoreError, stored: StoredState | null): StoreErrorStatus {
  if (stored === null || stored.delisted) return { kind: "gone" };
  const a = entry.listedSize.packageSize;
  const b = stored.packageSize;
  const sameSize = a === null || b === null ? a === b : Math.abs(a - b) <= 0.005 * Math.max(a, b);
  if (sameSize && (a === null || entry.listedSize.unit === stored.unit)) return { kind: "unchanged" };
  return { kind: "changed", was: sizeText(entry.listedSize), now: sizeText(stored) };
}

/**
 * The entry's true size, if what the store shows now still bears it out; null
 * when the entry has none or it no longer holds. Null is the safe answer: the
 * product sits out of comparisons, as every store error did before.
 */
export function confirmedSize(
  entry: StoreError,
  now: ListingNow
): { packageSize: number; unit: "kg" | "l" | "un" } | null {
  const t = entry.trueSize;
  if (!t || now.price === null || !(now.price > 0)) return null;
  const figure = now.shownUnitPrice ?? null;
  const size = { packageSize: t.packageSize, unit: t.unit };

  if (t.holdsWhile === "store-figure") {
    if (figure === null || !(figure > 0) || now.shownUnitPriceUnit !== t.unit) return null;
    return Math.abs(now.price / figure - t.packageSize) <= 0.01 * t.packageSize ? size : null;
  }

  const was = t.listedFigure;
  if (!was || now.name !== entry.name) return null;
  if (storeErrorStatus(entry, { packageSize: now.packageSize, unit: now.unit, delisted: false }).kind !== "unchanged") return null;
  if (figure === null || now.shownUnitPriceUnit !== was.unit) return null;
  return (Math.abs(figure - now.price) <= 0.005) === was.equalsPrice ? size : null;
}

export const RECHECK_AFTER_DAYS = 30;

export const STORE_ERRORS: StoreError[] = [
  // Continente's per-item figure for these two Lavazza boxes is per BOX of
  // capsules, not per capsule, so the count worked out from it is wrong: the
  // same barcode is Auchan's "60UN" and "30 UN". Found by the comparison check
  // of 29 October 2026, from stored data (no page opened).
  {
    store: "CONTINENTE",
    storeProductId: "8844842",
    name: "Cápsulas de Café Qualitá Oro Int 8 Lavazza",
    problem: "Read as 4 capsules from the page's 4,85 €/un at 19,39 €; the box is 60 capsules (Auchan, same barcode).",
    evidence: '"4,85 €/un" beside a price of 19,39 €; barcode 8000070084735 is "60UN" at Auchan',
    checkedOn: "2026-10-29",
    listedSize: { packageSize: 4, unit: "un" },
    trueSize: {
      packageSize: 60, unit: "un", holdsWhile: "listing-unchanged",
      listedFigure: { unit: "un", equalsPrice: false },
      sameBarcodeAt: { store: "AUCHAN", storeProductId: "4029984" },
    },
  },
  {
    store: "CONTINENTE",
    storeProductId: "8844800",
    name: "Cápsulas de Café Crema e Gusto Int 12 Lavazza",
    problem: "Read as 8 capsules from the page's 1,25 €/un at 9,99 €; the box is 30 capsules (Auchan, same barcode).",
    evidence: '"1,25 €/un" beside a price of 9,99 €; barcode 8000070053823 is "30 UN" at Auchan',
    checkedOn: "2026-10-29",
    listedSize: { packageSize: 8, unit: "un" },
    trueSize: {
      packageSize: 30, unit: "un", holdsWhile: "listing-unchanged",
      listedFigure: { unit: "un", equalsPrice: false },
      sameBarcodeAt: { store: "AUCHAN", storeProductId: "4030046" },
    },
  },
  // Continente's "Leite Meio Gordo Bio Prado Verde" (8168224) was listed here on
  // 31 October 2026: out of stock, its page showed one carton's price for the
  // pack of six. Taken off the same day, the owner's decision: the page reader
  // now gives an out-of-stock product no price, so it sits out by itself and
  // is compared again once back in stock. Back in stock on 9 November 2026 with
  // the same fault, so listed again. No true size: either the price or the size
  // is wrong and the page does not say which, and our estimate is never shown
  // (the owner's decision, 9 November 2026, assumption 8.28).
  {
    store: "CONTINENTE",
    storeProductId: "8168224",
    name: "Leite Meio Gordo Bio Prado Verde",
    problem: "In stock at one carton's price for the pack of six: 1,29 € for 6 litres, 0,22 €/l. Our highest price for it is 7,74 €.",
    evidence: '"emb. 6 x 1 lt" beside a price of 1,29 € (page read 9 November 2026); Auchan sells the 1 l carton of the same milk at 1,00 €',
    checkedOn: "2026-11-09",
    listedSize: { packageSize: 6, unit: "l" },
  },
  // Two Auchan products sold by the kilo or by the piece where its listing tile
  // cannot tell which, sized from their own pages (the AI trial, 9 November 2026).
  {
    store: "AUCHAN",
    storeProductId: "3554673",
    name: "QUEIJO OVELHA HERDADE DA MAIA CURADO 1/4 UN",
    problem: "A quarter of a cheese, sold by the piece at 6,75 €, but its price is labelled \"€/Kg\", so it read as 1 kg at 6,75 €/kg; at its true 225 g it is 30 €/kg.",
    evidence: 'Its page: "6.75 €/Kg" beside "6,75 €", sold by the unit (data-purchased-by-unit="true"), "Peso líquido escorrido 225 g"',
    checkedOn: "2026-11-09",
    listedSize: { packageSize: 1, unit: "kg" },
    trueSize: { packageSize: 0.225, unit: "kg", holdsWhile: "listing-unchanged", listedFigure: { unit: "kg", equalsPrice: true } },
  },
  {
    store: "AUCHAN",
    storeProductId: "234185",
    name: "COCO FRESCO KG",
    problem: "Sold by the kilo, but its tile shows the same 3,29 € per item and per price, so no size was read and it sat out of the comparison.",
    evidence: 'Its page: "Quant. Mínima = 1Kg (1 un) 3.29 €/un 3,29 €/Kg"',
    checkedOn: "2026-11-09",
    listedSize: { packageSize: null, unit: null },
    trueSize: { packageSize: 1, unit: "kg", holdsWhile: "listing-unchanged", listedFigure: { unit: "un", equalsPrice: true } },
  },
  {
    store: "PINGO_DOCE",
    storeProductId: "988950",
    // The name exactly as Pingo Doce lists it: a confirmed size holds only
    // while it is unchanged. The brand is Gran Pavesi.
    name: "Bolachas Crackers Sabor a Tomate",
    problem: "The page gives the pack as 3.36 kg - exactly 12 x 280 g, a case of twelve; a pack of crackers is 280 g.",
    evidence:
      '"3.36 Kg | 1,19 €/Kg" in the size label, beside a price of 3,99 € (2,79 € and 0,83 €/Kg on 31 Oct); ' +
      "no barcode on the page. Continente (8139766) and Auchan (3868082) sell Gran Pavesi tomato crackers as 280 g at 3,99 €",
    checkedOn: "2026-10-31",
    listedSize: { packageSize: 3.36, unit: "kg" },
    // Proven by the same name and price at the other two stores, Pingo Doce
    // showing no barcode: enough proof, the owner's decision of 31 October
    // 2026, for the AI review to re-check now and then.
    trueSize: { packageSize: 0.28, unit: "kg", holdsWhile: "listing-unchanged", listedFigure: { unit: "kg", equalsPrice: false } },
  },
  {
    store: "PINGO_DOCE",
    storeProductId: "1004958",
    // As Pingo Doce lists it; the brand is Milka.
    name: "Bolachas Mini Animals Pack 5",
    problem:
      "The page gives five small bags of Milka biscuits as 0.995 kg, which at 1.79 € would make them about the " +
      "cheapest biscuits per kilo in the country; they are 99.5 g, with the decimal point one place off.",
    evidence:
      '"0.995 Kg | 1,8 €/Kg" in the size label, beside a price of 1,79 € (the same on 31 Oct); no barcode on the page. ' +
      'Continente (8787933) sells Milka Mini Animals as 99.5 g at the same 1,79 €, Auchan (4009007) as "99.5G"',
    checkedOn: "2026-10-31",
    listedSize: { packageSize: 0.995, unit: "kg" },
    // Proven as the crackers above: the owner's decision, 31 October 2026.
    trueSize: { packageSize: 0.0995, unit: "kg", holdsWhile: "listing-unchanged", listedFigure: { unit: "kg", equalsPrice: false } },
  },
  {
    store: "AUCHAN",
    storeProductId: "3739748",
    name: "SNACK NESTLÉ EXTRAFINO 30X30G",
    problem:
      "The store contradicts itself: the name says 30 x 30 g (900 g) and Auchan's own figure implies 300 g; " +
      "at EUR 1.10 either would be chocolate at a few euros a kilo, so the price is most likely for one 30 g bar.",
    evidence: 'price 1.10 €, name "30X30G", Auchan\'s per-kilo figure "3.67 €/Kg" on its product page',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 0.9, unit: "kg" },
    // Continente sells the same barcode (8445291111165) as one 30 g bar, at the same 1.10 €.
    trueSize: {
      packageSize: 0.03, unit: "kg", holdsWhile: "listing-unchanged",
      listedFigure: { unit: "kg", equalsPrice: false },
      sameBarcodeAt: { store: "CONTINENTE", storeProductId: "8005509" },
    },
  },
  {
    store: "AUCHAN",
    storeProductId: "4068801",
    name: "CROISSANTS BOLLYCAO RECHEIO CACAU E AVELÃ 1UN",
    problem:
      "Auchan's per-kilo figure implies 750 g for one croissant; a Bollycao weighs about 75 g, so the figure is " +
      "ten times too small - a price per 100 g labelled per kilo.",
    // Re-checked 22 October 2026: the price rose to 1.45 €, and the size worked
    // out from Auchan's own figure moved from 0.75 to 0.751 kg - rounding, the
    // same error.
    evidence: 'price 0.99 € (1.45 € on 22 Oct), name "1UN", Auchan\'s per-kilo figure 1.32 €/Kg on its listing tile',
    checkedOn: "2026-10-22",
    listedSize: { packageSize: 0.751, unit: "kg" },
    // Continente sells the same barcode (5601028125420) as 75 g, at the same 0.99 €.
    trueSize: {
      packageSize: 0.075, unit: "kg", holdsWhile: "listing-unchanged",
      listedFigure: { unit: "kg", equalsPrice: false },
      sameBarcodeAt: { store: "CONTINENTE", storeProductId: "8952813" },
    },
  },
  // Two Auchan squid tins (3949703, 3949811, "115 (72) G") were listed here
  // from 4 to 31 October 2026: Auchan's per-kilo figure made them 719 g. Since
  // the full-weight rule for tins (29 October) the size is read from the name,
  // and they are compared correctly; taken off on 31 October 2026, the
  // owner's decision. (115 g then; 72 g drained since tinned fish is compared
  // by its drained weight, the same day.)
  {
    store: "AUCHAN",
    storeProductId: "4083257",
    name: "POSTAS BACALHAU RIBERALVES ED. ESPECIAL NATAL 15KG",
    problem: "The name says 15 kg; Auchan's own per-kilo figure makes it 1.5 kg, so it read as 4.36 €/kg, the cheapest frozen cod steaks.",
    evidence: '"43.59 €/Kg" beside "65,39 €" on the product page (65.39 / 43.59 = 1.5 kg)',
    checkedOn: "2026-10-30",
    listedSize: { packageSize: 15, unit: "kg" },
    // Auchan's own per-kilo figure is read every night, so the 1.5 kg is
    // checked against the store every night.
    trueSize: { packageSize: 1.5, unit: "kg", holdsWhile: "store-figure" },
  },
  {
    store: "AUCHAN",
    storeProductId: "2967517",
    name: "SAPATEIRA UNIDADE 450G",
    problem: "The name says 450 g, but the crab is sold by the kilo at 15.99 €/kg; read as 35.53 €/kg.",
    evidence: '"Quant. Mínima = 1Kg (1 un)", "15.99 €/un", "15,99 € /Kg" on the product page',
    checkedOn: "2026-10-30",
    listedSize: { packageSize: 0.45, unit: "kg" },
    // The price is per kilo, so the size is 1 kg. The listing tile shows only
    // a per-item figure equal to the price, which cannot confirm that: the
    // weaker check, until the page is looked at again.
    trueSize: {
      packageSize: 1, unit: "kg", holdsWhile: "listing-unchanged",
      listedFigure: { unit: "un", equalsPrice: true },
    },
  },
];

const BY_KEY = new Map(STORE_ERRORS.map((e) => [`${e.store}:${e.storeProductId}`, e]));

/** Is this product's data known to be wrong at the store? */
export function isStoreError(store: string, storeProductId: string): boolean {
  return BY_KEY.has(`${store}:${storeProductId}`);
}

/**
 * The row with its confirmed true size in place of the store's, marked
 * `sizeConfirmed` so the comparison lets it take part; any other row unchanged.
 * Applied where rows are read for comparing, so the database keeps exactly what
 * the store showed.
 */
export function withConfirmedSize<T extends ListingNow & { store: string; storeProductId: string }>(
  row: T
): T & { sizeConfirmed?: boolean } {
  const entry = BY_KEY.get(`${row.store}:${row.storeProductId}`);
  const size = entry ? confirmedSize(entry, row) : null;
  return size ? { ...row, ...size, sizeConfirmed: true } : row;
}

/**
 * Two products that share a barcode but are not the same product: one store
 * published the wrong barcode. The matching step (src/scripts/match-products.ts)
 * never confirms such a pair, so the site never shows them as one product.
 * Each pair is a person's judgement from the stores' own pages.
 */
export interface NeverSameProduct {
  a: { store: StoreError["store"]; storeProductId: string; name: string };
  b: { store: StoreError["store"]; storeProductId: string; name: string };
  evidence: string;
  checkedOn: string;
}

export const NEVER_SAME_PRODUCT: NeverSameProduct[] = [
  {
    a: { store: "AUCHAN", storeProductId: "2662598", name: "FIAMBRE PERNA EXTRA ELPOZO DUROC 120G" },
    b: { store: "CONTINENTE", storeProductId: "8083233", name: "Fiambre de Peito de Peru Fatiado ElPozo" },
    evidence: 'Both carry barcode 8410843131335. Auchan\'s page: "Perna de porco com pele (92%)", pork leg ham; Continente\'s: turkey breast. Found by the AI trial.',
    checkedOn: "2026-11-09",
  },
];

const NEVER_PAIRS = new Set(
  NEVER_SAME_PRODUCT.flatMap(({ a, b }) => [`${a.store}|${a.storeProductId}|${b.store}|${b.storeProductId}`, `${b.store}|${b.storeProductId}|${a.store}|${a.storeProductId}`])
);

/** Whether two products are listed above as different despite one barcode. */
export function isNeverSameProduct(a: { store: string; storeProductId: string }, b: { store: string; storeProductId: string }): boolean {
  return NEVER_PAIRS.has(`${a.store}|${a.storeProductId}|${b.store}|${b.storeProductId}`);
}
