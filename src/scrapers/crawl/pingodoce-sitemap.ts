import { fetchHtml } from "../http";
import { sectionOf } from "../../lib/store-sections";
import { SectionTally } from "./section-watch";
import { productIdFromUrl } from "./product-id";
import { productSitemapsFromIndex } from "./sitemap-index";

/**
 * Discovery for the COMPLIANT Pingo Doce crawler: product URLs from the sitemap
 * its robots.txt advertises.
 *
 * WHY THIS EXISTS. The first Pingo Doce crawler walked
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

/** The index robots.txt names; it lists every sitemap file. */
export const SITEMAP_INDEX = "https://www.pingodoce.pt/home/sitemap_index.xml";

/**
 * The two product files the index listed when this was written. Used only
 * when the index cannot be read or lists no product file, and the report then
 * says so. Until 22 October 2026 these were the only files ever read, so a
 * third would have been missed in silence (code review M3).
 */
const KNOWN_PRODUCT_SITEMAPS = [
  "https://www.pingodoce.pt/home/sitemap_0-product.xml",
  "https://www.pingodoce.pt/home/sitemap_1-product.xml",
];

// Which files of the index hold products: shared with Auchan (sitemap-index.ts).
export { productSitemapsFromIndex };

/**
 * The product files to read tonight, from the index, or the known two with
 * the reason when the index fails us. A failed index does not stop the run:
 * the files themselves are still read, and missing one is what the per-file
 * counts and the trust rule are there to notice.
 */
async function productSitemaps(): Promise<{ files: string[]; indexProblem: string | null }> {
  try {
    const files = productSitemapsFromIndex(await fetchHtml(SITEMAP_INDEX));
    if (files.length > 0) return { files, indexProblem: null };
    return { files: KNOWN_PRODUCT_SITEMAPS, indexProblem: "the sitemap index listed no product file; read the two known ones" };
  } catch (error) {
    const reason = (error as Error).message.slice(0, 100);
    return { files: KNOWN_PRODUCT_SITEMAPS, indexProblem: `the sitemap index could not be read (${reason}); read the two known files` };
  }
}


/**
 * Every top-level section Pingo Doce publishes, by URL slug, with its display
 * label. Whether each holds food is decided in data/store-sections.ts, by
 * label.
 *
 * The labels matter, and are not cosmetic: they are what the rest of the
 * pipeline stores as the first segment of `categoryPath`, and a title-cased
 * slug cannot restore the accents a slug threw away ("Bebe E Crianca" for
 * "Bebé e Criança"), so they are written out by hand here.
 *
 * A note on the MIXED aisles - promotions, Christmas, Easter, the own-brand
 * showcase. They were once skipped wholesale because "every page sampled
 * published 0,00 EUR". That came from six pages sampled at the end of August,
 * when Christmas and Easter stock is out of season - a seasonal state mistaken
 * for a permanent property, and a SECTION-level decision made from a
 * PRODUCT-level observation. They are fetched like food departments, and what
 * a product IS gets decided from its name.
 */
