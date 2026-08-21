import { fetchHtml } from "../http";
import type { CrawlCategory } from "./types";

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
 * the "no pencils or pans" requirement is met.
 *
 * "Bio e Saudável" (cgid `biologicos`) overlaps the other five - it is organic
 * versions of items already in them. It is included, but ordered LAST so the
 * crawler's cross-run dedup attributes a dual-listed product to its main
 * section and Bio contributes only the organic-only items.
 *
 * `label` is for humans reading crawl output only. Mapping a store category
 * onto the app's own taxonomy is a separate, later step - not done here.
 */
export const CONTINENTE_FOOD_CATEGORIES: CrawlCategory[] = [
  { cgid: "frescos", label: "Frescos", approxCount: 4125 },
  { cgid: "laticinios", label: "Laticínios e Ovos", approxCount: 1205 },
  { cgid: "congelados", label: "Congelados", approxCount: 1106 },
  { cgid: "mercearias", label: "Mercearia", approxCount: 5469 },
  { cgid: "bebidas", label: "Bebidas e Garrafeira", approxCount: 7023 },
  { cgid: "biologicos", label: "Bio e Saudável", approxCount: 1842 },
];

/**
 * Each food section's landing-page slug, which is NOT its cgid (`mercearia`
 * against `mercearias`, `laticinios-e-ovos` against `laticinios`).
 *
 * Landing pages are allowed by robots.txt and publish `data-total-count`, so
 * the compliant crawler can still check its catalogue against the store's own
 * numbers - six requests - even though it never touches a listing grid.
 */
export const CONTINENTE_SECTION_SLUGS: ReadonlyMap<string, string> = new Map([
  ["Frescos", "frescos"],
  ["Laticínios e Ovos", "laticinios-e-ovos"],
  ["Congelados", "congelados"],
  ["Mercearia", "mercearia"],
  ["Bebidas e Garrafeira", "bebidas-e-garrafeira"],
  ["Bio e Saudável", "bio-e-saudavel"],
]);

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

/**
 * Continente publishes its whole category tree on the homepage, as JSON in a
 * `window.rootCategoryObj` script - id, display name, product count, and nested
 * sub-categories.
 *
 * Reading it each run is what stops the configured list above going quietly
 * stale. A renamed or deleted id already fails loudly (the grid endpoint
 * answers 500 and the crawl throws), but a NEW food department is invisible:
 * we would simply never ask for it, and the run would report success while
 * missing an entire section.
 */
export interface DiscoveredCategory {
  cgid: string;
  label: string;
  /** how many products Continente says the category holds */
  hitCount: number;
}

/** Extract the top-level categories from the homepage's category tree. */
export function parseCategoryTree(html: string): DiscoveredCategory[] {
  const at = html.indexOf("window.rootCategoryObj");
  if (at === -1) return [];

  const start = html.indexOf("{", at);
  if (start === -1) return [];

  const end = findClosingBrace(html, start);
  if (end === -1) return [];

  let tree: { subCategories?: DiscoveredCategory[] };
  try {
    tree = JSON.parse(html.slice(start, end + 1));
  } catch {
    return [];
  }

  return (tree.subCategories ?? []).map((c) => ({
    cgid: c.cgid ?? (c as unknown as { id: string }).id,
    label: c.label ?? (c as unknown as { name: string }).name,
    hitCount: c.hitCount ?? 0,
  }));
}

/** Index of the `}` closing the object opening at `start`, ignoring braces in strings. */
function findClosingBrace(text: string, start: number): number {
  const BACKSLASH = 92;
  const QUOTE = 34;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (escaped) {
      escaped = false;
      continue;
    }
    if (code === BACKSLASH) {
      escaped = true;
      continue;
    }
    if (code === QUOTE) {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return i;
  }
  return -1;
}

/**
 * Top-level categories we deliberately do not crawl. Listed explicitly so that
 * anything Continente publishes which is neither crawled nor named here is
 * reported as UNKNOWN and gets a human decision - that is the whole point. A
 * silent default of "not in the config means skip it" is exactly how a new food
 * department would be missed.
 *
 * `marcas` is a brand directory and `campanhas-novidades` a promotional shelf:
 * both re-list products the food sections already carry.
 */
export const CONTINENTE_NON_FOOD_CATEGORIES = new Set([
  "campanhas-novidades",
  "limpeza",
  "bebe", // baby food lives here; see the baby-food to-do before enabling
  "higiene-beleza",
  "animais",
  "casa",
  "brinquedos",
  "livros",
  "papelaria-material",
  "desporto-ar-livre",
  "col-entregazero",
  "marcas",
]);

export interface CategoryAudit {
  /** published categories that are neither crawled nor a known skip */
  unknown: DiscoveredCategory[];
  /** configured ids Continente no longer publishes */
  missing: string[];
}

