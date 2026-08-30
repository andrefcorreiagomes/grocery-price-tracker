import { fetchHtml } from "../http";

/**
 * Discovery for the COMPLIANT Pingo Doce crawler: product URLs from the sitemap
 * its robots.txt advertises.
 *
 * WHY THIS EXISTS. The grid crawler in `pingodoce.ts` walks
 * `/on/demandware.store/.../Search-Show?cgid=&start=&sz=`, and Pingo Doce's
 * robots.txt disallows every part of that - four separate rules:
 *
 *     Disallow: /on/demandware.store/
 *     Disallow: /*?cgid=*
 *     Disallow: /*?start=*
 *     Disallow: /*?sz=*
 *
 * It also names its sitemap, which is an invitation. So this route reads the
 * sitemap and then each product's own page, neither of which robots.txt
 * forbids - the same trade Continente forced, for the same reason.
 *
 * The bonus is that Pingo Doce's product URLs carry their department:
 *
 *     /home/produtos/frutas-e-vegetais/vegetais/outros-vegetais/alho-...-893466.html
 *      section ^^^^^^^^^^^^^^^^^^^^^^                            id ^^^^^^
 *
 * so non-food can be dropped BEFORE it costs a request. Measured, that is 5,827
 * of 14,900 pages - about 1.6 hours of fetching that never has to happen.
 * Continente cannot do this; its URLs are flat and its section is only knowable
 * from the page.
 */

/** The two files the sitemap index lists as products. */
const PRODUCT_SITEMAPS = [
  "https://www.pingodoce.pt/home/sitemap_0-product.xml",
  "https://www.pingodoce.pt/home/sitemap_1-product.xml",
];

/**
 * `sitemap_2.xml` is listed by the index alongside those two, and is NOT a
 * product sitemap: its 543 entries are category LISTING pages
 * (`/produtos/limpeza/roupa/detergentes`, no `.html`, no id). Filtering the
 * index on the string "produtos" sweeps them in and they then look like 543
 * products with unparseable ids. Named here so the next reader does not
 * rediscover it.
 */
export const NON_PRODUCT_SITEMAP = "https://www.pingodoce.pt/home/sitemap_2.xml";

export type SectionKind =
  /** a food department; crawl it */
  | "food"
  /** pencils, shampoo, dog food; skip without fetching */
  | "non-food"
  /**
   * A cross-cutting or seasonal aisle - promotions, Christmas, the own-brand
   * showcase. Skipped, and the reason is specific rather than a guess: their
   * 1,014 ids appear nowhere else in the sitemap, and every page sampled across
   * the whole range published `0,00 EUR`. They are catalogue entries with no
   * sellable price, so they cannot enter a price comparison. Counted and
   * reported rather than dropped in silence, because a day when they start
   * carrying prices is a day we want to hear about.
   */
  | "unpriced";

interface Section {
  label: string;
  kind: SectionKind;
}

/**
 * Every top-level section Pingo Doce publishes, with the display label the rest
 * of the pipeline expects.
 *
 * The labels matter, and are not cosmetic: `isFoodSection` in
 * `src/lib/food-types.ts` compares the FIRST segment of `categoryPath` against
 * `NON_FOOD_SECTIONS` by exact (case-insensitive) text, accents included. A
 * title-cased slug would give "Bebe E Crianca" and quietly stop matching
 * "Bebé e Criança", so the accented labels are written out by hand here.
 */
