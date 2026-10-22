import { CATEGORIES, LABELS, LATER_CATEGORIES, SUB_KINDS, type Category } from "../../data/food-tree";
import { FOOD_TYPES } from "../../data/food-types";
import { stripAccents } from "./matching";

/**
 * Reading data/food-tree.ts: the category of a kind, and the sub-kind and
 * labels of a product. Pure and I/O-free, like food-types.ts, so every rule is
 * tested without a database.
 */

const CATEGORY_OF = new Map<string, Category>();
for (const c of CATEGORIES) for (const k of c.kinds) CATEGORY_OF.set(k, c);

/** The category a kind of food belongs to, or null for a kind set aside or unknown. */
export function categoryOf(kind: string): Category | null {
  return CATEGORY_OF.get(kind) ?? null;
}

/** A category by its id ("laticinios"), or null for an id the tree does not have. */
export function categoryById(id: string): Category | null {
  return CATEGORIES.find((c) => c.id === id) ?? null;
}

/** Where a set-aside kind will go when it comes back ("Doces e sobremesas", "Bebidas"). */
export function laterCategoryOf(kind: string): string | null {
  const hidden = FOOD_TYPES.find((t) => t.id === kind)?.hidden;
  return hidden ? LATER_CATEGORIES[hidden] : null;
}

const plain = (name: string) => stripAccents(name).toLowerCase();

/**
 * The sub-kind (cut or variety) of a product whose kind is known: the first
 * rule of that kind that matches the name. Null when the kind has no sub-kinds
 * or the name matches none of them - unknown is honest.
 */
export function subKindOf(kind: string, name: string): string | null {
  const rules = SUB_KINDS[kind];
  if (!rules) return null;
  const n = plain(name);
  return rules.find((r) => r.match.test(n))?.id ?? null;
}

/**
 * Every label that applies to a product of this kind, in the order LABELS lists
 * them, each once (a label can have more than one rule).
 */
export function labelsOf(kind: string, name: string, categoryPath: string | null = null): string[] {
  const n = plain(name);
  const shelf = plain(categoryPath ?? "");
  const category = categoryOf(kind)?.id;
  const ids = LABELS.filter(
    (l) =>
      (!l.categories || (category !== undefined && l.categories.includes(category))) &&
      (!l.kinds || l.kinds.includes(kind)) &&
      !(l.unless && l.unless.test(n)) &&
      !l.notKinds?.includes(kind) &&
      (l.match.test(n) || (l.shelf !== undefined && shelf !== "" && l.shelf.test(shelf)))
  ).map((l) => l.id);
  return [...new Set(ids)];
}

/** A label's name as the site shows it ("Congelado"). */
export function labelName(id: string): string {
  return LABELS.find((l) => l.id === id)?.label ?? id;
}

/**
 * Problems with the tree itself: a kind on the site with no category, a kind
 * in two categories, a category naming a kind that does not exist, sub-kinds
 * for an unknown kind, two sub-kinds of one kind sharing an id. Empty when the
 * tree is sound; the automatic checks require it to be.
 */
export function treeProblems(): string[] {
  const problems: string[] = [];
  const known = new Set(FOOD_TYPES.map((t) => t.id));
  const seen = new Map<string, string>();
  for (const c of CATEGORIES) {
    for (const k of c.kinds) {
      if (!known.has(k)) problems.push(`${c.id} lists ${k}, which is not a kind of food`);
      if (seen.has(k)) problems.push(`${k} is in both ${seen.get(k)} and ${c.id}`);
      seen.set(k, c.id);
    }
  }
  for (const t of FOOD_TYPES) {
    if (!t.hidden && !seen.has(t.id)) problems.push(`${t.id} is shown on the site but has no category`);
    if (t.hidden && seen.has(t.id)) problems.push(`${t.id} is set aside but has a category`);
  }
  for (const [kind, rules] of Object.entries(SUB_KINDS)) {
    if (!known.has(kind)) problems.push(`sub-kinds given for ${kind}, which is not a kind of food`);
    const ids = rules.map((r) => r.id);
    if (new Set(ids).size !== ids.length) problems.push(`${kind} has two sub-kinds with the same id`);
  }
  return problems;
}
