import { STORE_SECTIONS, type SectionKind } from "../../data/store-sections";
import { isStore } from "./stores";

/**
 * The top segment of a category path ("Talho/Porco" gives "Talho"), or
 * "(sem categoria)" when there is none. One helper since 22 October 2026
 * (code review L3); four files each had a copy.
 */
export function topSection(path: string | null | undefined): string {
  return (path ?? "").split("/")[0].trim() || "(sem categoria)";
}

/**
 * Reading data/store-sections.ts: what a product's section says about whether
 * it is food. Pure and I/O-free, so every rule is tested without a database.
 */

/**
 * A section name in a form that compares the way it reads: no accents, lower
 * case, every run of other characters a single hyphen. "Laticínios e Ovos",
 * "laticinios-e-ovos" and "LATICÍNIOS E OVOS" all give "laticinios-e-ovos".
 */
export function sectionKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A category path as a list of keys: "Mercearia/Conservas" gives ["mercearia", "conservas"]. */
export function pathKeys(categoryPath: string | null): string[] {
  return (categoryPath ?? "")
    .split(/[/>]/)
    .map(sectionKey)
    .filter((k) => k !== "");
}

interface Compiled {
  sections: Map<string, SectionKind>;
  skip: { keys: string[]; path: string; why: string }[];
}

const compiled = new Map<string, Compiled>();
function decisionsFor(store: string): Compiled | null {
  if (!isStore(store)) return null;
  let c = compiled.get(store);
  if (!c) {
    const d = STORE_SECTIONS[store];
    c = {
      sections: new Map(Object.entries(d.sections).map(([name, kind]) => [sectionKey(name), kind])),
      skip: d.skip.map((s) => ({ keys: pathKeys(s.path), path: s.path, why: s.why })),
    };
    compiled.set(store, c);
  }
  return c;
}

export type SectionVerdict =
  | { kind: SectionKind; skip: { path: string; why: string } | null }
  /** a top section the decisions file does not mention */
  | { kind: "unknown"; skip: null };

/** What data/store-sections.ts says about the section a product is filed under. */
export function sectionOf(store: string, categoryPath: string | null): SectionVerdict {
  const keys = pathKeys(categoryPath);
  const d = decisionsFor(store);
  const kind = keys.length > 0 && d ? d.sections.get(keys[0]) : undefined;
  if (kind === undefined || !d) return { kind: "unknown", skip: null };
  const rule = d.skip.find((s) => s.keys.every((k, i) => keys[i] === k));
  return { kind, skip: rule ? { path: rule.path, why: rule.why } : null };
}

/**
 * Could a product filed here be food? True for a food or mixed section outside
 * every skip path. In a mixed section that is only "could": the name decides,
 * in `keepInCatalogue`.
 */
export function isFoodSection(store: string, categoryPath: string | null): boolean {
  const v = sectionOf(store, categoryPath);
  return (v.kind === "food" || v.kind === "mixed") && v.skip === null;
}

/** The decision for a top section, by its key; undefined when the file does not mention it. */
export function topSectionKind(store: string, key: string): SectionKind | undefined {
  return decisionsFor(store)?.sections.get(sectionKey(key));
}