export const PINGO_DOCE_SECTIONS: Record<string, { label: string }> = {
  "frutas-e-vegetais": { label: "Frutas e Vegetais" },
  talho: { label: "Talho" },
  peixaria: { label: "Peixaria" },
  "padaria-e-pastelaria": { label: "Padaria e Pastelaria" },
  "charcutaria-e-queijos": { label: "Charcutaria e Queijos" },
  ovos: { label: "Ovos" },
  "manteiga-margarina-e-natas": { label: "Manteiga, Margarina e Natas" },
  "iogurtes-e-sobremesas": { label: "Iogurtes e Sobremesas" },
  "leite-e-bebidas-vegetais": { label: "Leite e Bebidas Vegetais" },
  congelados: { label: "Congelados" },
  "cafe-cha-e-achocolatados": { label: "Café, Chá e Achocolatados" },
  "bolachas-cereais-e-guloseimas": { label: "Bolachas, Cereais e Guloseimas" },
  mercearia: { label: "Mercearia" },
  "aguas-sumos-e-refrigerantes": { label: "Águas, Sumos e Refrigerantes" },
  "cervejas-e-sidras": { label: "Cervejas e Sidras" },
  espirituosas: { label: "Espirituosas" },
  vinhos: { label: "Vinhos" },
  "take-away": { label: "Take Away" },
  "alternativas-alimentares": { label: "Alternativas Alimentares" },
  limpeza: { label: "Limpeza" },
  "higiene-pessoal-e-beleza": { label: "Higiene Pessoal e Beleza" },
  "casa-e-eletrodomesticos": { label: "Casa e Eletrodomésticos" },
  "livraria-e-papelaria": { label: "Livraria e Papelaria" },
  parafarmacia: { label: "Parafarmácia" },
  animais: { label: "Animais" },
  "bebe-e-crianca": { label: "Bebé e Criança" },
  promocoes: { label: "Promoções" },
  "as-nossas-marcas": { label: "As Nossas Marcas" },
  "natal-e-ano-novo": { label: "Natal e Ano Novo" },
  pascoa: { label: "Páscoa" },
  "santos-populares": { label: "Santos Populares" },
  "feira-do-bebe": { label: "Feira do Bebé" },
  "pingo-doce-master-catalog": { label: "Master Catalog" },
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

// The product id a Pingo Doce URL ends with (`...-893466.html` gives
// `893466`), read by the same function as Continente's (product-id.ts).
export { productIdFromUrl };

/**
 * A readable product name from the URL alone, for examples in a report:
 * ".../alho-frances-embalado-893466.html" gives "alho frances embalado". The
 * page has the real name; this costs no request.
 */
export function nameFromUrl(url: string): string | null {
  const slug = url.match(/\/([^/]+)-[^-/]+\.html$/)?.[1];
  if (!slug) return null;
  try {
    return decodeURIComponent(slug).replace(/-/g, " ");
  } catch {
    return slug.replace(/-/g, " ");
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
  /** counted, never fetched - the URL settles these */
  nonFood: number;
  /** of `food`, how many came from a mixed aisle rather than a food department */
  fromMixed: number;
  /** in a food or mixed section, but under a sub-section data/store-sections.ts skips */
  skipped: number;
  /** every section the sitemap shows, for section-watch.ts */
  sections: SectionTally;
  /** ids in non-food sections or skipped sub-sections, so held ones can stop being tracked */
  excludedIds: string[];
  /**
   * Every product id the sitemap lists, in any section. A product we hold that
   * is not here has left the store's own list - the only sign Pingo Doce gives,
   * since a product it stops selling is simply never fetched again.
   */
  allIds: Set<string>;
  /**
   * Top sections data/store-sections.ts does not decide. Should be zero. A new
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
  /** why the index was not used tonight, or null when it was */
  indexProblem: string | null;
  /** each product's sitemap date, when the sitemap gives one (sitemap-dates.ts) */
  lastmod: Map<string, number>;
}

const UNPARSEABLE_SAMPLES = 5;

/**
 * Every product URL Pingo Doce publishes, partitioned by what its section is
 * worth fetching for. One request for the index and one per product file:
 * three today.
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
  const sections = new SectionTally("PINGO_DOCE");
  let nonFood = 0;
  let fromMixed = 0;
  let skipped = 0;
  const excludedIds: string[] = [];
  let unparseable = 0;
  const lastmod = new Map<string, number>();

  const { files, indexProblem } = await productSitemaps();
  for (const sitemap of files) {
    const xml = await fetchHtml(sitemap);
    let entries = 0;

    // Each <loc>, and the <lastmod> beside it when there is one (the
    // sitemap-date test, sitemap-dates.ts).
    for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]*)<\/lastmod>)?/g)) {
      const url = match[1];
      const when = match[2] ? Date.parse(match[2]) : NaN;
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
      if (Number.isFinite(when)) lastmod.set(storeProductId, when);

      const section = pathSegments(url)[0] ?? "";
      if (section === "") {
        unfiled.push(url);
        continue;
      }
      const categoryPath = categoryPathFromUrl(url) ?? section;
      sections.add(categoryPath, nameFromUrl(url));
      const verdict = sectionOf("PINGO_DOCE", categoryPath);
      if (verdict.kind === "unknown") {
        unknownSections.set(section, (unknownSections.get(section) ?? 0) + 1);
        continue;
      }
      if (verdict.kind === "non-food") {
        nonFood++;
        excludedIds.push(storeProductId);
        continue;
      }
      if (verdict.skip) {
        skipped++;
        excludedIds.push(storeProductId);
        continue;
      }
      // A mixed aisle is fetched exactly like a food department. What the
      // product IS gets decided after the fetch, from its name.
      if (verdict.kind === "mixed") fromMixed++;
      food.push({ storeProductId, url, section, categoryPath });
    }

    perFile.push({ url: sitemap, entries });
  }

  return {
    food, nonFood, fromMixed, skipped, sections, excludedIds, allIds: seen, unknownSections, unfiled, unparseable, unparseableSamples, perFile,
    indexProblem,
    lastmod,
  };
}
