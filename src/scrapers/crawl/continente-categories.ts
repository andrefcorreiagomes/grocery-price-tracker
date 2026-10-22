import { fetchHtml } from "../http";
import { STORE_SECTIONS, type SectionKind } from "../../../data/store-sections";
import { sectionKey } from "../../lib/store-sections";

/**
 * Each food section's landing page, by the section's name as the products
 * spell it - the name the report groups our catalogue by. The address is NOT
 * the cgid (`mercearia` against `mercearias`).
 *
 * Landing pages are allowed by robots.txt and publish `data-total-count`, so
 * the compliant crawler can still check its catalogue against the store's own
 * numbers - one request each - even though it never touches a listing grid.
 *
 * Continente's layout of 18 October 2026: every food section sits under
 * "supermercado/", "Frescos" is gone (its shelves are sections of their own)
 * and "Bio e Saudável" was split up. Only the food part of "Suplementos e
 * Nutrição" is counted, because only that part is in our catalogue.
 */
export const CONTINENTE_SECTION_SLUGS: ReadonlyMap<string, string> = new Map([
  ["Mercearia", "supermercado/mercearia"],
  ["Bebidas e Garrafeira", "supermercado/bebidas-e-garrafeira"],
  ["Laticínios e Ovos", "supermercado/laticinios-e-ovos"],
  ["Congelados", "supermercado/congelados"],
  ["Padaria e Pastelaria", "supermercado/padaria-e-pastelaria"],
  ["Peixaria", "supermercado/peixaria"],
  ["Talho", "supermercado/talho"],
  ["Frutas e Legumes", "supermercado/frutas-e-legumes"],
  ["Charcutaria e Queijos", "supermercado/charcutaria-e-queijos"],
  ["Refeições Práticas", "supermercado/refeicoes-praticas"],
  ["Suplementos e Nutrição", "supermercado/suplementos-e-nutricao/alimentacao-desportiva"],
]);

/**
 * A category address with Continente's "supermercado" level taken off the
 * front: "supermercado/mercearia/conservas" gives "mercearia/conservas", and
 * "supermercado" alone gives "". The same level the page reader drops
 * (parseCategoryPath in src/scrapers/continente.ts), so the section watch and
 * the products speak of the same sections.
 */
export function withoutSupermercado(path: string): string {
  return path.replace(/^supermercado(\/|$)/, "");
}

/** Read `data-total-count` off each food section's landing page. */
export async function fetchPublishedCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const [label, slug] of CONTINENTE_SECTION_SLUGS) {
    const html = await fetchHtml(`https://www.continente.pt/${slug}/`);
    const match = html.match(/data-total-count="(\d+)"/);
    if (match) counts.set(label, Number(match[1]));
  }
  return counts;
}

/** A category Continente publishes, as the retired category audit read it. */
export interface DiscoveredCategory {
  cgid: string;
  label: string;
  /** how many products Continente says the category holds */
  hitCount: number;
}

export interface CategoryAudit {
  /** published categories that are neither crawled nor a known skip */
  unknown: DiscoveredCategory[];
  /** configured ids Continente no longer publishes */
  missing: string[];
}

/**
 * Continente's category sitemap: about 2,000 category URLs, every depth, with
 * a `lastmod` on each. Its `robots.txt` points at it, so reading it is invited.
 * The nightly reads it for the section watch (discoverCategoryPaths), which
 * sees a new branch below the top level as well as a new department.
 *
 * (A second audit read the homepage's category tree by category id; it served
 * only the `crawl:continente` command, and both were removed on 22 October
 * 2026 - code review M10. The ids it checked had been out of date since
 * Continente's reorganisation of 18 October.)
 */
const CATEGORY_SITEMAP = "https://www.continente.pt/sitemap-custom_sitemap_23-category.xml";

/**
 * Every top-level section data/store-sections.ts decides, by slug. Anything
 * published that is not here is reported, exactly as with the cgid audit.
 *
 * The sitemap speaks in slugs and the products in labels, but the two agree
 * once accents and punctuation are set aside ("laticinios-e-ovos" and
 * "Laticínios e Ovos"), so one list in the decisions file serves both.
 */
export const CONTINENTE_KNOWN_SLUGS: ReadonlyMap<string, SectionKind> = new Map(
  Object.entries(STORE_SECTIONS.CONTINENTE.sections).map(([name, kind]) => [sectionKey(name), kind])
);

/**
 * The food sections as the PRODUCTS spell them, which is not how the cgids
 * spell them (`Laticínios e Ovos` against `laticinios`). Read from
 * data/store-sections.ts.
 */
export const CONTINENTE_FOOD_SECTIONS: ReadonlySet<string> = new Set(
  Object.entries(STORE_SECTIONS.CONTINENTE.sections)
    .filter(([, kind]) => kind === "food")
    .map(([name]) => name)
);

/** Top-level slugs published in the category sitemap. */
export function parseCategorySlugs(xml: string): string[] {
  const slugs = new Set<string>();
  for (const match of xml.matchAll(/<loc>https:\/\/www\.continente\.pt\/([^<]+)<\/loc>/g)) {
    const path = withoutSupermercado(match[1].replace(/\/$/, ""));
    if (path && !path.includes("/")) slugs.add(path);
  }
  return [...slugs];
}

/**
 * Every category path published in the category sitemap, at every depth:
 * "mercearia", "mercearia/suplementos-e-vitaminas", ... Query strings and the
 * site root are dropped.
 */
export function parseCategoryPaths(xml: string): string[] {
  const paths = new Set<string>();
  for (const match of xml.matchAll(/<loc>https:\/\/www\.continente\.pt\/([^<?#]+)/g)) {
    const path = withoutSupermercado(match[1].replace(/\/+$/, ""));
    if (path) paths.add(path);
  }
  return [...paths];
}

/** The category sitemap's paths. One request, about 361 KB. */
export async function discoverCategoryPaths(): Promise<string[]> {
  return parseCategoryPaths(await fetchHtml(CATEGORY_SITEMAP));
}

/** Published slugs we do not recognise - the same question the cgid audit asks. */
export function auditCategorySlugs(slugs: string[]): string[] {
  return slugs.filter((s) => !CONTINENTE_KNOWN_SLUGS.has(s));
}
