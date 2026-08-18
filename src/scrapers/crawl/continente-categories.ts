/**
 * Continente's food-section category ids, for the catalogue crawl.
 *
 * Each of these is a TOP-LEVEL `cgid` whose grid endpoint paginates through the
 * whole section (verified: `laticinios` served 140 distinct products across 4
 * pages, every page fresh). So five ids cover the entire food catalogue -
 * roughly 19,000 products - without enumerating sub-categories.
 *
 * These are the food branches, picked by hand once from the site navigation.
 * The non-food sections (Limpeza, Beleza e Higiene, Animais, Casa e Jardim,
 * Brinquedos, Livros, Papelaria, ...) are deliberately left out - that is how
 * the "no pencils or pans" requirement is met. "Bio e Saudável" is also left
 * out on purpose: it is organic/healthy versions of items already sitting in
 * these five sections, so including it would duplicate.
 *
 * `label` is for humans reading crawl output only. Mapping a store category
 * onto the app's own taxonomy is a separate, later step - not done here.
 */
export interface CrawlCategory {
  cgid: string;
  label: string;
  /** approximate product count when curated, for sanity-checking a crawl */
  approxCount: number;
}

export const CONTINENTE_FOOD_CATEGORIES: CrawlCategory[] = [
  { cgid: "frescos", label: "Frescos", approxCount: 4125 },
  { cgid: "laticinios", label: "Laticínios e Ovos", approxCount: 1205 },
  { cgid: "congelados", label: "Congelados", approxCount: 1106 },
  { cgid: "mercearias", label: "Mercearia", approxCount: 5469 },
  { cgid: "bebidas", label: "Bebidas e Garrafeira", approxCount: 7023 },
];
