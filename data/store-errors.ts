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
  },
  {
    store: "CONTINENTE",
    storeProductId: "8844800",
    name: "Cápsulas de Café Crema e Gusto Int 12 Lavazza",
    problem: "Read as 8 capsules from the page's 1,25 €/un at 9,99 €; the box is 30 capsules (Auchan, same barcode).",
    evidence: '"1,25 €/un" beside a price of 9,99 €; barcode 8000070053823 is "30 UN" at Auchan',
    checkedOn: "2026-10-29",
    listedSize: { packageSize: 8, unit: "un" },
  },
  {
    store: "PINGO_DOCE",
    storeProductId: "988950",
    name: "Bolachas Crackers Sabor a Tomate (Gran Pavesi)",
    problem: "The page gives the pack as 3.36 kg; a pack of crackers weighs a few hundred grams.",
    evidence: '"3.36 Kg | 1,19 €/Kg" in the size label, beside a price of 3,99 €',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 3.36, unit: "kg" },
  },
  {
    store: "PINGO_DOCE",
    storeProductId: "1004958",
    name: "Bolachas Mini Animals Pack 5 (Milka)",
    problem:
      "The page gives five small bags of Milka biscuits as 0.995 kg, which at 1.79 € would make them about the " +
      "cheapest biscuits per kilo in the country; most likely 99.5 g, with the decimal point one place off.",
    evidence: '"0.995 Kg | 1,8 €/Kg" in the size label, beside a price of 1,79 €',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 0.995, unit: "kg" },
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
  },
  {
    store: "AUCHAN",
    storeProductId: "3949703",
    name: "POTA PEDAÇOS AUCHAN EM MOLHO AMERICANO 115 (72) G",
    problem:
      "Auchan's per-kilo figure implies 719 g for a tin the name gives as 115 g (72 g drained): ten times too much.",
    evidence: 'price 1.59 €, name "115 (72) G", Auchan\'s per-kilo figure 2.21 €/Kg on its listing tile',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 0.719, unit: "kg" },
  },
  {
    store: "AUCHAN",
    storeProductId: "3949811",
    name: "POTA PEDAÇOS AUCHAN EM TINTA 115 (72) G",
    problem:
      "Auchan's per-kilo figure implies 719 g for a tin the name gives as 115 g (72 g drained): ten times too much.",
    evidence: 'price 1.69 €, name "115 (72) G", Auchan\'s per-kilo figure 2.35 €/Kg on its listing tile',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 0.719, unit: "kg" },
  },
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