export const PINGO_DOCE_SECTIONS: Record<string, Section> = {
  "frutas-e-vegetais": { label: "Frutas e Vegetais", kind: "food" },
  talho: { label: "Talho", kind: "food" },
  peixaria: { label: "Peixaria", kind: "food" },
  "padaria-e-pastelaria": { label: "Padaria e Pastelaria", kind: "food" },
  "charcutaria-e-queijos": { label: "Charcutaria e Queijos", kind: "food" },
  ovos: { label: "Ovos", kind: "food" },
  "manteiga-margarina-e-natas": { label: "Manteiga, Margarina e Natas", kind: "food" },
  "iogurtes-e-sobremesas": { label: "Iogurtes e Sobremesas", kind: "food" },
  "leite-e-bebidas-vegetais": { label: "Leite e Bebidas Vegetais", kind: "food" },
  congelados: { label: "Congelados", kind: "food" },
  "cafe-cha-e-achocolatados": { label: "Café, Chá e Achocolatados", kind: "food" },
  "bolachas-cereais-e-guloseimas": { label: "Bolachas, Cereais e Guloseimas", kind: "food" },
  mercearia: { label: "Mercearia", kind: "food" },
  "aguas-sumos-e-refrigerantes": { label: "Águas, Sumos e Refrigerantes", kind: "food" },
  "cervejas-e-sidras": { label: "Cervejas e Sidras", kind: "food" },
  espirituosas: { label: "Espirituosas", kind: "food" },
  vinhos: { label: "Vinhos", kind: "food" },
  "take-away": { label: "Take Away", kind: "food" },
  "alternativas-alimentares": { label: "Alternativas Alimentares", kind: "food" },

  limpeza: { label: "Limpeza", kind: "non-food" },
  "higiene-pessoal-e-beleza": { label: "Higiene Pessoal e Beleza", kind: "non-food" },
  "casa-e-eletrodomesticos": { label: "Casa e Eletrodomésticos", kind: "non-food" },
  "livraria-e-papelaria": { label: "Livraria e Papelaria", kind: "non-food" },
  parafarmacia: { label: "Parafarmácia", kind: "non-food" },
  animais: { label: "Animais", kind: "non-food" },
  // Mixed food and nappies, exactly as Auchan's o-mundo-do-bebé is excluded.
  // Baby food is tracked as its own piece of work.
  "bebe-e-crianca": { label: "Bebé e Criança", kind: "non-food" },

  promocoes: { label: "Promoções", kind: "unpriced" },
  "as-nossas-marcas": { label: "As Nossas Marcas", kind: "unpriced" },
  "natal-e-ano-novo": { label: "Natal e Ano Novo", kind: "unpriced" },
  pascoa: { label: "Páscoa", kind: "unpriced" },
  "santos-populares": { label: "Santos Populares", kind: "unpriced" },
  "feira-do-bebe": { label: "Feira do Bebé", kind: "unpriced" },
  "pingo-doce-master-catalog": { label: "Master Catalog", kind: "unpriced" },
};

/** Words a Portuguese label keeps lowercase when title-casing a URL slug. */
const MINOR_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "com", "sem", "em", "a", "o", "as", "os"]);

/**
 * A sub-category slug turned back into something readable:
 * `tomates-pepinos-e-pimentos` gives "Tomates Pepinos e Pimentos".
 *
 * Only ever applied BELOW the top level. Top-level labels come from the table
 * above, because those are the ones matched by exact text elsewhere and this
 * cannot restore the accents a slug threw away.
 */
export function labelFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((word, i) =>
      i > 0 && MINOR_WORDS.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)
    )
    .join(" ");
}

export interface PingoDoceProductUrl {
  storeProductId: string;
  url: string;
  /** the URL's top-level slug, e.g. "frutas-e-vegetais" */
  section: string;
  /** display path, e.g. "Frutas e Vegetais/Vegetais/Outros Vegetais" */
  categoryPath: string;
}

/**
 * The product id a Pingo Doce URL ends with: `...-893466.html` gives `893466`.
 * Confirmed against the page's own `sku`, and it is the same id the listing
 * tiles report, so rows from the two routes land on the same
 * `(store, storeProductId)`.
 */
export function productIdFromUrl(url: string): string | null {
  const tail = url.match(/-([^-/]+)\.html$/)?.[1];
  if (!tail) return null;
  try {
    return decodeURIComponent(tail);
  } catch {
    return tail;
  }
}

/** The `/home/produtos/...` path segments of a product URL, minus the filename. */
function pathSegments(url: string): string[] {
  const path = url.match(/\/home\/produtos\/(.+)\.html$/)?.[1];
  if (!path) return [];
  const parts = path.split("/");
  parts.pop(); // the product slug itself
  return parts.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
}

