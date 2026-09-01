import { prisma } from "./db";
import { FOOD_TYPES } from "../../data/food-types";
import {
  DEPARTMENT_TO_CATEGORY,
  MENU_CATEGORIES,
  UNPLACED,
  type MenuCategory,
} from "../../data/menu-categories";

/**
 * Filing each kind of food under a heading in the app's menu.
 *
 * 166 one-word decisions, so the tool PROPOSES an answer for each and asks only
 * to be corrected. The proposal comes from the store's own department, which is
 * right about most foods and predictably wrong about a few - see
 * `DEPARTMENT_TO_CATEGORY`.
 */

export interface FoodTypeRow {
  id: string;
  label: string;
  /** how many catalogue products carry this food type */
  productCount: number;
  /** the heading it is filed under - proposed or confirmed */
  category: MenuCategory;
  /** false while it is still only the proposal */
  confirmed: boolean;
  /** the Pingo Doce department the proposal came from, for the reader's context */
  department: string | null;
}

/** Whether a stored value is still one of the headings we offer. */
function asCategory(value: string): MenuCategory {
  return (MENU_CATEGORIES as readonly string[]).includes(value)
    ? (value as MenuCategory)
    : UNPLACED;
}

export async function getFoodTypeRows(): Promise<FoodTypeRow[]> {
  const [products, decided] = await Promise.all([
    prisma.catalogueProduct.findMany({
      where: { foodType: { not: null }, delistedAt: null },
      select: { foodType: true, store: true, categoryPath: true },
    }),
    prisma.foodTypeCategory.findMany(),
  ]);

  // The commonest Pingo Doce department per food type. Pingo Doce because its
  // departments name real counters; the other two publish a top level so broad
  // it cannot separate meat from cheese.
  const departments = new Map<string, Map<string, number>>();
  const counts = new Map<string, number>();
  for (const p of products) {
    const id = p.foodType as string;
    counts.set(id, (counts.get(id) ?? 0) + 1);
    if (p.store !== "PINGO_DOCE") continue;
    const top = (p.categoryPath ?? "").split("/")[0].trim();
    if (!top) continue;
    const tally = departments.get(id) ?? new Map<string, number>();
    tally.set(top, (tally.get(top) ?? 0) + 1);
    departments.set(id, tally);
  }

  const byId = new Map(decided.map((d) => [d.foodType, d]));

  return FOOD_TYPES.filter((t) => (counts.get(t.id) ?? 0) > 0)
    .map((t) => {
      const tally = departments.get(t.id);
      const department = tally
        ? [...tally].sort((a, b) => b[1] - a[1])[0][0]
        : null;
      const stored = byId.get(t.id);

      return {
        id: t.id,
        label: t.label,
        productCount: counts.get(t.id) ?? 0,
        category: stored
          ? asCategory(stored.category)
          : (department && DEPARTMENT_TO_CATEGORY[department]) || UNPLACED,
        confirmed: stored?.confirmed ?? false,
        department,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "pt"));
}

/**
 * Save one decision.
 *
 * Writing marks it CONFIRMED: a row in this table exists because a person put
 * it there, and the proposals are never written. That is what keeps "we
 * guessed" and "you decided" apart, and it is why the page can honestly report
 * how much is left to do.
 */
export async function setFoodTypeCategory(foodType: string, category: string): Promise<void> {
  if (!FOOD_TYPES.some((t) => t.id === foodType)) {
    throw new Error(`unknown food type: ${foodType}`);
  }
  if (!(MENU_CATEGORIES as readonly string[]).includes(category)) {
    throw new Error(`unknown category: ${category}`);
  }
  await prisma.foodTypeCategory.upsert({
    where: { foodType },
    update: { category, confirmed: true },
    create: { foodType, category, confirmed: true },
  });
}

/** Accept every proposal on the page as it stands, in one go. */
export async function confirmAll(rows: { id: string; category: string }[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    await setFoodTypeCategory(r.id, r.category);
    n++;
  }
  return n;
}
