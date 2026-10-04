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
  listedSize: { packageSize: number | null; unit: "kg" | "l" | null };
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
 * not a change.
 */
export function storeErrorStatus(entry: StoreError, stored: StoredState | null): StoreErrorStatus {
  if (stored === null || stored.delisted) return { kind: "gone" };
  const a = entry.listedSize.packageSize;
  const b = stored.packageSize;
  const sameSize = a === null || b === null ? a === b : Math.abs(a - b) <= 1e-6 * Math.max(a, b);
  if (sameSize && (a === null || entry.listedSize.unit === stored.unit)) return { kind: "unchanged" };
  return { kind: "changed", was: sizeText(entry.listedSize), now: sizeText(stored) };
}

export const RECHECK_AFTER_DAYS = 30;

export const STORE_ERRORS: StoreError[] = [
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
    evidence: 'price 0.99 €, name "1UN", Auchan\'s per-kilo figure 1.32 €/Kg on its listing tile',
    checkedOn: "2026-10-04",
    listedSize: { packageSize: 0.75, unit: "kg" },
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
];

const KEYS = new Set(STORE_ERRORS.map((e) => `${e.store}:${e.storeProductId}`));

/** Is this product's data known to be wrong at the store? */
export function isStoreError(store: string, storeProductId: string): boolean {
  return KEYS.has(`${store}:${storeProductId}`);
}