/**
 * The category path for a product URL, in the "Department/Sub/Leaf" shape the
 * rest of the pipeline reads.
 *
 * This is strictly better than what the product page offers. Pingo Doce's
 * breadcrumb renders the LEAF only - `["Produtos /", "Vinho Tinto", "Vinho
 * Tinto"]` - which is why 226 of the catalogue's stored paths are bare shelf
 * names with no department above them, and why the food/non-food filter had to
 * be a deny-list of shelf names rather than an allow-list of departments. The
 * URL carries the whole hierarchy.
 */
export function categoryPathFromUrl(url: string): string | null {
  const segments = pathSegments(url);
  if (segments.length === 0) return null;
  const top = PINGO_DOCE_SECTIONS[segments[0]];
  const head = top ? top.label : labelFromSlug(segments[0]);
  return [head, ...segments.slice(1).map(labelFromSlug)].join("/");
}

export interface PingoDoceSitemap {
  /** food-department products: the ones worth a request */
  food: PingoDoceProductUrl[];
  /** counted, never fetched */
  nonFood: number;
  unpriced: number;
  /**
   * Sections absent from `PINGO_DOCE_SECTIONS`. Should be zero. A new
   * department appearing here is a real event - it is products we would
   * otherwise never crawl - so it is surfaced rather than lumped in with
   * non-food. Continente lost 170 URLs for months to exactly this kind of
   * silent drop.
   */
  unknownSections: Map<string, number>;
  /**
   * Products filed at the catalogue root with no department at all
   * (`/home/produtos/<slug>.html`). Two of them at the time of writing, and
   * neither is a grocery: a novelty sweet, and "Valor Depósito Unidade", the
   * refundable bottle deposit.
   *
   * Counted on its own rather than reported as an unknown SECTION, because it
   * is a known steady state and a nightly warning that is always there is a
   * warning nobody reads. The count still surfaces, so if it grows the growth
   * is visible.
   */
  unfiled: string[];
  /** `<loc>` entries that yielded no product id */
  unparseable: number;
  unparseableSamples: string[];
  /** entries seen per sitemap file, in the order the index lists them */
  perFile: { url: string; entries: number }[];
}

const UNPARSEABLE_SAMPLES = 5;

/**
 * Every product URL Pingo Doce publishes, partitioned by what its section is
 * worth fetching for. Two requests.
 *
 * All the files or none: one that fails throws rather than returning a partial
 * set, because half a sitemap looks exactly like a shop that halved overnight,
 * and the caller would read the missing half as delisted.
 */
export async function discoverPingoDoceProducts(): Promise<PingoDoceSitemap> {
  const food: PingoDoceProductUrl[] = [];
  const unknownSections = new Map<string, number>();
  const unfiled: string[] = [];
  const unparseableSamples: string[] = [];
  const perFile: { url: string; entries: number }[] = [];
  const seen = new Set<string>();
  let nonFood = 0;
  let unpriced = 0;
  let unparseable = 0;

  for (const sitemap of PRODUCT_SITEMAPS) {
    const xml = await fetchHtml(sitemap);
    let entries = 0;

    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const url = match[1];
      if (!url.includes("/home/produtos/")) continue;
      entries++;

      const storeProductId = productIdFromUrl(url);
      if (!storeProductId) {
        unparseable++;
        if (unparseableSamples.length < UNPARSEABLE_SAMPLES) unparseableSamples.push(url);
        continue;
      }
      // The same id can be published under two paths; the first wins, exactly
      // as the grid crawler attributes a product to the first department that
      // listed it.
      if (seen.has(storeProductId)) continue;
      seen.add(storeProductId);

      const section = pathSegments(url)[0] ?? "";
      if (section === "") {
        unfiled.push(url);
        continue;
      }
      const known = PINGO_DOCE_SECTIONS[section];
      if (!known) {
        unknownSections.set(section, (unknownSections.get(section) ?? 0) + 1);
        continue;
      }
      if (known.kind === "non-food") {
        nonFood++;
      } else if (known.kind === "unpriced") {
        unpriced++;
      } else {
        food.push({
          storeProductId,
          url,
          section,
          categoryPath: categoryPathFromUrl(url) ?? known.label,
        });
      }
    }

    perFile.push({ url: sitemap, entries });
  }

  return { food, nonFood, unpriced, unknownSections, unfiled, unparseable, unparseableSamples, perFile };
}
