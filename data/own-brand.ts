/**
 * Products with an empty brand that are NOT the store's own.
 *
 * A product with no brand counts as the store's own (src/lib/candidates.ts,
 * isOwnBrand): Auchan leaves the brand empty on about 1,267 products, mostly
 * loose fresh food from its own counters, and for those that is right. A few
 * name their maker instead, and in the own-brand row they were compared with
 * the other chains' own labels. Each is listed here by hand, with its reason
 * (the owner's approval of the AI trial's proposals, 9 November 2026).
 */
export interface NotOwnBrand {
  store: "CONTINENTE" | "PINGO_DOCE" | "AUCHAN";
  /** the store's own product id */
  storeProductId: string;
  /** the name when listed, for a person reading this file */
  name: string;
  why: string;
}

export const NOT_OWN_BRAND: NotOwnBrand[] = [
  { store: "AUCHAN", storeProductId: "3916097", name: "QUEJO GRANA PADANO DOP GIOVANNI FERRARI 10M KG", why: "Made by Giovanni Ferrari; it was in the own-brand row at 30,99 EUR/kg against the own Grana Padano of Continente (15,95) and Pingo Doce (17,72)." },
  { store: "AUCHAN", storeProductId: "3868950", name: "PATO QTª DA MARINHA CONGELADO KG", why: "A Quinta da Marinha duck, not Auchan's own." },
];

const KEYS = new Set(NOT_OWN_BRAND.map((p) => `${p.store}|${p.storeProductId}`));

/** Whether a product with an empty brand is listed above as someone else's. */
export function isListedNotOwnBrand(store: string, storeProductId: string): boolean {
  return KEYS.has(`${store}|${storeProductId}`);
}