/**
 * Compare what Continente publishes against what we crawl. A renamed or deleted
 * category already fails loudly at fetch time (its grid answers HTTP 500); this
 * catches the opposite and quieter case, a category appearing that nobody told
 * us about.
 */
export function auditCategories(discovered: DiscoveredCategory[]): CategoryAudit {
  const configured = new Set(CONTINENTE_FOOD_CATEGORIES.map((c) => c.cgid));
  const published = new Set(discovered.map((c) => c.cgid));

  return {
    unknown: discovered.filter(
      (c) => !configured.has(c.cgid) && !CONTINENTE_NON_FOOD_CATEGORIES.has(c.cgid)
    ),
    missing: [...configured].filter((cgid) => !published.has(cgid)),
  };
}

/** Fetch the homepage and read the published category tree. One request. */
export async function discoverCategories(): Promise<DiscoveredCategory[]> {
  return parseCategoryTree(await fetchHtml("https://www.continente.pt/"));
}

/**
 * Continente's category sitemap: 1,974 category URLs, every depth, with a
 * `lastmod` on each. Its `robots.txt` points at it, so reading it is invited.
 *
 * A SECOND source for the audit, not a replacement. The homepage tree is
 * better - it carries the cgids we actually crawl by, and each category's
 * product count - where the sitemap carries neither. What the sitemap adds:
 *
 *   - it survives a homepage markup change, which would otherwise leave the
 *     audit silently auditing nothing
 *   - it covers sub-categories too, so a new branch below the top level is
 *     visible rather than hidden inside a department we already crawl
 *   - it is 361 KB against the homepage's 2 MB
 *
 * It speaks in URL slugs rather than cgids, and the two do not match
 * (`mercearia` against `mercearias`, `laticinios-e-ovos` against `laticinios`),
 * so the correspondence is kept below as data. Guessing at it - prefix matching,
 * fuzzy comparison - would be a silent failure waiting to happen, and the point
 * of this check is to catch silent failures.
 */
const CATEGORY_SITEMAP = "https://www.continente.pt/sitemap-custom_sitemap_23-category.xml";

/**
 * Every top-level slug we recognise, and why. Anything published that is not
 * here is reported, exactly as with the cgid audit.
 */
export const CONTINENTE_KNOWN_SLUGS: ReadonlyMap<string, string> = new Map([
  // the six we crawl
  ["frescos", "crawled"],
  ["laticinios-e-ovos", "crawled"],
  ["congelados", "crawled"],
  ["mercearia", "crawled"],
  ["bebidas-e-garrafeira", "crawled"],
  ["bio-e-saudavel", "crawled"],
  // non-food, deliberately skipped
  ["limpeza", "non-food"],
  ["bebe", "non-food, holds baby food - see the baby-food note"],
  ["beleza-e-higiene", "non-food"],
  ["animais", "non-food"],
  ["casa-e-jardim", "non-food"],
  ["brinquedos-e-jogos", "non-food"],
  ["livros", "non-food"],
  ["papelaria", "non-food"],
  ["desporto-e-viagem", "non-food"],
  ["negocios", "non-food, business supplies"],
  // cross-cutting or seasonal shelves: they re-list products the food sections
  // already carry, so crawling them would add duplicates rather than products
  ["marcas", "own-brand shelf, re-lists food we already crawl"],
  ["novidades", "promotional shelf"],
  ["oportunidades", "promotional shelf"],
  ["verao", "seasonal shelf"],
  ["black-friday", "seasonal shelf"],
  ["cyber-monday", "seasonal shelf"],
  ["singles-day", "seasonal shelf"],
]);

/**
 * The six food sections as the PRODUCTS spell them, which is not how the cgids
 * spell them (`Laticínios e Ovos` against `laticinios`, `Mercearia` against
 * `mercearias`). The product-page crawler has only the product's own category
 * path to judge by, so it needs these rather than the ids.
 */
export const CONTINENTE_FOOD_SECTIONS: ReadonlySet<string> = new Set([
  "Frescos",
  "Laticínios e Ovos",
  "Congelados",
  "Mercearia",
  "Bebidas e Garrafeira",
  "Bio e Saudável",
]);

/** Top-level slugs published in the category sitemap. */
export function parseCategorySlugs(xml: string): string[] {
  const slugs = new Set<string>();
  for (const match of xml.matchAll(/<loc>https:\/\/www\.continente\.pt\/([^<]+)<\/loc>/g)) {
    const path = match[1].replace(/\/$/, "");
    if (path && !path.includes("/")) slugs.add(path);
  }
  return [...slugs];
}

export async function discoverCategorySlugs(): Promise<string[]> {
  return parseCategorySlugs(await fetchHtml(CATEGORY_SITEMAP));
}

/** Published slugs we do not recognise - the same question the cgid audit asks. */
export function auditCategorySlugs(slugs: string[]): string[] {
  return slugs.filter((s) => !CONTINENTE_KNOWN_SLUGS.has(s));
}
